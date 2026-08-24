import type { EmagCaracteristica, EmagCaracteristicaCategorie } from "./types";

/**
 * Caracteristicile eMAG, completate din specificatiile produsului (§19).
 *
 * ═══ ⚠ CE PROBLEMA REZOLVA ═══
 *
 * eMAG cere caracteristici pe categorie („Marime", „Culoare", „Material"), iar cele
 * obligatorii opresc publicarea. Pana acum se puteau fixa doar PE CATEGORIE, o
 * singura valoare pentru toate produsele din ea — ceea ce e absurd tocmai la
 * caracteristicile care conteaza: nu toate tricourile sunt „M".
 *
 * Produsele au deja `page_sections.specifications`, in forma `{label, value}`.
 * Masurat pe productie, 24.08.2026: etichetele reale sunt chiar cuvintele lor —
 * „Culoare", „Brand", „Material", „Standarde".
 *
 * ⚠ Valoarea produsului BATE valoarea fixata pe categorie, dar numai cand exista.
 * Cea de pe categorie ramane ce a fost: o valoare de rezerva pentru produsele care
 * n-o au pe a lor. Asa, nici o setare veche nu se pierde, nici una nu ascunde
 * adevarul mai amanuntit.
 *
 * ⚠ NU E O GHICITOARE. Ce nu se potriveste NU se trimite si SE RAPORTEAZA. O valoare
 * inventata sau trimisa in afara listei lor face oferta sa fie respinsa cu un mesaj
 * despre caracteristica, iar comerciantul nu are de unde sti care valoare a picat.
 */

/** O specificatie de-a noastra, din `page_sections.specifications`. */
export interface Specificatie {
  label: string;
  value: string;
}

/**
 * Aduce un text la forma dupa care se compara.
 *
 * ⚠ FARA DIACRITICE. „Mărime" scris de ei si „Marime" scris de comerciant sunt
 * acelasi lucru; comparate ca atare, nu s-ar fi potrivit NICIODATA — si tocmai
 * caracteristicile romanesti, adica toate, ar fi ramas necompletate.
 */
