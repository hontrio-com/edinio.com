import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { verificaCron } from "@/lib/cron-auth";
import { logError } from "@/lib/error-logger";
import { alegeInRotatie, magazineConectate } from "@/lib/marketplace/rotatie";
import { marcajUrmator } from "@/lib/marketplace/marcaj";
import { urcaAwbPropriu, awbPropriuAlComenzii, CAMPURI_AWB_DE_CITIT } from "@/lib/emag/awb-propriu";
import { emagGloballyEnabled, iesireEmag } from "@/lib/emag/auth";
import { citesteOferte, isEmagError } from "@/lib/emag/client";
import { esteDeconectatEmag, loadEmagContext, type ContextEmag } from "@/lib/emag/sync";
import { patchEmagConfig } from "@/lib/emag/config";
import { propagariNeterminate, propagaSetarile, stingePropagarea } from "@/lib/emag/propagare";
import { stocDeImportat } from "@/lib/emag/import-produse";
import { magazinDin, retragePeEmagId, trimiteElement } from "@/lib/emag/trimite";
import { oferteUsoare, type ProdusDeCartografiat } from "@/lib/emag/mapping";
import {
  citesteMemoriaDerivei, derivaOfertei, hotarasteDeriva, sursaAdevarului,
} from "@/lib/emag/deriva";
import {
  enqueueEmagPretMany, enqueueEmagStocMany, enqueueEmagSyncMany, publicaPeEmagMany,
} from "@/lib/emag/queue";
import { cuFir, firNou, ZILE_PASTRARE } from "@/lib/emag/jurnal";
import { curataJurnalul } from "@/lib/emag/jurnal-scriere";
import { aduComenzile, reiaComenzileParcate } from "@/lib/emag/orders";
import { aduIpurileEmag } from "@/lib/emag/client";
import { citesteIpuri, sAuSchimbat, CHEIE_IPURI } from "@/lib/emag/ipuri";
import { urcaFacturaLaEmag, type Factura } from "@/lib/emag/facturi";
import { aduRetururile } from "@/lib/emag/rma";
import type { EmagOfertaCitita } from "@/lib/emag/types";
import type { OpEmag } from "@/lib/emag/queue";
import { asteptareaDupaPana, asteptareaUrmatoare } from "@/lib/emag/rute";
import { ardeIncercare } from "@/lib/emag/errors";
import { scrieStatusurile } from "@/lib/emag/statusuri";
import { amprentaContinutului } from "@/lib/emag/mapping";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";

/**
 * Trecerea din minut in minut a integrarii eMAG.
 *
 * ═══ DOI PASI, CU ROLURI DIFERITE ═══
 *
 *   1. COADA         — ce a schimbat comerciantul pleaca spre eMAG
 *   2. RECONCILIEREA — ce a hotarat eMAG se aduce inapoi
 *
 * Al doilea nu e un lux. Validarea la ei dureaza ore si nu ne anunta nimeni cand se
 * incheie: fara pasul asta, panoul ar arata „trimis” la nesfarsit pentru un produs
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

/**
 * Cate magazine se cerceteaza intr-o trecere de zece minute pentru schimbari neplecate.
 *
 * ⚠ Pasul asta nu face nicio cerere catre eMAG — e o intrebare catre baza si, cel mult, o
 * punere in coada. Deci poate lua mai multe magazine decat pasii care ard din cele 3
 * cereri pe secunda ale comerciantului.
 */
const MAGAZINE_NEPLECATE = 12;

/**
 * Cate produse se repun intr-o trecere, pe magazin.
 *
 * ⚠ Marginit ANUME. Daca ceva s-a rupt in amonte si un catalog intreg iese „neplecat",
 * plasa nu trebuie sa toarne 20.000 de randuri in coada deodata: ar ineca lucrarile
 * adevarate — inclusiv mișcarile de stoc de dupa vanzari, care sunt cele mai grabite. Se
 * repun cate 50, iar la trecerea urmatoare urmatoarele 50.
 */
const NEPLECATE_PE_MAGAZIN = 50;

/**
 * Cate produse se masoara intr-o trecere, pe magazin.
 *
 * ⚠ Masurarea inseamna citirea `page_sections` si a imaginilor, adica randuri grele. 300
 * la zece minute acopera un catalog de 3.000 in aproape doua ore — destul pentru o plasa
 * care prinde ce a scapat, nu pentru o cale principala.
 */
const FELIE_AMPRENTE = 300;

/**
 * Cat se asteapta inainte ca un produs sa fie socotit „neplecat".
 *
 * ⚠ Fara rabdarea asta, fiecare salvare de produs ar fi pus DOUA randuri in coada: unul
 * de la actiunea comerciantului, si unul de aici — fiindca in clipa dintre ele lucrarea
 * chiar e in aer.
 */
const RABDARE_NEPLECATE = "10 minutes";

/** Cate facturi se urca pentru un magazin intr-o trecere. */
const FACTURI_PE_TRECERE = 10;
/* ⚠ Mai putine decat la facturi: fiecare urcare inseamna un PDF construit si urcat in R2,
   apoi o cerere la ei. Zece pe trecere, la cinci minute, inseamna 120 pe ora. */
const AWB_PE_TRECERE = 10;

/** ⚠ Maximul lor. Cerut mai mare, eMAG intoarce tot 100 fara sa spuna. */
const PE_PAGINA = 100;

interface ElementCoada {
  id: string;
  business_id: string;
  product_id: string | null;
  offer_id: string;
  op: OpEmag;
  /** Refuzuri. Duce la abandon dupa `INCERCARI_MAXIM`. */
  attempts: number;
  /** Pane trecatoare. Amana, dar NU abandoneaza niciodata. Vezi `asteptareaDupaPana`. */
  pauze: number;
  /**
   * Numaratorul de scrieri al randului, crescut de declansator la FIECARE atingere.
   *
   * ⚠ E singurul lucru care deosebeste „elementul pe care l-am luat” de „elementul care
   * a fost pus din nou intre timp". Vezi `2026-10-09-generatia-cozilor.sql`.
   */
  generation: number;
}

/* ══════════════════════════════════════════════════════════════════════════
   SCRIERILE IN COADA SE FAC PE GENERATIE (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ CE ERA GRESIT. Lucratorul stergea `where id = X`, atat. Dar intre clipa in care a
   citit produsul si clipa in care sterge, comerciantul poate salva produsul din nou —
   iar punerea la coada e un `upsert` pe aceeasi cheie unica, deci rescrie chiar randul X.

   Sters asa, se pierde cererea NOUA:

     Edinio = Titlu B · eMAG = Titlu A · coada = goala · eroare = niciuna

   Pe pret si pe stoc repara reconcilierea. Pe titlu, descriere, imagini si
   caracteristici nu repara nimeni — nu exista o a doua sursa care sa vada deosebirea.

   ⚠ Si pe calea de esec era la fel: `attempts + 1` scris peste cererea noua o facea sa
   mosteneasca incercarile celei vechi, si putea fi ABANDONATA fara sa fi fost incercata.

   Acum fiecare scriere cere generatia cu care s-a revendicat randul. Zero randuri atinse
   nu e o eroare: e chiar raspunsul „a venit ceva mai nou”, si atunci nu se atinge nimic.
*/

