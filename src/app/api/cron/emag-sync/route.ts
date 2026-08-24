import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { alegeInRotatie, magazineConectate } from "@/lib/marketplace/rotatie";
import { marcajUrmator } from "@/lib/marketplace/marcaj";
import { emagGloballyEnabled, iesireEmag } from "@/lib/emag/auth";
import { citesteOferte, isEmagError } from "@/lib/emag/client";
import { esteDeconectatEmag, loadEmagContext, type ContextEmag } from "@/lib/emag/sync";
import { patchEmagConfig } from "@/lib/emag/config";
import { intregDeLaEi, zecimalDeLaEi } from "@/lib/emag/numere";
import { stocDeImportat } from "@/lib/emag/import-produse";
import { eRespinsaDeEmag, motiveDeLaEi } from "@/lib/emag/motive";
import { magazinDin, retragePeEmagId, trimiteElement } from "@/lib/emag/trimite";
import { oferteUsoare, type ProdusDeCartografiat } from "@/lib/emag/mapping";
import {
  citesteMemoriaDerivei, derivaOfertei, hotarasteDeriva, sursaAdevarului,
} from "@/lib/emag/deriva";
import { enqueueEmagPretMany, enqueueEmagStocMany } from "@/lib/emag/queue";
import { cuFir, firNou, ZILE_PASTRARE } from "@/lib/emag/jurnal";
import { curataJurnalul } from "@/lib/emag/jurnal-scriere";
import { aduComenzile } from "@/lib/emag/orders";
import { aduIpurileEmag } from "@/lib/emag/client";
import { citesteIpuri, sAuSchimbat, CHEIE_IPURI } from "@/lib/emag/ipuri";
import { urcaFacturaLaEmag, type Factura } from "@/lib/emag/facturi";
import { aduRetururile } from "@/lib/emag/rma";
import type { EmagOfertaCitita, StareOferta } from "@/lib/emag/types";
import type { OpEmag } from "@/lib/emag/queue";
import { asteptareaUrmatoare, eVandabila } from "@/lib/emag/rute";
import { ardeIncercare } from "@/lib/emag/errors";

/**
 * Trecerea din minut in minut a integrarii eMAG.
 *
 * ═══ DOI PASI, CU ROLURI DIFERITE ═══
 *
 *   1. COADA         — ce a schimbat comerciantul pleaca spre eMAG
 *   2. RECONCILIEREA — ce a hotarat eMAG se aduce inapoi
 *
 * Al doilea nu e un lux. Validarea la ei dureaza ore si nu ne anunta nimeni cand se
 * incheie: fara pasul asta, panoul ar arata „trimis" la nesfarsit pentru un produs
 * respins acum trei zile. Exact ce s-a intamplat la Trendyol.
 *
 * ═══ ⚠ RITMUL: 3 CERERI PE SECUNDA, CUMULAT ═══
 *
 * Nu pe magazin — pe TOT ce nu e comanda. Limita e tinuta in `client.ts`, cu o
 * galeata de jetoane, si de aceea nu se mai pune si aici: doua franari inmultite ar
 * fi facut trecerea de doua ori mai lunga fara niciun castig.
 *
 * ⚠ Cererile REFUZATE se numara si ele in limita lor. Deci o coada plina de elemente
 * care esueaza costa acelasi ritm ca una care reuseste — inca un motiv pentru care
 * un `refuz` arde o incercare si nu se reia la nesfarsit.
 *
 * ⚠ Documentatia lor cere sa nu se cheme la ore rotunde. Un cron din minut in minut
 * nu e o ora rotunda; pasii lenti se prind pe `getMinutes() % N`, deci nici ei nu
 * cad toti odata.
 */

export const maxDuration = 60;

type Admin = ReturnType<typeof createClient<Database>>;

/** Cate elemente de coada se revendica intr-o trecere. */
const LOT_COADA = 30;

/**
 * Dupa cate incercari se opreste un element.
 *
 * ⚠ SE NUMARA NUMAI REFUZURILE. Un 429 sau un 503 nu arde nimic: altfel cinci minute
 * de pana la eMAG ar goli cozile tuturor magazinelor, iar produsele ar ramane
 * nesincronizate fara ca nimeni sa afle. Vezi `ardeIncercare` din `errors.ts`.
 */
const INCERCARI_MAXIM = 5;

/** Cate magazine se reconciliaza intr-o trecere. */
const MAGAZINE_RECONCILIERE = 6;

/** Cate magazine isi aduc comenzile intr-o trecere. */
const MAGAZINE_COMENZI = 8;

/**
 * Cu cat se suprapune fereastra de comenzi peste marcajul trecut.
 *
 * ⚠ NU E O PRECAUTIE VAGA. Ceasul lor si al nostru nu bat la fel, iar o comanda
 * modificata chiar in secunda marcajului ar cadea exact intre doua ferestre — citita
 * de niciuna. Cinci minute de suprapunere costa cateva comenzi recitite (ingestul e
 * idempotent) si inchid gaura cu totul.
 */
const SUPRAPUNERE_MS = 5 * 60 * 1000;

/** Cate magazine isi urca facturile intr-o trecere. */
const MAGAZINE_FACTURI = 5;

/** Cate magazine isi aduc retururile intr-o trecere. */
const MAGAZINE_RETURURI = 6;

/** Cate facturi se urca pentru un magazin intr-o trecere. */
const FACTURI_PE_TRECERE = 10;

/** ⚠ Maximul lor. Cerut mai mare, eMAG intoarce tot 100 fara sa spuna. */
const PE_PAGINA = 100;

interface ElementCoada {
  id: string;
  business_id: string;
  product_id: string | null;
  offer_id: string;
  op: OpEmag;
  attempts: number;
}

