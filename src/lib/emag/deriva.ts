/**
 * Deriva: cand ce e la eMAG nu mai e ce credem noi ca am trimis.
 *
 * ═══ ⚠ DE CE E NEVOIE DE FISIERUL ASTA ═══
 *
 * Toate scrierile catre eMAG raporteaza succes sau esec, si le credem. Dar exista o
 * a treia stare, pe care niciun raspuns n-o arata: cererea a reusit, si totusi acolo
 * e altceva. Se intampla din cel putin patru motive reale:
 *
 *   - comerciantul a schimbat pretul in panoul eMAG, nu in Edinio
 *   - o campanie de-a lor a coborat pretul si l-a lasat asa
 *   - o oferta a stat in validare, iar pretul nou n-a intrat niciodata
 *   - o scriere a plecat, a fost primita, si s-a pierdut la ei
 *
 * ⚠ Reconcilierea CITEA deja starile de validare, dar nu se uita niciodata la pret
 * si la stoc. Adica exact controlul care a lipsit la Trendyol: 1051 de produse au
 * raportat succes cu preturile neschimbate, si nimeni n-a aflat luni de zile.
 *
 * ═══ ⚠ O DIFERENTA VAZUTA O DATA NU E DERIVA ═══
 *
 * Regula asta e miezul fisierului, si e scrisa din frica de un rau anume.
 *
 * O comanda intrata pe eMAG le scade stocul in aceeasi secunda. La noi scade la
 * urmatoarea trecere a cronului, deci pana la un minut mai tarziu. In minutul ala,
 * stocul nostru e mai MARE decat al lor — si arata identic cu o derivare adevarata.
 *
 * Reparata pe loc, am fi trimis inapoi stocul dinaintea vanzarii: eMAG ar fi pus la
 * vanzare bucati deja vandute, iar al doilea cumparator ar fi primit o anulare.
 * Adica un rau adevarat, facut de un mecanism pus acolo ca sa previna raul.
 *
 * De aceea o diferenta se REPARA abia cand a fost vazuta de doua ori, cu ACELEASI
 * doua valori. O vanzare neingerata inca nu trece proba: la a doua trecere fie
 * diferenta a disparut, fie valorile sunt altele, si numaratoarea o ia de la capat.
 *
 * ⚠ Reconcilierea nu e drumul principal. Un pret schimbat in magazin pleaca imediat
 * prin coada; asta e plasa de siguranta de dedesubt. O plasa care asteapta o
 * confirmare e exact ce trebuie sa fie.
 *
 * ═══ ⚠ SI O DERIVA CARE NU SE LASA REPARATA SE OPRESTE ═══
 *
 * Daca eMAG refuza mereu pretul (in afara benzii min/max, oferta blocata, categorie
 * inchisa), o reparare pornita la fiecare trecere ar fi o bucla fara sfarsit: ar
 * arde cele 3 cereri pe secunda ale magazinului la nesfarsit, ar tine coada plina,
 * si n-ar ajunge nicaieri.
 *
 * Dupa `REPARARI_MAXIM` incercari pe aceeasi diferenta, se opreste si RAMANE
 * scrisa. Nereparata si vizibila e mult mai bine decat reincercata la infinit si
 * tacuta.
 */

/** Ce anume s-a departat. */
export type CampDeriva = "pret" | "stoc";

/** Cine are ultimul cuvant la o diferenta. Vezi `§69` din audit. */
export type SursaAdevarului = "edinio" | "emag";

export interface Deriva {
  camp: CampDeriva;
  /** Ce ar trimite Edinio acum. */
  laNoi: number;
  /** Ce are eMAG acum. */
  laEi: number;
}

/** Ce se tine minte intre treceri, in `emag_offers.deriva`. */
export interface MemorieDeriva {
  /** Amprenta valorilor. Schimbata, numaratoarea o ia de la capat. */
  semnatura: string;
  /** De cate ori s-a vazut ACEEASI diferenta. */
  vazutaDe: number;
  /** De cate ori s-a incercat repararea ei. */
  reparari: number;
  /** Cand s-a vazut prima si ultima oara, ISO. */
  prima: string;
  ultima: string;
  /**
   * Cand s-au terminat incercarile, ISO. Lipsa = inca se incearca.
   *
   * ⚠ E NEVOIE DE CAMPUL ASTA, nu se deduce din `reparari`. Dupa renuntare,
   * `reparari` ramane blocat pe maxim la fiecare trecere — deci o paza scrisa pe
   * el („logheaza doar cand reparari a ajuns la maxim") ar fi fost fie mereu
   * adevarata, fie niciodata, dupa cum se compara. Prima ar fi umplut jurnalul cu
   * acelasi rand la fiecare trecere; a doua n-ar fi scris nimic NICIODATA, si tocmai
   * ofertele care nu se lasa reparate ar fi ramas cele mai tacute.
   */
  renuntatLa?: string;
  campuri: Deriva[];
}

