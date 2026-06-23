/**
 * Custom product sections on the store homepage.
 *
 * Merchants can add curated rows of products above the main filterable catalog
 * ("Toate produsele"). A section pulls its products one of three ways:
 *  - "selected": a hand-picked list of product ids (order preserved)
 *  - "category": every product in a category (optionally incl. subcategories)
 *  - "bundles":  the store's bundles ("Pachete", products with is_bundle)
 *
 * Sections are stored as an ordered array in store_settings.page_content
 * (key: product_sections) — no DB migration, no product-side fields. The legacy
 * "Recomandate" (show_featured_section) and the master grid are independent.
 */

export type SectionMode = "selected" | "category" | "bundles";

export interface ProductSection {
  id: string;
  title: string;
  enabled: boolean;
  mode: SectionMode;
  /** mode === "selected" — product ids, in display order. */
  productIds?: string[];
  /** mode === "category" — the category name (matches products.category). */
  category?: string;
  /** mode === "category" — also include products of descendant categories. */
  includeSubcategories?: boolean;
  layout?: "grid" | "carousel";
  /** Max products shown (clamped 1..SECTION_MAX). */
  limit?: number;
}

export const SECTION_MAX = 24;
export const SECTION_DEFAULT_LIMIT = 8;

/** Minimal product shape a section needs to resolve its products. */
export interface SectionProduct {
  id: string;
  category: string | null;
  is_bundle: boolean;
}

function randomId(): string {
  return `sec_${Math.random().toString(36).slice(2, 10)}`;
}

export function newProductSection(mode: SectionMode = "selected"): ProductSection {
  return {
    id: randomId(),
    title: mode === "bundles" ? "Pachete" : "",
    enabled: true,
    mode,
    productIds: [],
    includeSubcategories: true,
    layout: "grid",
    limit: SECTION_DEFAULT_LIMIT,
  };
}

const VALID_MODES: SectionMode[] = ["selected", "category", "bundles"];

/** Parse/sanitize the stored jsonb into a safe, typed array. */
export function parseProductSections(raw: unknown): ProductSection[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const mode = VALID_MODES.includes(r.mode as SectionMode) ? (r.mode as SectionMode) : "selected";
    const limitRaw = Number(r.limit);
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : randomId(),
      title: typeof r.title === "string" ? r.title : "",
      enabled: r.enabled !== false,
      mode,
      productIds: Array.isArray(r.productIds) ? r.productIds.filter((x): x is string => typeof x === "string") : [],
      category: typeof r.category === "string" ? r.category : undefined,
      includeSubcategories: r.includeSubcategories !== false,
      layout: r.layout === "carousel" ? "carousel" : "grid",
      limit: Number.isFinite(limitRaw) ? Math.min(Math.max(Math.round(limitRaw), 1), SECTION_MAX) : SECTION_DEFAULT_LIMIT,
    });
  }
  return out;
}

/**
 * Resolve which products a section shows, from an already-loaded product list.
 * `subtreeByName` maps a category name to itself + all descendant names (built by
 * the renderer from the categories table); used only for category mode.
 */
export function resolveSectionProducts<T extends SectionProduct>(
  section: ProductSection,
  products: T[],
  subtreeByName: Record<string, string[]>,
): T[] {
  const limit = Math.min(Math.max(section.limit ?? SECTION_DEFAULT_LIMIT, 1), SECTION_MAX);
  let list: T[];

  if (section.mode === "selected") {
    const ids = section.productIds ?? [];
    const order = new Map(ids.map((id, i) => [id, i]));
    list = products.filter((p) => order.has(p.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  } else if (section.mode === "category") {
    if (!section.category) return [];
    const names = section.includeSubcategories
      ? (subtreeByName[section.category] ?? [section.category])
      : [section.category];
    const set = new Set(names);
    list = products.filter((p) => p.category != null && set.has(p.category) && !p.is_bundle);
  } else {
    // bundles ("Pachete")
    list = products.filter((p) => p.is_bundle);
  }

  return list.slice(0, limit);
}
