import { createAdminClient } from "@/lib/supabase/admin";
import type { GoogleMerchantConfig } from "./types";

// Enqueue a product sync when the store has Google Merchant connected with
// auto-sync on. Fire-and-forget — never throws into the caller (used from
// product/order actions, which must not break if Google is down).
export async function enqueueGmcSync(
  businessId: string,
  productId: string | null,
  offerId: string,
  op: "upsert" | "delete",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("google_merchant_config").eq("business_id", businessId).single();
    const config = (ss?.google_merchant_config as GoogleMerchantConfig) ?? {};
    if (!config.connected || !config.account_id) return;
    if (config.auto_sync === false) return;
    await admin.from("gmc_sync_queue").upsert(
      { business_id: businessId, product_id: productId, offer_id: offerId, op },
      { onConflict: "business_id,offer_id,op" },
    );
  } catch {
    // ignore
  }
}

// Batch upsert-enqueue (one config check). Used after orders (stock changes on
// several products at once). Non-throwing.
export async function enqueueGmcSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("google_merchant_config").eq("business_id", businessId).single();
    const config = (ss?.google_merchant_config as GoogleMerchantConfig) ?? {};
    if (!config.connected || !config.account_id || config.auto_sync === false) return;
    await admin.from("gmc_sync_queue").upsert(
      ids.map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op: "upsert" })),
      { onConflict: "business_id,offer_id,op" },
    );
  } catch {
    // ignore
  }
}
