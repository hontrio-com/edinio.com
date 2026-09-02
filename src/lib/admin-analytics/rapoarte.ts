import {
  batchRunReports, runReport, runRealtimeReport,
  type GaReport, type GaReportRequest, type ApiResult,
} from "@/lib/google-analytics/client";
import { CONVERSII } from "@/lib/edinio-marketing/evenimente";
import { intervalul, intervalulDinainte, crestere, type NumePerioada } from "./perioade";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  RAPOARTELE DIN ADMIN, CITITE DIN GA4
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ TRAFICUL NOSTRU, nu al comerciantilor. Ce vand ei se vede in `/admin/statistici`,
  din baza noastra. Aici e cine ne viziteaza pe noi, de unde vine si ce face.

  ═══ ⚠ DE CE NU SE INTREABA `conversions` (SAU `keyEvents`) ═══

  GA4 a redenumit „conversions" in „key events" in 2025, si numele metricii s-a
  schimbat odata cu el. O interogare pe numele vechi cade cu o eroare care nu
  spune nimic folositor, iar pe cel nou cade in proprietatile mai vechi.

  Si mai important: metrica aia numara ce a BIFAT cineva in interfata GA4 ca fiind
  eveniment-cheie. Daca bifa lipseste — si la o proprietate noua lipseste —
  raportul arata zero, corect din punctul lui de vedere si fals din al nostru.

  Aici se numara `eventCount` pe numele evenimentelor pe care le stim CONVERSII
  din cod. Numarul nu depinde de nicio bifa si nu se poate desparti de taxonomie.
*/

const NUMERE_CONVERSII: readonly string[] = CONVERSII as readonly string[];

/** O linie de raport, cu numele si numerele deja scoase din forma Google. */
export type Linie = { cheie: string; a: number; b?: number };

export type Rezumat = {
  utilizatori: number;
  utilizatoriNoi: number;
  sesiuni: number;
  vizualizari: number;
  rataAngajare: number;
  durataMedie: number;
  /** Cresterea fata de perioada dinainte, in procente. `null` = nu se poate imparti. */
  crestereUtilizatori: number | null;
  crestereSesiuni: number | null;
};

export type DateAnalytics = {
  rezumat: Rezumat;
  achizitie: Linie[];
  surse: Linie[];
  pagini: Linie[];
  conversii: Linie[];
  cta: Linie[];
  formulare: Linie[];
  blog: Linie[];
  dispozitive: Linie[];
  tari: Linie[];
  /** Pe CE pagina au intrat — nu ce pagini au vazut. Vezi nota de la cererea 10. */
  aterizari: Linie[];
  orase: Linie[];
  /** Browser si sistem impreuna: „Safari / iOS". */
  browsere: Linie[];
  /** Grupuri de pagini — cere dimensiunea personalizata `page_group` in GA4. */
  grupuriPagini: Linie[] | null;
  /** Ce n-a mers, in cuvinte pentru om. Gol = totul a mers. */
  probleme: string[];
};

function numar(x: string | undefined): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Scoate liniile dintr-un raport Google: prima dimensiune, primele doua metrici.
 *
 * ⚠ `b` LIPSESTE cand raportul are o singura metrica, si asta e deosebit de
 * `b === 0`. Un zero scris acolo ar fi aratat in interfata ca „zero masurat" —
 * adica o cifra inventata acolo unde noi n-am cerut nimic.
 */
export function linii(r: GaReport | undefined): Linie[] {
  return (r?.rows ?? []).map(rand => {
    const aDoua = rand.metricValues?.[1]?.value;
    /*
      ⚠ SE IMPLETESC TOATE DIMENSIUNILE, nu doar prima.

      Cat timp fiecare cerere avea o singura dimensiune, `[0]` era de ajuns. La
      prima cerere cu doua (browser + sistem), forma veche ar fi aruncat tacut a
      doua: raportul ar fi aratat „Safari" de trei ori, cu cifre deosebite, si
      nimic n-ar fi spus ca sunt trei sisteme.
    */
    const cheie = (rand.dimensionValues ?? [])
      .map(d => d?.value).filter(Boolean).join(" / ");
    return {
      cheie: cheie || "(fara)",
      a: numar(rand.metricValues?.[0]?.value),
      ...(aDoua === undefined ? {} : { b: numar(aDoua) }),
    };
  });
}

/**
 * Ruleaza un teanc de cereri, in transe de cinci.
 *
 * ⚠ CINCI E PLAFONUL DATA API pentru `batchRunReports`. Trimise sase, cad TOATE
 * — deci un raport adaugat fara sa se numere ar fi stins pagina intreaga, nu doar
 * pe el. Impartirea se face aici, o data, nu la fiecare apelant.
 */
