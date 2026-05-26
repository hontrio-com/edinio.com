"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getMerchantSeries,
  getMerchantTaxes,
  createMerchantInvoice,
  createMerchantEstimate,
  cancelMerchantInvoice,
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

type OrderItem = { name: string; price: number; quantity: number };
type ShippingAddress = { county?: string; city?: string; address?: string };

async function buildInvoiceProducts(
  config: SmartbillConfig,
  order: {
    items: unknown;
    shipping_cost: unknown;
    discount_amount: unknown;
    discount_code: string | null;
    vat_rate: unknown;
  },
  pricesIncludeVat: boolean,
  vatEnabled: boolean
): Promise<MerchantInvoiceProduct[]> {
  const items = (order.items as unknown as OrderItem[]) ?? [];
  const hasTax = vatEnabled && !!config.tax_name && Number(order.vat_rate) > 0;

  const taxFields = hasTax
    ? { taxName: config.tax_name, taxPercentage: Number(order.vat_rate) }
    : {};

  const products: MerchantInvoiceProduct[] = items.map(item => ({
    name: item.name,
    measuringUnitName: "buc",
    currency: "RON",
    quantity: item.quantity,
    price: item.price,
    isTaxIncluded: pricesIncludeVat,
    ...taxFields,
  }));

  if (Number(order.shipping_cost) > 0) {
    products.push({
      name: "Transport",
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: Number(order.shipping_cost),
      isTaxIncluded: pricesIncludeVat,
      ...taxFields,
    });
  }

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
    });
  }

  return products;
}

async function buildInvoiceParams(
  config: SmartbillConfig,
  order: {
    customer_name: string;
    customer_email: string | null;
    shipping_address: unknown;
    items: unknown;
    shipping_cost: unknown;
    discount_amount: unknown;
    discount_code: string | null;
    vat_rate: unknown;
  },
  seriesName: string,
  pricesIncludeVat: boolean,
  vatEnabled: boolean,
  extraParams?: Partial<MerchantInvoiceParams>
): Promise<MerchantInvoiceParams> {
  const address = order.shipping_address as ShippingAddress | null;
  const products = await buildInvoiceProducts(config, order, pricesIncludeVat, vatEnabled);
  const today = new Date().toISOString().split("T")[0];
  const shouldSendEmail = config.send_email && !!order.customer_email;

  return {
    companyVatCode: config.company_vat_code,
    client: {
      name: order.customer_name,
      country: "Romania",
      address: address?.address ?? undefined,
      city: address?.city ?? undefined,
      county: address?.county ?? undefined,
      email: order.customer_email ?? undefined,
      isTaxPayer: false,
      saveToDb: false,
    },
    seriesName,
    currency: "RON",
    issueDate: today,
    products,
    isDraft: false,
    sendEmail: shouldSendEmail,
    ...(shouldSendEmail && order.customer_email
      ? { email: { to: order.customer_email } }
      : {}),
    ...extraParams,
  };
}

async function getStoreVatSettings(businessId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_settings")
    .select("prices_include_vat, vat_enabled")
    .eq("business_id", businessId)
    .single();
  return {
    pricesIncludeVat: data?.prices_include_vat ?? false,
    vatEnabled: data?.vat_enabled ?? false,
  };
}

// ─── Public actions ────────────────────────────────────────────────────────

export async function testSmartbillConnection(
  businessId: string
): Promise<{ series: string[]; taxes: string[] } | { error: string }> {
  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const [seriesResult, taxResult] = await Promise.all([
    getMerchantSeries(config),
    getMerchantTaxes(config),
  ]);

  if ("error" in seriesResult) return seriesResult;

  return {
    series: seriesResult.map(s => s.name),
    taxes: "error" in taxResult ? [] : taxResult.map(t => `${t.name} (${t.percentage}%)`),
  };
}

export async function generateOrderInvoice(
  businessId: string,
  orderId: string
): Promise<{ number: string; series: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda nu a fost gasita." };
  if (order.smartbill_invoice_number) return { error: "Factura a fost deja generata pentru aceasta comanda." };

  const { pricesIncludeVat, vatEnabled } = await getStoreVatSettings(businessId);
  const params = await buildInvoiceParams(config, order, config.series_name, pricesIncludeVat, vatEnabled);
  const result = await createMerchantInvoice(config, params);
  if ("error" in result) return result;

  await supabase.from("orders").update({
    smartbill_invoice_number: result.number,
    smartbill_invoice_series: result.series,
  }).eq("id", orderId);

  return { number: result.number, series: result.series };
}

export async function generateOrderEstimate(
  businessId: string,
  orderId: string
): Promise<{ number: string; series: string } | { error: string }> {
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

  const { pricesIncludeVat, vatEnabled } = await getStoreVatSettings(businessId);
  const params = await buildInvoiceParams(config, order, config.estimate_series_name, pricesIncludeVat, vatEnabled);
  const result = await createMerchantEstimate(config, params);
  if ("error" in result) return result;

  await supabase.from("orders").update({
    smartbill_estimate_number: result.number,
    smartbill_estimate_series: result.series,
  }).eq("id", orderId);

  return { number: result.number, series: result.series };
}

export async function convertEstimateToInvoice(
  businessId: string,
  orderId: string
): Promise<{ number: string; series: string } | { error: string }> {
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

  const { pricesIncludeVat, vatEnabled } = await getStoreVatSettings(businessId);
  const params = await buildInvoiceParams(config, order, config.series_name, pricesIncludeVat, vatEnabled, {
    useEstimateDetails: true,
    estimate: {
      seriesName: order.smartbill_estimate_series as string,
      number: order.smartbill_estimate_number as string,
    },
  });

  const result = await createMerchantInvoice(config, params);
  if ("error" in result) return result;

  await supabase.from("orders").update({
    smartbill_invoice_number: result.number,
    smartbill_invoice_series: result.series,
  }).eq("id", orderId);

  return { number: result.number, series: result.series };
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

  const result = await cancelMerchantInvoice(config, {
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
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: settings } = await supabase
      .from("store_settings").select("smartbill_config").eq("business_id", businessId).single();

    const config = settings?.smartbill_config as SmartbillConfig | null;
    if (!config?.enabled || !config.auto_invoice) return;
    if (!config.email || !config.token || !config.company_vat_code || !config.series_name) return;

    const trigger = config.auto_invoice_trigger;
    const statusMatches = trigger !== "paid" && newStatus === trigger;
    const paymentMatches = trigger === "paid" && newPaymentStatus === "paid";
    if (!statusMatches && !paymentMatches) return;

    // Check order doesn't already have invoice
    const { data: order } = await supabase
      .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
    if (!order || order.smartbill_invoice_number) return;

    const { data: storeSettings } = await supabase
      .from("store_settings").select("prices_include_vat, vat_enabled").eq("business_id", businessId).single();

    const pricesIncludeVat = storeSettings?.prices_include_vat ?? false;
    const vatEnabled = storeSettings?.vat_enabled ?? false;

    const params = await buildInvoiceParams(config, order, config.series_name, pricesIncludeVat, vatEnabled);
    const result = await createMerchantInvoice(config, params);
    if ("error" in result) return;

    await supabase.from("orders").update({
      smartbill_invoice_number: result.number,
      smartbill_invoice_series: result.series,
    }).eq("id", orderId);
  } catch {
    // Fire-and-forget: never throw, never block order update
  }
}
