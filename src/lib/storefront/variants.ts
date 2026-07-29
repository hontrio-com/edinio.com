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

/** Quick predicate for cards: does this product need a variant chosen? */
export function hasVariants(pageSections: unknown): boolean {
  return parseVariants(pageSections) !== null;
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
 * Whether choosing `value` for `optionName` still leads to at least one enabled
 * combination given the other current selections. Drives the strike-through /
 * disabled state on option buttons.
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
    if (!c.enabled) return false;
    const parts = c.title.split(VARIANT_TITLE_SEP);
    return parts.includes(value) && otherSels.every((s) => parts.includes(s));
  });
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
 */
export function enabledComboPriceMap(pageSections: unknown, basePrice: number): Map<string, number> {
  const variants = parseVariants(pageSections);
  const map = new Map<string, number>();
  if (!variants) return map;
  for (const c of variants.combinations) {
    if (!c?.enabled || !c.title) continue;
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
 */
export function comboStockMap(pageSections: unknown): Map<string, number> {
  const variants = parseVariants(pageSections);
  const map = new Map<string, number>();
  if (!variants) return map;
  for (const c of variants.combinations) {
    if (!c?.enabled || !c.title) continue;
    const brut = String(c.stock_quantity ?? "").trim();
    if (brut === "") continue;
    const n = Number(brut);
    if (Number.isFinite(n) && n >= 0) map.set(c.title, Math.floor(n));
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
