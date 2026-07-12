"use server";

// Dreptul de retragere online — OUG 18/2026 (modifică OUG 34/2014, art. 11^1).
// Clientii sunt anonimi (fara cont): se identifica prin numarul comenzii + email SAU
// telefon. Scrierile publice folosesc admin client (service-role), ca la crearea
// comenzilor. Administrarea (dashboard) e owner-only prin RLS.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone, normalizeEmail } from "@/lib/customers";
import { parseNotificationsConfig, sendReturnConfirmationToCustomer, sendReturnRequestToMerchant } from "@/lib/email";
import { logError } from "@/lib/error-logger";

// Fereastra self-service: dreptul legal e 14 zile de la primire, dar data primirii nu
// e mereu cunoscuta, asa ca permitem cererea mult peste 14 zile (comerciantul adjudeca
// eligibilitatea). Peste acest prag ascundem formularul ca masura anti-abuz.
const RETURN_LOOKUP_MAX_DAYS = 90;
const RETURN_STATUSES = ["nou", "aprobat", "respins", "rambursat"] as const;
type ReturnStatus = (typeof RETURN_STATUSES)[number];

export interface ReturnableItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
}

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  items: unknown;
  created_at: string;
  status: string | null;
};

function contactMatches(order: OrderRow, contact: string): boolean {
  const c = contact.trim();
  if (!c) return false;
  if (c.includes("@")) {
    const e = normalizeEmail(c);
    return !!e && normalizeEmail(order.customer_email) === e;
  }
  const cp = normalizePhone(c);
  return cp.length >= 9 && normalizePhone(order.customer_phone) === cp;
}

// Order numbers may be typed with/without a leading '#' and in any case.
function orderNumberCandidates(raw: string): string[] {
  const t = raw.trim();
  const stripped = t.replace(/^#/, "");
  return [...new Set([t, stripped, `#${stripped}`, t.toUpperCase(), stripped.toUpperCase(), `#${stripped}`.toUpperCase()])].filter(Boolean);
}

// Only real products are returnable — drop checkout extras (product_id 'extra_*').
function returnableItems(items: unknown): ReturnableItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .filter((i) => !String(i.product_id ?? "").startsWith("extra_"))
    .map((i) => ({
      product_id: String(i.product_id ?? ""),
      name: String(i.name ?? "Produs"),
      price: Number(i.price ?? 0) || 0,
      quantity: Math.max(1, Math.floor(Number(i.quantity ?? 1)) || 1),
    }));
}

async function findOrder(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
  orderNumber: string,
  contact: string,
): Promise<OrderRow | null> {
  const { data: orders } = await admin
    .from("orders")
    .select("id, order_number, customer_name, customer_email, customer_phone, items, created_at, status")
    .eq("business_id", businessId)
    .in("order_number", orderNumberCandidates(orderNumber))
    .limit(5);
  const match = (orders ?? []).find((o) => contactMatches(o as OrderRow, contact));
  return (match as OrderRow) ?? null;
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

/**
 * Public: verify an order by number + contact and return its returnable items.
 * Generic error on any failure to avoid order/contact enumeration.
 */
export async function lookupReturnableOrder(input: {
  businessId: string;
  orderNumber: string;
  contact: string;
}): Promise<
  | { error: string }
  | { success: true; orderId: string; orderNumber: string; customerName: string | null; items: ReturnableItem[]; hasEmail: boolean; deadlineNote: string }
> {
  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`returnLookup:${ip}`, 12, 60_000)) {
    return { error: "Prea multe incercari. Te rugam asteapta un minut si incearca din nou." };
  }

  const orderNumber = (input.orderNumber ?? "").trim();
  const contact = (input.contact ?? "").trim();
  if (!orderNumber || !contact) return { error: "Completeaza numarul comenzii si emailul sau telefonul." };

  const admin = createAdminClient();
  const order = await findOrder(admin, input.businessId, orderNumber, contact);
  if (!order) {
    return { error: "Nu am gasit o comanda cu aceste date. Verifica numarul comenzii si emailul/telefonul folosit la comanda." };
  }

  const age = daysSince(order.created_at);
  if (age > RETURN_LOOKUP_MAX_DAYS) {
    return { error: "Perioada de retur pentru aceasta comanda a expirat. Pentru situatii speciale, contacteaza direct magazinul." };
  }

  const items = returnableItems(order.items);
  if (items.length === 0) {
    return { error: "Aceasta comanda nu contine produse care pot fi returnate online. Contacteaza magazinul pentru asistenta." };
  }

  const deadlineNote =
    age <= 14
      ? "Esti in termenul legal de 14 zile pentru retragerea din contract."
      : "Termenul legal de 14 zile de la primire ar putea fi depasit; poti trimite totusi cererea, iar magazinul o va analiza.";

  return {
    success: true,
    orderId: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    items,
    hasEmail: !!order.customer_email,
    deadlineNote,
  };
}

