import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  loadTrendyolContext, processQueueItem, pollOpenBatches, reconcileStatuses, reconcileInventory, pause,
  type TrendyolQueueItem, type TrendyolSyncContext,
} from "@/lib/trendyol/sync";
import { pollPackages } from "@/lib/trendyol/orders";
import type { TrendyolConfig } from "@/lib/trendyol/types";

type Admin = SupabaseClient<Database>;

// Trendyol rate limit: 50 requests / 10s per endpoint. Pace conservatively and cap
// per-run work; the cron fires every minute.
const QUEUE_BATCH = 30;
const MAX_ATTEMPTS = 5;
const MAX_BIZ = 12;
const RECONCILE_BIZ = 6;
const ORDERS_BIZ = 8;
const INVENTORY_BIZ = 4;
const PACE_MS = 350;
// Re-poll window overlap so a status change straddling two runs is never missed.
const ORDERS_OVERLAP_MS = 5 * 60 * 1000;
const PENDING_STATUSES = ["pending", "created"];

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
  let processed = 0, failed = 0, polled = 0, reconciled = 0;
  const ctxCache = new Map<string, TrendyolSyncContext | null>();
  async function ctxFor(businessId: string): Promise<TrendyolSyncContext | null> {
    if (ctxCache.has(businessId)) return ctxCache.get(businessId)!;
    const ctx = await loadTrendyolContext(admin, businessId);
    ctxCache.set(businessId, ctx);
    return ctx;
  }

  // ── 1) Drain the sync queue, grouped by business ────────────────────────────────
  const { data: queue } = await admin
    .from("trendyol_sync_queue").select("id, business_id, product_id, offer_id, op, attempts")
    .order("created_at", { ascending: true }).limit(QUEUE_BATCH);

  const byBiz = new Map<string, TrendyolQueueItem[]>();
  for (const item of (queue ?? []) as TrendyolQueueItem[]) {
    if (!byBiz.has(item.business_id)) byBiz.set(item.business_id, []);
    byBiz.get(item.business_id)!.push(item);
  }

  for (const [businessId, items] of byBiz) {
    const ctx = await ctxFor(businessId);
    if (!ctx) {
      await admin.from("trendyol_sync_queue").delete().in("id", items.map((i) => i.id));
      continue;
    }
    for (const item of items) {
      const res = await processQueueItem(admin, ctx, item);
      if (res.ok) {
        await admin.from("trendyol_sync_queue").delete().eq("id", item.id);
        processed++;
      } else {
        failed++;
        const attempts = (item.attempts ?? 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await admin.from("trendyol_sync_queue").delete().eq("id", item.id);
        } else {
          await admin.from("trendyol_sync_queue").update({ attempts, last_error: res.error.slice(0, 500) }).eq("id", item.id);
        }
      }
      await pause(PACE_MS);
    }
    await patchConfig(admin, businessId, { last_sync_at: now });
  }

  // ── 2) Poll open batches ─────────────────────────────────────────────────────────
  const { data: batchBiz } = await admin
    .from("trendyol_batches").select("business_id")
    .in("status", ["pending", "processing", "retry"]).limit(200);
  const pollSet = new Set<string>((batchBiz ?? []).map((r) => r.business_id));
  for (const businessId of [...pollSet].slice(0, MAX_BIZ)) {
    const ctx = await ctxFor(businessId);
    if (!ctx) continue;
    await pollOpenBatches(admin, ctx);
    polled++;
    await pause(PACE_MS);
  }

  // ── 3) Reconcile approval for stores with listings awaiting approval ─────────────
  const { data: pendingBiz } = await admin
    .from("trendyol_listings").select("business_id")
    .in("status", PENDING_STATUSES).limit(300);
  const reconcileSet = new Set<string>((pendingBiz ?? []).map((r) => r.business_id));
  for (const businessId of [...reconcileSet].slice(0, RECONCILE_BIZ)) {
    const ctx = await ctxFor(businessId);
    if (!ctx) continue;
    await reconcileStatuses(admin, ctx);
    reconciled++;
    await pause(PACE_MS);
  }

  // ── 4) Poll recent orders (safety net for missed webhooks) ──────────────────────
  const { data: sellerBiz } = await admin
    .from("trendyol_listings").select("business_id").limit(500);
  const orderSet = new Set<string>((sellerBiz ?? []).map((r) => r.business_id));
  let ingested = 0;
  for (const businessId of [...orderSet].slice(0, ORDERS_BIZ)) {
    const ctx = await ctxFor(businessId);
    if (!ctx) continue;
    const parsed = ctx.config.orders_synced_at ? Date.parse(ctx.config.orders_synced_at) : NaN;
    const sinceMs = Number.isFinite(parsed) ? parsed - ORDERS_OVERLAP_MS : undefined;
    const runStart = Date.now();
    const r = await pollPackages(admin, ctx, sinceMs);
    ingested += r.ingested;
    // Advance the watermark only on a clean poll (avoid skipping a failed window).
    if (r.ok) await patchConfig(admin, businessId, { orders_synced_at: new Date(runStart).toISOString() });
    await pause(PACE_MS);
  }

  // ── 5) Reverse inventory reconciliation (drift safety net; every ~15 min) ────────
  let corrected = 0;
  if (new Date().getMinutes() % 15 === 0) {
    const { data: invBiz } = await admin
      .from("trendyol_listings").select("business_id").in("status", ["approved", "active"]).limit(500);
    const invSet = new Set<string>((invBiz ?? []).map((r) => r.business_id));
    for (const businessId of [...invSet].slice(0, INVENTORY_BIZ)) {
      const ctx = await ctxFor(businessId);
      if (!ctx) continue;
      const r = await reconcileInventory(admin, ctx);
      corrected += r.corrected;
      await pause(PACE_MS);
    }
  }

  console.log(`[trendyol-sync] processed=${processed} failed=${failed} polled=${polled} reconciled=${reconciled} ingested=${ingested} corrected=${corrected}`);
  return NextResponse.json({ ok: true, processed, failed, polled, reconciled, ingested, corrected });
}

async function patchConfig(admin: Admin, businessId: string, patch: Partial<TrendyolConfig>) {
  const { data: ss } = await admin.from("store_settings").select("trendyol_config").eq("business_id", businessId).single();
  const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
  await admin.from("store_settings")
    .update({ trendyol_config: { ...config, ...patch } as never })
    .eq("business_id", businessId);
}
