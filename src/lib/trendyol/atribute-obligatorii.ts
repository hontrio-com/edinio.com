import type { TrendyolCategoryAttribute, TrendyolProductAttribute } from "./types";

/**
 * Atributele pe care categoria le cere OBLIGATORIU, si care lipsesc din produs.
 *
 * ═══ DE CE EXISTA ═══
 *
 * `buildTrendyolItems` verifica brandul si categoria, dar nu si atributele. Un
 * produs fara un atribut obligatoriu pleca la Trendyol si era respins ACOLO, cu
 * un mesaj care ajungea inapoi ore mai tarziu, printr-un lot in care picasera
 * doisprezece din treisprezece. Masurat in productie: trei rulari de publicare in
 * masa, doua magazine, 0/25, 0/14 si 1/13.
 *
 * Mesajul lui Trendyol suna asa:
 *
 *   Detaliile necesare pentru categoria de caracteristici nu au fost gasite.
 *   Lipseste ID atribut: 47, Nume atribut: Culoare.
 *
 * Adica raspunsul exista, dar sosea prea tarziu si pe produsul gresit — pe lot,
 * nu pe produsul care chiar avea gaura. Verificarea de aici pune aceeasi
 * intrebare INAINTE de trimitere, iar comerciantul vede „produsului X ii lipseste
 * Culoare" langa produsul X.
 *
 * ═══ CE NU FACE ═══
 *
 * Nu inventeaza valori si nu trimite nimic „ca sa treaca". Un atribut obligatoriu
 * completat cu o valoare gresita produce o listare gresita pe marketplace — mai
 * rau decat una respinsa, fiindca se vinde.
 */

/** Atributul e cerut de categorie? Trendyol il marcheaza in doua feluri, dupa versiune. */
function esteObligatoriu(a: TrendyolCategoryAttribute): boolean {
  const brut = a as TrendyolCategoryAttribute & { required?: boolean; isRequired?: boolean };
  return brut.required === true || brut.isRequired === true;
}

/** Are atributul o valoare adevarata, nu doar cheia? */
function areValoare(v: TrendyolProductAttribute | undefined): boolean {
  if (!v) return false;
  if (typeof v.attributeValueId === "number" && v.attributeValueId > 0) return true;
  return typeof v.customAttributeValue === "string" && v.customAttributeValue.trim().length > 0;
}

export interface AtributLipsa {
  attributeId: number;
  nume: string;
  /** Categoria accepta text liber, deci se poate completa cu orice valoare reala. */
  acceptaTextLiber: boolean;
}

/**
 * Ce lipseste, cu NUMELE atributului — nu doar cu id-ul.
 *
 * Numele e tot rostul: „lipseste atributul 47" nu-i spune nimic comerciantului,
 * „lipseste Culoare" ii spune exact ce are de facut.
 */
export function atributeObligatoriiLipsa(
  aleCategoriei: TrendyolCategoryAttribute[],
  aleProdusului: TrendyolProductAttribute[],
): AtributLipsa[] {
  const puse = new Map<number, TrendyolProductAttribute>();
  for (const a of aleProdusului ?? []) {
    if (typeof a?.attributeId === "number") puse.set(a.attributeId, a);
  }

  const lipsa: AtributLipsa[] = [];
  for (const a of aleCategoriei ?? []) {
    const id = a.attribute?.id;
    if (!id || !esteObligatoriu(a)) continue;
    if (areValoare(puse.get(id))) continue;
    lipsa.push({
      attributeId: id,
      nume: a.attribute?.name ?? `atributul ${id}`,
      acceptaTextLiber: (a as { allowCustom?: boolean }).allowCustom === true,
    });
  }
  return lipsa;
}

/** Mesajul aratat comerciantului, in romana, cu numele atributelor. */
export function mesajAtributeLipsa(lipsa: AtributLipsa[]): string {
  if (lipsa.length === 0) return "";
  const nume = lipsa.map((l) => l.nume);
  /*
   * Se enumera TOATE, nu doar primul. Trimise unul cate unul, comerciantul ar fi
   * completat „Culoare", ar fi reincercat, si ar fi aflat abia atunci ca mai
   * lipseste si „Material" — cate un dus-intors pentru fiecare.
   */
  const lista = nume.length === 1 ? nume[0] : `${nume.slice(0, -1).join(", ")} si ${nume[nume.length - 1]}`;
  return nume.length === 1
    ? `Categoria Trendyol cere atributul „${lista}". Completeaza-l din editarea produsului, la Trendyol.`
    : `Categoria Trendyol cere atributele ${lista.replace(/„|”/g, "")}. Completeaza-le din editarea produsului, la Trendyol.`;
}
