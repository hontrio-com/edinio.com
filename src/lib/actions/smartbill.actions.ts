"use server";

import { createClient } from "@/lib/supabase/server";
import { autoInvoiceTriggerMatches } from "@/lib/invoicing";
import { isCardPaymentMethod, PAYMENT_METHOD_DEFAULT_LABELS, type PaymentMethodType } from "@/lib/payment-methods";
import {
  getMerchantSeries,
  getMerchantTaxes,
  createMerchantInvoice,
  createMerchantEstimate,
  reverseMerchantInvoice,
  getEstimateInvoices,
  sendMerchantDocumentEmail,
  type SmartbillConfig,
  type MerchantInvoiceProduct,
  type MerchantInvoiceParams,
} from "@/lib/smartbill";

// ─── Shared helpers ────────────────────────────────────────────────────────

async function getConfigForBiz(businessId: string): Promise<SmartbillConfig | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const { data: settings } = await supabase
    .from("store_settings").select("smartbill_config").eq("business_id", businessId).single();

  const config = settings?.smartbill_config as SmartbillConfig | null;
  if (!config?.enabled || !config.email || !config.token || !config.company_vat_code) {
    return { error: "SmartBill nu este configurat complet." };
  }
  return config;
}

type OrderItem = { name: string; price: number; quantity: number; product_id?: string };
type ShippingAddress = { county?: string; city?: string; address?: string; country?: string };

// SKU-urile produselor comandate (items pastreaza product_id). SmartBill cere cod
// produs pe fiecare linie DOAR la conturile cu "Foloseste cod produs" activ; il
// trimitem cand exista ca emiterea sa nu esueze la acele conturi. Best-effort.
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

// Numele complet al tarii pentru factura (shipping_address.country e cod ISO-2,
// setat doar la comenzile internationale; lipsa = Romania).
function countryNameFor(code: string | undefined): string {
  if (!code?.trim()) return "Romania";
  const c = code.trim();
  if (c.length !== 2) return c;
  try {
    return new Intl.DisplayNames(["ro"], { type: "region" }).of(c.toUpperCase()) ?? c;
  } catch {
    return c;
  }
}

