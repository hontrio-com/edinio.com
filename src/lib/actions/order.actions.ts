"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseNotificationsConfig, sendNewOrderEmail, sendOrderConfirmationToCustomer, sendOrderStatusToCustomer, sendCustomerMessage } from "@/lib/email";
import { logError } from "@/lib/error-logger";
import { validateDiscount } from "@/lib/actions/discount.actions";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ── Server-authoritative pricing ─────────────────────────────────────────────
// Customers are anonymous and prices arrive from the browser; they must NEVER be
// trusted. We reload the product and recompute every legitimate price from the
// product's own configuration, then match the submitted amount against it.

type OrderProduct = {
  id: string;
  price: number;
  is_active: boolean;
  business_id: string;
  page_sections: unknown;
};

// All legitimate per-unit prices: base price + every enabled variant combination.
function legitUnitPrices(product: OrderProduct): number[] {
  const set = new Set<number>([round2(product.price)]);
  const ps = (product.page_sections ?? {}) as {
    variants?: { enabled?: boolean; combinations?: Array<{ enabled?: boolean; price?: number | null }> };
  };
  if (ps.variants?.enabled && Array.isArray(ps.variants.combinations)) {
    for (const c of ps.variants.combinations) {
      if (c?.enabled && c.price != null) set.add(round2(Number(c.price)));
    }
  }
  return [...set];
}

// Legitimate bundle totals for a given unit price and quantity (mirrors ProductPage
// quantity-tier math: plain qty*unit is always valid; tiers 2/3 add bundle prices).
function legitBundleTotals(product: OrderProduct, unit: number, quantity: number): number[] {
  const totals = [round2(unit * quantity)];
  const ps = (product.page_sections ?? {}) as {
    quantity_tiers?: { enabled?: boolean; mode?: string; tier2_price?: number; tier3_price?: number; tier2_percent?: number; tier3_percent?: number };
  };
  const t = ps.quantity_tiers;
  if (t?.enabled) {
    const isPercent = t.mode === "percent";
    if (quantity === 2) {
      const p = isPercent ? unit * 2 * (1 - (t.tier2_percent ?? 0) / 100) : Number(t.tier2_price ?? 0);
      if (p > 0) totals.push(round2(p));
    } else if (quantity === 3) {
      const p = isPercent ? unit * 3 * (1 - (t.tier3_percent ?? 0) / 100) : Number(t.tier3_price ?? 0);
      if (p > 0) totals.push(round2(p));
    }
  }
  return totals;
}

// Returns the authoritative pre-discount subtotal, or null if the claimed unit
// price cannot be reconciled with any legitimate configuration.
function authoritativeSubtotal(product: OrderProduct, claimedUnit: number, quantity: number): number | null {
  if (!Number.isFinite(claimedUnit) || quantity < 1) return null;
  const claimed = round2(claimedUnit * quantity);
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const unit of legitUnitPrices(product)) {
    for (const candidate of legitBundleTotals(product, unit, quantity)) {
      const d = Math.abs(candidate - claimed);
      if (d < bestDiff) { bestDiff = d; best = candidate; }
    }
  }
  // Tolerance absorbs rounding only; real tampering is orders of magnitude away.
  return best !== null && bestDiff <= 0.5 ? best : null;
}

type CheckoutExtra = { id: string; label: string; price: number };

// Load and validate the store-defined checkout extras (server-authoritative prices).
function validateExtras(
  pageContent: unknown,
  clientExtras: { id: string; label: string; price: number }[] | undefined,
): CheckoutExtra[] {
  const serverExtras = ((pageContent as { checkout_config?: { extras?: CheckoutExtra[] } } | null)?.checkout_config?.extras) ?? [];
  const byId = new Map(serverExtras.map((e) => [e.id, e]));
  return (clientExtras ?? [])
    .map((e) => byId.get(e.id))
    .filter((e): e is CheckoutExtra => !!e)
    .map((e) => ({ id: e.id, label: e.label, price: round2(Number(e.price)) }));
}

