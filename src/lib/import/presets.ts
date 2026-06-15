// Format auto-detection + column auto-mapping.
// Shopify and Woo CSVs have known, stable headers so we recognise them and use
// dedicated adapters. Anything else falls back to the generic mapper, where we
// still pre-fill a best-guess mapping by fuzzy-matching header names.

import type { ImportSource, OurField, ColumnMapping } from "./types";

/** Detect the source format from the CSV header row. */
export function detectFormat(headers: string[]): ImportSource {
  const set = new Set(headers.map((h) => h.trim().toLowerCase()));

  const hasShopify =
    set.has("handle") && (set.has("variant price") || set.has("body (html)") || set.has("title"));
  if (hasShopify) return "shopify_csv";

  const hasWoo =
    set.has("regular price") ||
    (set.has("type") && set.has("categories") && set.has("images"));
  if (hasWoo) return "woo_csv";

  return "generic_csv";
}

export const SOURCE_LABELS: Record<ImportSource, string> = {
  shopify_csv: "Shopify (CSV)",
  woo_csv: "WooCommerce (CSV)",
  generic_csv: "Fisier CSV generic",
};

// Header synonyms (English + Romanian) used to auto-fill the generic mapper.
// Order matters: more specific terms first.
const FIELD_SYNONYMS: Record<OurField, string[]> = {
  name: ["name", "title", "nume", "denumire", "product name", "product title"],
  price: ["regular price", "price", "pret", "pret regular", "amount", "variant price"],
  compare_at_price: ["sale price", "compare at price", "compare_at_price", "pret vechi", "pret redus", "old price", "msrp"],
  description: ["description", "descriere", "body (html)", "body", "content", "long description"],
  sku: ["sku", "cod", "cod produs", "barcode", "ean", "product code", "variant sku"],
  category: ["categories", "category", "categorie", "categorii", "product category", "type", "tip"],
  tags: ["tags", "etichete", "tag", "keywords"],
  images: ["images", "image", "imagini", "imagine", "image src", "poze", "photo", "image url", "picture"],
  stock_quantity: ["stock", "stoc", "quantity", "cantitate", "qty", "inventory", "variant inventory qty", "stock quantity"],
  weight: ["weight (kg)", "weight", "greutate", "variant grams", "grams", "masa"],
  is_active: ["published", "publicat", "active", "activ", "status", "visible", "vizibil", "in stock?"],
  is_featured: ["is featured?", "featured", "recomandat", "is_featured", "promovat"],
  external_id: ["id", "external id", "handle", "product id", "id produs"],
  slug: ["slug", "handle", "link", "permalink", "url key"],
  seo_title: ["seo title", "meta title", "titlu seo", "page title"],
  seo_description: ["seo description", "meta description", "descriere seo", "meta desc"],
};

/** Best-guess mapping of source headers onto our fields (generic CSV). */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const lower = headers.map((h) => ({ raw: h, norm: h.trim().toLowerCase() }));

  for (const field of Object.keys(FIELD_SYNONYMS) as OurField[]) {
    const synonyms = FIELD_SYNONYMS[field];
    // Prefer exact header match, then "contains".
    const match =
      lower.find((h) => !used.has(h.raw) && synonyms.includes(h.norm)) ??
      lower.find((h) => !used.has(h.raw) && synonyms.some((s) => h.norm.includes(s)));
    if (match) {
      mapping[field] = match.raw;
      used.add(match.raw);
    }
  }
  return mapping;
}
