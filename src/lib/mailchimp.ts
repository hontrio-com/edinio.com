// Mailchimp Marketing API v3 client (server-only — holds the merchant's API key
// and uses node crypto). BYO model: each store connects its own Mailchimp account.
// We only sync subscribers into a chosen audience; campaigns run inside Mailchimp.
//
// Auth: API keys are formatted `key-dc` (e.g. "...-us21"); the datacenter suffix
// after the last dash is the server prefix and the base URL host. We send it as a
// Bearer token. Docs: https://mailchimp.com/developer/marketing/docs/fundamentals/
import { createHash } from "crypto";

export interface MailchimpSources {
  checkout?: boolean;
  popup?: boolean;
  forms?: boolean;
}

/** Merge tags to write name/phone into (Mailchimp defaults are FNAME/LNAME/PHONE). */
export interface MailchimpMergeMap {
  fname?: string;
  lname?: string;
  phone?: string;
}

export interface MailchimpConfig {
  enabled: boolean;
  api_key: string;          // secret — server-only, never sent to the browser
  server_prefix: string;    // e.g. "us21", derived from the API key
  account_name?: string;
  account_id?: string;
  audience_id?: string;     // selected list
  audience_name?: string;
  double_optin?: boolean;   // pending (confirmation email) vs subscribed
  default_tags?: string[];
  sources?: MailchimpSources;
  merge_map?: MailchimpMergeMap;
  last_sync_at?: string;
  // ── Phase 2 ──────────────────────────────────────────────────────────────
  webhook_secret?: string;          // identifies the store on inbound unsubscribe webhooks
  ecommerce_sync?: boolean;         // also sync products + orders to a Mailchimp store
  ecommerce_store_id?: string;      // the Mailchimp e-commerce store id we created
  marketing_permission_ids?: string[]; // GDPR audiences: permission ids to grant on consent
}

export interface MailchimpAudience {
  id: string;
  name: string;
  member_count: number;
}

export interface MailchimpMemberInput {
  email: string;
  fname?: string;
  lname?: string;
  phone?: string;
  tags?: string[];
  language?: string;
  /** Override the config default (subscribed / pending). */
  status?: "subscribed" | "pending";
}

type Creds = Pick<MailchimpConfig, "api_key" | "server_prefix">;

const STATUS_MAP: Record<number, string> = {
  401: "Cheie API invalida.",
  403: "Acces interzis. Verifica permisiunile contului Mailchimp.",
  404: "Resursa nu a fost gasita (audienta sau cont inexistent).",
  429: "Prea multe cereri catre Mailchimp. Incearca din nou in cateva momente.",
};

/** Datacenter/server prefix is the part after the last dash of the API key. */
export function serverPrefixFromKey(apiKey: string): string | null {
  const key = (apiKey ?? "").trim();
  const dash = key.lastIndexOf("-");
  if (dash === -1 || dash === key.length - 1) return null;
  return key.slice(dash + 1);
}

/** Mailchimp identifies members by the MD5 of the lowercased, trimmed email. */
export function subscriberHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

function baseUrl(prefix: string): string {
  return `https://${prefix}.api.mailchimp.com/3.0`;
}

function mcError(status: number, json: unknown): string {
  if (json && typeof json === "object") {
    const o = json as { title?: string; detail?: string; errors?: Array<{ field?: string; message?: string }> };
    if (Array.isArray(o.errors) && o.errors.length > 0) {
      const first = o.errors[0];
      if (first?.message) return `${o.title ?? "Eroare Mailchimp"}: ${first.field ? `${first.field} - ` : ""}${first.message}`;
    }
    if (o.detail) return o.detail;
    if (o.title) return o.title;
  }
  return STATUS_MAP[status] ?? `Eroare Mailchimp (${status}).`;
}

