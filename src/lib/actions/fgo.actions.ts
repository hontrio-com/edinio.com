"use server";

import { createClient } from "@/lib/supabase/server";
import { clientFacturare, eSistem, type SistemClient } from "@/lib/invoicing-context";
import { logError } from "@/lib/error-logger";
import { invoiceParty } from "@/lib/billing/invoice-party";
import { invoiceVat } from "@/lib/billing/invoice-vat";
import { codSiNatura } from "@/lib/billing/invoice-lines";
import { fetchSkuMap, type SursaCoduri } from "@/lib/billing/sku-map";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

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
  },
  vatEnabled: boolean,
  vatRate: number,
  pricesIncludeVat: boolean,
): Promise<FgoLineItem[]> {
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
  const toNet = (gross: number) =>
    vat.taxIncluded && vat.rate > 0 ? gross / (1 + vat.rate / 100) : gross;

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
    return !("error" in result);
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

  const orderData = order as typeof order & { fgo_invoice_number?: string | null };
  if (orderData.fgo_invoice_number) return { error: "Factura fGO a fost deja generata" };

  try {
    const addr = order.shipping_address as ShippingAddress | null;
    const items = await buildItems({ supabase, businessId }, order, vatEnabled, vatRate, pricesIncludeVat);

    const dueDays = Math.floor(Number(config.due_days) || 0);
    const dueDate = dueDays > 0
      ? new Date(Date.now() + dueDays * 24 * 3600 * 1000).toISOString().split("T")[0]
      : undefined;

    // fGO avea de la inceput `tip` si `codUnic` in tip; doar nu i se trimitea
    // nimic pe ele.
    const parte = invoiceParty(order, { ...addr, address: addr?.address ?? addr?.street ?? null });

    const result = await createFgoInvoice(
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
