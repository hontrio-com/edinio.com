"use server";

import { revalidatePath } from "next/cache";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Cheia veche se citeste cu SERVICE ROLE: cu ea se sterge webhook-ul invechit
  // DIRECT la Revolut, iar clientul utilizatorului nu mai primeste `secret_key`
  // decriptat, ci `enc.v1.…` — stergerea ar esua tacit si magazinul ar ramane cu
  // webhook-uri orfane pana la plafonul de 10. Proprietarul e verificat mai sus.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings")
    .select("revolut_config")
    .eq("business_id", businessId)
    .single();
  const existing = (settings?.revolut_config ?? {}) as Partial<RevolutConfig>;

  // Trim: pasted keys often carry stray whitespace / a trailing newline, which
  // silently breaks the Bearer auth header at checkout.
  const cheieDinFormular = input.secret_key.trim();
  const clean: RevolutConfig = {
    enabled: input.enabled,
    sandbox: input.sandbox,
    secret_key: cheieDinFormular,
    title: input.title.trim() || "Revolut",
    webhook_id: existing.webhook_id,
    signing_secret: existing.signing_secret,
  };

  /*
   * Cheia cu care se VORBESTE cu Revolut in salvarea asta.
   *
   * Formularul primeste `secret_key` MASCAT (vezi lib/integrari/secrete.ts), deci
   * la orice salvare obisnuita — un comutator, alt titlu — campul soseste GOL.
   * „Gol" inseamna „nu o schimba", nu „alta cheie", si tocmai asta se citea gresit
   * mai jos: `keyChanged` iesea adevarat la fiecare salvare, webhook-ul VIU era
   * sters la Revolut, iar reinregistrarea nu mai pornea (cere o cheie negoala).
   * Magazinul ramanea cu `signing_secret` pentru un webhook care nu mai exista,
   * adica fara confirmari de plata, si nimic nu semnala nimic.
   */
  const cheieEfectiva = cheieDinFormular || (existing.secret_key ?? "");

  // The old webhook was registered under the previous key/environment — if either
  // changed it is stale, so remove it (best effort, with the OLD credentials) and
  // force a fresh registration below.
  const keyChanged = !!cheieDinFormular && !!existing.secret_key && existing.secret_key !== cheieDinFormular;
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
  // Se inregistreaza cu `cheieEfectiva`: la o schimbare de mediu fara retastarea
  // cheii, `clean.secret_key` e gol si vechea conditie sarea peste reinregistrare
  // exact dupa ce stersese webhook-ul de mai sus.
  let warning: string | undefined;
  if (clean.enabled && cheieEfectiva && !clean.signing_secret) {
    const url = `${appUrl()}/api/revolut/webhook?businessId=${encodeURIComponent(businessId)}`;
    const wh = await createWebhook({ ...clean, secret_key: cheieEfectiva }, url, ["ORDER_COMPLETED"]);
    if (wh.ok && wh.data?.signing_secret) {
      clean.webhook_id = wh.data.id;
      clean.signing_secret = wh.data.signing_secret;
    } else {
      warning =
        wh.error ||
        "Cheia a fost salvata, dar nu am putut inregistra webhook-ul Revolut. Verifica cheia secreta (are nevoie de permisiuni de webhook).";
    }
  }

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  //
  // Citirea asta ramane DINADINS pe clientul utilizatorului, desi `existing` de
  // mai sus vine pe service role: aici valoarea nu pleaca nicaieri, doar se scrie
  // inapoi. `enc.v1.…` rescris peste el insusi e corect — `privat.cripteaza` sare
  // peste ce e deja marcat — si asa nu mai scoatem o parola in clar degeaba.
  const { data: vechi } = await supabase
    .from("store_settings").select("revolut_config").eq("business_id", businessId).maybeSingle();
  const cleanFinal = pastreazaSecretele("revolut_config", clean, vechi?.revolut_config);

  const { error } = await supabase
    .from("store_settings")
    .update({ revolut_config: cleanFinal as never, updated_at: new Date().toISOString() })
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

  // SERVICE ROLE: cheia pleaca spre Revolut ca sa stearga webhook-ul, iar clientul
  // utilizatorului nu mai primeste `secret_key` decriptat, ci `enc.v1.…`.
  // Proprietarul e verificat mai sus, deci ocolirea RLS nu deschide alt magazin.
  const admin = createAdminClient();
  const { data: settings } = await admin
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