async function buildInvoiceProducts(
  config: SmartbillConfig,
  order: {
    items: unknown;
    shipping_cost: unknown;
    discount_amount: unknown;
    discount_code: string | null;
    card_discount_amount?: unknown;
    cod_discount_amount?: unknown;
    vat_rate: unknown;
  },
  pricesIncludeVat: boolean,
  vatEnabled: boolean,
  storeVatRate: number
): Promise<MerchantInvoiceProduct[]> {
  const items = (order.items as unknown as OrderItem[]) ?? [];
  const skuById = await fetchSkuMap(items);

  // A non-empty tax_name means "I'm a VAT payer". (Empty = facturi fara TVA.)
  const isVatPayer = vatEnabled && !!config.tax_name;
  const orderVat = Number(order.vat_rate) || 0;
  // Old orders placed before VAT was enabled carry vat_rate=0 — fall back to the
  // store's CURRENT VAT rate so a VAT-paying merchant can still invoice them.
  const effectiveVat = isVatPayer ? (orderVat > 0 ? orderVat : storeVatRate) : 0;
  const usingFallback = effectiveVat > 0 && orderVat <= 0;

  // SmartBill needs the exact tax NAME (not a percentage). Keep the configured name
  // if it's valid in the account; otherwise resolve by matching percentage — so the
  // invoice works even if the merchant typed e.g. "21". Best-effort (network).
  let taxName = config.tax_name;
  if (effectiveVat > 0) {
    const taxList = await getMerchantTaxes(config);
    if (!("error" in taxList) && taxList.length > 0) {
      const byName = taxList.find(t => t.name === config.tax_name);
      const byPct = taxList.find(t => Math.abs(t.percentage - effectiveVat) < 0.01);
      taxName = byName?.name ?? byPct?.name ?? config.tax_name;
    }
  }

  const hasTax = effectiveVat > 0 && !!taxName;
  // For a fallback (historical) order the stored prices are the final amounts the
  // customer paid, so VAT is extracted FROM them (tax included) — invoice total
  // stays equal to the order total instead of adding tax on top.
  const taxIncluded = usingFallback ? true : pricesIncludeVat;

  const taxFields = hasTax
    ? { taxName, taxPercentage: effectiveVat }
    : {};

  const products: MerchantInvoiceProduct[] = items.map(item => {
    const sku = item.product_id ? skuById.get(item.product_id) : undefined;
    return {
      name: item.name,
      ...(sku ? { code: sku } : {}),
      measuringUnitName: "buc",
      currency: "RON",
      quantity: item.quantity,
      price: item.price,
      isTaxIncluded: taxIncluded,
      ...taxFields,
    };
  });

  if (Number(order.shipping_cost) > 0) {
    products.push({
      name: "Transport",
      code: "transport",
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: Number(order.shipping_cost),
      isTaxIncluded: taxIncluded,
      isService: true,
      ...taxFields,
    });
  }

  // Liniile de discount poarta aceleasi campuri de TVA ca produsele — altfel, la
  // platitorii de TVA cu preturi cu TVA inclus, SmartBill ar trata valoarea ca
  // neta (isTaxIncluded default false) si totalul facturii n-ar mai bate.
  if (Number(order.discount_amount) > 0) {
    products.push({
      isDiscount: true,
      name: `Discount${order.discount_code ? ` (${order.discount_code})` : ""}`,
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: 0,
      numberOfItems: products.length,
      discountType: 1,
      discountValue: -Math.abs(Number(order.discount_amount)),
      isTaxIncluded: taxIncluded,
      ...taxFields,
    });
  }

  // Reducerea la plata online e scazuta din orders.total la plasarea comenzii —
  // fara linia asta factura ar iesi mai mare decat suma platita de client.
  if (Number(order.card_discount_amount) > 0) {
    products.push({
      isDiscount: true,
      name: "Reducere plata online",
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: 0,
      numberOfItems: products.length,
      discountType: 1,
      discountValue: -Math.abs(Number(order.card_discount_amount)),
      isTaxIncluded: taxIncluded,
      ...taxFields,
    });
  }
  // Reducerea la plata ramburs — aceeasi logica, linie de discount separata.
  if (Number(order.cod_discount_amount) > 0) {
    products.push({
      isDiscount: true,
      name: "Reducere plata ramburs",
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: 0,
      numberOfItems: products.length,
      discountType: 1,
      discountValue: -Math.abs(Number(order.cod_discount_amount)),
      isTaxIncluded: taxIncluded,
      ...taxFields,
    });
  }

  return products;
}

type InvoiceableOrder = {
  order_number: string | number;
  customer_name: string;
  customer_email: string | null;
  customer_phone?: string | null;
  payment_method?: string | null;
  shipping_address: unknown;
  items: unknown;
  shipping_cost: unknown;
  discount_amount: unknown;
  discount_code: string | null;
  card_discount_amount?: unknown;
  cod_discount_amount?: unknown;
  vat_rate: unknown;
};

async function buildInvoiceParams(
  config: SmartbillConfig,
  order: InvoiceableOrder,
  seriesName: string,
  pricesIncludeVat: boolean,
  vatEnabled: boolean,
  storeVatRate: number,
  extraParams?: Partial<MerchantInvoiceParams>
): Promise<MerchantInvoiceParams> {
  const address = order.shipping_address as ShippingAddress | null;
  const products = await buildInvoiceProducts(config, order, pricesIncludeVat, vatEnabled, storeVatRate);
  const today = new Date().toISOString().split("T")[0];

  // Scadenta optionala (zile de la emitere); fara ea SmartBill pune data emiterii.
  const dueDays = Math.floor(Number(config.due_days) || 0);
  const dueDate = dueDays > 0
    ? new Date(Date.now() + dueDays * 24 * 3600 * 1000).toISOString().split("T")[0]
    : undefined;

  const payLabel = PAYMENT_METHOD_DEFAULT_LABELS[order.payment_method as PaymentMethodType]
    ?? (order.payment_method || "");

  return {
    companyVatCode: config.company_vat_code,
    client: {
      name: order.customer_name,
      // Conditii ANAF/e-Factura pentru persoane fizice: CNP valid sau sir de 0
      // (nu colectam CNP la checkout — modulul oficial trimite acelasi fallback);
      // adresa si localitatea sunt obligatorii, "-" e acceptat.
      vatCode: "0000000000000",
      country: countryNameFor(address?.country),
      address: address?.address?.trim() || "-",
      city: address?.city?.trim() || "-",
      county: address?.county ?? undefined,
      email: order.customer_email ?? undefined,
      phone: order.customer_phone ?? undefined,
      isTaxPayer: false,
      saveToDb: false,
    },
    seriesName,
    currency: "RON",
    issueDate: today,
    ...(dueDate ? { dueDate } : {}),
    // Leaga documentul de comanda: mentions apare pe factura, observations doar
    // in rapoartele SmartBill.
    mentions: `Comanda #${order.order_number}${payLabel ? ` - plata: ${payLabel}` : ""}`,
    observations: `Comanda #${order.order_number}`,
    products,
    isDraft: false,
    // Email is sent as a separate, non-blocking step after creation (see
    // trySendDocEmail), so a missing SmartBill email server can't fail invoicing.
    sendEmail: false,
    ...extraParams,
  };
}

