import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { approveClaimItems, getClaims, isTrendyolError, rejectClaimItems } from "./client";
import type { TrendyolSyncContext } from "./sync";
import { TRENDYOL_DEFAULT_STOREFRONT, type TrendyolClaim, type TrendyolStoreFront } from "./types";
import {
  coletDeTrimisInapoi, dovadaCeruta, idCererii, idPachetului, liniileReturului,
  nuSeTrimiteInapoi,
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
 * ⚠ Sub o ora n-are rost: ar insemna peste 150 de cereri de retur intr-o ora la un singur
 * magazin, iar atunci problema nu mai e paginarea.
 */
const FEREASTRA_MINIMA_MS = 60 * 60 * 1000;

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
   * doua saptamani — corect, altfel serviciul refuza — dar dupa o trecere reusita marcajul
   * sarea la „acum". Cele saisprezece zile dintre ele nu se mai citeau NICIODATA.
   *
   * ⚠ Fereastra e acum cel mult doua saptamani de la inceputul EI, iar marcajul se opreste la
   * sfarsitul ei adevarat. Trecerea urmatoare porneste de-acolo, fereastra cu fereastra, pana
   * se ajunge din urma.
   */
  const latime = Math.min(
    Math.max(latimeCeruta ?? FEREASTRA_MAXIMA_MS, FEREASTRA_MINIMA_MS),
    FEREASTRA_MAXIMA_MS,
  );
  const pana_la = Math.min(de_la + latime, acum);

  if (taiat) {
    /* ⚠ O pierdere pe care n-o putem evita se SPUNE. Ascunsa, comerciantul ar crede ca are toate
       cererile de retur — si le-ar pierde pe cele mai vechi fara sa afle vreodata. */
    await logError({
      action: "trendyol/retururi",
      message: "sincronizarea a lipsit mai mult decat tin ei cererile; retururile mai vechi nu se mai pot aduce",
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
   * ⚠ CAND NU MAI POTI INGUSTA, CITESTE MAI MULT. Douazeci de pagini pe o fereastra de-o ora
   * inseamna o mie de cereri intr-o ora la un singur magazin. `page` n-are plafon documentat, iar
   * citirea are 1000 de cereri pe minut — deci calea asta e ieftina si e deschisa.
   */
  const laStramtoare = latime <= FEREASTRA_MINIMA_MS;
  const paginiDeCitit = laStramtoare ? PAGINI_LA_STRAMTOARE : PAGINI_PE_TRECERE;

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
    if (continut.length === 0 || pagina + 1 >= totalPagini) {
      /*
       * ⚠ A INCAPUT TOT. Fereastra se poate LARGI inapoi, incet: un varf de retururi trece, si
       * n-are rost sa ramanem pe ferestre de-o ora pentru totdeauna.
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
    if (pagina + 1 >= paginiDeCitit) {
      /*
       * ⚠ LA FUND, „NU MUT MARCAJUL" AR INSEMNA SA NU MAI CITESC NIMIC, NICIODATA. Fereastra e
       * deja de-o ora, s-au citit douazeci de pagini — adica peste o mie de cereri intr-o ora la
       * un singur magazin — si tot mai sunt. Oprit aici, marcajul ramane infipt si TOATE
       * retururile de maine incolo se pierd, nu doar coada orei asteia.
       *
       * ⚠ DECI SE TRECE MAI DEPARTE SI SE SPUNE PE FATA. Se pierde coada unei ore; alternativa
       * era sa se piarda tot, de-acum inainte. Se scrie `critical` fiindca e chiar genul de
       * pierdere pe care comerciantul trebuie s-o afle de la noi, nu de la clientul lui.
       */
      if (laStramtoare) {
        await logError({
          action: "trendyol/retururi",
          message: `fereastra minima are ${totalPagini} pagini si s-au citit ${paginiDeCitit}: restul orei nu se mai poate citi, dar se merge mai departe`,
          details: {
            deLa: new Date(de_la).toISOString(), panaLa: new Date(pana_la).toISOString(),
            totalPagini, citite: paginiDeCitit, vitrina: ctx.auth.storefront ?? null,
          },
          businessId: ctx.businessId, severity: "critical",
        });
        return { aduse, ok: true, fereastraSfarsitMs: pana_la, latimeUrmatoare: FEREASTRA_MINIMA_MS };
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

  const { data: cerere, error: eCerere } = await admin.from("trendyol_claims").upsert({
    business_id: ctx.businessId,
    order_id: orderId,
    claim_id: idCerere,
    order_number: c.orderNumber ?? null,
    shipment_package_id: idPachetului(c),
    claim_status: c.status ?? null,
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

  const aleCererii = randuriCitite<{ claim_item_id: string }>("trendyol.liniileCererii", await admin
    .from("trendyol_claim_items").select("claim_item_id")
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
    default: return { error: "Stocul nu s-a putut actualiza. Încearcă din nou." };
  }
}

/**
 * Starile in care o cerere de retur inca se poate schimba.
 *
 * ⚠ `Rejected` E AICI DINADINS, si nu e o scapare: dupa o respingere, ei pot crea un colet de
 * retur catre client, iar `rejectedPackageInfo` apare abia atunci. Cat timp lipseste, cererea
 * inca are ceva de spus.
 */
const STARI_INCA_VII = ["Created", "WaitingInAction", "InAnalysis", "Rejected"] as const;

/** Cate cereri se reintreaba intr-o trecere. Ei ingaduie 1000 de citiri pe minut. */
const CERERI_DE_REINTREBAT = 60;

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
  const vii = randuriCitite<{ claim_id: string; storefront: string | null }>(
    "trendyol.cereriIncaVii", await admin
      .from("trendyol_claims").select("claim_id, storefront")
      .eq("business_id", ctx.businessId)
      .in("claim_status", STARI_INCA_VII as unknown as string[])
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

/** Cate cereri asteapta o hotarare. Pentru pastila din panou. */
export async function cateRetururiAsteapta(admin: Db, businessId: string): Promise<number> {
  const randuri = randuriCitite<{ id: string }>("trendyol.retururiDeHotarat", await admin
    .from("trendyol_claims").select("id")
    .eq("business_id", businessId)
    .in("claim_status", ["Created", "WaitingInAction", "InAnalysis"]) as never);
  return randuri.length;
}
