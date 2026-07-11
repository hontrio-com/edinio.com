// Brevo (ex-Sendinblue) API v3 client (server-only — holds the merchant's API key).
// BYO model: each store connects its own Brevo account. We only sync contacts into a
// chosen list; campaigns run inside Brevo (on the merchant's account + cost).
//
// Auth: fixed host + `api-key` header (no datacenter suffix, no email hashing —
// contacts are identified by their email directly). Docs: https://developers.brevo.com
//
// Brevo has NO tags: segmentation is done via LISTS + contact ATTRIBUTES. We map the
// Mailchimp source/county/order-value tags to the custom attributes SOURCE / COUNTY /
// ORDER_VALUE (created idempotently at connect). FIRSTNAME / LASTNAME / SMS are built-in.

const API_BASE = "https://api.brevo.com/v3";

export interface BrevoSources {
  checkout?: boolean;
  popup?: boolean;
  forms?: boolean;
}

export interface BrevoConfig {
  enabled: boolean;
  api_key: string;          // secret — server-only, never sent to the browser
  account_email?: string;
  account_name?: string;    // Brevo companyName
  list_id?: number;         // selected list (Brevo list ids are integers)
  list_name?: string;
  sources?: BrevoSources;
  last_sync_at?: string;
  // ── Phase 2 ──────────────────────────────────────────────────────────────
  webhook_secret?: string;  // identifies the store on inbound unsubscribe webhooks
  webhook_id?: number;      // the marketing webhook we registered (to delete on disconnect)
  ecommerce_sync?: boolean; // also sync products + orders to Brevo
}

export interface BrevoList {
  id: number;
  name: string;
  member_count: number;
}

export interface BrevoContactInput {
  email: string;
  fname?: string;
  lname?: string;
  phone?: string;
  /** Segmentation attributes (Brevo has no tags). */
  source?: string;
  county?: string;
  order_value?: string;
}

type Creds = Pick<BrevoConfig, "api_key">;

const STATUS_MAP: Record<number, string> = {
  400: "Cerere invalida catre Brevo. Verifica datele contactului.",
  401: "Cheie API Brevo invalida.",
  403: "Acces interzis. Verifica permisiunile cheii API Brevo.",
  404: "Resursa nu a fost gasita (lista sau cont inexistent).",
  429: "Prea multe cereri catre Brevo. Incearca din nou in cateva momente.",
};

function brevoError(status: number, json: unknown): string {
  if (json && typeof json === "object") {
    const o = json as { message?: string; code?: string };
    if (o.message) return o.message;
  }
  return STATUS_MAP[status] ?? `Eroare Brevo (${status}).`;
}

/**
 * Low-level Brevo API v3 call. Returns `{ data }` on 2xx (data is null on 204) or
 * `{ error }` otherwise. Exported for the e-commerce module.
 */
export async function brevoRequest<T = unknown>(
  creds: Creds,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T } | { error: string }> {
  if (!creds.api_key) return { error: "Brevo nu este configurat." };
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "api-key": creds.api_key,
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try { json = JSON.parse(text); } catch { json = null; }
    }
    if (!res.ok) return { error: brevoError(res.status, json) };
    return { data: json as T };
  } catch {
    return { error: "Eroare de retea la conectarea cu Brevo." };
  }
}

/** Validate an API key and return the account it belongs to (used on connect). */
export async function pingBrevo(
  apiKey: string,
): Promise<{ account_email: string; account_name: string } | { error: string }> {
  const key = apiKey.trim();
  if (!key) return { error: "Introdu cheia API Brevo." };
  const res = await brevoRequest<{ email?: string; companyName?: string }>({ api_key: key }, "GET", "/account");
  if ("error" in res) return res;
  if (!res.data?.email) return { error: "Nu am putut valida contul Brevo." };
  return { account_email: res.data.email, account_name: res.data.companyName ?? "" };
}

/** List the account's contact lists (paginated) for the picker. */
export async function getLists(creds: Creds): Promise<BrevoList[] | { error: string }> {
  const out: BrevoList[] = [];
  let offset = 0;
  const limit = 50;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await brevoRequest<{ lists?: Array<{ id: number; name: string; totalSubscribers?: number }>; count?: number }>(
      creds, "GET", `/contacts/lists?limit=${limit}&offset=${offset}`,
    );
    if ("error" in res) return offset === 0 ? res : out;
    const lists = res.data?.lists ?? [];
    for (const l of lists) out.push({ id: l.id, name: l.name, member_count: l.totalSubscribers ?? 0 });
    offset += limit;
    if (lists.length < limit || out.length >= (res.data?.count ?? out.length)) break;
    if (offset > 5000) break; // safety
  }
  return out;
}