/**
 * Public: register a withdrawal (return) request. Re-validates the order server-side,
 * stores the request, and sends the durable-medium confirmation to the customer plus a
 * notification to the merchant.
 */
export async function submitReturnRequest(input: {
  businessId: string;
  orderNumber: string;
  contact: string;
  items: { product_id: string; quantity: number }[];
  reason?: string;
  refundMethod?: string;
  refundIban?: string;
  honeypot?: string;
}): Promise<{ error: string } | { success: true }> {
  // Bot trap: a filled honeypot pretends to succeed without doing anything.
  if (input.honeypot && input.honeypot.trim() !== "") return { success: true };

  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`returnSubmit:${ip}`, 6, 60_000)) {
    return { error: "Prea multe incercari. Te rugam asteapta un minut si incearca din nou." };
  }

  const admin = createAdminClient();

  // Burst limit per business (cost control on emails).
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("return_requests")
    .select("id", { count: "exact", head: true })
    .eq("business_id", input.businessId)
    .gte("created_at", since);
  if ((count ?? 0) >= 8) return { error: "Prea multe cereri. Incearca din nou peste un minut." };

  const order = await findOrder(admin, input.businessId, input.orderNumber ?? "", input.contact ?? "");
  if (!order) return { error: "Nu am gasit comanda. Reia identificarea." };
  if (daysSince(order.created_at) > RETURN_LOOKUP_MAX_DAYS) {
    return { error: "Perioada de retur pentru aceasta comanda a expirat." };
  }

  // Re-derive the returned items from the authoritative order (never trust client
  // names/prices); keep only selected products, clamp quantity to what was ordered.
  const orderItems = returnableItems(order.items);
  const wanted = new Map((input.items ?? []).map((i) => [String(i.product_id), Math.max(1, Math.floor(Number(i.quantity ?? 1)) || 1)]));
  const selected = orderItems
    .filter((i) => wanted.has(i.product_id))
    .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: Math.min(i.quantity, wanted.get(i.product_id)!) }));
  if (selected.length === 0) return { error: "Selecteaza cel putin un produs pentru retur." };

  const reason = (input.reason ?? "").trim().slice(0, 2000) || null;
  const refundMethod = (input.refundMethod ?? "").trim().slice(0, 20) || null;
  const refundIban = (input.refundIban ?? "").trim().replace(/\s+/g, "").slice(0, 34).toUpperCase() || null;
  const receivedAt = new Date().toISOString();

  const { error } = await admin.from("return_requests").insert({
    business_id: input.businessId,
    order_id: order.id,
    order_number: order.order_number,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    customer_phone: order.customer_phone,
    items: selected,
    reason,
    refund_method: refundMethod,
    refund_iban: refundIban,
  });
  if (error) {
    logError({ action: "submitReturnRequest", message: error.message, details: { businessId: input.businessId }, severity: "critical" });
    return { error: "Eroare la trimiterea cererii. Incearca din nou." };
  }

  // Notifications (email to customer + merchant, bell). Fire-and-forget, like orders.
  try {
    const { data: settings } = await admin
      .from("store_settings")
      .select("notifications_config, returns_config, businesses(business_name, store_name, user_id)")
      .eq("business_id", input.businessId)
      .single();

    const biz = settings?.businesses as unknown as { business_name: string; store_name: string | null; user_id: string } | null;
    const businessName = biz?.store_name || biz?.business_name || "Magazin";
    const emailItems = selected.map((i) => ({ name: i.name, quantity: i.quantity }));

    // Durable-medium confirmation to the customer (required by law).
    if (order.customer_email) {
      void sendReturnConfirmationToCustomer(order.customer_email, {
        order_number: order.order_number,
        customer_name: order.customer_name,
        business_name: businessName,
        items: emailItems,
        reason,
        receivedAt,
      });
    }

    // Merchant notification: returns_config.notify_email > notifications_config > owner email.
    const returnsCfg = (settings?.returns_config ?? {}) as { notify_email?: string };
    const notifCfg = parseNotificationsConfig((settings?.notifications_config as Record<string, unknown>) ?? {});
    let notifyEmail = (returnsCfg.notify_email || notifCfg.notification_email || "").trim();
    if (!notifyEmail && biz?.user_id) {
      const { data: authData } = await admin.auth.admin.getUserById(biz.user_id);
      notifyEmail = authData?.user?.email ?? "";
    }
    if (notifyEmail) {
      void sendReturnRequestToMerchant(notifyEmail, {
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_phone: order.customer_phone,
        business_name: businessName,
        items: emailItems,
        reason,
        refund_method: refundMethod,
        refund_iban: refundIban,
        receivedAt,
      });
    }

    // Bell notification in the dashboard topbar (keyed by owner user_id).
    if (biz?.user_id) {
      await admin.from("notifications").insert({
        user_id: biz.user_id,
        type: "return",
        title: "Cerere de retur",
        message: `${order.order_number} - ${order.customer_name ?? "client"}`,
      });
    }
  } catch (e) {
    logError({ action: "submitReturnRequest.notify", message: (e as Error).message ?? "notify failed", details: { businessId: input.businessId }, severity: "warning" });
  }

  revalidatePath("/dashboard/returns");
  return { success: true };
}

