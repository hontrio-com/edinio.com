// notice.ro SMS API client.
// Docs: https://documenter.getpostman.com/view/6644801/2s9YyzbxNU
// Auth: `Authorization: Bearer <token>` — a long-lived "sms-api" token the
// merchant generates in their notice.ro account and pastes into the integration.

const NOTICE_BASE = "https://api.notice.ro/api/v1";

// The 9 events we can notify on — mapped 1:1 to our order + payment statuses.
export type NoticeTriggerKey =
  | "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded"
  | "payment_paid" | "payment_refunded";

export const NOTICE_TRIGGER_KEYS: NoticeTriggerKey[] = [
  "pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded",
  "payment_paid", "payment_refunded",
];

export interface NoticeTrigger {
  enabled: boolean;          // SMS channel (original semantics)
  template_id?: string | null;
  // Snapshot of the chosen template, taken when the merchant selects it. Sending
  // renders `template_text` — so the order flow never depends on a live notice.ro
  // call (more robust, and works even if their templates API is briefly down).
  template_text?: string | null;
  template_name?: string | null;
  // Phase 2 — additionally deliver this trigger on other channels (same rendered text).
  whatsapp?: boolean;
  voice?: boolean;
}

// A WhatsApp device (phone) linked to the merchant's notice.ro account.
export interface NoticeWhatsappConfig {
  enabled: boolean;
  device_id?: string | null;
  device_name?: string | null;
  // Last status we saw: pending | authenticated | disconnected | banned | unknown.
  status?: string | null;
}

export interface NoticeVoiceConfig {
  enabled: boolean;
  // notice.ro audio "type": confirmation | fulfilment (draft = test only).
  type?: "confirmation" | "fulfilment";
}

export interface NoticeAbandonedConfig {
  enabled: boolean;
}

export interface NoticeConfig {
  enabled: boolean;
  api_token: string;
  // Strip Romanian diacritics before sending (keeps messages to one SMS segment).
  strip_diacritics?: boolean;
  triggers?: Partial<Record<NoticeTriggerKey, NoticeTrigger>>;
  // Phase 2 additions (all optional → backward compatible).
  webhook_secret?: string;          // identifies the store on inbound webhook calls
  whatsapp?: NoticeWhatsappConfig;
  voice?: NoticeVoiceConfig;
  abandoned?: NoticeAbandonedConfig; // notice.ro SMS in the abandoned-cart pipeline
}

// One WhatsApp device as returned by notice.ro (shapes are undocumented → tolerant).
export interface NoticeWaDevice {
  id: string;
  name?: string | null;
  status: string;
  qr_code?: string | null;
  pairing_code?: string | null;
}

// One inbound or outbound message row from notice.ro inbox/outbox (best-effort shape).
export interface NoticeMessage {
  id?: string | null;
  number?: string | null;
  message?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface NoticeTemplate {
  id: string;
  name: string;
  text: string;
}

export interface NoticeSendResult {
  success: boolean;
  error?: string;
  // notice.ro message id when the send response exposes one — lets the webhook
  // correlate delivery reports (DLR) back to the exact notice_sms_log row.
  providerId?: string | null;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

function mapHttpError(status: number, fallback?: string): string {
  switch (status) {
    case 400: return fallback ?? "Cerere invalida catre notice.ro.";
    case 401: return "Token API invalid sau expirat.";
    case 402: return "Credit insuficient in contul notice.ro.";
    case 403: return "Acces interzis (verifica permisiunile tokenului).";
    case 404: return "Resursa negasita.";
    case 422: return fallback ?? "Date invalide trimise catre notice.ro.";
    case 429: return "Prea multe cereri catre notice.ro. Incearca mai tarziu.";
    default:
      if (status >= 500) return "Eroare la serverul notice.ro. Incearca mai tarziu.";
      return fallback ?? "Eroare necunoscuta de la notice.ro.";
  }
}

// notice.ro expects a local RO mobile number: 07XXXXXXXX. Accepts +40.../40.../7....
export function normalizeNoticePhone(raw: string): string | null {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0040")) d = d.slice(4);
  else if (d.startsWith("40")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 9 && d.startsWith("7")) return "0" + d; // 7XXXXXXXX -> 07XXXXXXXX
  return null;
}

async function readJson(res: Response): Promise<unknown> {
  try { return await res.json(); } catch { return null; }
}

function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
  }
  return undefined;
}

