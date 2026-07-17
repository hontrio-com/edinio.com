import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  loadOlxContext, processQueueItem, refreshAdvertStatus, pause,
  PRODUCT_FIELDS, type OlxQueueItem, type OlxSyncContext,
} from "@/lib/olx/sync";
import { advertCommand } from "@/lib/olx/client";
import type { MappableProduct } from "@/lib/olx/mapping";
import type { OlxConfig } from "@/lib/olx/types";

type Admin = SupabaseClient<Database>;

// OLX rate limits are not clearly documented — pace conservatively and keep the
// per-run volume small (the cron fires every minute). Each write op also costs
// moderation/throttle budget on OLX's side.
const QUEUE_BATCH = 30;
const STATUS_BATCH = 25;
const EXTEND_BATCH = 15;
const MAX_ATTEMPTS = 5;
const PACE_MS = 300;

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
  let processed = 0, failed = 0, statusChecked = 0, extended = 0;
  const ctxCache = new Map<string, OlxSyncContext | null>();

  async function ctxFor(businessId: string): Promise<OlxSyncContext | null> {
    if (ctxCache.has(businessId)) return ctxCache.get(businessId)!;
    const ctx = await loadOlxContext(admin, businessId);
    ctxCache.set(businessId, ctx);
    return ctx;
  }

  // ── 1) Drain the sync queue, grouped by business ────────────────────────────────
  const { data: queue } = await admin
    .from("olx_sync_queue").select("id, business_id, product_id, offer_id, op, attempts")
    .order("created_at", { ascending: true }).limit(QUEUE_BATCH);

  const byBiz = new Map<string, OlxQueueItem[]>();
  for (const item of (queue ?? []) as OlxQueueItem[]) {
    if (!byBiz.has(item.business_id)) byBiz.set(item.business_id, []);
    byBiz.get(item.business_id)!.push(item);
  }

  for (const [businessId, items] of byBiz) {
    const ctx = await ctxFor(businessId);
    if (!ctx) {
      // Not connected / token dead — drop queued work so it doesn't pile up.
      await admin.from("olx_sync_queue").delete().in("id", items.map((i) => i.id));
      continue;
    }

    // Preload products needed for upserts (single query).
    const upsertIds = items.filter((i) => i.op === "upsert" && i.product_id).map((i) => i.product_id!) as string[];
    const productMap = new Map<string, MappableProduct>();
    if (upsertIds.length) {
      const { data: prods } = await admin.from("products").select(PRODUCT_FIELDS).in("id", upsertIds);
      for (const p of (prods ?? []) as MappableProduct[]) productMap.set(p.id, p);
    }

    for (const item of items) {
      const product = item.product_id ? productMap.get(item.product_id) ?? null : null;
      const res = await processQueueItem(admin, ctx, item, product);
      if (res.ok) {
        await admin.from("olx_sync_queue").delete().eq("id", item.id);
        processed++;
      } else if (res.permanent) {
        await admin.from("olx_sync_queue").delete().eq("id", item.id);
        failed++;
      } else {
        failed++;
        const attempts = (item.attempts ?? 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await admin.from("olx_sync_queue").delete().eq("id", item.id);
        } else {
          await admin.from("olx_sync_queue").update({ attempts, last_error: res.error.slice(0, 500) }).eq("id", item.id);
        }
      }
      await pause(PACE_MS);
    }
    await patchConfig(admin, businessId, { last_sync_at: now });
  }

  // ── 2) Poll statuses — prioritize freshly-posted (`new`) adverts ────────────────
  // Moderation resolves in seconds, so `new` adverts get a 2-min recheck window;
  // everything else refreshes every ~2h to catch expiry / manual removals.
  const newBefore = new Date(Date.now() - 2 * 60_000).toISOString();
  const staleBefore = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const { data: toPoll } = await admin
    .from("olx_adverts")
    .select("id, business_id, olx_advert_id, status")
    .not("olx_advert_id", "is", null)
    .or(`and(status.in.(new,unconfirmed),last_status_at.lt.${newBefore}),last_status_at.is.null,last_status_at.lt.${staleBefore}`)
    .order("last_status_at", { ascending: true, nullsFirst: true })
    .limit(STATUS_BATCH);

  for (const row of toPoll ?? []) {
    if (!row.olx_advert_id) continue;
    const ctx = await ctxFor(row.business_id);
    if (!ctx) continue;
    await refreshAdvertStatus(admin, ctx, row.id, row.olx_advert_id);
    statusChecked++;
    await pause(PACE_MS);
  }

  // ── 3) Auto-extend adverts nearing expiry (opt-in per store) ────────────────────
  // OLX allows a manual `extend` at most once / 14 days; we extend when valid_to
  // is within 24h. `auto_extend_enabled` on the advert also covers this, but the
  // explicit command is our safety net for stores that opted in.
  const soon = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const { data: expiring } = await admin
    .from("olx_adverts")
    .select("id, business_id, olx_advert_id, valid_to")
    .eq("status", "active")
    .not("valid_to", "is", null)
    .lt("valid_to", soon)
    .limit(EXTEND_BATCH);

  for (const row of expiring ?? []) {
    if (!row.olx_advert_id) continue;
    const ctx = await ctxFor(row.business_id);
    if (!ctx || ctx.config.auto_extend !== true) continue;
    const res = await advertCommand(ctx.token, row.olx_advert_id, "extend");
    if (!("error" in res)) {
      extended++;
      await admin.from("olx_adverts").update({ last_status_at: null, updated_at: now }).eq("id", row.id);
    }
    await pause(PACE_MS);
  }

  console.log(`[olx-sync] processed=${processed} failed=${failed} status=${statusChecked} extended=${extended}`);
  return NextResponse.json({ ok: true, processed, failed, statusChecked, extended });
}

async function patchConfig(admin: Admin, businessId: string, patch: Partial<OlxConfig>) {
  const { data: ss } = await admin.from("store_settings").select("olx_config").eq("business_id", businessId).single();
  const config = (ss?.olx_config as OlxConfig) ?? {};
  await admin.from("store_settings")
    .update({ olx_config: { ...config, ...patch } as never })
    .eq("business_id", businessId);
}