/**
 * De cate ori trebuie vazuta aceeasi diferenta inainte de a fi reparata.
 *
 * ⚠ Doi, nu unu, si motivul e scris sus: cu unu, o vanzare neingerata inca ar fi
 * trimis stocul inapoi in sus.
 */
export const VEDERI_INAINTE_DE_REPARARE = 2;

/**
 * De cate ori se incearca repararea aceleiasi diferente inainte de a renunta.
 *
 * ⚠ Trei, si apoi TACERE la trimis, nu la aratat. O oferta pe care eMAG n-o lasa
 * schimbata ramane scrisa in panou cu diferenta ei; ce se opreste e doar cheltuiala.
 */
export const REPARARI_MAXIM = 3;

/**
 * Cat de mult trebuie sa difere doua preturi ca sa fie o derivare.
 *
 * ⚠ SE COMPARA IN BANI INTREGI, nu in numere cu virgula. Noi trimitem patru
 * zecimale (cat ingaduie ei); ce intoarce `product_offer/read` poate fi rotunjit la
 * doua. Un `82,6364` trimis si un `82,64` intors nu sunt o derivare — dar comparate
 * cu `!==` ar fi fost una, la FIECARE trecere, pentru FIECARE oferta din catalog.
 *
 * Asta e greseala care ar fi transformat plasa de siguranta intr-o masina de ars
 * limita de cereri: mii de reparari inutile pe zi, si niciuna n-ar fi schimbat nimic.
 *
 * Un ban de toleranta acopera rotunjirea si nu ascunde nicio schimbare adevarata:
 * nimeni nu modifica un pret cu un ban.
 */
export const TOLERANTA_BANI = 1;

