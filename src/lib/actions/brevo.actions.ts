"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import {
  pingBrevo, getLists, ensureAttributes, importContacts, splitName, toPublicBrevoConfig,
  brevoWebhookUrl, registerWebhook, deleteWebhook,
  type BrevoConfig, type BrevoList, type BrevoContactInput, type BrevoPublicConfig,
} from "@/lib/brevo";

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

async function readConfig(supabase: Supa, businessId: string): Promise<BrevoConfig | null> {
  const { data } = await supabase
    .from("store_settings").select("brevo_config").eq("business_id", businessId).single();
  return (data?.brevo_config as BrevoConfig | null) ?? null;
}

// Read-modify-write the jsonb (create the row if the store has no settings yet).
async function writeConfig(supabase: Supa, businessId: string, next: BrevoConfig | null): Promise<boolean> {
  const { data } = await supabase
    .from("store_settings").select("business_id").eq("business_id", businessId).single();
  const exists = !!data?.business_id;
  const { error } = exists
    ? await supabase.from("store_settings").update({ brevo_config: next as never }).eq("business_id", businessId)
    : await supabase.from("store_settings").insert({ business_id: businessId, brevo_config: next as never });
  return !error;
}

function revalidate() {
  revalidatePath("/dashboard/features/brevo");
  revalidatePath("/dashboard/features");
}

/** Validate an API key, store it, and return the account + its lists. */
export async function connectBrevo(
  businessId: string,
  apiKey: string,
): Promise<{ config: BrevoPublicConfig; lists: BrevoList[] } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const key = apiKey.trim();
  if (!key) return { error: "Introdu cheia API Brevo." };

  const ping = await pingBrevo(key);
  if ("error" in ping) return ping;

  const current = await readConfig(owned.supabase, businessId);
  const next: BrevoConfig = {
    ...(current ?? { enabled: false, api_key: "" }),
    enabled: true,
    api_key: key,
    account_email: ping.account_email,
    account_name: ping.account_name,
  };
  if (!(await writeConfig(owned.supabase, businessId, next))) return { error: "Eroare la salvare." };

  // Ensure our custom segmentation attributes exist (best-effort) before any contact sync.
  await ensureAttributes(next);

  const lists = await getLists(next);
  revalidate();
  return { config: toPublicBrevoConfig(next), lists: "error" in lists ? [] : lists };
}

/** Re-fetch the account's lists (for the picker / refresh). */
export async function getBrevoLists(
  businessId: string,
): Promise<{ lists: BrevoList[] } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const config = await readConfig(owned.supabase, businessId);
  if (!config?.api_key) return { error: "Conecteaza-ti contul Brevo intai." };
  const res = await getLists(config);
  if ("error" in res) return res;
  return { lists: res };
}

/** Persist list choice + sync options (never touches the stored API key). */
export async function saveBrevoSettings(
  businessId: string,
  settings: {
    list_id?: number;
    list_name?: string;
    sources?: { checkout?: boolean; popup?: boolean; forms?: boolean };
    ecommerce_sync?: boolean;
  },
): Promise<{ config: BrevoPublicConfig } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const current = await readConfig(owned.supabase, businessId);
  if (!current?.api_key) return { error: "Conecteaza-ti contul Brevo intai." };

  const next: BrevoConfig = {
    ...current,
    list_id: settings.list_id ?? current.list_id,
    list_name: settings.list_name ?? current.list_name,
    sources: { ...current.sources, ...settings.sources },
    ecommerce_sync: settings.ecommerce_sync ?? current.ecommerce_sync,
    // Ensure a webhook secret exists so we can receive unsubscribe events.
    webhook_secret: current.webhook_secret || randomUUID(),
  };

  // Register the account-level unsubscribe webhook (best-effort) once a list is chosen.
  if (next.list_id) {
    const hookUrl = brevoWebhookUrl(next.webhook_secret);
    if (hookUrl) {
      const hook = await registerWebhook(next, hookUrl);
      if (!("error" in hook) && hook.id) next.webhook_id = hook.id;
    }
  }

  if (!(await writeConfig(owned.supabase, businessId, next))) return { error: "Eroare la salvare." };

  revalidate();
  return { config: toPublicBrevoConfig(next) };
}

/** Clear the connection entirely (removes the webhook best-effort). */
export async function disconnectBrevo(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  const current = await readConfig(owned.supabase, businessId);
  if (current?.api_key && current.webhook_id) await deleteWebhook(current, current.webhook_id);
  if (!(await writeConfig(owned.supabase, businessId, null))) return { error: "Eroare la salvare." };
  revalidate();
  return { success: true };
}

/**
 * One-off bulk sync of existing customers (from orders) into the list, via the async
 * import endpoint. Deduped by lowercased email, newest name/phone wins, tagged with the
 * SOURCE "Clienti". The merchant confirms in the UI that they have consent to email them.
 */
export async function syncExistingCustomers(
  businessId: string,
): Promise<{ started: true; total: number } | { error: string }> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;

  const config = await readConfig(owned.supabase, businessId);
  if (!config?.enabled || !config.api_key || !config.list_id) {
    return { error: "Conecteaza contul si alege o lista intai." };
  }

  const [{ data: orders }, { data: sup }] = await Promise.all([
    owned.supabase
      .from("orders")
      .select("customer_email, customer_name, customer_phone, created_at")
      .eq("business_id", businessId)
      .not("customer_email", "is", null)
      .order("created_at", { ascending: false }),
    owned.supabase.from("brevo_suppressions").select("email").eq("business_id", businessId),
  ]);
  const suppressed = new Set((sup ?? []).map((s) => (s.email as string).toLowerCase()));

  const seen = new Set<string>();
  const contacts: BrevoContactInput[] = [];
  for (const o of orders ?? []) {
    const email = (o.customer_email ?? "").trim().toLowerCase();
    if (!email || seen.has(email) || suppressed.has(email)) continue;
    seen.add(email);
    const { fname, lname } = splitName(o.customer_name);
    contacts.push({ email, fname, lname, phone: o.customer_phone ?? undefined, source: "Clienti" });
  }
  if (contacts.length === 0) return { started: true, total: 0 };

  const res = await importContacts(config, contacts);
  if ("error" in res) return res;

  await writeConfig(owned.supabase, businessId, { ...config, last_sync_at: new Date().toISOString() });
  revalidate();
  return { started: true, total: contacts.length };
}