// Incasare la emitere: factura iese direct incasata cand comanda a fost platita
// online cu cardul (opt-in per merchant). Tipul "Card online" e cel folosit de
// modulul WooCommerce oficial. Nu se aplica proformelor.
function paymentAtIssue(
  config: SmartbillConfig,
  order: { payment_method?: string | null; payment_status?: string | null; total?: unknown }
): Pick<MerchantInvoiceParams, "payment"> | Record<string, never> {
  if (!config.mark_paid_online) return {};
  if (order.payment_status !== "paid") return {};
  if (!isCardPaymentMethod(order.payment_method)) return {};
  const value = Number(order.total);
  if (!Number.isFinite(value) || value <= 0) return {};
  return { payment: { value, type: "Card online", isCash: false } };
}

async function getStoreVatSettings(businessId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_settings")
    .select("prices_include_vat, vat_enabled, vat_rate")
    .eq("business_id", businessId)
    .single();
  return {
    pricesIncludeVat: data?.prices_include_vat ?? false,
    vatEnabled: data?.vat_enabled ?? false,
    vatRate: Number(data?.vat_rate ?? 0),
  };
}

// Best-effort document email. SmartBill sends the PDF using the merchant's OWN
// email server; if that's not configured it fails — but the document is already
// created, so we never block on it. Returns a warning string the UI can surface.
async function trySendDocEmail(
  config: SmartbillConfig,
  customerEmail: string | null,
  type: "invoice" | "estimate",
  seriesName: string,
  number: string,
): Promise<string | null> {
  if (!config.send_email || !customerEmail) return null;
  const label = type === "invoice" ? "Factura" : "Proforma";
  try {
    const res = await sendMerchantDocumentEmail(config, {
      companyVatCode: config.company_vat_code,
      type, seriesName, number, to: customerEmail,
    });
    if ("error" in res) {
      return `${label} a fost generata, dar emailul catre client nu a putut fi trimis: ${res.error}. Configureaza serverul de email in SmartBill sau opreste trimiterea pe email din integrare.`;
    }
    return null;
  } catch {
    return `${label} a fost generata, dar emailul catre client nu a putut fi trimis.`;
  }
}

// ─── Public actions ────────────────────────────────────────────────────────

export async function testSmartbillConnection(
  businessId: string
): Promise<{ series: { name: string; type: string; nextNumber?: string }[]; taxes: string[] } | { error: string }> {
  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const [seriesResult, taxResult] = await Promise.all([
    getMerchantSeries(config),
    getMerchantTaxes(config),
  ]);

  if ("error" in seriesResult) return seriesResult;

  return {
    series: seriesResult,
    taxes: "error" in taxResult ? [] : taxResult.map(t => `${t.name} (${t.percentage}%)`),
  };
}

// Fetch the VAT rates defined in the merchant's SmartBill account, so the config
// UI can offer them as a dropdown (the taxName sent to SmartBill must match one of
// these names exactly). Works while still configuring (no `enabled` gate).
export async function getSmartbillTaxes(
  businessId: string
): Promise<{ taxes: { name: string; percentage: number }[] } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const { data: settings } = await supabase
    .from("store_settings").select("smartbill_config").eq("business_id", businessId).single();
  const config = settings?.smartbill_config as SmartbillConfig | null;
  if (!config?.email || !config.token || !config.company_vat_code) {
    return { error: "Completeaza email, token si CUI, apoi salveaza." };
  }

  const res = await getMerchantTaxes(config);
  if ("error" in res) return res;
  return { taxes: res };
}

