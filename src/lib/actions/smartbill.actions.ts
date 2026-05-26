"use server";

import { createClient } from "@/lib/supabase/server";
import {
  getMerchantSeries,
  getMerchantTaxes,
  createMerchantInvoice,
  type SmartbillConfig,
  type MerchantInvoiceProduct,
} from "@/lib/smartbill";

async function getConfig(businessId: string): Promise<SmartbillConfig | { error: string }> {
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

export async function testSmartbillConnection(
  businessId: string
): Promise<{ series: string[]; taxes: string[] } | { error: string }> {
  const config = await getConfig(businessId);
  if ("error" in config) return config;

  const [seriesResult, taxResult] = await Promise.all([
    getMerchantSeries(config),
    getMerchantTaxes(config),
  ]);

  if ("error" in seriesResult) return seriesResult;

  const series = seriesResult.map(s => s.name);
  const taxes = "error" in taxResult ? [] : taxResult.map(t => `${t.name} (${t.percentage}%)`);

  return { series, taxes };
}

export async function generateOrderInvoice(
  businessId: string,
  orderId: string
): Promise<{ number: string; series: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfig(businessId);
  if ("error" in config) return config;

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .single();

  if (!order) return { error: "Comanda nu a fost gasita." };

  if (order.smartbill_invoice_number) {
    return { error: "Factura a fost deja generata pentru aceasta comanda." };
  }

  const { data: settings } = await supabase
    .from("store_settings")
    .select("prices_include_vat, vat_enabled, vat_rate")
    .eq("business_id", businessId)
    .single();

  const pricesIncludeVat = settings?.prices_include_vat ?? false;
  const vatEnabled = settings?.vat_enabled ?? false;

  type OrderItem = { name: string; price: number; quantity: number };
  const items = (order.items as unknown as OrderItem[]) ?? [];
  const address = order.shipping_address as { county?: string; city?: string; address?: string } | null;

  const today = new Date().toISOString().split("T")[0];

  const hasTax = vatEnabled && !!config.tax_name && Number(order.vat_rate) > 0;

  const products: MerchantInvoiceProduct[] = items.map(item => ({
    name: item.name,
    measuringUnitName: "buc",
    currency: "RON",
    quantity: item.quantity,
    price: item.price,
    isTaxIncluded: pricesIncludeVat,
    ...(hasTax ? { taxName: config.tax_name, taxPercentage: Number(order.vat_rate) } : {}),
  }));

  if (Number(order.shipping_cost) > 0) {
    products.push({
      name: "Transport",
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: Number(order.shipping_cost),
      isTaxIncluded: pricesIncludeVat,
      ...(hasTax ? { taxName: config.tax_name, taxPercentage: Number(order.vat_rate) } : {}),
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

  const shouldSendEmail = config.send_email && !!order.customer_email;

  const result = await createMerchantInvoice(config, {
    companyVatCode: config.company_vat_code,
    client: {
      name: order.customer_name,
      address: address?.address ?? undefined,
      city: address?.city ?? undefined,
      county: address?.county ?? undefined,
      email: order.customer_email ?? undefined,
      isTaxPayer: false,
      saveToDb: false,
    },
    seriesName: config.series_name,
    currency: "RON",
    issueDate: today,
    products,
    isDraft: false,
    sendEmail: shouldSendEmail,
    ...(shouldSendEmail && order.customer_email
      ? { email: { to: order.customer_email } }
      : {}),
  });

  if ("error" in result) return result;

  await supabase
    .from("orders")
    .update({
      smartbill_invoice_number: result.number,
      smartbill_invoice_series: result.series,
    })
    .eq("id", orderId);

  return { number: result.number, series: result.series };
}
