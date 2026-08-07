/**
 * Fatetele catalogului: dupa ce se poate filtra, si cu ce valori.
 *
 * Magazinul are patru surse de atribute, toate deja completate de comercianti,
 * niciuna folosita pana acum la filtrare in afara primei:
 *
 *   - optiunile de varianta (`page_sections.variants.options`) — marime, culoare;
 *   - etichetele (coloana `tags`), scrise de importul CSV;
 *   - brandul (`page_sections.google.brand`), comun cu atributele de marketplace;
 *   - specificatiile (`page_sections.specifications`), perechi eticheta-valoare.
 *
 * MAREA PROBLEMA a ultimelor doua e ca sunt liste libere, fara vocabular: in
 * productie, cele mai frecvente etichete de specificatie sunt „Coduri
 * producator" (1221 valori distincte pe 1221 de produse), „Cod furnizor" (983 pe
 * 983) si „Cod de bare" (981 pe 981). Sunt identificatori, nu atribute. Aratate
 * ca filtre, ar fi umplut bara cu mii de valori care intorc fiecare un singur
 * produs.
 *
 * Regula care le desparte e cea mai simpla cu putinta, si nu are nevoie de
 * praguri ghicite: O VALOARE CARE INTOARCE UN SINGUR PRODUS NU E UN FILTRU. Se
 * numara produsele per valoare, valorile ramase singure cad, iar o fateta care
 * ramane cu mai putin de doua valori cade si ea. Identificatorii dispar singuri,
 * fiindca fiecare valoare a lor apartine exact unui produs, iar atributele reale
 * trec: „Baxare" (55 valori pe 939 de produse), „Certificari" (7 pe 405),
 * „Material" (86 pe 301).
 *
 * Un raport valori/produse ar fi parut mai destept si ar fi fost gresit:
 * etichetele sunt multiple per produs, deci raportul le poate depasi 1 fara ca
 * ele sa fie identificatori — la un magazin real, 81 de etichete pe 44 de
 * produse ar fi fost aruncate degeaba.
 */

/** Grupul din care face parte o fateta. Editorul le porneste si le ordoneaza. */
export type GrupFateta = "atribut" | "brand" | "eticheta" | "specificatie";

export interface ValoareFateta {
  valoare: string;
  /** Cate produse din catalog o au. Zero nu apare niciodata. */
  cate: number;
}

export interface Fateta {
  /**
   * Cheia din adresa. Prefixata pe grup, ca doua surse cu acelasi nume sa nu se
   * amestece: un magazin poate avea si optiunea de varianta „Material", si
   * specificatia „Material", cu valori diferite.
   */
  cheie: string;
  eticheta: string;
  grup: GrupFateta;
  valori: ValoareFateta[];
}

/** Ce se trimite in browser: dictionarul de jetoane si fatetele cu numaratori. */
export interface IndexFatete {
  /** Jetoanele unice: `cheie` + separator + `valoare`. Produsele poarta indici. */
  jetoane: string[];
  fatete: Fateta[];
  /** Indicii jetoanelor fiecarui produs, dupa id. Nu se serializeaza ca atare. */
  perProdus: Map<string, number[]>;
}

/** O valoare aparuta la un singur produs nu filtreaza nimic — nu e un filtru. */
const MIN_PRODUSE_PER_VALOARE = 2;
/** Cu o singura valoare ramasa, fateta n-are ce alege. */
const MIN_VALORI_PER_FATETA = 2;
/**
 * Cate valori se trimit in browser per fateta.
 *
 * La un magazin real, etichetele au 459 de valori distincte. Toate in payload ar
 * insemna o lista prin care nimeni nu deruleaza si octeti degeaba; se pastreaza
 * cele mai frecvente, care sunt si cele cautate.
 */
