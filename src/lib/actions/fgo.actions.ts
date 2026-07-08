"use server";

import { createClient } from "@/lib/supabase/server";
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

// SKU-urile produselor comandate → CodArticol pe liniile facturii fGO.
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

async function buildItems(
  order: {
    items: unknown;
    shipping_cost: unknown;
    discount_amount: unknown;
    discount_code: string | null;
    card_discount_amount?: unknown;
    total: unknown;
    subtotal: unknown;
  },
  vatEnabled: boolean,
  vatRate: number,
  pricesIncludeVat: boolean,
): Promise<FgoLineItem[]> {
  const items = (order.items as OrderItem[]) ?? [];
  const skuById = await fetchSkuMap(items);
  const effectiveVat = vatEnabled ? vatRate : 0;

  // fGO cere PretUnitar FARA TVA; daca preturile includ TVA, extragem netul.
  const toNet = (gross: number) =>
    pricesIncludeVat && vatEnabled ? gross / (1 + vatRate / 100) : gross;

  const lineItems: FgoLineItem[] = items.map(item => {
    const sku = item.product_id ? skuById.get(item.product_id) : undefined;
    return {
      name: item.name,
      quantity: item.quantity,
      unitPrice: toNet(item.price),
      vatRate: effectiveVat,
      unit: "BUC",
      ...(sku ? { code: sku } : {}),
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
      .from("store_settings").select("fgo_config").eq("business_id", businessId).single();
    const config = settings?.fgo_config as FgoConfig | null;
    if (!config?.enabled || !config.auto_invoice) return false;
    if (!autoInvoiceTriggerMatches(config.auto_invoice_trigger, newStatus, newPaymentStatus)) return false;

    const result = await generateFgoInvoice(businessId, orderId);
    return !("error" in result);
  } catch {
    return false;
  }
}

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
    const items = await buildItems(order, vatEnabled, vatRate, pricesIncludeVat);

    const dueDays = Math.floor(Number(config.due_days) || 0);
    const dueDate = dueDays > 0
      ? new Date(Date.now() + dueDays * 24 * 3600 * 1000).toISOString().split("T")[0]
      : undefined;

    const result = await createFgoInvoice(
      config,
      order.customer_name,
      {
        judet: addr?.county ?? undefined,
        localitate: addr?.city ?? undefined,
        adresa: addr?.address ?? addr?.street ?? undefined,
        email: order.customer_email ?? undefined,
        telefon: order.customer_phone,
        tip: "PF",
      },
      items,
      { dueDate, idExtern: order.order_number ? String(order.order_number) : undefined },
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
