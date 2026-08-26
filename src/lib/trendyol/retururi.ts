import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { approveClaimItems, getClaims, isTrendyolError, rejectClaimItems } from "./client";
import type { TrendyolSyncContext } from "./sync";
import { TRENDYOL_DEFAULT_STOREFRONT, type TrendyolClaim, type TrendyolStoreFront } from "./types";
import {
  coletDeTrimisInapoi, dovadaCeruta, idCererii, idPachetului, liniileReturului,
  nuSeTrimiteInapoi, sePoateHotari, STARI_DE_HOTARAT, stareaCererii,
} from "./retur-forma";
import { randCitit, randuriCitite } from "@/lib/supabase/rand-citit";
import { patchTrendyolConfig } from "./config";

/**
 * Retururile Trendyol, aduse la noi si hotarate din panoul nostru.
 *
 * ═══ ⚠ CE STIAM PANA AZI ═══
 *
 * Doar atat: pachetul are statusul `Returned`. Din el nu se poate afla nimic din ce conteaza —
 * ce articol s-a intors, cate bucati, de ce, daca cererea asteapta o hotarare, si daca e o
 * inlocuire in loc de restituire. Comerciantul afla din panoul LOR si decidea acolo.
 *
 * ═══ ⚠ SI DE CE STOCUL NU SE REPUNE SINGUR NICI DE AICI ═══
 *
 * Aceeasi hotarare ca la eMAG, luata cu o zi inainte: marfa intoarsa nu e mereu vandabila.
 * Vine desfacuta, zgariata, incompleta, sau pur si simplu alta decat cea trimisa. Un retur
 * ACCEPTAT inseamna ca banii se intorc, nu ca produsul e bun de pus la loc pe raft.
 *
 * ⚠ Iar retururile Trendyol sunt PARTIALE: `quantity` pe linie poate fi mai mic decat cat s-a
 * cumparat, si se pot intoarce doar unele linii. Un „pune inapoi toata comanda" ar fi gresit
 * de doua ori.
 *
 * Deci omul apasa „Am primit marfa si e buna", pe linia si cantitatea lui, iar `repus_in_stoc_la`
 * tine minte — a doua apasare nu mai adauga inca o data.
 */

type Db = SupabaseClient<Database>;

/** Cat de mult inapoi se cere la prima trecere, cand n-avem marcaj. */
const FEREASTRA_INITIALA_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Cea mai lata fereastra ceruta intr-o trecere.
 *
 * ⚠ E PRECAUTIA NOASTRA, NU REGULA LOR (26.08.2026). Pana azi scria aici ca fereastra e de cel
 * mult doua saptamani „ca la comenzi" si ca peste atat raspund 400. La COMENZI asta chiar e
 * scris; la retururi NU e scris nicaieri — in OpenAPI `startDate` si `endDate` sunt
 * `required: false`, si singurul „maximum" din toata pagina e cel de la `size`.
 *
 * ⚠ SE PASTREAZA CIFRA, dar se numeste ce este. O fereastra larga nu strica nimic daca ei o
 * accepta, si ne apara daca n-o accepta — iar `latimeUrmatoare` o ingusteaza oricum de indata ce
 * paginile nu incap. Ce nu e in regula e sa lasam scrisa ca a lor o margine care e a noastra:
 * cine citeste comentariul mai tarziu ia o presupunere drept fapt.
 */
const FEREASTRA_MAXIMA_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Cat de mult in urma se mai pot cere cererile de retur.
 *
 * ⚠ ALT PLAFON DECAT LATIMEA FERESTREI, si tot al nostru. Pentru retururi ei nu scriu niciun
 * orizont — nici cat de mult in urma se poate cere, nici cat tin cererile. Trei luni e cifra pe
 * care o dau la fluxul de comenzi, si se ia aceeasi ca sa nu pornim de la ani intregi cand un
 * magazin a stat oprit. Daca s-ar dovedi prea scurta, se lungeste; deocamdata e o margine
 * aleasa, nu una citita.
 */
const ORIZONT_RETURURI_MS = 90 * 24 * 60 * 60 * 1000;

/** ⚠ Plafonul LOR pentru explicatia respingerii. Peste el, cererea e refuzata intreaga. */
const MAX_EXPLICATIE = 500;

/** Cate pagini se citesc intr-o trecere, cat timp fereastra se mai poate ingusta. */
const PAGINI_PE_TRECERE = 3;

/**
 * Cate pagini se citesc cand fereastra e DEJA la minim si tot nu incape.
 *
 * ⚠ EXISTA CA SA NU SE BLOCHEZE DE TOT. Vezi nota lunga de la `laStramtoare`: ingustarea are un
 * fund, iar pe fundul ala „mai ingusteaza" nu mai inseamna nimic. Atunci se citeste MAI MULT, nu
 * mai putin. `page` n-are plafon documentat, iar citirea cererilor are un buget larg (1000/minut).
 */
const PAGINI_LA_STRAMTOARE = 20;

/**
 * Cat timp se mai citeste, la podea, cand stim din `totalPages` ca mai e.
 *
 * ═══ ⚠ NICIO RAMURA NU MAI SPUNE „N-AM CITIT TOT, DAR AVANSEZ" (26.08.2026) ═══
 *
 * Aici a fost un plafon de 200 de pagini, iar dincolo de el marcajul TRECEA MAI DEPARTE, cu o
 * eroare `critical`. Adica pierdere de date — improbabila, dar scrisa in cod. Un pas care aduce
 * retururi n-are voie sa aiba o asemenea ramura deloc.
 *
 * ⚠ ACUM SE CITESTE PANA LA `totalPages`, oricat ar fi. Singura margine e TIMPUL, fiindca un cron
 * are un buget de secunde, nu de ore — iar cand bugetul se termina, MARCAJUL RAMANE PE LOC si
 * trecerea urmatoare reia. Nu se pierde nimic, doar se intarzie.
 *
 * ⚠ SI CA SA NU SE REIA LA NESFARSIT ACELASI LUCRU, fereastra se ingusteaza mai departe, sub
 * podeaua obisnuita, pana la `FEREASTRA_ULTIMA_MS`. Cu fiecare trecere e mai mica, deci la un
 * moment dat incape in buget — si atunci se citeste tot si marcajul avanseaza cinstit.
 */
const BUGET_MS_LA_PODEA = 20_000;

/**
 * Cea mai ingusta fereastra la care se poate coborî, cand nici podeaua obisnuita nu incape.
 *
 * ⚠ Un minut inseamna ca ar trebui sa se creeze peste zece mii de cereri de retur INTR-UN MINUT
 * la un singur magazin ca sa nu incapa nici asa. Sub atat n-are ce cauta: cererile au marci de
 * timp discrete, iar o fereastra si mai mica nu mai desparte nimic.
 */
const FEREASTRA_ULTIMA_MS = 60 * 1000;

/**
 * Cate cereri pe pagina.
 *
 * ⚠ 50 E IMPLICITUL LOR PE AMANDOUA RAMURILE, si de-aia ramane 50. Plafonul de 200 e scris
 * NUMAI in referinta turceasca (`"default": 50, "maximum": 200`); in variantele Europa si Golf
 * blocul e identic intre ele si n-are `maximum` deloc. Toate vitrinele noastre sunt europene,
 * deci un 200 acolo ar fi o presupunere netestata pe un capat de la care depinde ca un
 * comerciant afla ca are un retur de rezolvat. Adancimea se ia din `page`, care e documentat
 * fara plafon, nu dintr-un `size` ghicit.
 */
const PE_PAGINA = 50;

