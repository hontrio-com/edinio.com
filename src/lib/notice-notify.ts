// Server-side dispatcher: send a notice.ro SMS for an order/payment event, using
// the merchant's per-trigger template (snapshot) or a sensible built-in default.
// Always fire-and-forget — it must never break the order flow.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";
import {
  sendNoticeSms, sendNoticeWhatsapp, sendNoticeAudio, normalizeNoticePhone,
  type NoticeConfig, type NoticeTriggerKey, type NoticeSendResult,
} from "@/lib/notice";

const NOTICE_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com";

// Public URL notice.ro calls back for delivery reports + inbound replies (and voice callbacks).
// Carries the per-store secret so the webhook can identify the business. Null until a secret exists.
export function noticeWebhookUrl(secret?: string | null): string | null {
  if (!secret) return null;
  return `${NOTICE_BASE_URL}/api/notice/webhook?secret=${encodeURIComponent(secret)}`;
}

export interface NoticeVars {
  order: string;   // order number
  name: string;    // customer name
  total: string;   // formatted total (e.g. "120 lei")
  awb: string;     // AWB (may be empty)
  store: string;   // store name
  // notice.ro's own template variables — optional, filled when available so a
  // merchant template using {telephone}, {shipping_address}, {store_url}, etc.
  // renders correctly instead of leaking the literal placeholder to the customer.
  phone?: string;           // {telephone}
  email?: string;           // {email}
  address?: string;         // {shipping_address} / {payment_address}
  city?: string;            // {shipping_city} / {payment_city}
  region?: string;          // {shipping_region} / {payment_region} (county)
  postcode?: string;        // {shipping_postcode} / {payment_postcode}
  country?: string;         // {shipping_country} / {payment_country}
  payment_method?: string;  // {payment_method} (raw code or label)
  shipping_method?: string; // {shipping_method} / {shipping_company} (courier)
  store_url?: string;       // {store_url} / {url}
  date_added?: string;      // {date_added}
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

const NOTICE_PAYMENT_LABELS: Record<string, string> = {
  cash_on_delivery: "Ramburs la curier",
  card: "Card online",
  stripe: "Card online (Stripe)",
  netopia: "Card online (Netopia)",
  ipay: "Card bancar (BT iPay)",
  klarna: "Klarna",
  revolut: "Card online (Revolut)",
  bank_transfer: "Transfer bancar",
};

// Substitute template variables. We support notice.ro's full documented set
// ({name} {order_id} {telephone} {email} {total} {store_url} {date_added}
// {shipping_company} {shipping_address} {shipping_postcode} {shipping_city}
// {shipping_region} {shipping_country} {payment_*} {payment_method}
// {shipping_method} {site} {url}) plus our own aliases incl. {awb}. Any documented
// variable we can't source resolves to "" so the literal placeholder never reaches
// the customer; genuinely unknown tokens are left untouched.
function renderTemplate(text: string, vars: NoticeVars): string {
  const s = (x?: string | null) => (x ?? "").toString();
  const order = s(vars.order), name = s(vars.name), total = s(vars.total),
    store = s(vars.store), awb = s(vars.awb),
    phone = s(vars.phone), email = s(vars.email),
    address = s(vars.address), city = s(vars.city), region = s(vars.region),
    postcode = s(vars.postcode), country = s(vars.country) || "Romania",
    shipMethod = s(vars.shipping_method), storeUrl = s(vars.store_url),
    dateAdded = s(vars.date_added);
  const payRaw = s(vars.payment_method);
  const payMethod = NOTICE_PAYMENT_LABELS[payRaw] ?? payRaw;

  const map: Record<string, string> = {
    // order number — notice.ro {order_id}
    order, order_id: order, order_number: order, comanda: order,
    // customer name — {name}
    name, customer: name, nume: name, client: name,
    // total — {total}
    total, suma: total,
    // AWB — our own extra (not a notice.ro variable, but handy)
    awb,
    // store name / site — {site}
    store, business: store, magazin: store, shop: store, site: store,
    // store url — {store_url} {url}
    store_url: storeUrl, url: storeUrl,
    // phone — {telephone}
    telephone: phone, phone, telefon: phone,
    // email — {email}
    email,
    // order date — {date_added}
    date_added: dateAdded,
    // shipping — {shipping_company} {shipping_method} {shipping_address} ...
    shipping_company: shipMethod, shipping_method: shipMethod,
    shipping_address: address, shipping_city: city, shipping_region: region,
    shipping_postcode: postcode, shipping_country: country,
    // payment — billing mirrors the single checkout address; {payment_method} explicit
    payment_method: payMethod, payment_company: "",
    payment_address: address, payment_city: city, payment_region: region,
    payment_postcode: postcode, payment_country: country,
  };
  return text.replace(/\{\s*([a-z_]+)\s*\}/gi, (m, key: string) => {
    const val = map[key.toLowerCase()];
    return val !== undefined ? val : m;
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

type NoticeChannel = "sms" | "whatsapp" | "voice";
type AdminClient = ReturnType<typeof createAdminClient>;

// Send one channel and record the attempt in notice_sms_log (channel + provider id for DLR).
async function sendAndLog(
  admin: AdminClient,
  opts: { businessId: string; orderId?: string | null; triggerKey: NoticeTriggerKey; phone: string; templateId?: string | null },
  channel: NoticeChannel,
  message: string,
  send: () => Promise<NoticeSendResult>,
): Promise<void> {
  let result: NoticeSendResult;
  try {
    result = await send();
  } catch {
    result = { success: false, error: "Eroare la trimitere." };
  }
  await admin.from("notice_sms_log").insert({
    business_id: opts.businessId,
    order_id: opts.orderId ?? null,
    trigger_key: opts.triggerKey,
    channel,
    phone: normalizeNoticePhone(opts.phone) ?? opts.phone,
    template_id: opts.templateId ?? null,
    message,
    success: result.success,
    provider_id: result.providerId ?? null,
    delivery_status: result.success ? "sent" : "failed",
    error: result.success ? null : (result.error ?? "Eroare necunoscuta"),
  } as never);
}

// Dispatch a trigger across every channel the merchant enabled for it (SMS / WhatsApp /
// Voice), using the per-trigger template snapshot (or a built-in RO default). The same
// rendered text is reused per channel — SMS strips diacritics (segment cost), WhatsApp and
// Voice keep them. Always fire-and-forget: it must never break the order flow.
export async function maybeSendNoticeNotification(opts: {
  businessId: string;
  orderId?: string | null;
  triggerKey: NoticeTriggerKey;
  phone: string | null | undefined;
  vars: NoticeVars;
}): Promise<void> {
  try {
    if (!opts.phone) return;
    const phone = opts.phone;

    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("store_settings")
      .select("notice_config")
      .eq("business_id", opts.businessId)
      .single();

    const config = settings?.notice_config as NoticeConfig | null;
    if (!config?.enabled || !config.api_token) return;
    const token = config.api_token;

    const trigger = config.triggers?.[opts.triggerKey];
    const wantSms = !!trigger?.enabled;
    const wantWhatsapp = !!trigger?.whatsapp && !!config.whatsapp?.enabled;
    const wantVoice = !!trigger?.voice && !!config.voice?.enabled;
    if (!wantSms && !wantWhatsapp && !wantVoice) return;

    const tpl = (trigger?.template_text ?? "").trim();
    const baseMessage = (tpl ? renderTemplate(tpl, opts.vars) : defaultMessage(opts.triggerKey, opts.vars)).trim();
    if (!baseMessage) return;

    const logOpts = { businessId: opts.businessId, orderId: opts.orderId, triggerKey: opts.triggerKey, phone, templateId: trigger?.template_id ?? null };
    const sends: Promise<void>[] = [];

    if (wantSms) {
      const smsMsg = (config.strip_diacritics !== false ? stripRoDiacritics(baseMessage) : baseMessage).trim();
      if (smsMsg) sends.push(sendAndLog(admin, logOpts, "sms", smsMsg, () => sendNoticeSms(token, { number: phone, message: smsMsg })));
    }
    if (wantWhatsapp) {
      sends.push(sendAndLog(admin, logOpts, "whatsapp", baseMessage, () => sendNoticeWhatsapp(token, { number: phone, message: baseMessage })));
    }
    if (wantVoice) {
      const callbackUrl = noticeWebhookUrl(config.webhook_secret) ?? undefined;
      sends.push(sendAndLog(admin, logOpts, "voice", baseMessage, () => sendNoticeAudio(token, { number: phone, text: baseMessage, type: config.voice?.type ?? "confirmation", callbackUrl })));
    }

    await Promise.allSettled(sends);
  } catch {
    // fire-and-forget — never let notifications break the order flow
  }
}

// Send an abandoned-cart recovery SMS via notice.ro when the merchant enabled it for
// abandoned carts. Returns handled=false (without sending) so the caller can fall back
// to another provider (SMSO). `db` may be the admin or the owner client — both can
// write notice_sms_log (service role bypasses RLS; owner is allowed by the owner policy).
export async function sendNoticeAbandonedSms(
  db: SupabaseClient<Database>,
  config: NoticeConfig | null,
  opts: { businessId: string; phone: string | null | undefined; body: string },
): Promise<{ handled: boolean; success: boolean; error?: string }> {
  if (!config?.enabled || !config.api_token || !config.abandoned?.enabled || !opts.phone) {
    return { handled: false, success: false };
  }
  let message = opts.body.trim();
  if (config.strip_diacritics !== false) message = stripRoDiacritics(message);

  const result = await sendNoticeSms(config.api_token, { number: opts.phone, message });
  await db.from("notice_sms_log").insert({
    business_id: opts.businessId,
    order_id: null,
    trigger_key: "abandoned_cart",
    channel: "sms",
    phone: normalizeNoticePhone(opts.phone) ?? opts.phone,
    message,
    success: result.success,
    provider_id: result.providerId ?? null,
    delivery_status: result.success ? "sent" : "failed",
    error: result.success ? null : (result.error ?? "Eroare necunoscuta"),
  } as never);
  return { handled: true, success: result.success, error: result.error };
}
