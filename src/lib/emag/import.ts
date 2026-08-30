/**
 * Importul din eMAG: partea care HOTARASTE. Fara retea, fara baza de date.
 *
 * ═══ CE PROBLEMA REZOLVA FISIERUL ASTA ═══
 *
 * Un comerciant care vinde deja pe eMAG isi leaga contul si vrea sa-si vada
 * produsele in Edinio. Dar o parte din ele SUNT deja in Edinio — le-a pus de mana,
 * le-a adus din alt magazin, le-a importat din CSV. Cererea clientului a fost
 * limpede: „sa le legam, nu sa facem duplicate".
 *
 * Deci importul are trei raspunsuri, nu doua:
 *
 *   LEGAT      oferta de la ei e produsul asta de la noi. Nu se creeaza nimic.
 *   NOU        oferta n-are corespondent. Se creeaza produsul.
 *   NEHOTARAT  potrivirea nu e sigura. NU se atinge nimic si se spune omului.
 *
 * Al treilea e cel care lipseste de obicei, si tocmai el e cel scump.
 *
 * ═══ ⚠ DE CE „NEHOTARAT" E O CATEGORIE SEPARATA ═══
 *
 * Fiindca a ghici gresit se plateste in amandoua felurile, si niciunul nu se vede:
 *
 *   Legat gresit  -> pretul si stocul unui produs pleaca la oferta ALTUIA. Se
 *                    vinde altceva decat scrie, si se afla de la un client.
 *   Rupt in doua  -> comerciantul are 400 de produse si 400 de duplicate, cu
 *                    stocurile impartite intre ele.
 *
 * Nicio potrivire nesigura nu merita niciunul din cele doua. Cand doua produse
 * Edinio raspund la acelasi EAN, importul NU alege — le scrie pe amandoua in
 * raport si trece mai departe.
 *
 * ═══ CE NU FACE FISIERUL ASTA ═══
 *
 * Nu scrie nimic si nu cheama pe nimeni. Tot ce e aici e o functie pura peste
 * niste tablouri, ca sa poata fi probat cu cataloage intregi fara cont eMAG. Cine
 * face efectele e `import-run.ts`.
 */

import type { EmagOfertaCitita } from "./types";
import { normalizeazaPartNumber } from "./mapping";

/* ═══════════════════════════════════════════════════════════════════════════
   CE STIM NOI DESPRE PRODUSELE NOASTRE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Un lucru vandabil din Edinio, redus la ce foloseste potrivirii.
 *
 * Un produs simplu da un rand cu `variant_title: null`; unul cu combinatii da cate
 * un rand de combinatie. eMAG nu are variante imbricate, deci potrivirea se face
 * la nivelul asta, nu la nivel de produs — altfel marimea S de la ei s-ar fi legat
 * de produsul intreg si stocul ar fi plecat gresit la fiecare vanzare.
 */
export interface RandLocal {
  product_id: string;
  /** `null` pentru produsul simplu. */
  variant_title: string | null;
  sku: string | null;
  ean: string | null;
}