// notice.ro wraps some payloads under `data` — unwrap a single object when present.
function unwrap(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    if (o.data && typeof o.data === "object" && !Array.isArray(o.data)) return o.data as Record<string, unknown>;
    return o;
  }
  return {};
}

// Pull the first present string/number field from a set of candidate keys.
function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

// Best-effort provider message id from a send response (exact field is undocumented).
function extractId(body: unknown): string | null {
  return pickStr(unwrap(body), ["id", "message_id", "sms_id", "uuid", "reference", "msg_id"]) ?? null;
}

// Normalise an array payload that may sit at the root or under data/messages/devices/items.
function asArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const k of ["data", "messages", "devices", "items", "results"]) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
  }
  return [];
}

// GET /templates — the response shape isn't documented, so accept an array at the
// root or nested under data/templates, and normalise common field aliases.
export async function getNoticeTemplates(token: string): Promise<NoticeTemplate[] | { error: string }> {
  try {
    const res = await fetch(`${NOTICE_BASE}/templates`, { headers: authHeaders(token), cache: "no-store" });
    const body = await readJson(res);
    if (!res.ok) return { error: mapHttpError(res.status, extractMessage(body)) };

    const raw = Array.isArray(body)
      ? body
      : Array.isArray((body as { data?: unknown })?.data)
        ? (body as { data: unknown[] }).data
        : Array.isArray((body as { templates?: unknown })?.templates)
          ? (body as { templates: unknown[] }).templates
          : [];

    return raw
      .map((item): NoticeTemplate => {
        const t = (item ?? {}) as Record<string, unknown>;
        const id = String(t.id ?? t.uuid ?? t.template_id ?? "");
        return {
          id,
          name: String(t.name ?? t.title ?? t.label ?? (id ? `Sablon ${id}` : "Sablon")),
          text: String(t.text ?? t.message ?? t.content ?? t.body ?? ""),
        };
      })
      .filter((t) => t.id);
  } catch {
    return { error: "Eroare de retea catre notice.ro." };
  }
}

// POST /sms-out — body: number (07XXXXXXXX) + message.
export async function sendNoticeSms(token: string, params: { number: string; message: string }): Promise<NoticeSendResult> {
  const number = normalizeNoticePhone(params.number);
  if (!number) return { success: false, error: "Numar de telefon invalid." };
  const message = (params.message ?? "").trim();
  if (!message) return { success: false, error: "Mesaj gol." };
  try {
    const res = await fetch(`${NOTICE_BASE}/sms-out`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ number, message }).toString(),
      cache: "no-store",
    });
    const body = await readJson(res);
    if (!res.ok) return { success: false, error: mapHttpError(res.status, extractMessage(body)) };
    return { success: true, providerId: extractId(body) };
  } catch {
    return { success: false, error: "Eroare de retea catre notice.ro." };
  }
}

// Connection check: any successful authenticated call (templates list) proves the token works.
export async function testNoticeToken(
  token: string,
): Promise<{ ok: true; templateCount: number } | { ok: false; error: string }> {
  const result = await getNoticeTemplates(token);
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, templateCount: result.length };
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────────
// notice.ro wants an international number for WhatsApp (+40XXXXXXXXX / 40XXXXXXXXX).
export function normalizeIntlPhone(raw: string): string | null {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0040")) d = d.slice(4);
  else if (d.startsWith("40")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 9 && d.startsWith("7")) return "+40" + d;
  return null;
}

// WhatsApp error copy (403 = credit/not enabled, 503 = no device, 422 = bad number).
function mapWaError(status: number, serverMsg?: string): string {
  switch (status) {
    case 403: return serverMsg ?? "WhatsApp indisponibil: credit insuficient sau canal neactivat in notice.ro.";
    case 422: return serverMsg ?? "Numar WhatsApp invalid (foloseste format international).";
    case 503: return "Niciun dispozitiv WhatsApp disponibil. Conecteaza un telefon.";
    default: return mapHttpError(status, serverMsg);
  }
}

function parseWaDevice(raw: Record<string, unknown>): NoticeWaDevice {
  return {
    id: String(raw.id ?? raw.device_id ?? raw.uuid ?? ""),
    name: pickStr(raw, ["device_name", "name", "label"]) ?? null,
    status: String(raw.status ?? raw.state ?? "unknown"),
    qr_code: pickStr(raw, ["qr_code", "qr", "qrcode", "qr_image"]) ?? null,
    pairing_code: pickStr(raw, ["pairing_code", "code", "pair_code"]) ?? null,
  };
}

