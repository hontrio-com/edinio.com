// Klaviyo API v3 client (server-only — holds the merchant's PRIVATE API key `pk_...`).
// BYO model: each store connects its own Klaviyo account. We only sync contacts into a
// chosen list (with consent) + push e-commerce; campaigns run inside Klaviyo.
//
// Auth: header `Authorization: Klaviyo-API-Key pk_...` + the mandatory dated `revision`
// header. Requests/responses are JSON:API (data / type / attributes / relationships).
// Docs: https://developers.klaviyo.com. Base host: https://a.klaviyo.com/api
//
// Klaviyo has no tags — segmentation is via LISTS + profile custom `properties` (auto-
// created, no pre-registration). Unsubscribes are enforced server-side by Klaviyo (the
// subscribe endpoint never resurrects an unsubscribed profile), so there is no local
// suppression table like Mailchimp/Brevo.

const API_BASE = "https://a.klaviyo.com/api";
// Dated API version. Matches Klaviyo's own current WooCommerce plugin (2026-04-15).
const REVISION = "2026-04-15";

export interface KlaviyoSources {
  checkout?: boolean;
  popup?: boolean;
  forms?: boolean;
}

export interface KlaviyoConfig {
  enabled: boolean;
  api_key: string;          // pk_... private key — server-only, never sent to the browser
  account_name?: string;    // Klaviyo organization name
  list_id?: string;         // selected list (Klaviyo list ids are short strings)
  list_name?: string;
  sources?: KlaviyoSources;
  last_sync_at?: string;
  ecommerce_sync?: boolean; // also push Placed Order events + catalog items
}

export interface KlaviyoList {
  id: string;
  name: string;
}

export interface KlaviyoProfileInput {
  email: string;
  fname?: string;
  lname?: string;
  phone?: string;
  /** Segmentation (Klaviyo has no tags) → custom profile properties. */
  source?: string;
  county?: string;
  order_value?: string;
}

type Creds = Pick<KlaviyoConfig, "api_key">;

const STATUS_MAP: Record<number, string> = {
  400: "Cerere invalida catre Klaviyo. Verifica datele.",
  401: "Cheie API Klaviyo invalida.",
  403: "Acces interzis. Cheia Klaviyo are nevoie de permisiuni complete (accounts, lists, profiles, subscriptions, events, catalogs).",
  404: "Resursa nu a fost gasita (lista sau cont inexistent).",
  429: "Prea multe cereri catre Klaviyo. Incearca din nou in cateva momente.",
};

function klaviyoError(status: number, json: unknown): string {
  if (json && typeof json === "object") {
    const o = json as { errors?: Array<{ detail?: string; title?: string }> };
    if (Array.isArray(o.errors) && o.errors.length > 0) {
      const e = o.errors[0];
      if (e?.detail) return e.detail;
      if (e?.title) return e.title;
    }
  }
  return STATUS_MAP[status] ?? `Eroare Klaviyo (${status}).`;
}

/**
 * Low-level Klaviyo API v3 call (JSON:API). Returns `{ data }` on 2xx (null on 204) or
 * `{ error }` otherwise. Exported for the e-commerce module.
 */
