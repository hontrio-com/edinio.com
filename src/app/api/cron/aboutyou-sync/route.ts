import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { verificaCron } from "@/lib/cron-auth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  alarmaIntentiiDeschise, continuaLucrarileInMasa, loadAboutYouContext, processQueueItem, pollOpenBatches,
  reconcileStatuses, treciPrinVeghe, pause,
  type AboutYouQueueItem, type AboutYouSyncContext,
} from "@/lib/aboutyou/sync";
import { pollOrders, reconciliazaComenzile } from "@/lib/aboutyou/orders";
import { reiaEvenimenteleNeprelucrate } from "@/lib/aboutyou/inbox";
import { patchAboutYouConfig } from "@/lib/aboutyou/config";
// Mutata in `lib/marketplace/rotatie` ca s-o poata folosi si cronul Trendyol,
// care taia inca cu `.slice()`.
import { alegeInRotatie, magazineConectate } from "@/lib/marketplace/rotatie";
import { marcajUrmator } from "@/lib/marketplace/marcaj";
import { scrieDacaNeschimbat, stergeDacaNeschimbat } from "@/lib/marketplace/coada-cas";
import type { AboutYouConfig } from "@/lib/aboutyou/types";

type Admin = SupabaseClient<Database>;

/*
 * Fereastra de execuție, declarata explicit.
 *
 * Lipsea, deci ruta cadea pe limita implicita a platformei. Douasprezece cronuri
 * din repo o fixeaza; aici nu. Pasii se executa in ordine, iar primii tăiați la
 * expirare sunt exact ultimii doi: reconcilierea statusurilor si POLLUL DE
 * COMENZI. O comanda neluata la timp inseamna un colet netrimis.
 */
export const maxDuration = 60;

/*
 * Buget de timp pentru primii trei pasi, ca al patrulea sa apuce sa ruleze.
 *
 * `maxDuration` singur nu ajuta: pasii se executa in ordine, deci la expirare cei
 * tăiați sunt mereu ultimii — reconcilierea statusurilor si POLLUL DE COMENZI. Iar
 * o comanda neluata la timp inseamna un colet netrimis, adica singurul lucru din
 * tot cronul care costa bani imediat. Cronul e programat din minut in minut, deci
 * ce nu incape acum se reia oricum peste un minut.
 */
const BUGET_PASI_1_3_MS = 38_000;
/** Marginea intregii rulari: sub `maxDuration`, cu loc de incheiere. */
const BUGET_TOTAL_MS = 52_000;

// About You rate limits: products 100/min, results 200/min, categories/attrs
// 300/min. The cron fires every minute; pace conservatively and cap per-run work.
const QUEUE_BATCH = 30;
const MAX_ATTEMPTS = 5;

