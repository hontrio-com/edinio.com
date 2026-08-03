"use server";

import { createClient } from "@/lib/supabase/server";
import { clientFacturare, eSistem, type SistemClient } from "@/lib/invoicing-context";
import { autoInvoiceTriggerMatches } from "@/lib/invoicing";
import { logError } from "@/lib/error-logger";
import { codSiNatura } from "@/lib/billing/invoice-lines";
import { fetchSkuMap, type SursaCoduri } from "@/lib/billing/sku-map";
import { liniiOblio, mesajRefuz, reconciliazaComanda } from "@/lib/billing/reconcile";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

import { invoiceParty } from "@/lib/billing/invoice-party";
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

  const [{ data: settings }, { data: order }] = await Promise.all([
    supabase.from("store_settings")
      .select("oblio_config, prices_include_vat, vat_enabled, vat_rate")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.oblio_config as OblioConfig | null;
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
      price: item.price,
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

function buildCollect(
  paymentMethod: string,
  paymentStatus: string,
  orderNumber: string,
): OblioInvoiceData["collect"] | undefined {
  if (paymentStatus !== "paid" && paymentMethod !== "cash_on_delivery") return undefined;

  const typeMap: Record<string, string> = {
    cash_on_delivery: "Ramburs",
    stripe: "Card",
    ipay: "Card",
    netopia: "Card",
    klarna: "Alta incasare banca",
    revolut: "Card",
  };

  const type = typeMap[paymentMethod] ?? "Alta incasare banca";
  // Fara `value`: Oblio incaseaza automat totalul facturii. Trimiterea unei valori
  // explicite ar risca nepotriviri (factura partial platita) daca totalul difera.
  return { type, documentNumber: `#${orderNumber}` };
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
  extra?: Partial<OblioInvoiceData>,
): Promise<OblioInvoiceData | { error: string }> {
  const addr = order.shipping_address as ShippingAddress | null;
  const today = new Date().toISOString().split("T")[0];
  const products = await buildProducts(sursa, order, config, vat, vatName);
  if ("error" in products) return products;
  const parte = invoiceParty(order, addr);
  const collect = buildCollect(order.payment_method, order.payment_status, order.order_number);

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
    // doar in interfata Oblio.
    mentions: `Comanda ${order.order_number}`,
    internalNote: `Comanda ${order.order_number}`,
    ...(config.send_to_spv ? { spvExtern: 1 as const } : {}),
    idempotencyKey: `${config.cif}-${seriesName}-${order.order_number}`,
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

  const { error } = await supabase.from("store_settings").update({
    oblio_config: config as unknown as import("@/types/database.types").Json,
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
  clientId: string,
  clientSecret: string,
): Promise<{
  companies: { cif: string; name: string }[];
  series: { type: string; name: string; default: boolean }[];
  vatRates: { name: string; percent: number; default: boolean }[];
  firstCif: string;
} | { error: string }> {
  try {
    const token = await getOblioToken(clientId, clientSecret);
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
  clientId: string,
  clientSecret: string,
  cif: string,
): Promise<{
  series: { type: string; name: string; default: boolean }[];
  vatRates: { name: string; percent: number; default: boolean }[];
} | { error: string }> {
  try {
    const token = await getOblioToken(clientId, clientSecret);
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

  const orderData = order as typeof order & { oblio_invoice_number?: string | null };
  if (orderData.oblio_invoice_number) return { error: "Factura Oblio a fost deja generata" };

  try {
    const token = await getOblioToken(config.client_id, config.client_secret);
    const { vat, vatName } = await regimSiNume(token, config, order, { vatEnabled, vatRate, pricesIncludeVat });
    const data = await buildInvoiceData(config, order, config.series_invoice, vat, vatName, { supabase, businessId });
    // Comanda care nu se reconciliaza NU se factureaza. Vezi `reconcile.ts`.
    if ("error" in data) return { error: data.error };
    const result = await createOblioDoc(token, "invoice", data);

    await supabase.from("orders").update({
      oblio_invoice_number: result.number,
      oblio_invoice_series: result.seriesName,
      oblio_invoice_link: result.link ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

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
     * pe care garda de reconciliere o refuza ar ramane tacit nefacturata. Se scrie
     * cu clientul de SISTEM: `logError` merge pe clientul de cerere, iar aici nu
     * exista sesiune.
     */
    if ("error" in result) {
      await supabase.from("error_logs").insert({
        action: "oblio.autoInvoiceEsuat",
        message: result.error,
        details: { orderId } as never,
        business_id: businessId,
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
    const data = await buildInvoiceData(config, order, config.series_proforma, vat, vatName, { supabase, businessId });
    // O proforma gresita e sursa unei facturi gresite, deci trece prin aceeasi garda.
    if ("error" in data) return { error: data.error };
    // Proforma nu are incasare si nu se trimite in SPV (nu e document fiscal).
    const { collect: _collect, spvExtern: _spv, ...proformaData } = data;
    const result = await createOblioDoc(token, "proforma", proformaData as OblioInvoiceData);

    await supabase.from("orders").update({
      oblio_proforma_number: result.number,
      oblio_proforma_series: result.seriesName,
      oblio_proforma_link: result.link ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

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
      // Stornul urmeaza factura in SPV: daca originala a fost trimisa, si creditul
      // trebuie trimis (e-Factura).
      ...(config.send_to_spv ? { spvExtern: 1 as const } : {}),
    };

    const result = await createOblioDoc(token, "invoice", stornoData);

    await supabase.from("orders").update({
      oblio_storno_number: result.number,
      oblio_storno_series: result.seriesName,
      oblio_storno_link: result.link ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { number: result.number, series: result.seriesName };
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

    await supabase.from("orders").update({
      oblio_proforma_number: null,
      oblio_proforma_series: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