/* ─── Owner administration (dashboard) ─────────────────────────────────────── */

export async function updateReturnStatus(
  returnId: string,
  status: string,
): Promise<{ error: string } | { success: true }> {
  if (!RETURN_STATUSES.includes(status as ReturnStatus)) return { error: "Status invalid." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  // RLS restricts the update to the owner's businesses; a non-owner matches no rows.
  const { data, error } = await supabase
    .from("return_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", returnId)
    .select("id");
  if (error) return { error: "Eroare la actualizare." };
  if (!data || data.length === 0) return { error: "Neautorizat" };
  revalidatePath("/dashboard/returns");
  return { success: true };
}

export async function toggleReturnRead(
  returnId: string,
  isRead: boolean,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data, error } = await supabase
    .from("return_requests")
    .update({ is_read: isRead })
    .eq("id", returnId)
    .select("id");
  if (error) return { error: "Eroare la salvare." };
  if (!data || data.length === 0) return { error: "Neautorizat" };
  revalidatePath("/dashboard/returns");
  return { success: true };
}

export async function deleteReturnRequest(returnId: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  // Owner DELETE policy exists on return_requests; RLS ensures only the owner's rows go.
  const { data, error } = await supabase
    .from("return_requests")
    .delete()
    .eq("id", returnId)
    .select("id");
  if (error) return { error: "Eroare la stergere." };
  if (!data || data.length === 0) return { error: "Neautorizat" };
  revalidatePath("/dashboard/returns");
  return { success: true };
}