export async function generateOrderInvoice(
  businessId: string,
  orderId: string
): Promise<{ number: string; series: string; emailWarning?: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda nu a fost gasita." };
  if (order.smartbill_invoice_number) return { error: "Factura a fost deja generata pentru aceasta comanda." };

  const { pricesIncludeVat, vatEnabled, vatRate } = await getStoreVatSettings(businessId);
  const params = await buildInvoiceParams(
    config, order, config.series_name, pricesIncludeVat, vatEnabled, vatRate,
    paymentAtIssue(config, order),
  );
  const result = await createMerchantInvoice(config, params);
  if ("error" in result) return result;

  await supabase.from("orders").update({
    smartbill_invoice_number: result.number,
    smartbill_invoice_series: result.series,
    smartbill_invoice_url: result.documentUrl ?? null,
  }).eq("id", orderId);

  const emailWarning = await trySendDocEmail(config, order.customer_email, "invoice", result.series, result.number);
  return { number: result.number, series: result.series, ...(emailWarning ? { emailWarning } : {}) };
}

export async function generateOrderEstimate(
  businessId: string,
  orderId: string
): Promise<{ number: string; series: string; emailWarning?: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;
  if (!config.estimate_series_name?.trim()) {
    return { error: "Seria pentru proforma nu este configurata. Adaug-o in setarile SmartBill." };
  }

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda nu a fost gasita." };
  if (order.smartbill_estimate_number) return { error: "Proforma a fost deja generata pentru aceasta comanda." };

  const { pricesIncludeVat, vatEnabled, vatRate } = await getStoreVatSettings(businessId);
  const params = await buildInvoiceParams(config, order, config.estimate_series_name, pricesIncludeVat, vatEnabled, vatRate);
  const result = await createMerchantEstimate(config, params);
  if ("error" in result) return result;

  await supabase.from("orders").update({
    smartbill_estimate_number: result.number,
    smartbill_estimate_series: result.series,
    smartbill_estimate_url: result.documentUrl ?? null,
  }).eq("id", orderId);

  const emailWarning = await trySendDocEmail(config, order.customer_email, "estimate", result.series, result.number);
  return { number: result.number, series: result.series, ...(emailWarning ? { emailWarning } : {}) };
}

export async function convertEstimateToInvoice(
  businessId: string,
  orderId: string
): Promise<{ number: string; series: string; emailWarning?: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda nu a fost gasita." };
  if (!order.smartbill_estimate_number || !order.smartbill_estimate_series) {
    return { error: "Nu exista proforma pentru aceasta comanda." };
  }
  if (order.smartbill_invoice_number) return { error: "Factura a fost deja generata." };

  const estimateRef = {
    seriesName: order.smartbill_estimate_series as string,
    number: order.smartbill_estimate_number as string,
  };

  // Proforma poate fi facturata si manual, din SmartBill Cloud — daca s-a
  // intamplat, adoptam factura existenta in loc sa emitem una dubla.
  const status = await getEstimateInvoices(config, {
    cif: config.company_vat_code,
    seriesName: estimateRef.seriesName,
    number: estimateRef.number,
  });
  if (!("error" in status) && status.invoiced) {
    const existing = status.invoices[0];
    if (!existing) {
      return { error: "Proforma a fost deja facturata in SmartBill (factura e inca ciorna). Finalizeaz-o din contul SmartBill." };
    }
    await supabase.from("orders").update({
      smartbill_invoice_number: existing.number,
      smartbill_invoice_series: existing.series,
    }).eq("id", orderId);
    return { number: existing.number, series: existing.series };
  }

  // La emiterea pe baza de proforma, exemplul oficial trimite DOAR referinta
  // proformei — clientul si produsele se preiau din ea; nu le retrimitem.
  const params: MerchantInvoiceParams = {
    companyVatCode: config.company_vat_code,
    seriesName: config.series_name,
    issueDate: new Date().toISOString().split("T")[0],
    isDraft: false,
    sendEmail: false,
    useEstimateDetails: true,
    estimate: estimateRef,
    ...paymentAtIssue(config, order),
  };

  const result = await createMerchantInvoice(config, params);
  if ("error" in result) return result;

  await supabase.from("orders").update({
    smartbill_invoice_number: result.number,
    smartbill_invoice_series: result.series,
    smartbill_invoice_url: result.documentUrl ?? null,
  }).eq("id", orderId);

  const emailWarning = await trySendDocEmail(config, order.customer_email, "invoice", result.series, result.number);
  return { number: result.number, series: result.series, ...(emailWarning ? { emailWarning } : {}) };
}

