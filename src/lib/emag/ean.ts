/**
 * „Produsul asta exista deja pe eMAG?"
 *
 * ═══ ⚠ INTREBAREA CARE TREBUIE PUSA INAINTE DE A CREA ORICE ═══
 *
 * eMAG are un catalog COMUN. Un iPhone e o singura pagina, pe care mai multi
 * vanzatori isi pun ofertele. Trimis ca produs NOU, acelasi obiect ajunge a doua
 * oara in catalogul lor — si atunci se intampla trei rele deodata:
 *
 *   Documentatia noua intra in validare manuala si sta zile intregi, in loc ca
 *     oferta sa fie vandabila in cateva minute pe pagina care exista.
 *   Oferta ajunge pe o pagina fara vizitatori, in loc de cea cu recenzii si
 *     istoric, unde chiar cauta oamenii.
 *   eMAG o poate respinge ca duplicat, iar mesajul vorbeste despre documentatie,
 *     nu despre duplicat.
 *
 * Ruta `/documentation/find_by_eans` raspunde exact la intrebarea asta, si spune si
 * daca AVEM VOIE sa ne atasam.
 *
 * ⚠ NIMIC DE AICI NU E O GHICEALA PE NUME SAU PE ASEMANARE. Se cauta strict dupa
 * codul de bare, care e al fabricantului si inseamna acelasi obiect peste tot.
 */

/** Ce spune eMAG despre un cod de bare. Campurile sunt cele din documentatia lor. */
export interface RaspunsEan {
  eans?: string[] | string;
  part_number_key?: string;
  product_name?: string;
  brand_name?: string;
  category_name?: string;
  doc_category_id?: number;
  site_url?: string;
  /**
   * ⚠ Ne putem atasa cu o oferta? `0` inseamna nu, si nu se poate ocoli.
   *
   * ⚠ TIPUL E LARG DINADINS: `boolean | number | string`. Schema lor spune doar ca
   * exista campul, nu si ce forma are, iar in raspunsuri se vad toate trei — `1`,
   * `true`, `"1"`. Un tip ingust ar fi fost o minciuna care trece de `tsc`: campul
   * ar fi sosit ca text, comparatia ar fi dat fals, si jumatate din produsele care
   * se pot atasa ar fi fost create din nou in catalogul lor. Vezi `eDa`.
   */
  allow_to_add_offer?: boolean | number | string;
  /** Avem DEJA o oferta pe produsul asta? Aceleasi trei forme. */
  vendor_has_offer?: boolean | number | string;
  product_image?: string;
}

export type VerdictEan =
  /** Exista la ei si ne putem atasa. Se trimite `part_number_key`, nu documentatie. */
  | { fel: "atasare"; part_number_key: string; nume: string; marca: string | null; categorie: string | null; imagine: string | null }
  /** Exista si avem deja oferta acolo. Nu se creeaza si nu se ataseaza nimic. */
  | { fel: "avem_deja"; part_number_key: string; nume: string }
  /** Exista, dar eMAG nu ingaduie oferte noi pe el. */
  | { fel: "inchis"; part_number_key: string; nume: string }
  /** Codurile duc la produse DIFERITE. Nu se alege niciunul. */
  | { fel: "nehotarat"; candidati: number }
  /** Nu exista la ei. Se creeaza produs nou, cu documentatie. */
  | { fel: "produs_nou" };