// POST /whatsapp/send — JSON { number (+40...), message }.
export async function sendNoticeWhatsapp(token: string, params: { number: string; message: string }): Promise<NoticeSendResult> {
  const number = normalizeIntlPhone(params.number);
  if (!number) return { success: false, error: "Numar invalid pentru WhatsApp." };
  const message = (params.message ?? "").trim();
  if (!message) return { success: false, error: "Mesaj gol." };
  try {
    const res = await fetch(`${NOTICE_BASE}/whatsapp/send`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ number, message }),
      cache: "no-store",
    });
    const body = await readJson(res);
    if (!res.ok) return { success: false, error: mapWaError(res.status, extractMessage(body)) };
    return { success: true, providerId: extractId(body) };
  } catch {
    return { success: false, error: "Eroare de retea catre notice.ro." };
  }
}

// GET /whatsapp/devices
export async function listNoticeWaDevices(token: string): Promise<NoticeWaDevice[] | { error: string }> {
  try {
    const res = await fetch(`${NOTICE_BASE}/whatsapp/devices`, { headers: authHeaders(token), cache: "no-store" });
    const body = await readJson(res);
    if (!res.ok) return { error: mapHttpError(res.status, extractMessage(body)) };
    return asArray(body).map((d) => parseWaDevice((d ?? {}) as Record<string, unknown>)).filter((d) => d.id);
  } catch { return { error: "Eroare de retea catre notice.ro." }; }
}

// POST /whatsapp/devices { device_name } → { id, qr_code, status }
export async function registerNoticeWaDevice(token: string, deviceName: string): Promise<{ device: NoticeWaDevice } | { error: string }> {
  try {
    const res = await fetch(`${NOTICE_BASE}/whatsapp/devices`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ device_name: deviceName || "Edinio" }),
      cache: "no-store",
    });
    const body = await readJson(res);
    if (!res.ok) return { error: mapHttpError(res.status, extractMessage(body)) };
    return { device: parseWaDevice(unwrap(body)) };
  } catch { return { error: "Eroare de retea catre notice.ro." }; }
}

// GET /whatsapp/devices/{id} (qr_code present only while pending)
export async function getNoticeWaDevice(token: string, deviceId: string): Promise<{ device: NoticeWaDevice } | { error: string }> {
  try {
    const res = await fetch(`${NOTICE_BASE}/whatsapp/devices/${encodeURIComponent(deviceId)}`, { headers: authHeaders(token), cache: "no-store" });
    const body = await readJson(res);
    if (!res.ok) return { error: mapHttpError(res.status, extractMessage(body)) };
    return { device: parseWaDevice(unwrap(body)) };
  } catch { return { error: "Eroare de retea catre notice.ro." }; }
}

// GET /whatsapp/devices/{id}/qr → fresh QR (only while pending)
export async function refreshNoticeWaQr(token: string, deviceId: string): Promise<{ qr_code: string | null } | { error: string }> {
  try {
    const res = await fetch(`${NOTICE_BASE}/whatsapp/devices/${encodeURIComponent(deviceId)}/qr`, { headers: authHeaders(token), cache: "no-store" });
    const body = await readJson(res);
    if (!res.ok) return { error: mapWaError(res.status, extractMessage(body)) };
    return { qr_code: pickStr(unwrap(body), ["qr_code", "qr", "qrcode", "qr_image"]) ?? null };
  } catch { return { error: "Eroare de retea catre notice.ro." }; }
}

// POST /whatsapp/devices/{id}/pairing-code { phone_number } → 6-char code
export async function requestNoticeWaPairing(token: string, deviceId: string, phone: string): Promise<{ pairing_code: string | null } | { error: string }> {
  const number = normalizeIntlPhone(phone);
  if (!number) return { error: "Numar invalid (format international)." };
  try {
    const res = await fetch(`${NOTICE_BASE}/whatsapp/devices/${encodeURIComponent(deviceId)}/pairing-code`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: number }),
      cache: "no-store",
    });
    const body = await readJson(res);
    if (!res.ok) return { error: mapWaError(res.status, extractMessage(body)) };
    return { pairing_code: pickStr(unwrap(body), ["pairing_code", "code", "pair_code"]) ?? null };
  } catch { return { error: "Eroare de retea catre notice.ro." }; }
}

