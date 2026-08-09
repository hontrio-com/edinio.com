"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { clientFacturare, eSistem, type SistemClient } from "@/lib/invoicing-context";
import { autoInvoiceTriggerMatches } from "@/lib/invoicing";
import { logError } from "@/lib/error-logger";
import { verificaLegaturaDocumentului } from "@/lib/invoicing-legatura";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { codSiNatura } from "@/lib/billing/invoice-lines";
import { fetchSkuMap, type SursaCoduri } from "@/lib/billing/sku-map";
import { liniiOblio, mesajRefuz, pretDeDocument, reconciliazaComanda } from "@/lib/billing/reconcile";

import { invoiceParty } from "@/lib/billing/invoice-party";
import { baniiAuIntrat, tipIncasareOblio } from "@/lib/billing/incasare";
import {
  cheieDocument,
  mentiuneRefacturare,
  slotFacturare,
  type SlotFacturare,
} from "@/lib/billing/refacturare";
import { cereNumeleCotei, invoiceVat, numeCota, type RegimTva } from "@/lib/billing/invoice-vat";
import {
  getOblioToken,
  getCompanies,
  getSeries,
  getVatRates,
  createOblioDoc,
  cancelOblioDoc,
  type OblioConfig,
  type OblioProduct,
  type OblioInvoiceData,
} from "@/lib/oblio";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type OrderItem = { name: string; price: number; quantity: number; product_id?: string };
type ShippingAddress = { county?: string; city?: string; address?: string };

