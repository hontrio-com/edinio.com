"use server";

import { createClient } from "@/lib/supabase/server";
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

type OrderItem = { name: string; price: number; quantity: number };
type ShippingAddress = {
  county?: string;
  city?: string;
  address?: string;
  street?: string;
};

async function getConfigAndOrder(businessId: string, orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" as const };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" as const };

  const [{ data: settings }, { data: order }] = await Promise.all([
    supabase.from("store_settings")
      .select("fgo_config, vat_enabled, vat_rate, prices_include_vat")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.fgo_config as FgoConfig | null;
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

function buildItems(
  order: {
    items: unknown;
    shipping_cost: unknown;
    discount_amount: unknown;
    discount_code: string | null;
    total: unknown;
    subtotal: unknown;
  },
  vatEnabled: boolean,
  vatRate: number,
  pricesIncludeVat: boolean,
): FgoLineItem[] {
  const items = (order.items as OrderItem[]) ?? [];
  const effectiveVat = vatEnabled ? vatRate : 0;

  const lineItems: FgoLineItem[] = items.map(item => {
    // fGO expects unit price WITHOUT VAT in PretUnitar
    const unitPrice = pricesIncludeVat && vatEnabled
      ? item.price / (1 + vatRate / 100)
      : item.price;
    return {
      name: item.name,
      quantity: item.quantity,
      unitPrice,
      vatRate: effectiveVat,
      unit: "BUC",
    };
  });

  const shippingCost = Number(order.shipping_cost);
  if (shippingCost > 0) {
    const unitPrice = pricesIncludeVat && vatEnabled
      ? shippingCost / (1 + vatRate / 100)
      : shippingCost;
    lineItems.push({
      name: "Transport",
      quantity: 1,
      unitPrice,
      vatRate: effectiveVat,
      unit: "BUC",
    });
  }

  const discountAmount = Number(order.discount_amount);
  if (discountAmount > 0) {
    // Discount as negative line item
    const unitPrice = pricesIncludeVat && vatEnabled
      ? discountAmount / (1 + vatRate / 100)
      : discountAmount;
    lineItems.push({
      name: `Discount${order.discount_code ? ` (${order.discount_code})` : ""}`,
      quantity: 1,
      unitPrice: -unitPrice,
      vatRate: effectiveVat,
      unit: "BUC",
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

  const { error } = await supabase.from("store_settings").update({
    fgo_config: config as unknown as import("@/types/database.types").Json,
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

export async function generateFgoInvoice(
  businessId: string,
  orderId: string,
): Promise<{ number: string; series: string; link: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order, vatEnabled, vatRate, pricesIncludeVat } = ctx;

  const orderData = order as typeof order & { fgo_invoice_number?: string | null };
  if (orderData.fgo_invoice_number) return { error: "Factura fGO a fost deja generata" };

  try {
    const addr = order.shipping_address as ShippingAddress | null;
    const items = buildItems(order, vatEnabled, vatRate, pricesIncludeVat);

    const result = await createFgoInvoice(
      config,
      order.customer_name,
      {
        tara: "Romania",
        judet: addr?.county ?? undefined,
        localitate: addr?.city ?? undefined,
        adresa: addr?.address ?? addr?.street ?? undefined,
        email: order.customer_email ?? undefined,
        telefon: order.customer_phone,
        tip: "PF",
      },
      items,
    );

    await supabase.from("orders").update({
      fgo_invoice_number: result.Numar,
      fgo_invoice_series: result.Serie,
      fgo_invoice_link: result.Link,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

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

  try {
    const result = await stornoFgoInvoice(config, orderData.fgo_invoice_number, orderData.fgo_invoice_series);

    await supabase.from("orders").update({
      fgo_storno_number: result.Numar,
      fgo_storno_series: result.Serie,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    return { number: result.Numar, series: result.Serie };
  } catch (e) {
    return { error: (e as Error).message };
  }
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
  };

  if (!orderData.fgo_invoice_number || !orderData.fgo_invoice_series) {
    return { error: "Nu exista factura fGO pentru aceasta comanda" };
  }

  try {
    await cancelFgoInvoice(config, orderData.fgo_invoice_number, orderData.fgo_invoice_series);

    await supabase.from("orders").update({
      fgo_invoice_number: null,
      fgo_invoice_series: null,
      fgo_invoice_link: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

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
