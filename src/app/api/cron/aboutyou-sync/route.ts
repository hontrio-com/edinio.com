import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  loadAboutYouContext, processQueueItem, pollOpenBatches, reconcileStatuses, pause,
  type AboutYouQueueItem, type AboutYouSyncContext,
} from "@/lib/aboutyou/sync";
import { pollOrders } from "@/lib/aboutyou/orders";
import type { AboutYouConfig } from "@/lib/aboutyou/types";

type Admin = SupabaseClient<Database>;

// About You rate limits: products 100/min, results 200/min, categories/attrs
// 300/min. The cron fires every minute; pace conservatively and cap per-run work.
const QUEUE_BATCH = 30;
const MAX_ATTEMPTS = 5;
const MAX_BIZ = 12;
const RECONCILE_BIZ = 6;
const POLL_ORDERS_BIZ = 10;
const PACE_MS = 300;
const PENDING_STATUSES = ["pending", "draft", "pending_approval", "pending_active"];

function verifyCron(req: NextRequest): boolean {
  return req.headers.get("authorization")?.replace("Bearer ", "") === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = new Date().toISOString();
  let processed = 0, failed = 0, polled = 0, reconciled = 0, ordersIngested = 0;
  const ctxCache = new Map<string, AboutYouSyncContext | null>();
  async function ctxFor(businessId: string): Promise<AboutYouSyncContext | null> {
    if (ctxCache.has(businessId)) return ctxCache.get(businessId)!;
    const ctx = await loadAboutYouContext(admin, businessId);
    ctxCache.set(businessId, ctx);
    return ctx;
  }

  // ── 1) Drain the sync queue, grouped by business ────────────────────────────────
  const { data: queue } = await admin
    .from("aboutyou_sync_queue").select("id, business_id, product_id, offer_id, op, attempts")
    .order("created_at", { ascending: true }).limit(QUEUE_BATCH);

  const byBiz = new Map<string, AboutYouQueueItem[]>();
  for (const item of (queue ?? []) as AboutYouQueueItem[]) {
    if (!byBiz.has(item.business_id)) byBiz.set(item.business_id, []);
    byBiz.get(item.business_id)!.push(item);
  }

  for (const [businessId, items] of byBiz) {
    const ctx = await ctxFor(businessId);
    if (!ctx) {
      // Not connected — drop queued work so it does not pile up.
      await admin.from("aboutyou_sync_queue").delete().in("id", items.map((i) => i.id));
      continue;
    }
    for (const item of items) {
      const res = await processQueueItem(admin, ctx, item);
      if (res.ok) {
        await admin.from("aboutyou_sync_queue").delete().eq("id", item.id);
        processed++;
      } else {
        failed++;
        const attempts = (item.attempts ?? 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await admin.from("aboutyou_sync_queue").delete().eq("id", item.id);
        } else {
          await admin.from("aboutyou_sync_queue").update({ attempts, last_error: res.error.slice(0, 500) }).eq("id", item.id);
        }
      }
      await pause(PACE_MS);
    }
    await patchConfig(admin, businessId, { last_sync_at: now });
  }

  // ── 2) Poll open batches for businesses that have any ────────────────────────────
  const { data: batchBiz } = await admin
    .from("aboutyou_batches").select("business_id")
    .in("status", ["pending", "processing", "retry"]).limit(200);
  const pollSet = new Set<string>((batchBiz ?? []).map((r) => r.business_id));
  for (const businessId of [...pollSet].slice(0, MAX_BIZ)) {
    const ctx = await ctxFor(businessId);
    if (!ctx) continue;
    await pollOpenBatches(admin, ctx);
    polled++;
    await pause(PACE_MS);
  }

  // ── 3) Reconcile statuses for stores with listings awaiting approval ─────────────
  const { data: pendingBiz } = await admin
    .from("aboutyou_listings").select("business_id")
    .in("status", PENDING_STATUSES).limit(300);
  const reconcileSet = new Set<string>((pendingBiz ?? []).map((r) => r.business_id));
  for (const businessId of [...reconcileSet].slice(0, RECONCILE_BIZ)) {
    const ctx = await ctxFor(businessId);
    if (!ctx) continue;
    await reconcileStatuses(admin, ctx);
    reconciled++;
    await pause(PACE_MS);
  }

  // ── 4) Poll orders for active sellers (order.created webhook is primary) ─────────
  const { data: sellerBiz } = await admin.from("aboutyou_listings").select("business_id").limit(500);
  const orderPollSet = [...new Set((sellerBiz ?? []).map((r) => r.business_id))].slice(0, POLL_ORDERS_BIZ);
  for (const businessId of orderPollSet) {
    const ctx = await ctxFor(businessId);
    if (!ctx) continue;
    const pr = await pollOrders(admin, ctx, ctx.config.orders_synced_at);
    ordersIngested += pr.ingested;
    // Only advance the watermark when the poll actually completed, so a transient
    // failure doesn't skip an unfetched window of orders.
    if (pr.ok) await patchConfig(admin, businessId, { orders_synced_at: now });
    await pause(PACE_MS);
  }

  console.log(`[aboutyou-sync] processed=${processed} failed=${failed} polled=${polled} reconciled=${reconciled} orders=${ordersIngested}`);
  return NextResponse.json({ ok: true, processed, failed, polled, reconciled, ordersIngested });
}

async function patchConfig(admin: Admin, businessId: string, patch: Partial<AboutYouConfig>) {
  const { data: ss } = await admin.from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
  const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
  await admin.from("store_settings")
    .update({ aboutyou_config: { ...config, ...patch } as never })
    .eq("business_id", businessId);
}