async function buildOrderNumber(supabase: SupabaseClient, businessId: string): Promise<string> {
  const { data: settings } = await supabase
    .from("store_settings")
    .select("order_number_format")
    .eq("business_id", businessId)
    .single();

  if (settings?.order_number_format === "sequential") {
    const { data: counter } = await supabase.rpc("next_order_number", { p_business_id: businessId });
    const n = (counter as number) ?? 1;
    return `#${String(n).padStart(4, "0")}`;
  }

  return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export async function placeOrder(data: {
  business_id: string;
  product_id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  shipping_cost: number;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_county: string;
  customer_city: string;
  customer_address: string;
  discount_id?: string;
  discount_code?: string;
  discount_amount?: number;
  extras?: { id: string; label: string; price: number }[];
  custom_fields?: Record<string, string>;
  customization?: Record<string, { type: string; label: string; value: string | string[] }>;
  payment_method?: string;
  selected_courier?: string;
  courier_label?: string;
  delivery_type?: string;
  locker_id?: string;
  locker_name?: string;
}) {
  // Use admin client for order creation — customers are anonymous, RLS requires service role
  const admin = createAdminClient();

  // Reload product + store config and recompute every price server-side.
  const [{ data: product }, { data: cfgRow }] = await Promise.all([
    admin.from("products")
      .select("id, price, is_active, business_id, page_sections")
      .eq("id", data.product_id)
      .eq("business_id", data.business_id)
      .single(),
    admin.from("store_settings")
      .select("page_content, free_shipping_threshold, min_order_amount")
      .eq("business_id", data.business_id)
      .single(),
  ]);

  if (!product || !product.is_active) {
    return { error: "Produsul nu mai este disponibil. Reincarca pagina." };
  }

  const subtotal = authoritativeSubtotal(product as OrderProduct, data.product_price, data.quantity);
  if (subtotal === null) {
    logError({ action: "placeOrder.priceRejected", message: "Client price did not match any legitimate configuration", details: { businessId: data.business_id, productId: data.product_id, claimedUnit: data.product_price, quantity: data.quantity }, severity: "warning" });
    return { error: "Pretul comenzii nu este valid. Reincarca pagina si incearca din nou." };
  }

  // Enforce the merchant's minimum order value (Setari > Livrare) against the authoritative subtotal.
  const minOrder = cfgRow?.min_order_amount != null ? Number(cfgRow.min_order_amount) : null;
  if (minOrder !== null && subtotal < minOrder) {
    return { error: `Comanda minima este de ${minOrder} lei. Mai adauga produse pentru a finaliza comanda.` };
  }

  const validatedExtras = validateExtras(cfgRow?.page_content, data.extras);
  const extrasTotal = validatedExtras.reduce((s, e) => s + e.price, 0);

  // Re-validate the discount server-side against the authoritative subtotal.
  let discountAmount = 0;
  let validDiscountId: string | undefined;
  let isFreeShipping = false;
  if (data.discount_code) {
    const dres = await validateDiscount(data.discount_code, data.business_id, subtotal);
    if (dres.valid) {
      discountAmount = Math.min(dres.discount.discountAmount, subtotal);
      validDiscountId = dres.discount.id;
      isFreeShipping = dres.discount.type === "free_shipping";
    }
  }

  // Shipping clamped non-negative; zeroed when free-shipping rules apply.
  const freeThreshold = cfgRow?.free_shipping_threshold != null ? Number(cfgRow.free_shipping_threshold) : null;
  let shipping = Math.max(0, round2(data.shipping_cost));
  if (isFreeShipping || (freeThreshold !== null && subtotal >= freeThreshold)) shipping = 0;

  const total = Math.max(0, round2(subtotal + extrasTotal - discountAmount + shipping));
  const order_number = await buildOrderNumber(admin, data.business_id);

  const unitPrice = round2(subtotal / data.quantity);
  const allItems = [
    {
      product_id: data.product_id,
      name: data.product_name,
      price: unitPrice,
      quantity: data.quantity,
      ...(data.customization && { customization: data.customization }),
    },
    ...validatedExtras.map(e => ({ product_id: `extra_${e.id}`, name: e.label, price: e.price, quantity: 1 })),
  ];

  const { data: order, error } = await admin.from("orders").insert({
    business_id: data.business_id,
    order_number,
    customer_name: data.customer_name.trim(),
    customer_phone: data.customer_phone.trim(),
    customer_email: data.customer_email?.trim() || null,
    shipping_address: {
      county: data.customer_county,
      city: data.customer_city.trim(),
      address: data.customer_address.trim(),
      ...(data.selected_courier && {
        courier: data.selected_courier,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
      }),
      ...(data.locker_id && {
        locker_id: data.locker_id,
        locker_name: data.locker_name,
      }),
    },
    items: allItems,
    subtotal,
    shipping_cost: shipping,
    discount_code: validDiscountId ? data.discount_code : null,
    discount_amount: discountAmount,
    total,
    notes: data.custom_fields && Object.keys(data.custom_fields).length > 0 ? data.custom_fields as unknown as string : null,
    payment_method: data.payment_method ?? "cash_on_delivery",
    payment_status: "unpaid",
    status: "pending",
  }).select("id, order_number").single();

  if (error) {
    logError({ action: "placeOrder", message: error.message, details: { code: error.code, hint: error.hint, businessId: data.business_id }, severity: "critical" });
    return { error: "Eroare la plasarea comenzii. Incearca din nou." };
  }

  if (validDiscountId) {
    await admin.rpc("increment_discount_uses", { p_discount_id: validDiscountId });
  }

  // Atomic stock decrement — prevents race condition with concurrent orders
  await admin.rpc("decrement_stock" as never, { p_product_id: data.product_id, p_quantity: data.quantity } as never);

  // Send emails
  try {
    const { data: settings } = await admin
      .from("store_settings")
      .select("notifications_config, businesses(business_name, user_id)")
      .eq("business_id", data.business_id)
      .single();
    if (settings) {
      const config = parseNotificationsConfig(
        (settings.notifications_config as Record<string, unknown>) ?? {}
      );
      const biz = settings.businesses as unknown as { business_name: string; user_id: string } | null;
      const businessName = biz?.business_name ?? "";

      let notifyEmail = config.notification_email;
      if (!notifyEmail && biz?.user_id) {
        const { data: authData } = await admin.auth.admin.getUserById(biz.user_id);
        notifyEmail = authData?.user?.email ?? "";
      }

      const emailPayload = {
        order_number: order.order_number,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        total,
        subtotal,
        items: allItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        shipping_cost: data.shipping_cost,
        discount_code: data.discount_code,
        discount_amount: (data.discount_amount ?? 0) > 0 ? (data.discount_amount ?? 0) : undefined,
        payment_method: data.payment_method ?? "cash_on_delivery",
        business_name: businessName,
        order_id: order.id,
        address: data.customer_address,
        city: data.customer_city,
        county: data.customer_county,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
        locker_name: data.locker_name,
        custom_fields: data.custom_fields,
      };
      await Promise.all([
        config.new_order !== false && notifyEmail
          ? sendNewOrderEmail(notifyEmail, emailPayload)
          : null,
        data.customer_email
          ? sendOrderConfirmationToCustomer(data.customer_email, emailPayload)
          : null,
      ].filter(Boolean));
    }
  } catch (e) { logError({ action: "placeOrder.emails", message: (e as Error).message ?? "Email send failed", details: { businessId: data.business_id }, severity: "warning" }); }

  revalidatePath("/dashboard/orders");
  return { success: true, orderId: order.id, orderNumber: order.order_number };
}

export async function updateOrder(orderId: string, data: { status: string; payment_status: string; awb?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: order } = await supabase
    .from("orders")
    .select("business_id, order_number, customer_name, customer_email, total, status, payment_status")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id, business_name").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const { error } = await supabase.from("orders")
    .update({ status: data.status as never, payment_status: data.payment_status as never })
    .eq("id", orderId);

  if (error) {
    logError({ action: "updateOrder", message: error.message, details: { code: error.code, hint: error.hint, orderId }, userId: user.id });
    return { error: "Eroare la actualizare." };
  }

  const statusChanged = data.status !== (order.status as string);
  const paymentChanged = data.payment_status !== (order.payment_status as string);

  // Send status change email to customer
  if (statusChanged && order.customer_email) {
    sendOrderStatusToCustomer(order.customer_email, {
      order_number: order.order_number,
      customer_name: order.customer_name,
      total: order.total,
      status: data.status,
      business_name: biz.business_name,
      awb: data.awb,
    }).catch(() => {});
  }

  // Auto-generate SmartBill invoice if configured (fire-and-forget)
  if (statusChanged || paymentChanged) {
    import("@/lib/actions/smartbill.actions").then(({ maybeAutoGenerateInvoice }) => {
      void maybeAutoGenerateInvoice(order.business_id, orderId, data.status, data.payment_status);
    }).catch(() => {});
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true };
}

export async function deleteOrder(orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: order } = await supabase.from("orders").select("business_id").eq("id", orderId).single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) {
    logError({ action: "deleteOrder", message: error.message, details: { code: error.code, orderId }, userId: user.id });
    return { error: "Eroare la stergerea comenzii." };
  }

  revalidatePath("/dashboard/orders");
  return { success: true };
}