const MAX_VALORI_PER_FATETA = 40;
/**
 * Peste atat, valoarea nu mai e un atribut, ci o propozitie.
 *
 * Specificatia „Norme" are in productie valori de pana la 149 de caractere:
 * insiruiri de standarde, nu o valoare de bifat. Taiate aici, produsele lor
 * raman in catalog, doar ca fara acea fateta.
 */
const MAX_LUNGIME_VALOARE = 60;
/** Etichetele mai lungi de atat nu sunt nume de atribut. */
const MAX_LUNGIME_ETICHETA = 40;

export const CHEIE_BRAND = "brand";
export const CHEIE_ETICHETA = "tag";
export const PREFIX_ATRIBUT = "a.";
export const PREFIX_SPECIFICATIE = "s.";

/**
 * Separatorul dintre cheie si valoare in jeton.
 *
 * Un caracter de control, nu doua puncte sau bara: etichetele si valorile
 * sunt text scris de comerciant, iar orice semn tiparit ar putea aparea chiar
 * in ele si ar rupe despartirea. Scris ca escape, nu ca octet, ca sa se vada
 * in cod.
 */
const SEP = "\u0001";

export function jeton(cheie: string, valoare: string): string {
  return `${cheie}${SEP}${valoare}`;
}

export function despartaJeton(j: string): { cheie: string; valoare: string } {
  const i = j.indexOf(SEP);
  return i < 0 ? { cheie: j, valoare: "" } : { cheie: j.slice(0, i), valoare: j.slice(i + 1) };
}

/** Spatiile multiple si cele de la capete nu sunt diferente reale intre valori. */
function normalizeaza(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const curat = v.replace(/\s+/g, " ").trim();
  if (!curat || curat.length > MAX_LUNGIME_VALOARE) return null;
  return curat;
}

function normalizeazaEticheta(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const curat = v.replace(/\s+/g, " ").trim();
  if (!curat || curat.length > MAX_LUNGIME_ETICHETA) return null;
  return curat;
}

/** Randul de produs de care are nevoie extragerea: coloanele NEslimuite. */
export interface RandPentruFatete {
  id: string;
  tags?: unknown;
  page_sections?: unknown;
}

export interface PerecheBruta {
  cheie: string;
  eticheta: string;
  grup: GrupFateta;
  valoare: string;
}

/** Toate perechile (fateta, valoare) ale unui produs, inainte de filtrare. */
export function perechileProdusului(rand: RandPentruFatete): PerecheBruta[] {
  const out: PerecheBruta[] = [];
  const ps = (rand.page_sections ?? null) as {
    variants?: { enabled?: boolean; options?: unknown } | null;
    google?: { brand?: unknown } | null;
    specifications?: unknown;
  } | null;

  // Optiunile de varianta. Aceeasi sursa ca filtrele de azi, ca sa nu apara doua
  // liste diferite pentru acelasi lucru.
  if (ps?.variants?.enabled && Array.isArray(ps.variants.options)) {
    for (const o of ps.variants.options as { name?: unknown; values?: unknown }[]) {
      const eticheta = normalizeazaEticheta(o?.name);
      if (!eticheta || !Array.isArray(o?.values)) continue;
      for (const v of o.values) {
        const valoare = normalizeaza(v);
        if (valoare) out.push({ cheie: `${PREFIX_ATRIBUT}${eticheta}`, eticheta, grup: "atribut", valoare });
      }
    }
  }

  const brand = normalizeaza(ps?.google?.brand);
  if (brand) out.push({ cheie: CHEIE_BRAND, eticheta: "Brand", grup: "brand", valoare: brand });

  if (Array.isArray(rand.tags)) {
    for (const t of rand.tags) {
      const valoare = normalizeaza(t);
      if (valoare) out.push({ cheie: CHEIE_ETICHETA, eticheta: "Etichete", grup: "eticheta", valoare });
    }
  }

  if (Array.isArray(ps?.specifications)) {
    for (const s of ps.specifications as { label?: unknown; value?: unknown }[]) {
      const eticheta = normalizeazaEticheta(s?.label);
      const valoare = normalizeaza(s?.value);
      if (eticheta && valoare) {
        out.push({ cheie: `${PREFIX_SPECIFICATIE}${eticheta}`, eticheta, grup: "specificatie", valoare });
      }
    }
  }

  return out;
}

