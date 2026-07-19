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
    if (Number.isFinite(n)) return n;
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
