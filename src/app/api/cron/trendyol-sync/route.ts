import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { scrieDacaNeschimbat, stergeDacaNeschimbat } from "@/lib/marketplace/coada-cas";
import { verificaCron } from "@/lib/cron-auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  esteDeconectatTrendyol, eTrecatoare, loadTrendyolContext, processQueueItem, pollOpenBatches,
  reconcileRejections, reconcileStatuses, reconcileInventory, pause,
  type TrendyolQueueItem, type TrendyolSyncContext,
} from "@/lib/trendyol/sync";
import { marcajUrmator, pollPackagesToateVitrinele } from "@/lib/trendyol/orders";
import { alegeInRotatie, magazineConectate } from "@/lib/marketplace/rotatie";
import { patchTrendyolConfig } from "@/lib/trendyol/config";
import type { TrendyolConfig, TrendyolStoreFront } from "@/lib/trendyol/types";

type Admin = SupabaseClient<Database>;

// Trendyol rate limit: 50 requests / 10s per endpoint. Pace conservatively and cap
// per-run work; the cron fires every minute.
const QUEUE_BATCH = 30;
const MAX_ATTEMPTS = 5;

/**
 * Cat se asteapta dupa al n-lea REFUZ: 1, 5, 25, 60 de minute.
 *
 * ⚠ Plafonat la o ora: mai mult ar fi insemnat ca o reparatie facuta de comerciant sta
 * nevazuta jumatate de zi. Iar o cerere noua sterge oricum asteptarea (vezi `queue.ts`).
 */
function asteptareaUrmatoare(incercari: number): number {
  const minute = [1, 5, 25, 60][Math.min(Math.max(incercari, 1), 4) - 1];
  return minute * 60_000;
}

/**
 * Cat se asteapta dupa o PANA a lor (429, 5xx, retea).
 *
 * ⚠ Scurt si fix, nu crescator: pana nu spune nimic despre element, deci n-are ce sa creasca.
 */
