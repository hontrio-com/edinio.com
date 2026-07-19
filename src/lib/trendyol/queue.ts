import { createAdminClient } from "@/lib/supabase/admin";
import type { TrendyolConfig } from "./types";

// Enqueue a Trendyol sync when the store has Trendyol connected with auto-sync on.
// Fire-and-forget: never throws into the caller (used from product/order actions).
// offer_id == productMainId == the Edinio product id.
export async function enqueueTrendyolSync(
  businessId: string,
  productId: string | null,
  offerId: string,
  op: "upsert" | "delete",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("trendyol_config").eq("business_id", businessId).single();
    const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
    if (!config.connected || !config.api_key) return;
    if (config.auto_sync === false) return;
    // Only enqueue an upsert for products that already have a Trendyol listing.
    if (op === "upsert" && productId) {
      const { count } = await admin
        .from("trendyol_listings").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).eq("product_id", productId);
      if (!count) return;
    }
    await admin.from("trendyol_sync_queue").upsert(
      { business_id: businessId, product_id: productId, offer_id: offerId, op },
      { onConflict: "business_id,offer_id,op" },
    );
  } catch {
    // ignore
  }
}

async function enqueueMany(businessId: string, productIds: (string | null | undefined)[], op: "upsert" | "inventory"): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("trendyol_config").eq("business_id", businessId).single();
    const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
    if (!config.connected || !config.api_key || config.auto_sync === false) return;
    const { data: listed } = await admin
      .from("trendyol_listings").select("product_id").eq("business_id", businessId).in("product_id", ids);
    const listedIds = new Set((listed ?? []).map((r) => r.product_id).filter(Boolean) as string[]);
    const rows = ids.filter((id) => listedIds.has(id)).map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op }));
    if (rows.length === 0) return;
    await admin.from("trendyol_sync_queue").upsert(rows, { onConflict: "business_id,offer_id,op" });
  } catch {
    // ignore
  }
}

// Full re-push (product create/update). Used after product edits.
export function enqueueTrendyolSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  return enqueueMany(businessId, productIds, "upsert");
}
// Dedicated inventory push. Used after orders decrement stock.
export function enqueueTrendyolInventoryMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  return enqueueMany(businessId, productIds, "inventory");
}