export async function GET(req: NextRequest) {
  if (!verificaCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!emagGloballyEnabled()) {
    return NextResponse.json({ ok: true, oprit: "EMAG_LIVE=false" });
  }

  /*
   * ⚠ FARA IESIREA PE IP FIX NU SE INCEARCA NIMIC.
   *
   * eMAG accepta apeluri numai de la adrese albite. Plecate direct de pe Vercel, ele
   * ar primi un refuz care nu pomeneste nimic despre IP-uri — iar fiecare element
   * din coada si-ar arde cele cinci incercari pe un motiv pe care nimeni nu l-ar
   * ghici din mesaj. Mai bine nicio cerere si o urma limpede in jurnal.
   */
  const iesire = iesireEmag();
  if (iesire.eroare) {
    await logError({ action: "emag-sync", message: iesire.eroare, severity: "critical" });
    return NextResponse.json({ ok: false, error: iesire.eroare }, { status: 503 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let duse = 0, cazute = 0, reconciliate = 0, comenziNoi = 0, facturi = 0, retururi = 0;
  let derivate = 0;
  const inceputulRularii = Date.now();

  /* Contextul unui magazin se citeste O DATA pe trecere: e o citire cu decriptare,
     iar coada poate avea zeci de elemente ale aceluiasi magazin. */
  const contexte = new Map<string, ContextEmag | null>();
  async function ctxPentru(businessId: string): Promise<ContextEmag | null> {
    if (contexte.has(businessId)) return contexte.get(businessId)!;
    const c = await loadEmagContext(admin, businessId);
    contexte.set(businessId, c);
    return c;
  }

  /* ── 1) Coada ──────────────────────────────────────────────────────────────
   *
   * ⚠ RANDURILE SE REVENDICA, NU SE CITESC.
   *
   * Cronul porneste din minut in minut si face apeluri externe care pot dura mai
   * mult de un minut. Cu un `select … limit N`, doua rulari ar citi ACELEASI randuri
   * si ar trimite de doua ori la eMAG. `revendica_din_coada` le incuie cu
   * `for update skip locked` si le pune un termen, deci al doilea lucrator primeste
   * randurile URMATOARE. Vezi `2026-08-19-lease-cozi-marketplace`.
   */
  const { data: revendicate, error: eCoada } = await admin.rpc("revendica_din_coada", {
    p_coada: "emag_sync_queue", p_limita: LOT_COADA,
  });
  if (eCoada) {
    await logError({
      action: "emag-sync",
      message: `coada nu s-a putut revendica: ${eCoada.message}`,
      severity: "critical",
    });
    return NextResponse.json({ ok: false, error: "coada indisponibila" }, { status: 503 });
  }

  const coada = ((revendicate ?? []) as unknown[]) as ElementCoada[];
  const peMagazin = new Map<string, ElementCoada[]>();
  for (const el of coada) {
    if (!peMagazin.has(el.business_id)) peMagazin.set(el.business_id, []);
    peMagazin.get(el.business_id)!.push(el);
  }

  for (const [businessId, elemente] of peMagazin) {
    const ctx = await ctxPentru(businessId);
    if (!ctx) {
      /*
       * ⚠ LIPSA CONTEXTULUI NU INSEAMNA „MAGAZIN DECONECTAT".
       *
       * `loadEmagContext` intoarce `null` si cand configurarea NU S-A PUTUT CITI.
       * Confundate, un hop de o secunda la baza ar fi aruncat toata munca
       * magazinului — inclusiv impingerile de stoc puse la coada dupa comenzi deja
       * incasate — fara log si fara urma.
       *
       * `esteDeconectatEmag` are trei raspunsuri. Cand nu se stie, coada ramane
       * neatinsa si se reia la trecerea urmatoare.
       */
      const deconectat = await esteDeconectatEmag(admin, businessId);
      if (deconectat === true) {
        await admin.from("emag_sync_queue").delete().in("id", elemente.map((e) => e.id));
      } else {
        await logError({
          action: "emag-sync",
          message: `configurarea magazinului nu s-a putut citi; coada de ${elemente.length} ramane neatinsa`,
          businessId,
          severity: "warning",
        });
      }
      continue;
    }

    for (const el of elemente) {
      /*
       * ═══ ⚠ O RETRAGERE FARA PRODUS NU E UN GUNOI, E CHIAR ROSTUL EI ═══
       *
       * Forma dinainte stergea ORICE element fara `product_id`. Dar retragerea unui
       * produs sters intra ANUME asa: la stergere, `emag_offers.product_id` devine
       * `null` (`on delete set null`), deci legatura se rupe exact cand avem nevoie de ea.
       *
       * Deci elementul era sters aici, fara log, fara „dus", fara „cazut" — iar toata
       * logica scrisa pentru cazul asta (`rutaDeTrimitere` cu `op: "retragere"`) era cod
       * mort pe calea automata.
       *
       * ⚠ CE COSTA: comerciantul sterge produsul si continua sa primeasca comenzi eMAG
       * pentru marfa pe care n-o mai are. Anularile le plateste el, in bani si in punctaj.
       *
       * `offer_id` poarta `emag_id`-ul, citit inainte de stergere. Vezi
       * `enqueueEmagRetragereInainteDeStergere`.
       */
      if (!el.product_id) {
        const emagId = Number(el.offer_id);
        if (el.op !== "retragere" || !Number.isFinite(emagId)) {
          await admin.from("emag_sync_queue").delete().eq("id", el.id);
          continue;
        }
        const rr = await cuFir(firNou("coada-retragere"), () => retragePeEmagId(admin, ctx, emagId));
        if (rr.verdict === "sarit" || rr.verdict === "reusit" || rr.verdict === "reusit_cu_observatii") {
          await admin.from("emag_sync_queue").delete().eq("id", el.id);
          duse++;
        } else {
          cazute++;
          const incercari = (el.attempts ?? 0) + (ardeIncercare(rr.verdict as Parameters<typeof ardeIncercare>[0]) ? 1 : 0);
          await admin.from("emag_sync_queue").update({
            attempts: incercari,
            last_error: rr.mesaj || null,
            revendicat_pana: null,
            next_retry_at: new Date(Date.now() + asteptareaUrmatoare(incercari)).toISOString(),
          }).eq("id", el.id);
        }
        continue;
      }

      /*
       * ⚠ UN FIR PE ELEMENT DE COADA, nu pe rulare (§66).
       *
       * Un element poate face mai multe cereri: loturi de cate 50, o reincercare
       * dupa 429, o masuratoare separata. Cu un fir pe rulare, toate elementele
       * rularii ar fi purtat acelasi numar, iar „arata-mi ce a facut elementul asta"
       * ar fi intors treizeci de lucrari amestecate — adica exact nimic.
       */
      /* ⚠ Ingustarea se prinde intr-un `const` INAINTE de inchidere. TypeScript nu
         duce ingustarea unei PROPRIETATI inauntrul unei functii de apel: proprietatea
         s-ar putea schimba intre timp, din punctul lui de vedere. */
      const productId = el.product_id;
      const r = await cuFir(
        firNou(`coada-${el.op}`),
        () => trimiteElement(admin, ctx, productId, el.op),
      );

      /* „Sarit" inseamna „nu era nimic de facut, si nu e o eroare". Iese din coada
         linistit: reincercat, si-ar arde incercarile pe un lucru care nu se schimba. */
      if (r.verdict === "sarit" || r.verdict === "reusit" || r.verdict === "reusit_cu_observatii") {
        await admin.from("emag_sync_queue").delete().eq("id", el.id);
        duse++;
        continue;
      }

      cazute++;

      if (r.verdict === "chei") {
        /*
         * ⚠ SE OPRESTE MAGAZINUL, NU ELEMENTUL. Acreditarile nu se repara singure,
         * iar mai departe n-am face decat sa ardem cererile lui degeaba — si sa-i
         * umplem coada de esecuri care arata ca defecte de produs.
         */
        await patchEmagConfig(admin, businessId, { needs_reconnect: true });
        break;
      }

      if (r.verdict === "trecatoare") {
        /*
         * ⚠ NU SE ARDE NICIO INCERCARE. Doar se elibereaza revendicarea, ca elementul
         * sa poata fi luat la trecerea urmatoare. Numarate, cinci minute de 429 ar fi
         * golit definitiv coada unui magazin — chiar incidentul de la Trendyol.
         */
        await admin.from("emag_sync_queue")
          .update({ revendicat_pana: null, last_error: r.mesaj || null }).eq("id", el.id);
        continue;
      }

      /* Refuz: arde o incercare si scrie motivul. */
      const incercari = (el.attempts ?? 0) + 1;

      if (incercari >= INCERCARI_MAXIM) {
        /*
         * ═══ ⚠ SE ABANDONEAZA, DAR NU SE STERGE ═══
         *
         * Prima forma stergea randul. Cu un rand in jurnal, dar sters: nimeni nu-l mai
         * putea vedea, numara sau relua. Un catalog intreg putea disparea din coada
         * fara ca panoul sa arate altceva decat „0 in asteptare" — iar comerciantul ar
         * fi crezut ca totul a plecat.
         *
         * Acum ramane, marcat. `revendica_din_coada` il sare (`abandonat_la is null`),
         * ecranul il numara, si o atingere a produsului il reaprinde.
         */
        await admin.from("emag_sync_queue")
          .update({
            attempts: incercari,
            last_error: r.mesaj || null,
            revendicat_pana: null,
            abandonat_la: new Date().toISOString(),
          })
          .eq("id", el.id);
        await logError({
          action: "emag-sync",
          message: `element abandonat dupa ${incercari} incercari: ${r.mesaj}`,
          businessId,
          details: { productId: el.product_id, op: el.op },
          severity: "warning",
        });
        continue;
      }

      /*
       * ⚠ ASTEPTARE CRESCATOARE, nu reincercare din minut in minut.
       *
       * Un refuz nu se repara singur: un produs caruia ii lipseste un camp va fi
       * refuzat la fel si peste un minut. Fiecare reincercare arde insa o cerere din
       * cele 3 pe secunda ale magazinului — aceleasi prin care pleaca o miscare de
       * stoc dupa o vanzare.
       */
      await admin.from("emag_sync_queue")
        .update({
          attempts: incercari,
          last_error: r.mesaj || null,
          revendicat_pana: null,
          next_retry_at: new Date(Date.now() + asteptareaUrmatoare(incercari)).toISOString(),
        })
        .eq("id", el.id);
    }
  }

  /* ── 2) Reconcilierea ──────────────────────────────────────────────────────
   *
   * ⚠ CURSOR, NU O FEREASTRA FIXA DE LA ZERO.
   *
   * La Trendyol, reconcilierea citea mereu primele cinci pagini. Intr-un catalog de
   * 1033 de produse, nimic dupa produsul 500 n-a fost vazut NICIODATA — si nimeni
   * n-a observat, fiindca primele cinci pagini se actualizau frumos.
   *
   * Aici pagina de pornire se tine in `emag_config.reconcile_page` si merge mai
   * departe la fiecare trecere, luand-o de la capat cand catalogul se termina.
   */
  const { ids: magazine, error: eMagazine } = await magazineConectate(admin, "emag_config");
  if (eMagazine) {
    await logError({ action: "emag-sync", message: `magazinele nu s-au putut citi: ${eMagazine}`, severity: "warning" });
  }

  for (const businessId of alegeInRotatie(magazine, MAGAZINE_RECONCILIERE)) {
    const ctx = await ctxPentru(businessId);
    if (!ctx) continue;

    const pagina = Math.max(1, ctx.config.reconcile_page ?? 1);
    const fir = firNou("reconciliere");

    const r = await cuFir(fir, () =>
      citesteOferte(ctx.auth, { currentPage: pagina, itemsPerPage: PE_PAGINA }));
    if (isEmagError(r)) {
      if (r.verdict === "chei") await patchEmagConfig(admin, businessId, { needs_reconnect: true });
      continue;
    }

    const oferte = (Array.isArray(r.data) ? r.data : []) as EmagOfertaCitita[];
    reconciliate += await scrieStatusurile(admin, businessId, oferte);

    /*
     * ⚠ PE ACEEASI PAGINA, FARA NICIO CERERE IN PLUS CATRE EI.
     *
     * Raspunsul de mai sus contine deja pretul si stocul lor. Masurata separat,
     * deriva ar fi insemnat inca o citire paginata a catalogului intreg — adica
     * dublarea cheltuielii pentru o informatie pe care o aveam in mana.
     */
    derivate += await masoaraDeriva(admin, ctx, oferte);

    /* ⚠ Pagina urmatoare, sau de la capat. Fara intoarcerea la 1, cursorul ar fi
       depasit catalogul si reconcilierea s-ar fi oprit tacut pe pagini goale. */
    await patchEmagConfig(admin, businessId, {
      reconcile_page: oferte.length < PE_PAGINA ? 1 : pagina + 1,
    });
  }

  /* ── 3) Comenzile ─────────────────────────────────────────────────── */
  for (const businessId of alegeInRotatie(magazine, MAGAZINE_COMENZI)) {
    const ctx = await ctxPentru(businessId);
    if (!ctx) continue;

    const marcaj = Date.parse(ctx.config.orders_synced_at ?? "");
    const deLa = new Date(
      Number.isFinite(marcaj) ? marcaj - SUPRAPUNERE_MS : inceputulRularii - 24 * 60 * 60 * 1000,
    );

    const rez = await cuFir(firNou("comenzi"), () => aduComenzile(admin, ctx, deLa));
    comenziNoi += rez.noi;

    /*
     * ═══ ⚠ MARCAJUL AVANSEAZA NUMAI CAND S-A CITIT TOT ═══
     *
     * `marcajUrmator` intoarce `null` cand nu s-a citit tot si nu se stie nici pana
     * unde — si atunci marcajul ramane pe loc, iar fereastra urmatoare reia de acolo.
     *
     * Pus la „acum" dupa o trecere trunchiata, comenzile necitite ar fi ramas in urma
     * ferestrei si NU s-ar mai fi citit niciodata. Fara nicio eroare, fiindca fiecare
     * trecere in parte a reusit. Asta e chiar incidentul pentru care exista
     * `marcaj.ts`, si de aceea nu se scrie de mana aici.
     */
    const urmator = marcajUrmator(rez, { runStartMs: inceputulRularii, overlapMs: SUPRAPUNERE_MS });
    if (urmator != null) {
      await patchEmagConfig(admin, businessId, { orders_synced_at: new Date(urmator).toISOString() });
    }
  }

  /* ── 4) Facturile ───────────────────────────────────────────────────
   *
   * ═══ ⚠ eMAG CERE FACTURA, SPRE DEOSEBIRE DE CELELALTE ═══
   *
   * La Trendyol si About You, marketplace-ul factureaza el clientul final. La eMAG,
   * comerciantul factureaza clientul SI trebuie sa incarce factura inapoi la ei.
   * Nechemat pasul asta, comenzile ar fi ramas fara factura si la ei, si la client —
   * o lipsa fiscala care nu se vede nicaieri in Edinio.
   *
   * ⚠ Se ia doar `getMinutes() % 5 === 0`: emiterea facturii se intampla la
   * schimbarea de status, iar urcarea nu are de ce sa alerge in fiecare minut peste
   * comenzile care asteapta un PDF ce inca nu exista.
   */
  if (new Date(inceputulRularii).getMinutes() % 5 === 0) {
    for (const businessId of alegeInRotatie(magazine, MAGAZINE_FACTURI, 5)) {
      const ctx = await ctxPentru(businessId);
      if (!ctx) continue;
      facturi += await cuFir(firNou("facturi"), () => urcaFacturile(admin, ctx));
    }
  }

  /* ── 5) Retururile ──────────────────────────────────────────────────
   *
   * ⚠ La sfert de ora, nu in fiecare minut. Un retur nu se naste si nu se schimba
   * atat de des incat sa merite un sfert din cele 3 cereri pe secunda ale
   * magazinului — iar acelea sunt cerute mult mai tare de coada si de comenzi.
   *
   * ⚠ `pas = 15` la rotatie, nu 1, SI E CHIAR ROSTUL ARGUMENTULUI ACELUIA.
   *
   * `alegeInRotatie` socoteste tura din `Date.now() / 60_000 / pas`, deci cu `pas`
   * pe 1 tura se schimba in fiecare MINUT. Dar pasul asta ruleaza o data la 15
   * minute — asa ca fereastra ar fi sarit cu 15 × 6 magazine intre doua rulari, in
   * loc de 6. Cu 129 de magazine, ea n-ar fi trecut prin ele pe rand, ci ar fi sarit
   * dupa un tipar care lasa neatinse cele mai multe la fiecare tura.
   *
   * `pas` egal cu ritmul rularii face tura sa avanseze O DATA pe rulare, deci
   * fereastra chiar merge din 6 in 6 si toate magazinele ii vin randul.
   */
  if (new Date(inceputulRularii).getMinutes() % 15 === 0) {
    for (const businessId of alegeInRotatie(magazine, MAGAZINE_RETURURI, 15)) {
      const ctx = await ctxPentru(businessId);
      if (!ctx) continue;

      const rez = await cuFir(firNou("retururi"), () => aduRetururile(admin, ctx));
      retururi += rez.scrise;

      /*
       * ⚠ NU EXISTA MARCAJ DE TIMP LA RETURURI, si nici n-ar ajuta.
       *
       * `/rma/read` n-are `modifiedAfter` — verificat in schema lor. Are `date_start`,
       * dar acela filtreaza dupa data DESCHIDERII cererii, nu a ultimei modificari:
       * un retur deschis acum trei saptamani si primit in depozit azi n-ar fi intrat
       * niciodata in fereastra, si ar fi ramas „Nou" in Edinio pe veci.
       *
       * De aceea `aduRetururile` citeste dupa STARE, nu dupa timp. Marcajul se scrie
       * doar ca sa se vada in panou cand s-a uitat ultima oara.
       */
      if (rez.ok) {
        await patchEmagConfig(admin, businessId, { rma_synced_at: new Date(inceputulRularii).toISOString() });
      }
    }
  }

  /* ── 6) Lista de IP-uri de la care suna ei ──────────────────────────────
   *
   * ⚠ O DATA PE ORA, si nu din zgarcenie: fisierul lor se schimba de cateva ori pe
   * an. Cerut la fiecare minut, ar fi fost 1440 de cereri pe zi pentru o valoare care
   * sta neschimbata luni intregi.
   *
   * ⚠ La minutul 7, nu la 0. Documentatia lor cere sa nu se cheme la ore rotunde —
   * „use e.g. 12:04:42 instead of 12:00:00" — fiindca atunci suna toata lumea deodata.
   */
  if (new Date(inceputulRularii).getMinutes() === 7) {
    await improspateazaIpurile(admin);
  }

  /* ── 7) Curatarea jurnalului de cereri (§65) ─────────────────────────────
   *
   * ⚠ O DATA PE ZI, la o ora si un minut anume, nu la fiecare trecere.
   *
   * Rulata din minut in minut, ar fi fost 1440 de `delete`-uri pe zi peste un tabel
   * care creste — dintre care 1439 nu gasesc nimic. Un `delete` care nu sterge nimic
   * tot citeste indexul.
   *
   * ⚠ Ora 3 dimineata: atunci trec cele mai putine comenzi, iar stergerea nu se pune
   * in fata lor la aceleasi cereri catre baza. Minutul 13, nu 0 — aceeasi regula ca
   * la lista de IP-uri: nu la ore rotunde.
   */
  const ceas = new Date(inceputulRularii);
  let jurnalSters = 0;
  if (ceas.getHours() === 3 && ceas.getMinutes() === 13) {
    jurnalSters = await curataJurnalul(ZILE_PASTRARE);
  }

  return NextResponse.json({
    ok: true, duse, cazute, reconciliate, derivate, comenziNoi, facturi, retururi, jurnalSters,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURILE
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Facturile comenzilor eMAG care inca n-au ajuns la ei.
 *
 * ⚠ FILTRUL E `invoice_uploaded_at is null`, PE UN INDEX PARTIAL. Corectitudinea o
 * da `cuRegistru`, care urca o singura data; coloana e doar filtrul. Fara ea, cronul
 * ar fi trecut la fiecare rulare prin TOATE comenzile eMAG cu factura ale fiecarui
 * magazin — la un comerciant cu zece mii de comenzi vechi, zece mii de randuri pe
 * minut, la nesfarsit, pentru zero lucru. Si nu s-ar fi vazut ca defect: totul merge,
 * doar ca baza geme.
 */
async function urcaFacturile(admin: Admin, ctx: ContextEmag): Promise<number> {
  const { data } = await admin.from("emag_orders")
    .select("id, order_id")
    .eq("business_id", ctx.businessId)
    .is("invoice_uploaded_at", null)
    .not("order_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(FACTURI_PE_TRECERE);

  let urcate = 0;
  for (const r of (data ?? []) as { id: string; order_id: string | null }[]) {
    if (!r.order_id) continue;

    const rez = await urcaFacturaLaEmag(admin, ctx, r.order_id, aduPdfFacturii);

    if (rez.fel === "urcata" || rez.fel === "deja") {
      await admin.from("emag_orders")
        .update({ invoice_uploaded_at: new Date().toISOString(), invoice_number: rez.numar })
        .eq("id", r.id);
      urcate++;
      continue;
    }

    /*
     * ⚠ „Fara factura" NU se marcheaza si NU se raporteaza ca eroare. Inseamna doar
     * ca documentul inca nu s-a emis — comanda abia a intrat, sau facturarea automata
     * se declanseaza la livrare. Marcata, comanda ar fi iesit definitiv din filtru si
     * n-ar mai fi primit niciodata factura.
     */
    if (rez.fel === "esec") {
      await logError({
        action: "emag-sync",
        message: `factura nu s-a putut urca: ${rez.mesaj}`,
        businessId: ctx.businessId,
        details: { orderId: r.order_id },
        severity: "warning",
      });
    }
  }
  return urcate;
}

/**
 * Octetii facturii, de la furnizorul care a emis-o.
 *
 * ⚠ Modulele de facturare se incarca LENES, la nevoie. Importate sus, fiecare
 * rulare a cronului — inclusiv cele in care nu e nicio factura de urcat — ar fi tras
 * dupa ea trei module de facturare cu tot cu dependintele lor.
 */
async function aduPdfFacturii(f: Factura): Promise<ArrayBuffer | { error: string }> {
  try {
    const r = await fetch(f.url, { cache: "no-store" });
    if (!r.ok) return { error: `Nu s-a putut descarca factura (${r.status}).` };
    return await r.arrayBuffer();
  } catch {
    return { error: "Eroare de retea la descarcarea facturii." };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   VERDICTUL LOR, SCRIS LA NOI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Statusurile aduse de la eMAG, puse pe randurile noastre.
 *
 * ⚠ SE SCRIE SI CE E RAU, INTREG. `doc_errors` e SINGURUL loc din care afla
 * comerciantul ce sa repare. La Trendyol motivul respingerii n-a fost aratat, iar
 * produsele au stat „in aprobare" la nesfarsit — cu comerciantul convins ca noi le
 * tinem pe loc.
 */
async function scrieStatusurile(
  admin: Admin, businessId: string, oferte: EmagOfertaCitita[],
): Promise<number> {
  let scrise = 0;
  for (const o of oferte) {
    if (!Number.isFinite(o.id)) continue;

    const validation = intregDeLaEi(o.validation_status);
    const offerValidation = intregDeLaEi(o.offer_validation_status);
    /*
     * ═══ ⚠ ACEEASI FUNCTIE CA LA IMPORT, NU O A DOUA ADUNARE (audit 24.08.2026) ═══
     *
     * Aici se aduna doar `o.stock[]`. Dar raspunsul lui `product_offer/read` NU e in
     * schema lor — e `ApiResponse` generic — iar in practica ofertele vin adesea fara
     * `stock[]` si cu `general_stock`, care e chiar ce vede cumparatorul la ei.
     *
     * `stocDeImportat` stia asta de la inceput, cu tot cu proba: importul cade pe
     * `general_stock` cand nu se poate aduna nimic pe depozite. Reconcilierea n-a
     * primit niciodata aceeasi cunoastere.
     *
     * ⚠ CE A COSTAT, masurat pe catalogul unui comerciant cu 3.754 de oferte:
     * `eVandabila` cere `stoc > 0` deodata cu celelalte trei conditii. Cu stocul citit
     * ca ZERO, doar 27 de oferte ieseau „Se vinde pe eMAG" — desi 3.469 erau APROBATE
     * la ei si 3.742 aveau oferta valida. Celelalte 3.727 apareau in ecran cu „Trimis,
     * in validare": o eticheta care il trimite pe om sa astepte o validare INCHEIATA
     * de mult, in loc sa se uite la ce chiar lipseste.
     *
     * Nicio eroare, nicaieri. Zero e o valoare valida pentru un stoc.
     *
     * ⚠ Doua copii ale aceleiasi cunoasteri se despart, iar despartirea nu se vede:
     * amandoua raspund cu un numar. De aceea aici se CHEAMA functia importului, nu se
     * scrie a doua adunare langa ea.
     */
    const stoc = stocDeImportat(o);

    const vandabila = eVandabila({
      stoc,
      status: o.status ?? null,
      offer_validation_status: offerValidation,
      validation_status: validation,
    });

    /*
     * ⚠ ULTIMELE PATRU TREC ACUM PRIN `intregDeLaEi` (24.08.2026).
     *
     * Nefiltrate, un `ownership: true` de la ei facea PostgREST sa refuze randul cu
     * „invalid input syntax for type integer”. Iar aici caderea era TACUTA: `if
     * (!error) scrise++` sare peste, trecerea merge mai departe, ecranul arata un
     * numar mai mic, si nimeni n-are de ce sa se uite.
     *
     * La import aceeasi greseala a picat zgomotos si s-a aflat in cinci minute. Aici
     * ar fi putut sta luni — reconcilierea e chiar controlul care ne spune ce e la ei,
     * si ar fi tacut tocmai despre ofertele pe care nu le poate scrie.
     */
    const { error } = await admin.from("emag_offers").update({
      validation_status: validation,
      offer_validation_status: offerValidation,
      translation_validation_status: intregDeLaEi(o.translation_validation_status),
      /*
       * ═══ ⚠ MOTIVUL SE CULEGE, NU SE CITESTE DINTR-O CHEIE GHICITA (24.08.2026) ═══
       *
       * Masurat pe contul unui comerciant: 152 de oferte RESPINSE de eMAG (112 cu
       * documentatia respinsa, 34 blocate, 6 cu EAN respins) si la TOATE 152
       * `doc_errors` era gol. Adica omul avea 152 de produse refuzate si niciun motiv
       * pentru niciunul — chiar greseala §12.9, lectia Trendyol.
       *
       * `doc_errors` a fost o presupunere de-a noastra: raspunsul lui
       * `product_offer/read` NU e in schema lor. Exact ca `ownership`, care s-a dovedit
       * `boolean` acolo unde documentatia scrie 1/2.
       *
       * `motiveDeLaEi` cauta in toate formele plauzibile. Iar pentru ofertele respinse
       * se pastreaza raspunsul INTREG, ca data viitoare sa existe dovada in loc de o a
       * doua presupunere.
       */
      doc_errors: motiveDeLaEi(o) as never,
      /* ⚠ Numai pentru cele respinse: pastrat pentru toate, ar fi insemnat un jsonb pe
         fiecare din mii de randuri, rescris la fiecare trecere a cronului. */
      raspuns_brut: (eRespinsaDeEmag(validation) ? (o as never) : null) as never,
      part_number_key: o.part_number_key ?? null,
      /* ⚠ Si numele. Comerciantul isi poate redenumi oferta in panoul lor; scris o
         singura data la import, ecranul nostru ar fi ramas cu numele vechi. */
      nume_emag: (o.name ?? "").trim() || null,
      /*
       * ⚠ CATE IMAGINI ARE EMAG, dupa ce ne-au spus ei (24.08.2026).
       *
       * `EmagOfertaCitita.images` exista in tipuri de la inceput si nu se scria nicaieri.
       * Deci intrebarea „are eMAG poza noastra?" n-avea niciun raspuns in baza, iar cand
       * comerciantul a intrebat de ce vede produsele fara imagine, s-a ajuns la
       * presupuneri in loc de o privire pe un rand.
       *
       * ⚠ `null` cand campul lipseste din raspuns, `0` cand chiar n-au niciuna. Doua
       * lucruri diferite: primul inseamna „nu ne-au spus", al doilea „ne-au spus ca nu".
       */
      imagini_la_ei: Array.isArray(o.images) ? o.images.length : null,
      /*
       * ⚠ STAREA OFERTEI LA EI, si e piesa care lipsea (24.08.2026).
       *
       * `eVandabila` cere `status === 1` deodata cu celelalte trei conditii, dar noi n-o
       * pastram nicaieri. Deci 3.469 de oferte APROBATE la eMAG apareau in ecran cu
       * „Trimis, in validare" — o eticheta care il trimite pe om sa astepte ceva incheiat
       * de mult, in loc sa se uite la ce chiar lipseste.
       *
       * Raspunsul lor brut a aratat `status: 2` la 8 din 9 oferte cercetate: „End of
       * Life", scoase din vanzare. Nici stoc, nici validare — pur si simplu nu mai sunt
       * de vanzare la ei. Fara campul asta, motivul ala nu putea fi spus niciodata.
       */
      status_la_ei: intregDeLaEi(o.status),
      /* ⚠ Ultima din cele patru conditii ale vandabilitatii pe care n-o pastram. Fara ea,
         ecranul nu putea deosebi „n-are stoc la ei" de „e oprita la ei". */
      stoc_la_ei: stoc,
      ownership: intregDeLaEi(o.ownership),
      number_of_offers: intregDeLaEi(o.number_of_offers),
      buy_button_rank: intregDeLaEi(o.buy_button_rank),
      best_offer_sale_price: zecimalDeLaEi(o.best_offer_sale_price),
      status: (vandabila ? "live" : "sent") satisfies StareOferta,
      last_status_at: new Date().toISOString(),
    }).eq("business_id", businessId).eq("emag_id", o.id);

    /* ⚠ O cadere la scriere NU mai e tacuta. Nescrisa, ea arata ca „oferta n-a fost
       atinsa" — la fel ca o oferta care chiar nu mai e a noastra. */
    if (error) {
      void logError({
        action: "emag-sync.reconciliere",
        message: `statusul ofertei ${o.id} nu s-a putut scrie: ${error.message}`,
        details: { businessId, emag_id: o.id },
        severity: "warning",
      });
      continue;
    }
    scrise++;
  }
  return scrise;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DERIVA: CE E LA EI FATA DE CE AM TRIMITE NOI (§68, §69)
   ═══════════════════════════════════════════════════════════════════════════ */

/** Ce se citeste din `emag_offers` ca sa se poata masura deriva. */
interface RandPentruDeriva {
  emag_id: number;
  product_id: string | null;
  variant_title: string | null;
  deriva: unknown;
}

/**
 * Masoara si repara deriva pe pagina de oferte deja citita.
 *
 * ═══ ⚠ CE PAZESTE PASUL ASTA ═══
 *
 * Reconcilierea de deasupra citea starile de validare si atat. Pretul si stocul —
 * chiar lucrurile pentru care exista integrarea — nu erau verificate NICIODATA dupa
 * trimitere. Adica exact controlul care a lipsit la Trendyol: 1051 de produse au
 * raportat succes cu preturile neschimbate, si nimeni n-a aflat luni de zile.
 *
 * ⚠ Regula celor doua vederi e in `deriva.ts`, si e miezul: o singura diferenta nu
 * repara nimic, fiindca in minutul dintre o vanzare pe eMAG si ingerarea ei la noi
 * stocul nostru e legitim mai mare decat al lor.
 */
async function masoaraDeriva(
  admin: Admin, ctx: ContextEmag, oferte: EmagOfertaCitita[],
): Promise<number> {
  const laEi = new Map<number, EmagOfertaCitita>();
  for (const o of oferte) if (Number.isFinite(o.id)) laEi.set(o.id, o);
  if (laEi.size === 0) return 0;

  /*
   * ⚠ `auto_sync = true`, si e prima dintre doua paze.
   *
   * O oferta preluata din contul lor la import e a COMERCIANTULUI: pretul de acolo
   * e cel pe care si l-a pus el, nu o derivare de reparat. „Reparata", i-am fi
   * rescris catalogul preluat cu preturile din Edinio — pe tacute, si la fiecare
   * trecere. A doua paza e in `enqueueMany`, care filtreaza la fel.
   *
   * ⚠ `last_synced_at` ne-nul: o oferta pe care n-am trimis-o NICIODATA n-are fata
   * de ce sa devieze. Fara filtrul asta, fiecare oferta nou creata ar fi aratat o
   * derivare fata de un pret pe care nu l-am pus noi acolo.
   */
  const { data: randuriBrute, error: eRanduri } = await admin.from("emag_offers")
    .select("emag_id, product_id, variant_title, deriva")
    .eq("business_id", ctx.businessId)
    .eq("auto_sync", true)
    .not("product_id", "is", null)
    .not("last_synced_at", "is", null)
    /* ⚠ Cel mult `PE_PAGINA` id-uri, deci mult sub pragul la care `.in()` cedeaza
       (masurat intre 600 si 700). Nu se fragmenteaza fiindca nu are ce fragmenta. */
    .in("emag_id", [...laEi.keys()]);

  if (eRanduri) {
    await logError({
      action: "emag-sync/deriva",
      message: `randurile de oferta nu s-au putut citi: ${eRanduri.message}`,
      businessId: ctx.businessId, severity: "warning",
    });
    return 0;
  }

  const randuri = (randuriBrute ?? []) as RandPentruDeriva[];
  if (randuri.length === 0) return 0;

  /* Ofertele se grupeaza pe produs: un produs cu variante are mai multe, iar pretul
     si stocul fiecareia se calculeaza din combinatia ei. */
  const peProdus = new Map<string, RandPentruDeriva[]>();
  for (const r of randuri) {
    if (!r.product_id) continue;
    const lista = peProdus.get(r.product_id);
    if (lista) lista.push(r); else peProdus.set(r.product_id, [r]);
  }

  const { data: produseBrute, error: eProduse } = await admin.from("products")
    .select("id, name, description, price, compare_at_price, images, category, sku, weight_grams, stock_quantity, is_active, page_sections")
    .eq("business_id", ctx.businessId)
    .in("id", [...peProdus.keys()]);

  if (eProduse) {
    await logError({
      action: "emag-sync/deriva",
      message: `produsele nu s-au putut citi: ${eProduse.message}`,
      businessId: ctx.businessId, severity: "warning",
    });
    return 0;
  }

  const surse = {
    pret: sursaAdevarului(ctx.config.deriva_pret),
    stoc: sursaAdevarului(ctx.config.deriva_stoc),
  };
  const acum = new Date().toISOString();
  const dePusLaRand = { pret: new Set<string>(), stoc: new Set<string>() };
  let gasite = 0;

  for (const produs of (produseBrute ?? []) as ProdusDeCartografiat[]) {
    const aleLui = peProdus.get(produs.id) ?? [];

    /*
     * ⚠ SE FOLOSESTE CHIAR FUNCTIA CARE TRIMITE, nu un calcul paralel.
     *
     * O a doua socoteala a pretului si a stocului, scrisa aici, ar fi ramas in urma
     * la prima schimbare din `oferteUsoare` — TVA, rezerva de stoc, pretul unitar al
     * combinatiei. Si atunci pasul asta ar fi masurat diferenta dintre doua functii
     * de-ale noastre, raportand derivari care nu exista si ratandu-le pe cele care
     * exista. O plasa de siguranta care minte e mai rea decat lipsa ei.
     */
    const amTrimite = oferteUsoare(
      produs,
      magazinDin(ctx, produs),
      aleLui.map((r) => ({ variant_title: r.variant_title, emag_id: r.emag_id })),
    );

    for (const trimisa of amTrimite) {
      const rand = aleLui.find((r) => r.emag_id === trimisa.id);
      const aLor = laEi.get(trimisa.id);
      if (!rand || !aLor) continue;

      /*
       * ═══ ⚠ A DOUA ADUNARE PROPRIE, SI CEA MAI PERICULOASA (audit 24.08.2026) ═══
       *
       * Aici se compara stocul LOR cu al NOSTRU, iar cand difera de doua ori la rand,
       * se REPARA — adica plecam sa le scriem stocul peste al lor.
       *
       * Adunata numai din `stock[]`, o oferta care vine cu `general_stock` (forma cea
       * mai obisnuita la citire) iesea cu ZERO. Deci: „la ei 0, la noi 40", de doua ori
       * la rand, si porneam sa reparam o derivare care nu exista.
       *
       * ⚠ Nu e doar o eticheta gresita, ca la `scrieStatusurile`: sunt SCRIERI catre
       * eMAG, care ard din cele 3 cereri pe secunda ale magazinului si rescriu un stoc
       * pe care comerciantul poate il tine anume altfel in panoul lor.
       *
       * ⚠ `null` cand nu stim NIMIC despre stocul lor ramane: `stocDeImportat` intoarce
       * 0 si pentru „zero adevarat", si pentru „lipseste". Deosebirea conteaza — un zero
       * adevarat E o derivare, o lipsa nu e — deci se pastreaza intrebarea de dinainte
       * despre forma raspunsului, si abia apoi se socoteste ca la import.
       */
      const stiuStocul = Array.isArray(aLor.stock) || Number.isFinite(aLor.general_stock);
      const stocLor = stiuStocul ? stocDeImportat(aLor) : null;

      /* ⚠ Fara pret de-al nostru nu se masoara NIMIC, nici macar stocul luat separat.
         Pus pe zero „ca sa avem o valoare", fiecare oferta ar fi aratat o derivare de
         pret catre zero — si am fi pornit repararea intregului catalog pornind de la
         un numar pe care nu l-a calculat nimeni. */
      if (trimisa.sale_price == null) continue;

      const campuri = derivaOfertei(
        { pret: trimisa.sale_price, stoc: trimisa.stock?.[0]?.value ?? 0 },
        { pret: aLor.sale_price ?? null, stoc: stocLor },
      );

      const veche = citesteMemoriaDerivei(rand.deriva);
      const h = hotarasteDeriva(campuri, veche, surse, acum);

      if (campuri.length > 0) gasite++;

      /*
       * ⚠ SE SCRIE NUMAI CAND S-A SCHIMBAT CEVA.
       *
       * In starea sanatoasa — care e aproape mereu — `deriva` e `null` si ramane
       * `null`. O scriere neconditionata ar fi insemnat pana la o suta de UPDATE-uri
       * pe magazin si pe minut, ca sa rescrie `null` peste `null`.
       */
      if (JSON.stringify(veche) !== JSON.stringify(h.memorie)) {
        await admin.from("emag_offers")
          .update({ deriva: (h.memorie ?? null) as never })
          .eq("business_id", ctx.businessId).eq("emag_id", rand.emag_id);
      }

      for (const camp of h.deReparat) dePusLaRand[camp].add(produs.id);

      /*
       * ⚠ Renuntarea se SCRIE, tare, si O SINGURA DATA.
       *
       * O oferta pe care eMAG n-o lasa schimbata — pret in afara benzii min/max,
       * oferta blocata, categorie inchisa — nu mai primeste cereri, dar nici n-are
       * voie sa dispara in tacere.
       *
       * Conditia se uita la MEMORIA VECHE: scrisa la fiecare trecere de dupa
       * renuntare, aceeasi oferta ar fi umplut jurnalul cu acelasi rand la
       * nesfarsit, si l-ar fi facut necitibil tocmai cand e nevoie de el.
       */
      if (h.deScrisInJurnal) {
        await logError({
          action: "emag-sync/deriva",
          message: `oferta ${rand.emag_id} nu se lasa reparata dupa toate incercarile`,
          details: { produs: produs.id, campuri: h.memorie?.campuri },
          businessId: ctx.businessId, severity: "warning",
        });
      }
    }
  }

  /* ⚠ Puse la rand O SINGURA DATA pe operatie, nu pe oferta. Un produs cu douazeci
     de variante derivate e tot un singur element de coada: ruta usoara retrimite
     toate ofertele lui dintr-o data. */
  if (dePusLaRand.pret.size) await enqueueEmagPretMany(ctx.businessId, [...dePusLaRand.pret]);
  if (dePusLaRand.stoc.size) await enqueueEmagStocMany(ctx.businessId, [...dePusLaRand.stoc]);

  return gasite;
}

/**
 * Numarul dintr-un status care vine in trei forme.
 *
 * ⚠ eMAG trimite `validation_status` cand ca tablou de obiecte, cand ca obiect, cand
 * ca numar — se vede chiar in exemplele din OpenAPI-ul lor. Citit pe o singura
 * forma, statusul ar fi ramas `null` pentru jumatate din oferte, iar panoul ar fi
 * aratat „în validare" la nesfarsit pentru produse aprobate demult.
 */
/**
 * Lista de IP-uri de la care suna eMAG, adusa si tinuta minte.
 *
 * ═══ ⚠ DE CE NU E DE AJUNS LISTA SCRISA IN COD ═══
 *
 * Ei o numesc autoritara si cer explicit sa fie urmarita: „please update your firewall
 * rules whenever this section changes", cu un `/public-ips.json` de interogat.
 *
 * Scrisa o data si uitata acolo, ziua in care adauga un IP nou ar fi aratat asa:
 * notificarile se opresc, comenzile continua sa intre — dar prin cron, la un minut in
 * loc de indata. Nimic nu se strica, totul merge putin mai incet, si nimeni n-are de
 * ce sa se uite. Se descopera cand suna un client intreband de ce comanda lui n-a
 * fost preluata.
 *
 * ⚠ O schimbare se scrie ca `warning`, nu ca `info`: e chiar semnalul pe care il
 * asteptam de luni de zile, si merita sa se vada.
 *
 * ⚠ Un raspuns necitibil NU goleste lista. Intors ca lista goala, ar fi refuzat toate
 * notificarile — adica ar fi facut chiar raul de care ne aparam.
 */
async function improspateazaIpurile(admin: Admin): Promise<void> {
  const r = await aduIpurileEmag();
  if ("error" in r) {
    await logError({
      action: "emag-sync.ipuri",
      message: `lista de IP-uri nu s-a putut aduce: ${r.error}`,
      severity: "warning",
    });
    return;
  }

  const noi = citesteIpuri(r.ipuri);
  if (noi.length === 0) {
    /* ⚠ Zero adrese citite dintr-un raspuns care a venit inseamna ca forma fisierului
       s-a schimbat, nu ca n-au IP-uri. Se spune, si lista veche ramane. */
    await logError({
      action: "emag-sync.ipuri",
      message: "lista de IP-uri a venit dar nu s-a putut citi nicio adresa din ea",
      details: { brut: JSON.stringify(r.ipuri).slice(0, 500) },
      severity: "warning",
    });
    return;
  }

  const { data } = await admin.from("platform_settings")
    .select("value").eq("key", CHEIE_IPURI).maybeSingle();
  const vechi = ((data?.value as { ipuri?: string[] } | null)?.ipuri) ?? null;

  if (sAuSchimbat(vechi, noi)) {
    await logError({
      action: "emag-sync.ipuri",
      message: `eMAG si-a schimbat lista de IP-uri pentru notificari: ${noi.join(", ")}`,
      details: { vechi, noi },
      severity: "warning",
    });
  }

  await admin.from("platform_settings").upsert({
    key: CHEIE_IPURI,
    value: { ipuri: noi, adus_la: new Date().toISOString() } as never,
    updated_at: new Date().toISOString(),
  } as never, { onConflict: "key" });
}
