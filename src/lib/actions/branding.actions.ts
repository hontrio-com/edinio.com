"use server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Whether to hide the "Creat cu Edinio" footer credit. Allowed only on a
 * purchased plan (anything except free/trial) AND when the merchant opted in.
 * Public — anonymous storefront visitors call it; returns only a boolean, so no
 * secrets leak. Short-circuits before the plan lookup when the flag is unset.
 */
export async function getEdinioBadgeHidden(businessId: string): Promise<boolean> {
  if (!businessId) return false;
  const admin = createAdminClient();

  const { data: ss } = await admin
    .from("store_settings")
    .select("page_content")
    .eq("business_id", businessId)
    .single();
  const hideFlag = (ss?.page_content as { hide_edinio_badge?: boolean } | null)?.hide_edinio_badge;
  if (!hideFlag) return false;

  const { data: biz } = await admin.from("businesses").select("user_id").eq("id", businessId).single();
  if (!biz?.user_id) return false;

  const { data: profile } = await admin.from("users_profile").select("plan").eq("id", biz.user_id).single();
  const plan = profile?.plan ?? "free";
  return plan !== "free" && plan !== "trial";
}