export async function stornoOrderInvoice(
  businessId: string,
  orderId: string
): Promise<{ stornoNumber?: string; stornoSeries?: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda nu a fost gasita." };
  if (!order.smartbill_invoice_number || !order.smartbill_invoice_series) {
    return { error: "Nu exista factura pentru aceasta comanda." };
  }
  if (order.smartbill_storno_number) return { error: "Factura a fost deja stornata." };

  // Stornare reala (POST /invoice/reverse) — nu anulare. Daca SmartBill nu
  // returneaza numarul stornoului (exemplul oficial il are gol), pastram
  // referinta facturii originale ca marcaj "stornata".
  const result = await reverseMerchantInvoice(config, {
    cif: config.company_vat_code,
    seriesName: order.smartbill_invoice_series as string,
    number: order.smartbill_invoice_number as string,
  });

  if ("error" in result) return result;

  await supabase.from("orders").update({
    smartbill_storno_number: result.stornoNumber ?? order.smartbill_invoice_number,
    smartbill_storno_series: result.stornoSeries ?? order.smartbill_invoice_series,
  }).eq("id", orderId);

  return {
    stornoNumber: result.stornoNumber,
    stornoSeries: result.stornoSeries,
  };
}

export async function resendSmartbillEmail(
  businessId: string,
  orderId: string,
  toEmail: string,
  docType: "invoice" | "estimate"
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda nu a fost gasita." };

  let seriesName: string;
  let number: string;

  if (docType === "invoice") {
    if (!order.smartbill_invoice_number || !order.smartbill_invoice_series) {
      return { error: "Nu exista factura pentru aceasta comanda." };
    }
    seriesName = order.smartbill_invoice_series as string;
    number = order.smartbill_invoice_number as string;
  } else {
    if (!order.smartbill_estimate_number || !order.smartbill_estimate_series) {
      return { error: "Nu exista proforma pentru aceasta comanda." };
    }
    seriesName = order.smartbill_estimate_series as string;
    number = order.smartbill_estimate_number as string;
  }

  return sendMerchantDocumentEmail(config, {
    companyVatCode: config.company_vat_code,
    type: docType,
    seriesName,
    number,
    to: toEmail.trim(),
  });
}

// ─── Auto-invoice (called internally from order.actions.ts) ────────────────

export async function maybeAutoGenerateInvoice(
  businessId: string,
  orderId: string,
  newStatus: string,
  newPaymentStatus: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: settings } = await supabase
      .from("store_settings").select("smartbill_config").eq("business_id", businessId).single();

    const config = settings?.smartbill_config as SmartbillConfig | null;
    if (!config?.enabled || !config.auto_invoice) return false;
    if (!config.email || !config.token || !config.company_vat_code || !config.series_name) return false;

    if (!autoInvoiceTriggerMatches(config.auto_invoice_trigger, newStatus, newPaymentStatus)) return false;

    // Check order doesn't already have invoice
    const { data: order } = await supabase
      .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
    if (!order || order.smartbill_invoice_number) return false;

    const { data: storeSettings } = await supabase
      .from("store_settings").select("prices_include_vat, vat_enabled, vat_rate").eq("business_id", businessId).single();

    const pricesIncludeVat = storeSettings?.prices_include_vat ?? false;
    const vatEnabled = storeSettings?.vat_enabled ?? false;
    const vatRate = Number(storeSettings?.vat_rate ?? 0);

    const params = await buildInvoiceParams(
      config, order, config.series_name, pricesIncludeVat, vatEnabled, vatRate,
      paymentAtIssue(config, order),
    );
    const result = await createMerchantInvoice(config, params);
    if ("error" in result) return false;

    await supabase.from("orders").update({
      smartbill_invoice_number: result.number,
      smartbill_invoice_series: result.series,
      smartbill_invoice_url: result.documentUrl ?? null,
    }).eq("id", orderId);
    // Best-effort email — never affects the already-created invoice.
    await trySendDocEmail(config, order.customer_email, "invoice", result.series, result.number);
    return true;
  } catch {
    // Fire-and-forget: never throw, never block order update
    return false;
  }
}
