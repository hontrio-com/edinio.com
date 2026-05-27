"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MarketingConfig } from "@/lib/marketing";

export async function saveMarketingConfig(
  businessId: string,
  config: MarketingConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    marketing_config: config as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  updateTag(`store-settings-${businessId}`);
  updateTag(`businesses-${user.id}`);
  updateTag(`business-${user.id}`);
  return { success: true };
}