export async function mcRequest<T = unknown>(
  creds: Creds,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T } | { error: string }> {
  if (!creds.api_key || !creds.server_prefix) return { error: "Mailchimp nu este configurat." };
  try {
    const res = await fetch(`${baseUrl(creds.server_prefix)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${creds.api_key}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try { json = JSON.parse(text); } catch { json = null; }
    }
    if (!res.ok) return { error: mcError(res.status, json) };
    return { data: json as T };
  } catch {
    return { error: "Eroare de retea la conectarea cu Mailchimp." };
  }
}

/** Validate an API key and return the account it belongs to (used on connect). */
export async function pingMailchimp(
  apiKey: string,
): Promise<{ account_id: string; account_name: string; server_prefix: string } | { error: string }> {
  const prefix = serverPrefixFromKey(apiKey);
  if (!prefix) return { error: "Cheia API Mailchimp este invalida (lipseste sufixul de tip -us21)." };
  const res = await mcRequest<{ account_id?: string; account_name?: string }>(
    { api_key: apiKey.trim(), server_prefix: prefix },
    "GET",
    "/?fields=account_id,account_name",
  );
  if ("error" in res) return res;
  if (!res.data?.account_id) return { error: "Nu am putut valida contul Mailchimp." };
  return { account_id: res.data.account_id, account_name: res.data.account_name ?? "", server_prefix: prefix };
}

/** List the account's audiences (lists) for the picker. */
export async function getAudiences(creds: Creds): Promise<MailchimpAudience[] | { error: string }> {
  const res = await mcRequest<{ lists?: Array<{ id: string; name: string; stats?: { member_count?: number } }> }>(
    creds,
    "GET",
    "/lists?fields=lists.id,lists.name,lists.stats.member_count&count=100",
  );
  if ("error" in res) return res;
  return (res.data?.lists ?? []).map((l) => ({ id: l.id, name: l.name, member_count: l.stats?.member_count ?? 0 }));
}

/**
 * Discover the audience's GDPR marketing-permission IDs (from a sample member).
 * Empty when the audience is not GDPR-enabled or has no members yet. Best-effort.
 */
export async function getMarketingPermissionIds(config: MailchimpConfig): Promise<string[]> {
  if (!config.audience_id) return [];
  const res = await mcRequest<{ members?: Array<{ marketing_permissions?: Array<{ marketing_permission_id: string }> }> }>(
    config, "GET", `/lists/${config.audience_id}/members?fields=members.marketing_permissions&count=1`,
  );
  if ("error" in res) return [];
  const perms = res.data?.members?.[0]?.marketing_permissions ?? [];
  return perms.map((p) => p.marketing_permission_id).filter(Boolean);
}

function buildMergeFields(config: MailchimpConfig, m: { fname?: string; lname?: string; phone?: string }): Record<string, string> {
  const map = config.merge_map ?? {};
  const merge: Record<string, string> = {};
  if (m.fname) merge[map.fname || "FNAME"] = m.fname;
  if (m.lname) merge[map.lname || "LNAME"] = m.lname;
  if (m.phone) merge[map.phone || "PHONE"] = m.phone;
  return merge;
}

/**
 * Add or update a single subscriber (upsert). Uses `status_if_new` (NOT `status`)
 * so we never re-subscribe someone who previously unsubscribed or was cleaned —
 * existing members keep their current status; only brand-new ones get set.
 * Tags are applied best-effort (a tag failure never fails the subscribe).
 */
export async function upsertMember(
  config: MailchimpConfig,
  member: MailchimpMemberInput,
): Promise<{ ok: true } | { error: string }> {
  if (!config.audience_id) return { error: "Nicio audienta selectata." };
  const email = member.email.trim();
  if (!email) return { error: "Email lipsa." };

  const status = member.status ?? (config.double_optin ? "pending" : "subscribed");
  const merge_fields = buildMergeFields(config, member);
  const permIds = config.marketing_permission_ids ?? [];
  const body: Record<string, unknown> = {
    email_address: email,
    status_if_new: status,
    ...(Object.keys(merge_fields).length ? { merge_fields } : {}),
    ...(member.language ? { language: member.language } : {}),
    ...(permIds.length ? { marketing_permissions: permIds.map((id) => ({ marketing_permission_id: id, enabled: true })) } : {}),
  };

  const hash = subscriberHash(email);
  const res = await mcRequest<{ marketing_permissions?: Array<{ marketing_permission_id: string }> }>(
    config,
    "PUT",
    `/lists/${config.audience_id}/members/${hash}?skip_merge_validation=true`,
    body,
  );
  if ("error" in res) return res;

  // GDPR audience whose permission IDs we didn't know yet — grant consent from the response.
  if (permIds.length === 0 && (res.data?.marketing_permissions?.length ?? 0) > 0) {
    await mcRequest(config, "PATCH", `/lists/${config.audience_id}/members/${hash}`, {
      marketing_permissions: res.data!.marketing_permissions!.map((p) => ({ marketing_permission_id: p.marketing_permission_id, enabled: true })),
    });
  }

  const tags = [...(config.default_tags ?? []), ...(member.tags ?? [])].filter(Boolean);
  if (tags.length > 0) {
    await addTags(config, email, tags); // best-effort; ignore failure
  }
  return { ok: true };
}

/** Apply tags to a member (creates the tag if it does not exist). */
export async function addTags(
  config: MailchimpConfig,
  email: string,
  tags: string[],
): Promise<{ ok: true } | { error: string }> {
  if (!config.audience_id) return { error: "Nicio audienta selectata." };
  const hash = subscriberHash(email);
  const body = { tags: tags.map((name) => ({ name, status: "active" as const })) };
  const res = await mcRequest(config, "POST", `/lists/${config.audience_id}/members/${hash}/tags`, body);
  if ("error" in res) return res;
  return { ok: true };
}

/**
 * Bulk add/update members via the synchronous batch endpoint (POST /lists/{id}),
 * chunked at 500. `update_existing` upserts; `status_if_new` protects unsubscribes.
 * In this batch endpoint, member `tags` is an array of plain strings.
 */
export async function batchUpsert(
  config: MailchimpConfig,
  members: MailchimpMemberInput[],
): Promise<{ created: number; updated: number; errors: number } | { error: string }> {
  if (!config.audience_id) return { error: "Nicio audienta selectata." };
  const CHUNK = 500;
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < members.length; i += CHUNK) {
    const chunk = members.slice(i, i + CHUNK);
    const body = {
      members: chunk.map((m) => {
        const merge_fields = buildMergeFields(config, m);
        const tags = [...(config.default_tags ?? []), ...(m.tags ?? [])].filter(Boolean);
        const permIds = config.marketing_permission_ids ?? [];
        return {
          email_address: m.email.trim(),
          status_if_new: m.status ?? (config.double_optin ? "pending" : "subscribed"),
          ...(Object.keys(merge_fields).length ? { merge_fields } : {}),
          ...(tags.length ? { tags } : {}),
          ...(permIds.length ? { marketing_permissions: permIds.map((id) => ({ marketing_permission_id: id, enabled: true })) } : {}),
        };
      }),
      update_existing: true,
      skip_merge_validation: true,
    };
    const res = await mcRequest<{ total_created?: number; total_updated?: number; error_count?: number }>(
      config,
      "POST",
      `/lists/${config.audience_id}`,
      body,
    );
    if ("error" in res) {
      errors += chunk.length;
      continue;
    }
    created += res.data?.total_created ?? 0;
    updated += res.data?.total_updated ?? 0;
    errors += res.data?.error_count ?? 0;
  }
  return { created, updated, errors };
}

/** Split a full name into Mailchimp FNAME / LNAME parts. */
export function splitName(name?: string | null): { fname?: string; lname?: string } {
  const n = (name ?? "").trim();
  if (!n) return {};
  const parts = n.split(/\s+/);
  if (parts.length === 1) return { fname: parts[0] };
  return { fname: parts[0], lname: parts.slice(1).join(" ") };
}

/** Client-safe view of the config — NEVER exposes the API key. */
export interface MailchimpPublicConfig {
  enabled: boolean;
  connected: boolean;
  account_name?: string;
  audience_id?: string;
  audience_name?: string;
  double_optin: boolean;
  default_tags: string[];
  sources: { checkout: boolean; popup: boolean; forms: boolean };
  ecommerce_sync: boolean;
  last_sync_at?: string;
}

export function toPublicMailchimpConfig(config: MailchimpConfig | null): MailchimpPublicConfig {
  return {
    enabled: !!config?.enabled,
    connected: !!(config?.api_key && config?.server_prefix),
    account_name: config?.account_name,
    audience_id: config?.audience_id,
    audience_name: config?.audience_name,
    double_optin: config?.double_optin ?? true,
    default_tags: config?.default_tags ?? [],
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

/** Public URL Mailchimp calls on unsubscribe/cleaned; carries the per-store secret. */
export function mailchimpWebhookUrl(secret?: string | null): string | null {
  if (!secret) return null;
  return `${SITE_URL}/api/mailchimp/webhook?secret=${encodeURIComponent(secret)}`;
}

/** Register the unsubscribe webhook on the audience (idempotent by URL). */
export async function registerWebhook(config: MailchimpConfig, url: string): Promise<{ ok: true } | { error: string }> {
  if (!config.audience_id) return { error: "Nicio audienta selectata." };
  // Skip if a webhook with this URL already exists (avoid duplicates on re-save).
  const existing = await mcRequest<{ webhooks?: Array<{ url?: string }> }>(config, "GET", `/lists/${config.audience_id}/webhooks`);
  if (!("error" in existing) && (existing.data?.webhooks ?? []).some((w) => w.url === url)) return { ok: true };
  const res = await mcRequest(config, "POST", `/lists/${config.audience_id}/webhooks`, {
    url,
    events: { subscribe: true, unsubscribe: true, profile: false, upemail: false, cleaned: true, campaign: false },
    // User/admin-initiated changes only — not our own API writes (avoids echo loops).
    sources: { user: true, admin: true, api: false },
  });
  if ("error" in res) return res;
  return { ok: true };
}
