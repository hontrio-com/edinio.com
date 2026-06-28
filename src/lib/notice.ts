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
  enabled: boolean;
  template_id?: string | null;
  // Snapshot of the chosen template, taken when the merchant selects it. Sending
  // renders `template_text` — so the order flow never depends on a live notice.ro
  // call (more robust, and works even if their templates API is briefly down).
  template_text?: string | null;
  template_name?: string | null;
}

export interface NoticeConfig {
  enabled: boolean;
  api_token: string;
  // Strip Romanian diacritics before sending (keeps messages to one SMS segment).
  strip_diacritics?: boolean;
  triggers?: Partial<Record<NoticeTriggerKey, NoticeTrigger>>;
}

export interface NoticeTemplate {
  id: string;
  name: string;
  text: string;
}

export interface NoticeSendResult {
  success: boolean;
  error?: string;
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
    return { success: true };
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
