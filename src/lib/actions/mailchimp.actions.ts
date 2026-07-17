"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import {
  pingMailchimp, getAudiences, batchUpsert, splitName, toPublicMailchimpConfig,
  mailchimpWebhookUrl, registerWebhook, getMarketingPermissionIds,
  type MailchimpConfig, type MailchimpAudience, type MailchimpMemberInput, type MailchimpPublicConfig,
} from "@/lib/mailchimp";
import { ensureStore } from "@/lib/mailchimp-ecommerce";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

type Supa = Awaited<ReturnType<typeof createClient>>;

async function requireOwned(businessId: string): Promise<{ supabase: Supa } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };
  return { supabase };
}

async function readConfig(supabase: Supa, businessId: string): Promise<MailchimpConfig | null> {
  const { data } = await supabase
    .from("store_settings").select("mailchimp_config").eq("business_id", businessId).single();
  return (data?.mailchimp_config as MailchimpConfig | null) ?? null;
}

// Read-modify-write the jsonb (create the row if the store has no settings yet).
async function writeConfig(supabase: Supa, businessId: string, next: MailchimpConfig | null): Promise<boolean> {
  const { data } = await supabase
    .from("store_settings").select("business_id").eq("business_id", businessId).single();
  const exists = !!data?.business_id;
  const { error } = exists
    ? await supabase.from("store_settings").update({ mailchimp_config: next as never }).eq("business_id", businessId)
    : await supabase.from("store_settings").insert({ business_id: businessId, mailchimp_config: next as never });
  return !error;
}

function revalidate() {
  revalidatePath("/dashboard/features/mailchimp");
  revalidatePath("/dashboard/features");
}

/** Validate an API key, store it, and return the account + its audiences. */
export async function connectMailchimp(
  businessId: string,
  apiKey: string,
): Promise<{ config: MailchimpPublicConfig; audiences: MailchimpAudience[] } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const key = apiKey.trim();
  if (!key) return { error: "Introdu cheia API Mailchimp." };

  const ping = await pingMailchimp(key);
  if ("error" in ping) return ping;

  const current = await readConfig(owned.supabase, businessId);
  const next: MailchimpConfig = {
    ...(current ?? { enabled: false, api_key: "", server_prefix: "" }),
    enabled: true,
    api_key: key,
    server_prefix: ping.server_prefix,
    account_id: ping.account_id,
    account_name: ping.account_name,
    double_optin: current?.double_optin ?? true,
  };
  if (!(await writeConfig(owned.supabase, businessId, next))) return { error: "Eroare la salvare." };

  const audiences = await getAudiences(next);
  revalidate();
  return { config: toPublicMailchimpConfig(next), audiences: "error" in audiences ? [] : audiences };
}

/** Re-fetch the account's audiences (for the picker / refresh). */
export async function getMailchimpAudiences(
  businessId: string,
): Promise<{ audiences: MailchimpAudience[] } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const config = await readConfig(owned.supabase, businessId);
  if (!config?.api_key || !config?.server_prefix) return { error: "Conecteaza-ti contul Mailchimp intai." };
  const res = await getAudiences(config);
  if ("error" in res) return res;
  return { audiences: res };
}

