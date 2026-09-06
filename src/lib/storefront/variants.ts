/**
 * Shared, framework-free variant logic used by the storefront (product page,
 * quick-add pickers) and the server (authoritative order pricing).
 *
 * A variable product stores its variants in `products.page_sections.variants`:
 *   options       — the axes the customer chooses (e.g. Marime, Culoare)
 *   combinations  — one row per allowed cross-product, keyed by `title`
 *                   ("S / Rosu"), which is the option values joined by " / "
 *                   in option order. Each combination carries its own price,
 *                   image, sku and enabled flag.
 *
 * Keep this file pure (no React, no "use client") so it can be imported from
 * server actions as well as client components.
 */

import { cerePersonalizarea } from "@/lib/customization/definitie";

export interface VariantOption {
  id: string;
  name: string;
  values: string[];
}

export interface VariantCombo {
  id: string;
  title: string;
  price: string;
  compare_at_price: string;
  sku: string;
  /**
   * Codul de bare AL COMBINATIEI.
   *
   * Un GTIN identifica un articol anume, nu o familie: cele sapte culori ale
   * aceleiasi huse au sapte coduri diferite. Cat exista doar codul de pe produs,
   * feedurile nu puteau trimite niciunul — acelasi cod pe toate variantele
   * inseamna GTIN duplicat, adica respingere — si scriau `identifierExists:
   * false` pe fiecare ofertă.
   *
   * Optional: combinatiile vechi nu-l au, iar produsele care chiar au un singur
   * cod pot ramane cu cel de pe produs.
   */
  gtin?: string;
  stock_quantity: string;
  image: string;
  enabled: boolean;
}

export interface VariantsData {
  options: VariantOption[];
  combinations: VariantCombo[];
}

interface PageSectionsWithVariants {
  variants?: {
    enabled?: boolean;
    options?: VariantOption[];
    combinations?: VariantCombo[];
  };
}

/** The separator combination titles are built from ("S / Rosu"). */
export const VARIANT_TITLE_SEP = " / ";

/**
 * Returns the usable variant data for a product, or null when the product is not
 * variable (variants disabled, or no option has any value). Callers can treat a
 * non-null result as "this product requires a selection before it can be added".
 */
export function parseVariants(pageSections: unknown): VariantsData | null {
  const ps = (pageSections ?? {}) as PageSectionsWithVariants;
  const v = ps.variants;
  if (!v?.enabled || !Array.isArray(v.options)) return null;
  const options = v.options.filter(
    (o): o is VariantOption => !!o && Array.isArray(o.values) && o.values.length > 0 && !!o.name,
  );
  if (options.length === 0) return null;
  return {
    options,
    combinations: Array.isArray(v.combinations) ? v.combinations : [],
  };
}

/**
 * Combinatiile active, cate una pe titlu, in ordinea din date.
 *
 * Titlurile duplicate NU sunt teoretice: in productie sunt 31 pe 7 produse. Cand
 * apar, TOATE partile trebuie sa se uite la aceeasi combinatie, altfel pretul
 * afisat, pretul incasat, stocul verificat si oferta trimisa la Google ajung sa
 * vina din randuri diferite ale aceluiasi titlu. Peste tot castiga PRIMA,
 * fiindca asta alege si `findCombo`, adica exact combinatia pe care o vede
 * clientul cand isi alege marimea.
 */
export function combinatiiActiveUnice(variants: VariantsData | null): VariantCombo[] {
  if (!variants) return [];
  const vazute = new Set<string>();
  const out: VariantCombo[] = [];
  for (const c of variants.combinations) {
    if (!c?.enabled || !c.title || vazute.has(c.title)) continue;
    vazute.add(c.title);
    out.push(c);
  }
  return out;
}

/** Quick predicate for cards: does this product need a variant chosen? */
export function hasVariants(pageSections: unknown): boolean {
  return parseVariants(pageSections) !== null;
}

