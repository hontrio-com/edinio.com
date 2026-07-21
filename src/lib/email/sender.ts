import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { parseEmailConfig, buildStoreSender, type StoreEmailSender } from "./config";

/**
 * Load the store's email sender (branding + optional SMTP) for a business, so
 * callers can pass it to the store-facing email helpers. One query; reuse the
 * result for all emails of a single order.
 */
export async function getStoreEmailSender(
  admin: SupabaseClient<Database>,
  businessId: string,
): Promise<StoreEmailSender | undefined> {
  const { data } = await admin
    .from("businesses")
    .select("store_name, business_name, logo_url, primary_color, slug, custom_domain, store_settings(email_config)")
    .eq("id", businessId)
    .single();
  if (!data) return undefined;
  const ss = Array.isArray(data.store_settings) ? data.store_settings[0] : data.store_settings;
  return buildStoreSender(parseEmailConfig(ss?.email_config), data);
}