function bani(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

function bucati(n: number): number {
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Ce s-a departat intre ce am trimite noi acum si ce are eMAG.
 *
 * ⚠ `null` la ei inseamna „n-au spus", si atunci NU e derivare. `product_offer/read`
 * nu intoarce intotdeauna toate campurile; luata lipsa drept zero, fiecare oferta ar
 * fi aratat o derivare de pret de la zero — si am fi „reparat" catalogul intreg
 * pornind de la o citire incompleta.
 */
export function derivaOfertei(
  noi: { pret: number; stoc: number },
  ei: { pret: number | null; stoc: number | null },
): Deriva[] {
  const gasite: Deriva[] = [];

  if (ei.pret != null && Number.isFinite(ei.pret)) {
    if (Math.abs(bani(noi.pret) - bani(ei.pret)) > TOLERANTA_BANI) {
      gasite.push({ camp: "pret", laNoi: noi.pret, laEi: ei.pret });
    }
  }

  if (ei.stoc != null && Number.isFinite(ei.stoc)) {
    if (bucati(noi.stoc) !== bucati(ei.stoc)) {
      gasite.push({ camp: "stoc", laNoi: noi.stoc, laEi: ei.stoc });
    }
  }

  return gasite;
}

/**
 * Amprenta unei diferente.
 *
 * ⚠ Cuprinde AMANDOUA valorile, nu numai campul. Un pret care se plimba intre doua
 * valori (o campanie de-a lor care se aprinde si se stinge) ar fi aratat, cu o
 * amprenta pe camp, ca o singura derivare vazuta de zeci de ori — si ar fi trecut de
 * proba celor doua vederi la prima ocazie. Cu valorile inauntru, fiecare miscare
 * reincepe numaratoarea, ceea ce e chiar adevarul: aia nu e o stare, e o oscilatie.
 *
 * Preturile intra in bani intregi, ca sa nu depinda amprenta de zecimalele lor.
 */
export function semnaturaDerivei(campuri: Deriva[]): string {
  return campuri
    .map((d) => (d.camp === "pret"
      ? `pret:${bani(d.laNoi)}:${bani(d.laEi)}`
      : `stoc:${bucati(d.laNoi)}:${bucati(d.laEi)}`))
    .sort()
    .join("|");
}

export interface HotarareaDerivei {
  /** Ce se pune la rand acum. Gol = nimic de trimis. */
  deReparat: CampDeriva[];
  /** Ce se scrie in `emag_offers.deriva`. `null` = se sterge, nu mai e nicio diferenta. */
  memorie: MemorieDeriva | null;
  /** ⚠ Adevarat cand s-au terminat incercarile. Panoul o arata; nu se mai trimite. */
  renuntat: boolean;
  /** Adevarat o SINGURA data: la trecerea in care s-a renuntat. */
  deScrisInJurnal?: boolean;
}

/**
 * Ce se face cu diferentele gasite acum, stiind ce s-a vazut data trecuta.
 *
 * Functie curata: nu citeste nimic, nu scrie nimic, si de aceea se poate proba
 * intreaga fara retea si fara baza de date.
 */
export function hotarasteDeriva(
  campuri: Deriva[],
  veche: MemorieDeriva | null,
  surse: { pret: SursaAdevarului; stoc: SursaAdevarului },
  acum: string,
): HotarareaDerivei {
  /* Nicio diferenta: memoria se STERGE. Pastrata, panoul ar fi aratat la nesfarsit o
     derivare rezolvata demult, iar comerciantul ar fi cautat o problema inexistenta. */
  if (campuri.length === 0) {
    return { deReparat: [], memorie: null, renuntat: false };
  }

  const semnatura = semnaturaDerivei(campuri);
  const aceeasi = veche?.semnatura === semnatura;

  const memorie: MemorieDeriva = {
    semnatura,
    vazutaDe: aceeasi ? veche!.vazutaDe + 1 : 1,
    reparari: aceeasi ? veche!.reparari : 0,
    prima: aceeasi ? veche!.prima : acum,
    ultima: acum,
    campuri,
    /* ⚠ Valorile s-au schimbat = alta derivare. Renuntarea de la cea veche NU se
       mosteneste: altfel o oferta care a esuat o data n-ar mai fi fost incercata
       niciodata, pentru nicio schimbare de pret de-a comerciantului, la nesfarsit. */
    ...(aceeasi && veche!.renuntatLa ? { renuntatLa: veche!.renuntatLa } : {}),
  };

  /* ⚠ Prima vedere nu repara nimic. Vezi antetul: in minutul dintre o vanzare pe
     eMAG si ingerarea ei la noi, stocul nostru e legitim mai mare decat al lor. */
  if (memorie.vazutaDe < VEDERI_INAINTE_DE_REPARARE) {
    return { deReparat: [], memorie, renuntat: false };
  }

  if (memorie.reparari >= REPARARI_MAXIM) {
    /* ⚠ Se opreste trimisul, NU aratatul. Diferenta ramane scrisa in rand. */
    return {
      deReparat: [],
      memorie: { ...memorie, renuntatLa: memorie.renuntatLa ?? acum },
      renuntat: true,
      /* ⚠ Numai la PRIMA trecere de dupa renuntare. Chemata la fiecare, aceeasi
         oferta ar fi umplut jurnalul cu acelasi rand si l-ar fi facut necitibil
         tocmai cand e nevoie de el. */
      deScrisInJurnal: !memorie.renuntatLa,
    };
  }

  /* ⚠ Sursa adevarului se intreaba PE CAMP, nu pe magazin. Aproape orice comerciant
     vrea ca Edinio sa tina stocul (asta e tot rostul integrarii: un singur inventar),
     dar multi isi tin pretul in panoul eMAG, din campanii. Un singur comutator pentru
     amandoua l-ar fi pus sa aleaga intre a-si pierde campaniile si a-si vinde marfa
     de doua ori. */
  const deReparat = campuri
    .filter((d) => surse[d.camp] === "edinio")
    .map((d) => d.camp);

  return {
    deReparat,
    memorie: { ...memorie, reparari: deReparat.length ? memorie.reparari + 1 : memorie.reparari },
    renuntat: false,
  };
}

/**
 * Citeste memoria dintr-un `jsonb` care poate fi orice.
 *
 * ⚠ O forma nerecunoscuta da `null`, adica „o luam de la capat". Citita gresit ca
 * memorie valida, numaratoarea ar fi pornit de la un numar inventat si repararea
 * s-ar fi facut din prima — exact ce incearca fisierul asta sa nu faca.
 */
export function citesteMemoriaDerivei(brut: unknown): MemorieDeriva | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const o = brut as Record<string, unknown>;
  if (typeof o.semnatura !== "string" || !o.semnatura) return null;
  if (typeof o.vazutaDe !== "number" || !Number.isFinite(o.vazutaDe)) return null;
  if (!Array.isArray(o.campuri)) return null;

  const campuri: Deriva[] = [];
  for (const c of o.campuri) {
    if (!c || typeof c !== "object") continue;
    const d = c as Record<string, unknown>;
    if (d.camp !== "pret" && d.camp !== "stoc") continue;
    if (typeof d.laNoi !== "number" || typeof d.laEi !== "number") continue;
    campuri.push({ camp: d.camp, laNoi: d.laNoi, laEi: d.laEi });
  }
  if (campuri.length === 0) return null;

  return {
    semnatura: o.semnatura,
    vazutaDe: Math.max(1, Math.floor(o.vazutaDe)),
    reparari: typeof o.reparari === "number" && Number.isFinite(o.reparari)
      ? Math.max(0, Math.floor(o.reparari)) : 0,
    prima: typeof o.prima === "string" ? o.prima : "",
    ultima: typeof o.ultima === "string" ? o.ultima : "",
    ...(typeof o.renuntatLa === "string" && o.renuntatLa ? { renuntatLa: o.renuntatLa } : {}),
    campuri,
  };
}

/**
 * Sursa adevarului, din configurarea magazinului.
 *
 * ⚠ Implicit „edinio", si dinadins. Un magazin care n-a atins niciodata setarea a
 * legat eMAG tocmai ca sa-si tina stocul si preturile dintr-un singur loc; implicitul
 * „emag" ar fi lasat plasa de siguranta stinsa fara ca nimeni sa ceara asta.
 */
export function sursaAdevarului(v: unknown): SursaAdevarului {
  return v === "emag" ? "emag" : "edinio";
}