/**
 * Produsul cere date de la cumparator inainte sa poata fi comandat?
 *
 * ⚠ PERSONALIZAREA NU ARE CUM SA TREACA PRIN COS.
 *
 * `CartItem` (`storefront/cart/normalize.ts`) n-are niciun camp pentru ea, iar
 * `placeCartOrder` nu o declara in `items` — deci o linie adaugata in cos ajunge in
 * comanda FARA textul de gravat sau poza incarcata, si fara nicio eroare nicaieri.
 * Singurul drum care o poarta e comanda directa, prin `OrderModal`.
 *
 * Masurat pe productie la 06.09.2026: 29 de produse cu campuri de personalizare, pe 4
 * magazine, cu 20 de campuri marcate OBLIGATORII — si zero comenzi, din 374, care sa fi
 * purtat vreodata datele. Deci pana acum comerciantul putea primi „Cana personalizata"
 * fara sa afle ce nume trebuia scris pe ea.
 *
 * Se foloseste ca `hasVariants`: acolo unde produsul nu se poate adauga rapid, fiindca
 * mai intai trebuie sa aleaga cineva ceva.
 */
/*
 * ⚠ NU-SI MAI RASPUNDE SINGURA. Trece prin `cerePersonalizarea` din modulul pur.
 *
 * Erau doua functii cu acelasi nume si doua raspunsuri diferite, si diferentele nu erau teoretice:
 *
 *  1. Pe suprafetele de CATALOG (acasa, magazin, cautare, categorii) `page_sections` ajunge taiat
 *     de `slimPageSections`, care lasa in loc doar steagul `customization: { cere: true }` —
 *     fara `fields`. Varianta de aici raspundea „nu" pe TOATE cardurile, adica exact acolo unde
 *     se pune poarta de quick-add.
 *  2. Un camp pe care cititorul il arunca (fara `id`, cu `type` necunoscut) o facea sa spuna „da"
 *     pentru un formular care iese GOL: butonul de cos ascuns, feedurile oprite, si nimic de
 *     completat pe pagina.
 *
 * Se pastreaza ca export din fisierul asta fiindca 9 locuri o importa de langa `hasVariants`, si
 * cele doua se citesc mereu impreuna („produsul cere o alegere inainte de a fi adaugat rapid").
 */
export function cerePersonalizare(pageSections: unknown): boolean {
  return cerePersonalizarea(pageSections);
}

/**
 * The combination title for a full selection, or null when the customer has not
 * picked a value for every option yet.
 */
export function comboTitle(options: VariantOption[], selected: Record<string, string>): string | null {
  const parts = options.map((o) => selected[o.name] ?? "");
  if (parts.some((p) => !p)) return null;
  return parts.join(VARIANT_TITLE_SEP);
}

/** The enabled combination matching a title, or null (stale / disabled / partial). */
export function findCombo(variants: VariantsData, title: string | null): VariantCombo | null {
  if (!title) return null;
  return variants.combinations.find((c) => c.title === title && c.enabled) ?? null;
}

/**
 * Stocul declarat al unei combinatii, sau `null` cand nu e declarat.
 *
 * `null` NU inseamna zero: campul lasat gol inseamna „nu tin socoteala pe
 * varianta asta", iar atunci ramane valabil stocul produsului intreg. Numai un
 * numar scris de comerciant vorbeste despre varianta. Un text sau un numar
 * negativ nu inseamna nimic, deci se poarta tot ca un camp gol.
 */