/**
 * Ce se poate scrie pe un element de coada.
 *
 * ⚠ Tipul din schema, nu `Record<string, unknown>`. Cu al doilea, o cheie scrisa gresit
 * ar fi trecut de `tsc` si ar fi ajuns un `update` care nu schimba nimic — chiar felul de
 * defect tacut din care e facuta toata ziua asta.
 */
type PeticCoada = Database["public"]["Tables"]["emag_sync_queue"]["Update"];

/**
 * Scoate elementul din coada, DACA nimeni nu l-a pus din nou intre timp.
 *
 * ⚠ `.select("id")` nu e decor: fara el, PostgREST nu spune cate randuri a sters, iar
 * o comparatie care nu se poate citi nu e o comparatie.
 */
async function scoateDinCoada(admin: Admin, el: ElementCoada): Promise<void> {
  /*
   * ⚠ FARA GENERATIE SE STERGE CA INAINTE, si se spune de ce.
   *
   * Daca `revendica_din_coada` n-ar aduce coloana — o migratie neaplicata, un tabel
   * refacut de mana — comparatia n-ar mai putea fi indeplinita NICIODATA, si atunci
   * niciun element n-ar mai iesi din coada: aceleasi randuri retrimise la eMAG din minut
   * in minut, la nesfarsit. E o cadere mult mai rea decat cea de care ne aparam aici.
   */
  if (!Number.isFinite(el.generation)) {
    await logError({
      action: "emag-sync",
      message: "coada n-are `generation`; stergerea se face fara comparatie",
      businessId: el.business_id,
      severity: "warning",
    });
    await admin.from("emag_sync_queue").delete().eq("id", el.id);
    return;
  }

  const { data, error } = await admin.from("emag_sync_queue")
    .delete().eq("id", el.id).eq("generation", el.generation).select("id");

  if (error) {
    /* ⚠ Ramas in coada, elementul se va retrimite. Retrimiterea e nedureroasa (`emag_id`
       e stabil, deci e o actualizare, nu o creare); pierderea tacuta n-ar fi. */
    await logError({
      action: "emag-sync",
      message: `elementul de coada n-a putut fi sters: ${error.message}`,
      businessId: el.business_id,
      details: { productId: el.product_id, op: el.op },
      severity: "warning",
    });
    return;
  }

  if ((data ?? []).length === 0) await elibereazaPentruCerereaNoua(admin, el);
}

/**
 * Scrie pe element, DACA nimeni nu l-a pus din nou intre timp.
 *
 * Intoarce `false` cand cererea a fost inlocuita — atunci nu s-a scris nimic, si asa
 * trebuie: `attempts`, `next_retry_at` si `abandonat_la` sunt ale cererii VECHI.
 */
async function scrieInCoada(
  admin: Admin, el: ElementCoada, petic: PeticCoada,
): Promise<boolean> {
  /* ⚠ Aceeasi plasa ca la stergere, si din acelasi motiv. */
  if (!Number.isFinite(el.generation)) {
    await admin.from("emag_sync_queue").update(petic).eq("id", el.id);
    return true;
  }

  const { data, error } = await admin.from("emag_sync_queue")
    .update(petic).eq("id", el.id).eq("generation", el.generation).select("id");

  if (error) {
    await logError({
      action: "emag-sync",
      message: `elementul de coada n-a putut fi actualizat: ${error.message}`,
      businessId: el.business_id,
      details: { productId: el.product_id, op: el.op },
      severity: "warning",
    });
    return false;
  }

  if ((data ?? []).length > 0) return true;
  await elibereazaPentruCerereaNoua(admin, el);
  return false;
}

/**
 * Cererea noua nu asteapta expirarea inchirierii celei vechi.
 *
 * ⚠ Punerea la coada NU sterge `revendicat_pana` — dinadins: sters de acolo, un al
 * doilea cron ar putea revendica randul cat timp primul e inca in aer, si acelasi produs
 * ar pleca de doua ori. Deci curatarea o face lucratorul, DUPA ce a terminat, si numai
 * cand chiar vede o generatie mai noua.
 *
 * ⚠ `gt("generation", …)` face conditia sigura: se elibereaza numai un rand care CHIAR a
 * fost rescris. Fara ea, s-ar putea desface inchirierea altcuiva.
 */