/** Persist audience choice + sync options (never touches the stored API key). */
export async function saveMailchimpSettings(
  businessId: string,
  settings: {
    audience_id?: string;
    audience_name?: string;
    double_optin?: boolean;
    default_tags?: string[];
    sources?: { checkout?: boolean; popup?: boolean; forms?: boolean };
    ecommerce_sync?: boolean;
  },
): Promise<{ config: MailchimpPublicConfig } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const current = await readConfig(owned.supabase, businessId);
  if (!current?.api_key) return { error: "Conecteaza-ti contul Mailchimp intai." };

  const next: MailchimpConfig = {
    ...current,
    audience_id: settings.audience_id ?? current.audience_id,
    audience_name: settings.audience_name ?? current.audience_name,
    double_optin: settings.double_optin ?? current.double_optin,
    default_tags: settings.default_tags ?? current.default_tags,
    sources: { ...current.sources, ...settings.sources },
    ecommerce_sync: settings.ecommerce_sync ?? current.ecommerce_sync,
    // Ensure a webhook secret exists so we can receive unsubscribe events.
    webhook_secret: current.webhook_secret || randomUUID(),
  };

  // If e-commerce sync is on and no store exists yet, create it in Mailchimp (persist its id).
  if (next.ecommerce_sync && next.audience_id && !next.ecommerce_store_id) {
    const { data: biz } = await owned.supabase
      .from("businesses").select("store_name, business_name, custom_domain, slug, email").eq("id", businessId).single();
    const store = await ensureStore(next, businessId, {
      name: biz?.store_name || biz?.business_name || "Magazin",
      currency: "RON",
      domain: biz?.custom_domain ?? undefined,
      email: biz?.email ?? undefined,
    });
    if (!("error" in store)) next.ecommerce_store_id = store.storeId;
  }

  // Discover GDPR marketing-permission IDs (best-effort) so consent is granted on every synced subscriber.
  if (next.audience_id) {
    const permIds = await getMarketingPermissionIds(next);
    if (permIds.length) next.marketing_permission_ids = permIds;
  }

  if (!(await writeConfig(owned.supabase, businessId, next))) return { error: "Eroare la salvare." };

  // Register the unsubscribe webhook (best-effort) once an audience is chosen.
  if (next.audience_id) {
    const hookUrl = mailchimpWebhookUrl(next.webhook_secret);
    if (hookUrl) await registerWebhook(next, hookUrl);
  }

  revalidate();
  return { config: toPublicMailchimpConfig(next) };
}

/** Clear the connection entirely. */
export async function disconnectMailchimp(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  if (!(await writeConfig(owned.supabase, businessId, null))) return { error: "Eroare la salvare." };
  revalidate();
  return { success: true };
}

/**
 * One-off bulk sync of existing customers (from orders) into the audience.
 * Deduped by lowercased email, newest name/phone wins, tagged "Clienti".
 * The merchant confirms in the UI that they have consent to email these people.
 */
export async function syncExistingCustomers(
  businessId: string,
): Promise<{ created: number; updated: number; errors: number; total: number } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const config = await readConfig(owned.supabase, businessId);
  if (!config?.enabled || !config.api_key || !config.audience_id) {
    return { error: "Conecteaza contul si alege o audienta intai." };
  }

  // fetchAllRows: sync-ul trebuie sa acopere TOATE comenzile, nu doar primele
  // 1000 (cap-ul silentios PostgREST) — altfel clientii vechi lipsesc din lista.
  const [orders, sup] = await Promise.all([
    fetchAllRows("mailchimp.syncExistingCustomers.orders", (from, to) =>
      owned.supabase
        .from("orders")
        .select("customer_email, customer_name, customer_phone, created_at")
        .eq("business_id", businessId)
        .not("customer_email", "is", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
    ),
    fetchAllRows("mailchimp.syncExistingCustomers.suppressions", (from, to) =>
      owned.supabase.from("mailchimp_suppressions").select("email").eq("business_id", businessId).order("id").range(from, to)
    ),
  ]);
  const suppressed = new Set(sup.map((s) => s.email.toLowerCase()));

  const seen = new Set<string>();
  const members: MailchimpMemberInput[] = [];
  for (const o of orders) {
    const email = (o.customer_email ?? "").trim().toLowerCase();
    if (!email || seen.has(email) || suppressed.has(email)) continue;
    seen.add(email);
    const { fname, lname } = splitName(o.customer_name);
    members.push({ email, fname, lname, phone: o.customer_phone ?? undefined, tags: ["Clienti"] });
  }
  if (members.length === 0) return { created: 0, updated: 0, errors: 0, total: 0 };

  const res = await batchUpsert(config, members);
  if ("error" in res) return res;

  await writeConfig(owned.supabase, businessId, { ...config, last_sync_at: new Date().toISOString() });
  revalidate();
  return { ...res, total: members.length };
}