/**
 * Cea mai ingusta fereastra la care coboram.
 *
 * ═══ ⚠ PODEAUA E CHIAR LOCUL UNDE SE PIERD DATE, DECI SE PUNE JOS (26.08.2026) ═══
 *
 * A fost o ora, cu explicatia „sub o ora n-are rost". Numai ca podeaua e singurul loc din tot
 * pasul unde se poate pierde ceva: ajunsi acolo cu paginile pline, marcajul trece mai departe si
 * coada ferestrei ramane necitita. Cu cat podeaua e mai jos, cu atat cazul ala e mai departe.
 *
 * Socoteala, la 20 de pagini a 50 de cereri:
 *
 *     podea de o ora    ->  se pierde ceva peste 1.000 de cereri intr-o ORA la un magazin
 *     podea de 5 minute ->  se pierde ceva peste 1.000 de cereri in 5 MINUTE (12.000/ora)
 *
 * ⚠ SI INGUSTAREA CASTIGA DE DOUASPREZECE ORI MAI MULT LOC inainte sa dea de fund — adica de
 * douasprezece ori mai multe sanse sa incapa fara sa piarda nimic.
 *
 * ⚠ CE COSTA: o fereastra ingusta acopera mai putin, deci un magazin ramas in urma ar avea de
 * facut mai multe treceri. Dar largirea e geometrica (×2 la fiecare trecere incaputa), deci de
 * la 5 minute pana inapoi la doua saptamani sunt vreo douasprezece treceri — doua ore. Si numai
 * in cazul in care s-a ingustat pana la fund, care n-a aparut niciodata.
 */
const FEREASTRA_MINIMA_MS = 5 * 60 * 1000;

function laData(ms: unknown): string | null {
  const n = Number(ms);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
}

/**
 * Aduce cererile de retur si le scrie la noi.
 *
 * ⚠ NU HOTARASTE NIMIC. Nici nu aproba, nici nu respinge, nici nu atinge stocul: aduce si
 * arata. Hotararea e a comerciantului, si trece prin `hotarasteRetur`.
 */