function asteptareaDupaPana(): number {
  return 2 * 60_000;
}
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
        /*
         * ⚠ SE STERGE NUMAI DACA NIMENI N-A RESCRIS RANDUL. Coloana `generation` si
         * declansatorul ei existau in baza de mult, iar `revendica_din_coada` intoarce randul
         * intreg — dar lucratorul de aici scria `where id = X` si atat.
         *
         * Deci: omul schimba titlul, lucratorul pleaca la Trendyol, omul schimba si pretul
         * (cerere noua peste acelasi rand), lucratorul se intoarce si sterge randul. A doua
         * schimbare dispare fara sa fi plecat vreodata, si fara nicio eroare nicaieri.
         */
        await stergeDacaNeschimbat(admin, "trendyol_sync_queue", item);
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
          /* ⚠ Se elibereaza si inchirierea: altfel randul asteapta degeaba pana expira
             termenul de cinci minute, desi stim deja ca trebuie reluat. */
          await scrieDacaNeschimbat(admin, "trendyol_sync_queue", item, {
            last_error: res.error.slice(0, 500),
            revendicat_pana: null,
            next_retry_at: new Date(Date.now() + asteptareaDupaPana()).toISOString(),
          });
        } else {
          const attempts = (item.attempts ?? 0) + 1;
          if (attempts >= MAX_ATTEMPTS) {
            /*
             * ═══ ⚠ SE ABANDONEAZA, DAR NU SE STERGE ═══
             *
             * Forma dinainte stergea randul. Cu o linie in jurnal, dar stearsa din coada:
             * nimeni nu-l mai putea vedea, numara sau relua. Un catalog intreg putea disparea
             * fara ca panoul sa arate altceva decat „0 in asteptare", iar comerciantul ar fi
             * crezut ca totul a plecat.
             *
             * ⚠ Coloana `abandonat_la` exista in `trendyol_sync_queue` DE LA INCEPUT si nu era
             * scrisa de nicaieri — masurat: zero folosiri in tot modulul Trendyol. Iar
             * `revendica_din_coada` o citeste deja, deci randul marcat e sarit fara nicio
             * schimbare in baza. Aceeasi reparatie s-a facut la eMAG acum doua zile.
             *
             * ⚠ ABANDONUL E CEA MAI IMPORTANTA COMPARATIE DE GENERATIE. Scris peste o cerere
             * noua, ar opri-o definitiv fara s-o fi incercat vreodata.
             */
            const sAScris = await scrieDacaNeschimbat(admin, "trendyol_sync_queue", item, {
              attempts,
              last_error: res.error.slice(0, 500),
              revendicat_pana: null,
              abandonat_la: new Date().toISOString(),
            });
            if (!sAScris) continue;
            await logError({
              action: "trendyol-sync",
              message: `element abandonat dupa ${attempts} incercari (${item.op}): ${res.error}`.slice(0, 500),
              details: { productId: item.product_id, offerId: item.offer_id },
              businessId, severity: "warning",
            });
          } else {
            /*
             * ⚠ ASTEPTARE CRESCATOARE, nu reincercare la fiecare inchiriere.
             *
             * Pana acum se scriau doar `attempts` si `last_error`, deci randul se relua imediat
             * ce expira termenul de cinci minute. Dar un refuz nu se repara singur: un produs
             * caruia ii lipseste un atribut va fi refuzat la fel si peste cinci minute, iar
             * fiecare reincercare arde o cerere din bugetul magazinului la Trendyol.
             */
            await scrieDacaNeschimbat(admin, "trendyol_sync_queue", item, {
              attempts,
              last_error: res.error.slice(0, 500),
              revendicat_pana: null,
              next_retry_at: new Date(Date.now() + asteptareaUrmatoare(attempts)).toISOString(),
            });
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
    /*
     * ⚠ O CITIRE PICATA NU ARE VOIE SA RUPA TRECEREA CELORLALTI. `pollOpenBatches` arunca
     * acum `EroareCitireBaza` in loc sa citeasca o pana drept „niciun lot deschis" — dar
     * neprinsa, aruncarea ar fi iesit din bucla si ar fi lasat neintrebate loturile TUTUROR
     * magazinelor de dupa. Se scrie si se trece la urmatorul; loturile raman deschise si se
     * intreaba la trecerea urmatoare.
     */
    try {
      await pollOpenBatches(admin, ctx);
      polled++;
    } catch (e) {
      await logError({
        action: "trendyol-sync",
        message: `loturile deschise nu s-au putut citi: ${e instanceof Error ? e.message : String(e)}`,
        businessId, severity: "warning",
      });
    }
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
    /*
     * Marcajul e PE VITRINA.
     *
     * `orders_synced_at` a fost dintotdeauna un singur sir, si ramane asa pentru
     * vitrina principala — retrocompatibil, deci nimeni nu pierde pozitia la
     * livrarea asta. Vitrinele de destinatie (Cross Country) isi tin marcajul in
     * `orders_synced_per_storefront`, ca esecul uneia sa nu opreasca restul si
     * nici sa nu le sara.
     */
    const perVitrina = ctx.config.orders_synced_per_storefront ?? {};
    const vitrinaPrincipala = ctx.auth.storefront ?? "RO";
    const marcaje: Partial<Record<TrendyolStoreFront, number>> = {};
    for (const [v, iso] of Object.entries({ ...perVitrina, [vitrinaPrincipala]: perVitrina[vitrinaPrincipala] ?? ctx.config.orders_synced_at })) {
      const t = iso ? Date.parse(iso) : NaN;
      if (Number.isFinite(t)) marcaje[v as TrendyolStoreFront] = t - ORDERS_OVERLAP_MS;
    }
    const runStart = Date.now();
    // Si vitrinele de destinatie, cand magazinul s-a extins prin Cross Country.
    const r = await pollPackagesToateVitrinele(admin, ctx, marcaje);
    ingested += r.ingested;
    /*
     * Regula sta in `marcajUrmator`, nu aici, fiindca are trei capcane si toate
     * trei au fost calcate deja o data. Acolo e si probata. Se aplica separat
     * pentru fiecare vitrina.
     */
    const noi: Record<string, string> = { ...perVitrina };
    let principalNou: string | undefined;
    for (const rv of r.peVitrina) {
      const marcaj = marcajUrmator(rv, { runStartMs: runStart, overlapMs: ORDERS_OVERLAP_MS });
      if (marcaj == null) continue;
      const iso = new Date(marcaj).toISOString();
      noi[rv.vitrina] = iso;
      if (rv.vitrina === vitrinaPrincipala) principalNou = iso;
    }
    if (Object.keys(noi).length > 0) {
      await patchConfig(admin, businessId, {
        orders_synced_per_storefront: noi,
        ...(principalNou ? { orders_synced_at: principalNou } : {}),
      });
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

/**
 * ⚠ Nu mai citeste-modifica-scrie: imbinarea o face Postgres, pe randul incuiat.
 *
 * Cronul scrie cursoare si marcaje in acelasi JSON in care comerciantul isi scrie setarile.
 * Cu forma veche, oricare dintre ei il calca pe celalalt, si se vedea abia tarziu — o
 * fereastra de comenzi intoarsa in trecut, sau un marcaj scris o singura data si pierdut.
 */
async function patchConfig(admin: Admin, businessId: string, patch: Partial<TrendyolConfig>) {
  await patchTrendyolConfig(admin, businessId, patch);
}
