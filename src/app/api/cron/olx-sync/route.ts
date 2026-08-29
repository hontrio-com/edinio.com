import { NextRequest, NextResponse } from "next/server";
import { patchOlxConfig } from "@/lib/olx/config";
import { logError } from "@/lib/error-logger";
import { scrieDacaNeschimbat, stergeDacaNeschimbat } from "@/lib/marketplace/coada-cas";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { reconciliazaAnunturile,
  loadOlxContext, processQueueItem, refreshAdvertStatus, pause, type RezultatContext,
  PRODUCT_FIELDS, type OlxQueueItem,
} from "@/lib/olx/sync";
import { alegeInRotatie, magazineConectate } from "@/lib/marketplace/rotatie";
import { advertCommand } from "@/lib/olx/client";
import type { MappableProduct } from "@/lib/olx/mapping";

// OLX rate limits are not clearly documented — pace conservatively and keep the
// per-run volume small (the cron fires every minute). Each write op also costs
// moderation/throttle budget on OLX's side.
const QUEUE_BATCH = 30;
const STATUS_BATCH = 25;
/** Cate magazine se reconciliaza intr-un sfert de ora. */
const RECONCILE_MAGAZINE = 2;

/**
 * Cat se asteapta intre doua incercari cat timp sesiunea cere mana omului.
 *
 * ⚠ Cinci minute, nu un minut: nimic nu se schimba pana nu apasa el, iar o incercare pe minut ar
 * fi cinci sute de cereri degeaba pana isi bea cafeaua.
 */
const ASTEPTARE_RECONECTARE_MS = 5 * 60_000;
const EXTEND_BATCH = 15;
const MAX_ATTEMPTS = 5;

/**
 * O lucrare care AMANA de prea mult timp nu mai amana.
 *
 * ═══ CAPATUL DE SUS AL RABDARII (31.08.2026) ═══
 *
 * De cand un `429` nu mai arde o incercare, `attempts` singur nu mai marginește nimic: un magazin
 * limitat la nesfarsit ar avea lucrari amanate din minut in minut, la infinit, fara ca nimeni sa
 * afle ca pretul lui nu s-a dus niciodata.
 *
 * Varsta o marginește — dar NUMAI amanarea. Dupa o zi de amanari, lucrarea cade inapoi pe drumul
 * obisnuit: isi arde incercarile ca oricare alta, si moare la a cincea.
 *
 * ⚠ ABANDONUL OBISNUIT NU SE UITA LA VARSTA, si e o deosebire pe care am gresit-o o data. Un rand
 * poate sta zile intregi fara sa fie nici macar incercat — magazinul cere reconectare, iar cronul
 * il lasa neatins dinadins. Judecat dupa varsta, ar fi murit la PRIMA lui incercare de dupa
 * reconectare, in loc sa-si primeasca cele cinci. Varsta spune ce s-a amanat, nu ce a esuat.
 *
 * `created_at` se rescrie la fiecare intentie noua a omului (vezi `REINVIE` din `queue.ts`), deci
 * ceasul masoara varsta INTENTIEI, nu a randului.
 */
const VIATA_MAXIMA_MS = 24 * 60 * 60_000;