const ORDINE_GRUP: Record<GrupFateta, number> = { atribut: 0, brand: 1, eticheta: 2, specificatie: 3 };

/**
 * Doua fatete cu acelasi nume si exact aceleasi valori sunt aceeasi fateta.
 *
 * Nu e o curatenie teoretica: un magazin real are si atributul de marketplace
 * `google.brand`, si o specificatie scrisa „Brand", cu aceleasi treisprezece
 * valori pe aceleasi 813 produse — importul CSV le-a scris in ambele locuri.
 * Aratate amandoua, comerciantul ar fi avut doua filtre identice unul sub altul
 * si niciun mod de a sterge unul.
 *
 * Se compara SI numele SI multimea de valori. Doar numele n-ar fi de ajuns:
 * optiunea de varianta „Material" (bumbac, poliester) si specificatia
 * „Material" (piele, cauciuc) sunt lucruri diferite si trebuie sa ramana
 * amandoua. Castiga prima din ordinea deja stabilita, adica sursa cea mai
 * dedicata: atribut, brand, eticheta, specificatie.
 */
function scoateDublurile(fatete: Fateta[]): Fateta[] {
  const vazute: { nume: string; valori: string }[] = [];
  const out: Fateta[] = [];
  for (const f of fatete) {
    const nume = f.eticheta.toLocaleLowerCase("ro");
    const valori = f.valori.map((v) => v.valoare).sort().join(SEP);
    if (vazute.some((v) => v.nume === nume && v.valori === valori)) continue;
    vazute.push({ nume, valori });
    out.push(f);
  }
  return out;
}

/**
 * Construieste fatetele catalogului si jetoanele fiecarui produs.
 *
 * Se ruleaza pe SERVER, peste randurile brute: brandul si specificatiile nu
 * supravietuiesc slimuirii payload-ului, deci in browser n-ar mai avea de unde
 * fi calculate.
 */
export function construiesteFatete(randuri: RandPentruFatete[]): IndexFatete {
  // Un produs poate repeta aceeasi pereche (doua specificatii cu acelasi nume);
  // se numara o singura data, altfel „cate" ar minti.
  const perProdusBrut = new Map<string, Set<string>>();
  const meta = new Map<string, { eticheta: string; grup: GrupFateta }>();
  const numaratori = new Map<string, number>();

  for (const rand of randuri) {
    const alePerechii = new Set<string>();
    for (const p of perechileProdusului(rand)) {
      const j = jeton(p.cheie, p.valoare);
      if (alePerechii.has(j)) continue;
      alePerechii.add(j);
      if (!meta.has(p.cheie)) meta.set(p.cheie, { eticheta: p.eticheta, grup: p.grup });
      numaratori.set(j, (numaratori.get(j) ?? 0) + 1);
    }
    if (alePerechii.size > 0) perProdusBrut.set(rand.id, alePerechii);
  }

  // Valorile ramase singure cad, apoi fatetele fara doua valori cad si ele.
  const peCheie = new Map<string, ValoareFateta[]>();
  for (const [j, cate] of numaratori) {
    if (cate < MIN_PRODUSE_PER_VALOARE) continue;
    const { cheie, valoare } = despartaJeton(j);
    const lista = peCheie.get(cheie) ?? [];
    lista.push({ valoare, cate });
    peCheie.set(cheie, lista);
  }

  const fatete: Fateta[] = [];
  for (const [cheie, valori] of peCheie) {
    if (valori.length < MIN_VALORI_PER_FATETA) continue;
    const m = meta.get(cheie);
    if (!m) continue;
    valori.sort((a, b) => b.cate - a.cate || a.valoare.localeCompare(b.valoare, "ro", { numeric: true }));
    fatete.push({ cheie, eticheta: m.eticheta, grup: m.grup, valori: valori.slice(0, MAX_VALORI_PER_FATETA) });
  }

  // Atributele intai, specificatiile la urma; in interiorul grupului, fatetele
  // care acopera mai multe produse sus.
  fatete.sort(
    (a, b) =>
      ORDINE_GRUP[a.grup] - ORDINE_GRUP[b.grup]
      || b.valori.reduce((s, v) => s + v.cate, 0) - a.valori.reduce((s, v) => s + v.cate, 0)
      || a.eticheta.localeCompare(b.eticheta, "ro"),
  );

  const raman = scoateDublurile(fatete);

  // Dictionarul contine DOAR jetoanele supravietuitoare: restul n-ar fi
  // niciodata cerute, iar la 1221 de produse fiecare jeton in plus se inmulteste
  // cu numarul de produse care il poarta.
  const indexJeton = new Map<string, number>();
  const jetoane: string[] = [];
  for (const f of raman) {
    for (const v of f.valori) {
      const j = jeton(f.cheie, v.valoare);
      indexJeton.set(j, jetoane.length);
      jetoane.push(j);
    }
  }

  const perProdus = new Map<string, number[]>();
  for (const [id, set] of perProdusBrut) {
    const indici: number[] = [];
    for (const j of set) {
      const i = indexJeton.get(j);
      if (i !== undefined) indici.push(i);
    }
    if (indici.length > 0) perProdus.set(id, indici);
  }

  return { jetoane, fatete: raman, perProdus };
}