/** ⚠ Scris o data: fiecare scriere in coada trece prin CAS pe generatie. Vezi `coada-cas.ts`. */
const COADA = "aboutyou_sync_queue" as const;
const MAX_BIZ = 12;
const RECONCILE_BIZ = 6;
const POLL_ORDERS_BIZ = 10;
// Suprapunerea ferestrei de comenzi, ca sa nu se piarda nimic in cusatura dintre
// doua rulari. Trendyol o avea de mult; aici era zero.
const ORDERS_OVERLAP_MS = 5 * 60 * 1000;
const PACE_MS = 300;
/*
 * Cele doua liste de statusuri au dispărut odata cu selectia care le folosea.
 *
 * Pasul 3 filtra magazinele dupa statusul listarilor lor, si tocmai asta era
 * defectul: „error" nu era in nicio lista, deci un magazin ale carui listari
 * ajunseseră toate pe eroare nu mai era ales NICIODATA pentru reconciliere — adica
 * exact magazinul care avea cea mai mare nevoie. Mulțimea vine acum din
 * `store_settings`, unde apartenenta nu depinde de starea produselor.
 */

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
  const inceput = Date.now();
  const fereastraPlina = () => Date.now() - inceput > BUGET_PASI_1_3_MS;
  let processed = 0, failed = 0, polled = 0, reconciled = 0, ordersIngested = 0, reluate = 0;
  let raspandite = 0, vegheate = 0;
  const ctxCache = new Map<string, AboutYouSyncContext | null>();
  async function ctxFor(businessId: string): Promise<AboutYouSyncContext | null> {
    if (ctxCache.has(businessId)) return ctxCache.get(businessId)!;
    /* ⚠ Poate ARUNCA: `loadAboutYouContext` nu mai preface o pana in „nu e conectat". */
    const ctx = await loadAboutYouContext(admin, businessId);
    ctxCache.set(businessId, ctx);
    return ctx;
  }

  /*
   * ═══ ⚠ UN MAGAZIN NU ARE VOIE SA DOBOARE PASUL PENTRU CEILALTI (27.08.2026) ═══
   *
   * De azi, citirile din baza ARUNCA in loc sa intoarca `null` — altfel o pana de-o clipa trecea
   * drept „nu exista" si se luau hotarari pe ea. Dar pasii 2 si 3 chemau `pollOpenBatches` si
   * `reconcileStatuses` fara nicio plasa: o aruncare la primul magazin ar fi iesit din bucla si ar
   * fi oprit si pasul 4 — ingestul comenzilor, adica exact ce n-are voie sa cada.
   *
   * ⚠ Nu e o inghitire: se scrie, si magazinul se numara la `failed`. Ce nu se face acum se face
   * la minutul urmator; ce nu are voie e ca un magazin sa-i traga pe ceilalti dupa el.
   */
  async function peMagazin(businessId: string, pas: string, treaba: () => Promise<void>): Promise<boolean> {
    try {
      await treaba();
      return true;
    } catch (e) {
      failed++;
      await logError({
        action: "aboutyou-sync", severity: "warning",
        message: `pasul „${pas}” a picat pentru un magazin: ${e instanceof Error ? e.message : String(e)}`,
        details: { businessId, pas }, businessId,
      });
      return false;
    }
  }

  /*
   * ═══ ⚠ UN HOP AL BAZEI SAREA TACUT PESTE UN MAGAZIN INTREG (27.08.2026) ═══
   *
   * Pasii 2, 3 si 4 faceau `if (!ctx) continue`, iar `loadAboutYouContext` intorcea `null` si
   * cand configul nu se putea CITI. Deci o clipa proasta a bazei sarea peste sondarea loturilor,
   * peste reconciliere si peste ingestul comenzilor magazinului — si rularea se numara oricum
   * drept reusita. Nimeni n-avea de unde afla.
   *
   * ⚠ SE SARE MAI DEPARTE, dar SE SCRIE. Un magazin cu configul necitibil nu are voie sa opreasca
   * cronul celorlalte; ce n-are voie e sa taca.
   */
  async function ctxSauScrie(businessId: string, pas: string): Promise<AboutYouSyncContext | null> {
    try {
      return await ctxFor(businessId);
    } catch (e) {
      failed++;
      await logError({
        action: "aboutyou-sync", severity: "warning",
        message: `configul magazinului nu s-a putut citi la pasul „${pas}”: ${e instanceof Error ? e.message : String(e)}`,
        details: { businessId, pas }, businessId,
      });
      return null;
    }
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
    p_coada: "aboutyou_sync_queue", p_limita: QUEUE_BATCH,
  });
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
    // Ce nu incape in fereastra se reia peste un minut; comenzile nu au voie sa
    // rămână pe dinafara. Randurile nerevendicate isi pierd singure lease-ul.
    if (fereastraPlina()) break;
    const ctx = await ctxSauScrie(businessId, "coada");
    if (ctx === null) {
      /*
       * ATENTIE: `loadAboutYouContext` intorcea `null` si cand magazinul nu e
       * conectat, si cand citirea configului a esuat. Stergeam coada in ambele
       * cazuri — deci un hop la baza de date arunca TOATA munca magazinului,
       * inclusiv impingerile de AWB catre comenzi deja platite.
       *
       * Verificam separat daca magazinul chiar e deconectat. Daca nu putem
       * afla, lasam coada in pace: elementele se reiau la urmatoarea trecere.
       *
       * ⚠ DE CE RAMANE VERIFICAREA, desi `loadAboutYouContext` arunca acum la pana: `null` mai
       * inseamna si „conectat, dar fara cheie" — iar de-acolo se ajungea tot la stergerea cozii.
       * Iar `ctxSauScrie` preface aruncarea inapoi in `null`, ca sa nu opreasca celelalte
       * magazine; deci verificarea de dedesubt e chiar ce deosebeste cele doua drumuri.
       */
      const deconectat = await esteDeconectat(admin, businessId);
      if (deconectat === true) {
        /*
         * ⚠ CATE UNUL, CU PAZA PE GENERATIE. Un `delete ... in (ids)` ar sterge si randurile
         * rescrise intre timp. Magazinul e deconectat, deci cererile n-au unde pleca — dar daca
         * cineva tocmai l-a reconectat si a pus ceva la coada, aia trebuie sa ramana.
         */
        for (const it of items) await stergeDacaNeschimbat(admin, COADA, it);
      }
      continue;
    }
    let opritDinLimita = false;
    for (const item of items) {
      /*
       * Garda si INTRE elemente, nu doar intre magazine.
       *
       * Cazul obisnuit e un singur magazin cu treizeci de elemente: garda de mai
       * sus se evalua o data, la inceput, si nu mai avea niciodata ocazia. Un
       * element care asteapta zece secunde manca singur fereastra celorlalti pasi.
       * Randurile neatinse raman revendicate si se reiau la minutul urmator.
       */
      if (fereastraPlina()) break;
      const res = await processQueueItem(admin, ctx, item);
      if (res.ok) {
        /*
         * ⚠ SE STERGE NUMAI DACA NIMENI N-A RESCRIS RANDUL. Vezi nota lunga de la
         * `AboutYouQueueItem.generation`: intre revendicare si terminarea apelului extern trec
         * secunde, iar o schimbare de stoc facuta chiar atunci era stearsa de terminarea celei
         * vechi. `false` inseamna „a venit o cerere mai noua" — randul ramane si se ia imediat.
         */
        if (await stergeDacaNeschimbat(admin, COADA, item)) processed++;
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
          await scrieDacaNeschimbat(admin, COADA, item, { last_error: res.error.slice(0, 500) });
          opritDinLimita = true;
          break;
        }
        if (attempts >= MAX_ATTEMPTS) {
          /*
           * ELEMENTUL RENUNTAT LASA O URMA acolo unde comerciantul chiar se uita.
           *
           * Se stergea pur si simplu din coada, cu tot cu `last_error`: contorul
           * „În coadă" trecea prin N si revenea la 0, iar de ce n-a plecat produsul
           * nu mai afla nimeni. Nu facem un tabel de scrisori moarte — scriem
           * motivul pe listarea sau pe comanda careia ii apartine elementul, unde
           * exista deja si afisare, si buton de reluare.
           */
          const motiv = `Renunțat după ${MAX_ATTEMPTS} încercări: ${res.error}`.slice(0, 500);
          if (item.op === "ship") {
            await admin.from("aboutyou_orders")
              .update({ status: "ship_failed", updated_at: new Date().toISOString() })
              .eq("business_id", businessId).eq("order_id", item.offer_id);
          } else {
            await admin.from("aboutyou_listings")
              .update({ status: "error", error: motiv, updated_at: new Date().toISOString() })
              .eq("business_id", businessId).eq("style_key", item.offer_id);
          }
          await logError({
            action: "aboutyou-sync", severity: "warning",
            message: `Element renunțat din coadă (${item.op}): ${res.error}`,
            details: { businessId, offerId: item.offer_id, attempts }, businessId,
          });
          /*
           * ⚠ SI ABANDONUL SE PAZESTE, ba chiar mai ales el. Sters peste o cerere NOUA, produsul
           * n-ar mai pleca niciodata — iar omul tocmai a apasat ceva ce nu s-a incercat vreodata.
           */
          await stergeDacaNeschimbat(admin, COADA, item);
        } else {
          await scrieDacaNeschimbat(admin, COADA, item, {
            attempts, last_error: res.error.slice(0, 500),
          });
        }
      }
      await pause(PACE_MS);
    }
    if (opritDinLimita) await pause(PACE_MS * 3);
    await patchAboutYouConfig(admin, businessId, { last_sync_at: now });
  }

  /*
   * Multimea de magazine vine din `store_settings`, o singura data, si o folosesc
   * pasii 2, 3 si 4.
   *
   * Citita din tabelele de lucru cu `.limit()` si deduplicata DUPA, un magazin cu
   * multe randuri umplea singur fereastra si ceilalti nu mai ajungeau niciodata.
   * Un `.order()` n-ar repara asta — ar face infometarea determinista. Apartenenta
   * la multime nu are voie sa depinda de cate randuri are magazinul.
   */
  const { ids: sellerIds, error: eSelleri } = await magazineConectate(admin, "aboutyou_config");
  if (eSelleri) {
    await logError({ action: "aboutyou-sync", message: `magazinele conectate nu s-au putut citi: ${eSelleri}`, severity: "critical" });
  }

  // ── 2) Poll open batches for businesses that have any ────────────────────────────
  const pollSet = alegeInRotatie(sellerIds, MAX_BIZ);
  for (const businessId of pollSet) {
    if (fereastraPlina()) break;
    const ctx = await ctxSauScrie(businessId, "loturi");
    if (!ctx) continue;
    if (await peMagazin(businessId, "loturi", () => pollOpenBatches(admin, ctx))) polled++;
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
  const reconcileSet = alegeInRotatie(sellerIds, RECONCILE_BIZ, rotatieLarga ? 10 : 1);
  for (const businessId of reconcileSet) {
    if (fereastraPlina()) break;
    const ctx = await ctxSauScrie(businessId, "reconciliere");
    if (!ctx) continue;
    // Rezultatul se CITESTE: o cheie invalidata sau o pana inghetau statusurile
    // la nesfarsit, iar rularea se numara oricum drept reusita.
    // Termenul e cel al pasilor 1-3: ce nu incape se reia la minutul urmator,
    // ca pasul 4 (comenzile) sa apuce sa ruleze.
    let rec: Awaited<ReturnType<typeof reconcileStatuses>> = { ok: true };
    await peMagazin(businessId, "reconciliere", async () => {
      rec = await reconcileStatuses(admin, ctx, 50, inceput + BUGET_PASI_1_3_MS);
    });
    if (!rec.ok) {
      await logError({
        action: "aboutyou-sync", severity: rec.status === 401 || rec.status === 403 ? "critical" : "warning",
        message: `reconcilierea statusurilor a eșuat: ${rec.error}`,
        details: { businessId, status: rec.status }, businessId,
      });
    } else {
      reconciled++;
    }
    await pause(PACE_MS);
  }

  // ── 4) Poll orders for active sellers (order.created webhook is primary) ─────────
  const orderPollSet = alegeInRotatie(sellerIds, POLL_ORDERS_BIZ);
  for (const businessId of orderPollSet) {
    /*
     * SINGURA bucla ramasa fara garda de timp, si tocmai cea mai scumpa.
     *
     * `pollOrders` parcurge cinci statusuri, fiecare cu pana la patruzeci de
     * pagini: doua sute de cereri `GET /orders/` pe o singura cheie, fata de
     * limita documentata de o suta pe minut. Cu zece magazine in rotatie, o
     * singura rulare putea depasi de zeci de ori bugetul si taia totul dupa ea.
     * Bugetul de aici e mai larg decat cel al pasilor 1-3: comenzile sunt ultimele
     * care au voie sa cada, dar tot trebuie sa incapa in fereastra.
     */
    if (Date.now() - inceput > BUGET_TOTAL_MS) break;
    const ctx = await ctxSauScrie(businessId, "comenzi");
    if (!ctx) continue;
    /*
     * ⚠ O MARJA DE SUPRAPUNERE, ca la Trendyol. Aici era ZERO.
     *
     * Marcajul se scria la momentul rularii, iar fereastra urmatoare pornea exact
     * de acolo. Orice comanda ale carei ceasuri cad in cusatura dintre doua rulari
     * (ceasul lor nu bate cu al nostru, iar `orders_from` e evaluat la ei) ieseau
     * din amandoua ferestrele si nu mai erau cerute niciodata. Cinci minute costa
     * cateva reciteri idempotente si inchid cusatura.
     */
    const marcaj = ctx.config.orders_synced_at;
    const marcajMs = marcaj ? Date.parse(marcaj) : NaN;
    const since = Number.isFinite(marcajMs)
      ? new Date(marcajMs - ORDERS_OVERLAP_MS).toISOString()
      : marcaj;
    /* ⚠ Si aici: `pollOrders` citeste din baza, deci poate arunca. Marcajul NU se misca atunci. */
    let pr: Awaited<ReturnType<typeof pollOrders>> | null = null;
    await peMagazin(businessId, "comenzi", async () => { pr = await pollOrders(admin, ctx, since); });
    if (pr == null) { await pause(PACE_MS); continue; }
    ordersIngested += (pr as { ingested: number }).ingested;
    /*
     * Aceeasi regula ca la Trendyol, si din aceleasi motive — vezi `marcajUrmator`:
     * citire completa -> „acum"; citire partiala DAR cu cursor -> exact pana la
     * ultima comanda dusa la capat, compensat cu suprapunerea care se scade la
     * citire; fara cursor -> nu se misca nimic (blocaj, dar strigat in loguri).
     */
    const marcajNou = marcajUrmator(pr, { runStartMs: Date.parse(now), overlapMs: ORDERS_OVERLAP_MS });
    if (marcajNou != null) {
      await patchAboutYouConfig(admin, businessId, { orders_synced_at: new Date(marcajNou).toISOString() });
    }
    await pause(PACE_MS);
  }

  /*
   * ── Starile comenzilor pe care le stim ──────────────────────────────────────
   *
   * ═══ ⚠ FEREASTRA FILTREAZA DUPA DATA CREARII, DECI NU VEDE O SCHIMBARE TARZIE ═══
   *
   * `orders_from` merge pe `created_at` — scrie chiar in `candFacuta`. Deci o comanda facuta acum
   * trei saptamani care se anuleaza AZI nu mai reintra in nicio fereastra: marcajul a trecut
   * demult de data crearii ei.
   *
   * ⚠ Webhook-ul e calea rapida, dar nu e o garantie: daca ruta noastra e indisponibila cat timp
   * ei reincearca, evenimentul se pierde definitiv, iar sondarea nu-l poate recupera.
   *
   * ⚠ La cinci minute, si NU MUTA NICIUN MARCAJ: e o reconciliere, nu o aducere.
   */
  if (new Date().getMinutes() % 5 === 2) {
    for (const businessId of alegeInRotatie(sellerIds, POLL_ORDERS_BIZ)) {
      if (Date.now() - inceput > BUGET_TOTAL_MS) break;
      const ctx = await ctxSauScrie(businessId, "comenzi-reintrebate");
      if (!ctx) continue;
      try {
        const r = await reconciliazaComenzile(admin, ctx);
        ordersIngested += r.verificate;
      } catch (e) {
        await logError({
          action: "aboutyou-sync",
          message: `reconcilierea comenzilor a picat: ${e instanceof Error ? e.message : String(e)}`,
          businessId, severity: "warning",
        });
      }
      await pause(PACE_MS);
    }
  }

  /*
   * ── Evenimentele de webhook care n-au apucat sa fie prelucrate ──────────────
   *
   * ⚠ Ruta le SCRIE inainte sa le prelucreze, apoi incearca pe loc — calea rapida. Cand
   * prelucrarea pica (o pana de baza, o comanda pe care n-o gaseam inca), randul ramane
   * neprelucrat. Fara pasul asta, ar ramane asa pentru totdeauna: About You a primit `200` si nu
   * mai reincearca.
   *
   * ⚠ La fiecare trecere, nu pe tura: un eveniment neprelucrat inseamna o expediere sau o anulare
   * care nu s-a intamplat, si aia nu asteapta cinci minute.
   */
  for (const businessId of alegeInRotatie(sellerIds, POLL_ORDERS_BIZ)) {
    if (Date.now() - inceput > BUGET_TOTAL_MS) break;
    const ctx = await ctxSauScrie(businessId, "inbox");
    if (!ctx) continue;
    try {
      /*
       * ⚠ INTENTIILE RAMASE DESCHISE, inaintea evenimentelor: „am trimis la About You si nu stiu
       * ce a iesit" e singura stare care cere un OM, si trebuie sa iasa la lumina repede. Vezi
       * `cuLotDurabil`. Se scrie o singura data pe rand.
       */
      await alarmaIntentiiDeschise(admin, ctx);
      /*
       * ⚠ SI RASPANDIREA RAMASA NETERMINATA. Cand comerciantul schimba cursul pe un catalog
       * mare, actiunea de server pune la coada cat apuca si tine minte unde a ajuns; restul se
       * face aici, trecere de trecere. Fara pasul asta, cursorul ar fi doar o nota in config.
       */
      raspandite += await continuaLucrarileInMasa(admin, ctx);
      /*
       * ⚠ SI VEGHEA PRODUSELOR CU LOT ORB. Un lot vechi se poate aseza la ei si dupa ce noi am
       * citit o data ca totul e in regula — vezi `veghe.ts`. Pasul asta e singurul care mai poate
       * observa asta, iar fara el veghea ar fi doar un tabel care se umple.
       */
      vegheate += await treciPrinVeghe(admin, ctx, inceput + BUGET_TOTAL_MS);
      reluate += await reiaEvenimenteleNeprelucrate(admin, businessId, ctx.config);
    } catch (e) {
      await logError({
        action: "aboutyou-sync",
        message: `reluarea evenimentelor de webhook a picat: ${e instanceof Error ? e.message : String(e)}`,
        businessId, severity: "warning",
      });
    }
  }

  console.log(`[aboutyou-sync] processed=${processed} failed=${failed} polled=${polled} reconciled=${reconciled} orders=${ordersIngested} reluate=${reluate} vegheate=${vegheate}`);
  return NextResponse.json({ ok: true, processed, failed, polled, reconciled, ordersIngested, reluate, raspandite, vegheate });
}

/*
 * Actualizare partiala a configului, fara sa calce peste ce a salvat omul.
 *
 * Citirea si scrierea nu sunt atomice: intre ele, comerciantul poate apasa
 * „Salvează setările", iar noi scriam inapoi obiectul VECHI cu doua campuri
 * schimbate, anuland-o. `jsonb_merge_config` face imbinarea in Postgres, intr-o
 * singura instructiune, deci nu mai exista fereastra.
 */

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
