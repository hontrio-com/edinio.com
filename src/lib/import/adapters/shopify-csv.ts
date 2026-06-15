// Shopify product CSV -> StagedProduct[].
// Shopify exports one row per variant/image; rows sharing a Handle belong to the
// same product (extra rows have a blank Title and carry additional variants or
// images). We group by Handle and collapse variants into page_sections.variants.

import { slugify } from "@/lib/utils/slugify";
import type { ParsedCsv } from "../csv";
import { cell } from "../csv";
import type { ImportOptions, StagedProduct, StagedVariantCombination } from "../types";
import {
  cleanText,
  parsePrice,
  parseIntOrNull,
  parseWeightToGrams,
  parseCategoryPath,
  splitTags,
  sanitizeDescription,
  truncate,
  htmlToText,
} from "../normalize";

const MAX_COMBINATIONS = 100;
const dedupe = (a: string[]) => [...new Set(a)];

export function shopifyToStaged(parsed: ParsedCsv, options: ImportOptions): StagedProduct[] {
  // Preserve first-seen order of handles.
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of parsed.rows) {
    const handle = cleanText(row["Handle"]);
    if (!handle) continue;
    const arr = groups.get(handle) ?? [];
    arr.push(row);
    groups.set(handle, arr);
  }

  const out: StagedProduct[] = [];
  for (const [handle, rows] of groups) {
    out.push(buildProduct(handle, rows, options));
  }
  return out;
}

function buildProduct(handle: string, rows: Record<string, string>[], options: ImportOptions): StagedProduct {
  const base = rows[0];

  // Option names live on the base row. "Title"/"Default Title" means "no variants".
  const optionNames = [1, 2, 3]
    .map((i) => cleanText(base[`Option${i} Name`]))
    .filter((n) => n && n.toLowerCase() !== "title");

  // Rows that describe a variant (have a price or an option value), not just an image.
  const variantRows = rows.filter(
    (r) => cleanText(r["Option1 Value"]) || cleanText(r["Variant Price"]),
  );
  const firstVariant = variantRows[0] ?? base;

  // Collect images from every row in the group.
  const images = collectImages(rows);

  const variantPrices = variantRows
    .map((r) => parsePrice(r["Variant Price"]))
    .filter((p): p is number => p != null);
  const basePrice = variantPrices.length ? Math.min(...variantPrices) : parsePrice(firstVariant["Variant Price"]) ?? 0;

  const compareRaw = parsePrice(firstVariant["Variant Compare At Price"]);
  const compare_at_price = compareRaw != null && compareRaw > basePrice ? compareRaw : null;

  const tracked = cleanText(firstVariant["Variant Inventory Tracker"]).toLowerCase() === "shopify";
  const stockSum = variantRows.reduce((s, r) => s + (parseIntOrNull(r["Variant Inventory Qty"]) ?? 0), 0);

  // Shopify "Status" (active/draft/archived) is preferred over the legacy "Published".
  const status = cleanText(base["Status"]).toLowerCase();
  void status; // is_active is governed by the import option (see committer); kept for clarity.

  const description_html = sanitizeDescription(base["Body (HTML)"]);
  const seoTitle = cleanText(base["SEO Title"]);
  const seoDesc = cleanText(base["SEO Description"]);

  let variants: StagedProduct["variants"] = null;
  if (options.collapse_variants && optionNames.length > 0) {
    variants = buildVariants(optionNames, variantRows, basePrice);
  }

  return {
    external_id: handle,
    name: cleanText(base["Title"]) || handle,
    slug: handle, // a Shopify handle is already a slug
    description_html,
    price: basePrice,
    compare_at_price,
    sku: cleanText(firstVariant["Variant SKU"]) || null,
    category_path: parseCategoryPath(base["Product Category"] || base["Type"]),
    tags: splitTags(base["Tags"]),
    images,
    track_inventory: tracked,
    stock_quantity: tracked ? stockSum : null,
    weight_grams: parseWeightToGrams(firstVariant["Variant Grams"], "g"),
    is_active: options.default_active,
    is_featured: false,
    variants,
    seo:
      seoTitle || seoDesc
        ? {
            title: truncate(seoTitle || cleanText(base["Title"]), 70),
            description: truncate(seoDesc || (description_html ? htmlToText(description_html) : ""), 160),
          }
        : null,
  };
}

function collectImages(rows: Record<string, string>[]): StagedProduct["images"] {
  const seen = new Set<string>();
  const imgs: StagedProduct["images"] = [];
  for (const r of rows) {
    const src = cleanText(r["Image Src"]);
    if (!src || !/^https?:\/\//i.test(src) || seen.has(src)) continue;
    seen.add(src);
    imgs.push({
      src,
      alt: cleanText(r["Image Alt Text"]) || undefined,
      position: parseIntOrNull(r["Image Position"]) ?? undefined,
    });
  }
  return imgs.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
}

function buildVariants(
  optionNames: string[],
  variantRows: Record<string, string>[],
  basePrice: number,
): StagedProduct["variants"] {
  const options = optionNames.map((name, i) => ({
    id: slugify(name) || `opt-${i + 1}`,
    name,
    values: dedupe(
      variantRows.map((r) => cleanText(r[`Option${i + 1} Value`])).filter(Boolean),
    ),
  }));

  const combinations: StagedVariantCombination[] = variantRows
    .slice(0, MAX_COMBINATIONS)
    .map((r, idx) => {
      const vals = optionNames
        .map((_, i) => cleanText(r[`Option${i + 1} Value`]))
        .filter(Boolean);
      return {
        id: slugify(vals.join("-")) || slugify(cell(r, "Variant SKU")) || `v${idx + 1}`,
        title: vals.join(" / "),
        price: parsePrice(r["Variant Price"]) ?? basePrice,
        sku: cleanText(r["Variant SKU"]),
        enabled: true,
        stock_quantity: parseIntOrNull(r["Variant Inventory Qty"]) ?? 0,
      };
    });

  return { enabled: true, options, combinations };
}
