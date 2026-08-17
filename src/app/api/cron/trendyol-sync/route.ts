import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { verificaCron } from "@/lib/cron-auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  esteDeconectatTrendyol, eTrecatoare, loadTrendyolContext, processQueueItem, pollOpenBatches,
  reconcileRejections, reconcileStatuses, reconcileInventory, pause,
  type TrendyolQueueItem, type TrendyolSyncContext,
} from "@/lib/trendyol/sync";
import { marcajUrmator, pollPackages } from "@/lib/trendyol/orders";
import { alegeInRotatie, magazineConectate } from "@/lib/marketplace/rotatie";
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
/*
 * Ce statusuri fac un magazin sa merite o trecere de reconciliere.
 *
 * `approved`/`active` sunt aici DINADINS: respingerea la revizuie vine DUPA
 * acceptare, deci un magazin cu toate produsele „aprobate" e exact cel care are
 * nevoie sa afle ca unul dintre ele a fost respins intre timp. Cu vechiul filtru
 * pe „pending/created", nu l-ar fi verificat nimeni niciodata.
 */
const RECONCILE_STATUSES = ["pending", "created", "approved", "active", "rejected"];

function verifyCron(req: NextRequest): boolean {
  // Vezi src/lib/cron-auth.ts: varianta de dinainte trecea cand CRON_SECRET
  // lipsea din mediu (undefined === undefined).
  return verificaCron(req);
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
  /*
   * Randurile se REVENDICA, nu doar se citesc.
   *
   * Cronul asta porneste din minut in minut si face apeluri externe care pot
   * dura. Cu un simplu `select ... limit N`, o rulare mai lunga de un minut si
   * urmatoarea citesc ACELEASI randuri — si trimit de doua ori la marketplace.
   *
   * `revendica_din_coada` le incuie (`for update skip locked`) si le marcheaza cu
   * un termen: al doilea lucrator primeste randurile URMATOARE, nu aceleasi. Vezi
   * migratia `2026-08-19-lease-cozi-marketplace`.
   */
  const { data: revendicate, error: eCoada } = await admin.rpc("revendica_din_coada", {
    p_coada: "trendyol_sync_queue", p_limita: QUEUE_BATCH,
  });
  if (eCoada) {
    await logError({ action: "trendyol-sync", message: `coada nu s-a putut revendica: ${eCoada.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "coada indisponibila" }, { status: 503 });
  }
  const queue = ((revendicate ?? []) as unknown as Record<string, unknown>[]) as unknown as TrendyolQueueItem[];

  const byBiz = new Map<string, TrendyolQueueItem[]>();
  for (const item of (queue ?? []) as TrendyolQueueItem[]) {
    if (!byBiz.has(item.business_id)) byBiz.set(item.business_id, []);
    byBiz.get(item.business_id)!.push(item);
  }

  for (const [businessId, items] of byBiz) {
    const ctx = await ctxFor(businessId);
    if (!ctx) {
      /*
       * `ctx` lipsa NU inseamna „magazin deconectat".
       *
       * `loadTrendyolContext` intoarce `null` si cand nu poate CITI configurarea
       * — deci un hop la baza de date arunca toata munca magazinului: listari,
       * dar si impingerile de stoc puse la coada dupa comenzi deja incasate.
       * Fara log si fara urma, ceea ce inseamna ca nici n-ai de unde afla.
       *
       * Acum se verifica separat. Cand nu putem afla, coada ramane pe loc:
       * elementele se reiau la trecerea urmatoare.
       */
      const deconectat = await esteDeconectatTrendyol(admin, businessId);
      if (deconectat === true) {
        await admin.from("trendyol_sync_queue").delete().in("id", items.map((i) => i.id));
      } else {
        await logError({
          action: "trendyol-sync",
          message: `configurarea magazinului nu s-a putut citi; coada de ${items.length} ramane neatinsa`,
          businessId, severity: "warning",
        });
      }
      continue;
    }
    for (const item of items) {
      const res = await processQueueItem(admin, ctx, item);
      if (res.ok) {
        await admin.from("trendyol_sync_queue").delete().eq("id", item.id);
        processed++;
      } else {
        failed++;
        // Chei respinse: oprim coada magazinului si ii aratam ca trebuie sa
        // reconecteze. Altfel ar ramane cu produse nelistate si zero explicatii.
        if (res.authFailed) {
          await patchConfig(admin, businessId, { needs_reconnect: true });
          break;
        }
        /*
         * Un 429 sau un 503 nu spune nimic despre elementul din coada.
         *
         * Numarate ca incercari, cinci minute de indisponibilitate la Trendyol
         * goleau coada definitiv — produsele ramaneau nelistate si nu mai exista
         * nici macar randul din care sa se vada ca au fost cerute. Esecurile
         * trecatoare doar intarzie elementul, fara sa-i arda incercarile.
         */
        if (eTrecatoare(res.status)) {
          await admin.from("trendyol_sync_queue")
            .update({ last_error: res.error.slice(0, 500) }).eq("id", item.id);
        } else {
          const attempts = (item.attempts ?? 0) + 1;
          if (attempts >= MAX_ATTEMPTS) {
            // Ultima incercare NU se pierde tacut: cine se uita in loguri trebuie
            // sa poata afla ce produs a renuntat si de ce.
            await logError({
              action: "trendyol-sync",
              message: `element abandonat dupa ${attempts} incercari (${item.op}): ${res.error}`.slice(0, 500),
              details: { productId: item.product_id, offerId: item.offer_id },
              businessId, severity: "warning",
            });
            await admin.from("trendyol_sync_queue").delete().eq("id", item.id);
          } else {
            await admin.from("trendyol_sync_queue").update({ attempts, last_error: res.error.slice(0, 500) }).eq("id", item.id);
          }
        }
      }
      await pause(PACE_MS);
    }
    await patchConfig(admin, businessId, { last_sync_at: now });
  }

  // ── 2) Poll open batches ─────────────────────────────────────────────────────────
  const { data: batchBiz } = await admin
    .from("trendyol_batches").select("business_id")
    .in("status", ["pending", "processing", "retry"])
    // `order` + rotatie in loc de `slice`: fara ele, primele magazine ies mereu
    // primele si cele de la coada nu ajung niciodata la rand.
    .order("business_id", { ascending: true }).limit(1000);
  const pollSet = alegeInRotatie([...new Set((batchBiz ?? []).map((r) => r.business_id))], MAX_BIZ);
  for (const businessId of pollSet) {
    const ctx = await ctxFor(businessId);
    if (!ctx) continue;
    await pollOpenBatches(admin, ctx);
    polled++;
    await pause(PACE_MS);
  }

  // ── 3) Reconcile approval for stores with listings awaiting approval ─────────────
  const { data: pendingBiz } = await admin
    .from("trendyol_listings").select("business_id")
    .in("status", RECONCILE_STATUSES)
    .order("business_id", { ascending: true }).limit(1000);
  const reconcileSet = alegeInRotatie([...new Set((pendingBiz ?? []).map((r) => r.business_id))], RECONCILE_BIZ);
  for (const businessId of reconcileSet) {
    const ctx = await ctxFor(businessId);
    if (!ctx) continue;
    await reconcileStatuses(admin, ctx);
    /*
     * Si respingerile de la REVIZUIE, in aceeasi trecere.
     *
     * `reconcileStatuses` afla doar ce a fost APROBAT. Un produs poate insa sa
     * treaca de lot cu `SUCCESS` si sa fie respins abia la revizuirea de
     * continut — „Eroare de conexiune la serverul de imagini" e cazul real de la
     * primul comerciant care a publicat. Fara pasul asta, produsul ramane
     * „in aprobare" pentru totdeauna, desi la ei e respins si nu se vinde.
     */
    await reconcileRejections(admin, ctx);
    reconciled++;
    await pause(PACE_MS);
  }

  // ── 4) Poll recent orders (safety net for missed webhooks) ──────────────────────
  /*
   * ⚠ POOL-UL VINE DIN `store_settings`, NU DIN TABELA DE LISTARI.
   *
   * Era `trendyol_listings ... .limit(500)`, deduplicat DUPA aceea: un singur
   * vanzator cu 500 de produse umplea singur fereastra, si atunci NICIUN alt
   * magazin nu-si mai lua comenzile — nu incet, ci deloc. Trunchierea se facea
   * inaintea deduplicarii, deci rotatia n-ar fi reparat-o. Vezi `magazineConectate`.
   */
  const { ids: sellerIds, error: eSelleri } = await magazineConectate(admin, "trendyol_config");
  if (eSelleri) {
    await logError({ action: "trendyol-sync", message: `magazinele conectate nu s-au putut citi: ${eSelleri}`, severity: "critical" });
  }
  let ingested = 0;
  for (const businessId of alegeInRotatie(sellerIds, ORDERS_BIZ)) {
    const ctx = await ctxFor(businessId);
    if (!ctx) continue;
    const parsed = ctx.config.orders_synced_at ? Date.parse(ctx.config.orders_synced_at) : NaN;
    const sinceMs = Number.isFinite(parsed) ? parsed - ORDERS_OVERLAP_MS : undefined;
    const runStart = Date.now();
    const r = await pollPackages(admin, ctx, sinceMs);
    ingested += r.ingested;
    /*
     * Regula sta in `marcajUrmator`, nu aici, fiindca are trei capcane si toate
     * trei au fost calcate deja o data. Acolo e si probata.
     */
    const marcaj = marcajUrmator(r, { runStartMs: runStart, overlapMs: ORDERS_OVERLAP_MS });
    if (marcaj != null) {
      await patchConfig(admin, businessId, { orders_synced_at: new Date(marcaj).toISOString() });
    }
    await pause(PACE_MS);
  }

  // ── 5) Reverse inventory reconciliation (drift safety net; every ~15 min) ────────
  let corrected = 0;
  if (new Date().getMinutes() % 15 === 0) {
    /*
     * `pas = 15`: trecerea asta ruleaza doar la sferturi de ora, deci intre doua
     * executii EFECTIVE indicele de tura creste cu 15. Lasat pe 1, `start` ar sari
     * cu `15 * INVENTORY_BIZ` si ar reveni la aceleasi magazine la nesfarsit —
     * exact infometarea pe care rotatia trebuia s-o inlature.
     */
    for (const businessId of alegeInRotatie(sellerIds, INVENTORY_BIZ, 15)) {
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
