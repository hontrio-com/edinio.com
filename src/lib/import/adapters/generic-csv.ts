// Generic CSV -> StagedProduct[] using the user-confirmed column mapping.
// One row = one product (no multi-row variant collapsing; that is Shopify/Woo
// specific). This is the universal fallback for any other platform's export.

import type { ParsedCsv } from "../csv";
import { cell } from "../csv";
import type { ColumnMapping, ImportOptions, StagedProduct } from "../types";
import {
  cleanText,
  parsePrice,
  parseIntOrNull,
  parseWeightToGrams,
  parseCategoryPath,
  parseSpecifications,
  parseVariants,
  splitTags,
  splitImages,
  parseBool,
  sanitizeDescription,
  makeSlug,
  truncate,
  htmlToText,
} from "../normalize";
import type { StagedDimensions, StagedQuantityTiers } from "../types";

function parseStockStatus(raw: string): "in_stock" | "out_of_stock" | "preorder" | null {
  const s = cleanText(raw).toLowerCase();
  if (!s) return null;
  if (/(out|epuiz|indispon|stoc 0|fara stoc)/.test(s)) return "out_of_stock";
  if (/(pre[\s-]?order|pre[\s-]?comand|precomand)/.test(s)) return "preorder";
  if (/(in stoc|in stock|dispon|da|yes|true|1)/.test(s)) return "in_stock";
  return null;
}

function buildDimensions(l: string, w: string, h: string): StagedDimensions | null {
  const len = parsePrice(l) ?? 0;
  const wid = parsePrice(w) ?? 0;
  const hei = parsePrice(h) ?? 0;
  return (len || wid || hei) ? { length: len, width: wid, height: hei } : null;
}

function buildQuantityTiers(
  modeRaw: string, v2Raw: string, b2: string, v3Raw: string, b3: string,
): StagedQuantityTiers | null {
  const mode: "fixed" | "percent" = /(procent|percent|%)/.test(cleanText(modeRaw).toLowerCase()) ? "percent" : "fixed";
  const v2 = parsePrice(v2Raw);
  const v3 = parsePrice(v3Raw);
  if (!((v2 != null && v2 > 0) || (v3 != null && v3 > 0))) return null;
  return {
    enabled: true,
    mode,
    tier2_price: mode === "fixed" ? (v2 ?? 0) : 0,
    tier2_percent: mode === "percent" ? (v2 ?? 0) : 0,
    tier2_badge: cleanText(b2) || "Cel mai bun pret",
    tier3_price: mode === "fixed" ? (v3 ?? 0) : 0,
    tier3_percent: mode === "percent" ? (v3 ?? 0) : 0,
    tier3_badge: cleanText(b3) || "Oferta speciala",
  };
}

export function genericToStaged(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  options: ImportOptions,
): StagedProduct[] {
  return parsed.rows.map((row) => buildProduct(row, mapping, options));
}

function buildProduct(
  row: Record<string, string>,
  m: ColumnMapping,
  options: ImportOptions,
): StagedProduct {
  const name = cleanText(cell(row, m.name));
  const external_id = cleanText(cell(row, m.external_id)) || null;
  const slugRaw = cleanText(cell(row, m.slug));

  const price = parsePrice(cell(row, m.price)) ?? 0;
  const compareRaw = parsePrice(cell(row, m.compare_at_price));
  const compare_at_price = compareRaw != null && compareRaw > price ? compareRaw : null;

  const description_html = sanitizeDescription(cell(row, m.description));
  const stock = parseIntOrNull(cell(row, m.stock_quantity));
  const tracked = m.stock_quantity ? stock != null && cleanText(cell(row, m.stock_quantity)) !== "" : false;

  const seoTitle = cleanText(cell(row, m.seo_title));
  const seoDesc = cleanText(cell(row, m.seo_description));

  return {
    external_id,
    name: name || external_id || "Produs",
    slug: slugRaw ? makeSlug(slugRaw, external_id) : makeSlug(name, external_id),
    description_html,
    price,
    compare_at_price,
    sku: cleanText(cell(row, m.sku)) || null,
    category_path: parseCategoryPath(cell(row, m.category)),
    tags: splitTags(cell(row, m.tags)),
    images: splitImages(cell(row, m.images)).map((src, i) => ({ src, position: i })),
    track_inventory: tracked,
    stock_quantity: tracked ? stock : null,
    weight_grams: parseWeightToGrams(cell(row, m.weight), options.weight_unit),
    is_active: m.is_active ? parseBool(cell(row, m.is_active), options.default_active) : options.default_active,
    is_featured: m.is_featured ? parseBool(cell(row, m.is_featured)) : false,
    variants: options.collapse_variants
      ? parseVariants(cell(row, m.variant_options), cell(row, m.variants))
      : null,
    seo:
      seoTitle || seoDesc
        ? {
            title: truncate(seoTitle || name, 70),
            description: truncate(seoDesc || (description_html ? htmlToText(description_html) : ""), 160),
          }
        : null,
    short_description: cleanText(cell(row, m.short_description)) || null,
    stock_status: parseStockStatus(cell(row, m.stock_status)),
    low_stock_threshold: parseIntOrNull(cell(row, m.low_stock_threshold)),
    dimensions: buildDimensions(cell(row, m.dim_length), cell(row, m.dim_width), cell(row, m.dim_height)),
    specifications: parseSpecifications(cell(row, m.specifications)),
    quantity_tiers: buildQuantityTiers(
      cell(row, m.upsell_mode),
      cell(row, m.upsell_qty2), cell(row, m.upsell_qty2_badge),
      cell(row, m.upsell_qty3), cell(row, m.upsell_qty3_badge),
    ),
  };
}
