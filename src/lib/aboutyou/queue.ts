import { createAdminClient } from "@/lib/supabase/admin";
import type { AboutYouConfig } from "./types";

// Enqueue an About You sync for a product when the store has About You connected
// with auto-sync on. Fire-and-forget: never throws into the caller (used from
// product/order actions, which must not break if About You is down).
export async function enqueueAboutYouSync(
  businessId: string,
  productId: string | null,
  offerId: string,
  op: "upsert" | "delete",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
    const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
    if (!config.connected || !config.api_key) return;
    if (config.auto_sync === false) return;
    // Only enqueue an upsert for products that already have an About You listing
    // (enrichment). Un-enriched products are ignored until the merchant lists them.
    if (op === "upsert" && productId) {
      const { count } = await admin
        .from("aboutyou_listings").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).eq("product_id", productId);
      if (!count) return;
    }
    await admin.from("aboutyou_sync_queue").upsert(
      { business_id: businessId, product_id: productId, offer_id: offerId, op },
      { onConflict: "business_id,offer_id,op" },
    );
  } catch {
    // ignore
  }
}

// Batch upsert-enqueue (one config check). Used after orders (stock changes on
// several products at once). Non-throwing; only enqueues products already listed.
export async function enqueueAboutYouSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
    const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
    if (!config.connected || !config.api_key || config.auto_sync === false) return;
    // Restrict to products that already have an About You listing.
    const { data: listed } = await admin
      .from("aboutyou_listings").select("product_id").eq("business_id", businessId).in("product_id", ids);
    const listedIds = new Set((listed ?? []).map((r) => r.product_id).filter(Boolean) as string[]);
    const rows = ids.filter((id) => listedIds.has(id)).map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op: "upsert" as const }));
    if (rows.length === 0) return;
    await admin.from("aboutyou_sync_queue").upsert(rows, { onConflict: "business_id,offer_id,op" });
  } catch {
    // ignore
  }
}

// Enqueue a dedicated stock push (op "stock") for listed products — used after
// orders decrement stock. Lighter than a full upsert. Non-throwing.
export async function enqueueAboutYouStockMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
    const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
    if (!config.connected || !config.api_key || config.auto_sync === false) return;
    const { data: listed } = await admin
      .from("aboutyou_listings").select("product_id").eq("business_id", businessId).in("product_id", ids);
    const listedIds = new Set((listed ?? []).map((r) => r.product_id).filter(Boolean) as string[]);
    const rows = ids.filter((id) => listedIds.has(id)).map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op: "stock" as const }));
    if (rows.length === 0) return;
    await admin.from("aboutyou_sync_queue").upsert(rows, { onConflict: "business_id,offer_id,op" });
  } catch {
    // ignore
  }
}

// Enqueue an About You shipment push (op "ship") after a courier AWB is generated
// for an order. No-op unless the order is an About You order. Non-throwing.
export async function enqueueAboutYouShip(businessId: string, orderId: string): Promise<void> {
  try {
    if (!orderId) return;
    const admin = createAdminClient();
    const { data: ss } = await admin
      .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
    const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
    if (!config.connected || !config.api_key) return;
    const { data: ay } = await admin
      .from("aboutyou_orders").select("id").eq("business_id", businessId).eq("order_id", orderId).maybeSingle();
    if (!ay) return;
    await admin.from("aboutyou_sync_queue").upsert(
      { business_id: businessId, product_id: null, offer_id: orderId, op: "ship" },
      { onConflict: "business_id,offer_id,op" },
    );
  } catch {
    // ignore
  }
}