export function normalizeaza(text: string): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    /* ⚠ `ș` si `ț` cu virgula dedesubt se descompun; cele cu sedila (U+015F, U+0163),
       folosite gresit dar des in date vechi, NU. Se traduc anume. */
    .replace(/[şţ]/g, (c) => (c === "ş" ? "s" : "t"))
    .replace(/[ŞŢ]/g, (c) => (c === "Ş" ? "S" : "T"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** De ce n-a intrat o specificatie. Se arata omului, nu se inghite. */
export interface Nepotrivire {
  eticheta: string;
  valoare: string;
  motiv: "fara_caracteristica" | "valoare_neingaduita";
  /** Cateva valori pe care ei le accepta, ca omul sa stie ce sa scrie. */
  ingaduite?: string[];
}

export interface RezultatPotrivire {
  caracteristici: EmagCaracteristica[];
  nepotriviri: Nepotrivire[];
}

/** Cate valori ingaduite se arata intr-un mesaj. Destule cat sa se inteleaga tiparul. */
export const VALORI_ARATATE = 6;

/**
 * Potriveste specificatiile produsului cu caracteristicile categoriei.
 *
 * Functie curata: intra doua liste, iese una. Se poate proba intreaga fara retea si
 * fara baza de date — si e chiar partea care are ce sa greseasca.
 *
 * @param specificatii  ce scrie in fisa produsului
 * @param aleCategoriei ce cere eMAG in categoria aleasa
 * @param fixate        ce a fixat comerciantul pe categorie, ca valoare de rezerva
 */
export function potrivesteCaracteristici(
  specificatii: Specificatie[],
  aleCategoriei: EmagCaracteristicaCategorie[],
  fixate: EmagCaracteristica[] = [],
): RezultatPotrivire {
  const dupaNume = new Map<string, EmagCaracteristicaCategorie>();
  for (const c of aleCategoriei) {
    const n = normalizeaza(c.name ?? "");
    /* ⚠ PRIMA CASTIGA. Doua caracteristici cu acelasi nume normalizat exista („Marime"
       si „Mărime"); alegerea celei de-a doua ar fi schimbat id-ul de la o trecere la
       alta, iar oferta ar fi primit caracteristica ba pe una, ba pe alta. */
    if (n && !dupaNume.has(n)) dupaNume.set(n, c);
  }

  const gasite = new Map<number, string>();
  const nepotriviri: Nepotrivire[] = [];

  for (const s of specificatii) {
    const eticheta = (s?.label ?? "").trim();
    const valoare = (s?.value ?? "").trim();
    if (!eticheta || !valoare) continue;

    const c = dupaNume.get(normalizeaza(eticheta));
    if (!c) {
      /* ⚠ NU e o eroare: fisele au si specificatii care n-au corespondent la ei („Cod
         furnizor", „Baxare"). Se raporteaza ca sa se vada, nu ca sa alarmeze. */
      nepotriviri.push({ eticheta, valoare, motiv: "fara_caracteristica" });
      continue;
    }

    const potrivita = valoarePotrivita(valoare, c);
    if (potrivita == null) {
      nepotriviri.push({
        eticheta, valoare, motiv: "valoare_neingaduita",
        ingaduite: (c.values ?? []).slice(0, VALORI_ARATATE),
      });
      continue;
    }

    /* ⚠ Prima specificatie castiga si aici. O fisa cu „Culoare: Negru" si mai jos
       „Culoare: Negru mat" ar fi trimis-o pe a doua, adica pe cea mai putin sigura. */
    if (!gasite.has(c.id)) gasite.set(c.id, potrivita);
  }

  /*
   * ⚠ CELE FIXATE PE CATEGORIE UMPLU GOLURILE, nu se pun peste.
   *
   * Valoarea din fisa produsului e mai amanuntita si mai aproape de adevar. Dar cea
   * fixata de comerciant nu se sterge: ea acopera produsele care n-au specificatia
   * lor. Asa nicio setare veche nu se pierde si niciuna nu ascunde adevarul.
   */
  for (const f of fixate) {
    if (!gasite.has(f.id) && (f.value ?? "").toString().trim().length > 0) {
      gasite.set(f.id, String(f.value));
    }
  }

  return {
    caracteristici: [...gasite.entries()].map(([id, value]) => ({ id, value })),
    nepotriviri,
  };
}

/**
 * Valoarea noastra, adusa la ce accepta ei — sau `null` cand nu se poate.
 *
 * ═══ ⚠ CAND EI AU O LISTA, SE TRIMITE VALOAREA LOR, LITERA CU LITERA ═══
 *
 * Multe caracteristici au `values[]`, adica o lista inchisa. Trimis „negru" unde ei
 * scriu „Negru", raspunsul e o respingere despre caracteristica — fara sa spuna ce
 * valoare a picat. Deci se cauta fara diacritice si fara majuscule, dar se TRIMITE
 * exact sirul lor.
 *
 * ⚠ Cand nu se gaseste nimic in lista si `allow_new_value` nu e `1`, se intoarce
 * `null`: mai bine o caracteristica lipsa, care se vede in centrul problemelor, decat
 * o oferta intreaga respinsa pentru o valoare pe care nimeni n-o poate ghici.
 */
export function valoarePotrivita(
  valoare: string,
  c: EmagCaracteristicaCategorie,
): string | null {
  const lista = Array.isArray(c.values) ? c.values.filter((v) => typeof v === "string") : [];
  if (lista.length === 0) return valoare;

  const cautat = normalizeaza(valoare);
  const exact = lista.find((v) => normalizeaza(v) === cautat);
  if (exact != null) return exact;

  /* `allow_new_value: 1` inseamna ca ei primesc si valori din afara listei. */
  if (c.allow_new_value === 1) return valoare;

  return null;
}
