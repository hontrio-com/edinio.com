"use server";

import { createClient } from "@/lib/supabase/server";
import { autoInvoiceTriggerMatches } from "@/lib/invoicing";
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

// SKU-urile produselor comandate. Oblio cere `code` pe fiecare linie la conturile
// cu gestiune (productType obligatoriu la stoc); il trimitem cand exista.
async function fetchSkuMap(items: OrderItem[]): Promise<Map<string, string>> {
  const ids = [...new Set(items.map(i => i.product_id).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map();
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("products").select("id, sku").in("id", ids);
    const map = new Map<string, string>();
    for (const p of data ?? []) {
      if (p.sku) map.set(p.id as string, String(p.sku));
    }
    return map;
  } catch {
    return new Map();
  }
}

async function getConfigAndOrder(businessId: string, orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" as const };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" as const };

  const [{ data: settings }, { data: order }] = await Promise.all([
    supabase.from("store_settings")
      .select("oblio_config, prices_include_vat, vat_enabled")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.oblio_config as OblioConfig | null;
  if (!config?.enabled || !config.client_id || !config.client_secret || !config.cif) {
    return { error: "Oblio nu este configurat complet" as const };
  }

  return { supabase, config, order, pricesIncludeVat: settings?.prices_include_vat ?? false, vatEnabled: settings?.vat_enabled ?? false };
}

async function buildProducts(
  order: {
    items: unknown;
    shipping_cost: unknown;
    discount_amount: unknown;
    discount_code: string | null;
    card_discount_amount?: unknown;
  },
  config: OblioConfig,
  pricesIncludeVat: boolean,
  vatEnabled: boolean,
): Promise<OblioProduct[]> {
  const items = (order.items as OrderItem[]) ?? [];
  const skuById = await fetchSkuMap(items);
  const vatIncluded: 0 | 1 = pricesIncludeVat ? 1 : 0;
  // Platitor de TVA: cota din contul Oblio. Neplatitor: vatName gol + 0% (Oblio
  // aplica profilul firmei) — ca modulul oficial, NU "SFDD" (nume incert in Oblio).
  const vatFields = vatEnabled && config.vat_name && config.vat_percentage > 0
    ? { vatName: config.vat_name, vatPercentage: config.vat_percentage, vatIncluded }
    : { vatName: "", vatPercentage: 0, vatIncluded: 0 as const };

  const itemType = config.product_type?.trim() || "Marfa";

  const products: OblioProduct[] = items.map(item => {
    const sku = item.product_id ? skuById.get(item.product_id) : undefined;
    return {
      name: item.name,
      ...(sku ? { code: sku } : {}),
      price: item.price,
      measuringUnit: "buc",
      quantity: item.quantity,
      productType: itemType,
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
    payment_method: string;
    payment_status: string;
    total: unknown;
    order_number: string;
  },
  seriesName: string,
  pricesIncludeVat: boolean,
  vatEnabled: boolean,
  extra?: Partial<OblioInvoiceData>,
): Promise<OblioInvoiceData> {
  const addr = order.shipping_address as ShippingAddress | null;
  const today = new Date().toISOString().split("T")[0];
  const products = await buildProducts(order, config, pricesIncludeVat, vatEnabled);
  const collect = buildCollect(order.payment_method, order.payment_status, order.order_number);

  const dueDays = Math.floor(Number(config.due_days) || 0);
  const dueDate = dueDays > 0
    ? new Date(Date.now() + dueDays * 24 * 3600 * 1000).toISOString().split("T")[0]
    : undefined;

  return {
    cif: config.cif,
    client: {
      name: order.customer_name,
      address: addr?.address ?? undefined,
      state: addr?.county ?? undefined,
      city: addr?.city ?? undefined,
      email: order.customer_email ?? undefined,
      phone: order.customer_phone,
      vatPayer: false,
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
): Promise<{ number: string; series: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order, pricesIncludeVat, vatEnabled } = ctx;

  const orderData = order as typeof order & { oblio_invoice_number?: string | null };
  if (orderData.oblio_invoice_number) return { error: "Factura Oblio a fost deja generata" };

  try {
    const token = await getOblioToken(config.client_id, config.client_secret);
    const data = await buildInvoiceData(config, order, config.series_invoice, pricesIncludeVat, vatEnabled);
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
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: settings } = await supabase
      .from("store_settings").select("oblio_config").eq("business_id", businessId).single();
    const config = settings?.oblio_config as OblioConfig | null;
    if (!config?.enabled || !config.auto_invoice) return false;
    if (!autoInvoiceTriggerMatches(config.auto_invoice_trigger, newStatus, newPaymentStatus)) return false;

    const result = await generateOblioInvoice(businessId, orderId);
    return !("error" in result);
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
  const { supabase, config, order, pricesIncludeVat, vatEnabled } = ctx;

  if (!config.series_proforma?.trim()) return { error: "Seria pentru proforma nu este configurata in Oblio" };

  const orderData = order as typeof order & { oblio_proforma_number?: string | null };
  if (orderData.oblio_proforma_number) return { error: "Proforma Oblio a fost deja generata" };

  try {
    const token = await getOblioToken(config.client_id, config.client_secret);
    const data = await buildInvoiceData(config, order, config.series_proforma, pricesIncludeVat, vatEnabled);
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
    const stornoData: OblioInvoiceData = {
      cif: config.cif,
      client: { name: order.customer_name, save: 0 },
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
