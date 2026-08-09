import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { verificaCron } from "@/lib/cron-auth";
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
const ACTIVE_STATUSES = ["active", "published", "inactive", "rejected", "problem"];

/*
 * Alege cine intra pe tura asta, prin rotatie.
 *
 * Inainte era `slice(0, N)` peste o lista fara ordine garantata: acelasi magazin
 * putea iesi mereu primul, iar cele de dupa locul N nu ajungeau niciodata la rand.
 * Fereastra porneste din minutul curent, deci in cateva minute trec toti.
 */
function alegeInRotatie(idsuri: string[], cati: number, pas = 1): string[] {
  const sortate = [...idsuri].sort();
  if (sortate.length <= cati) return sortate;
  /*
   * Indicele de tura se ia din CEASUL ABSOLUT, nu din minutul din ora.
   *
   * Trecerea „larga" ruleaza doar la minutele divizibile cu 10, deci pasul dintre
   * doua treceri consecutive era 10 x 6 = 60 — exact perioada minutelor. Rezultat:
   * aceleasi sase magazine, la infinit, si restul niciodata.
   */
  const tura = Math.floor(Date.now() / 60_000 / pas);
  const start = (tura * cati) % sortate.length;
  return Array.from({ length: cati }, (_, i) => sortate[(start + i) % sortate.length]);
}

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
  let processed = 0, failed = 0, polled = 0, reconciled = 0, ordersIngested = 0;
  const ctxCache = new Map<string, AboutYouSyncContext | null>();
  async function ctxFor(businessId: string): Promise<AboutYouSyncContext | null> {
    if (ctxCache.has(businessId)) return ctxCache.get(businessId)!;
    const ctx = await loadAboutYouContext(admin, businessId);
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
  const { data: revendicate, error: eCoada } = await admin.rpc("revendica_din_coada" as never, {
    p_coada: "aboutyou_sync_queue", p_limita: QUEUE_BATCH,
  } as never);
  if (eCoada) {
    await logError({ action: "aboutyou-sync", message: `coada nu s-a putut revendica: ${eCoada.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "coada indisponibila" }, { status: 503 });
  }
  const queue = ((revendicate ?? []) as unknown as Record<string, unknown>[]) as unknown as AboutYouQueueItem[];

  const byBiz = new Map<string, AboutYouQueueItem[]>();
  for (const item of (queue ?? []) as AboutYouQueueItem[]) {
    if (!byBiz.has(item.business_id)) byBiz.set(item.business_id, []);
    byBiz.get(item.business_id)!.push(item);
  }

  for (const [businessId, items] of byBiz) {
    const ctx = await ctxFor(businessId);
    if (ctx === null) {
      /*
       * ATENTIE: `loadAboutYouContext` intoarce `null` si cand magazinul nu e
       * conectat, si cand citirea configului a esuat. Stergeam coada in ambele
       * cazuri — deci un hop la baza de date arunca TOATA munca magazinului,
       * inclusiv impingerile de AWB catre comenzi deja platite.
       *
       * Acum verificam separat daca magazinul chiar e deconectat. Daca nu putem
       * afla, lasam coada in pace: elementele se reiau la urmatoarea trecere.
       */
      const deconectat = await esteDeconectat(admin, businessId);
      if (deconectat === true) {
        await admin.from("aboutyou_sync_queue").delete().in("id", items.map((i) => i.id));
      }
      continue;
    }
    let opritDinLimita = false;
    for (const item of items) {
      const res = await processQueueItem(admin, ctx, item);
      if (res.ok) {
        await admin.from("aboutyou_sync_queue").delete().eq("id", item.id);
        processed++;
      } else {
        failed++;
        const attempts = (item.attempts ?? 0) + 1;
        /*
         * Cauzele trecatoare nu consuma incercari.
         *
         * Cronul ruleaza in fiecare minut, iar limita era 5 incercari: cinci
         * minute in care About You raspunde 429 sau 5xx goleau coada intreaga,
         * definitiv, si nimeni nu afla ca produsele n-au mai ajuns. O limita de
         * rata sau o indisponibilitate nu spun nimic despre elementul din coada,
         * deci nu se pun in contul lui — si oprim magazinul pe tura asta, ca sa
         * nu inrautatim limita lovind-o iar.
         */
        if (eTrecatoare(res.status)) {
          await admin.from("aboutyou_sync_queue")
            .update({ last_error: res.error.slice(0, 500) }).eq("id", item.id);
          opritDinLimita = true;
          break;
        }
        if (attempts >= MAX_ATTEMPTS) {
          await admin.from("aboutyou_sync_queue").delete().eq("id", item.id);
        } else {
          await admin.from("aboutyou_sync_queue").update({ attempts, last_error: res.error.slice(0, 500) }).eq("id", item.id);
        }
      }
      await pause(PACE_MS);
    }
    if (opritDinLimita) await pause(PACE_MS * 3);
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

  /*
   * ── 3) Reconciliere statusuri ────────────────────────────────────────────────
   *
   * Nu doar magazinele cu listari in asteptare: About You poate dezactiva sau
   * respinge si un produs demult activ (imagine retrasa, brand suspendat), iar
   * magazinele fara nimic „pending" nu ajungeau niciodata sa fie intrebate — deci
   * nu aflau. La fiecare al zecelea minut trecem si prin restul, in rotatie.
   */
  const rotatieLarga = new Date().getMinutes() % 10 === 0;
  const { data: pendingBiz } = await admin
    .from("aboutyou_listings").select("business_id")
    .in("status", rotatieLarga ? [...PENDING_STATUSES, ...ACTIVE_STATUSES] : PENDING_STATUSES)
    .limit(300);
  const reconcileSet = alegeInRotatie(
    [...new Set((pendingBiz ?? []).map((r) => r.business_id))], RECONCILE_BIZ, rotatieLarga ? 10 : 1);
  for (const businessId of reconcileSet) {
    const ctx = await ctxFor(businessId);
    if (!ctx) continue;
    await reconcileStatuses(admin, ctx);
    reconciled++;
    await pause(PACE_MS);
  }

  // ── 4) Poll orders for active sellers (order.created webhook is primary) ─────────
  const { data: sellerBiz } = await admin.from("aboutyou_listings").select("business_id").limit(500);
  const orderPollSet = alegeInRotatie([...new Set((sellerBiz ?? []).map((r) => r.business_id))], POLL_ORDERS_BIZ);
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

/*
 * Actualizare partiala a configului, fara sa calce peste ce a salvat omul.
 *
 * Citirea si scrierea nu sunt atomice: intre ele, comerciantul poate apasa
 * „Salvează setările", iar noi scriam inapoi obiectul VECHI cu doua campuri
 * schimbate, anuland-o. `jsonb_merge_config` face imbinarea in Postgres, intr-o
 * singura instructiune, deci nu mai exista fereastra.
 */
async function patchConfig(admin: Admin, businessId: string, patch: Partial<AboutYouConfig>) {
  const { error } = await admin.rpc("jsonb_merge_config" as never, {
    p_business_id: businessId,
    p_column: "aboutyou_config",
    p_patch: patch,
  } as never);
  if (!error) return;
  // Cadere de siguranta daca functia lipseste inca din baza.
  const { data: ss } = await admin.from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
  const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
  await admin.from("store_settings")
    .update({ aboutyou_config: { ...config, ...patch } as never })
    .eq("business_id", businessId);
}

/**
 * `true` = magazinul chiar nu are About You conectat; `false` = are; `null` = nu
 * am putut afla. Distinctia decide daca avem voie sa stergem coada.
 */
async function esteDeconectat(admin: Admin, businessId: string): Promise<boolean | null> {
  const { data, error } = await admin
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).maybeSingle();
  if (error) return null;
  const config = (data?.aboutyou_config as AboutYouConfig) ?? {};
  return !config.connected || !config.api_key;
}

/*
 * Esecuri care nu spun nimic despre elementul din coada.
 *
 * Se decide pe CODUL HTTP, nu pe textul mesajului: 429 (limita de rata), 5xx
 * (About You indisponibil) si 0 (retea sau termen depasit la noi). Potrivirea pe
 * text depindea de un sir pe care furnizorul il poate schimba oricand, iar cand
 * n-ar mai fi potrivit, cinci minute de indisponibilitate ar goli coada definitiv.
 */
function eTrecatoare(status: number | undefined): boolean {
  if (status == null) return false;
  return status === 429 || status === 0 || (status >= 500 && status <= 599);
}
