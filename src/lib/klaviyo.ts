// Klaviyo API v3 client (server-only — holds the merchant's PRIVATE API key `pk_...`).
// BYO model: each store connects its own Klaviyo account. We only sync contacts into a
// chosen list (with consent) + push e-commerce; campaigns run inside Klaviyo.
//
// Auth: header `Authorization: Klaviyo-API-Key pk_...` + the mandatory dated `revision`
// header. Requests/responses are JSON:API (data / type / attributes / relationships).
// Docs: https://developers.klaviyo.com. Base host: https://a.klaviyo.com/api
//
// Klaviyo has no tags — segmentation is via LISTS + profile custom `properties` (auto-
// created, no pre-registration).
//
// ⚠⚠ DEZABONARILE NU LE PAZESTE KLAVIYO, le pazim noi. Aici scria, pana pe 18.09.2026,
// ca abonarea „nu invie niciodata un profil dezabonat” si ca de aceea nu e nevoie de
// nicio plasa locala. Documentatia capatului spune EXACT pe dos: „This API will remove
// any `UNSUBSCRIBE`, `SPAM_REPORT` or `USER_SUPPRESSED` suppressions from the provided
// profiles.” Deci cine s-a dezabonat sau a raportat un email ca spam era readus in
// lista la urmatoarea bifa. Acum `subscribeProfiles` intreaba intai starea fiecarui
// profil (`profileSuprimate`) si ii sare pe cei suprimati.

import { cerereExterna } from "@/lib/email-marketing/transport";

const API_BASE = "https://a.klaviyo.com/api";
/*
 * Revizia datata a API-ului. `2026-07-15` e revizia specului stabil publicat de ei
 * (github.com/klaviyo/openapi, `openapi/stable.json`, `info.version`), si corpurile de
 * mai jos sunt verificate pe el. Klaviyo sustine o revizie doi ani.
 */
export const REVISION = "2026-07-15";

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
 * `{ error, status }` otherwise. Exported for the e-commerce module.
 *
 * `content-type: application/json`, desi specul lor numeste `application/vnd.api+json`:
 * SDK-ul lor oficial de Node (axios, fara antet pus de mana) trimite chiar `application/json`.
 */