export async function aduRetururile(
  admin: Db, ctx: TrendyolSyncContext, marcajMs?: number,
  /**
   * Cat de lata sa fie fereastra ceruta.
   *
   * ⚠ EXISTA CA SA SE POATA INGUSTA. Vezi nota lunga de la `ok = false`: fara ea, un magazin cu
   * peste 150 de cereri intr-o fereastra ramanea blocat pe primele 150, la nesfarsit.
   */
  latimeCeruta?: number,
): Promise<{ aduse: number; ok: boolean; fereastraSfarsitMs: number; latimeUrmatoare?: number }> {
  const acum = Date.now();
  /* ⚠ Suprapunere de cinci minute peste marcaj: ceasul lor si al nostru nu bat la fel, iar o
     cerere modificata chiar in secunda marcajului ar cadea intre doua ferestre. */
  /*
   * ⚠ DOUA PLAFOANE, NU UNUL. Latimea unei cereri e de cel mult doua saptamani; cat de mult in
   * urma se poate cere e alta socoteala. Confundate, un magazin oprit o luna pornea de la
   * `acum - 14 zile` si pierdea restul.
   */
  /*
   * ⚠ SUPRAPUNEREA SE APLICA O SINGURA DATA (26.08.2026).
   *
   * Marcajul se SCRIE deja compensat cu cinci minute (vezi `treceRetururile`). Scazute inca o
   * data aici, ieseau zece minute de suprapunere la fiecare trecere. Nu se pierdea nimic —
   * upsert-urile fac recitirea sigura — dar erau cereri si munca degeaba, la fiecare zece minute,
   * pentru totdeauna.
   */
  const cerut = Number.isFinite(marcajMs) && marcajMs
    ? marcajMs
    : acum - FEREASTRA_INITIALA_MS;
  const celMaiDevreme = acum - ORIZONT_RETURURI_MS;
  const taiat = cerut < celMaiDevreme;
  const de_la = Math.min(Math.max(cerut, celMaiDevreme), acum);

  /*
   * ═══ ⚠ SI SFARSITUL SE TAIE, NU DOAR INCEPUTUL (26.08.2026) ═══
   *
   * Aceeasi gaura ca la comenzi, si tot atat de tacuta. Un magazin oprit o luna cerea ultimele
   * doua saptamani — cat cerem noi intr-o trecere, vezi `FEREASTRA_MAXIMA_MS` — dar dupa o trecere reusita marcajul
   * sarea la „acum". Cele saisprezece zile dintre ele nu se mai citeau NICIODATA.
   *
   * ⚠ Fereastra e acum cel mult doua saptamani de la inceputul EI, iar marcajul se opreste la
   * sfarsitul ei adevarat. Trecerea urmatoare porneste de-acolo, fereastra cu fereastra, pana
   * se ajunge din urma.
   */
  /*
   * ⚠ MARGINEA DE JOS E `FEREASTRA_ULTIMA_MS`, NU PODEAUA OBISNUITA (26.08.2026).
   *
   * Aici scria `FEREASTRA_MINIMA_MS`, si ar fi facut degeaba toata ingustarea de sub podea: o
   * fereastra ceruta de un minut ar fi fost ridicata inapoi la cinci, deci trecerea urmatoare ar
   * fi dat de acelasi perete si ar fi ramas acolo pe veci.
   *
   * ⚠ Podeaua obisnuita ramane unde e — vezi `stransa` mai jos, care nu coboara sub ea. Sub podea
   * se ajunge NUMAI pe calea bugetului epuizat, adica atunci cand chiar nu incape altfel.
   */
  const latime = Math.min(
    Math.max(latimeCeruta ?? FEREASTRA_MAXIMA_MS, FEREASTRA_ULTIMA_MS),
    FEREASTRA_MAXIMA_MS,
  );
  const pana_la = Math.min(de_la + latime, acum);

  if (taiat) {
    /* ⚠ O pierdere pe care n-o putem evita se SPUNE. Ascunsa, comerciantul ar crede ca are toate
       cererile de retur — si le-ar pierde pe cele mai vechi fara sa afle vreodata. */
    await logError({
      action: "trendyol/retururi",
      /* ⚠ Orizontul de trei luni e MARGINEA NOASTRA, nu regula lor — vezi `ORIZONT_RETURURI_MS`.
         Mesajul spunea „cat tin ei cererile", adica exact tiparul reparat azi la fereastra. */
      message: "sincronizarea a lipsit mai mult decat cerem noi in urma; retururile mai vechi nu se aduc",
      details: {
        ultimaSincronizare: marcajMs ? new Date(marcajMs).toISOString() : null,
        seCitesteDeLa: new Date(de_la).toISOString(),
        vitrina: ctx.auth.storefront ?? null,
      },
      businessId: ctx.businessId, severity: "critical",
    });
  }

  let aduse = 0;
  let ok = true;

  /*
   * ═══ ⚠ INGUSTAREA ARE UN FUND, SI PE FUND SE STATEA PE LOC (26.08.2026) ═══
   *
   * Vezi nota de mai jos de la `pagina + 1 >= paginiDeCitit`: cand fereastra nu incape in
   * paginile citite, se ingusteaza si se reia. Dar `stransa` nu coboara sub `FEREASTRA_MINIMA_MS`.
   *
   * ⚠ DECI LA FUND SE INTORCEA `latimeUrmatoare === latime`, la nesfarsit. Aceeasi fereastra de-o
   * ora, aceleasi trei pagini, `ok = false` de fiecare data, marcajul nemiscat — reparatia de
   * dimineata reintrodusa exact acolo unde nu mai avea unde sa ingusteze. Un magazin cu peste 150
   * de cereri intr-o ora nu mai citea NICIODATA nimic, nici macar retururile de maine.
   *
   * ⚠ CAND NU MAI POTI INGUSTA, CITESTE MAI MULT. Douazeci de pagini pe o fereastra de CINCI
   * MINUTE inseamna o mie de cereri in cinci minute la un singur magazin — iar de-acolo bucla se
   * intinde pana la `totalPages`, marginita doar de timp. `page` n-are plafon documentat, iar
   * citirea are 1000 de cereri pe minut — deci calea asta e ieftina si e deschisa.
   */
  const laStramtoare = latime <= FEREASTRA_MINIMA_MS;
  /* ⚠ Ceasul bugetului porneste ODATA cu bucla, nu la prima pagina: si citirea primei pagini
     costa timp, iar un buget care nu-l numara ar fi mai mare decat spune. */
  const inceputulCitirii = Date.now();
  /*
   * ⚠ SE INTINDE DUPA CE AFLAM CAT E DE CITIT. Prima pagina ne aduce `totalPages`; de-acolo, la
   * podea, se merge pana la capatul pe care ni-l spun ei, marginit doar de timp. Vezi
   * `BUGET_MS_LA_PODEA`.
   */
  let paginiDeCitit = laStramtoare ? PAGINI_LA_STRAMTOARE : PAGINI_PE_TRECERE;

  for (let pagina = 0; pagina < paginiDeCitit; pagina++) {
    const res = await getClaims(ctx.auth, { startDate: de_la, endDate: pana_la, page: pagina, size: PE_PAGINA });
    if (isTrendyolError(res)) {
      await logError({
        action: "trendyol/retururi",
        message: `cererile de retur nu s-au putut citi: ${res.error}`,
        details: { pagina, status: res.status, vitrina: ctx.auth.storefront ?? null },
        businessId: ctx.businessId, severity: "warning",
      });
      /* ⚠ Marcajul NU avanseaza: fereastra se reia. */
      return { aduse, ok: false, fereastraSfarsitMs: pana_la, latimeUrmatoare: latime };
    }

    const continut = res.data?.content ?? [];
    for (const c of continut) {
      const idCerere = idCererii(c);
      if (!idCerere) continue;
      const scris = await scrieCererea(admin, ctx, c, idCerere);
      if (!scris) { ok = false; continue; }
      aduse++;
    }

    const totalPagini = Math.max(1, Number(res.data?.totalPages ?? 1));

    /* ⚠ La podea, bucla se intinde pana la capatul pe care ni-l spun EI — nu pana la o cifra
       scrisa de noi. `totalPages` vine in fiecare raspuns, deci nu se ghiceste nimic. */
    if (laStramtoare && totalPagini > paginiDeCitit) paginiDeCitit = totalPagini;

    if (continut.length === 0 || pagina + 1 >= totalPagini) {
      /*
       * ⚠ A INCAPUT TOT. Fereastra se poate LARGI inapoi, incet: un varf de retururi trece, si
       * n-are rost sa ramanem pe ferestre de cinci minute pentru totdeauna.
       */
      return {
        aduse, ok, fereastraSfarsitMs: pana_la,
        latimeUrmatoare: Math.min(latime * 2, FEREASTRA_MAXIMA_MS),
      };
    }

    /*
     * ═══ ⚠ „NU MUT MARCAJUL" NU E ACELASI LUCRU CU „VOI PROGRESA" (26.08.2026) ═══
     *
     * Cand fereastra are mai multe pagini decat citim intr-o trecere, `ok = false` opreste
     * marcajul — corect, altfel cererile necitite ar ramane in urma lui.
     *
     * ⚠ DAR RETURURILE N-AU CURSOR. Comenzile au: acolo `cursorMs` tine minte pana unde s-a
     * ajuns si trecerea urmatoare continua. Aici, trecerea urmatoare relua paginile 0, 1, 2 —
     * ACELEASI. Un magazin cu peste 150 de cereri intr-o fereastra ramanea blocat pe primele
     * 150 pentru totdeauna, iar restul nu se citeau NICIODATA.
     *
     * ⚠ SI NU SE POATE FACE CURSOR TEMPORAL AICI. `getClaims` n-are parametru de sortare
     * documentat, deci ordinea paginilor nu e garantata; un cursor cladit pe ea ar fi sarit
     * peste cereri fara sa se vada.
     *
     * ⚠ DECI SE INGUSTEAZA FEREASTRA. Stim din `totalPages` cat de mult depaseste, deci taiem
     * proportional, cu o marja. Fereastra mai mica incape, marcajul avanseaza, si se merge mai
     * departe — bucata cu bucata, in loc sa se stea pe loc.
     */
    /* ⚠ La podea se citeste pana la capat SAU pana se termina bugetul de timp — si atunci
       marcajul ramane pe loc. Vezi `BUGET_MS_LA_PODEA`. */
    const faraBuget = laStramtoare && Date.now() - inceputulCitirii > BUGET_MS_LA_PODEA;

    if (pagina + 1 >= paginiDeCitit || faraBuget) {
      /*
       * ⚠ LA PODEA NU SE MAI PIERDE NIMIC. Bucla de deasupra merge pana la `totalPages`, deci
       * aici se ajunge numai cand s-a terminat BUGETUL DE TIMP — vezi `BUGET_MS_LA_PODEA`.
       *
       * ⚠ MARCAJUL RAMANE PE LOC, si asta e toata deosebirea fata de forma de acum o ora: nimic
       * necitit nu ramane in urma lui. Trecerea urmatoare reia aceeasi fereastra, dar mai ingusta
       * — si tot mai ingusta, pana incape in buget. Se intarzie, nu se pierde.
       */
      if (laStramtoare) {
        const siMaiStransa = Math.max(FEREASTRA_ULTIMA_MS, Math.floor((pana_la - de_la) / 4));
        await logError({
          action: "trendyol/retururi",
          message: `fereastra minima are ${totalPagini} pagini si bugetul s-a terminat la ${pagina + 1}: marcajul RAMANE pe loc si fereastra se ingusteaza`,
          details: {
            deLa: new Date(de_la).toISOString(), panaLa: new Date(pana_la).toISOString(),
            totalPagini, citite: pagina + 1,
            latimeVeche: pana_la - de_la, latimeNoua: siMaiStransa,
            vitrina: ctx.auth.storefront ?? null,
          },
          businessId: ctx.businessId, severity: "warning",
        });
        return { aduse, ok: false, fereastraSfarsitMs: pana_la, latimeUrmatoare: siMaiStransa };
      }

      const depasire = totalPagini / paginiDeCitit;
      const stransa = Math.max(
        FEREASTRA_MINIMA_MS,
        Math.floor((pana_la - de_la) / Math.max(2, Math.ceil(depasire * 1.5))),
      );
      await logError({
        action: "trendyol/retururi",
        message: `fereastra are ${totalPagini} pagini si citim ${paginiDeCitit}; se ingusteaza ca sa poata avansa`,
        details: {
          latimeVeche: pana_la - de_la, latimeNoua: stransa,
          vitrina: ctx.auth.storefront ?? null,
        },
        businessId: ctx.businessId, severity: "warning",
      });
      return { aduse, ok: false, fereastraSfarsitMs: pana_la, latimeUrmatoare: stransa };
    }
  }

  return { aduse, ok, fereastraSfarsitMs: pana_la, latimeUrmatoare: latime };
}

/**
 * O trecere intreaga, pe TOATE vitrinele magazinului.
 *
 * ═══ ⚠ ERA UN SINGUR MARCAJ PENTRU TOATE (26.08.2026) ═══
 *
 * Comenzile isi tin de mult pozitia pe fiecare vitrina (`pollPackagesToateVitrinele`), si din
 * motiv temeinic: cu un marcaj comun, o vitrina care cade ii tine pe loc pe celelalte, iar una
 * care merge inainte o poate SARI pe cea cazuta. Retururile aveau exact defectul de care
 * comenzile fusesera aparate.
 *
 * ⚠ CU CROSS-COUNTRY PORNIT, un 429 pe Grecia ar fi impins marcajul comun mai departe, iar
 * retururile grecesti ar fi iesit din fereastra de doua saptamani si nu s-ar mai fi citit
 * NICIODATA — fara nicio eroare, fiindca trecerea „a reusit".
 *
 * ⚠ MARCAJUL VECHI SE CITESTE CA PUNCT DE PLECARE pentru vitrina de origine: fara asta, prima
 * trecere de dupa schimbare ar fi recitit doua saptamani de retururi pe fiecare vitrina.
 */
