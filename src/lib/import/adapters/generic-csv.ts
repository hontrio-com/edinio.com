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
  splitTags,
  splitImages,
  parseBool,
  sanitizeDescription,
  makeSlug,
  truncate,
  htmlToText,
} from "../normalize";

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
    is_active: options.default_active,
    is_featured: m.is_featured ? parseBool(cell(row, m.is_featured)) : false,
    variants: null,
    seo:
      seoTitle || seoDesc
        ? {
            title: truncate(seoTitle || name, 70),
            description: truncate(seoDesc || (description_html ? htmlToText(description_html) : ""), 160),
          }
        : null,
  };
}