export async function klaviyoRequest<T = unknown>(
  creds: Creds,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T } | { error: string; status?: number }> {
  if (!creds.api_key) return { error: "Klaviyo nu este configurat." };
  const r = await cerereExterna(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Klaviyo-API-Key ${creds.api_key}`,
      revision: REVISION,
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if ("retea" in r) return { error: "Eroare de retea la conectarea cu Klaviyo." };
  if (!r.raspuns.ok) return { error: klaviyoError(r.raspuns.status, r.raspuns.json), status: r.raspuns.status };
  return { data: r.raspuns.json as T };
}

/** Validate a private API key and return the account it belongs to (used on connect). */
export async function pingKlaviyo(
  apiKey: string,
): Promise<{ account_name: string } | { error: string }> {
  const key = apiKey.trim();
  if (!key) return { error: "Introdu cheia API Klaviyo." };
  if (!key.startsWith("pk_")) return { error: "Foloseste cheia API privata Klaviyo (incepe cu pk_), nu cheia publica." };
  const res = await klaviyoRequest<{ data?: Array<{ attributes?: { contact_information?: { organization_name?: string } } }> }>(
    { api_key: key }, "GET", "/accounts",
  );
  if ("error" in res) return res;
  const acct = res.data?.data?.[0];
  if (!acct) return { error: "Nu am putut valida contul Klaviyo." };
  /*
   * ⚠ Si citirea profilelor, fiindca de ea atarna garda de dezabonare (`profileSuprimate`):
   * fara `profiles:read`, fiecare abonare ar fi refuzata. Mai bine aflat aici, la conectare,
   * decat din jurnalul de erori, dupa luni de lista goala.
   */
  const profile = await klaviyoRequest({ api_key: key }, "GET", "/profiles?page[size]=1");
  if ("error" in profile) {
    return profile.status === 403
      ? { error: "Cheia Klaviyo nu poate citi profilele (profiles:read). Fara ea nu putem verifica cine s-a dezabonat, deci nu putem abona pe nimeni." }
      : profile;
  }
  return { account_name: acct.attributes?.contact_information?.organization_name ?? "" };
}

/** List the account's lists (cursor-paginated) for the picker. */
export async function getLists(creds: Creds): Promise<KlaviyoList[] | { error: string }> {
  const out: KlaviyoList[] = [];
  let path: string = "/lists";
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

/** Starea de email marketing a unui profil, asa cum o da `additional-fields[profile]=subscriptions`. */
export interface KlaviyoEmailMarketing {
  consent?: string | null;
  can_receive_email_marketing?: boolean | null;
  suppression?: Array<{ reason?: string | null }> | null;
  list_suppressions?: Array<{ list_id?: string | null; reason?: string | null }> | null;
}

/**
 * Profilul asta NU are voie sa fie abonat?
 *
 * Da, daca are o suprimare GLOBALA (`HARD_BOUNCE`, `INVALID_EMAIL`, `SPAM_COMPLAINT`,
 * `UNSUBSCRIBE`, `USER_SUPPRESSED`), daca s-a dezabonat, sau daca e suprimat chiar pe lista
 * noastra. Abonarea lor le-ar STERGE suprimarea (vezi capul fisierului).
 */
export function profilSuprimat(m: KlaviyoEmailMarketing | null | undefined, listId: string | undefined): boolean {
  if (!m) return false;
  if (m.can_receive_email_marketing === false) return true;
  if ((m.suppression ?? []).length > 0) return true;
  if ((m.consent ?? "").toUpperCase() === "UNSUBSCRIBED") return true;
  return !!listId && (m.list_suppressions ?? []).some((s) => s?.list_id === listId);
}

/** Cate emailuri intra intr-un filtru `any(email, [...])`: cat o pagina (`page[size]` maxim 100). */
const EMAILURI_PE_CITIRE = 100;

/**
 * Care dintre aceste emailuri sunt suprimate in contul Klaviyo al comerciantului.
 *
 * Un email fara profil nu e suprimat: e un contact nou. Intoarce `{ error }` cand starea nu
 * s-a putut afla, iar atunci apelantul NU aboneaza: un abonat pierdut se recupereaza, un
 * reclamant de spam readus in lista strica reputatia de expeditor a comerciantului.
 */
export async function profileSuprimate(
  config: KlaviyoConfig,
  emails: string[],
): Promise<{ suprimate: Set<string> } | { error: string; status?: number }> {
  const suprimate = new Set<string>();
  for (let i = 0; i < emails.length; i += EMAILURI_PE_CITIRE) {
    const bucata = emails.slice(i, i + EMAILURI_PE_CITIRE);
    const qs = new URLSearchParams({
      filter: `any(email,[${bucata.map((e) => JSON.stringify(e)).join(",")}])`,
      "additional-fields[profile]": "subscriptions",
      "page[size]": String(EMAILURI_PE_CITIRE),
    });
    let path: string | null = `/profiles?${qs.toString()}`;
    for (let pagini = 0; path && pagini < 5; pagini++) {
      const res: { data: unknown } | { error: string; status?: number } = await klaviyoRequest<unknown>(config, "GET", path);
      if ("error" in res) return res;
      const corp = res.data as {
        data?: Array<{ attributes?: { email?: string | null; subscriptions?: { email?: { marketing?: KlaviyoEmailMarketing } } } }>;
        links?: { next?: string | null };
      } | null;
      for (const p of corp?.data ?? []) {
        const email = (p.attributes?.email ?? "").trim().toLowerCase();
        if (email && profilSuprimat(p.attributes?.subscriptions?.email?.marketing, config.list_id)) suprimate.add(email);
      }
      const next = corp?.links?.next;
      const idx = next ? next.indexOf("/api") : -1;
      path = next && idx >= 0 ? next.slice(idx + 4) : null;
    }
  }
  return { suprimate };
}

/**
 * Subscribe one or more emails to the configured list with email-marketing consent
 * (POST /profile-subscription-bulk-create-jobs: async job, ≤1000 profiles each).
 * No `historical_import`, so the list's double opt-in setting is honored.
 *
 * ⚠ Intai se intreaba starea fiecarui profil si se sar cei suprimati: capatul asta le-ar
 * sterge suprimarea. `custom_source` ramane pe inregistrarea de consimtamant din Klaviyo,
 * ca sa se vada de unde a venit acordul.
 */
export async function subscribeProfiles(
  config: KlaviyoConfig,
  emails: string[],
  sursa?: string,
): Promise<{ ok: true; sariti: number } | { error: string; status?: number }> {
  if (!config.list_id) return { error: "Nicio lista selectata." };
  const clean = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))));
  if (clean.length === 0) return { ok: true, sariti: 0 };

  const verificare = await profileSuprimate(config, clean);
  if ("error" in verificare) {
    return { error: `Nu am putut verifica dezabonarile in Klaviyo, deci nu am abonat pe nimeni: ${verificare.error}`, status: verificare.status };
  }
  const deAbonat = clean.filter((e) => !verificare.suprimate.has(e));
  const sariti = clean.length - deAbonat.length;

  const CHUNK = 900; // Klaviyo max is 1000 per job
  for (let i = 0; i < deAbonat.length; i += CHUNK) {
    const body = {
      data: {
        type: "profile-subscription-bulk-create-job",
        attributes: {
          ...(sursa ? { custom_source: sursa } : {}),
          profiles: {
            data: deAbonat.slice(i, i + CHUNK).map((email) => ({
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
    const res = await klaviyoRequest(config, "POST", "/profile-subscription-bulk-create-jobs", body);
    if ("error" in res) return res;
  }
  return { ok: true, sariti };
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
