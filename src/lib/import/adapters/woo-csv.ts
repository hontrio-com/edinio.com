// WooCommerce product CSV -> StagedProduct[].
// Woo exports one row per product; variations are separate rows with
// Type="variation" whose "Parent" cell references the parent by SKU or "id:NN".
// Variant attributes live in "Attribute N name" / "Attribute N value(s)" columns.

import { slugify } from "@/lib/utils/slugify";
import type { ParsedCsv } from "../csv";
import type { ImportOptions, StagedProduct, StagedVariantCombination, StagedVariantOption } from "../types";
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

const MAX_COMBINATIONS = 100;
const dedupe = (a: string[]) => [...new Set(a)];

interface AttrCol {
  index: number;
  nameHeader: string;
  valueHeader: string;
}

export function wooToStaged(parsed: ParsedCsv, options: ImportOptions): StagedProduct[] {
  const attrCols = findAttributeColumns(parsed.headers);

  const isVariation = (r: Record<string, string>) => cleanText(r["Type"]).toLowerCase() === "variation";
  const parents = parsed.rows.filter((r) => !isVariation(r));
  const variations = parsed.rows.filter(isVariation);

  // Index parents so variations can find them by SKU or by "id:NN".
  const bySku = new Map<string, Record<string, string>>();
  const byId = new Map<string, Record<string, string>>();
  for (const p of parents) {
    const sku = cleanText(p["SKU"]);
    if (sku) bySku.set(sku, p);
    const id = cleanText(p["ID"]);
    if (id) byId.set(id, p);
  }

  const variationsByParent = new Map<Record<string, string>, Record<string, string>[]>();
  for (const v of variations) {
    const ref = cleanText(v["Parent"]);
    let parent = bySku.get(ref);
    if (!parent && ref.toLowerCase().startsWith("id:")) parent = byId.get(ref.slice(3));
    if (!parent) continue;
    const arr = variationsByParent.get(parent) ?? [];
    arr.push(v);
    variationsByParent.set(parent, arr);
  }

  return parents.map((p) => buildProduct(p, variationsByParent.get(p) ?? [], attrCols, options));
}

function buildProduct(
  p: Record<string, string>,
  variationRows: Record<string, string>[],
  attrCols: AttrCol[],
  options: ImportOptions,
): StagedProduct {
  const name = cleanText(p["Name"]);
  const sku = cleanText(p["SKU"]);
  const id = cleanText(p["ID"]);
  const external_id = sku || (id ? `id:${id}` : null) || (name ? slugify(name) : null);

  // Price: Woo "Regular price" is the original; "Sale price" is the active price.
  // We map to price = active selling price, compare_at_price = the struck-through one.
  const { price, compare_at_price } = resolvePrice(p, variationRows);

  const description_html = sanitizeDescription(p["Description"] || p["Short description"]);
  const stock = parseIntOrNull(p["Stock"]);
  const tracked = stock != null && cleanText(p["Stock"]) !== "";

  let variants: StagedProduct["variants"] = null;
  if (options.collapse_variants && variationRows.length > 0 && attrCols.length > 0) {
    variants = buildVariants(p, variationRows, attrCols, price);
  }

  return {
    external_id,
    name: name || external_id || "Produs",
    slug: makeSlug(name, external_id),
    description_html,
    price,
    compare_at_price,
    sku: sku || null,
    category_path: parseCategoryPath(p["Categories"]),
    tags: splitTags(p["Tags"]),
    images: splitImages(p["Images"]).map((src, i) => ({ src, position: i })),
    track_inventory: tracked,
    stock_quantity: tracked ? stock : null,
    weight_grams: parseWeightToGrams(p["Weight (kg)"], "kg"),
    is_active: options.default_active,
    is_featured: parseBool(p["Is featured?"]),
    variants,
    seo: buildSeo(p, name, description_html),
  };
}

function resolvePrice(
  p: Record<string, string>,
  variationRows: Record<string, string>[],
): { price: number; compare_at_price: number | null } {
  let regular = parsePrice(p["Regular price"]);
  let sale = parsePrice(p["Sale price"]);

  // Variable products often leave the parent price blank: derive from variations.
  if (regular == null && variationRows.length > 0) {
    const regs = variationRows.map((v) => parsePrice(v["Regular price"])).filter((n): n is number => n != null);
    const sales = variationRows.map((v) => parsePrice(v["Sale price"])).filter((n): n is number => n != null);
    if (regs.length) regular = Math.min(...regs);
    if (sales.length) sale = Math.min(...sales);
  }

  if (sale != null && regular != null && sale < regular) {
    return { price: sale, compare_at_price: regular };
  }
  return { price: regular ?? sale ?? 0, compare_at_price: null };
}

function buildVariants(
  parent: Record<string, string>,
  variationRows: Record<string, string>[],
  attrCols: AttrCol[],
  basePrice: number,
): StagedProduct["variants"] {
  // Only attributes that the parent actually names are real options.
  const namedAttrs = attrCols
    .map((c) => ({ col: c, name: cleanText(parent[c.nameHeader]) }))
    .filter((a) => a.name);

  const optionDefs: StagedVariantOption[] = namedAttrs.map((a, i) => {
    // Parent lists all values pipe-separated; fall back to values seen in variations.
    const fromParent = cleanText(parent[a.col.valueHeader])
      .split("|")
      .map((v) => v.trim())
      .filter(Boolean);
    const fromVariations = variationRows.map((v) => cleanText(v[a.col.valueHeader])).filter(Boolean);
    return {
      id: slugify(a.name) || `opt-${i + 1}`,
      name: a.name,
      values: dedupe(fromParent.length ? fromParent : fromVariations),
    };
  });

  const combinations: StagedVariantCombination[] = variationRows
    .slice(0, MAX_COMBINATIONS)
    .map((v, idx) => {
      const vals = namedAttrs.map((a) => cleanText(v[a.col.valueHeader])).filter(Boolean);
      const { price } = resolvePrice(v, []);
      return {
        id: slugify(vals.join("-")) || slugify(cleanText(v["SKU"])) || `v${idx + 1}`,
        title: vals.join(" / "),
        price: price || basePrice,
        sku: cleanText(v["SKU"]),
        enabled: true,
        stock_quantity: parseIntOrNull(v["Stock"]) ?? 0,
      };
    });

  return { enabled: true, options: optionDefs, combinations };
}

function buildSeo(
  p: Record<string, string>,
  name: string,
  description_html: string | null,
): StagedProduct["seo"] {
  // Woo core CSV has no SEO columns; some SEO plugins add them. Be tolerant.
  const title = cleanText(p["SEO Title"] || p["Meta: _yoast_wpseo_title"]);
  const desc = cleanText(p["SEO Description"] || p["Meta: _yoast_wpseo_metadesc"]);
  if (!title && !desc) return null;
  return {
    title: truncate(title || name, 70),
    description: truncate(desc || (description_html ? htmlToText(description_html) : ""), 160),
  };
}

function findAttributeColumns(headers: string[]): AttrCol[] {
  const cols: AttrCol[] = [];
  for (const h of headers) {
    const m = h.match(/^attribute\s+(\d+)\s+name$/i);
    if (!m) continue;
    const index = parseInt(m[1], 10);
    const valueHeader = headers.find((x) => new RegExp(`^attribute\\s+${index}\\s+value\\(s\\)$`, "i").test(x));
    if (valueHeader) cols.push({ index, nameHeader: h, valueHeader });
  }
  return cols.sort((a, b) => a.index - b.index);
}