/** Custom text attributes we set on contacts for segmentation (Brevo has no tags). */
const CUSTOM_ATTRIBUTES = ["SOURCE", "COUNTY", "ORDER_VALUE", "PHONE"] as const;

/**
 * Ensure our custom contact attributes exist (Brevo rejects a contact upsert that
 * references an unknown attribute). Idempotent + best-effort: reads the current
 * attributes and creates only the missing ones. FIRSTNAME/LASTNAME/SMS are built-in.
 */
export async function ensureAttributes(creds: Creds): Promise<void> {
  const res = await brevoRequest<{ attributes?: Array<{ name?: string; category?: string }> }>(creds, "GET", "/contacts/attributes");
  if ("error" in res) return;
  const existing = new Set(
    (res.data?.attributes ?? [])
      .filter((a) => (a.category ?? "normal") === "normal")
      .map((a) => (a.name ?? "").toUpperCase()),
  );
  for (const name of CUSTOM_ATTRIBUTES) {
    if (existing.has(name)) continue;
    await brevoRequest(creds, "POST", `/contacts/attributes/normal/${name}`, { type: "text" });
  }
}

/** Normalize a phone to E.164 (+40…) for the strict Brevo SMS attribute; null if not confidently formattable. */
export function phoneToE164(phone?: string | null): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) return /^\+\d{8,15}$/.test(s) ? s : null;
  const d = s.replace(/\D/g, "");
  if (d.startsWith("40") && d.length === 11) return "+" + d;          // 40XXXXXXXXX
  if (d.startsWith("0") && d.length === 10) return "+40" + d.slice(1); // 07XXXXXXXX
  if (d.length === 9 && d.startsWith("7")) return "+40" + d;          // 7XXXXXXXX
  return null;
}

function buildAttributes(m: BrevoContactInput): Record<string, string> {
  const a: Record<string, string> = {};
  if (m.fname) a.FIRSTNAME = m.fname;
  if (m.lname) a.LASTNAME = m.lname;
  if (m.phone) {
    a.PHONE = m.phone.trim();
    const sms = phoneToE164(m.phone);
    if (sms) a.SMS = sms; // only when valid E.164 — an invalid SMS rejects the whole contact
  }
  if (m.source) a.SOURCE = m.source;
  if (m.county) a.COUNTY = m.county;
  if (m.order_value) a.ORDER_VALUE = m.order_value;
  return a;
}

/**
 * Add or update a single contact (upsert) into the configured list.
 *
 * We send `updateEnabled: true` and — critically — NEVER `emailBlacklisted`. In Brevo,
 * un-blacklisting a contact that unsubscribed (or updating their email) re-subscribes
 * them, which Brevo considers illegal and can suspend the account. Omitting it keeps
 * the existing blacklist state (the equivalent of Mailchimp's `status_if_new`).
 */
export async function upsertContact(
  config: BrevoConfig,
  member: BrevoContactInput,
): Promise<{ ok: true } | { error: string }> {
  if (!config.list_id) return { error: "Nicio lista selectata." };
  const email = member.email.trim();
  if (!email) return { error: "Email lipsa." };

  const attributes = buildAttributes(member);
  const body: Record<string, unknown> = {
    email,
    updateEnabled: true,
    listIds: [config.list_id],
    ...(Object.keys(attributes).length ? { attributes } : {}),
  };
  const res = await brevoRequest(config, "POST", "/contacts", body);
  if (!("error" in res)) return { ok: true };

  // A bad phone (e.g. a landline in the strict SMS attribute) or a custom attribute
  // not defined on the account rejects the WHOLE contact. Retry with only the built-in
  // name attributes so the subscriber is never lost (segmentation is best-effort).
  const sentRisky = Object.keys(attributes).some((k) => k !== "FIRSTNAME" && k !== "LASTNAME");
  if (!sentRisky) return res;

  const safe: Record<string, string> = {};
  if (attributes.FIRSTNAME) safe.FIRSTNAME = attributes.FIRSTNAME;
  if (attributes.LASTNAME) safe.LASTNAME = attributes.LASTNAME;
  const retry = await brevoRequest(config, "POST", "/contacts", {
    email,
    updateEnabled: true,
    listIds: [config.list_id],
    ...(Object.keys(safe).length ? { attributes: safe } : {}),
  });
  if ("error" in retry) return res; // report the original (more informative) error
  return { ok: true };
}

