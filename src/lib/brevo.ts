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

import { cerereExterna } from "@/lib/email-marketing/transport";
import { adresaPublica } from "@/lib/adresa-publica";

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
  /*
   * Confirmarea dubla (double opt-in). ⚠ La Brevo NU e o setare a listei: un contact trimis
   * prin `POST /contacts` intra direct. Confirmarea se cere prin `POST /contacts/doubleOptinConfirmation`,
   * cu un sablon DOI facut de comerciant in Brevo. Pana pe 18.09.2026 panoul ii spunea
   * comerciantului sa o „activeze pe lista”, adica ceva ce nu exista.
   */
  double_optin?: boolean;
  doi_template_id?: number;
  doi_template_name?: string;
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
 * `{ error, status }` otherwise. Exported for the e-commerce module. Termen, fara
 * redirectari si reluare la 429: vezi `lib/email-marketing/transport.ts`.
 */
export async function brevoRequest<T = unknown>(
  creds: Creds,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T } | { error: string; status?: number }> {
  if (!creds.api_key) return { error: "Brevo nu este configurat." };
  const r = await cerereExterna(`${API_BASE}${path}`, {
    method,
    headers: {
      "api-key": creds.api_key,
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if ("retea" in r) return { error: "Eroare de retea la conectarea cu Brevo." };
  if (!r.raspuns.ok) return { error: brevoError(r.raspuns.status, r.raspuns.json), status: r.raspuns.status };
  return { data: r.raspuns.json as T };
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
 * Contact prin confirmare dubla (`POST /contacts/doubleOptinConfirmation`, campuri cerute:
 * `email`, `includeListIds`, `templateId`, `redirectionUrl`). Brevo trimite emailul de
 * confirmare din sablonul DOI al comerciantului, iar contactul intra in lista ABIA dupa click.
 *
 * Aceeasi reluare ca `upsertContact`: un telefon respins de atributul strict `SMS` sau un
 * atribut necunoscut ar respinge tot contactul, deci se reincearca doar cu numele.
 */
export async function createDoiContact(
  config: BrevoConfig,
  member: BrevoContactInput,
  redirectionUrl: string,
): Promise<{ ok: true } | { error: string; status?: number }> {
  if (!config.list_id) return { error: "Nicio lista selectata." };
  if (!config.doi_template_id) return { error: "Niciun sablon de confirmare dubla ales." };
  const email = member.email.trim();
  if (!email) return { error: "Email lipsa." };

  const corp = (attributes: Record<string, string>) => ({
    email,
    includeListIds: [config.list_id],
    templateId: config.doi_template_id,
    redirectionUrl,
    ...(Object.keys(attributes).length ? { attributes } : {}),
  });
  const attributes = buildAttributes(member);
  const res = await brevoRequest(config, "POST", "/contacts/doubleOptinConfirmation", corp(attributes));
  if (!("error" in res)) return { ok: true };

  const sentRisky = Object.keys(attributes).some((k) => k !== "FIRSTNAME" && k !== "LASTNAME");
  if (!sentRisky) return res;
  const safe: Record<string, string> = {};
  if (attributes.FIRSTNAME) safe.FIRSTNAME = attributes.FIRSTNAME;
  if (attributes.LASTNAME) safe.LASTNAME = attributes.LASTNAME;
  const retry = await brevoRequest(config, "POST", "/contacts/doubleOptinConfirmation", corp(safe));
  if ("error" in retry) return res;
  return { ok: true };
}

export interface BrevoTemplate {
  id: number;
  name: string;
}

/** Sabloanele active ale contului, pentru alegerea sablonului de confirmare dubla. */
export async function getTemplates(creds: Creds): Promise<BrevoTemplate[] | { error: string; status?: number }> {
  const out: BrevoTemplate[] = [];
  for (let offset = 0; offset <= 5000; offset += 1000) {
    const res = await brevoRequest<{ templates?: Array<{ id: number; name?: string }>; count?: number }>(
      creds, "GET", `/smtp/templates?templateStatus=true&limit=1000&offset=${offset}`,
    );
    if ("error" in res) return offset === 0 ? res : out;
    const pagina = res.data?.templates ?? [];
    for (const t of pagina) out.push({ id: t.id, name: t.name ?? `Sablon ${t.id}` });
    if (pagina.length < 1000) break;
  }
  return out;
}

/**
 * E sablonul asta unul de confirmare dubla? `doiTemplate` vine NUMAI la citirea unui singur
 * sablon (spec: „available only in case of single template detail call”), nu in lista.
 * Un sablon obisnuit ar fi trimis un email fara linkul de confirmare, deci nimeni n-ar mai
 * fi intrat in lista.
 */
export async function verificaSablonDoi(
  creds: Creds,
  templateId: number,
): Promise<{ ok: true; name: string } | { error: string; status?: number }> {
  const res = await brevoRequest<{ id?: number; name?: string; doiTemplate?: boolean; isActive?: boolean }>(
    creds, "GET", `/smtp/templates/${encodeURIComponent(String(templateId))}`,
  );
  if ("error" in res) return res;
  if (res.data?.doiTemplate !== true) {
    return { error: "Sablonul ales nu e unul de confirmare dubla. In Brevo, fa un sablon din „Double opt-in confirmation” (cu linkul de confirmare in el)." };
  }
  if (res.data?.isActive === false) return { error: "Sablonul de confirmare dubla e inactiv in Brevo." };
  return { ok: true, name: res.data?.name ?? `Sablon ${templateId}` };
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
  double_optin: boolean;
  doi_template_id?: number;
  doi_template_name?: string;
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
    double_optin: !!config?.double_optin && !!config?.doi_template_id,
    doi_template_id: config?.doi_template_id,
    doi_template_name: config?.doi_template_name,
  };
}

/**
 * Public URL Brevo calls on unsubscribe; carries the per-store secret (Brevo does not sign).
 *
 * ⚠⚠ PE GAZDA CANONICA (`adresaPublica`). Pana pe 18.09.2026 se facea din
 * `NEXT_PUBLIC_SITE_URL`, adica apexul `https://edinio.com`, care raspunde 308 catre `www`
 * (masurat: si la GET, si la POST). Un furnizor care nu urmeaza redirectarile nu ne mai gasea,
 * deci dezabonarile se pierdeau fara nicio urma.
 */
export function brevoWebhookUrl(secret?: string | null): string | null {
  if (!secret) return null;
  return `${adresaPublica()}/api/brevo/webhook?secret=${encodeURIComponent(secret)}`;
}

/**
 * Evenimentele de marketing pe care le ascultam. Toate trei inseamna „nu-i mai trimite”:
 * dezabonare, respingere definitiva, reclamatie de spam. In corpul webhookului vin scrise
 * altfel (`unsubscribe`, `hard_bounce`, `spam`): vezi ruta.
 */
export const EVENIMENTE_WEBHOOK = ["unsubscribed", "hardBounce", "spam"] as const;

/**
 * Evenimentul primit inseamna „nu-i mai trimite nimic”? Numele din CORP difera de cele de la
 * inregistrare (documentatia lor de webhookuri de marketing): `unsubscribe`, `hard_bounce`,
 * `spam`. Se compara fara majuscule si fara separatori, ca `hardBounce` si `hard_bounce`
 * sa insemne acelasi lucru. Intoarce motivul scris in `brevo_suppressions`, sau `null`.
 */
export function motivDeSuprimare(event: string): string | null {
  const e = event.toLowerCase().replace(/[^a-z]/g, "");
  if (e.startsWith("unsubscribe")) return "unsubscribed";
  if (e === "hardbounce") return "hard_bounce";
  if (e === "spam") return "spam";
  return null;
}

/**
 * Register the account-level marketing webhook (idempotent by URL). Brevo webhooks are
 * per-account (not per-list), so one registration covers the store. Un webhook gasit dupa
 * adresa, dar cu mai putine evenimente (inregistrat inainte de 18.09.2026, doar
 * `unsubscribed`), se actualizeaza, nu se dubleaza. Returns the webhook id so we can delete
 * it on disconnect.
 */
export async function registerWebhook(
  config: BrevoConfig,
  url: string,
): Promise<{ ok: true; id?: number } | { error: string; status?: number }> {
  const existing = await brevoRequest<{ webhooks?: Array<{ id: number; url?: string; events?: string[] }> }>(config, "GET", "/webhooks?type=marketing");
  if (!("error" in existing)) {
    const found = (existing.data?.webhooks ?? []).find((w) => w.url === url);
    if (found) {
      const are = new Set(found.events ?? []);
      if (EVENIMENTE_WEBHOOK.every((e) => are.has(e))) return { ok: true, id: found.id };
      const upd = await brevoRequest(config, "PUT", `/webhooks/${found.id}`, {
        events: Array.from(new Set([...are, ...EVENIMENTE_WEBHOOK])),
        url,
        description: "Edinio: dezabonari, respingeri, spam",
      });
      if ("error" in upd) return upd;
      return { ok: true, id: found.id };
    }
  }
  const res = await brevoRequest<{ id?: number }>(config, "POST", "/webhooks", {
    type: "marketing",
    events: [...EVENIMENTE_WEBHOOK],
    url,
    description: "Edinio: dezabonari, respingeri, spam",
  });
  if ("error" in res) return res;
  return { ok: true, id: res.data?.id };
}

/**
 * Aplicatia eCommerce a contului si moneda in care Brevo citeste sumele.
 *
 * ⚠⚠ FARA ACTIVARE, NIMIC DIN COMERT NU MERGE. Documentatia lor („Import your orders”): „To use these
 * endpoints, your account must have the Brevo eCommerce application enabled”. Pana pe 18.09.2026 n-o
 * activam niciodata: pe un cont nou, fiecare produs si fiecare comanda ar fi fost respinse. Activarea
 * dureaza („eCommerce activation is in process, please wait for 5 minutes”), iar pana atunci
 * capetele raspund 403; coada de comenzi le reia singura.
 *
 * ⚠ MONEDA. Comenzile Brevo n-au camp de moneda: suma se citeste in moneda de AFISARE a contului.
 * Trimitem lei, deci contul trebuie sa arate lei, altfel venitul apare in alta moneda.
 */
export const MONEDA_MAGAZIN = "RON";

export async function asiguraComertul(
  creds: Creds,
): Promise<{ ok: true; moneda: "setata" | "era" | "in-activare" } | { error: string; status?: number }> {
  const act = await brevoRequest(creds, "POST", "/ecommerce/activate");
  /* Deja activ: unele conturi raspund cu o eroare de „already”, care e chiar starea dorita. */
  if ("error" in act && act.status !== 400 && act.status !== 409) return act;

  const cur = await brevoRequest<{ code?: string }>(creds, "GET", "/ecommerce/config/displayCurrency");
  if ("error" in cur) {
    /* 403 = „eCommerce is not activated” inca: moneda se pune la urmatoarea sincronizare. */
    return cur.status === 403 ? { ok: true, moneda: "in-activare" } : cur;
  }
  if ((cur.data?.code ?? "").toUpperCase() === MONEDA_MAGAZIN) return { ok: true, moneda: "era" };
  const set = await brevoRequest(creds, "POST", "/ecommerce/config/displayCurrency", { code: MONEDA_MAGAZIN });
  if ("error" in set) return set.status === 403 ? { ok: true, moneda: "in-activare" } : set;
  return { ok: true, moneda: "setata" };
}

/** Remove a previously registered webhook (best-effort, on disconnect). */
export async function deleteWebhook(config: BrevoConfig, id?: number): Promise<void> {
  if (!id) return;
  await brevoRequest(config, "DELETE", `/webhooks/${id}`);
}
