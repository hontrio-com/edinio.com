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
  /* ⚠ SI O LISTA IMPLINESTE CERINTA. Pe categoriile cu `allowMultipleAttributeValues`,
     valoarea aleasa de comerciant sta in `attributeValueIds` — nenumarata aici, produsul ar fi
     fost oprit ca „fara atributul obligatoriu" desi el chiar il completase. */
  if (Array.isArray(v.attributeValueIds) && v.attributeValueIds.some((x) => typeof x === "number" && x > 0)) {
    return true;
  }
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

/**
 * Ce lipseste pe TOATE variantele produsului, nu doar pe prima.
 *
 * Verificarea rula pe `items[0]`, si atat. Dar tocmai atributele obligatorii de
 * tip `varianter` — marimea si culoarea — sunt cele care difera de la o varianta
 * la alta: prima putea fi completa, iar a treia goala. Produsul trecea de garda
 * noastra si era respins de Trendyol pe lot, adica exact scenariul pentru care
 * fusese scrisa garda.
 *
 * Eticheta variantei se intoarce langa atribut, ca sa nu caute comerciantul
 * singur care dintre cele douasprezece marimi era goala.
 */
export interface AtributLipsaPeVarianta extends AtributLipsa {
  /** Barcode-ul variantei careia ii lipseste; `null` cand lipseste peste tot. */
  varianta: string | null;
}

export function atributeLipsaPeVariante(
  aleCategoriei: TrendyolCategoryAttribute[],
  articole: { barcode?: string; attributes?: TrendyolProductAttribute[] }[],
): AtributLipsaPeVarianta[] {
  const out: AtributLipsaPeVarianta[] = [];
  const vazute = new Set<string>();
  for (const item of articole ?? []) {
    for (const l of atributeObligatoriiLipsa(aleCategoriei, item.attributes ?? [])) {
      // Acelasi atribut lipsa pe mai multe variante se raporteaza o data:
      // comerciantul are de completat un camp, nu douasprezece mesaje identice.
      const cheie = String(l.attributeId);
      if (vazute.has(cheie)) continue;
      vazute.add(cheie);
      out.push({ ...l, varianta: item.barcode ?? null });
    }
  }
  return out;
}

/**
 * Eticheta unui atribut, deosebita cand categoria are DOUA cu acelasi nume.
 *
 * ⚠ Nu e un caz teoretic: categoria „Genți de umăr" (971) cere de doua ori
 * „Culoare" — id 47, text liber, care e si `slicer` (culoarea dupa care Trendyol
 * grupeaza variantele pe pagina lor), si id 348, aleasa dintr-o lista de 26 de
 * valori standard, folosita la filtrele lor. Sunt lucruri diferite si trebuie
 * completate amandoua, dar afisate identic il pun pe comerciant sa creada ca
 * vede acelasi camp de doua ori — sau ca noi il desenam de doua ori.
 */
export function deosebesteAtribut(nume: string, acceptaTextLiber: boolean, arePereche: boolean): string {
  if (!arePereche) return nume;
  return acceptaTextLiber ? `${nume} (scrisă de tine)` : `${nume} (din lista Trendyol)`;
}

/** Numele care apar de mai multe ori intr-o lista de atribute. */
export function numeRepetate(nume: string[]): Set<string> {
  const numarate = new Map<string, number>();
  for (const n of nume) numarate.set(n, (numarate.get(n) ?? 0) + 1);
  return new Set([...numarate].filter(([, c]) => c > 1).map(([n]) => n));
}

/** Mesajul aratat comerciantului, in romana, cu numele atributelor. */
export function mesajAtributeLipsa(lipsa: AtributLipsa[]): string {
  if (lipsa.length === 0) return "";
  // „Culoare si Culoare" nu e un mesaj: cand categoria are doua atribute cu
  // acelasi nume, se spune care e care.
  const repetate = numeRepetate(lipsa.map((l) => l.nume));
  const nume = lipsa.map((l) => deosebesteAtribut(l.nume, l.acceptaTextLiber, repetate.has(l.nume)));
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