export async function klaviyoRequest<T = unknown>(
  creds: Creds,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T } | { error: string }> {
  if (!creds.api_key) return { error: "Klaviyo nu este configurat." };
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Klaviyo-API-Key ${creds.api_key}`,
        revision: REVISION,
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
    if (!res.ok) return { error: klaviyoError(res.status, json) };
    return { data: json as T };
  } catch {
    return { error: "Eroare de retea la conectarea cu Klaviyo." };
  }
}

/** Validate a private API key and return the account it belongs to (used on connect). */
export async function pingKlaviyo(
  apiKey: string,
): Promise<{ account_name: string } | { error: string }> {
  const key = apiKey.trim();
  if (!key) return { error: "Introdu cheia API Klaviyo." };
  if (!key.startsWith("pk_")) return { error: "Foloseste cheia API privata Klaviyo (incepe cu pk_), nu cheia publica." };
  const res = await klaviyoRequest<{ data?: Array<{ attributes?: { contact_information?: { organization_name?: string } } }> }>(
    { api_key: key }, "GET", "/accounts/",
  );
  if ("error" in res) return res;
  const acct = res.data?.data?.[0];
  if (!acct) return { error: "Nu am putut valida contul Klaviyo." };
  return { account_name: acct.attributes?.contact_information?.organization_name ?? "" };
}

/** List the account's lists (cursor-paginated) for the picker. */
export async function getLists(creds: Creds): Promise<KlaviyoList[] | { error: string }> {
  const out: KlaviyoList[] = [];
  let path: string = "/lists/";
  let guard = 0;
  while (path && guard < 50) {
    const res = await klaviyoRequest<{ data?: Array<{ id: string; attributes?: { name?: string } }>; links?: { next?: string } }>(
      creds, "GET", path,
    );
    if ("error" in res) return out.length ? out : res;
    for (const l of res.data?.data ?? []) out.push({ id: l.id, name: l.attributes?.name ?? l.id });
    const next = res.data?.links?.next;
    if (next) {
      const idx = next.indexOf("/api");
      path = idx >= 0 ? next.slice(idx + 4) : "";
    } else {
      path = "";
    }
    guard++;
  }
  return out;
}

/** Normalize a phone to E.164 (+40…) for the strict Klaviyo phone_number; null if not confidently formattable. */
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

function buildProperties(m: KlaviyoProfileInput): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (m.source) p.Source = m.source;
  if (m.county) p.County = m.county;
  if (m.order_value) p["Order Value"] = m.order_value;
  if (m.phone) p.Phone = m.phone.trim(); // raw phone always kept (phone_number below is E.164-only)
  return p;
}

/**
 * Create or update a profile (POST /profile-import — a true upsert by email, 201/200).
 * Sets name + custom properties. `phone_number` is set only when it normalizes to E.164
 * (an invalid phone rejects the WHOLE profile) — the raw value is kept in properties.Phone.
 * On rejection we retry with just email + name so a contact is never lost.
 */
export async function upsertProfile(
  config: Creds,
  m: KlaviyoProfileInput,
): Promise<{ ok: true } | { error: string }> {
  const email = m.email.trim();
  if (!email) return { error: "Email lipsa." };

  const attributes: Record<string, unknown> = { email };
  if (m.fname) attributes.first_name = m.fname;
  if (m.lname) attributes.last_name = m.lname;
  if (m.phone) {
    const e164 = phoneToE164(m.phone);
    if (e164) attributes.phone_number = e164;
  }
  const props = buildProperties(m);
  if (Object.keys(props).length) attributes.properties = props;

  const res = await klaviyoRequest(config, "POST", "/profile-import", { data: { type: "profile", attributes } });
  if (!("error" in res)) return { ok: true };

  const hadRisky = attributes.phone_number !== undefined || attributes.properties !== undefined;
  if (!hadRisky) return res;

  const safe: Record<string, unknown> = { email };
  if (m.fname) safe.first_name = m.fname;
  if (m.lname) safe.last_name = m.lname;
  const retry = await klaviyoRequest(config, "POST", "/profile-import", { data: { type: "profile", attributes: safe } });
  if ("error" in retry) return res; // report the original (more informative) error
  return { ok: true };
}

/**
 * Subscribe one or more emails to the configured list with email-marketing consent
 * (POST /profile-subscription-bulk-create-jobs — async job, ≤1000 profiles each). This
 * respects Klaviyo's server-side suppression: profiles that unsubscribed are NOT
 * resurrected. No `historical_import`, so the list's double opt-in setting is honored.
 */
export async function subscribeProfiles(
  config: KlaviyoConfig,
  emails: string[],
): Promise<{ ok: true } | { error: string }> {
  if (!config.list_id) return { error: "Nicio lista selectata." };
  const clean = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))));
  if (clean.length === 0) return { ok: true };

  const CHUNK = 900; // Klaviyo max is 1000 per job
  for (let i = 0; i < clean.length; i += CHUNK) {
    const body = {
      data: {
        type: "profile-subscription-bulk-create-job",
        attributes: {
          profiles: {
            data: clean.slice(i, i + CHUNK).map((email) => ({
              type: "profile",
              attributes: {
                email,
                subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
              },
            })),
          },
        },
        relationships: { list: { data: { type: "list", id: config.list_id } } },
      },
    };
    const res = await klaviyoRequest(config, "POST", "/profile-subscription-bulk-create-jobs/", body);
    if ("error" in res) return res;
  }
  return { ok: true };
}

/** Split a full name into first / last parts. */
export function splitName(name?: string | null): { fname?: string; lname?: string } {
  const n = (name ?? "").trim();
  if (!n) return {};
  const parts = n.split(/\s+/);
  if (parts.length === 1) return { fname: parts[0] };
  return { fname: parts[0], lname: parts.slice(1).join(" ") };
}

/** Client-safe view of the config — NEVER exposes the API key. */
export interface KlaviyoPublicConfig {
  enabled: boolean;
  connected: boolean;
  account_name?: string;
  list_id?: string;
  list_name?: string;
  sources: { checkout: boolean; popup: boolean; forms: boolean };
  ecommerce_sync: boolean;
  last_sync_at?: string;
}

export function toPublicKlaviyoConfig(config: KlaviyoConfig | null): KlaviyoPublicConfig {
  return {
    enabled: !!config?.enabled,
    connected: !!config?.api_key,
    account_name: config?.account_name,
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