export async function sendCustomerNotification(orderId: string, subject: string, message: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  if (!subject.trim() || !message.trim()) return { error: "Completeaza subiectul si mesajul." };

  const { data: order } = await supabase
    .from("orders")
    .select("business_id, order_number, customer_email")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("business_name").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  if (!order.customer_email) return { error: "Clientul nu a lasat o adresa de email." };

  const res = await sendCustomerMessage(order.customer_email, {
    subject: subject.trim(),
    message: message.trim(),
    businessName: biz.business_name,
    orderNumber: order.order_number,
  });
  if ("error" in res) return { error: res.error };
  return { success: true };
}

export async function placeCartOrder(data: {
  business_id: string;
  items: { product_id: string; name: string; price: number; quantity: number }[];
  shipping_cost: number;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_county: string;
  customer_city: string;
  customer_address: string;
  discount_id?: string;
  discount_code?: string;
  discount_amount?: number;
  extras?: { id: string; label: string; price: number }[];
  custom_fields?: Record<string, string>;
  vat_amount?: number;
  vat_rate?: number;
  payment_method?: string;
  selected_courier?: string;
  courier_label?: string;
  delivery_type?: string;
  locker_id?: string;
  locker_name?: string;
}) {
  // Use admin client — customers are anonymous
  const admin = createAdminClient();

  // Reload every product + store config; recompute all prices server-side.
  const productIds = [...new Set(data.items.map((i) => i.product_id))];
  const [{ data: dbProducts }, { data: cfgRow }] = await Promise.all([
    admin.from("products")
      .select("id, price, is_active")
      .in("id", productIds)
      .eq("business_id", data.business_id),
    admin.from("store_settings")
      .select("page_content, free_shipping_threshold, min_order_amount, vat_enabled, vat_rate, prices_include_vat")
      .eq("business_id", data.business_id)
      .single(),
  ]);

  const priceMap = new Map(
    (dbProducts ?? []).filter((p) => p.is_active).map((p) => [p.id, round2(Number(p.price))]),
  );
  if (data.items.some((i) => !priceMap.has(i.product_id))) {
    logError({ action: "placeCartOrder.itemUnavailable", message: "Cart item missing/inactive for business", details: { businessId: data.business_id, productIds }, severity: "warning" });
    return { error: "Unul dintre produse nu mai este disponibil. Reincarca cosul." };
  }

  const validatedItems = data.items.map((i) => ({
    product_id: i.product_id,
    name: i.name,
    price: priceMap.get(i.product_id)!,
    quantity: i.quantity,
  }));
  const subtotal = round2(validatedItems.reduce((s, i) => s + i.price * i.quantity, 0));

  // Enforce the merchant's minimum order value (Setari > Livrare) against the authoritative subtotal.
  const minOrder = cfgRow?.min_order_amount != null ? Number(cfgRow.min_order_amount) : null;
  if (minOrder !== null && subtotal < minOrder) {
    return { error: `Comanda minima este de ${minOrder} lei. Mai adauga produse pentru a finaliza comanda.` };
  }

  const validatedExtras = validateExtras(cfgRow?.page_content, data.extras);
  const extrasTotal = validatedExtras.reduce((s, e) => s + e.price, 0);

  // Re-validate discount server-side (guard even though cart has no discount UI today).
  let discountAmount = 0;
  let validDiscountId: string | undefined;
  let isFreeShipping = false;
  if (data.discount_code) {
    const dres = await validateDiscount(data.discount_code, data.business_id, subtotal);
    if (dres.valid) {
      discountAmount = Math.min(dres.discount.discountAmount, subtotal);
      validDiscountId = dres.discount.id;
      isFreeShipping = dres.discount.type === "free_shipping";
    }
  }

  // Recompute VAT from store config (mirrors MiniStoreRenderer) so it cannot be forged.
  const vatEnabled = cfgRow?.vat_enabled ?? false;
  const vatRate = Number(cfgRow?.vat_rate ?? 19);
  const pricesIncludeVat = cfgRow?.prices_include_vat ?? true;
  const vatBase = subtotal + extrasTotal;
  const vatAmount = vatEnabled
    ? pricesIncludeVat
      ? round2(vatBase - vatBase / (1 + vatRate / 100))
      : round2(vatBase * (vatRate / 100))
    : 0;
  // Only VAT-exclusive pricing adds VAT on top of the total (matches the storefront grand total).
  const vatAddOn = vatEnabled && !pricesIncludeVat ? vatAmount : 0;

  const freeThreshold = cfgRow?.free_shipping_threshold != null ? Number(cfgRow.free_shipping_threshold) : null;
  let shipping = Math.max(0, round2(data.shipping_cost));
  if (isFreeShipping || (freeThreshold !== null && subtotal >= freeThreshold)) shipping = 0;

  const total = Math.max(0, round2(subtotal + extrasTotal - discountAmount + shipping + vatAddOn));
  const order_number = await buildOrderNumber(admin, data.business_id);

  const allItems = [
    ...validatedItems,
    ...validatedExtras.map((e) => ({ product_id: `extra_${e.id}`, name: e.label, price: e.price, quantity: 1 })),
  ];

  const { data: order, error } = await admin.from("orders").insert({
    business_id: data.business_id,
    order_number,
    customer_name: data.customer_name.trim(),
    customer_phone: data.customer_phone.trim(),
    customer_email: data.customer_email?.trim() || null,
    shipping_address: {
      county: data.customer_county,
      city: data.customer_city.trim(),
      address: data.customer_address.trim(),
      ...(data.selected_courier && {
        courier: data.selected_courier,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
      }),
      ...(data.locker_id && {
        locker_id: data.locker_id,
        locker_name: data.locker_name,
      }),
    },
    items: allItems,
    subtotal,
    shipping_cost: shipping,
    discount_code: validDiscountId ? data.discount_code : null,
    discount_amount: discountAmount,
    total,
    vat_amount: vatAmount,
    vat_rate: vatEnabled ? vatRate : 0,
    notes: data.custom_fields && Object.keys(data.custom_fields).length > 0 ? data.custom_fields as unknown as string : null,
    payment_method: data.payment_method ?? "cash_on_delivery",
    payment_status: "unpaid",
    status: "pending",
  }).select("id, order_number, total").single();

  if (error) {
    logError({ action: "placeCartOrder", message: error.message, details: { code: error.code, hint: error.hint, businessId: data.business_id, itemCount: data.items.length }, severity: "critical" });
    return { error: "Eroare la plasarea comenzii. Incearca din nou." };
  }

  if (validDiscountId) {
    await admin.rpc("increment_discount_uses", { p_discount_id: validDiscountId });
  }

  // Atomic batch stock decrement — prevents race conditions
  const stockItems = validatedItems.map(i => ({ product_id: i.product_id, quantity: i.quantity }));
  await admin.rpc("decrement_stock_batch" as never, { p_items: stockItems } as never);

  // Send emails
  try {
    const { data: settings } = await admin
      .from("store_settings")
      .select("notifications_config, businesses(business_name, user_id)")
      .eq("business_id", data.business_id)
      .single();
    if (settings) {
      const config = parseNotificationsConfig(
        (settings.notifications_config as Record<string, unknown>) ?? {}
      );
      const biz = settings.businesses as unknown as { business_name: string; user_id: string } | null;
      const businessName = biz?.business_name ?? "";

      let notifyEmail = config.notification_email;
      if (!notifyEmail && biz?.user_id) {
        const { data: authData } = await admin.auth.admin.getUserById(biz.user_id);
        notifyEmail = authData?.user?.email ?? "";
      }

      const emailPayload = {
        order_number: order.order_number,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        total,
        subtotal,
        items: allItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        shipping_cost: data.shipping_cost,
        discount_code: data.discount_code,
        discount_amount: (data.discount_amount ?? 0) > 0 ? (data.discount_amount ?? 0) : undefined,
        payment_method: data.payment_method ?? "cash_on_delivery",
        business_name: businessName,
        order_id: order.id,
        address: data.customer_address,
        city: data.customer_city,
        county: data.customer_county,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
        locker_name: data.locker_name,
        custom_fields: data.custom_fields,
      };
      await Promise.all([
        config.new_order !== false && notifyEmail
          ? sendNewOrderEmail(notifyEmail, emailPayload)
          : null,
        data.customer_email
          ? sendOrderConfirmationToCustomer(data.customer_email, emailPayload)
          : null,
      ].filter(Boolean));
    }
  } catch (e) { logError({ action: "placeOrder.emails", message: (e as Error).message ?? "Email send failed", details: { businessId: data.business_id }, severity: "warning" }); }

  revalidatePath("/dashboard/orders");
  return { success: true, orderId: order.id, orderNumber: order.order_number };
}