async function teanc(
  token: string, propertyId: string, cereri: GaReportRequest[],
): Promise<{ rapoarte: (GaReport | undefined)[]; problema?: string }> {
  const iesire: (GaReport | undefined)[] = [];
  for (let i = 0; i < cereri.length; i += 5) {
    const transa = cereri.slice(i, i + 5);
    const r = await batchRunReports(token, propertyId, transa);
    if ("error" in r) {
      for (let k = 0; k < transa.length; k++) iesire.push(undefined);
      return { rapoarte: iesire, problema: r.error };
    }
    const primite = r.data.reports ?? [];
    for (let k = 0; k < transa.length; k++) iesire.push(primite[k]);
  }
  return { rapoarte: iesire };
}

export async function citesteAnalytics(
  token: string, propertyId: string, perioada: NumePerioada,
): Promise<DateAnalytics | { eroare: string }> {
  const acum = intervalul(perioada);
  const inainte = intervalulDinainte(perioada);
  const probleme: string[] = [];

  const cereri: GaReportRequest[] = [
    /* 0 — rezumatul, cu perioada dinainte in aceeasi cerere */
    {
      dateRanges: [acum, inainte],
      metrics: [
        { name: "activeUsers" }, { name: "newUsers" }, { name: "sessions" },
        { name: "screenPageViews" }, { name: "engagementRate" }, { name: "averageSessionDuration" },
      ],
    },
    /* 1 — canale */
    {
      dateRanges: [acum],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 12,
    },
    /* 2 — surse */
    {
      dateRanges: [acum],
      dimensions: [{ name: "sessionSourceMedium" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 15,
    },
    /* 3 — pagini */
    {
      dateRanges: [acum],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 25,
    },
    /* 4 — conversiile, pe numele din taxonomia noastra */
    {
      dateRanges: [acum],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: [...NUMERE_CONVERSII] } } },
    },
    /* 5 — butoanele */
    {
      dateRanges: [acum],
      dimensions: [{ name: "customEvent:cta_id" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: "cta_click" } } },
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 20,
    },
    /* 6 — formularele: inceput, trimis, cazut */
    {
      dateRanges: [acum],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", inListFilter: { values: ["form_start", "form_submit", "form_error"] } },
      },
    },
    /* 7 — blogul */
    {
      dateRanges: [acum],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: { values: ["article_view", "article_read_complete", "newsletter_subscribe_request", "newsletter_subscribe_confirmed"] },
        },
      },
    },
    /* 8 — dispozitive */
    {
      dateRanges: [acum],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    },
    /* 9 — tari */
    {
      dateRanges: [acum],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    },
    /*
      ═══ 10 — PAGINILE DE ATERIZARE ═══

      ⚠ NU E ACELASI LUCRU CU „paginile" de la 3. Aceea numara vizualizari: pagina
      de preturi apare sus fiindca oamenii ajung la ea DUPA ce au intrat pe alta.
      Asta numara pe CE au intrat — adica ce pagina aduce oameni, singura
      intrebare care se poate pune unei reclame sau unui articol.
    */
    {
      dateRanges: [acum],
      dimensions: [{ name: "landingPage" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 12,
    },
    /* 11 — orase */
    {
      dateRanges: [acum],
      dimensions: [{ name: "city" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    },
    /*
      ═══ 12 — BROWSER SI SISTEM, INTR-O SINGURA CERERE ═══

      ⚠ DOUA DIMENSIUNI, NU DOUA CERERI. Fiecare cerere in plus e latime de banda
      si o sansa in plus ca teancul sa cada. Iar intrebarea adevarata e oricum
      incrucisata: „Safari pe iPhone" spune ceva ce „Safari" si „iOS" separat nu
      spun.
    */
    {
      dateRanges: [acum],
      dimensions: [{ name: "browser" }, { name: "operatingSystem" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    },
  ];

  const { rapoarte, problema } = await teanc(token, propertyId, cereri);
  if (problema) return { eroare: problema };

  const r0 = rapoarte[0];
  const acumRand = r0?.rows?.[0];
  const inainteRand = r0?.rows?.[1];
  const m = (rand: typeof acumRand, i: number) => numar(rand?.metricValues?.[i]?.value);

  const rezumat: Rezumat = {
    utilizatori: m(acumRand, 0),
    utilizatoriNoi: m(acumRand, 1),
    sesiuni: m(acumRand, 2),
    vizualizari: m(acumRand, 3),
    rataAngajare: m(acumRand, 4) * 100,
    durataMedie: m(acumRand, 5),
    crestereUtilizatori: crestere(m(acumRand, 0), m(inainteRand, 0)),
    crestereSesiuni: crestere(m(acumRand, 2), m(inainteRand, 2)),
  };

  /*
    ═══ ⚠ GRUPURILE DE PAGINI SE CER SEPARAT, SI AU VOIE SA CADA ═══

    `page_group` e o dimensiune PERSONALIZATA: pana nu e inregistrata de mana in
    interfata GA4, Data API raspunde cu eroare la orice cerere care o pomeneste.

    Bagata in teancul de sus, ar fi doborat TOATA transa — adica pagina ar fi fost
    goala, cu un mesaj despre o dimensiune, la cineva care voia sa vada cati
    vizitatori a avut. Aici cade doar ea, si spune ce e de facut.
  */
  let grupuriPagini: Linie[] | null = null;
  const rGrup = await runReport(token, propertyId, {
    dateRanges: [acum],
    dimensions: [{ name: "customEvent:page_group" }],
    metrics: [{ name: "screenPageViews" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 12,
  });
  if ("error" in rGrup) {
    probleme.push(
      "Dimensiunea personalizata `page_group` nu e inregistrata in GA4. " +
      "Admin -> Custom definitions -> Create custom dimension, scope Event, parametru `page_group`. " +
      "Pana atunci, gruparea paginilor lipseste; restul raportului nu e atins.",
    );
  } else {
    grupuriPagini = linii(rGrup.data);
  }

  const cta = linii(rapoarte[5]);
  if (cta.length === 0) {
    /*
      ⚠ TREI CAUZE, NU DOUA, si a treia e cea mai probabila in prima zi.

      O dimensiune personalizata din GA4 se aplica DOAR datelor colectate dupa ce
      a fost inregistrata — ce e mai vechi ramane `(not set)` pentru totdeauna.
      Deci imediat dupa configurare, tabelul e gol chiar daca totul merge.

      Mesajul dinainte lasa impresia ca ori n-a apasat nimeni, ori a uitat cineva
      sa inregistreze dimensiunea. Amandoua trimit omul sa caute un defect care nu
      exista, in ziua in care tocmai a facut totul cum trebuie.
    */
    probleme.push(
      "Niciun `cta_id` inca. Daca tocmai ai inregistrat dimensiunea in GA4, e normal: " +
      "ea se aplica doar datelor de DUPA inregistrare, iar rapoartele obisnuite se aseaza " +
      "in cateva ore. Verifica panoul `Chiar acum` de sus — daca `cta_click` apare acolo, " +
      "totul merge si e doar chestiune de timp.",
    );
  }

  return {
    rezumat,
    achizitie: linii(rapoarte[1]),
    surse: linii(rapoarte[2]),
    pagini: linii(rapoarte[3]),
    conversii: linii(rapoarte[4]),
    cta,
    formulare: linii(rapoarte[6]),
    blog: linii(rapoarte[7]),
    dispozitive: linii(rapoarte[8]),
    tari: linii(rapoarte[9]),
    aterizari: linii(rapoarte[10]),
    orase: linii(rapoarte[11]),
    browsere: linii(rapoarte[12]),
    grupuriPagini,
    probleme,
  };
}

/**
 * Ce se intampla pe site CHIAR ACUM: cati oameni, pe ce pagini, si ce evenimente.
 *
 * ═══ ⚠ DE CE SI EVENIMENTELE, NU DOAR OAMENII ═══
 *
 * Prima forma intorcea numai numarul de vizitatori activi. Dar intrebarea pentru
 * care se deschide pagina asta in ziua configurarii nu e „cati sunt pe site" —
 * e „am apasat acum ceva, a ajuns?".
 *
 * Fara evenimente, singurul raspuns era „asteapta cateva ore si uita-te in lista
 * din Administrator", care e exact felul de raspuns dupa care nimeni nu mai
 * verifica nimic. Rapoartele obisnuite intarzie; timpul real nu.
 *
 * ⚠ CELE DOUA CERERI MERG IN PARALEL si oricare poate cadea singura. Un raport de
 * timp real nu are voie sa doboare pagina — e cea mai putin importanta cifra din
 * ea si cea mai fragila.
 */
export async function citesteTimpReal(
  token: string, propertyId: string,
): Promise<{ activi: number; pagini: Linie[]; evenimente: Linie[] } | { eroare: string }> {
  const [rPagini, rEvenimente] = await Promise.all([
    runRealtimeReport(token, propertyId, {
      dimensions: [{ name: "unifiedScreenName" }],
      metrics: [{ name: "activeUsers" }],
      limit: 10,
    }) as Promise<ApiResult<GaReport>>,
    runRealtimeReport(token, propertyId, {
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      limit: 25,
    }) as Promise<ApiResult<GaReport>>,
  ]);

  if ("error" in rPagini) return { eroare: rPagini.error };

  const pagini = linii(rPagini.data);
  return {
    activi: pagini.reduce((s, l) => s + l.a, 0),
    pagini,
    /* ⚠ Daca doar evenimentele cad, restul paginii traieste mai departe. */
    evenimente: "error" in rEvenimente ? [] : linii(rEvenimente.data),
  };
}