/** Un rand care exista deja in `emag_offers`: oferta a mai fost vazuta. */
export interface OfertaCunoscuta {
  emag_id: number;
  product_id: string | null;
  variant_title: string | null;
  part_number_key: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHEILE DE POTRIVIRE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Codul de bare, adus la forma in care doua scrieri ale aceluiasi cod se
 * recunosc.
 *
 * ═══ ⚠ UN UPC SI UN EAN POT FI ACELASI PRODUS ═══
 *
 * GS1 spune ca un cod se compara ALINIAT LA DREAPTA pe 14 semne, completat cu
 * zerouri. Adica UPC-12 `012345678905` si EAN-13 `0012345678905` sunt acelasi
 * produs, scris de doua ori.
 *
 * Comparate ca text simplu, nu s-ar fi potrivit — iar rezultatul ar fi fost un
 * duplicat pentru fiecare produs adus vreodata dintr-un catalog american. Nu e o
 * grija teoretica: chiar furnizorii romani trimit amandoua formele in acelasi CSV.
 *
 * Se scot si semnele care nu-s cifre: comerciantii scriu `5 941234 567890`.
 */
export function cheieEan(brut: string | null | undefined): string | null {
  const cifre = (brut ?? "").replace(/\D/g, "");
  if (cifre.length < 8 || cifre.length > 14) return null;
  return cifre.padStart(14, "0");
}

/**
 * SKU-ul, adus la forma in care l-ar tine eMAG.
 *
 * ⚠ SE NORMALIZEAZA CU CHIAR FUNCTIA CU CARE TRIMITEM. eMAG sterge spatiile,
 * virgula si punctul-virgula din `part_number` la primire. Deci `part_number`-ul
 * care se intoarce de la ei e deja fara ele, pe cand SKU-ul nostru le are inca.
 * Comparate ca atare, un produs trimis de noi ieri nu s-ar fi recunoscut azi la
 * import, si l-am fi creat a doua oara.
 *
 * Litera mare/mica se ignora: doua SKU-uri care difera doar prin ea sunt acelasi
 * produs peste tot in comert.
 */
export function cheieSku(brut: string | null | undefined): string | null {
  const n = normalizeazaPartNumber(brut).toLowerCase();
  return n || null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   INDEXUL
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cate randuri locale raspund la o cheie. Mai mult de unul = nehotarat. */
type Cos = Map<string, RandLocal[]>;

export interface IndexLocal {
  dupaEan: Cos;
  dupaSku: Cos;
}

function pune(cos: Cos, cheie: string | null, rand: RandLocal): void {
  if (!cheie) return;
  const lista = cos.get(cheie);
  if (lista) lista.push(rand);
  else cos.set(cheie, [rand]);
}

export function construiesteIndex(randuri: RandLocal[]): IndexLocal {
  const dupaEan: Cos = new Map();
  const dupaSku: Cos = new Map();
  for (const r of randuri) {
    pune(dupaEan, cheieEan(r.ean), r);
    pune(dupaSku, cheieSku(r.sku), r);
  }
  return { dupaEan, dupaSku };
}

/* ═══════════════════════════════════════════════════════════════════════════
   POTRIVIREA
   ═══════════════════════════════════════════════════════════════════════════ */

export type CaleaPotrivirii = "emag_id" | "part_number_key" | "ean" | "sku";

export type Potrivire =
  /** Oferta e deja in `emag_offers`. Nu se mai hotaraste nimic pentru ea. */
  | { fel: "cunoscuta"; product_id: string | null; variant_title: string | null }
  /** S-a legat de un lucru vandabil de la noi. Nu se creeaza nimic. */
  | { fel: "legat"; product_id: string; variant_title: string | null; prin: CaleaPotrivirii }
  /** Mai multe raspunsuri la aceeasi cheie. NU se alege niciunul. */
  | { fel: "nehotarat"; prin: CaleaPotrivirii; candidati: number }
  /** S-a potrivit, dar lucrul acela e deja legat de ALTA oferta eMAG. */
  | { fel: "ocupat"; product_id: string; variant_title: string | null; prin: CaleaPotrivirii }
  /** N-are corespondent la noi. Se creeaza produsul. */
  | { fel: "nou" };

export interface RezultatPotrivire {
  /** Ce se intampla cu fiecare oferta adusa, dupa `emag_id`. */
  potriviri: Map<number, Potrivire>;
  /**
   * Randuri din `emag_offers` a caror oferta NU mai vine de la eMAG.
   *
   * ⚠ NU SE STERG PE TACUTE. Un rand disparut inseamna ori ca oferta a fost stearsa
   * din panoul lor, ori ca a fost stearsa si refacuta cu alt `emag_id` — si nici
   * macar nu se poate deosebi de aici. Sters automat, s-ar fi pierdut legatura unui
   * produs care se vinde. Se arata omului, si el hotaraste.
   */
  disparute: OfertaCunoscuta[];
}

/** Ce se stie despre o oferta venita, redus la ce foloseste potrivirii. */
export interface OfertaVenita {
  emag_id: number;
  part_number_key: string | null;
  part_number: string | null;
  ean: string[];
}

export function ofertaVenita(o: EmagOfertaCitita): OfertaVenita {
  return {
    emag_id: o.id,
    part_number_key: (o.part_number_key ?? "").trim() || null,
    part_number: (o.part_number ?? "").trim() || null,
    ean: Array.isArray(o.ean) ? o.ean.filter((e): e is string => typeof e === "string" && !!e.trim()) : [],
  };
}

/**
 * Cheia unui lucru vandabil.
 *
 * Spatiul desparte fara ambiguitate fiindca `product_id` e un UUID: 36 de semne,
 * lungime fixa, fara spatii. Deci nu exista doua perechi diferite care sa dea
 * acelasi text.
 */
function cheiaLucrului(product_id: string, variant_title: string | null): string {
  return `${product_id} ${variant_title ?? ""}`;
}

/**
 * Cheia cu care se cauta cand nu exista cheie.
 *
 * ⚠ NU SE CAUTA CU SIRUL GOL. Un `Map` primeste bucuros `""` drept cheie, deci
 * o oferta fara EAN si un produs fara EAN s-ar fi „potrivit" — si s-ar fi legat
 * intre ele lucruri care n-au nimic in comun in afara de lipsa codului de bare.
 * Exact felul de potrivire care nu da nicio eroare si trimite stocul aiurea.
 *
 * Un spatiu nu poate fi cheie nici in `dupaEan` (acolo intra numai cifre), nici in
 * `dupaSku` (`normalizeazaPartNumber` scoate tot ce e spatiu). Deci nu raspunde
 * nimic, niciodata.
 */
const NICIODATA = " ";

/**
 * Ce se intampla cu fiecare oferta adusa.
 *
 * ═══ ⚠ ORDINEA CHEILOR NU E O PREFERINTA, E O IERARHIE DE INCREDERE ═══
 *
 *   1. `emag_id`          — l-am scris chiar noi data trecuta. Certitudine.
 *   2. `part_number_key`  — id-ul PAGINII lor de produs. Il stim doar daca l-am
 *                           scris tot noi; nu se poate potrivi din intamplare.
 *   3. `ean`              — codul de bare. Global si al fabricantului, deci tare —
 *                           dar il pot purta doi vanzatori pentru acelasi obiect.
 *   4. `part_number`/SKU  — al comerciantului. Cel mai slab: „TRICOU-1" exista in
 *                           orice magazin, si se refoloseste cand se scoate din
 *                           catalog un produs vechi.
 *
 * Se opreste la prima cheie care raspunde. ⚠ Daca o cheie da mai multe raspunsuri,
 * NU se coboara la urmatoarea: raspunsul e „nehotarat", si atat. Coborarea ar fi
 * insemnat ca un EAN ambiguu se limpezeste printr-un SKU — adica se ia decizia CEA
 * MAI SLABA tocmai acolo unde e cea mai putina incredere.
 *
 * ═══ ⚠ SE MERGE IN ORDINEA `emag_id`, NU IN ORDINEA PAGINILOR ═══
 *
 * Cand doua oferte eMAG se potrivesc pe acelasi produs de la noi, prima castiga si
 * a doua iese „ocupat". Dar „prima" trebuie sa insemne acelasi lucru la fiecare
 * rulare, iar ordinea paginilor lor NU e garantata de nimic. Sortate dupa `emag_id`,
 * doua importuri la rand dau acelasi rezultat; luate cum au venit, primul import
 * lega A si al doilea lega B, iar stocul sarea intre doua produse fara ca cineva sa
 * fi schimbat ceva.
 */
export function potriveste(
  oferte: OfertaVenita[],
  index: IndexLocal,
  cunoscute: OfertaCunoscuta[],
): RezultatPotrivire {
  const dupaEmagId = new Map<number, OfertaCunoscuta>();
  const dupaPnk = new Map<string, OfertaCunoscuta>();
  /* Lucrurile deja vorbite. Se porneste cu cele legate in rulari trecute, altfel al
     doilea import ar fi „re-legat" ce e deja legat si ar fi cazut pe unicul din baza. */
  const luate = new Set<string>();

  /*
   * ═══ ⚠ UN RAND VECHI TINE PRODUSUL OCUPAT DOAR CAT TIMP OFERTA LUI MAI EXISTA ═══
   *
   * Gasit de o proba care parea gresita si nu era.
   *
   * eMAG nu ingaduie doua oferte pe aceeasi pagina de produs, deci un
   * `part_number_key` care se repeta inseamna un singur lucru: comerciantul a STERS
   * oferta din panoul lor si a facut-o din nou. `part_number_key` ramane acelasi,
   * `emag_id` e altul.
   *
   * Randul vechi ramane insa in `emag_offers`, legat de produsul Edinio. Socotit
   * printre „lucrurile vorbite", el ocupa produsul, iar oferta noua iese „ocupat" —
   * si ramane asa la fiecare import de aici incolo. Comerciantul vede la nesfarsit
   * „nu se poate lega", pentru o oferta care e chiar a lui si e chiar acolo.
   *
   * Deci o revendicare veche se socoteste numai daca oferta care o tine mai vine si
   * acum de la ei. Cele care nu mai vin ies in `disparute`, si le curata apelantul.
   *
   * ⚠ „Nu mai vine" se poate citi ASA doar dintr-o citire INTREAGA a catalogului.
   * Dintr-o pagina, toate celelalte pagini ar fi parut disparute. De aceea
   * `import-run.ts` cheama functia asta o singura data, la sfarsit, cu tot ce a citit.
   */
  const vii = new Set(oferte.map((o) => o.emag_id));
  const disparute: OfertaCunoscuta[] = [];

  for (const c of cunoscute) {
    dupaEmagId.set(c.emag_id, c);
    if (c.part_number_key) dupaPnk.set(c.part_number_key, c);
    if (!vii.has(c.emag_id)) {
      disparute.push(c);
      continue;
    }
    if (c.product_id) luate.add(cheiaLucrului(c.product_id, c.variant_title));
  }

  const iesire = new Map<number, Potrivire>();
  const inOrdine = [...oferte].sort((a, b) => a.emag_id - b.emag_id);

  for (const o of inOrdine) {
    const cunoscuta = dupaEmagId.get(o.emag_id);
    if (cunoscuta) {
      iesire.set(o.emag_id, {
        fel: "cunoscuta",
        product_id: cunoscuta.product_id,
        variant_title: cunoscuta.variant_title,
      });
      continue;
    }

    const prinPnk = o.part_number_key ? dupaPnk.get(o.part_number_key) : undefined;
    if (prinPnk?.product_id) {
      iesire.set(o.emag_id, incearcaSaLegi(
        { product_id: prinPnk.product_id, variant_title: prinPnk.variant_title, sku: null, ean: null },
        "part_number_key", luate,
      ));
      continue;
    }

    /* ⚠ O oferta poate purta mai multe EAN-uri. Se incearca fiecare, dar daca doua
       EAN-uri ale ACELEIASI oferte duc la produse DIFERITE, e nehotarat: nu avem de
       unde sti care dintre ele descrie obiectul. */
    const dinEan = candidatiDinEan(o.ean, index);
    if (dinEan.length === 1) {
      iesire.set(o.emag_id, incearcaSaLegi(dinEan[0], "ean", luate));
      continue;
    }
    if (dinEan.length > 1) {
      iesire.set(o.emag_id, { fel: "nehotarat", prin: "ean", candidati: dinEan.length });
      continue;
    }

    const dinSku = index.dupaSku.get(cheieSku(o.part_number) ?? NICIODATA) ?? [];
    if (dinSku.length === 1) {
      iesire.set(o.emag_id, incearcaSaLegi(dinSku[0], "sku", luate));
      continue;
    }
    if (dinSku.length > 1) {
      iesire.set(o.emag_id, { fel: "nehotarat", prin: "sku", candidati: dinSku.length });
      continue;
    }

    iesire.set(o.emag_id, { fel: "nou" });
  }

  return { potriviri: iesire, disparute };
}

/** Candidatii DISTINCTI la care duc EAN-urile unei oferte. */
function candidatiDinEan(eanuri: string[], index: IndexLocal): RandLocal[] {
  const gasiti = new Map<string, RandLocal>();
  for (const e of eanuri) {
    for (const r of index.dupaEan.get(cheieEan(e) ?? NICIODATA) ?? []) {
      gasiti.set(cheiaLucrului(r.product_id, r.variant_title), r);
    }
  }
  return [...gasiti.values()];
}

/**
 * Leaga, daca lucrul nu e deja vorbit.
 *
 * ⚠ „Ocupat" nu e un caz teoretic si nici o greseala a comerciantului:
 * `emag_offers` are unic pe `(business_id, product_id, variant_title)`, fiindca un
 * lucru vandabil de la noi nu poate avea doua oferte la eMAG. Acelasi produs urcat
 * de doua ori in contul lor — se intampla — ar fi dat doua oferte spre acelasi rand,
 * iar scrierea ar fi cazut pe `duplicate key`, oprind IMPORTUL INTREG in loc de un
 * singur rand.
 */
function incearcaSaLegi(r: RandLocal, prin: CaleaPotrivirii, luate: Set<string>): Potrivire {
  const cheie = cheiaLucrului(r.product_id, r.variant_title);
  if (luate.has(cheie)) {
    return { fel: "ocupat", product_id: r.product_id, variant_title: r.variant_title, prin };
  }
  luate.add(cheie);
  return { fel: "legat", product_id: r.product_id, variant_title: r.variant_title, prin };
}

/* ═══════════════════════════════════════════════════════════════════════════
   VERDICTUL
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RaportImport {
  citite: number;
  cunoscute: number;
  legate: number;
  noi: number;
  nehotarate: number;
  ocupate: number;
}

/**
 * Ce s-a intamplat, numarat pe ce S-A POTRIVIT.
 *
 * ⚠ NU SE CITESTE DIN CATE RANDURI AU VENIT. E chiar defectul reparat la feedul de
 * stocuri: acolo verdictul se lua din numarul de randuri ale fisierului, deci un
 * feed cu 8000 de randuri din care nu se potrivea NICIUNUL raporta „8000 procesate"
 * si arata ca o reusita deplina. Aici fiecare numar de mai jos vine din felul
 * potrivirii, nu din lungimea vreunui tablou.
 */
export function raportImport(potriviri: Map<number, Potrivire>): RaportImport {
  const r: RaportImport = { citite: potriviri.size, cunoscute: 0, legate: 0, noi: 0, nehotarate: 0, ocupate: 0 };
  for (const p of potriviri.values()) {
    if (p.fel === "cunoscuta") r.cunoscute++;
    else if (p.fel === "legat") r.legate++;
    else if (p.fel === "nou") r.noi++;
    else if (p.fel === "nehotarat") r.nehotarate++;
    else r.ocupate++;
  }
  return r;
}