export async function treceRetururile(
  admin: Db, ctx: TrendyolSyncContext,
): Promise<{ aduse: number }> {
  const inceput = Date.now();
  const origine = (ctx.auth.storefront ?? TRENDYOL_DEFAULT_STOREFRONT) as TrendyolStoreFront;
  const destinatii = (ctx.config.cross_country_storefronts ?? []).filter((v) => v && v !== origine);
  const vitrine: TrendyolStoreFront[] = [origine, ...destinatii];

  const marcaje = { ...(ctx.config.claims_synced_per_storefront ?? {}) };
  const vechi = Date.parse(ctx.config.claims_synced_at ?? "");
  /*
   * ⚠ LATIMEA SE TINE MINTE PE VITRINA. Ingustata doar in memoria unei treceri, n-ar fi folosit
   * la nimic: trecerea urmatoare ar fi cerut iar doua saptamani, ar fi gasit iar prea multe
   * pagini, si tot asa — exact bucla pe care o reparam.
   */
  const latimi = { ...(ctx.config.claims_fereastra_per_storefront ?? {}) };

  let aduse = 0;
  const noi: Record<string, string> = {};
  const latimiNoi: Record<string, number> = {};

  for (const vitrina of vitrine) {
    const ctxVitrina = vitrina === origine
      ? ctx
      : { ...ctx, auth: { ...ctx.auth, storefront: vitrina } };

    const alEi = Date.parse(marcaje[vitrina] ?? "");
    const marcaj = Number.isFinite(alEi) ? alEi
      : (vitrina === origine && Number.isFinite(vechi) ? vechi : undefined);

    const r = await aduRetururile(admin, ctxVitrina, marcaj, latimi[vitrina]);
    aduse += r.aduse;
    if (r.latimeUrmatoare != null) latimiNoi[vitrina] = r.latimeUrmatoare;
    /*
     * ⚠ Fiecare vitrina isi muta marcajul singura, si numai la o trecere intreaga. Un esec pe
     * una nu atinge pozitia celorlalte.
     *
     * ⚠ SI NU MAI DEPARTE DECAT S-A CITIT. Fereastra e taiata la doua saptamani; sarit la
     * „acum", marcajul ar fi lasat in urma o gaura care nu se mai citea niciodata. Se ia cel
     * mai devreme dintre clipa de start si sfarsitul ferestrei.
     */
    if (r.ok) {
      const panaLa = Math.min(inceput, r.fereastraSfarsitMs);
      noi[vitrina] = new Date(panaLa - 5 * 60_000).toISOString();
    }
  }

  if (Object.keys(noi).length > 0 || Object.keys(latimiNoi).length > 0) {
    await patchTrendyolConfig(admin, ctx.businessId, {
      claims_synced_per_storefront: { ...marcaje, ...noi },
      /* ⚠ Se scrie SI cand marcajul n-a avansat: tocmai atunci s-a ingustat fereastra, si
         tocmai atunci trebuie tinuta minte. */
      claims_fereastra_per_storefront: { ...latimi, ...latimiNoi },
      /* Marcajul vechi se tine la zi pentru vitrina de origine: e ce citeste orice cod care
         inca nu stie de cel pe vitrine. */
      ...(noi[origine] ? { claims_synced_at: noi[origine] } : {}),
    });
  }
  return { aduse };
}

/** Scrie o cerere si liniile ei. `false` = ceva n-a mers si marcajul nu are voie sa avanseze. */
async function scrieCererea(
  admin: Db, ctx: TrendyolSyncContext, c: TrendyolClaim, idCerere: string,
): Promise<boolean> {
  /* Comanda noastra, cand o stim. Lipsa ei NU opreste scrierea returului: mai bine un retur
     vizibil fara comanda decat niciunul. */
  let orderId: string | null = null;
  if (c.orderNumber) {
    const rand = randCitit<{ order_id: string | null }>("trendyol.comandaReturului", await admin
      .from("trendyol_orders").select("order_id")
      .eq("business_id", ctx.businessId).eq("order_number", c.orderNumber)
      .not("order_id", "is", null).limit(1).maybeSingle() as never);
    orderId = rand?.order_id ?? null;
  }

  /*
   * ═══ ⚠ UN RETUR DE TIP SCHIMB: IL VEDEM, DAR NU STIM CE SA-I SPUNEM OMULUI ═══
   *
   * `replacementOutboundpackageinfo` apare in raspunsul-exemplu al lui `getClaims`, cu AWB si
   * `packageid`. Cautat in ghidul lor: nicio propozitie despre schimburi, nici despre ce are
   * comerciantul de facut, nici vreun camp care sa deosebeasca un schimb de o restituire.
   *
   * ⚠ NU SE GHICESTE O INSTRUCTIUNE. Aratat ca „trimite un produs de schimb" cand de fapt
   * inseamna altceva, l-am pune sa expedieze marfa degeaba. Tacut cu totul, n-am afla niciodata
   * ca exista.
   *
   * ⚠ SE APRINDE PE TRANZITIE, gol -> plin, ca la deriva eMAG. Scris la fiecare trecere, acelasi
   * rand ar fi umplut jurnalul la cinci minute si l-ar fi facut necitibil taman cand e nevoie de
   * el. Iar coletul poate aparea si DUPA ce stim cererea, deci „numai la prima scriere" ar fi
   * ratat chiar cazul obisnuit.
   */
  const inlocuire = c.replacementOutboundpackageinfo ?? c.replacementOutboundPackageInfo ?? null;
  const stiutInainte = randCitit<{ colet_inlocuire: unknown }>(
    "trendyol.coletulDeInlocuire", await admin
      .from("trendyol_claims").select("colet_inlocuire")
      .eq("business_id", ctx.businessId).eq("claim_id", idCerere).maybeSingle() as never);

  if (inlocuire && typeof inlocuire === "object" && stiutInainte?.colet_inlocuire == null) {
    await logError({
      action: "trendyol/retururi",
      /* ⚠ Nu mai e „nu stim ce sa-i aratam": faptele coletului se arata acum in panou. Ce inca
         nu stim e ce are DE FACUT, fiindca ghidul lor nu pomeneste schimburile deloc. */
      message: "retur de tip SCHIMB: coletul de inlocuire se arata in panou, dar ghidul lor nu spune ce are comerciantul de facut",
      details: { claimId: idCerere, orderNumber: c.orderNumber ?? null, inlocuire },
      businessId: ctx.businessId, severity: "warning",
    });
  }

  const { data: cerere, error: eCerere } = await admin.from("trendyol_claims").upsert({
    business_id: ctx.businessId,
    order_id: orderId,
    claim_id: idCerere,
    order_number: c.orderNumber ?? null,
    shipment_package_id: idPachetului(c),
    /*
     * ═══ ⚠ EI NU TRIMIT NICIUN STATUS LA NIVEL DE CERERE (26.08.2026) ═══
     *
     * Aici scria `c.status ?? null`, iar `status` era un camp pe care nu-l verificase nimeni.
     * VERIFICAT ACUM in raspunsul-exemplu din `reference/getclaims`: nu exista. Starea sta la
     * `items[].claimItems[].claimItemStatus.name`.
     *
     * ⚠ DECI `claim_status` IESEA NULL LA FIECARE CERERE, iar panoul cerea
     * `in("claim_status", [...])` — care nu potriveste niciodata un NULL. Lista „Așteaptă
     * răspunsul tău" ar fi fost GOALA oricat de multe retururi ar fi fost, si nimic n-ar fi
     * aratat a defect. Vezi nota lunga de la `stareaCererii`.
     */
    claim_status: stareaCererii(c),
    /* ⚠ VITRINA DE PE CARE A VENIT. Hotararea trebuie sa plece tot pe ea: Golful are cai
       separate, iar o aprobare trimisa pe calea europeana nu gaseste cererea. */
    storefront: ctx.auth.storefront ?? TRENDYOL_DEFAULT_STOREFRONT,
    /*
     * ⚠ „RESPINS" NU INSEAMNA „GATA". Cand ei creeaza un colet de retur-respins si
     * `dontShipBack` e `false`, comerciantul mai are de EXPEDIAT ceva inapoi la client. Fara
     * randurile astea, panoul i-ar fi spus „respins" si atat.
     *
     * ⚠ `null` inseamna „nu exista colet", nu „false": intreg `rejectedPackageInfo` lipseste
     * din raspuns cand nu s-a creat unul.
     */
    dont_ship_back: nuSeTrimiteInapoi(c),
    colet_respins: (coletDeTrimisInapoi(c) ?? null) as never,
    /* ⚠ Se pastreaza intreg, NU se interpreteaza. Vezi nota de mai sus. */
    colet_inlocuire: inlocuire as never,
    /* ⚠ Raspunsul lor INTREG: forma cererilor nu e in schema pe care o avem. */
    raw: c as never,
    claim_date: laData(c.claimDate),
    last_modified: laData(c.lastModifiedDate),
    updated_at: new Date().toISOString(),
  } as never, { onConflict: "business_id,claim_id" }).select("id").single();

  if (eCerere || !cerere) {
    await logError({
      action: "trendyol/retururi",
      message: `returul nu s-a putut scrie: ${eCerere?.message ?? "rand negasit"}`,
      details: { claimId: idCerere }, businessId: ctx.businessId, severity: "warning",
    });
    return false;
  }

  const claimRowId = (cerere as { id: string }).id;
  for (const l of liniileReturului(c)) {
    const { error: eLinie } = await admin.from("trendyol_claim_items").upsert({
      business_id: ctx.businessId,
      claim_row_id: claimRowId,
      claim_item_id: l.claimItemId,
      order_line_id: l.orderLineId,
      barcode: l.barcode,
      product_name: l.numeProdus,
      quantity: l.cantitate,
      reason: l.motiv,
      customer_note: l.notaClient,
      /* ⚠ Starea LINIEI, nu a cererii: o cerere „in analiza" poate avea deja bucati hotarate. */
      claim_item_status: l.stare,
      raw: l.brut as never,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "business_id,claim_item_id" });
    if (eLinie) {
      await logError({
        action: "trendyol/retururi",
        message: `linia returului nu s-a putut scrie: ${eLinie.message}`,
        details: { claimId: idCerere, claimItemId: l.claimItemId },
        businessId: ctx.businessId, severity: "warning",
      });
      return false;
    }
  }
  return true;
}

