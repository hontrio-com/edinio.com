"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseNotificationsConfig, sendNewOrderEmail, sendOrderConfirmationToCustomer, sendOrderStatusToCustomer } from "@/lib/email";
import { logError } from "@/lib/error-logger";

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

  const subtotal = data.product_price * data.quantity;
  const extrasTotal = (data.extras ?? []).reduce((s, e) => s + e.price, 0);
  const discountAmount = data.discount_amount ?? 0;
  const total = subtotal + extrasTotal - discountAmount + data.shipping_cost;
  const order_number = await buildOrderNumber(admin, data.business_id);

  const allItems = [
    {
      product_id: data.product_id,
      name: data.product_name,
      price: data.product_price,
      quantity: data.quantity,
      ...(data.customization && { customization: data.customization }),
    },
    ...(data.extras ?? []).map(e => ({ product_id: `extra_${e.id}`, name: e.label, price: e.price, quantity: 1 })),
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
    shipping_cost: data.shipping_cost,
    discount_code: data.discount_code ?? null,
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

  if (data.discount_id) {
    await admin.rpc("increment_discount_uses", { p_discount_id: data.discount_id });
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
        total,
        items: allItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        shipping_cost: data.shipping_cost,
        business_name: businessName,
        order_id: order.id,
        discount_code: data.discount_code,
        discount_amount: (data.discount_amount ?? 0) > 0 ? (data.discount_amount ?? 0) : undefined,
        payment_method: data.payment_method ?? "cash_on_delivery",
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

  const extrasTotal = (data.extras ?? []).reduce((s, e) => s + e.price, 0);
  const subtotal = data.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountAmount = data.discount_amount ?? 0;
  const vatAmount = data.vat_amount ?? 0;
  const total = subtotal + extrasTotal - discountAmount + data.shipping_cost + vatAmount;
  const order_number = await buildOrderNumber(admin, data.business_id);

  const allItems = [
    ...data.items.map(i => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
    ...(data.extras ?? []).map(e => ({ product_id: `extra_${e.id}`, name: e.label, price: e.price, quantity: 1 })),
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
    shipping_cost: data.shipping_cost,
    discount_code: data.discount_code ?? null,
    discount_amount: discountAmount,
    total,
    vat_amount: vatAmount,
    vat_rate: data.vat_rate ?? 0,
    notes: data.custom_fields && Object.keys(data.custom_fields).length > 0 ? data.custom_fields as unknown as string : null,
    payment_method: data.payment_method ?? "cash_on_delivery",
    payment_status: "unpaid",
    status: "pending",
  }).select("id, order_number, total").single();

  if (error) {
    logError({ action: "placeCartOrder", message: error.message, details: { code: error.code, hint: error.hint, businessId: data.business_id, itemCount: data.items.length }, severity: "critical" });
    return { error: "Eroare la plasarea comenzii. Incearca din nou." };
  }

  if (data.discount_id) {
    await admin.rpc("increment_discount_uses", { p_discount_id: data.discount_id });
  }

  // Atomic batch stock decrement — prevents race conditions
  const stockItems = data.items.map(i => ({ product_id: i.product_id, quantity: i.quantity }));
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
        total,
        items: allItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        shipping_cost: data.shipping_cost,
        business_name: businessName,
        order_id: order.id,
        discount_code: data.discount_code,
        discount_amount: (data.discount_amount ?? 0) > 0 ? (data.discount_amount ?? 0) : undefined,
        payment_method: data.payment_method ?? "cash_on_delivery",
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