// GET /whatsapp/devices/{id}/status → { status }
export async function pollNoticeWaStatus(token: string, deviceId: string): Promise<{ status: string } | { error: string }> {
  try {
    const res = await fetch(`${NOTICE_BASE}/whatsapp/devices/${encodeURIComponent(deviceId)}/status`, { headers: authHeaders(token), cache: "no-store" });
    const body = await readJson(res);
    if (!res.ok) return { error: mapHttpError(res.status, extractMessage(body)) };
    return { status: String(unwrap(body).status ?? "unknown") };
  } catch { return { error: "Eroare de retea catre notice.ro." }; }
}

// DELETE /whatsapp/devices/{id}
export async function deleteNoticeWaDevice(token: string, deviceId: string): Promise<{ success: true } | { error: string }> {
  try {
    const res = await fetch(`${NOTICE_BASE}/whatsapp/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE", headers: authHeaders(token), cache: "no-store" });
    if (!res.ok) { const body = await readJson(res); return { error: mapHttpError(res.status, extractMessage(body)) }; }
    return { success: true };
  } catch { return { error: "Eroare de retea catre notice.ro." }; }
}

// GET /whatsapp/inbox | /whatsapp/outbox — recent messages (best-effort shape).
async function getNoticeWaMessages(token: string, box: "inbox" | "outbox"): Promise<NoticeMessage[] | { error: string }> {
  try {
    const res = await fetch(`${NOTICE_BASE}/whatsapp/${box}`, { headers: authHeaders(token), cache: "no-store" });
    const body = await readJson(res);
    if (!res.ok) return { error: mapHttpError(res.status, extractMessage(body)) };
    return asArray(body).map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      return {
        id: pickStr(o, ["id", "uuid"]) ?? null,
        number: pickStr(o, ["number", "from", "to", "phone"]) ?? null,
        message: pickStr(o, ["message", "text", "body"]) ?? null,
        status: pickStr(o, ["status"]) ?? null,
        created_at: pickStr(o, ["created_at", "date", "timestamp"]) ?? null,
      };
    });
  } catch { return { error: "Eroare de retea catre notice.ro." }; }
}
export const getNoticeWaInbox = (token: string) => getNoticeWaMessages(token, "inbox");
export const getNoticeWaOutbox = (token: string) => getNoticeWaMessages(token, "outbox");

// ── Voice / audio ──────────────────────────────────────────────────────────────
// POST /audio — formdata number(07X) + text + type + callback_url.
export async function sendNoticeAudio(
  token: string,
  params: { number: string; text: string; type?: "confirmation" | "fulfilment" | "draft"; callbackUrl?: string },
): Promise<NoticeSendResult> {
  const number = normalizeNoticePhone(params.number);
  if (!number) return { success: false, error: "Numar de telefon invalid." };
  const text = (params.text ?? "").trim();
  if (!text) return { success: false, error: "Text gol." };
  const form = new FormData();
  form.set("number", number);
  form.set("text", text);
  form.set("type", params.type ?? "confirmation");
  if (params.callbackUrl) form.set("callback_url", params.callbackUrl);
  try {
    const res = await fetch(`${NOTICE_BASE}/audio`, { method: "POST", headers: authHeaders(token), body: form, cache: "no-store" });
    const body = await readJson(res);
    if (!res.ok) return { success: false, error: mapHttpError(res.status, extractMessage(body)) };
    return { success: true, providerId: extractId(body) };
  } catch { return { success: false, error: "Eroare de retea catre notice.ro." }; }
}

// ── Inbound SMS (GET /sms-in) — poll fallback when no webhook is configured. ──────
export async function getNoticeInboundSms(token: string): Promise<NoticeMessage[] | { error: string }> {
  try {
    const res = await fetch(`${NOTICE_BASE}/sms-in`, { headers: authHeaders(token), cache: "no-store" });
    const body = await readJson(res);
    if (!res.ok) return { error: mapHttpError(res.status, extractMessage(body)) };
    return asArray(body).map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      return {
        id: pickStr(o, ["id", "uuid"]) ?? null,
        number: pickStr(o, ["number", "from", "phone", "sender"]) ?? null,
        message: pickStr(o, ["message", "text", "body"]) ?? null,
        status: null,
        created_at: pickStr(o, ["created_at", "date", "timestamp", "received_at"]) ?? null,
      };
    });
  } catch { return { error: "Eroare de retea catre notice.ro." }; }
}
