import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getAccessToken } from "@/lib/google-merchant/oauth";
import { insertProductInput, deleteProductInput, getProduct } from "@/lib/google-merchant/client";
import { toGoogleProductInput, type MappableBusiness, type MappableProduct } from "@/lib/google-merchant/mapping";
import { DEFAULT_CONTENT_LANGUAGE, DEFAULT_FEED_LABEL, type GoogleMerchantConfig } from "@/lib/google-merchant/types";

type Admin = SupabaseClient<Database>;
const QUEUE_BATCH = 100;
const STATUS_BATCH = 40;
const MAX_ATTEMPTS = 5;

function verifyCron(req: NextRequest): boolean {
  return req.headers.get("authorization")?.replace("Bearer ", "") === process.env.CRON_SECRET;
}

// Map a Merchant API product status into our simplified status + issues.
function mapStatus(data: Record<string, unknown>): { status: string; issues: unknown[]; destinations: unknown[] } {
  const ps = (data?.productStatus ?? {}) as {
    destinationStatuses?: { reportingContext?: string; status?: string }[];
    itemLevelIssues?: { code?: string; severity?: string; description?: string }[];
  };
  const issues = ps.itemLevelIssues ?? [];
  const destinations = ps.destinationStatuses ?? [];
  const disapproved = issues.some((i) => i.severity === "error" || i.severity === "ERROR" || i.severity === "DISAPPROVAL");
  const approved = destinations.some((d) => (d.status ?? "").toLowerCase() === "approved");
  const status = disapproved ? "disapproved" : approved ? "active" : "pending";
  return { status, issues, destinations };
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const now = new Date().toISOString();
  let synced = 0, deleted = 0, failed = 0, statusChecked = 0;

  // ── 1) Process the sync queue, grouped by business ─────────────────────────────
  const { data: queue } = await admin
    .from("gmc_sync_queue").select("id, business_id, product_id, offer_id, op, attempts")
    .order("created_at", { ascending: true }).limit(QUEUE_BATCH);

  const byBiz = new Map<string, typeof queue>();
  for (const item of queue ?? []) {
    if (!byBiz.has(item.business_id)) byBiz.set(item.business_id, []);
    byBiz.get(item.business_id)!.push(item);
  }

  for (const [businessId, items] of byBiz) {
    const ctx = await loadBusinessContext(admin, businessId);
    if (!ctx) {
      // Not connected — drop its queue items.
      await admin.from("gmc_sync_queue").delete().in("id", (items ?? []).map((i) => i.id));
      continue;
    }
    const { token, config, business } = ctx;
    const lang = config.content_language || DEFAULT_CONTENT_LANGUAGE;
    const feedLabel = config.feed_label || DEFAULT_FEED_LABEL;

    // Fetch products needed for upserts in this business.
    const upsertIds = (items ?? []).filter((i) => i.op === "upsert" && i.product_id).map((i) => i.product_id!) as string[];
    const productMap = new Map<string, MappableProduct>();
    if (upsertIds.length) {
      const { data: prods } = await admin
        .from("products")
        .select("id, name, slug, description, price, compare_at_price, images, category, is_active, track_inventory, stock_quantity, weight_grams")
        .in("id", upsertIds);
      for (const p of prods ?? []) if (p.is_active) productMap.set(p.id, p as MappableProduct);
    }

    for (const item of items ?? []) {
      try {
        if (item.op === "delete" || (item.op === "upsert" && item.product_id && !productMap.has(item.product_id))) {
          // delete from Google (also covers upsert of a now-inactive/removed product)
          const res = await deleteProductInput(token, config.account_id!, lang, feedLabel, item.offer_id, config.data_source_name!);
          if ("error" in res && res.status !== 404) throw new Error(res.error);
          await admin.from("gmc_products").delete().eq("business_id", businessId).eq("offer_id", item.offer_id);
          await admin.from("gmc_sync_queue").delete().eq("id", item.id);
          deleted++;
        } else {
          const product = productMap.get(item.product_id!)!;
          const input = toGoogleProductInput(business, product, config);
          const res = await insertProductInput(token, config.account_id!, config.data_source_name!, input);
          if ("error" in res) throw new Error(res.error);
          await admin.from("gmc_products").upsert(
            { business_id: businessId, product_id: product.id, offer_id: item.offer_id, status: "pending", last_synced_at: now, error: null, updated_at: now },
            { onConflict: "business_id,product_id" },
          );
          await admin.from("gmc_sync_queue").delete().eq("id", item.id);
          synced++;
        }
      } catch (e) {
        failed++;
        const attempts = (item.attempts ?? 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await admin.from("gmc_sync_queue").delete().eq("id", item.id);
          if (item.product_id) {
            await admin.from("gmc_products").upsert(
              { business_id: businessId, product_id: item.product_id, offer_id: item.offer_id, status: "error", error: String((e as Error).message).slice(0, 500), updated_at: now },
              { onConflict: "business_id,product_id" },
            );
          }
        } else {
          await admin.from("gmc_sync_queue").update({ attempts }).eq("id", item.id);
        }
      }
    }
    // Persist last_sync_at on the config.
    await patchConfig(admin, businessId, config, { last_sync_at: now });
  }

  // ── 2) Refresh statuses for products not checked recently ──────────────────────
  const staleBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: stale } = await admin
    .from("gmc_products")
    .select("id, business_id, offer_id")
    .or(`last_status_at.is.null,last_status_at.lt.${staleBefore}`)
    .limit(STATUS_BATCH);

  const ctxCache = new Map<string, Awaited<ReturnType<typeof loadBusinessContext>>>();
  for (const row of stale ?? []) {
    let ctx = ctxCache.get(row.business_id);
    if (ctx === undefined) { ctx = await loadBusinessContext(admin, row.business_id); ctxCache.set(row.business_id, ctx); }
    if (!ctx) continue;
    const { token, config } = ctx;
    const res = await getProduct(token, config.account_id!, config.content_language || DEFAULT_CONTENT_LANGUAGE, config.feed_label || DEFAULT_FEED_LABEL, row.offer_id);
    statusChecked++;
    if ("error" in res) {
      await admin.from("gmc_products").update({ last_status_at: now }).eq("id", row.id);
      continue;
    }
    const { status, issues, destinations } = mapStatus(res.data);
    await admin.from("gmc_products").update({ status, issues: issues as never, destinations: destinations as never, last_status_at: now, updated_at: now }).eq("id", row.id);
  }

  console.log(`[gmc-sync] synced=${synced} deleted=${deleted} failed=${failed} status=${statusChecked}`);
  return NextResponse.json({ ok: true, synced, deleted, failed, statusChecked });
}

async function loadBusinessContext(admin: Admin, businessId: string): Promise<
  { token: string; config: GoogleMerchantConfig; business: MappableBusiness } | null
> {
  const { data: ss } = await admin
    .from("store_settings").select("google_merchant_config").eq("business_id", businessId).single();
  const config = (ss?.google_merchant_config as GoogleMerchantConfig) ?? {};
  if (!config.connected || !config.refresh_token || !config.account_id || !config.data_source_name) return null;
  const token = await getAccessToken(config.refresh_token);
  if (!token) return null;
  const { data: biz } = await admin
    .from("businesses").select("slug, custom_domain, store_name, business_name").eq("id", businessId).single();
  if (!biz || !biz.custom_domain) return null; // Google requires a claimed custom domain
  return { token, config, business: biz as MappableBusiness };
}

async function patchConfig(admin: Admin, businessId: string, config: GoogleMerchantConfig, patch: Partial<GoogleMerchantConfig>) {
  await admin.from("store_settings")
    .update({ google_merchant_config: { ...config, ...patch } as never })
    .eq("business_id", businessId);
}
