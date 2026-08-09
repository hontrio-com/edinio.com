"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { clientFacturare, eSistem, type SistemClient } from "@/lib/invoicing-context";
import { logError } from "@/lib/error-logger";
import { verificaLegaturaDocumentului } from "@/lib/invoicing-legatura";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { invoiceParty } from "@/lib/billing/invoice-party";
import { cheieDocument, slotFacturare } from "@/lib/billing/refacturare";
import { invoiceVat } from "@/lib/billing/invoice-vat";
import { codSiNatura } from "@/lib/billing/invoice-lines";
import { fetchSkuMap, type SursaCoduri } from "@/lib/billing/sku-map";
import { liniiFgo, mesajRefuz, pretDeDocument, reconciliazaComanda } from "@/lib/billing/reconcile";

import { autoInvoiceTriggerMatches } from "@/lib/invoicing";
import {
  createFgoInvoice,
  stornoFgoInvoice,
  cancelFgoInvoice,
  printFgoInvoice,
  testFgoConnection,
  type FgoConfig,
  type FgoLineItem,
} from "@/lib/fgo";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type OrderItem = { name: string; price: number; quantity: number; product_id?: string };
type ShippingAddress = {
  county?: string;
  city?: string;
  address?: string;
  street?: string;
};

/** Vezi `getConfigAndOrder` din oblio.actions.ts pentru rolul lui `sistem`. */
async function getConfigAndOrder(businessId: string, orderId: string, sistem?: SistemClient) {
  const supabase = await clientFacturare(sistem);
  if (!eSistem(sistem)) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Neautorizat" as const };

    const { data: biz } = await supabase
      .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
    if (!biz) return { error: "Acces interzis" as const };
  }

  // `fgo_config` se citeste separat, cu SERVICE ROLE. Pe calea manuala
  // `clientFacturare` intoarce clientul utilizatorului, iar pentru `authenticated`
  // vederea store_settings nu mai decripteaza: `private_key` ar fi ajuns
  // `enc.v1.…`, adica hash-ul de autentificare fGO calculat pe o cheie gresita.
  // Cotele de TVA si comanda NU sunt secrete si raman pe clientul de mai sus.
  // Proprietarul e verificat mai sus (manual) sau e serverul insusi.
  const admin = createAdminClient();
  const [{ data: settings }, { data: secrete }, { data: order }] = await Promise.all([
    supabase.from("store_settings")
      .select("vat_enabled, vat_rate, prices_include_vat")
      .eq("business_id", businessId).single(),
    admin.from("store_settings").select("fgo_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = secrete?.fgo_config as FgoConfig | null;
  if (!config?.enabled || !config.cod_unic || !config.private_key || !config.serie) {
    return { error: "fGO nu este configurat complet" as const };
  }

  return {
    supabase,
    config,
    order,
    vatEnabled: settings?.vat_enabled ?? false,
    vatRate: settings?.vat_rate ?? 19,
    pricesIncludeVat: settings?.prices_include_vat ?? false,
  };
}

async function buildItems(
  sursa: SursaCoduri,
  order: {
    items: unknown;
    shipping_cost: unknown;
    discount_amount: unknown;
    discount_code: string | null;
    card_discount_amount?: unknown;
    cod_discount_amount?: unknown;
    cod_fee_amount?: unknown;
    total: unknown;
    subtotal: unknown;
    /** Cota INGHETATA la vanzare. Are prioritate fata de cea din setarile de azi. */
    vat_rate?: unknown;
    vat_amount?: unknown;
    order_number?: string | number;
    payment_status?: string | null;
  },
  vatEnabled: boolean,
  vatRate: number,
  pricesIncludeVat: boolean,
): Promise<FgoLineItem[] | { error: string }> {
  const items = (order.items as OrderItem[]) ?? [];
  const skus = await fetchSkuMap(sursa.supabase, sursa.businessId, items, (m) =>
    logError({ action: "billing.skuMap", message: m.message, details: { ...m.details, casa: "fgo" }, severity: "warning" }));
  // Cota si regimul vin din regula COMUNA celor trei case de facturare. Pana acum
  // fGO lua cota din setarile magazinului CITITE AZI si nu se uita niciodata la
  // `orders.vat_rate`: o comanda veche facturata dupa o schimbare de cota iesea cu
  // cota noua, adica pe alte cifre decat cele incasate de la client.
  const vat = invoiceVat(order, { vat_enabled: vatEnabled, vat_rate: vatRate, prices_include_vat: pricesIncludeVat });
  const effectiveVat = vat.rate;

  // fGO cere PretUnitar FARA TVA; daca sumele comenzii contin deja TVA, se extrage netul.
  // `pretDeDocument`: fGO taie oricum la doi bani la serializare (`fgo.ts`), dar
  // taiat aici, garda de reconciliere compara chiar numarul care pleaca.
  const toNet = (gross: number) =>
    pretDeDocument(vat.taxIncluded && vat.rate > 0 ? gross / (1 + vat.rate / 100) : gross);

  const lineItems: FgoLineItem[] = items.map(item => {
    // fGO n-are natura de linie in model (`FgoLineItem` nu are camp de tip, iar
    // `Tip` se pune doar la „Discount"), deci de aici se foloseste doar codul.
    const { code } = codSiNatura(item, skus);
    return {
      name: item.name,
      quantity: item.quantity,
      unitPrice: toNet(item.price),
      vatRate: effectiveVat,
      unit: "BUC",
      ...(code ? { code } : {}),
    };
  });

  const shippingCost = Number(order.shipping_cost);
  if (shippingCost > 0) {
    lineItems.push({
      name: "Transport",
      quantity: 1,
      unitPrice: toNet(shippingCost),
      vatRate: effectiveVat,
      unit: "BUC",
    });
  }

  // Reducerile = linii Tip "Discount" (mecanismul documentat fGO), cu valoarea
  // neta pozitiva; fGO le scade (baza + TVA) din total.
  const discountAmount = Number(order.discount_amount);
  if (discountAmount > 0) {
    lineItems.push({
      name: `Discount${order.discount_code ? ` (${order.discount_code})` : ""}`,
      quantity: 1,
      unitPrice: toNet(discountAmount),
      vatRate: effectiveVat,
      unit: "BUC",
      isDiscount: true,
    });
  }

  // Reducerea la plata online e deja scazuta din orders.total la plasare; fara
  // linia asta factura ar iesi mai mare decat totalul comenzii.
  const cardDiscount = Number(order.card_discount_amount);
  if (cardDiscount > 0) {
    lineItems.push({
      name: "Reducere plata online",
      quantity: 1,
      unitPrice: toNet(cardDiscount),
      vatRate: effectiveVat,
      unit: "BUC",
      isDiscount: true,
    });
  }
  // Reducerea la plata ramburs — aceeasi logica, linie de discount separata.
  const codDiscount = Number(order.cod_discount_amount);
  if (codDiscount > 0) {
    lineItems.push({
      name: "Reducere plata ramburs",
      quantity: 1,
      unitPrice: toNet(codDiscount),
      vatRate: effectiveVat,
      unit: "BUC",
      isDiscount: true,
    });
  }
  // Taxa de ramburs e adunata in total: articol obisnuit, nu discount.
  const codFee = Number(order.cod_fee_amount);
  if (codFee > 0) {
    lineItems.push({
      name: "Taxa plata ramburs",
      quantity: 1,
      unitPrice: toNet(codFee),
      vatRate: effectiveVat,
      unit: "BUC",
    });
  }

  /*
   * Suma liniilor trebuie sa dea chiar `orders.total`. La fGO preturile sunt NETE
   * si rotunjite pe unitate, deci la cantitati mari diferenta de rotunjire urca
   * legitim (0,24 lei la 50 de bucati): garda o modeleaza si o absoarbe, in loc
   * sa refuze o comanda buna. Vezi `reconcile.ts`.
   */
  // `liniiNete`: fGO cere pretul FARA TVA si il converteste chiar el mai sus, deci
  // liniile lui nu sunt in aceeasi unitate cu `orders.total`.
  const rec = reconciliazaComanda(liniiFgo(lineItems), order, vat, { liniiNete: true });
  if (rec.fel === "refuz") {
    return { error: mesajRefuz(rec, order.order_number ?? "", order.payment_status === "paid") };
  }
  /*
   * Restul de un ban care poate ramane pe BRUT, spus pe fata in loc sa fie tacut.
   *
   * fGO cere pret NET si reconstruieste el brutul inmultind inapoi. Reconstructia
   * pierde: netul se taie la doi bani INAINTE sa se aplice cota, deci vreo sasea
   * parte din totalurile brute nici nu se pot scrie pe o factura fGO — 100,00 lei
   * la 21% se desface in 82,64 + 17,35 = 99,99, si nu exista pret unitar care sa
   * dea 100,00. Nicio linie de ajustare nu ajuta: pasul ei, dus in brut, e de
   * 1,21 bani.
   *
   * Garda certifica baza NETA, deci pana acum diferenta asta pleca fara ca cineva
   * sa afle. Nu se poate repara — e o limita a formatului — dar se poate VEDEA,
   * si atunci comerciantul stie de ce factura difera de comanda cu un ban.
   */
  if (vat.taxIncluded && vat.rate > 0) {
    const net = lineItems.reduce((s, i) => s + pretDeDocument(Number(i.unitPrice) || 0) * (Number(i.quantity) || 0) * (i.isDiscount ? -1 : 1), 0);
    const brutReconstruit = Math.round(net * (1 + vat.rate / 100) * 100) / 100;
    const totalComanda = Math.round((Number(order.total) || 0) * 100) / 100;
    if (Math.abs(brutReconstruit - totalComanda) >= 0.01) {
      logError({
        action: "fgo.brutNereprezentabil",
        message: `Factura fGO va iesi pe ${brutReconstruit.toFixed(2)} in loc de ${totalComanda.toFixed(2)}`,
        details: { businessId: sursa.businessId, comanda: String(order.order_number ?? ""), diferenta: Math.round((brutReconstruit - totalComanda) * 100) / 100 },
        severity: "info",
      });
    }
  }

  if (rec.fel === "ajustare") {
    lineItems.push({
      name: "Ajustare rotunjire",
      quantity: 1,
      unitPrice: Math.abs(rec.delta),
      vatRate: effectiveVat,
      unit: "BUC",
      // fGO n-are linii cu valoare negativa: o ajustare in minus e „Discount".
      ...(rec.delta < 0 ? { isDiscount: true as const } : {}),
    });
  }

  return lineItems;
}

// ─── Config actions ───────────────────────────────────────────────────────────

export async function saveFgoConfig(
  businessId: string,
  config: FgoConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  const { data: vechi } = await supabase
    .from("store_settings").select("fgo_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("fgo_config", config, vechi?.fgo_config);

  const { error } = await supabase.from("store_settings").update({
    fgo_config: configFinal as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectFgo(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    fgo_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function testFgoConfig(
  config: FgoConfig,
): Promise<{ ok: true; judete: number } | { error: string }> {
  const result = await testFgoConnection(config);
  if (!result.ok) return { error: result.error };
  return { ok: true, judete: result.judete };
}

// ─── Document actions ─────────────────────────────────────────────────────────

/**
 * Auto-invoicing entry point (called by the central dispatcher). Returns true only
 * if it actually issued an invoice this call, so the dispatcher can stop and avoid
 * a second provider issuing for the same order. Never throws.
 */
export async function maybeAutoGenerateInvoice(
  businessId: string,
  orderId: string,
  newStatus: string,
  newPaymentStatus: string,
  sistem?: SistemClient,
): Promise<boolean> {
  try {
    const supabase = await clientFacturare(sistem);
    const { data: settings } = await supabase
      .from("store_settings").select("fgo_config").eq("business_id", businessId).single();
    const config = settings?.fgo_config as FgoConfig | null;
    if (!config?.enabled || !config.auto_invoice) return false;
    if (!autoInvoiceTriggerMatches(config.auto_invoice_trigger, newStatus, newPaymentStatus)) return false;

    const result = await generateFgoInvoice(businessId, orderId, sistem);
    /*
     * Pe calea automata esecul e MUT (dispecerul inghite `false`), deci o comanda
     * pe care garda de reconciliere o refuza ar ramane tacit nefacturata.
     *
     * Se scrie prin `logError`, nu cu un insert propriu. Motivul din comentariul
     * de dinainte („logError merge pe clientul de cerere, iar aici nu exista
     * sesiune") nu mai era adevarat: `logError` foloseste de mult clientul de
     * SISTEM. Insertul direct ramasese ultimul scriitor care trece prin RLS, deci
     * singurul motiv pentru care politica de INSERT `TO authenticated WITH CHECK
     * (true)` mai trebuia sa existe — iar ea lasa orice comerciant sa scrie
     * incidente CRITICE pe seama altui magazin, direct prin PostgREST.
     */
    if ("error" in result) {
      await logError({
        action: "fgo.autoInvoiceEsuat",
        message: result.error,
        details: { orderId },
        businessId,
        severity: "critical",
      });
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function generateFgoInvoice(
  businessId: string,
  orderId: string,
  sistem?: SistemClient,
): Promise<{ number: string; series: string; link: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId, sistem);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order, vatEnabled, vatRate, pricesIncludeVat } = ctx;

  const orderData = order as typeof order & {
    fgo_invoice_number?: string | null;
    fgo_storno_number?: string | null;
  };
  // Slotul e ocupat doar cat timp exista o factura FARA storno. Dupa storno,
  // factura e desfiintata fiscal si comanda e din nou facturabila. Vezi
  // `billing/refacturare.ts`: doua din cele 7 comenzi blocate definitiv in
  // productie sunt chiar aici, la itp-blk, si sunt marfa vie (`pending`, `confirmed`).
  const slot = slotFacturare({
    casa: "fGO",
    factura: orderData.fgo_invoice_number,
    storno: orderData.fgo_storno_number,
  });
  if (!slot.poateEmite) return { error: slot.mesaj };

  try {
    const addr = order.shipping_address as ShippingAddress | null;
    const items = await buildItems({ supabase, businessId }, order, vatEnabled, vatRate, pricesIncludeVat);
    // Comanda care nu se reconciliaza NU se factureaza. Vezi `reconcile.ts`.
    if ("error" in items) return { error: items.error };

    const dueDays = Math.floor(Number(config.due_days) || 0);
    const dueDate = dueDays > 0
      ? new Date(Date.now() + dueDays * 24 * 3600 * 1000).toISOString().split("T")[0]
      : undefined;

    // fGO avea de la inceput `tip` si `codUnic` in tip; doar nu i se trimitea
    // nimic pe ele.
    const parte = invoiceParty(order, { ...addr, address: addr?.address ?? addr?.street ?? null });

    /*
     * fGO are `IdExtern` -> 409, deci duplicatul e blocat LA FURNIZOR — dar exact
     * asta produce fundatura documentata mai jos (fgo.actions.ts, `cancelFgo...`):
     * daca scrierea locala se pierde, factura exista, randul n-o stie, si orice
     * reincercare ia 409 la nesfarsit. Registrul retine numarul si reface legatura
     * fara sa mai cheme fGO. Aceeasi cheie cu slot ca la celelalte doua case.
     */
    const r = await cuRegistru(
      createAdminClient(),
      {
        businessId, orderId, fel: "factura", furnizor: "fgo",
        cheie: cheieOperatie("factura", "fgo", cheieDocument(orderId, slot)),
      },
      async () => {
        const rezultat = await createFgoInvoice(
          config,
          parte.name,
          {
            judet: parte.county ?? undefined,
            localitate: parte.city ?? undefined,
            adresa: parte.address ?? undefined,
            email: order.customer_email ?? undefined,
            telefon: order.customer_phone,
            tip: parte.isCompany ? "PJ" : "PF",
            codUnic: parte.vatCode ?? undefined,
          },
          items,
          {
            dueDate,
            // fGO refuza cu 409 un al doilea document pe acelasi `IdExtern`, iar fara
            // camp de mentiuni in model, sufixul cu numarul notei de credit e si
            // singura urma pe document a facturii pe care o inlocuieste.
            idExtern: order.order_number
              ? cheieDocument(String(order.order_number), slot)
              : undefined,
          },
        );
        return {
          referinta: rezultat.Numar,
          detalii: { serie: rezultat.Serie, link: rezultat.Link ?? null },
          valoare: rezultat,
        };
      },
      verdictFurnizor,
    );

    if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };
    const dFgo = r.fel === "deja" ? (r.detalii as { serie?: string; link?: string | null } | null) : null;
    const result = r.fel === "facut"
      ? r.valoare
      : { Numar: r.referinta ?? "", Serie: dFgo?.serie ?? "", Link: dFgo?.link ?? "" };

    const { data: randuriFactura, error: eFactura } = await supabase.from("orders").update({
      fgo_invoice_number: result.Numar,
      fgo_invoice_series: result.Serie,
      fgo_invoice_link: result.Link,
      // Stornul se sterge odata cu factura pe care o desfiintase: altfel a doua
      // stornare ar fi blocata de propria garda, iar ecranul ar arata factura NOUA
      // drept stornata prin nota de credit a celei vechi.
      fgo_storno_number: null,
      fgo_storno_series: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId).select("id");
    await verificaLegaturaDocumentului({
      actiune: "fgo.factura", document: `${result.Serie} ${result.Numar}`,
      orderId, businessId, eroare: eFactura, randuri: randuriFactura,
    });

    if (slot.inlocuieste) {
      // Urma locala a perechii desfiintate. Randul comenzii tine doar documentul viu,
      // iar evidenta fiscala reala e oricum in contul fGO.
      await logError({
        action: "fgo.refacturareDupaStorno",
        message: `Comanda ${order.order_number}: factura ${result.Serie}${result.Numar} inlocuieste ${slot.inlocuieste.factura ?? "?"}, stornata prin ${slot.inlocuieste.storno}`,
        details: { orderId, ...slot.inlocuieste, facturaNoua: `${result.Serie}${result.Numar}` },
        businessId,
        severity: "info",
      });
    }

    return { number: result.Numar, series: result.Serie, link: result.Link };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function stornoFgoInvoiceAction(
  businessId: string,
  orderId: string,
): Promise<{ number: string; series: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & {
    fgo_invoice_number?: string | null;
    fgo_invoice_series?: string | null;
    fgo_storno_number?: string | null;
  };

  if (!orderData.fgo_invoice_number || !orderData.fgo_invoice_series) {
    return { error: "Nu exista factura fGO pentru aceasta comanda" };
  }
  if (orderData.fgo_storno_number) return { error: "Factura fGO a fost deja stornata" };

  /*
   * ⚠ De ce NU s-a adaugat `IdExtern` si aici.
   *
   * Emiterea are plasa la furnizor (`IdExtern` -> 409, fgo.actions.ts:417), iar
   * `/factura/stornare` (src/lib/fgo.ts:190-207) trimite doar CodUnic, Hash, Numar,
   * Serie si PlatformaUrl. Ar fi fost tentant sa-i strecor un `IdExtern` — dar nu
   * exista nicio dovada ca endpoint-ul il accepta, si un camp necunoscut trimis
   * unei integrari care merge poate fi respins cu totul. Se cere fGO in scris;
   * pana atunci registrul local e singurul strat, si e de ajuns.
   */
  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId,
      orderId,
      fel: "storno",
      furnizor: "fgo",
      // Legata de FACTURA anulata: dupa o reemitere legitima, factura noua are alt
      // numar, deci si stornoul ei alta cheie.
      cheie: cheieOperatie("storno", "fgo",
        `${orderData.fgo_invoice_series}-${orderData.fgo_invoice_number}`),
    },
    async () => {
      const rezultat = await stornoFgoInvoice(
        config, orderData.fgo_invoice_number as string, orderData.fgo_invoice_series as string);
      return {
        referinta: rezultat.Numar,
        detalii: { serie: rezultat.Serie },
        valoare: rezultat,
      };
    },
    // `fgoPost` marcheaza singur: 4xx refuz, 409 si 5xx nesigur, `Success:false` refuz.
    verdictFurnizor,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  const numar = r.fel === "facut" ? r.valoare.Numar : (r.referinta ?? "");
  const serie = r.fel === "facut"
    ? r.valoare.Serie
    : ((r.detalii as { serie?: string } | null)?.serie ?? "");

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    fgo_storno_number: numar,
    fgo_storno_series: serie,
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).select("id");

  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "fgo.storno",
      message: `Storno fGO emis (${serie} ${numar}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
      details: { orderId, businessId, factura: orderData.fgo_invoice_number, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  }

  return { number: numar, series: serie };
}

export async function cancelFgoInvoiceAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & {
    fgo_invoice_number?: string | null;
    fgo_invoice_series?: string | null;
    fgo_storno_number?: string | null;
  };

  if (!orderData.fgo_invoice_number || !orderData.fgo_invoice_series) {
    return { error: "Nu exista factura fGO pentru aceasta comanda" };
  }
  /*
   * Anularea si stornarea sunt doua acte fiscale diferite si nu se pot suprapune.
   * Fara garda asta, o factura deja stornata putea fi si anulata, iar stergerea
   * numarului de factura lasa numarul notei de credit ORFAN pe rand — o nota care
   * nu mai anuleaza nimic. In productie nu exista niciun astfel de rand (0), fiindca
   * actiunea nu e legata azi de niciun buton; garda o inchide inainte sa fie.
   */
  if (orderData.fgo_storno_number) {
    return { error: `Factura a fost deja stornata prin ${orderData.fgo_storno_number}, deci nu mai poate fi anulata. Emite direct factura noua.` };
  }

  try {
    await cancelFgoInvoice(config, orderData.fgo_invoice_number, orderData.fgo_invoice_series);

    // RAMANE deschis: `IdExtern` al documentului anulat ramane luat la fGO, deci o
    // emitere ulterioara pe aceeasi comanda ia 409 („factura pare deja emisa").
    // Reemiterea dupa STORNO nu are problema asta — acolo numarul notei de credit e
    // discriminantul. Aici nu exista niciun numar care sa supravietuiasca anularii,
    // iar un discriminant din ceas ar strica idempotenta si ar putea emite doua
    // facturi la o simpla reincercare. Se lasa asa cat timp actiunea nu e legata de
    // niciun buton si n-a rulat niciodata in productie.
    const { data: randuriAnulare, error: eAnulare } = await supabase.from("orders").update({
      fgo_invoice_number: null,
      fgo_invoice_series: null,
      fgo_invoice_link: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId).select("id");
    /*
     * Scrierea se verifica, dar eliberarea slotului de mai jos ramane
     * NECONDITIONATA — si e important in ce ordine se citeste asta.
     *
     * Daca eliberarea ar depinde de reusita scrierii, randul ar ramane `reusit` cu
     * un document MORT, iar `legaturaVie` nu l-ar prinde: ea intreaba „mai poarta
     * comanda referinta?", si raspunsul e DA tocmai fiindca scrierea a picat. Prima
     * emitere de dupa ar intra pe „adopta" si ar scrie inapoi documentul ANULAT.
     * Deci se elibereaza oricum, iar despre coloanele ramase se STRIGA.
     */
    if (eAnulare || !randuriAnulare || randuriAnulare.length === 0) {
      await logError({
        action: "fgo.anulareFactura",
        message: `Factura fGO a fost anulata la furnizor, dar coloanele comenzii NU s-au golit: ${eAnulare?.message ?? "niciun rand modificat"}`,
        details: { orderId, businessId, code: eAnulare?.code },
        businessId, severity: "critical",
      });
    }

    /*
     * Slotul din registru se elibereaza odata cu coloanele.
     *
     * De cand emiterea e cheiata pe `factura:fgo:cheieDocument(orderId, slot)`, iar
     * dupa anulare `slotFacturare` intoarce `{poateEmite:true}` FARA `inlocuieste`,
     * cheia urmatoarei emiteri e IDENTICA. Fara eliberare, ea ar primi `deja` si ar
     * scrie inapoi pe comanda factura tocmai ANULATA.
     *
     * (Fundatura cu `IdExtern` descrisa mai sus ramane neschimbata — asta repara doar
     * partea locala, ca registrul sa nu adauge un al doilea blocaj peste ea.)
     */
    const eliberat = await marcheazaAnulata(
      createAdminClient(), businessId,
      cheieOperatie("factura", "fgo", cheieDocument(orderId, slotFacturare({
        casa: "fGO", factura: null, storno: orderData.fgo_storno_number,
      }))),
    );
    if (!eliberat) {
      await logError({
        action: "fgo.cancelInvoice",
        message: "Factura fGO anulata, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda ar putea readuce documentul anulat.",
        details: { orderId, businessId, factura: orderData.fgo_invoice_number },
        businessId,
        severity: "critical",
      });
    }

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function refreshFgoInvoiceLink(
  businessId: string,
  orderId: string,
): Promise<{ link: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & {
    fgo_invoice_number?: string | null;
    fgo_invoice_series?: string | null;
  };

  if (!orderData.fgo_invoice_number || !orderData.fgo_invoice_series) {
    return { error: "Nu exista factura fGO pentru aceasta comanda" };
  }

  try {
    const link = await printFgoInvoice(config, orderData.fgo_invoice_number, orderData.fgo_invoice_series);

    await supabase.from("orders").update({
      fgo_invoice_link: link,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { link };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