/** `1`, `true`, `"1"` — toate inseamna da. Ei le trimit pe toate trei. */
function eDa(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

/**
 * Ce sa se faca, dupa ce a raspuns eMAG.
 *
 * ⚠ PUR, ca sa poata fi probat cu toate combinatiile fara cont. Fiecare ramura de
 * mai jos duce la alta cerere catre ei, iar cea gresita costa ori un duplicat in
 * catalogul lor, ori un refuz.
 */
export function verdictEan(raspunsuri: RaspunsEan[]): VerdictEan {
  const bune = (raspunsuri ?? []).filter((r) => (r?.part_number_key ?? "").trim());
  if (bune.length === 0) return { fel: "produs_nou" };

  /*
   * ⚠ Mai multe PAGINI DIFERITE pentru codurile aceluiasi produs = nehotarat.
   *
   * Se intampla cand comerciantul a pus pe un produs codul de bare al altuia, sau
   * cand un pachet are si codul cutiei, si al continutului. Ales primul, oferta ar
   * fi ajuns pe pagina altui obiect — iar cumparatorul ar fi primit altceva decat a
   * vazut. Nicio ghiceala nu merita asta.
   */
  const pagini = new Set(bune.map((r) => (r.part_number_key ?? "").trim()));
  if (pagini.size > 1) return { fel: "nehotarat", candidati: pagini.size };

  const r = bune[0];
  const pnk = (r.part_number_key ?? "").trim();
  const nume = (r.product_name ?? "").trim() || pnk;

  /* Ordinea conteaza: „avem deja" e mai tare decat „nu se mai poate atasa" —
     oferta noastra exista acolo indiferent ce spune steagul pentru altii. */
  if (eDa(r.vendor_has_offer)) return { fel: "avem_deja", part_number_key: pnk, nume };
  if (!eDa(r.allow_to_add_offer)) return { fel: "inchis", part_number_key: pnk, nume };

  return {
    fel: "atasare",
    part_number_key: pnk,
    nume,
    marca: (r.brand_name ?? "").trim() || null,
    categorie: (r.category_name ?? "").trim() || null,
    imagine: (r.product_image ?? "").trim() || null,
  };
}

/**
 * Codurile de bare ale unui produs, curatate si fara duplicate.
 *
 * ⚠ Maximum 100 pe cerere: peste, „extra codes are ignored with a notification
 * message" — adica raspuns 200, coduri necautate, si nicio eroare. Se taie aici.
 */
export function eanuriDeCautat(brute: (string | null | undefined)[]): string[] {
  const curate = new Set<string>();
  for (const e of brute) {
    const c = codDeBareCurat(e);
    if (c) curate.add(c);
  }
  return [...curate].slice(0, 100);
}

/**
 * Un cod de bare, sau `null`.
 *
 * ═══ ⚠ NU SE STERG „CARACTERELE NECIFRA". SE REFUZA. ═══
 *
 * Prima forma facea `.replace(/\D/g, "")` si pastra ce ramanea, daca avea intre 8 si
 * 14 cifre. Pare inofensiv — pana dai peste date trecute prin Excel.
 *
 * Masurat pe catalogul ANTAL INDUSTRY, 24.08.2026: 33 de produse au codul scris ca
 * `5.94903E+12`. Excel a transformat codul de bare in notatie stiintifica la un
 * import CSV, si asa a ramas.
 *
 * Sterse cifrele din el, `5.94903E+12` devine `59490312` — OPT CIFRE. Adica trece
 * filtrul vechi si arata ca un cod de bare perfect valabil. Dar nu e codul
 * produsului: e o farama din el, lipita cu exponentul.
 *
 * ⚠ SI ASTA NU E DOAR O CAUTARE RATATA. `find_by_eans` intreaba catalogul COMUN al
 * eMAG. Daca numarul inventat se nimereste sa existe la alt produs, al altui
 * vanzator, oferta noastra s-ar fi lipit de fisa ALTCUIVA — cu pozele lui,
 * descrierea lui si recenziile lui. Iar dezlipirea se cere de la ei, pe mail.
 *
 * Deci: se ingaduie doar spatii si liniute (asa se scriu codurile pe hartie), si se
 * refuza orice altceva. Un cod stricat NU se ghiceste; produsul pleaca fara EAN, iar
 * asta e o lipsa care se vede, nu o potrivire gresita care nu se vede.
 */
export function codDeBareCurat(brut: string | null | undefined): string | null {
  const t = (brut ?? "").trim();
  if (!t) return null;

  /* ⚠ Numai spatii si liniute se scot. Punctul, virgula, litera `E`, plusul — toate
     inseamna ca numarul a trecut prin altceva si nu mai e ce a fost. */
  const c = t.replace(/[\s-]/g, "");
  if (!/^[0-9]+$/.test(c)) return null;

  /* Sub 8 cifre nu e cod de bare, iar cerut, doar arde o cerere din cele 3 pe secunda.
     Peste 14 nu exista — GTIN-14 e cel mai lung. */
  return c.length >= 8 && c.length <= 14 ? c : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOTURI (24.08.2026)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Raspunsurile unui lot, impartite inapoi pe randuri, dupa codurile lor.
 *
 * ═══ ⚠ DE CE E NEVOIE DE IMPARTIRE ═══
 *
 * `verdictEan` judeca un teanc de raspunsuri ca fiind despre UN SINGUR produs: daca vede
 * doua `part_number_key` diferite, intoarce „nehotarat", fiindca pe un produs asta
 * inseamna coduri amestecate. Corect — dar numai cat timp teancul e al unui singur rand.
 *
 * Trimise in lot, raspunsurile a douazeci de produse ar veni la gramada, iar `verdictEan`
 * ar spune „nehotarat" pentru toate. Deci lotul se aduna la plecare si se desface la
 * intoarcere, dupa campul `eans` din raspunsul lor.
 *
 * ⚠ Un raspuns fara `eans` nu se arunca si nu se da tuturor: se da randurilor al caror
 * cod NU s-a regasit in niciun raspuns cu `eans`. Dat tuturor, un produs strain ar fi
 * ajuns sa hotarasca pentru randuri cu care n-are nicio legatura — chiar paguba pe care
 * o apara „nehotarat".
 */
export function imparteRaspunsurilePeRanduri<T extends { ean?: string | null }>(
  randuri: T[],
  raspunsuri: RaspunsEan[],
): Map<T, RaspunsEan[]> {
  const iesire = new Map<T, RaspunsEan[]>();
  for (const r of randuri) iesire.set(r, []);

  /* Codul curat al fiecarui rand, ca sa se compare cu ce ne-au intors. */
  const codRand = new Map<T, string>();
  for (const r of randuri) {
    const c = codDeBareCurat(r.ean);
    if (c) codRand.set(r, c);
  }

  const faraEans: RaspunsEan[] = [];
  const acoperite = new Set<T>();

  for (const rasp of raspunsuri ?? []) {
    const brute = Array.isArray(rasp?.eans) ? rasp.eans : (rasp?.eans ? [rasp.eans] : []);
    const coduri = new Set(brute.map((x) => codDeBareCurat(x)).filter((x): x is string => !!x));
    if (coduri.size === 0) { faraEans.push(rasp); continue; }

    for (const [rand, cod] of codRand) {
      if (!coduri.has(cod)) continue;
      iesire.get(rand)!.push(rasp);
      acoperite.add(rand);
    }
  }

  /* ⚠ Numai celor ramase fara raspuns identificabil. Vezi nota de mai sus. */
  if (faraEans.length > 0) {
    for (const rand of randuri) {
      if (acoperite.has(rand)) continue;
      iesire.get(rand)!.push(...faraEans);
    }
  }

  return iesire;
}