async function getConfigAndOrder(businessId: string, orderId: string, sistem?: SistemClient) {
  const supabase = await clientFacturare(sistem);
  // Apelul de sistem sare peste verificarea de proprietar fiindca apelantul e
  // server-ul insusi, dupa ce a confirmat plata la furnizor. Vezi
  // `invoicing-context.ts` pentru ce face argumentul asta nefalsificabil.
  if (!eSistem(sistem)) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Neautorizat" as const };

    const { data: biz } = await supabase
      .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
    if (!biz) return { error: "Acces interzis" as const };
  }

  // `oblio_config` se citeste separat, cu SERVICE ROLE. Pe calea manuala
  // `clientFacturare` intoarce clientul utilizatorului, iar pentru `authenticated`
  // vederea store_settings nu mai decripteaza: `client_secret` ar fi ajuns
  // `enc.v1.…` si `getOblioToken` ar fi primit „credentiale invalide". Cotele de
  // TVA si comanda NU sunt secrete, deci raman pe clientul de mai sus, unde RLS
  // decide. Proprietarul e verificat mai sus (manual) sau e serverul insusi.
  const admin = createAdminClient();
  const [{ data: settings }, { data: secrete }, { data: order }] = await Promise.all([
    supabase.from("store_settings")
      .select("prices_include_vat, vat_enabled, vat_rate")
      .eq("business_id", businessId).single(),
    admin.from("store_settings").select("oblio_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = secrete?.oblio_config as OblioConfig | null;
  if (!config?.enabled || !config.client_id || !config.client_secret || !config.cif) {
    return { error: "Oblio nu este configurat complet" as const };
  }

  return {
    supabase, config, order,
    pricesIncludeVat: settings?.prices_include_vat ?? false,
    vatEnabled: settings?.vat_enabled ?? false,
    vatRate: settings?.vat_rate ?? 0,
  };
}

/**
 * Regimul de TVA al facturii si numele cotei, intr-un singur loc.
 *
 * Numele si procentul se aleg impreuna, ca pereche, din nomenclatorul contului
 * Oblio. Cand cota facturii nu mai e cea aleasa atunci — o comanda veche la alta
 * cota, sau magazinul trecut intre timp pe alta — numele configurat descrie alt
 * procent decat cel trimis, si factura ar pleca cu „Normala 21%" scris peste 19.
 * Nomenclatorul se reciteste DOAR atunci, ca sa nu adaugam un apel de retea (si un
 * mod de esec) pe un drum care azi merge fara el.
 */
async function regimSiNume(
  token: string,
  config: OblioConfig,
  order: { vat_rate?: unknown },
  magazin: { vatEnabled: boolean; vatRate: unknown; pricesIncludeVat: boolean },
): Promise<{ vat: RegimTva; vatName: string }> {
  const vat = invoiceVat(
    order,
    { vat_enabled: magazin.vatEnabled, vat_rate: magazin.vatRate, prices_include_vat: magazin.pricesIncludeVat },
    !!config.vat_name,
  );
  const configurat = { name: config.vat_name, percentage: Number(config.vat_percentage) || 0 };
  if (!cereNumeleCotei(vat.rate, configurat.percentage)) return { vat, vatName: configurat.name };

  // De aici incolo numele configurat NU mai descrie cota trimisa. Orice iesire pe
  // numele vechi pleaca deci cu o pereche nepotrivita, iar la Oblio numele chiar
  // selecteaza cota din nomenclatorul contului: daca documentul e refuzat, calea
  // automata inghite esecul si comanda ramane nefacturata fara sa afle nimeni.
  // De aceea se scrie in jurnal, chiar daca factura pleaca oricum.
  const nepotrivit = (motiv: string) => {
    logError({
      action: "oblio.numeCota", message: "Numele cotei configurate nu descrie cota facturii",
      details: { motiv, cotaFacturii: vat.rate, cotaConfigurata: configurat.percentage, numeConfigurat: configurat.name, cif: config.cif },
      severity: "warning",
    });
    return { vat, vatName: configurat.name };
  };

  try {
    const cote = await getVatRates(token, config.cif);
    const nume = numeCota(vat.rate, configurat, cote.map((c) => ({ name: c.name, percentage: c.percent })));
    // Nomenclatorul citit, dar fara nicio cota cu procentul cerut.
    return nume === configurat.name ? nepotrivit("cota lipseste din contul Oblio") : { vat, vatName: nume };
  } catch {
    // Nomenclatorul necitit nu are voie sa opreasca factura: ramane numele configurat.
    return nepotrivit("nomenclatorul de cote nu s-a putut citi");
  }
}

async function buildProducts(
  sursa: SursaCoduri,
  order: {
    items: unknown;
    shipping_cost: unknown;
    discount_amount: unknown;
    discount_code: string | null;
    card_discount_amount?: unknown;
    cod_discount_amount?: unknown;
    cod_fee_amount?: unknown;
    total?: unknown;
    vat_amount?: unknown;
    order_number?: string | number;
    payment_status?: string | null;
  },
  config: OblioConfig,
  vat: RegimTva,
  vatName: string,
): Promise<OblioProduct[] | { error: string }> {
  const items = (order.items as OrderItem[]) ?? [];
  const skus = await fetchSkuMap(sursa.supabase, sursa.businessId, items, (m) =>
    logError({ action: "billing.skuMap", message: m.message, details: { ...m.details, casa: "oblio" }, severity: "warning" }));
  /*
   * Cota si regimul vin din regula COMUNA celor trei case de facturare.
   *
   * Pana acum Oblio isi lua cota exclusiv din propria configurare — un numar ales
   * odata, in ecranul lui — si nu se uita niciodata nici la comanda, nici la
   * setarile magazinului. Nimic nu-l tinea sincronizat: cu 19 in configurare si 21
   * in magazin, factura declara mai putin TVA decat s-a incasat.
   *
   * Numele cotei ramane din configurare, dar numai cat timp descrie chiar cota
   * trimisa: numele si procentul se aleg impreuna, ca pereche, din nomenclatorul
   * contului Oblio, deci un nume vechi langa alt procent ar fi o minciuna.
   */
  const vatIncluded: 0 | 1 = vat.taxIncluded ? 1 : 0;
  // Neplatitor: vatName gol + 0% (Oblio aplica profilul firmei) — ca modulul
  // oficial, NU "SFDD" (nume incert in Oblio).
  const vatFields = vat.rate > 0 && vatName
    ? { vatName, vatPercentage: vat.rate, vatIncluded }
    : { vatName: "", vatPercentage: 0, vatIncluded: 0 as const };

  const itemType = config.product_type?.trim() || "Marfa";

  const products: OblioProduct[] = items.map(item => {
    const { code, esteServiciu } = codSiNatura(item, skus);
    return {
      name: item.name,
      ...(code ? { code } : {}),
      price: pretDeDocument(item.price),
      measuringUnit: "buc",
      quantity: item.quantity,
      // Extraoptiunea nu e marfa din catalog: pleaca drept serviciu, ca Transportul.
      productType: esteServiciu ? "Serviciu" : itemType,
      save: 0,
      ...vatFields,
    };
  });

  if (Number(order.shipping_cost) > 0) {
    products.push({
      name: "Transport",
      price: Number(order.shipping_cost),
      measuringUnit: "buc",
      quantity: 1,
      productType: "Serviciu",
      save: 0,
      ...vatFields,
    });
  }

  if (Number(order.discount_amount) > 0) {
    products.push({
      name: order.discount_code ? `Discount (${order.discount_code})` : "Discount",
      discount: Number(order.discount_amount),
      discountType: "valoric",
      discountAllAbove: 1,
    });
  }

  // Reducerea la plata online e deja scazuta din orders.total la plasare; fara
  // linia asta factura ar iesi mai mare decat totalul comenzii (si mai mare decat
  // incasarea). O adaugam ca linie cu valoare negativa (dupa discountul promo, ca
  // sa nu interfereze cu discountAllAbove), purtand aceleasi campuri de TVA.
  if (Number(order.card_discount_amount) > 0) {
    products.push({
      name: "Reducere plata online",
      price: -Math.abs(Number(order.card_discount_amount)),
      measuringUnit: "buc",
      quantity: 1,
      productType: "Serviciu",
      save: 0,
      ...vatFields,
    });
  }
  // Reducerea la plata ramburs — aceeasi logica, linie negativa separata.
  if (Number(order.cod_discount_amount) > 0) {
    products.push({
      name: "Reducere plata ramburs",
      price: -Math.abs(Number(order.cod_discount_amount)),
      measuringUnit: "buc",
      quantity: 1,
      productType: "Serviciu",
      save: 0,
      ...vatFields,
    });
  }
  // Taxa de ramburs e adunata in total: linie de serviciu cu pret POZITIV.
  if (Number(order.cod_fee_amount) > 0) {
    products.push({
      name: "Taxa plata ramburs",
      price: Math.abs(Number(order.cod_fee_amount)),
      measuringUnit: "buc",
      quantity: 1,
      productType: "Serviciu",
      save: 0,
      ...vatFields,
    });
  }

  // Suma liniilor trebuie sa dea chiar `orders.total`. Rotunjirea documentului se
  // absoarbe; ce nu se poate explica prin ea opreste emiterea. Vezi `reconcile.ts`.
  const rec = reconciliazaComanda(liniiOblio(products), order, vat);
  if (rec.fel === "refuz") {
    return { error: mesajRefuz(rec, order.order_number ?? "", order.payment_status === "paid") };
  }
  if (rec.fel === "ajustare") {
    products.push({
      name: "Ajustare rotunjire",
      price: rec.delta,
      measuringUnit: "buc",
      quantity: 1,
      // Serviciu, ca Transportul: nu e marfa si nu intra in gestiune.
      productType: "Serviciu",
      save: 0,
      ...vatFields,
    });
  }

  return products;
}

/**
 * Incasarea inregistrata pe factura la emitere.
 *
 * Conditia de dinainte era `status !== "paid" && metoda !== "cash_on_delivery"`,
 * adica metoda de plata raspundea in locul starii platii: orice comanda cu ramburs
 * NEPLATIT trecea. Si cum documentul pleaca fara camp `value`, Oblio incaseaza
 * automat TOTALUL facturii — deci o comanda refuzata la livrare ramanea cu factura
 * incasata integral. Regula e acum cea comuna, din `billing/incasare.ts`.
 */
function buildCollect(order: {
  payment_method: string;
  payment_status: string;
  order_number: string;
}): OblioInvoiceData["collect"] | undefined {
  if (!baniiAuIntrat(order)) return undefined;
  // Fara `value`: Oblio incaseaza automat totalul facturii. Trimiterea unei valori
  // explicite ar risca nepotriviri (factura partial platita) daca totalul difera.
  return { type: tipIncasareOblio(order.payment_method), documentNumber: `#${order.order_number}` };
}

async function buildInvoiceData(
  config: OblioConfig,
  order: {
    customer_name: string;
    customer_email: string | null;
    customer_phone: string;
    shipping_address: unknown;
    items: unknown;
    shipping_cost: unknown;
    discount_amount: unknown;
    discount_code: string | null;
    card_discount_amount?: unknown;
    cod_discount_amount?: unknown;
    cod_fee_amount?: unknown;
    payment_method: string;
    payment_status: string;
    total: unknown;
    order_number: string;
  },
  seriesName: string,
  vat: RegimTva,
  vatName: string,
  sursa: SursaCoduri,
  /** Ce document desfiintat inlocuieste acesta. Vezi `billing/refacturare.ts`. */
  slot: SlotFacturare,
  extra?: Partial<OblioInvoiceData>,
): Promise<OblioInvoiceData | { error: string }> {
  const addr = order.shipping_address as ShippingAddress | null;
  const today = new Date().toISOString().split("T")[0];
  const products = await buildProducts(sursa, order, config, vat, vatName);
  if ("error" in products) return products;
  const parte = invoiceParty(order, addr);
  const collect = buildCollect(order);

  const dueDays = Math.floor(Number(config.due_days) || 0);
  const dueDate = dueDays > 0
    ? new Date(Date.now() + dueDays * 24 * 3600 * 1000).toISOString().split("T")[0]
    : undefined;

  return {
    cif: config.cif,
    client: {
      // `cif` de aici e al CLIENTULUI; `cif`-ul de la nivelul de sus, din
      // `OblioInvoiceData`, e al firmei care emite. Doua campuri cu acelasi nume
      // in acelasi obiect — usor de incurcat, imposibil de reparat dupa.
      name: parte.name,
      ...(parte.vatCode ? { cif: parte.vatCode } : {}),
      ...(parte.regCom ? { rc: parte.regCom } : {}),
      address: parte.address ?? undefined,
      state: parte.county ?? undefined,
      city: parte.city ?? undefined,
      email: order.customer_email ?? undefined,
      phone: order.customer_phone,
      vatPayer: parte.vatPayer,
      save: 0,
    },
    issueDate: today,
    ...(dueDate ? { dueDate } : {}),
    seriesName,
    language: "RO",
    precision: 2,
    currency: "RON",
    products,
    ...(collect ? { collect } : {}),
    // mentions apare PE factura (leaga documentul de comanda vizibil), internalNote
    // doar in interfata Oblio. La reemiterea dupa storno, mentiunea e si singura
    // urma pe hartie a documentului desfiintat: randul comenzii pastreaza doar
    // documentul viu.
    mentions: mentiuneRefacturare(`Comanda ${order.order_number}`, slot),
    internalNote: mentiuneRefacturare(`Comanda ${order.order_number}`, slot),
    ...(config.send_to_spv ? { spvExtern: 1 as const } : {}),
    // Cheia primei emiteri ramane cea de dinainte; reemiterea o discrimineaza prin
    // numarul notei de credit. Fara asta, Oblio ar fi intors CHIAR factura stornata.
    idempotencyKey: cheieDocument(`${config.cif}-${seriesName}-${order.order_number}`, slot),
    ...extra,
  };
}

// ─── Config actions ───────────────────────────────────────────────────────────

export async function saveOblioConfig(
  businessId: string,
  config: OblioConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  const { data: vechi } = await supabase
    .from("store_settings").select("oblio_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("oblio_config", config, vechi?.oblio_config);

  const { error } = await supabase.from("store_settings").update({
    oblio_config: configFinal as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectOblio(businessId: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    oblio_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function loadOblioAccountData(
  businessId: string,
  clientId: string,
  clientSecret: string,
): Promise<{
  companies: { cif: string; name: string }[];
  series: { type: string; name: string; default: boolean }[];
  vatRates: { name: string; percent: number; default: boolean }[];
  firstCif: string;
} | { error: string }> {
  try {
    const secret = await secretDinConfig(businessId, "oblio_config", "client_secret", clientSecret);
    if (!secret) return { error: "Completeaza tokenul secret Oblio." };
    const token = await getOblioToken(clientId, secret);
    const companies = await getCompanies(token);
    if (!companies.length) return { error: "Nicio firma gasita in contul Oblio" };

    const firstCif = companies[0].cif;
    const [series, vatRates] = await Promise.all([
      getSeries(token, firstCif),
      getVatRates(token, firstCif),
    ]);

    return {
      companies: companies.map(c => ({ cif: c.cif, name: c.company })),
      series: series.map(s => ({ type: s.type, name: s.name, default: s.default })),
      vatRates: vatRates.map(v => ({ name: v.name, percent: v.percent, default: v.default })),
      firstCif,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function loadOblioSeriesForCif(
  businessId: string,
  clientId: string,
  clientSecret: string,
  cif: string,
): Promise<{
  series: { type: string; name: string; default: boolean }[];
  vatRates: { name: string; percent: number; default: boolean }[];
} | { error: string }> {
  try {
    const secret = await secretDinConfig(businessId, "oblio_config", "client_secret", clientSecret);
    if (!secret) return { error: "Completeaza tokenul secret Oblio." };
    const token = await getOblioToken(clientId, secret);
    const [series, vatRates] = await Promise.all([
      getSeries(token, cif),
      getVatRates(token, cif),
    ]);
    return {
      series: series.map(s => ({ type: s.type, name: s.name, default: s.default })),
      vatRates: vatRates.map(v => ({ name: v.name, percent: v.percent, default: v.default })),
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Document actions ─────────────────────────────────────────────────────────

export async function generateOblioInvoice(
  businessId: string,
  orderId: string,
  sistem?: SistemClient,
): Promise<{ number: string; series: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId, sistem);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order, pricesIncludeVat, vatEnabled, vatRate } = ctx;

  const orderData = order as typeof order & {
    oblio_invoice_number?: string | null;
    oblio_storno_number?: string | null;
  };
  // Slotul e ocupat doar cat timp exista o factura FARA storno. Dupa storno,
  // factura e desfiintata fiscal si comanda e din nou facturabila. Vezi
  // `billing/refacturare.ts` pentru cele 7 comenzi blocate definitiv din productie.
  const slot = slotFacturare({
    casa: "Oblio",
    factura: orderData.oblio_invoice_number,
    storno: orderData.oblio_storno_number,
  });
  if (!slot.poateEmite) return { error: slot.mesaj };

  try {
    const token = await getOblioToken(config.client_id, config.client_secret);
    const { vat, vatName } = await regimSiNume(token, config, order, { vatEnabled, vatRate, pricesIncludeVat });
    const data = await buildInvoiceData(config, order, config.series_invoice, vat, vatName, { supabase, businessId }, slot);
    // Comanda care nu se reconciliaza NU se factureaza. Vezi `reconcile.ts`.
    if ("error" in data) return { error: data.error };
    /*
     * Oblio ARE deja `idempotencyKey` la emitere (buildInvoiceData), deci a doua
     * apasare intoarce ACELASI document si duplicatul e imposibil. Registrul adauga
     * altceva: opreste al doilea apel inainte sa plece si, cand scrierea locala s-a
     * pierdut, reface legatura din ce a retinut el — fara sa mai atinga furnizorul.
     * Aceeasi cheie (cu slot) ca la SmartBill, ca reemiterea dupa storno sa treaca.
     */
    const r = await cuRegistru(
      createAdminClient(),
      {
        businessId, orderId, fel: "factura", furnizor: "oblio",
        cheie: cheieOperatie("factura", "oblio", cheieDocument(orderId, slot)),
      },
      async () => {
        const rezultat = await createOblioDoc(token, "invoice", data);
        return {
          referinta: rezultat.number,
          detalii: { serie: rezultat.seriesName, link: rezultat.link ?? null },
          valoare: rezultat,
        };
      },
      verdictFurnizor,
    );

    if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };
    const dOb = r.fel === "deja" ? (r.detalii as { serie?: string; link?: string | null } | null) : null;
    const result = r.fel === "facut"
      ? r.valoare
      : { number: r.referinta ?? "", seriesName: dOb?.serie ?? "", link: dOb?.link ?? null };

    const { data: randuriFactura, error: eFactura } = await supabase.from("orders").update({
      oblio_invoice_number: result.number,
      oblio_invoice_series: result.seriesName,
      oblio_invoice_link: result.link ?? null,
      // Stornul se sterge odata cu factura pe care o desfiintase: altfel a doua
      // stornare ar fi blocata de propria garda, iar ecranul ar arata factura NOUA
      // drept stornata prin nota de credit a celei vechi.
      oblio_storno_number: null,
      oblio_storno_series: null,
      oblio_storno_link: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId).select("id");
    await verificaLegaturaDocumentului({
      actiune: "oblio.factura", document: `${result.seriesName} ${result.number}`,
      orderId, businessId, eroare: eFactura, randuri: randuriFactura,
    });

    if (slot.inlocuieste) {
      // Urma locala a perechii desfiintate. Randul comenzii tine doar documentul viu,
      // iar evidenta fiscala reala e oricum in contul Oblio.
      await logError({
        action: "oblio.refacturareDupaStorno",
        message: `Comanda ${order.order_number}: factura ${result.seriesName}${result.number} inlocuieste ${slot.inlocuieste.factura ?? "?"}, stornata prin ${slot.inlocuieste.storno}`,
        details: { orderId, ...slot.inlocuieste, facturaNoua: `${result.seriesName}${result.number}` },
        businessId,
        severity: "info",
      });
    }

    return { number: result.number, series: result.seriesName };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

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
      .from("store_settings").select("oblio_config").eq("business_id", businessId).single();
    const config = settings?.oblio_config as OblioConfig | null;
    if (!config?.enabled || !config.auto_invoice) return false;
    if (!autoInvoiceTriggerMatches(config.auto_invoice_trigger, newStatus, newPaymentStatus)) return false;

    const result = await generateOblioInvoice(businessId, orderId, sistem);
    /*
     * Pe calea automata esecul e MUT (dispecerul inghite `false`), deci o comanda
     * pe care garda de reconciliere o refuza ar ramane tacit nefacturata.
     *
     * Se scrie prin `logError`, nu cu un insert propriu — vezi explicatia din
     * fgo.actions.ts: motivul invocat inainte („logError merge pe clientul de
     * cerere") nu mai e adevarat, iar insertul direct era ultimul care avea nevoie
     * de politica INSERT deschisa pe error_logs.
     */
    if ("error" in result) {
      await logError({
        action: "oblio.autoInvoiceEsuat",
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

export async function generateOblioProforma(
  businessId: string,
  orderId: string,
): Promise<{ number: string; series: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order, pricesIncludeVat, vatEnabled, vatRate } = ctx;

  if (!config.series_proforma?.trim()) return { error: "Seria pentru proforma nu este configurata in Oblio" };

  const orderData = order as typeof order & { oblio_proforma_number?: string | null };
  if (orderData.oblio_proforma_number) return { error: "Proforma Oblio a fost deja generata" };

  try {
    const token = await getOblioToken(config.client_id, config.client_secret);
    const { vat, vatName } = await regimSiNume(token, config, order, { vatEnabled, vatRate, pricesIncludeVat });
    // Proforma nu se storneaza niciodata (se anuleaza, prin `cancelOblioProforma`,
    // care ii goleste numarul), deci slotul ei nu inlocuieste vreun document.
    const data = await buildInvoiceData(config, order, config.series_proforma, vat, vatName, { supabase, businessId }, { poateEmite: true });
    // O proforma gresita e sursa unei facturi gresite, deci trece prin aceeasi garda.
    if ("error" in data) return { error: data.error };
    // Proforma nu are incasare si nu se trimite in SPV (nu e document fiscal).
    const { collect: _collect, spvExtern: _spv, ...proformaData } = data;
    // `idempotencyKey` din `buildInvoiceData` contine seria proformei, deci nu se
    // ciocneste cu factura. Registrul adauga oprirea inainte de apel si adoptarea.
    const r = await cuRegistru(
      createAdminClient(),
      { businessId, orderId, fel: "proforma", furnizor: "oblio", cheie: cheieOperatie("proforma", "oblio", orderId) },
      async () => {
        const rezultat = await createOblioDoc(token, "proforma", proformaData as OblioInvoiceData);
        return {
          referinta: rezultat.number,
          detalii: { serie: rezultat.seriesName, link: rezultat.link ?? null },
          valoare: rezultat,
        };
      },
      verdictFurnizor,
    );

    if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };
    const dPr = r.fel === "deja" ? (r.detalii as { serie?: string; link?: string | null } | null) : null;
    const result = r.fel === "facut"
      ? r.valoare
      : { number: r.referinta ?? "", seriesName: dPr?.serie ?? "", link: dPr?.link ?? null };

    const { data: randuriProforma, error: eProforma } = await supabase.from("orders").update({
      oblio_proforma_number: result.number,
      oblio_proforma_series: result.seriesName,
      oblio_proforma_link: result.link ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId).select("id");
    // Proforma orfana la furnizor = conversia in factura n-o mai gaseste.
    await verificaLegaturaDocumentului({
      actiune: "oblio.proforma", document: `${result.seriesName} ${result.number}`,
      orderId, businessId, eroare: eProforma, randuri: randuriProforma,
    });

    return { number: result.number, series: result.seriesName };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function stornoOblioInvoice(
  businessId: string,
  orderId: string,
): Promise<{ number: string; series: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & {
    oblio_invoice_number?: string | null;
    oblio_invoice_series?: string | null;
    oblio_storno_number?: string | null;
  };

  if (!orderData.oblio_invoice_number || !orderData.oblio_invoice_series) {
    return { error: "Nu exista factura Oblio pentru aceasta comanda" };
  }
  if (orderData.oblio_storno_number) return { error: "Factura a fost deja stornata" };

  try {
    const token = await getOblioToken(config.client_id, config.client_secret);

    // Create storno invoice via referenceDocument
    const today = new Date().toISOString().split("T")[0];
    // Stornul trebuie sa poarte ACELASI titular ca factura pe care o anuleaza.
    // Cu `order.customer_name`, o factura emisa pe „SC Exemplu SRL" primea o nota
    // de credit pe „Ion Popescu", persoana de contact — doua documente care nu se
    // inchid unul pe altul in contabilitate si nici in SPV.
    const parteStorno = invoiceParty(order, order.shipping_address as ShippingAddress | null);
    const stornoData: OblioInvoiceData = {
      cif: config.cif,
      client: {
        name: parteStorno.name,
        ...(parteStorno.vatCode ? { cif: parteStorno.vatCode } : {}),
        ...(parteStorno.regCom ? { rc: parteStorno.regCom } : {}),
        vatPayer: parteStorno.vatPayer,
        save: 0,
      },
      issueDate: today,
      seriesName: config.series_invoice,
      language: "RO",
      precision: 2,
      currency: "RON",
      products: [],
      referenceDocument: {
        type: "Factura",
        refund: 1,
        seriesName: orderData.oblio_invoice_series,
        number: orderData.oblio_invoice_number,
      },
      mentions: `Storno comanda ${order.order_number}`,
      internalNote: `Storno comanda ${order.order_number}`,
      /*
       * ⚠ CHEIA DE IDEMPOTENTA LIPSEA CHIAR AICI.
       *
       * Emiterea obisnuita o primeste din `buildInvoiceData` (linia 369), dar
       * `stornoData` e construit de mana si o omitea — deci storno-ul era singurul
       * document Oblio fara plasa la furnizor, la o casa care ALTFEL o are peste
       * tot. Iar o nota de credit dubla nu inseamna „bani pierduti": inseamna
       * creditare dubla in contabilitate si in SPV.
       *
       * Cheia se leaga de FACTURA anulata, nu de comanda: dupa o reemitere
       * legitima, factura noua are alt numar, deci si stornoul ei alta cheie.
       */
      idempotencyKey: `${config.cif}-storno-${orderData.oblio_invoice_series}-${orderData.oblio_invoice_number}`,
      // Stornul urmeaza factura in SPV: daca originala a fost trimisa, si creditul
      // trebuie trimis (e-Factura).
      ...(config.send_to_spv ? { spvExtern: 1 as const } : {}),
    };

    const r = await cuRegistru(
      createAdminClient(),
      {
        businessId,
        orderId,
        fel: "storno",
        furnizor: "oblio",
        cheie: cheieOperatie("storno", "oblio",
          `${orderData.oblio_invoice_series}-${orderData.oblio_invoice_number}`),
      },
      async () => {
        const rezultat = await createOblioDoc(token, "invoice", stornoData);
        return {
          referinta: rezultat.number,
          detalii: { serie: rezultat.seriesName, link: rezultat.link ?? null },
          valoare: rezultat,
        };
      },
      // `oblioReq` marcheaza singur refuzul (status 4xx in CORP, nu in HTTP).
      verdictFurnizor,
    );

    if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

    const d = r.fel === "deja"
      ? (r.detalii as { serie?: string; link?: string | null } | null)
      : null;
    const numar = r.fel === "facut" ? r.valoare.number : (r.referinta ?? "");
    const serie = r.fel === "facut" ? r.valoare.seriesName : (d?.serie ?? "");
    const link = r.fel === "facut" ? (r.valoare.link ?? null) : (d?.link ?? null);

    const { error: eScriere, data: randuri } = await supabase.from("orders").update({
      oblio_storno_number: numar,
      oblio_storno_series: serie,
      oblio_storno_link: link,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).select("id");

    // Nota de credit exista la Oblio. O eroare acum l-ar trimite pe om sa apese
    // din nou; registrul a inregistrat deja operatia, deci a doua apasare o adopta.
    if (eScriere || !randuri || randuri.length === 0) {
      await logError({
        action: "oblio.storno",
        message: `Storno Oblio emis (${serie} ${numar}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
        details: { orderId, businessId, factura: orderData.oblio_invoice_number, code: eScriere?.code },
        businessId,
        severity: "critical",
      });
    }

    return { number: numar, series: serie };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function cancelOblioProforma(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & {
    oblio_proforma_number?: string | null;
    oblio_proforma_series?: string | null;
    oblio_invoice_number?: string | null;
  };

  if (!orderData.oblio_proforma_number || !orderData.oblio_proforma_series) {
    return { error: "Nu exista proforma Oblio pentru aceasta comanda" };
  }
  if (orderData.oblio_invoice_number) {
    return { error: "Nu se poate anula proforma dupa ce a fost emisa factura" };
  }

  try {
    const token = await getOblioToken(config.client_id, config.client_secret);
    await cancelOblioDoc(token, "proforma", config.cif, orderData.oblio_proforma_series, orderData.oblio_proforma_number);

    const { data: randuriAnulareProforma, error: eAnulareProforma } = await supabase.from("orders").update({
      oblio_proforma_number: null,
      oblio_proforma_series: null,
      // `oblio_proforma_link` ramanea pe loc, deci randul pastra un link catre un
      // document ANULAT. Se goleste odata cu numarul.
      oblio_proforma_link: null,
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
    if (eAnulareProforma || !randuriAnulareProforma || randuriAnulareProforma.length === 0) {
      await logError({
        action: "oblio.anulareProforma",
        message: `Proforma Oblio a fost anulata la furnizor, dar coloanele comenzii NU s-au golit: ${eAnulareProforma?.message ?? "niciun rand modificat"}`,
        details: { orderId, businessId, code: eAnulareProforma?.code },
        businessId, severity: "critical",
      });
    }

    // Fara eliberare, o proforma noua ar fi „adoptat" chiar pe cea anulata.
    const eliberat = await marcheazaAnulata(
      createAdminClient(), businessId, cheieOperatie("proforma", "oblio", orderId));
    if (!eliberat) {
      await logError({
        action: "oblio.cancelProforma",
        message: "Proforma Oblio anulata, dar slotul din registru NU s-a eliberat. Urmatoarea proforma pe aceasta comanda va fi refuzata.",
        details: { orderId, businessId, proforma: orderData.oblio_proforma_number },
        businessId,
        severity: "critical",
      });
    }

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