function preaBatran(item: { created_at?: string | null }): boolean {
  const nascut = item.created_at ? Date.parse(item.created_at) : NaN;
  /* O data necitibila nu are voie sa insemne „batran": ar arunca lucrarea din prima. */
  return Number.isFinite(nascut) && Date.now() - nascut > VIATA_MAXIMA_MS;
}

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
  let processed = 0, failed = 0, amanate = 0, statusChecked = 0, extended = 0;
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
       * ⚠ Cere reconectare: se ASTEAPTA pe bune. Vezi nota de dedesubt.
       * ⚠ Trecatoare: o pana adevarata la ei sau la baza, deci isi arde incercarile ca oricare alta.
       */
      if (r.stare === "deconectat") {
        for (const it of items) await stergeDacaNeschimbat(admin, COADA, it);
        continue;
      }
      /*
       * ═══ COMENTARIUL DE MAI SUS ERA O MINCIUNA (31.08.2026) ═══
       *
       * Scria „elementul ramane in coada; daca omul reconecteaza maine, pleaca de la sine". Dar
       * codul de dedesubt ardea o incercare de fiecare data, iar cronul porneste din minut in
       * minut — deci in cincisprezece minute totul era `abandonat_la`, si maine nu mai pleca nimic:
       *
       *     tokenul expira la ora 9
       *     9:01, 9:02, 9:04, 9:08, 9:15 -> cele cinci incercari
       *     9:15: toata coada magazinului e moarta
       *     18:00, omul reconecteaza -> nimic nu mai era acolo sa porneasca
       *
       * Adica CHIAR asta era boala pentru care „Reîncearcă" si invierea la reconectare sunt leacul.
       *
       * ⚠ Iar deosebirea e aceeasi ca la `429`: o sesiune care cere mana omului nu spune nimic
       * despre lucrare, spune ceva despre CLIPA. `attempts` numara cat de rau e peticul, nu cat de
       * departe e comerciantul de tastatura.
       *
       * ⚠ Capatul e tot varsta: dupa o zi de asteptat, lucrarea cade inapoi pe drumul obisnuit si
       * moare ca oricare alta — vizibila, cu motivul ei, si gata de reinviat la reconectare.
       */
      const cereMana = r.stare === "cere-reconectare";
      for (const it of items) {
        if (cereMana && !preaBatran(it)) {
          amanate++;
          await scrieDacaNeschimbat(admin, COADA, it, {
            last_error: r.motiv.slice(0, 500),
            next_retry_at: new Date(Date.now() + ASTEPTARE_RECONECTARE_MS).toISOString(),
          });
          continue;
        }
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

    /*
     * ═══ ⚠ O PANA LA CITIREA PRODUSELOR STERGEA ANUNTURI VII (30.08.2026, tarziu) ═══
     *
     * Citirea asta mergea oarba, iar mai jos `productMap.get(...) ?? null` da `null` pentru orice
     * produs negasit. Numai ca `upsertRemote` citeste `null` ca „produsul a fost sters din magazin"
     * si cheama `removeRemote` — adica dezactiveaza SI STERGE anuntul la OLX:
     *
     *     produsul P exista, anuntul P e ACTIV la OLX
     *     cronul revendica o schimbare de pret
     *     SELECT-ul pica o clipa -> `data` e null -> harta e goala
     *     product = null -> „a fost sters" -> DELETE la OLX ❌
     *
     * Un anunt viu, cu istoricul si mesajele lui, sters pentru o clipa proasta a bazei. E cea mai
     * scumpa pierdere din toata integrarea, si venea dintr-un `{ error }` necitit.
     *
     * ⚠ `null` ARE VOIE SA INSEMNE UN SINGUR LUCRU: „am putut intreba baza, si produsul chiar nu
     * mai e". Daca n-am putut intreba, nu se lucreaza nimic pentru magazinul asta acum.
     *
     * ⚠ Aceeasi regula o are deja `syncProductNow` prin `CitireOlxEsuata`; aici lipsea.
     */
    const upsertIds = items.filter((i) => i.op === "upsert" && i.product_id).map((i) => i.product_id!) as string[];
    const productMap = new Map<string, MappableProduct>();
    if (upsertIds.length) {
      const { data: prods, error: eProduse } = await admin
        .from("products").select(PRODUCT_FIELDS).in("id", upsertIds);
      if (eProduse) {
        for (const it of items) {
          const attempts = (it.attempts ?? 0) + 1;
          await scrieDacaNeschimbat(admin, COADA, it, {
            attempts,
            last_error: `produsele nu s-au putut citi: ${eProduse.message}`.slice(0, 500),
            next_retry_at: asteptareaUrmatoare(attempts),
            ...(attempts >= MAX_ATTEMPTS ? { abandonat_la: now } : {}),
          });
        }
        await logError({
          action: "olx-sync", severity: "error",
          message: `produsele nu s-au putut citi; nu s-a trimis nimic la OLX: ${eProduse.message}`,
          details: { cate: items.length }, businessId,
        });
        continue;
      }
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
      } else if (res.asteptare != null && !preaBatran(item)) {
        amanate++;
        /*
         * ═══ CE NE-AU CERUT EI NU SE SOCOTESTE ESEC (31.08.2026) ═══
         *
         * `429` ardea o incercare, la fel ca o pana. Dar cele cinci incercari se consuma in
         * cincisprezece minute, deci o limitare OLX de o jumatate de ora facea SCRISORI MOARTE din
         * toata munca unui magazin — schimbari de pret care nu mai plecau niciodata.
         *
         * `attempts` ramane NEATINS: numara cat de rau e peticul, nu cat de ocupati sunt ei.
         *
         * Capatul e `preaBatran`, nu contorul: fara el, un magazin limitat pe veci ar avea lucrari
         * amanate la nesfarsit, si nimeni n-ar afla. Cu el, dupa o zi de amanari lucrarea cade
         * inapoi pe drumul obisnuit si isi arde incercarile ca oricare alta.
         */
        await scrieDacaNeschimbat(admin, COADA, item, {
          last_error: res.error.slice(0, 500),
          next_retry_at: new Date(Date.now() + res.asteptare).toISOString(),
        });
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
    .select("id, business_id, olx_advert_id, status, dezactivat_de")
    .not("olx_advert_id", "is", null)
    .or(`and(status.in.(new,unconfirmed),last_status_at.lt.${newBefore}),last_status_at.is.null,last_status_at.lt.${staleBefore}`)
    .order("last_status_at", { ascending: true, nullsFirst: true })
    .limit(STATUS_BATCH);

  for (const row of toPoll ?? []) {
    if (!row.olx_advert_id) continue;
    const rCtx = await ctxFor(row.business_id);
    const ctx = rCtx.stare === "gata" ? rCtx.ctx : null;
    if (!ctx) continue;
    await refreshAdvertStatus(admin, ctx, row.id, row.olx_advert_id,
      { status: row.status, dezactivat_de: row.dezactivat_de });
    statusChecked++;
    await pause(PACE_MS);
  }

  // ── 3) Auto-extend adverts nearing expiry (opt-in per store) ────────────────────
  // OLX allows a manual `extend` at most once / 14 days; we extend when valid_to
  // is within 24h. `auto_extend_enabled` on the advert also covers this, but the
  // explicit command is our safety net for stores that opted in.
  /*
   * ═══ ⚠ PLASA BATEA IN OLX DIN MINUT IN MINUT (30.08.2026) ═══
   *
   * Fereastra e „expira in mai putin de 24 de ore", iar cronul porneste in fiecare minut. Un refuz
   * al lor nu era nici citit, nici tinut minte — deci randul ramanea in aceeasi fereastra si se
   * reincerca IAR, pana la o mie patru sute de ori intr-o zi. Iar OLX spune limpede ca un anunt nu
   * poate fi improspatat mai des decat ingaduie tara (exemplul lor oficial: paisprezece zile).
   *
   * ⚠ CLIPA SE SCRIE SI LA REUSITA, SI LA REFUZ. La reusita, `valid_to` se muta abia dupa
   * urmatoarea citire de stare — deci pana atunci randul ar fi ramas tot in fereastra.
   */
  const soon = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  /*
   * ⚠ CINCISPREZECE ZILE, NU DOUAZECI SI PATRU DE ORE (30.08.2026, tarziu).
   *
   * Prima incercare a pus o zi, ca sa opreasca bataia din minut in minut — si a oprit-o. Dar OLX
   * spune ca un anunt nu poate fi improspatat mai des decat ingaduie tara, iar exemplul lor
   * oficial e de PAISPREZECE zile. Cu o zi, o cerere refuzata se reia de treisprezece ori degeaba,
   * si fiecare consuma din bugetul nostru de cereri la ei.
   *
   * ⚠ Si nu e nimic de pierdut: anuntul are oricum `auto_extend_enabled` la ei. Plasa asta e o a
   * doua paza, pentru magazinele care si-au bifat reinnoirea — nu singura.
   */
  const deIncercat = new Date(Date.now() - 15 * 24 * 60 * 60_000).toISOString();
  const { data: expiring, error: eExpira } = await admin
    .from("olx_adverts")
    .select("id, business_id, olx_advert_id, valid_to")
    .eq("status", "active")
    .not("valid_to", "is", null)
    .lt("valid_to", soon)
    .or(`ultima_prelungire_la.is.null,ultima_prelungire_la.lt.${deIncercat}`)
    .limit(EXTEND_BATCH);
  if (eExpira) {
    await logError({
      action: "olx-sync", severity: "warning",
      message: `anunturile care expira nu s-au putut citi: ${eExpira.message}`,
    });
  }

  for (const row of expiring ?? []) {
    if (!row.olx_advert_id) continue;
    const rExt = await ctxFor(row.business_id);
    if (rExt.stare !== "gata" || rExt.ctx.config.auto_extend !== true) continue;
    const ctx = rExt.ctx;
    const res = await advertCommand(ctx.token, row.olx_advert_id, "extend");
    /* ⚠ Se scrie INAINTE de a socoti reusita: si un refuz trebuie sa tina randul deoparte o zi. */
    const { error: eMarcaj } = await admin.from("olx_adverts")
      .update({
        ultima_prelungire_la: now,
        ...(!("error" in res) ? { last_status_at: null } : {}),
        updated_at: now,
      } as never)
      .eq("id", row.id);
    if (eMarcaj) {
      /* ⚠ Nescris, randul ramane in fereastra si il batem iar peste un minut. Se vede. */
      await logError({
        action: "olx-sync", severity: "warning",
        message: `prelungirea s-a incercat, dar marcajul nu s-a scris: ${eMarcaj.message}`,
        details: { advertId: row.olx_advert_id }, businessId: row.business_id,
      });
    }
    if (!("error" in res)) extended++;
    await pause(PACE_MS);
  }

  // ── 4) Reconciliere: ce e viu la ei si necunoscut la noi ────────────────────────
  /*
   * ═══ SONDAREA INTREABA DOAR DESPRE CE AVEM (31.08.2026) ═══
   *
   * Pasul 2 porneste de la `olx_adverts`, deci un anunt viu la OLX fara rand la noi e invizibil
   * pentru totdeauna:
   *
   *     crearea reuseste la ei, dar scrierea legaturii pica
   *     lucrarea se reia... si moare dupa cinci incercari
   *     -> anuntul ramane ACTIV la OLX, si nimeni nu-l mai atinge
   *     -> stocul ajunge la zero, si el vinde mai departe fiindca noi nu stim de el
   *
   * ⚠ DIN SFERT IN SFERT DE ORA, si `pas = 15`, nu 1. Cu `pas = 1`, rotatia se invarte in fiecare
   * MINUT peste o poarta care se deschide o data la cincisprezece: aceleasi doua magazine ar fi
   * ales de fiecare data cand poarta chiar e deschisa, iar restul n-ar fi reconciliate niciodata.
   *
   * ⚠ Cursorul sta in configul magazinului, si se muta si cand pagina n-a adus nimic: o fereastra
   * fixa de la zero n-ar vedea niciodata nimic dincolo de primele cincizeci de anunturi.
   */
  let reconciliate = 0;
  if (new Date().getMinutes() % 15 === 0) {
    const { ids: conectate, error: eConectate } = await magazineConectate(admin, "olx_config");
    if (eConectate) {
      await logError({
        action: "olx-sync", severity: "warning",
        message: `magazinele conectate nu s-au putut citi pentru reconciliere: ${eConectate}`,
      });
    }
    for (const bid of alegeInRotatie(conectate, RECONCILE_MAGAZINE, 15)) {
      const rRec = await ctxFor(bid);
      if (rRec.stare !== "gata") continue;
      const deLa = Math.max(0, rRec.ctx.config.reconcile_offset ?? 0);
      const r = await reconciliazaAnunturile(admin, rRec.ctx, bid, deLa);
      if (!r.ok) {
        /* ⚠ Cursorul NU se muta peste o pagina pe care n-am putut-o citi: ar sari peste ea. */
        await logError({
          action: "olx-sync", severity: "warning",
          message: `reconcilierea nu s-a putut face: ${r.error}`,
          details: { deLa }, businessId: bid,
        });
        continue;
      }
      reconciliate += r.adoptate;
      await patchOlxConfig(admin, bid, { reconcile_offset: r.urmatorul });
      await pause(PACE_MS);
    }
  }

  console.log(`[olx-sync] processed=${processed} failed=${failed} amanate=${amanate} status=${statusChecked} extended=${extended} reconciliate=${reconciliate}`);
  return NextResponse.json({ ok: true, processed, failed, amanate, statusChecked, extended, reconciliate });
}

