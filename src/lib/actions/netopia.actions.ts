"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { NetopiaConfig } from "@/lib/netopia";

export async function saveNetopiaConfig(
  businessId: string,
  config: Omit<NetopiaConfig, "enabled">
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

  const enabled = !!(config.pos_signature?.trim() && config.public_key?.trim() && config.private_key?.trim());

  const { error } = await supabase
    .from("store_settings")
    .update({ netopia_config: { ...config, enabled } })
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