async function elibereazaPentruCerereaNoua(admin: Admin, el: ElementCoada): Promise<void> {
  await admin.from("emag_sync_queue")
    .update({ revendicat_pana: null })
    .eq("id", el.id).gt("generation", el.generation);
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

  let duse = 0, cazute = 0, reconciliate = 0, comenziNoi = 0, facturi = 0, retururi = 0, awburi = 0;
  let comenziRecuperate = 0;
  let derivate = 0;
  const inceputulRularii = Date.now();

  /* Contextul unui magazin se citeste O DATA pe trecere: e o citire cu decriptare,
     iar coada poate avea zeci de elemente ale aceluiasi magazin. */
  const contexte = new Map<string, ContextEmag | null>();
  async function ctxPentru(businessId: string): Promise<ContextEmag | null> {
    if (contexte.has(businessId)) return contexte.get(businessId)!;
    const c = await loadEmagContext(admin, businessId);

    /*
     * ═══ ⚠ ACREDITARI REFUZATE INSEAMNA „NU MAI SUNA” (24.08.2026) ═══
     *
     * `needs_reconnect` se SCRIA la fiecare verdict `chei` (401), cu doua randuri mai
     * jos si in pasul comenzilor, dar nu-l citea NIMENI pe calea automata. Cronul mergea
     * mai departe cu aceleasi acreditari refuzate, in toti pasii, din minut in minut.
     *
     * ⚠ Socotit pe ritmul cronului: in jur de 5.700 de autentificari respinse pe zi, la
     * un singur magazin. Iar documentatia lor spune explicit ca si cererile invalide se
     * numara in limita — deci contul isi arde singur cota de 3 cereri pe secunda pentru
     * apeluri care nu pot reusi, pana cand omul reconecteaza.
     *
     * ⚠ SE OPRESTE AICI, nu in `loadEmagContext`. Acolo, `null` inseamna „neconectat”, si
     * chiar asta ar fi spus ecranele actiunilor de mana: „Contul eMAG nu este conectat” —
     * fals, si l-ar fi trimis pe om sa caute in alta parte. Calea de mana are deja
     * `ceLipsestePentruPublicare`, care spune limpede „reconecteaza contul”.
     *
     * ⚠ Nu se sterge si nu se marcheaza nimic: coada ramane intreaga si porneste singura
     * cand `needs_reconnect` se stinge la reconectare.
     */
    const bun = c && c.config.needs_reconnect === true ? null : c;
    contexte.set(businessId, bun);
    return bun;
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
       * ⚠ LIPSA CONTEXTULUI NU INSEAMNA „MAGAZIN DECONECTAT”.
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
       * Deci elementul era sters aici, fara log, fara „dus”, fara „cazut” — iar toata
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
          await scoateDinCoada(admin, el);
          continue;
        }
        const rr = await cuFir(firNou("coada-retragere"), () => retragePeEmagId(admin, ctx, emagId));
        if (rr.verdict === "sarit" || rr.verdict === "reusit" || rr.verdict === "reusit_cu_observatii") {
          await scoateDinCoada(admin, el);
          duse++;
        } else {
          cazute++;
          /* ⚠ Aceeasi despartire ca mai jos: o pana se numara in `pauze` si se asteapta
             putin; un refuz arde o incercare si se asteapta mult. */
          const arde = ardeIncercare(rr.verdict as Parameters<typeof ardeIncercare>[0]);
          const incercari = (el.attempts ?? 0) + (arde ? 1 : 0);
          const pauze = (el.pauze ?? 0) + (arde ? 0 : 1);
          await scrieInCoada(admin, el, {
            attempts: incercari,
            pauze,
            last_error: rr.mesaj || null,
            revendicat_pana: null,
            next_retry_at: new Date(
              Date.now() + (arde ? asteptareaUrmatoare(incercari) : asteptareaDupaPana(pauze)),
            ).toISOString(),
          });
        }
        continue;
      }

      /*
       * ⚠ UN FIR PE ELEMENT DE COADA, nu pe rulare (§66).
       *
       * Un element poate face mai multe cereri: loturi de cate 50, o reincercare
       * dupa 429, o masuratoare separata. Cu un fir pe rulare, toate elementele
       * rularii ar fi purtat acelasi numar, iar „arata-mi ce a facut elementul asta”
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

      /* „Sarit” inseamna „nu era nimic de facut, si nu e o eroare”. Iese din coada
         linistit: reincercat, si-ar arde incercarile pe un lucru care nu se schimba. */
      if (r.verdict === "sarit" || r.verdict === "reusit" || r.verdict === "reusit_cu_observatii") {
        await scoateDinCoada(admin, el);
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
         * ⚠ NU SE ARDE NICIO INCERCARE. `attempts` numara REFUZURI si duce la abandon
         * dupa cinci; numarate acolo, cinci minute de 429 ar fi golit definitiv coada
         * unui magazin — chiar incidentul de la Trendyol.
         *
         * ═══ ⚠ DAR NICI NU SE ELIBEREAZA PE LOC (24.08.2026) ═══
         *
         * Forma dinainte punea doar `revendicat_pana: null`, deci elementul era liber
         * imediat: la o pana la ei sau la releul de IP fix, cronul lua in FIECARE MINUT
         * aceleasi 30 de randuri si le trimitea iar. Documentatia lor spune ca si
         * cererile invalide se numara in limita — bucla ardea chiar cele 3 cereri pe
         * secunda prin care ar fi trebuit sa plece o miscare de stoc dupa o vanzare.
         *
         * `pauze` e al doilea contor, fara prag de abandon: o pana nu e vina elementului
         * si nu trebuie sa-l scoata niciodata din coada.
         */
        const pauze = (el.pauze ?? 0) + 1;
        await scrieInCoada(admin, el, {
          pauze,
          revendicat_pana: null,
          last_error: r.mesaj || null,
          next_retry_at: new Date(Date.now() + asteptareaDupaPana(pauze)).toISOString(),
        });
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
         * fara ca panoul sa arate altceva decat „0 in asteptare” — iar comerciantul ar
         * fi crezut ca totul a plecat.
         *
         * Acum ramane, marcat. `revendica_din_coada` il sare (`abandonat_la is null`),
         * ecranul il numara, si o atingere a produsului il reaprinde.
         */
        /*
         * ⚠ ABANDONUL E CEA MAI IMPORTANTA COMPARATIE DIN TOATE. Scris peste o cerere
         * noua, ar opri-o definitiv fara s-o fi incercat vreodata — si `revendica_din_coada`
         * sare peste `abandonat_la is not null`, deci n-ar mai fi luat-o nimeni.
         */
        const sAScris = await scrieInCoada(admin, el, {
          attempts: incercari,
          last_error: r.mesaj || null,
          revendicat_pana: null,
          abandonat_la: new Date().toISOString(),
        });
        if (!sAScris) continue;
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
      await scrieInCoada(admin, el, {
        attempts: incercari,
        last_error: r.mesaj || null,
        revendicat_pana: null,
        next_retry_at: new Date(Date.now() + asteptareaUrmatoare(incercari)).toISOString(),
      });
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
     * Pus la „acum” dupa o trecere trunchiata, comenzile necitite ar fi ramas in urma
     * ferestrei si NU s-ar mai fi citit niciodata. Fara nicio eroare, fiindca fiecare
     * trecere in parte a reusit. Asta e chiar incidentul pentru care exista
     * `marcaj.ts`, si de aceea nu se scrie de mana aici.
     */
    const urmator = marcajUrmator(rez, { runStartMs: inceputulRularii, overlapMs: SUPRAPUNERE_MS });
    if (urmator != null) {
      await patchEmagConfig(admin, businessId, { orders_synced_at: new Date(urmator).toISOString() });
    }

    /*
     * ═══ COMENZILE PARCATE, RELUATE (25.08.2026) ═══
     *
     * O comanda respinsa de o constrangere lasa marcajul sa treaca peste ea — altfel un
     * singur rand imposibil ar ingheta fereastra intregului magazin. Dar constrangerea nu e
     * incalcata de datele lor, ci de codul NOSTRU care le potriveste: `statusEdinio(5)` pe
     * 24.08, `platitLaEi(0)` pe 25.08. Amandoua reparate in cateva ore, iar comenzile
     * respinse intre timp ar fi ramas pierdute pentru totdeauna.
     *
     * De-aia comanda se parcheaza cu `raw` intreg, iar aici se reincearca din el.
     *
     * ⚠ LA FIECARE TRECERE, nu la un minut anume: cand exista o comanda parcata, ea e o
     * comanda a comerciantului care nu se vede in panou. Lista e goala in mod normal, deci
     * costul obisnuit e o citire care nu gaseste nimic.
     *
     * ⚠ SE SPUNE de fiecare data cand chiar recupereaza ceva: numarul trebuie sa fie zero,
     * iar daca nu e, inseamna ca o reparatie de-a mea a lasat comenzi pe dinafara.
     */
    const parcate = await reiaComenzileParcate(admin, ctx);
    if (parcate.reluate > 0) {
      comenziRecuperate += parcate.reluate;
      await logError({
        action: "emag-sync",
        message: `${parcate.reluate} comenzi parcate au intrat dupa o reparatie de cod`,
        details: { businessId, reluate: parcate.reluate, ramase: parcate.ramase },
        businessId, severity: "warning",
      });
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
      /*
       * ⚠ SI AWB-UL CURIERULUI PROPRIU (25.08.2026). Aceeasi tura si aceeasi rotatie:
       * amandoua sunt documente urcate DUPA expediere, pe aceleasi comenzi, si n-are rost
       * sa se plimbe prin doua ferestre diferite.
       */
      awburi += await cuFir(firNou("awb-propriu"), () => urcaAwburile(admin, ctx));
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
       * niciodata in fereastra, si ar fi ramas „Nou” in Edinio pe veci.
       *
       * De aceea `aduRetururile` citeste dupa STARE, nu dupa timp. Marcajul se scrie
       * doar ca sa se vada in panou cand s-a uitat ultima oara.
       */
      if (rez.ok) {
        await patchEmagConfig(admin, businessId, { rma_synced_at: new Date(inceputulRularii).toISOString() });
      }
    }
  }

  /* ── 5b) Schimbari care n-au lasat nicio urma nicaieri ──────────────────
   *
   * ═══ ⚠ PLASA DE SUB TOATE CELELALTE ═══
   *
   * Modificarea produsului si punerea ei in coada sunt DOUA scrieri separate:
   *
   *   UPDATE products   COMMIT
   *   ↓
   *   enqueue in coada   ← daca pica AICI, produsul e schimbat si coada e goala
   *
   * `after()` leaga lucrarea de ciclul cererii si scrie orice esec in jurnal, deci nu se
   * mai pierde tacut. Dar tot ramane o fereastra: procesul poate muri intre cele doua.
   *
   * ⚠ Pe PRET si pe STOC repara `masoaraDeriva`. Pe TITLU, DESCRIERE, IMAGINI si
   * CARACTERISTICI nu repara nimeni — nu exista o a doua sursa de adevar care sa vada
   * deosebirea, deci produsul ramane la ei cu datele vechi pana cand cineva il atinge din
   * alt motiv.
   *
   * Pasul asta pune intrebarea care lipsea: „care produse s-au schimbat DUPA ultima
   * trimitere si n-au nicio lucrare in coada?". Un produs asa n-are urma nicaieri — nici
   * in coada, nici in jurnal, nici in panou.
   *
   * ⚠ NU E UN OUTBOX, si nu se pretinde ca e. Un outbox tranzactional face pierderea
   * imposibila; asta o face trecatoare. Deosebirea e scrisa intreaga in migratia
   * `2026-10-12-schimbari-neplecate.sql`.
   *
   * ⚠ Masurat pe productie inainte de a fi pornit: 0 produse neplecate din 4677 de oferte.
   * Deci nu se aprinde peste o problema care exista deja — si daca numarul creste vreodata
   * peste zero, ASTA e semnalul ca ceva s-a rupt in amonte.
   *
   * ⚠ La zece minute, nu in fiecare minut: e o plasa, nu o cale. Iar `pas = 10` la
   * rotatie, din acelasi motiv ca la retururi — `alegeInRotatie` socoteste tura din
   * minute, si cu `pas = 1` fereastra ar fi sarit cu 10 magazine intre doua rulari.
   */
  let neplecate = 0;
  if (new Date(inceputulRularii).getMinutes() % 10 === 0) {
    for (const businessId of alegeInRotatie(magazine, MAGAZINE_NEPLECATE, 10)) {
      /*
       * ═══ ⚠ SE COMPARA AMPRENTE, NU MARCAJE DE TIMP (25.08.2026) ═══
       *
       * Forma dinainte intreba `p.updated_at > o.last_synced_at`. Dar `last_synced_at` se
       * scrie la ORICE reusita, inclusiv dupa o miscare de stoc — deci o vanzare petrecuta
       * intre schimbarea de continut si trecerea plasei stergea urma:
       *
       *   10:00 se schimba titlul · punerea in coada se pierde
       *   10:04 se vinde ceva · stocul pleaca · `last_synced_at = 10:04`
       *   10:10 plasa: 10:00 > 10:04 ? NU → „nimic neplecat"
       *
       * Cu cat magazinul vinde mai bine, cu atat plasa era mai oarba.
       *
       * ⚠ AMPRENTELE SE SOCOTESC PENTRU O FELIE, nu pentru tot catalogul: altfel ar
       * insemna citirea `page_sections` si a imaginilor a mii de produse la fiecare zece
       * minute. Felia se roteste, deci catalogul se acopera in cateva treceri — acelasi
       * tipar ca la reconciliere si la derivă.
       */
      const amprente = await amprenteleFeliei(admin, businessId);

      const { data, error } = await admin.rpc("produse_nesincronizate_emag", {
        p_business_id: businessId,
        p_rabdare: RABDARE_NEPLECATE,
        p_limita: NEPLECATE_PE_MAGAZIN,
        p_amprente: amprente as never,
      });

      /* ⚠ Eroarea se spune. O plasa care tace cand se rupe e mai rea decat lipsa ei:
         lasa impresia ca cineva mai verifica. */
      if (error) {
        await logError({
          action: "emag-sync",
          message: `produsele neplecate nu s-au putut cauta: ${error.message}`,
          businessId,
          severity: "warning",
        });
        continue;
      }

      const ids = ((data ?? []) as unknown[]).filter((x): x is string => typeof x === "string");
      if (ids.length === 0) continue;

      /*
       * ⚠ Se trece prin `enqueueEmagSyncMany`, nu se scrie de mana in coada. Acolo stau
       * toate regulile — magazin conectat, `auto_sync` pe oferta, fragmentarea id-urilor —
       * iar scrise a doua oara aici, s-ar fi departat de ele fara sa se vada.
       */
      neplecate += await enqueueEmagSyncMany(businessId, ids);

      /* ⚠ Se SPUNE de fiecare data cand gaseste ceva. Numarul asta trebuie sa fie zero;
         daca nu e, inseamna ca punerea in coada se pierde undeva in amonte, iar asta e o
         constatare, nu o reparatie de rutina. */
      await logError({
        action: "emag-sync",
        message: `${ids.length} produse schimbate fara nicio lucrare in coada; repuse`,
        details: { businessId, cate: ids.length },
        businessId,
        severity: "warning",
      });
    }
  }

  /* ── 5b) Propagarile de setari ramase in aer ────────────────────────────────
   *
   * ═══ ⚠ ASTA CHIAR E UN OUTBOX, spre deosebire de plasa de mai sus ═══
   *
   * Plasa de la 5) face pierderea trecatoare; nu o face imposibila, si spune asta despre
   * ea insasi. Aici insa se poate mai mult, si merita: intentia de propagare se scrie in
   * ACELASI rand, prin aceeasi instructiune Postgres, ca datele care au cerut-o. Deci nu
   * exista clipa in care setarea e salvata si intentia nu.
   *
   * ⚠ SI ERA NEVOIE, fiindca aici plasa nu ajuta cu nimic. Ea compara amprenta de CONTINUT
   * a produsului, iar `green_tax` sau GPSR nu schimba nicio amprenta. O propagare pierduta
   * fiindca instanta a murit dupa Salvare nu se mai repara NICIODATA, de nicaieri — si pe
   * ecran scrie deja „Datele pleaca la ofertele tale in cateva minute”.
   *
   * ⚠ In FIECARE trecere, nu la zece minute ca plasa. Interogarea e una singura, cu filtru
   * pe `propagare_ceruta_la`, si in cazul obisnuit nu intoarce nimic: bratul iute a
   * stampilat deja. `RABDARE_PROPAGARE_MS` ii lasa trei minute sa apuce.
   */
  let propagari = 0;
  /* ⚠ DOUA PE TRECERE, nu cinci. Fiecare propagare citeste catalogul INTREG al unui
     magazin si il pune in coada; cinci ar fi putut manca bugetul de 60 de secunde al
     trecerii si ar fi lasat pasii 6 si 7 nefacuti. Restul asteapta un minut — iar cazul
     asta e oricum rar, fiindca bratul de dupa raspuns apuca aproape mereu. */
  for (const cerere of await propagariNeterminate(admin, inceputulRularii, 2)) {
    const ctx = await ctxPentru(cerere.businessId);
    if (!ctx) continue;

    const rez = await cuFir(
      firNou("propagare-setari"),
      () => propagaSetarile(admin, cerere.businessId, cerere.op),
    );
    propagari += rez.puse;

    /*
     * ⚠ NU SE STINGE CAND PUNEREA IN COADA A PICAT.
     *
     * Stinsa oricum, intentia comerciantului s-ar arunca la gunoi tacut — iar pentru GPSR,
     * `green_tax` si `supply_lead_time` nu exista a doua plasa: pretul si stocul le repara
     * deriva, alea trei nu le repara nimeni. Nestinsa, trecerea urmatoare reia.
     */
    if (!rez.sigur) continue;
    const cate = rez.puse;

    /* ⚠ Compare-and-set: se stinge NUMAI intentia citita. Daca intre timp a venit o cerere
       noua, o stingere oarba ar fi inghitit-o si pe aceea, iar a doua schimbare a
       comerciantului n-ar mai pleca niciodata. */
    await stingePropagarea(admin, cerere.businessId, cerere.ceruta_la);

    /* ⚠ Se SPUNE de fiecare data. In cazul obisnuit bratul de dupa raspuns apuca sa
       stampileze, deci un rand aici inseamna ca o instanta chiar a murit dupa Salvare —
       o constatare, nu o reparatie de rutina. */
    await logError({
      action: "emag-sync",
      message: `propagare de setari ramasa in aer, dusa acum: ${cate} produse pe ${cerere.op}`,
      details: { businessId: cerere.businessId, op: cerere.op, cerutaLa: cerere.ceruta_la },
      businessId: cerere.businessId,
      severity: "warning",
    });
  }

  /* ── 5c) Publicarea automata care s-a pierdut pe drum ───────────────────────
   *
   * ═══ ⚠ COMENTARIUL DIN `queue.ts` O SPUNEA DEJA ═══
   *
   * La un produs NOU, daca in chiar clipa punerii in coada configul nu se poate citi,
   * intentia nu se recupereaza mai tarziu: urmatoarea atingere e `updateProduct`, care
   * trimite `produsNou` fals, iar garda de pe numaratoarea de oferte il opreste. „Publicarea
   * automata se degradeaza tacit in publicare manuala" — nu e produs pierdut, dar nici ce
   * promite comutatorul.
   *
   * ═══ ⚠ DE CE O INTREBARE, SI NU UN STEAG SCRIS LA CREARE ═══
   *
   * Un steag ar fi trebuit scris in TOATE caile care creeaza produse — panou, import, feed.
   * O cale uitata inseamna acelasi defect, doar mutat. Aici nu se scrie nimic nou nicaieri:
   * se intreaba daca exista un produs activ, facut in ultimele ore, fara nicio oferta eMAG.
   *
   * ⚠ SI FEREASTRA DE TIMP E TOT ROSTUL. Fara ea, prima aprindere a comutatorului ar trimite
   * catalogul intreg la publicare — exact ce s-a intamplat pe 24.08.2026, cand o plasa care
   * nu deosebea „n-a plecat niciodata" de „s-a pierdut o schimbare" a publicat singura 116
   * oferte. Un produs vechi nu poate intra NICIODATA pe aici.
   *
   * ⚠ La zece minute, si numai la magazinele cu `auto_publish` APRINS. Stins, nu se face
   * nimic: publicarea e hotararea omului, nu a noastra.
   */
  let publicariRecuperate = 0;
  if (new Date(inceputulRularii).getMinutes() % 10 === 3) {
    for (const businessId of alegeInRotatie(magazine, MAGAZINE_NEPLECATE, 10)) {
      const ctx = await ctxPentru(businessId);
      if (!ctx || ctx.config.auto_publish !== true) continue;

      /*
       * ═══ ⚠ „APRINS ACUM" NU E „ERA APRINS CAND S-A FACUT PRODUSUL" (25.08.2026) ═══
       *
       * Fereastra de 24 de ore spune cat de departe se uita plasa inapoi. Nu spune de cand
       * are voie sa se uite. Intre cele doua incape asta:
       *
       *   10:00  omul face un produs, cu comutatorul STINS. Nu vrea sa-l publice.
       *   11:00  aprinde comutatorul, gandindu-se la produsele de MAINE.
       *   11:03  plasa vede un produs de acum o ora, fara oferta, la un magazin cu
       *          `auto_publish` aprins — si il trimite la eMAG.
       *
       * Marca `auto_publish_since` se scrie o data, la trecerea stins → aprins, si taie
       * exact asta. E intentia omului, si nu se poate ghici din produse.
       *
       * ⚠ LIPSA INSEAMNA NU, si se trece mai departe TACUT: nu e o pana, e un magazin care
       * n-a aprins niciodata comutatorul de cand exista marca. Functia din baza refuza si
       * ea, dar garda de aici scuteste cererea.
       */
      const deCand = ctx.config.auto_publish_since;
      if (!deCand) continue;

      const { data: noi, error: eNoi } = await admin.rpc("emag_produse_noi_nepublicate", {
        p_business_id: businessId, p_ore: 24, p_limita: 50, p_de_cand: deCand,
      });
      if (eNoi) {
        await logError({
          action: "emag-sync",
          message: `produsele noi nepublicate nu s-au putut citi: ${eNoi.message}`,
          businessId, severity: "warning",
        });
        continue;
      }

      const ids = ((noi ?? []) as { id: string }[]).map((x) => x.id);
      if (ids.length === 0) continue;

      /* ⚠ Prin `publicaPeEmagMany`, nu prin scriere de mana: acolo stau toate regulile —
         magazin conectat, produs care poate intra, fragmentarea id-urilor. */
      const puse = await publicaPeEmagMany(businessId, ids);
      publicariRecuperate += puse;

      /* ⚠ Se SPUNE de fiecare data. Numarul trebuie sa fie zero: daca nu e, inseamna ca
         punerea in coada la crearea produsului se pierde undeva in amonte. */
      if (puse > 0) {
        await logError({
          action: "emag-sync",
          message: `${puse} produse noi n-au ajuns in coada la creare; publicarea automata le-a recuperat`,
          details: { businessId, cate: puse },
          businessId, severity: "warning",
        });
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
   * „use e.g. 12:04:42 instead of 12:00:00” — fiindca atunci suna toata lumea deodata.
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
    /* ⚠ Aceeasi ora, alt tabel: contoarele de ritm ale magazinelor care n-au mai trimis
       nimic de o saptamana. Randul unui magazin ACTIV nu se sterge — recreat la fiecare
       cerere, ar fi insemnat un `insert` in loc de un `update`. Vezi `ritm.ts`. */
    const { error: eRitm } = await admin.rpc("curata_ritm_extern");
    if (eRitm) {
      await logError({
        action: "emag-sync",
        message: `contoarele de ritm n-au putut fi curatate: ${eRitm.message}`,
        severity: "warning",
      });
    }
  }

  return NextResponse.json({
    ok: true, duse, cazute, reconciliate, derivate, comenziNoi, comenziRecuperate, facturi, awburi, retururi, neplecate, jurnalSters, propagari, publicariRecuperate,
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
/**
 * AWB-ul emis cu curierul magazinului, dus si la eMAG.
 *
 * ═══ DE CE O TRECERE, SI NU UN CARLIG PE FIECARE CURIER ═══
 *
 * Sunt cincisprezece coloane de AWB in `orders`, cate una pe curier, si niciun loc comun
 * de dupa emitere. Un carlig pe fiecare ar fi insemnat cincisprezece fire de legat si tot
 * atatea prilejuri de regresie in fluxuri care merg azi.
 *
 * Intrebarea „ce comanda eMAG are AWB si n-are inca atasament" se pune o data, aici, si
 * prinde AWB-urile facute pe ORICE cale: buton, lot, sau numar trecut de mana.
 *
 * ⚠ FEREASTRA E ROTATIVA, ca la facturi: fara ea, primele randuri s-ar intoarce la fiecare
 * trecere si nimic mai nou n-ar fi vazut vreodata. Vezi nota din `urcaFacturile`.
 */
async function urcaAwburile(admin: Admin, ctx: ContextEmag): Promise<number> {
  /*
   * ⚠ SE INTREABA PRIN FUNCTIE, NU PRIN FILTRU (indreptat 25.08.2026).
   *
   * Prima forma cauta `awb_uploaded_at is null`. Prima urcare mergea; a DOUA, nu — dupa ce
   * campul e scris, comanda nu mai era privita NICIODATA. Iar coletele chiar se reemit:
   * adresa gresita, colet pierdut, curier schimbat. eMAG ramanea cu numarul VECHI, si
   * cumparatorul urmarea un AWB care nu mai exista.
   *
   * ⚠ Si nota din `urcaAwbPropriu` spunea limpede ca cheia poarta numarul „ca la o
   * reexpediere sa poata fi urcat din nou". Registrul chiar ingaduia. Planificatorul o
   * anula. O intentie scrisa in cod, taiata de alt cod.
   *
   * Intrebarea corecta e „s-a atins comanda de cand m-am uitat ultima oara" — o comparatie
   * intre `orders.updated_at` si `emag_orders.awb_uploaded_at`, deci doua tabele, deci nu
   * se poate scrie in PostgREST.
   *
   * ⚠ SI NU MAI E NEVOIE DE FEREASTRA ROTATIVA: functia intoarce cele mai VECHI neatinse,
   * iar stampila le scoate din bazin. Se goleste singura, deci nu mai exista riscul ca
   * lucrul nou sa astepte in spatele unui teanc care nu se termina.
   */
  const { data: candidati, error: eLista } = await admin.rpc("emag_comenzi_de_verificat_awb", {
    p_business_id: ctx.businessId,
    p_limita: AWB_PE_TRECERE,
    p_de_la: 0,
  });

  if (eLista) {
    await logError({
      action: "emag-sync",
      message: `comenzile de verificat pentru AWB nu s-au putut citi: ${eLista.message}`,
      businessId: ctx.businessId,
      severity: "warning",
    });
    return 0;
  }

  const randuri = candidati ?? [];
  if (randuri.length === 0) return 0;

  /* Numerele de AWB stau pe `orders`, in optsprezece coloane. Se citesc o data, pentru tot
     teancul, cu lista tinuta intr-un singur loc — vezi `CAMPURI_AWB_DE_CITIT`. */
  const ids = randuri.map((r) => r.order_id).filter((x): x is string => !!x);
  const { data: comenzi, error: eComenzi } = await admin.from("orders")
    .select(`id, order_number, ${CAMPURI_AWB_DE_CITIT}`)
    .eq("business_id", ctx.businessId)
    .in("id", ids);

  if (eComenzi) {
    await logError({
      action: "emag-sync",
      message: `numerele de AWB nu s-au putut citi: ${eComenzi.message}`,
      businessId: ctx.businessId,
      severity: "warning",
    });
    return 0;
  }

  const peId = new Map<string, Record<string, unknown>>(
    ((comenzi ?? []) as unknown as Record<string, unknown>[]).map((o) => [String(o.id), o]),
  );

  const acum = () => new Date().toISOString();
  let urcate = 0;

  for (const r of randuri) {
    if (!r.order_id || !r.emag_order_id) continue;

    /*
     * ⚠ SE SARE PESTE CE S-A URCAT DEJA, si asta e reparatia (25.08.2026).
     *
     * Alegerea mergea pe ordinea fixa a coloanelor, cu FAN primul. Un comerciant care renunta
     * la FAN si emite GLS ramanea cu FAN123 ales pe veci — iar comparatia „acelasi numar"
     * spunea „nimic nou", deci GLS999 nu ajungea NICIODATA la eMAG.
     */
    const dejaUrcate = r.awb_uploaded_numbers ?? [];
    const awb = awbPropriuAlComenzii(peId.get(r.order_id), dejaUrcate);

    /*
     * ⚠ FARA AWB: se STAMPILEAZA, dar fara numar. Altfel comanda ar fi ramas in bazin si ar
     * fi fost recitita la fiecare trecere pana cand primeste unul — iar teancul acela creste
     * cu fiecare comanda neexpediata. Stampila spune „m-am uitat"; numarul gol spune „n-am
     * urcat nimic", deci cand chiar apare un AWB, comparatia de mai jos il vede ca schimbare.
     */
    if (!awb) {
      /* ⚠ Aici intra DOUA cazuri, si amandoua se stampileaza: comanda n-are inca niciun AWB,
         sau toate cele prezente sunt deja urcate. In al doilea caz stampila e chiar ce
         opreste ciclul — cu un singur numar tinut minte, doua AWB-uri s-ar fi urcat pe rand
         la nesfarsit, fiecare scotandu-l pe celalalt. */
      await admin.from("emag_orders")
        .update({ awb_uploaded_at: acum() }).eq("id", r.id);
      continue;
    }

    /* ⚠ AWB-ul emis PRIN ei nu se trimite inapoi la ei. */
    const { data: alNostru, error: eAlNostru } = await admin.from("emag_awb")
      .select("awb_number").eq("business_id", ctx.businessId).eq("order_id", r.order_id)
      .eq("awb_number", awb.awb).maybeSingle();
    /* ⚠ O CITIRE PICATA NU INSEAMNA „nu e AWB emis prin ei". Luata drept negasire, am fi
       atasat inapoi la eMAG chiar AWB-ul emis DE eMAG. Registrul ar fi oprit al doilea
       document, dar regula casei e ca o eroare de baza nu se citeste ca lipsa. */
    if (eAlNostru) {
      await logError({
        action: "emag-sync",
        message: `nu s-a putut verifica daca AWB-ul e emis prin eMAG: ${eAlNostru.message}`,
        details: { orderId: r.order_id, awb: awb.awb },
        businessId: ctx.businessId,
        severity: "warning",
      });
      continue;
    }
    if (alNostru) {
      await admin.from("emag_orders")
        .update({
          awb_uploaded_at: acum(), awb_uploaded_number: awb.awb,
          /* ⚠ SE ADAUGA in multime, nu se inlocuieste: altfel „deja urcat" s-ar uita. */
          awb_uploaded_numbers: [...new Set([...dejaUrcate, awb.awb])],
        } as never).eq("id", r.id);
      continue;
    }

    const rez = await urcaAwbPropriu(admin, ctx, {
      orderId: r.order_id,
      emagOrderId: r.emag_order_id,
      /* ⚠ 3 ca ultima plasa, aceeasi alegere ca la factura: atasamentele sunt ingaduite si
         pe FBE, iar vanzatorul e cazul coplesitor. */
      tipComanda: (r.order_type === 2 ? 2 : 3),
      numarComanda: String((peId.get(r.order_id)?.order_number as string) ?? `EMAG-${r.emag_order_id}`),
      awb,
    });

    if (rez.fel === "urcat" || rez.fel === "deja") {
      urcate += rez.fel === "urcat" ? 1 : 0;
      /* ⚠ SE SCRIE SI NUMARUL, si asta e cheia reparatiei: fara el, urmatoarea trecere
         n-ar avea cu ce compara si ori ar reurca acelasi document, ori n-ar mai veni. */
      await admin.from("emag_orders")
        .update({
          awb_uploaded_at: acum(), awb_uploaded_number: awb.awb,
          /* ⚠ SE ADAUGA in multime, nu se inlocuieste: altfel „deja urcat" s-ar uita. */
          awb_uploaded_numbers: [...new Set([...dejaUrcate, awb.awb])],
        } as never).eq("id", r.id);
    } else if (rez.fel === "esuat") {
      /* ⚠ NU se stampileaza: un esec dovedit merita reincercat. Registrul opreste oricum un
         al doilea document daca primul chiar a plecat. */
      await logError({
        action: "emag-sync",
        message: `AWB-ul curierului propriu nu s-a urcat: ${rez.mesaj}`,
        details: { orderId: r.order_id, awb: awb.awb, curier: awb.curier },
        businessId: ctx.businessId,
        severity: "warning",
      });
    }
  }

  return urcate;
}

async function urcaFacturile(admin: Admin, ctx: ContextEmag): Promise<number> {
  /*
   * ═══ ⚠ FEREASTRA SE ROTESTE, ALTFEL ZECE COMENZI BLOCHEAZA TOT (24.08.2026) ═══
   *
   * Forma dinainte era `.order("created_at").limit(10)` — deterministica. Iar o comanda
   * FARA factura emisa in Edinio intoarce `fara_factura`, care — dinadins, vezi nota de
   * mai jos — nu se marcheaza si nu se raporteaza.
   *
   * Deci aceleasi zece randuri se intorceau la fiecare trecere, la nesfarsit, si nicio
   * comanda mai noua nu era vazuta VREODATA. Se inchide la a zecea comanda nefacturata
   * si nu se mai deschide singur niciodata.
   *
   * ⚠ CE COSTA: eMAG cere factura urcata dupa livrare. Nici blocajul, nici lipsa in sine
   * n-aveau vreo suprafata: `invoice_uploaded_at` era scris si citit EXCLUSIV de filtrul
   * de aici. Comerciantul ar fi aflat cand i-o cer ei.
   *
   * Fereastra rotativa e chiar tiparul casei (§7.5), scris dupa incidentul Trendyol unde
   * doua rulari intorceau ACELEASI 60 de randuri din 1051.
   */
  const { count: bazin, error: eBazin } = await admin.from("emag_orders")
    .select("id", { count: "exact", head: true })
    .eq("business_id", ctx.businessId)
    .is("invoice_uploaded_at", null)
    .not("order_id", "is", null);

  /*
   * ⚠ SI NUMARATOAREA SE CITEA ORBESTE (25.08.2026). Nota de mai jos explica exact
   * defectul asta — pentru citirea de DEDESUBT — si nu-l vedea la cea de DEASUPRA ei, la
   * optsprezece linii distanta. E `count`, nu `data`, dar e aceeasi confuzie: `bazin ?? 0`
   * facea dintr-o citire picata un „nicio comanda fara factura", si pasul se intorcea cu 0
   * fara sa scrie nimic nicaieri.
   *
   * De aceea disciplina nu poate fi „am reparat linia care s-a vazut": se cauta TIPARUL,
   * in toata functia.
   */
  if (eBazin) {
    await logError({
      action: "emag-sync",
      message: `cate comenzi n-au factura nu s-a putut afla: ${eBazin.message}`,
      businessId: ctx.businessId,
      severity: "warning",
    });
    return 0;
  }

  const cate = bazin ?? 0;
  if (cate === 0) return 0;

  /* ⚠ Tura avanseaza o data la cinci minute, cat ritmul pasului: cu alt numitor,
     fereastra ar sari peste randuri in loc sa treaca prin ele pe rand. */
  const tura = Math.floor(Date.now() / 60_000 / 5);
  const de_la = cate <= FACTURI_PE_TRECERE ? 0 : (tura * FACTURI_PE_TRECERE) % cate;

  /* ⚠ Citita orbeste, o pana a bazei dadea lista goala — adica exact ce da „nicio comanda
     fara factura". Nu se pierde nimic (randul nu se marcheaza), dar pasul ruleaza doar la
     `% 5 === 0` si pe magazine in rotatie, deci „urmatoarea incercare" pentru ACELASI
     magazin nu e peste un minut, ci peste o tura intreaga. Merita spus. */
  const { data, error: eComenzi } = await admin.from("emag_orders")
    .select("id, order_id")
    .eq("business_id", ctx.businessId)
    .is("invoice_uploaded_at", null)
    .not("order_id", "is", null)
    .order("created_at", { ascending: true })
    .range(de_la, de_la + FACTURI_PE_TRECERE - 1);

  if (eComenzi) {
    await logError({
      action: "emag-sync",
      message: `comenzile fara factura nu s-au putut citi: ${eComenzi.message}`,
      businessId: ctx.businessId,
      severity: "warning",
    });
    return 0;
  }

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
     * ⚠ „Fara factura” NU se marcheaza si NU se raporteaza ca eroare. Inseamna doar
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

/**
 * Amprentele de continut ale unei felii din catalogul magazinului.
 *
 * ⚠ FELIE ROTATIVA, si `pas = 10` la rotatie fiindca pasul ruleaza o data la zece minute.
 * Cu `pas = 1`, tura s-ar fi schimbat in fiecare MINUT, deci fereastra ar fi sarit cu zece
 * felii intre doua rulari si ar fi lasat neatinse cele mai multe produse — chiar greseala
 * reparata la retururi.
 *
 * ⚠ Se citesc numai produsele care CHIAR pot avea o schimbare neplecata: cele cu o oferta
 * pornita si trimisa candva. Ofertele nepublicate n-au ce pierde, si publicarea lor e
 * hotararea comerciantului, nu a plasei.
 */
async function amprenteleFeliei(
  admin: Admin, businessId: string,
): Promise<Record<string, string>> {
  const { data: randuri, error: eRanduri } = await admin.from("emag_offers")
    .select("product_id")
    .eq("business_id", businessId)
    .eq("auto_sync", true)
    .not("last_synced_at", "is", null)
    .not("product_id", "is", null)
    .order("emag_id", { ascending: true })
    .limit(FELIE_AMPRENTE * 4);

  if (eRanduri) {
    await logError({
      action: "emag-sync",
      message: `felia pentru amprente nu s-a putut citi: ${eRanduri.message}`,
      businessId,
      severity: "warning",
    });
    return {};
  }

  const ids = [...new Set(
    ((randuri ?? []) as { product_id: string | null }[])
      .map((r) => r.product_id).filter((x): x is string => !!x),
  )];
  if (ids.length === 0) return {};

  const feliaAsta = alegeInRotatie(ids, FELIE_AMPRENTE, 10);
  if (feliaAsta.length === 0) return {};

  const iesire: Record<string, string> = {};
  for (const bucata of bucatiDeIduri(feliaAsta)) {
    const { data: produse, error: eProduse } = await admin.from("products")
      .select("id, name, description, category, sku, weight_grams, is_active, images, page_sections")
      .eq("business_id", businessId).in("id", bucata);

    /* ⚠ O citire picata NU inseamna „nimic schimbat": se raspunde cu ce s-a strans pana
       acum, iar produsele nemasurate raman in afara hartii — si functia din baza le sare
       anume, in loc sa le socoteasca „schimbate". */
    if (eProduse) {
      await logError({
        action: "emag-sync",
        message: `produsele feliei nu s-au putut citi: ${eProduse.message}`,
        businessId,
        severity: "warning",
      });
      break;
    }

    for (const p of (produse ?? []) as ProdusDeCartografiat[]) {
      iesire[p.id] = amprentaContinutului(p);
    }
  }
  return iesire;
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
   * e cel pe care si l-a pus el, nu o derivare de reparat. „Reparata”, i-am fi
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
       * mai obisnuita la citire) iesea cu ZERO. Deci: „la ei 0, la noi 40”, de doua ori
       * la rand, si porneam sa reparam o derivare care nu exista.
       *
       * ⚠ Nu e doar o eticheta gresita, ca la `scrieStatusurile`: sunt SCRIERI catre
       * eMAG, care ard din cele 3 cereri pe secunda ale magazinului si rescriu un stoc
       * pe care comerciantul poate il tine anume altfel in panoul lor.
       *
       * ⚠ `null` cand nu stim NIMIC despre stocul lor ramane: `stocDeImportat` intoarce
       * 0 si pentru „zero adevarat”, si pentru „lipseste”. Deosebirea conteaza — un zero
       * adevarat E o derivare, o lipsa nu e — deci se pastreaza intrebarea de dinainte
       * despre forma raspunsului, si abia apoi se socoteste ca la import.
       */
      const stiuStocul = Array.isArray(aLor.stock) || Number.isFinite(aLor.general_stock);
      const stocLor = stiuStocul ? stocDeImportat(aLor) : null;

      /* ⚠ Fara pret de-al nostru nu se masoara NIMIC, nici macar stocul luat separat.
         Pus pe zero „ca sa avem o valoare”, fiecare oferta ar fi aratat o derivare de
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
 * aratat „în validare” la nesfarsit pentru produse aprobate demult.
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

  /* ⚠ Citita orbeste, o pana dadea `vechi = null`, iar `sAuSchimbat(null, noi)` aprinde
     alarma „eMAG si-a schimbat lista de IP-uri" pentru o lista care n-a miscat. O alarma
     falsa la o schimbare care nu s-a intamplat e mai rea decat tacerea: data viitoare
     nimeni n-o mai citeste. */
  const { data, error: eVechi } = await admin.from("platform_settings")
    .select("value").eq("key", CHEIE_IPURI).maybeSingle();
  if (eVechi) {
    await logError({
      action: "emag-sync.ipuri",
      message: `lista veche de IP-uri nu s-a putut citi: ${eVechi.message}`,
      severity: "warning",
    });
    return;
  }
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
