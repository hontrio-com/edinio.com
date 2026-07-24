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
  // gtin/brand vin INAINTEA lui sku: altfel un antet "EAN" / "Cod de bare" ar fi
  // capturat de match-ul larg "cod" al SKU-ului inainte sa ajunga la gtin.
  gtin: ["ean", "gtin", "barcode", "cod de bare", "cod bare", "cod ean", "upc", "ean13"],
  brand: ["brand", "marca", "vendor", "producator", "manufacturer", "fabricant"],
  sku: ["sku", "cod", "cod produs", "product code", "variant sku"],
  category: ["categories", "category", "categorie", "categorii", "product category", "type", "tip"],
  tags: ["tags", "etichete", "tag", "keywords"],
  images: ["images", "image", "imagini", "imagine", "image src", "poze", "photo", "image url", "picture"],
  stock_quantity: ["stock", "stoc", "quantity", "cantitate", "qty", "inventory", "variant inventory qty", "stock quantity"],
  weight: ["weight (kg)", "weight", "greutate", "variant grams", "grams", "masa"],
  shipping_class: ["clasa de transport", "clasa transport", "shipping class", "shipping_class", "clasa livrare"],
  is_active: ["published", "publicat", "active", "activ", "status", "visible", "vizibil", "in stock?"],
  is_featured: ["is featured?", "featured", "recomandat", "is_featured", "promovat"],
  external_id: ["id", "external id", "handle", "product id", "id produs"],
  slug: ["slug", "handle", "link", "permalink", "url key"],
  seo_title: ["seo title", "meta title", "titlu seo", "page title"],
  seo_description: ["seo description", "meta description", "descriere seo", "meta desc"],
  short_description: ["descriere scurta", "short description", "scurta descriere", "rezumat", "excerpt", "short desc"],
  stock_status: ["status stoc", "stock status", "disponibilitate", "availability", "stare stoc"],
  low_stock_threshold: ["prag stoc redus", "prag stoc", "low stock threshold", "low stock", "stoc minim"],
  dim_length: ["lungime (cm)", "lungime", "length", "lungime cm"],
  dim_width: ["latime (cm)", "latime", "width", "latime cm"],
  dim_height: ["inaltime (cm)", "inaltime", "height", "inaltime cm"],
  specifications: ["specificatii", "specifications", "specs", "specificatie", "atribute", "attributes"],
  upsell_mode: ["upsell - mod", "upsell mod", "mod upsell", "upsell mode"],
  upsell_qty2: ["upsell 2 buc - valoare", "upsell 2 buc", "upsell 2", "upsell2"],
  upsell_qty2_badge: ["upsell 2 buc - eticheta", "upsell 2 buc eticheta", "upsell 2 badge", "upsell2 eticheta"],
  upsell_qty3: ["upsell 3 buc - valoare", "upsell 3 buc", "upsell 3", "upsell3"],
  upsell_qty3_badge: ["upsell 3 buc - eticheta", "upsell 3 buc eticheta", "upsell 3 badge", "upsell3 eticheta"],
  variant_options: ["optiuni variante", "optiuni", "variant options", "axe variante"],
  variants: ["variante", "variatii", "variants", "combinatii", "variant combinations"],
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