/**
 * Comerciantul accepta sau respinge liniile alese.
 *
 * ⚠ NU ATINGE STOCUL. Acceptarea inseamna „banii se intorc", nu „marfa e buna". Repunerea in
 * stoc e o a doua apasare, dupa ce omul se uita la ce a primit — vezi `repuneInStoc`.
 */
export async function hotarasteRetur(
  admin: Db, ctx: TrendyolSyncContext,
  p: {
    claimId: string; claimItemIds: string[]; accepta: boolean;
    motivId?: number; explicatie?: string;
    /**
     * Dovezi pentru respingere: poze cu marfa primita, PDF-uri.
     *
     * ⚠ CERUTE, IN AFARA DE DOUA MOTIVE. Vezi nota lunga de la `MOTIVE_FARA_DOVADA`: schema lor
     * le da ca optionale, ghidul lor le cere („file yüklemek zorunludur"), si se crede ghidul.
     */
    dovezi?: Blob[];
  },
): Promise<{ ok: true } | { error: string }> {
  if (p.claimItemIds.length === 0) return { error: "Alege întâi liniile de retur." };

  /*
   * ═══ ⚠ LINIILE TREBUIE SA FIE CHIAR ALE CERERII ASTEIA (26.08.2026) ═══
   *
   * Panoul tinea o singura lista de bifate peste toate cererile de pe ecran. Cu doua cereri
   * deschise, apasarea pe „Acceptă" de la prima trimitea si liniile bifate la a doua — iar noi
   * le trimiteam mai departe fara sa ne uitam.
   *
   * ⚠ Si scrierea locala se face pe `claim_row_id`, nu doar pe id-uri: altfel ce refuza ei
   * ramane marcat hotarat la noi, si cele doua parti pleaca una de langa alta.
   *
   * ⚠ NU E DOAR IGIENA DE PANOU. Actiunile de server se pot chema cu orice argumente, printr-un
   * POST direct — verificarea trebuie sa fie AICI, nu in ecran.
   */
  const cerere = randCitit<{ id: string; storefront: string | null }>(
    "trendyol.cerereaDeHotarat", await admin
      .from("trendyol_claims").select("id, storefront")
      .eq("business_id", ctx.businessId).eq("claim_id", p.claimId).maybeSingle() as never);
  if (!cerere) return { error: "Returul nu există în magazinul tău." };

  /*
   * ⚠ HOTARAREA PLEACA PE VITRINA DE PE CARE A VENIT RETURUL, nu pe cea de origine a
   * magazinului. Cu Cross-Country pornit, un retur grecesc aprobat pe vitrina romaneasca ar
   * fi cautat o cerere care acolo nu exista — iar Golful are de-a dreptul alte cai (`-gulf`).
   */
  const ctxCerere = cerere.storefront && cerere.storefront !== ctx.auth.storefront
    ? { ...ctx, auth: { ...ctx.auth, storefront: cerere.storefront as TrendyolStoreFront } }
    : ctx;

  const aleCererii = randuriCitite<{ claim_item_id: string; claim_item_status: string | null }>(
    "trendyol.liniileCererii", await admin
      .from("trendyol_claim_items").select("claim_item_id, claim_item_status")
      .eq("business_id", ctx.businessId).eq("claim_row_id", cerere.id) as never);
  const ingaduite = new Set(aleCererii.map((l) => l.claim_item_id));
  const straine = p.claimItemIds.filter((id) => !ingaduite.has(id));
  if (straine.length > 0) {
    await logError({
      action: "trendyol/retururi",
      message: "s-au cerut linii care nu sunt ale returului; hotararea nu s-a trimis",
      details: { claimId: p.claimId, straine: straine.slice(0, 10) },
      businessId: ctx.businessId, severity: "warning",
    });
    return { error: "Unele linii bifate nu sunt din acest retur. Reîncarcă pagina și încearcă din nou." };
  }

  /*
   * ═══ ⚠ SI LINIA TREBUIE SA MAI POATA PRIMI O HOTARARE (26.08.2026) ═══
   *
   * Pana azi se verifica doar ca linia e a cererii — corect, dar nu de ajuns. Nimic nu se uita la
   * STAREA ei, deci se putea trimite o hotarare pentru o linie deja hotarata, sau pentru una unde
   * marfa nici n-a plecat de la client.
   *
   * ⚠ CURSA E ADEVARATA, si nu e teoretica: ecranul arata `WaitingInAction` la 10:00, Trendyol
   * accepta singur la 10:01, iar omul apasa „Respinge" la 10:02. Ghidul lor spune ca rezultatul
   * unei respingeri se urmareste ABIA pe urma, pe `claimItemStatus` — deci nici macar n-am fi
   * aflat pe loc ca n-a prins. Comerciantul ar fi crezut ca a respins; banii plecasera deja.
   *
   * ⚠ TRECE NUMAI `WaitingInAction`, si e regula LOR, scrisa. Vezi `sePoateHotari`: citat verbatim
   * din paginile de aprobare si de respingere, „You can only create a rejection request for
   * returned orders with «WaitingInAction» status." Se opreste si necunoscutul: pe un apel
   * ireversibil, plafonat la 5 pe minut si cu rezultatul vizibil abia mai tarziu, nu se pariaza.
   */
  const stari = new Map(aleCererii.map((l) => [l.claim_item_id, l.claim_item_status]));
  const inchise = p.claimItemIds.filter((id) => !sePoateHotari(stari.get(id)));
  if (inchise.length > 0) {
    await logError({
      action: "trendyol/retururi",
      message: "s-a cerut o hotarare pe linii care nu mai pot primi una; nu s-a trimis nimic",
      details: {
        claimId: p.claimId,
        linii: inchise.slice(0, 10).map((id) => ({ id, stare: stari.get(id) ?? null })),
      },
      businessId: ctx.businessId, severity: "warning",
    });
    /*
     * ⚠ MESAJUL TREBUIE SA SPUNA CARE DIN TREI E. Pleaca pentru orice linie care nu e
     * `WaitingInAction`, iar cele trei cazuri cer trei raspunsuri:
     *
     *   `Created`  returul nici n-a INCEPUT sa astepte — marfa e la client. „Nu MAI asteapta" ar
     *              fi de-a dreptul pe dos.
     *   gol        nu stim nimic; e o asteptare, nu un refuz.
     *   restul     s-a hotarat deja, si nu de aici.
     *
     * ⚠ AL DOILEA CAZ E O REGRESIE PE CARE MI-AM FACUT-O SINGUR acum cateva minute: de cand
     * `marfaAAjuns(null)` intoarce `false`, o linie fara stare cadea in ramura „clientul abia a
     * cerut returul" — un neadevar spus cu incredere. Fail-closed la o functie schimba intelesul
     * fiecarui apel al ei, nu doar pe cel pe care il repari.
     */
    const stariInchise = inchise.map((id) => stari.get(id) ?? null);
    const toate = (f: (s: string | null) => boolean) => stariInchise.every(f);
    return {
      error: toate((x) => x === null)
        ? "Nu am putut confirma încă starea returului la Trendyol. Încearcă din nou după următoarea sincronizare."
        : toate((x) => x === "Created")
          ? "Clientul abia a cerut returul, iar coletul n-a ajuns încă la tine. Nu ai ce răspunde până atunci."
          : "Returul nu mai așteaptă un răspuns de la tine — între timp s-a schimbat. Reîncarcă pagina.",
    };
  }

  if (p.accepta) {
    const res = await approveClaimItems(ctxCerere.auth, p.claimId, p.claimItemIds);
    if (isTrendyolError(res)) return { error: res.error };
  } else {
    /* ⚠ Motivul e cerut de EI, si asa si trebuie: un retur respins fara explicatie ajunge la
       arbitrajul lor, iar acolo tacerea vanzatorului nu ajuta pe nimeni. */
    if (!p.motivId) return { error: "Alege motivul respingerii." };
    const explicatie = (p.explicatie ?? "").trim();
    if (!explicatie) return { error: "Scrie de ce respingi returul." };
    /* ⚠ 500 de caractere e plafonul LOR. Taiata aici, explicatia pleaca; netaiata, cererea e
       refuzata intreaga si comerciantul nu afla de ce. */
    if (explicatie.length > MAX_EXPLICATIE) {
      return { error: `Explicația poate avea cel mult ${MAX_EXPLICATIE} de caractere.` };
    }

    /*
     * ═══ ⚠ DOVADA E CERUTA DE GHIDUL LOR, ORICE AR ZICE SCHEMA (26.08.2026) ═══
     *
     * Vezi nota de la `MOTIVE_FARA_DOVADA`. Aici se opreste, nu in ecran: o actiune de server se
     * poate chema cu orice argumente, printr-un POST direct.
     *
     * ⚠ SI SE OPRESTE INAINTE DE APEL, nu dupa. Respingerea e ireversibila si e plafonata la 5 pe
     * minut; iar ghidul spune ca rezultatul ei se urmareste ABIA pe urma, pe `claimItemStatus` —
     * deci un `200` de la ei n-ar dovedi ca respingerea a fost primita. O respingere plecata fara
     * dovada s-ar putea stinge tacut zile mai tarziu, cu marfa deja la comerciant si banii deja
     * intorsi clientului.
     */
    if (dovadaCeruta(p.motivId) && (p.dovezi?.length ?? 0) === 0) {
      return {
        error: "Pentru motivul ales, Trendyol cere o dovadă atașată. Adaugă o poză sau un PDF cu produsul primit.",
      };
    }
    const res = await rejectClaimItems(ctxCerere.auth, p.claimId, {
      claimIssueReasonId: p.motivId,
      claimItemIdList: p.claimItemIds,
      description: explicatie,
      files: p.dovezi,
    });
    if (isTrendyolError(res)) return { error: res.error };
  }

  /* ⚠ Se scrie DUPA raspunsul lor, nu inainte: o hotarare marcata la noi si netrimisa la ei ar
     fi cea mai rea forma — comerciantul crede ca a rezolvat, iar cererea le expira netratata. */
  const { error } = await admin.from("trendyol_claim_items")
    .update({
      decizie: p.accepta ? "accepted" : "rejected",
      decis_la: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("business_id", ctx.businessId)
    .eq("claim_row_id", cerere.id)
    .in("claim_item_id", p.claimItemIds);

  if (error) {
    await logError({
      action: "trendyol/retururi",
      message: `hotararea s-a trimis la Trendyol dar nu s-a scris la noi: ${error.message}`,
      details: { claimId: p.claimId }, businessId: ctx.businessId, severity: "warning",
    });
  }
  return { ok: true };
}

/**
 * Marfa s-a intors si e buna: se pune inapoi in stoc, pe cantitatea din linie.
 *
 * ⚠ IDEMPOTENT PE LINIE. `repus_in_stoc_la` se scrie o data; a doua apasare nu mai adauga.
 * Fara asta, doua clicuri ar fi umflat stocul, si nimeni n-ar fi stiut de unde vine.
 */
export async function repuneInStoc(
  admin: Db, ctx: TrendyolSyncContext, claimItemId: string,
): Promise<{ ok: true; pus: number } | { error: string }> {
  /*
   * ═══ ⚠ ERA IN TREI PASI, DECI SE PUTEA DUBLA (26.08.2026) ═══
   *
   * Citeste marcajul → aduna stocul → scrie marcajul. Doua apasari repezi treceau amandoua de
   * citire cu marcajul gol si adunau amandoua. Sau adunarea reusea si scrierea marcajului pica,
   * iar omul incerca din nou — cu acelasi capat.
   *
   * ⚠ ACUM E O SINGURA TRANZACTIE, cu randul luat `for update` inauntru. A doua apasare
   * asteapta, apoi vede marcajul si nu mai adauga nimic. Stocul e ultimul loc unde iti permiti
   * doua socoteli, si „idempotent" scris in comentariu nu tine loc de blocare.
   */
  const { data, error } = await admin.rpc("trendyol_repune_stoc_retur", {
    p_business_id: ctx.businessId,
    p_claim_item_id: claimItemId,
  });

  if (error) {
    await logError({
      action: "trendyol/retururi",
      message: `repunerea in stoc a picat: ${error.message}`,
      details: { claimItemId }, businessId: ctx.businessId, severity: "warning",
    });
    return { error: "Stocul nu s-a putut actualiza. Încearcă din nou." };
  }

  const r = (data ?? {}) as { stare?: string; pus?: number };
  switch (r.stare) {
    case "pus": return { ok: true, pus: Number(r.pus) || 0 };
    /* Nu e o eroare: e chiar raspunsul corect la a doua apasare. */
    case "deja": return { ok: true, pus: 0 };
    case "lipsa": return { error: "Linia de retur nu există." };
    case "fara-cod": return { error: "Linia n-are cod de bare, deci nu știm ce produs să punem înapoi." };
    case "cod-nelegat": return { error: "Codul de bare nu e legat de niciun produs din magazin." };
    case "fara-produs": return { error: "Listarea nu mai are produs legat." };
    /*
     * ⚠ Mesajul spune DE CE si CAND se poate, nu doar ca nu merge. Vezi
     * `LINII_FARA_REPUNERE`: pe `Created` clientul abia a apasat butonul de retur, iar coletul
     * e inca la el. Repus atunci, stocul creste pentru marfa care nu e la raft.
     */
    case "marfa-n-a-ajuns": return {
      error: "Returul e abia inițiat de client, iar coletul n-a ajuns încă la tine. Poți pune marfa înapoi în stoc după ce o primești.",
    };
    /*
     * ⚠ NECUNOSCUTUL SE OPRESTE, si mesajul spune ca e o asteptare, nu un refuz. Vezi
     * `marfaAAjuns`: un „nu" gresit se repara singur la urmatoarea sincronizare, un „da" gresit
     * umfla stocul tacut si il plateste un client care cumpara ce nu exista.
     */
    case "status-necunoscut": return {
      error: "Nu am putut confirma încă starea returului la Trendyol. Încearcă din nou după următoarea sincronizare.",
    };
    default: return { error: "Stocul nu s-a putut actualiza. Încearcă din nou." };
  }
}

/**
 * Starile din care o cerere de retur NU mai are ce sa ne spuna.
 *
 * ═══ ⚠ SE NUMESC CELE INCHEIATE, NU CELE VII (26.08.2026) ═══
 *
 * Aici statea lista pe dos: `["Created", "WaitingInAction", "InAnalysis", "Rejected"]`, adica
 * starile vii. Suna la fel si nu e la fel — o lista de stari vii lasa pe dinafara TOT ce nu
 * cunoastem, iar reconcilierea exista tocmai ca sa nu ramana nimic nevazut.
 *
 * ⚠ SI STIM CA NU LE CUNOASTEM PE TOATE. Enumul din specificatia lor turceasca are
 * `WaitingFraudCheck`; lista din ghidul international nu-l are deloc. E un status pe care il
 * poti PRIMI fara sa fie explicat — iar in forma dinainte o cerere ajunsa acolo n-ar mai fi
 * fost reintrebata niciodata. Exact paguba pentru care s-a scris reconcilierea, reintrodusa
 * printr-o lista scrisa in sensul gresit.
 *
 * ⚠ `Rejected` NU e incheiata, si nu e o scapare: dupa o respingere ei pot crea un colet de
 * retur catre client, iar `rejectedPackageInfo` apare abia atunci.
 *
 * ⚠ `Unresolved` NU e incheiata nici ea, fiindca nu stim daca e. Cand nu stim, se reintreaba:
 * costa o citire dintr-un buget de o mie pe minut, iar cealalta greseala costa returul.
 *
 * ⚠ Si o cerere cu statusul GOL intra tot aici — adica se reintreaba. E chiar cea despre care
 * stim cel mai putin.
 */
const STARI_INCHEIATE = ["Accepted", "Cancelled"] as const;

/** Cate cereri se reintreaba intr-o trecere. Ei ingaduie 1000 de citiri pe minut. */
const CERERI_DE_REINTREBAT = 60;

/**
 * Cat timp mai are rost sa reintrebi de o cerere care nu s-a incheiat.
 *
 * ═══ ⚠ INVERSAREA LISTEI DE STARI ARE UN COST, SI SE MARGINESTE AICI ═══
 *
 * De cand se scot starile incheiate in loc sa se aleaga cele vii, in bazin intra TOT ce nu e
 * `Accepted` sau `Cancelled` — inclusiv `Rejected`, care poate ramane asa pentru totdeauna.
 *
 * ⚠ NEMARGINIT, BAZINUL CRESTE LA NESFARSIT. Un magazin cu trei mii de cereri respinse stranse
 * intr-un an: la 60 pe trecere si o trecere la cinci minute, roata face un tur in patru ORE.
 * Adica hotararea pe care comerciantul o ia acum s-ar vedea la noi diseara. Bazinul ar fi plin
 * de morti, iar cei vii ar astepta dupa ei.
 *
 * ⚠ Se margineste pe `created_at`, care e AL NOSTRU si nu e niciodata gol — nu pe
 * `last_modified`, unde acelasi `null` ar fi scos randurile despre care stim cel mai putin. O
 * cerere pe care o stim de peste sase saptamani si care tot nu s-a incheiat nu se mai schimba.
 */
const ZILE_DE_REINTREBAT = 45;

/**
 * Reintreaba cererile pe care le stim si care inca se pot schimba.
 *
 * ═══ ⚠ FEREASTRA DE TIMP NU MAI VEDE O CERERE DUPA CE TRECE DE EA (26.08.2026) ═══
 *
 * Aducerea obisnuita cere `startDate`/`endDate` si muta marcajul inainte. Dar o cerere de retur
 * traieste ZILE: `Created` -> `WaitingInAction` -> `InAnalysis` -> `Accepted`/`Rejected`, iar in
 * Romania comerciantul are pana la doua zile lucratoare sa se hotarasca.
 *
 * Deci: retur creat la 10:00, vazut la 10:04 si la 10:14 datorita suprapunerii. Marcajul ajunge
 * la 10:09. Cererea se muta pe `Accepted` la ora 14:00 — si noi n-o mai vedem niciodata, fiindca
 * a iesit din fereastra.
 *
 * ⚠ CE COSTA: in panou ramane „Așteaptă răspunsul tău" pentru ceva deja hotarat. Si, mai rau, nu
 * mai aflam niciodata `dontShipBack` si `rejectedPackageInfo` — exact datele dupa care ii spunem
 * comerciantului daca trebuie sa trimita coletul inapoi la client. Netrimis, returul se intoarce
 * impotriva lui.
 *
 * ⚠ DE-AIA SE INTREABA PE ID, nu pe timp. `claimIds` e chiar calea pe care ne-o dau ei pentru
 * asta, iar cererile pe care le stim sunt putine si marginite: numai cele inca vii.
 *
 * ⚠ SI NU MUTA NICIUN MARCAJ. E o reconciliere, nu o aducere: n-are fereastra, deci n-are ce
 * pierde si n-are ce avansa. Cele doua cai sunt despartite anume.
 */
export async function reconciliazaRetururile(
  admin: Db, ctx: TrendyolSyncContext,
): Promise<{ verificate: number }> {
  const vii = randuriCitite<{
    claim_id: string; storefront: string | null;
    claim_status: string | null; colet_respins: unknown; dont_ship_back: boolean | null;
  }>(
    "trendyol.cereriIncaVii", await admin
      .from("trendyol_claims").select("claim_id, storefront, claim_status, colet_respins, dont_ship_back")
      .eq("business_id", ctx.businessId)
      /*
       * ⚠ Pe dos fata de cum era: se scot cele incheiate, nu se aleg cele vii. Vezi nota de la
       * `STARI_INCHEIATE` — o lista de stari vii lasa pe dinafara tot ce nu cunoastem.
       *
       * ═══ ⚠ SI `NOT IN` SINGUR AR FI SCOS RANDURILE CU STATUS GOL ═══
       *
       * `null not in ('Accepted','Cancelled')` nu e TRUE, e NULL — deci randul cade. Masurat pe
       * baza adevarata, in tranzactie anulata, cu sapte randuri de proba:
       *
       *     fara paza:  creat, frauda, nerezolvat, respins            (GOLUL LIPSESTE)
       *     cu paza:    creat, frauda, gol, nerezolvat, respins
       *
       * Amandoua scot corect `Accepted` si `Cancelled`. Deosebirea e numai golul — adica exact
       * cererea despre care stim cel mai putin, si singura pe care comentariul de deasupra
       * promitea ca o reintreaba. Fara `or`, promisiunea ar fi fost falsa.
       */
      .or(`claim_status.is.null,claim_status.not.in.(${STARI_INCHEIATE.join(",")})`)
      /* ⚠ Si marginit in timp, altfel bazinul se umple de cereri care nu se mai schimba si le
         inghesuie pe cele vii. Vezi nota de la `ZILE_DE_REINTREBAT`. */
      .gte("created_at", new Date(Date.now() - ZILE_DE_REINTREBAT * 24 * 60 * 60 * 1000).toISOString())
      /*
       * ═══ ⚠ O CERERE RESPINSA CARE SI-A ARATAT COLETUL NU MAI ARE CE SA SPUNA ═══
       *
       * `Rejected` se reintreaba anume: dupa o respingere ei POT crea un colet catre client, iar
       * `rejectedPackageInfo` apare abia atunci — si aia e chiar informatia dupa care ii spunem
       * comerciantului daca mai are ceva de expediat. Odata aparuta insa, s-a aflat.
       *
       * ⚠ ABSENTA NU E ACELASI LUCRU: cand `colet_respins` lipseste inca, poate aparea maine. Se
       * iese numai cand a APARUT, sau cand ei au spus limpede ca nu se trimite nimic inapoi.
       *
       * ⚠ SI TAIEREA E AICI, NU DUPA `limit`. Filtrata in cod dupa citire, o serie de 60 de
       * cereri respinse-cu-colet ar fi golit bazinul, `reintrebat_la` nu s-ar fi scris pe niciuna,
       * iar trecerea urmatoare ar fi luat exact aceleasi 60 — chiar blocajul reparat azi
       * dimineata, reintrodus printr-un filtru pus cu un rand mai jos.
       *
       * ⚠ MASURAT pe noua cazuri, in tranzactie anulata: intra gol, Created, WaitingFraudCheck,
       * Unresolved si respinsa-fara-colet; ies respinsa-cu-colet, respinsa-fara-trimitere,
       * Accepted si Cancelled.
       */
      .or("claim_status.is.null,claim_status.neq.Rejected,and(colet_respins.is.null,dont_ship_back.not.is.true)")
      /*
       * ═══ ⚠ ROTATIA NU SE POATE FACE PE UN CAMP CARE NU SE MISCA (26.08.2026) ═══
       *
       * Aici scria `last_modified`, si ar fi fost gresit. Acela e valoarea LOR: se scrie din
       * raspuns si se schimba doar cand cererea chiar s-a schimbat. O cerere care sta in
       * `WaitingInAction` cat timp comerciantul se hotaraste — pana la doua zile lucratoare, in
       * Romania — isi pastreaza `last_modified`-ul neatins.
       *
       * ⚠ DECI UN MAGAZIN CU PESTE 60 DE CERERI VII AR FI REINTREBAT ACELEASI 60, la fiecare
       * cinci minute, pentru totdeauna. Restul, niciodata. Exact infometarea pe care reconcilierea
       * venea s-o inlature — aceeasi ca la confirmarea tintita a listarilor.
       *
       * ⚠ `reintrebat_la` E AL NOSTRU si se scrie la FIECARE citire, chiar si cand n-a venit nimic
       * nou. Ordonat pe el, cel mai demult atins e mereu primul si roata se invarte singura.
       * `nullsFirst` pune cererile niciodata atinse inaintea tuturor.
       */
      .order("reintrebat_la", { ascending: true, nullsFirst: true })
      .limit(CERERI_DE_REINTREBAT) as never);

  if (vii.length === 0) return { verificate: 0 };

  /*
   * ⚠ GRUPATE PE VITRINA: o cerere greceasca se intreaba pe vitrina greceasca. Amestecate, ele
   * n-ar fi gasite — iar Golful are de-a dreptul alte cai.
   */
  const peVitrina = new Map<string, string[]>();
  for (const c of vii) {
    const v = c.storefront ?? ctx.auth.storefront ?? TRENDYOL_DEFAULT_STOREFRONT;
    const lista = peVitrina.get(v) ?? [];
    lista.push(c.claim_id);
    peVitrina.set(v, lista);
  }

  let verificate = 0;
  for (const [vitrina, idsVitrina] of peVitrina) {
    const ctxVitrina = vitrina === ctx.auth.storefront
      ? ctx
      : { ...ctx, auth: { ...ctx.auth, storefront: vitrina as TrendyolStoreFront } };

    /* ⚠ In bucati: `claimIds` pleaca in ADRESA, iar o lista lunga o face prea lunga. */
    for (let i = 0; i < idsVitrina.length; i += 20) {
      const bucata = idsVitrina.slice(i, i + 20);
      const res = await getClaims(ctxVitrina.auth, { claimIds: bucata, size: bucata.length });
      if (isTrendyolError(res)) {
        await logError({
          action: "trendyol/retururi",
          message: `reintrebarea cererilor vii a picat: ${res.error}`,
          details: { vitrina, cate: bucata.length, status: res.status },
          businessId: ctx.businessId, severity: "warning",
        });
        /*
         * ⚠ ROATA SE INVARTE SI LA ESEC, si e o alegere, nu o scapare. Nemarcata, o bucata care
         * pica de fiecare data — o vitrina careia i-au expirat cheile, un id pe care ei il refuza
         * — ar fi ramas vesnic prima in rand si ar fi tinut toate celelalte cereri nevazute.
         * Marcata, ea se muta la coada si vine iar la rand peste o tura; cererea se reia, doar
         * ca nu blocheaza pe nimeni. Esecul se vede oricum in jurnal.
         */
        await admin.from("trendyol_claims")
          .update({ reintrebat_la: new Date().toISOString() } as never)
          .eq("business_id", ctx.businessId).in("claim_id", bucata);
        continue;
      }
      for (const c of res.data?.content ?? []) {
        const idCerere = idCererii(c);
        if (!idCerere) continue;
        /* ⚠ Acelasi drum ca la aducere: aceeasi scriere, aceleasi reguli, un singur loc. */
        await scrieCererea(admin, ctxVitrina, c, idCerere);
        verificate++;
      }

      /*
       * ⚠ SE MARCHEAZA TOATA BUCATA CERUTA, nu doar ce a raspuns. O cerere pe care ei n-o mai
       * intorc — stearsa la ei, sau un id care nu mai inseamna nimic — ar ramane cu
       * `reintrebat_la` gol, ar fi mereu prima in rand, si ar tine roata pe loc la nesfarsit.
       * Ceruta si nereturnata inseamna tot „am intrebat".
       *
       * ⚠ Si nu se atinge `updated_at`: aici nu s-a schimbat nimic din cerere, doar am intrebat
       * de ea. Cele doua intrebari raman despartite.
       */
      const { error: eRoata } = await admin.from("trendyol_claims")
        .update({ reintrebat_la: new Date().toISOString() } as never)
        .eq("business_id", ctx.businessId).in("claim_id", bucata);
      if (eRoata) {
        await logError({
          action: "trendyol/retururi",
          message: `roata reconcilierii nu s-a putut invarti: ${eRoata.message}`,
          details: { vitrina, cate: bucata.length },
          businessId: ctx.businessId, severity: "warning",
        });
      }
    }
  }
  return { verificate };
}

/**
 * Cate cereri asteapta o hotarare. Pentru pastila din panou.
 *
 * ═══ ⚠ AVEA LISTA VECHE, SCRISA DE MANA (indreptat 26.08.2026) ═══
 *
 * Cerea `["Created", "WaitingInAction", "InAnalysis"]`, adica de doua ori gresit dupa ce restul
 * casei s-a indreptat: `Created` inseamna ca marfa e inca la client, iar pe `InAnalysis` se uita
 * EI. O pastila cu „3 retururi de rezolvat" cand unul singur chiar cere o apasare il pune pe om
 * sa caute doua butoane care nu exista.
 *
 * ⚠ NU E CHEMATA DE NICAIERI ACUM, si tocmai de-aia trebuia reparata: un cod mort care ramane
 * gresit se leaga intr-o zi la un ecran, iar cine il leaga presupune ca e bun. Numarul lui de
 * atunci ar fi mintit din prima zi.
 *
 * ⚠ SI FOLOSESTE `STARI_DE_HOTARAT`, nu o lista scrisa a doua oara. Doua liste care spun acelasi
 * lucru se despart la prima schimbare — s-au despartit deja o data, chiar aici.
 */
export async function cateRetururiAsteapta(admin: Db, businessId: string): Promise<number> {
  const randuri = randuriCitite<{ id: string }>("trendyol.retururiDeHotarat", await admin
    .from("trendyol_claims").select("id")
    .eq("business_id", businessId)
    .in("claim_status", STARI_DE_HOTARAT) as never);
  return randuri.length;
}