/**
 * Bulk import contacts into the list (POST /contacts/import — asynchronous). Updates
 * existing contacts' attributes; Brevo import never re-subscribes blacklisted contacts.
 * Chunked at 1000. We also pre-filter our own suppression list before calling this.
 */
export async function importContacts(
  config: BrevoConfig,
  contacts: BrevoContactInput[],
): Promise<{ ok: true } | { error: string }> {
  if (!config.list_id) return { error: "Nicio lista selectata." };
  const CHUNK = 1000;
  for (let i = 0; i < contacts.length; i += CHUNK) {
    const jsonBody = contacts.slice(i, i + CHUNK).map((c) => ({ email: c.email.trim(), attributes: buildAttributes(c) }));
    const res = await brevoRequest(config, "POST", "/contacts/import", {
      listIds: [config.list_id],
      updateExistingContacts: true,
      emptyContactsAttributes: false,
      jsonBody,
    });
    if ("error" in res) return res;
  }
  return { ok: true };
}

/** Split a full name into FIRSTNAME / LASTNAME parts. */
export function splitName(name?: string | null): { fname?: string; lname?: string } {
  const n = (name ?? "").trim();
  if (!n) return {};
  const parts = n.split(/\s+/);
  if (parts.length === 1) return { fname: parts[0] };
  return { fname: parts[0], lname: parts.slice(1).join(" ") };
}

/** Client-safe view of the config — NEVER exposes the API key. */
export interface BrevoPublicConfig {
  enabled: boolean;
  connected: boolean;
  account_name?: string;
  account_email?: string;
  list_id?: number;
  list_name?: string;
  sources: { checkout: boolean; popup: boolean; forms: boolean };
  ecommerce_sync: boolean;
  last_sync_at?: string;
}

export function toPublicBrevoConfig(config: BrevoConfig | null): BrevoPublicConfig {
  return {
    enabled: !!config?.enabled,
    connected: !!config?.api_key,
    account_name: config?.account_name,
    account_email: config?.account_email,
    list_id: config?.list_id,
    list_name: config?.list_name,
    sources: {
      checkout: config?.sources?.checkout !== false,
      popup: config?.sources?.popup !== false,
      forms: config?.sources?.forms !== false,
    },
    ecommerce_sync: !!config?.ecommerce_sync,
    last_sync_at: config?.last_sync_at,
  };
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com";

/** Public URL Brevo calls on unsubscribe; carries the per-store secret (Brevo does not sign). */
export function brevoWebhookUrl(secret?: string | null): string | null {
  if (!secret) return null;
  return `${SITE_URL}/api/brevo/webhook?secret=${encodeURIComponent(secret)}`;
}

/**
 * Register the account-level marketing "unsubscribed" webhook (idempotent by URL).
 * Brevo webhooks are per-account (not per-list), so one registration covers the store.
 * Returns the webhook id so we can delete it on disconnect.
 */
export async function registerWebhook(
  config: BrevoConfig,
  url: string,
): Promise<{ ok: true; id?: number } | { error: string }> {
  const existing = await brevoRequest<{ webhooks?: Array<{ id: number; url?: string }> }>(config, "GET", "/webhooks?type=marketing");
  if (!("error" in existing)) {
    const found = (existing.data?.webhooks ?? []).find((w) => w.url === url);
    if (found) return { ok: true, id: found.id };
  }
  const res = await brevoRequest<{ id?: number }>(config, "POST", "/webhooks", {
    type: "marketing",
    events: ["unsubscribed"],
    url,
    description: "Edinio unsubscribe sync",
  });
  if ("error" in res) return res;
  return { ok: true, id: res.data?.id };
}

/** Remove a previously registered webhook (best-effort, on disconnect). */
export async function deleteWebhook(config: BrevoConfig, id?: number): Promise<void> {
  if (!id) return;
  await brevoRequest(config, "DELETE", `/webhooks/${id}`);
}
