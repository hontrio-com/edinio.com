"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeNetopiaBadge } from "@/lib/utils/sanitize-embed";
import type { NetopiaConfig } from "@/lib/netopia";

export async function saveNetopiaConfig(
  businessId: string,
  config: NetopiaConfig
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { success: false, error: "Acces interzis" };

  // Trim credentials: pasted keys/signatures often carry stray whitespace or a
  // trailing newline, which silently breaks the Authorization header at checkout.
  const clean: NetopiaConfig = {
    ...config,
    pos_signature: config.pos_signature.trim(),
    api_key: config.api_key.trim(),
    title: config.title.trim(),
    // Strip to a safe Netopia-domain iframe; arbitrary pasted markup never reaches
    // the public footer.
    badge_html: sanitizeNetopiaBadge(config.badge_html),
  };

  const { error } = await supabase
    .from("store_settings")
    .update({ netopia_config: clean, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la salvare" };

  revalidatePath("/dashboard/features/netopia");
  revalidatePath("/dashboard/features");
  return { success: true };
}

export async function disconnectNetopia(
  businessId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { success: false, error: "Acces interzis" };

  const { error } = await supabase
    .from("store_settings")
    .update({ netopia_config: null })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la stergere" };

  revalidatePath("/dashboard/features/netopia");
  revalidatePath("/dashboard/features");
  return { success: true };
}

/**
 * Public: the Netopia visual-identity badge HTML for a store's footer. Returns ""
 * unless Netopia is enabled and a badge was configured. Reads via service role
 * (store_settings is not anon-readable) and returns ONLY the sanitized badge —
 * no credentials ever leave the server. Safe to call from the anonymous storefront.
 */
export async function getNetopiaBadge(businessId: string): Promise<string> {
  if (!businessId) return "";
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_settings")
    .select("netopia_config")
    .eq("business_id", businessId)
    .single();
  const cfg = data?.netopia_config as NetopiaConfig | null;
  if (!cfg?.enabled) return "";
  // Sanitized at save; sanitize again defensively (cheap, server-side).
  return sanitizeNetopiaBadge(cfg.badge_html);
}