// ---------------------------------------------------------------------------
// Filtrare (client)
// ---------------------------------------------------------------------------

/** Alegerea vizitatorului: pentru fiecare cheie de fateta, valorile bifate. */
export type SelectieFatete = Record<string, string[]>;

/**
 * Traduce selectia in indici de jeton, o data per randare.
 *
 * Fara pasul asta, fiecare produs ar compara siruri: la 1221 de produse ori
 * zece jetoane ori cateva fatete bifate, sunt zeci de mii de comparatii de
 * siruri la fiecare tasta din caseta de cautare.
 */
export function indiciSelectati(
  selectie: SelectieFatete,
  jetoane: string[],
): Map<string, Set<number>> {
  const dupaCheie = new Map<string, Set<number>>();
  const cautate = new Map<string, string>();
  for (const [cheie, valori] of Object.entries(selectie)) {
    for (const v of valori) cautate.set(jeton(cheie, v), cheie);
  }
  if (cautate.size === 0) return dupaCheie;

  for (let i = 0; i < jetoane.length; i++) {
    const cheie = cautate.get(jetoane[i]);
    if (!cheie) continue;
    const set = dupaCheie.get(cheie) ?? new Set<number>();
    set.add(i);
    dupaCheie.set(cheie, set);
  }
  // O cheie ale carei valori nu mai exista in dictionar (catalogul s-a schimbat
  // sub un link vechi) NU trebuie sa goleasca lista: se ignora, ca un filtru
  // care nu mai are ce filtra.
  return dupaCheie;
}

/**
 * Produsul trece filtrele? SAU in interiorul unei fatete, SI intre ele.
 *
 * Aceeasi semantica pe care o au deja optiunile de varianta pe pagina
 * principala: „marimea M sau L" si „culoarea rosie", nu „M si L".
 */
export function trecefiltrele(indiciProdus: number[] | undefined, selectie: Map<string, Set<number>>): boolean {
  if (selectie.size === 0) return true;
  if (!indiciProdus || indiciProdus.length === 0) return false;
  for (const set of selectie.values()) {
    if (!indiciProdus.some((i) => set.has(i))) return false;
  }
  return true;
}

/** Cate filtre are bifate vizitatorul, pentru insigna de pe butonul de filtre. */
export function numaraSelectia(selectie: SelectieFatete): number {
  return Object.values(selectie).reduce((s, v) => s + v.length, 0);
}
