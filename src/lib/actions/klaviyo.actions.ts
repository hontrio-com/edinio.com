"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  pingKlaviyo, getLists, subscribeProfiles, toPublicKlaviyoConfig,
  type KlaviyoConfig, type KlaviyoList, type KlaviyoPublicConfig,
} from "@/lib/klaviyo";

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

async function readConfig(supabase: Supa, businessId: string): Promise<KlaviyoConfig | null> {
  const { data } = await supabase
    .from("store_settings").select("klaviyo_config").eq("business_id", businessId).single();
  return (data?.klaviyo_config as KlaviyoConfig | null) ?? null;
}

// Read-modify-write the jsonb (create the row if the store has no settings yet).
async function writeConfig(supabase: Supa, businessId: string, next: KlaviyoConfig | null): Promise<boolean> {
  const { data } = await supabase
    .from("store_settings").select("business_id").eq("business_id", businessId).single();
  const exists = !!data?.business_id;
  const { error } = exists
    ? await supabase.from("store_settings").update({ klaviyo_config: next as never }).eq("business_id", businessId)
    : await supabase.from("store_settings").insert({ business_id: businessId, klaviyo_config: next as never });
  return !error;
}

function revalidate() {
  revalidatePath("/dashboard/features/klaviyo");
  revalidatePath("/dashboard/features");
}

/** Validate a private API key, store it, and return the account + its lists. */
export async function connectKlaviyo(
  businessId: string,
  apiKey: string,
): Promise<{ config: KlaviyoPublicConfig; lists: KlaviyoList[] } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const key = apiKey.trim();
  if (!key) return { error: "Introdu cheia API Klaviyo." };

  const ping = await pingKlaviyo(key);
  if ("error" in ping) return ping;

  const current = await readConfig(owned.supabase, businessId);
  const next: KlaviyoConfig = {
    ...(current ?? { enabled: false, api_key: "" }),
    enabled: true,
    api_key: key,
    account_name: ping.account_name,
  };
  if (!(await writeConfig(owned.supabase, businessId, next))) return { error: "Eroare la salvare." };

  const lists = await getLists(next);
  revalidate();
  return { config: toPublicKlaviyoConfig(next), lists: "error" in lists ? [] : lists };
}

/** Re-fetch the account's lists (for the picker / refresh). */
export async function getKlaviyoLists(
  businessId: string,
): Promise<{ lists: KlaviyoList[] } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const config = await readConfig(owned.supabase, businessId);
  if (!config?.api_key) return { error: "Conecteaza-ti contul Klaviyo intai." };
  const res = await getLists(config);
  if ("error" in res) return res;
  return { lists: res };
}

/** Persist list choice + sync options (never touches the stored API key). */
export async function saveKlaviyoSettings(
  businessId: string,
  settings: {
    list_id?: string;
    list_name?: string;
    sources?: { checkout?: boolean; popup?: boolean; forms?: boolean };
    ecommerce_sync?: boolean;
  },
): Promise<{ config: KlaviyoPublicConfig } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const current = await readConfig(owned.supabase, businessId);
  if (!current?.api_key) return { error: "Conecteaza-ti contul Klaviyo intai." };

  const next: KlaviyoConfig = {
    ...current,
    list_id: settings.list_id ?? current.list_id,
    list_name: settings.list_name ?? current.list_name,
    sources: { ...current.sources, ...settings.sources },
    ecommerce_sync: settings.ecommerce_sync ?? current.ecommerce_sync,
  };
  if (!(await writeConfig(owned.supabase, businessId, next))) return { error: "Eroare la salvare." };

  revalidate();
  return { config: toPublicKlaviyoConfig(next) };
}

/** Clear the connection entirely. */
export async function disconnectKlaviyo(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  if (!(await writeConfig(owned.supabase, businessId, null))) return { error: "Eroare la salvare." };
  revalidate();
  return { success: true };
}

/**
 * One-off bulk sync of existing customers (from orders): subscribe every unique email to
 * the list with marketing consent (async subscribe job, respects Klaviyo suppression).
 * The merchant confirms in the UI that they have consent to email these people.
 */
export async function syncExistingCustomers(
  businessId: string,
): Promise<{ total: number } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const config = await readConfig(owned.supabase, businessId);
  if (!config?.enabled || !config.api_key || !config.list_id) {
    return { error: "Conecteaza contul si alege o lista intai." };
  }

  const { data: orders } = await owned.supabase
    .from("orders")
    .select("customer_email")
    .eq("business_id", businessId)
    .not("customer_email", "is", null);

  const emails = Array.from(new Set(
    (orders ?? []).map((o) => (o.customer_email ?? "").trim().toLowerCase()).filter(Boolean),
  ));
  if (emails.length === 0) return { total: 0 };

  const res = await subscribeProfiles(config, emails);
  if ("error" in res) return res;

  await writeConfig(owned.supabase, businessId, { ...config, last_sync_at: new Date().toISOString() });
  revalidate();
  return { total: emails.length };
}
