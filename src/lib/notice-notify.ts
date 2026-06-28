// Server-side dispatcher: send a notice.ro SMS for an order/payment event, using
// the merchant's per-trigger template (snapshot) or a sensible built-in default.
// Always fire-and-forget — it must never break the order flow.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendNoticeSms, normalizeNoticePhone, type NoticeConfig, type NoticeTriggerKey } from "@/lib/notice";

export interface NoticeVars {
  order: string;   // order number
  name: string;    // customer name
  total: string;   // formatted total (e.g. "120 lei")
  awb: string;     // AWB (may be empty)
  store: string;   // store name
}

// Map our order status / payment status to a notice trigger key (or null = no SMS).
export function noticeTriggerForStatus(status: string): NoticeTriggerKey | null {
  switch (status) {
    case "pending": return "pending";
    case "confirmed": return "confirmed";
    case "processing": return "processing";
    case "shipped": return "shipped";
    case "delivered": return "delivered";
    case "cancelled": return "cancelled";
    case "refunded": return "refunded";
    default: return null;
  }
}

export function noticeTriggerForPayment(paymentStatus: string): NoticeTriggerKey | null {
  switch (paymentStatus) {
    case "paid": return "payment_paid";
    case "refunded": return "payment_refunded";
    default: return null;
  }
}

// Substitute {order}, {name}, {total}, {awb}, {store} (and common aliases) in a template.
function renderTemplate(text: string, vars: NoticeVars): string {
  const map: Record<string, string> = {
    order: vars.order, order_id: vars.order, order_number: vars.order, comanda: vars.order,
    name: vars.name, customer: vars.name, nume: vars.name, client: vars.name,
    total: vars.total, suma: vars.total,
    awb: vars.awb,
    store: vars.store, business: vars.store, magazin: vars.store, shop: vars.store,
  };
  return text.replace(/\{\s*([a-z_]+)\s*\}/gi, (m, key: string) => {
    const v = map[key.toLowerCase()];
    return v !== undefined ? v : m;
  });
}

function defaultMessage(key: NoticeTriggerKey, vars: NoticeVars): string {
  const { order, store, awb } = vars;
  switch (key) {
    case "pending": return `Comanda ${order} a fost inregistrata. Multumim! ${store}`;
    case "confirmed": return `Comanda ${order} a fost confirmata. Multumim! ${store}`;
    case "processing": return `Comanda ${order} este in procesare. ${store}`;
    case "shipped": return `Comanda ${order} a fost expediata${awb ? `, AWB ${awb}` : ""}. ${store}`;
    case "delivered": return `Comanda ${order} a fost livrata. Iti multumim! ${store}`;
    case "cancelled": return `Comanda ${order} a fost anulata. ${store}`;
    case "refunded": return `Comanda ${order} a fost rambursata. ${store}`;
    case "payment_paid": return `Plata pentru comanda ${order} a fost confirmata. Multumim! ${store}`;
    case "payment_refunded": return `Plata pentru comanda ${order} a fost rambursata. ${store}`;
  }
}

// Romanian diacritics -> ASCII (NFD doesn't decompose ș/ț, so map them explicitly).
function stripRoDiacritics(s: string): string {
  return s
    .replace(/[ăâ]/g, "a").replace(/[ĂÂ]/g, "A")
    .replace(/î/g, "i").replace(/Î/g, "I")
    .replace(/[șş]/g, "s").replace(/[ȘŞ]/g, "S")
    .replace(/[țţ]/g, "t").replace(/[ȚŢ]/g, "T")
    .normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip any remaining combining marks
}

export async function maybeSendNoticeSms(opts: {
  businessId: string;
  orderId?: string | null;
  triggerKey: NoticeTriggerKey;
  phone: string | null | undefined;
  vars: NoticeVars;
}): Promise<void> {
  try {
    if (!opts.phone) return;

    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("store_settings")
      .select("notice_config")
      .eq("business_id", opts.businessId)
      .single();

    const config = settings?.notice_config as NoticeConfig | null;
    if (!config?.enabled || !config.api_token) return;

    const trigger = config.triggers?.[opts.triggerKey];
    if (!trigger?.enabled) return;

    const tpl = (trigger.template_text ?? "").trim();
    let message = tpl ? renderTemplate(tpl, opts.vars) : defaultMessage(opts.triggerKey, opts.vars);
    if (config.strip_diacritics !== false) message = stripRoDiacritics(message);
    message = message.trim();
    if (!message) return;

    const result = await sendNoticeSms(config.api_token, { number: opts.phone, message });

    await admin.from("notice_sms_log").insert({
      business_id: opts.businessId,
      order_id: opts.orderId ?? null,
      trigger_key: opts.triggerKey,
      phone: normalizeNoticePhone(opts.phone) ?? opts.phone,
      template_id: trigger.template_id ?? null,
      message,
      success: result.success,
      error: result.success ? null : (result.error ?? "Eroare necunoscuta"),
    });
  } catch {
    // fire-and-forget — never let notifications break the order flow
  }
}
