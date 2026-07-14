"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createWebhook, deleteWebhook, type RevolutConfig, type RevolutConfigInput } from "@/lib/revolut";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";
}

/**
 * Save the merchant's Revolut config. The client only sends the editable fields
 * (`enabled`, `sandbox`, `secret_key`, `title`) — the server-only `webhook_id` /
 * `signing_secret` are read from the existing stored config so they never travel to
 * the browser. On (re)connect we auto-register a signed webhook once and store its
 * secret; if the key or environment changes, the stale webhook is dropped and a
 * fresh one is registered. Webhook registration doubles as a secret-key check.
 */
export async function saveRevolutConfig(
  businessId: string,
  input: RevolutConfigInput,
): Promise<{ success: boolean; error?: string; warning?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { success: false, error: "Acces interzis" };

  const { data: settings } = await supabase
    .from("store_settings")
    .select("revolut_config")
    .eq("business_id", businessId)
    .single();
  const existing = (settings?.revolut_config ?? {}) as Partial<RevolutConfig>;

  // Trim: pasted keys often carry stray whitespace / a trailing newline, which
  // silently breaks the Bearer auth header at checkout.
  const clean: RevolutConfig = {
    enabled: input.enabled,
    sandbox: input.sandbox,
    secret_key: input.secret_key.trim(),
    title: input.title.trim() || "Revolut",
    webhook_id: existing.webhook_id,
    signing_secret: existing.signing_secret,
  };

  // The old webhook was registered under the previous key/environment — if either
  // changed it is stale, so remove it (best effort, with the OLD credentials) and
  // force a fresh registration below.
  const keyChanged = !!existing.secret_key && existing.secret_key !== clean.secret_key;
  const envChanged = existing.sandbox !== undefined && existing.sandbox !== clean.sandbox;
  if ((keyChanged || envChanged) && existing.webhook_id && existing.secret_key) {
    await deleteWebhook(
      { secret_key: existing.secret_key, sandbox: existing.sandbox ?? clean.sandbox },
      existing.webhook_id,
    ).catch(() => { /* stale webhook, ignore */ });
    clean.webhook_id = undefined;
    clean.signing_secret = undefined;
  }

  // Register the signed webhook once, only when enabled and not yet registered.
  let warning: string | undefined;
  if (clean.enabled && clean.secret_key && !clean.signing_secret) {
    const url = `${appUrl()}/api/revolut/webhook?businessId=${encodeURIComponent(businessId)}`;
    const wh = await createWebhook(clean, url, ["ORDER_COMPLETED"]);
    if (wh.ok && wh.data?.signing_secret) {
      clean.webhook_id = wh.data.id;
      clean.signing_secret = wh.data.signing_secret;
    } else {
      warning =
        wh.error ||
        "Cheia a fost salvata, dar nu am putut inregistra webhook-ul Revolut. Verifica cheia secreta (are nevoie de permisiuni de webhook).";
    }
  }

  const { error } = await supabase
    .from("store_settings")
    .update({ revolut_config: clean as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la salvare" };

  revalidatePath("/dashboard/features/revolut");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true, warning };
}

export async function disconnectRevolut(
  businessId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { success: false, error: "Acces interzis" };

  const { data: settings } = await supabase
    .from("store_settings")
    .select("revolut_config")
    .eq("business_id", businessId)
    .single();
  const existing = settings?.revolut_config as RevolutConfig | null;

  // Remove the registered webhook so we don't leave orphans / hit the 10-webhook cap.
  if (existing?.webhook_id && existing.secret_key) {
    await deleteWebhook(existing, existing.webhook_id).catch(() => { /* ignore */ });
  }

  const { error } = await supabase
    .from("store_settings")
    .update({ revolut_config: null })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la stergere" };

  revalidatePath("/dashboard/features/revolut");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}
