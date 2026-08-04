"use server";

import { revalidatePath } from "next/cache";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { createClient } from "@/lib/supabase/server";
import type { KlarnaConfig } from "@/lib/klarna";

export async function saveKlarnaConfig(
  businessId: string,
  config: KlarnaConfig,
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

  // Trim credentials: pasted keys often carry stray whitespace or a trailing
  // newline, which silently breaks the Basic auth header at checkout.
  const clean: KlarnaConfig = {
    ...config,
    username: config.username.trim(),
    password: config.password.trim(),
    title: config.title.trim(),
  };

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  const { data: vechi } = await supabase
    .from("store_settings").select("klarna_config").eq("business_id", businessId).maybeSingle();
  const cleanFinal = pastreazaSecretele("klarna_config", clean, vechi?.klarna_config);

  const { error } = await supabase
    .from("store_settings")
    .update({ klarna_config: cleanFinal as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la salvare" };

  revalidatePath("/dashboard/features/klarna");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}

export async function disconnectKlarna(
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

  const { error } = await supabase
    .from("store_settings")
    .update({ klarna_config: null })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la stergere" };

  revalidatePath("/dashboard/features/klarna");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}
