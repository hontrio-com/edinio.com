import { createAdminClient } from "@/lib/supabase/admin";
import type { OlxConfig } from "./types";

// Enqueue an OLX sync for a product when the store has OLX connected with
// auto-sync on. Fire-and-forget — never throws into the caller (used from
// product/order actions, which must not break if OLX is down).
export async function enqueueOlxSync(
  businessId: string,
  productId: string | null,
  offerId: string,
  op: "upsert" | "delete",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("olx_config").eq("business_id", businessId).single();
    const config = (ss?.olx_config as OlxConfig) ?? {};
    if (!config.connected || !config.refresh_token) return;
    if (config.auto_sync === false) return;
    await admin.from("olx_sync_queue").upsert(
      { business_id: businessId, product_id: productId, offer_id: offerId, op },
      { onConflict: "business_id,offer_id,op" },
    );
  } catch {
    // ignore
  }
}

// Batch upsert-enqueue (one config check). Used after orders (stock changes on
// several products at once). Non-throwing.
export async function enqueueOlxSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("olx_config").eq("business_id", businessId).single();
    const config = (ss?.olx_config as OlxConfig) ?? {};
    if (!config.connected || !config.refresh_token || config.auto_sync === false) return;
    await admin.from("olx_sync_queue").upsert(
      ids.map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op: "upsert" })),
      { onConflict: "business_id,offer_id,op" },
    );
  } catch {
    // ignore
  }
}
