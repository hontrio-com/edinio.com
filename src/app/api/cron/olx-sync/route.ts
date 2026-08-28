import { NextRequest, NextResponse } from "next/server";
import { patchOlxConfig } from "@/lib/olx/config";
import { logError } from "@/lib/error-logger";
import { scrieDacaNeschimbat, stergeDacaNeschimbat } from "@/lib/marketplace/coada-cas";
import { verificaCron } from "@/lib/cron-auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  loadOlxContext, processQueueItem, refreshAdvertStatus, pause, type RezultatContext,
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

/**
 * Cat se asteapta pana la incercarea urmatoare.
 *
 * ⚠ Crescator si PLAFONAT: fara plafon, a cincea asteptare ar fi de ore, iar o modificare de pret
 * ar sta degeaba dupa ce OLX si-a revenit demult. Cu plafon la un sfert de ora, cele cinci
 * incercari se intind peste vreo jumatate de ora — destul cat sa treaca o pana obisnuita.
 */
function asteptareaUrmatoare(attempts: number): string {
  const minute = Math.min(15, 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + minute * 60_000).toISOString();
}
const PACE_MS = 300;

function verifyCron(req: NextRequest): boolean {
  // Vezi src/lib/cron-auth.ts: varianta de dinainte trecea cand CRON_SECRET
  // lipsea din mediu (undefined === undefined).
  return verificaCron(req);
}

/** ⚠ Scris o data: fiecare scriere in coada trece prin CAS pe generatie. */
const COADA = "olx_sync_queue" as const;

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = new Date().toISOString();
  let processed = 0, failed = 0, statusChecked = 0, extended = 0;
  const ctxCache = new Map<string, RezultatContext>();

  async function ctxFor(businessId: string): Promise<RezultatContext> {
    if (ctxCache.has(businessId)) return ctxCache.get(businessId)!;
    const r = await loadOlxContext(admin, businessId);
    ctxCache.set(businessId, r);
    return r;
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
    p_coada: "olx_sync_queue", p_limita: QUEUE_BATCH,
  });
  if (eCoada) {
    await logError({ action: "olx-sync", message: `coada nu s-a putut revendica: ${eCoada.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "coada indisponibila" }, { status: 503 });
  }
  const queue = ((revendicate ?? []) as unknown as Record<string, unknown>[]) as unknown as OlxQueueItem[];

  const byBiz = new Map<string, OlxQueueItem[]>();
  for (const item of (queue ?? []) as OlxQueueItem[]) {
    if (!byBiz.has(item.business_id)) byBiz.set(item.business_id, []);
    byBiz.get(item.business_id)!.push(item);
  }

  for (const [businessId, items] of byBiz) {
    const r = await ctxFor(businessId);
    if (r.stare !== "gata") {
      /*
       * ═══ ⚠ NUMAI „DECONECTAT" INDREPTATESTE STERGEREA (29.08.2026, noaptea) ═══
       *
       * Pana azi se stergea la orice `null` — inclusiv la o pana de retea de cinci secunde in
       * reimprospatarea tokenului. Adica pretul si stocul cerute de comerciant se aruncau definitiv,
       * pentru o clipa proasta, fara ca nimeni sa afle.
       *
       * ⚠ Deconectat: lucrarile chiar n-au unde pleca — se sterg, ca sa nu se adune la nesfarsit.
       * ⚠ Cere reconectare / trecatoare: se ASTEAPTA. Elementul ramane in coada, cu asteptare
       * crescatoare; daca omul reconecteaza maine, pleaca de la sine.
       */
      if (r.stare === "deconectat") {
        for (const it of items) await stergeDacaNeschimbat(admin, COADA, it);
        continue;
      }
      for (const it of items) {
        const attempts = (it.attempts ?? 0) + 1;
        await scrieDacaNeschimbat(admin, COADA, it, {
          attempts,
          last_error: r.motiv.slice(0, 500),
          next_retry_at: asteptareaUrmatoare(attempts),
          ...(attempts >= MAX_ATTEMPTS ? { abandonat_la: now } : {}),
        });
      }
      await logError({
        action: "olx-sync", severity: r.stare === "cere-reconectare" ? "warning" : "info",
        message: `lucrarile OLX asteapta (${r.stare}): ${r.motiv}`,
        details: { cate: items.length }, businessId,
      });
      continue;
    }
    const ctx = r.ctx;

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
        await stergeDacaNeschimbat(admin, COADA, item);
        processed++;
      } else if (res.permanent) {
        await stergeDacaNeschimbat(admin, COADA, item);
        failed++;
      } else {
        failed++;
        const attempts = (item.attempts ?? 0) + 1;
        /*
         * ═══ ⚠ MUNCA TRECATOARE NU SE MAI ARUNCA (29.08.2026, noaptea) ═══
         *
         * La a cincea incercare se STERGEA elementul. Dar `permanent` e deja tratat mai sus, deci
         * aici sunt doar cauze trecatoare: `429`, `500`, retea. O pana OLX de o jumatate de ora
         * consuma cele cinci incercari intr-un minut si arunca definitiv modificarea — iar pretul
         * ramane vechi la ei pana cand omul mai atinge produsul, poate niciodata.
         *
         * ⚠ Acum: asteptare crescatoare intre incercari, si la capat SCRISORI MOARTE, nu stergere.
         * `abandonat_la` scoate elementul din revendicare, dar il lasa vizibil — cu de cate ori s-a
         * incercat si cu ultima eroare. Sters, n-ar mai fi ramas nici macar intrebarea.
         */
        await scrieDacaNeschimbat(admin, COADA, item, {
          attempts,
          last_error: res.error.slice(0, 500),
          next_retry_at: asteptareaUrmatoare(attempts),
          ...(attempts >= MAX_ATTEMPTS ? { abandonat_la: now } : {}),
        });
        if (attempts >= MAX_ATTEMPTS) {
          await logError({
            action: "olx-sync", severity: "critical",
            message: `o lucrare OLX a fost abandonata dupa ${attempts} incercari: ${res.error.slice(0, 200)}`,
            details: { offerId: item.offer_id, op: item.op }, businessId,
          });
        }
      }
      await pause(PACE_MS);
    }
    await patchOlxConfig(admin, businessId, { last_sync_at: now });
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
    const rCtx = await ctxFor(row.business_id);
    const ctx = rCtx.stare === "gata" ? rCtx.ctx : null;
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
    const rExt = await ctxFor(row.business_id);
    if (rExt.stare !== "gata" || rExt.ctx.config.auto_extend !== true) continue;
    const ctx = rExt.ctx;
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