export function comboStock(combo: VariantCombo | null | undefined): number | null {
  const brut = String(combo?.stock_quantity ?? "").trim();
  if (brut === "") return null;
  const n = Number(brut);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** Combinatia are stoc declarat si acel stoc s-a terminat. */
export function comboEpuizat(combo: VariantCombo | null | undefined): boolean {
  return comboStock(combo) === 0;
}

/**
 * Whether choosing `value` for `optionName` still leads to at least one enabled
 * combination given the other current selections. Drives the strike-through /
 * disabled state on option buttons.
 *
 * Se uita si la STOC, nu doar la steagul `enabled`. Pana acum nu se uita: o
 * marime cu zero bucati arata la fel ca una plina, se alegea, intra in cos si
 * ajungea comanda. Comerciantul scrisese zero tocmai ca sa n-o mai vanda.
 */
export function isValueAvailable(
  variants: VariantsData,
  selected: Record<string, string>,
  optionName: string,
  value: string,
): boolean {
  const otherSels = Object.entries(selected)
    .filter(([k, v]) => k !== optionName && v)
    .map(([, v]) => v);
  return variants.combinations.some((c) => {
    if (!c.enabled || comboEpuizat(c)) return false;
    const parts = c.title.split(VARIANT_TITLE_SEP);
    return parts.includes(value) && otherSels.every((s) => parts.includes(s));
  });
}

/**
 * Produsul are variante, dar TOATE s-au terminat.
 *
 * Altfel pagina ar ramane cu toate optiunile taiate si cu butonul stins, fara
 * sa scrie nicaieri de ce. Asa poate spune „Stoc epuizat", ca la un produs
 * simplu.
 */
export function toateCombinatiileEpuizate(variants: VariantsData | null): boolean {
  if (!variants) return false;
  const active = variants.combinations.filter((c) => c?.enabled && c.title);
  return active.length > 0 && active.every(comboEpuizat);
}

/**
 * The per-unit price for a chosen combination. A combination with no explicit
 * price falls back to the product's base price (mirrors the server's notion of a
 * legitimate price in order.actions.ts).
 */
export function comboUnitPrice(combo: VariantCombo | null, basePrice: number): number {
  if (combo && combo.price != null && String(combo.price).trim() !== "") {
    const n = Number(combo.price);
    // Zero inseamna „fara pret propriu", nu „gratis": formularul salveaza sirul
    // gol, dar importul pune 0 numeric pentru combinatiile fara `pret=` in CSV
    // (lib/import/normalize.ts). Fara conditia asta, un dus-intors export-import
    // transforma toate marimile unui produs in variante de 0 lei, iar serverul
    // le accepta la comanda. `comboCompareAtPrice` de mai jos si
    // `getProductPriceRange` cer deja acelasi lucru.
    if (Number.isFinite(n) && n > 0) return n;
  }
  return basePrice;
}

/** The compare-at price for a chosen combination, falling back to the product's. */
export function comboCompareAtPrice(combo: VariantCombo | null, baseCompareAt: number | null): number | null {
  if (combo && combo.compare_at_price != null && String(combo.compare_at_price).trim() !== "") {
    const n = Number(combo.compare_at_price);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return baseCompareAt;
}

/**
 * Server helper: map of enabled combination title -> resolved unit price (base
 * fallback). Used to re-price cart items authoritatively from the live product,
 * so a browser can never forge a variant price.
 *
 * La titluri duplicate conteaza PRIMA, ca la `findCombo` si la `comboStockMap`.
 * Pana acum castiga ULTIMA, iar cele trei se uitau la combinatii diferite ale
 * aceluiasi titlu. Pe GEACA VISION de la eSAFE, „NEGRU / L" apare de doua ori,
 * cu 203 si cu 231 de lei: pagina arata 203 si comanda intra cu 231 pe calea
 * cosului, iar pe calea directa verificarea de pret respingea diferenta, deci
 * produsul nu se putea comanda deloc din pagina lui. Verificarea de stoc se uita
 * intre timp la stocul primei.
 */
export function enabledComboPriceMap(pageSections: unknown, basePrice: number): Map<string, number> {
  const variants = parseVariants(pageSections);
  const map = new Map<string, number>();
  if (!variants) return map;
  for (const c of variants.combinations) {
    if (!c?.enabled || !c.title || map.has(c.title)) continue;
    map.set(c.title, comboUnitPrice(c, basePrice));
  }
  return map;
}

/**
 * Stocul declarat al fiecarei combinatii active, cand chiar e declarat.
 *
 * Campul exista de la inceput in date, dar nu-l citea nimeni: un produs cu stoc
 * total 40 lasa sa se comande marimea S si cand marimea S avea 0 bucati, iar
 * comerciantul afla din comanda pe care n-o putea onora. Combinatiile fara
 * numar completat lipsesc din harta — pentru ele ramane stocul produsului.
 *
 * Cand doua combinatii au ACELASI titlu, conteaza prima, nu ultima. Nu e o
 * subtilitate teoretica: in productie sunt 129 de perechi asa. Pretul platit de
 * client vine de la prima (`findCombo`), si tot din prima scade baza de date
 * dupa comanda, deci verificarea trebuie sa se uite la aceeasi. Pana acum se
 * uita la ultima si putea aproba o comanda din stocul altei combinatii.
 */
export function comboStockMap(pageSections: unknown): Map<string, number> {
  const variants = parseVariants(pageSections);
  const map = new Map<string, number>();
  if (!variants) return map;
  for (const c of variants.combinations) {
    if (!c?.enabled || !c.title || map.has(c.title)) continue;
    const stoc = comboStock(c);
    if (stoc !== null) map.set(c.title, stoc);
  }
  return map;
}

/**
 * Optiunea asta e o marime?
 *
 * Se citeste din NUME, fara diacritice si fara majuscule, fiindca alta sursa nu
 * exista: optiunile sunt text liber, scris de comerciant sau venit din import.
 * Raspunsul conteaza intr-un singur loc — o marime nu primeste zaruri cu
 * fotografii, fiindca fotografia aceluiasi obiect nu poate arata un numar sau o
 * litera. Lista e scurta si acopera formele intalnite in importuri; un nume
 * nerecunoscut se comporta ca inainte, deci greseala posibila e cea blanda.
 */
const NUME_DE_MARIME = ["marime", "marimi", "size", "sizes", "talie", "masura", "numar", "pointura"];

export function esteMarime(numeOptiune: string): boolean {
  const curat = numeOptiune
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .trim();
  return NUME_DE_MARIME.some((n) => curat === n || curat.startsWith(`${n} `));
}

/**
 * Fotografia fiecarei valori de optiune, cand fotografia chiar spune ceva.
 *
 * Trei conditii, toate necesare, si a doua a lipsit multa vreme:
 *
 * 1. TOATE valorile optiunii duc la cate o singura fotografie — cu doar o parte,
 *    randul ar iesi un amestec de patrate si cuvinte;
 * 2. fotografiile sunt DIFERITE intre ele. Un import care pune aceeasi poza de
 *    produs pe fiecare varianta trecea de prima conditie si dadea sase patrate
 *    identice in locul marimilor S…3XL: vizitatorul avea de ales intre sase poze
 *    cu acelasi tricou, fara sa afle care e care;
 * 3. optiunea nu e o marime. O marime e un numar sau o litera, iar fotografia
 *    aceluiasi obiect n-are cum sa o arate, oricat de diferite ar fi pozele.
 *
 * `imaginiGalerie` sunt fotografiile produsului: o imagine de varianta care nu se
 * mai afla printre ele e invechita si nu se arata.
 */
export function pozePeValoare(
  variants: VariantsData | null,
  imaginiGalerie: string[],
): Map<string, Map<string, string>> {
  const harta = new Map<string, Map<string, string>>();
  if (!variants) return harta;

  for (const optiune of variants.options) {
    if (esteMarime(optiune.name)) continue;

    const perValoare = new Map<string, string>();
    for (const valoare of optiune.values) {
      const gasite = new Set<string>();
      for (const c of variants.combinations) {
        if (!c.enabled || !c.image) continue;
        if (!c.title.split(VARIANT_TITLE_SEP).includes(valoare)) continue;
        if (imaginiGalerie.includes(c.image)) gasite.add(c.image);
      }
      if (gasite.size === 1) perValoare.set(valoare, [...gasite][0]);
    }

    const distincte = new Set(perValoare.values()).size;
    if (perValoare.size === optiune.values.length && distincte === perValoare.size) {
      harta.set(optiune.name, perValoare);
    }
  }
  return harta;
}
