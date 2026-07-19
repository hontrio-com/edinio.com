// Maps an Edinio product + its About You enrichment into About You product items
// (one item per variant/SKU). About You is variant-first: variants share a
// `style_key` (we use the Edinio product id) and each carries its own `sku`.
//
// Pricing (v1 decision: auto RON -> EUR). In `fx_from_ron` mode the EUR price is
// computed from the product's RON price at sync time (so it always reflects the
// current rate); in `manual_eur` mode the per-variant EUR price is used. Prices
// are emitted per ship country. Per-variant RON pricing is a later refinement.

import type {
  AboutYouConfig, AboutYouFxConfig, AboutYouMaterialCluster, AboutYouPrice,
  AboutYouProductItem,
} from "./types";
import { DEFAULT_COUNTRY_OF_ORIGIN } from "./types";

// ── Edinio-side shapes ────────────────────────────────────────────────────────
export interface MappableProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;                     // RON
  compare_at_price: number | null;   // RON
  images: unknown;                   // Json: array of URL strings
  category: string | null;
  sku: string | null;
  weight_grams: number | null;
  page_sections?: {
    variants?: {
      enabled?: boolean;
      combinations?: { id: string; title: string; price: string; sku: string; enabled: boolean }[];
    };
  } | null;
}

// Material composition stored on the listing, tagged with the type the category
// expects (textile carries fractions, non-textile does not).
export interface AboutYouStoredMaterial {
  type: "textile" | "non-textile";
  clusters: AboutYouMaterialCluster[];
}

export interface AboutYouListingEnrichment {
  brand_id: number | null;
  category_id: number | null;
  color_id: number | null;
  attributes: number[];
  material_composition: AboutYouStoredMaterial | null;
  country_of_origin: string | null;
  hs_code: string | null;
}

export interface AboutYouVariantData {
  sku: string;
  ean: string | null;
  size_id: number | null;
  second_size_id: number | null;
  color_id: number | null;
  quantity: number | null;
  retail_price_eur: number | null;
  sale_price_eur: number | null;
  enabled: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// 1 EUR = <rate> RON; apply an optional margin (%). Returns null if no valid rate.
export function ronToEur(ron: number, fx?: AboutYouFxConfig): number | null {
  const rate = fx?.rate;
  if (!rate || rate <= 0 || !(ron > 0)) return null;
  const margin = Math.max(0, fx?.margin_pct ?? 0) / 100;
  return round2((ron / rate) * (1 + margin));
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productImages(product: MappableProduct): string[] {
  const raw = Array.isArray(product.images) ? product.images : [];
  return raw.map((x) => String(x).trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 10);
}

function productWeight(product: MappableProduct): number {
  const w = product.weight_grams && product.weight_grams > 0 ? product.weight_grams : 500;
  return Math.min(100000, Math.max(1, Math.round(w)));
}

// ── Variant slots (derived from the Edinio product for the editor) ────────────
export interface VariantSlot { key: string; label: string; sku: string; ron_price: number }

export function deriveVariantSlots(product: MappableProduct): VariantSlot[] {
  const v = product.page_sections?.variants;
  if (v?.enabled && Array.isArray(v.combinations) && v.combinations.length > 0) {
    return v.combinations
      .filter((c) => c.enabled !== false)
      .map((c, i) => ({
        key: c.id || `c${i}`,
        label: (c.title || `Variantă ${i + 1}`).trim(),
        sku: (c.sku || `${product.id}-${c.id || i}`).trim(),
        ron_price: Number(c.price) > 0 ? Number(c.price) : product.price,
      }));
  }
  return [{ key: "default", label: "Unic", sku: (product.sku || product.id).trim(), ron_price: product.price }];
}

// ── Price building ────────────────────────────────────────────────────────────
export function buildVariantPrices(
  config: AboutYouConfig, product: MappableProduct, variant: AboutYouVariantData,
): { prices: AboutYouPrice[] } | { error: string } {
  const countries = config.ship_countries ?? [];
  if (countries.length === 0) return { error: "Alege cel puțin o țară de listare." };

  let retail: number | null;
  let sale: number | null = null;

  if (config.price_mode === "manual_eur") {
    retail = variant.retail_price_eur;
    sale = variant.sale_price_eur ?? null;
    if (retail == null || !(retail > 0)) return { error: `Setează prețul EUR pentru varianta ${variant.sku}.` };
  } else {
    // fx_from_ron: retail = the crossed-out (compare-at) price when it is higher,
    // sale = the actual selling price; otherwise just the selling price.
    const onSale = product.compare_at_price != null && product.compare_at_price > product.price;
    const ronRetail = onSale ? (product.compare_at_price as number) : product.price;
    const ronSale = onSale ? product.price : null;
    retail = ronToEur(ronRetail, config.fx);
    sale = ronSale != null ? ronToEur(ronSale, config.fx) : null;
    if (retail == null) return { error: "Setează cursul valutar RON -> EUR în setări." };
  }

  const prices = countries.map<AboutYouPrice>((c) => ({
    country_code: c,
    retail_price: retail as number,
    ...(sale != null && sale > 0 ? { sale_price: sale } : {}),
  }));
  return { prices };
}

// ── Item building ─────────────────────────────────────────────────────────────
export interface BuildContext {
  config: AboutYouConfig;
  product: MappableProduct;
  listing: AboutYouListingEnrichment;
  variants: AboutYouVariantData[];
}

// Effective category id: listing override, else the store's category_map entry.
export function effectiveCategoryId(config: AboutYouConfig, product: MappableProduct, listing: AboutYouListingEnrichment): number | null {
  if (listing.category_id) return listing.category_id;
  const entry = product.category ? config.category_map?.[product.category] : undefined;
  return entry?.category_id ?? null;
}

function effectiveAttributes(config: AboutYouConfig, product: MappableProduct, listing: AboutYouListingEnrichment): number[] {
  if (listing.attributes && listing.attributes.length > 0) return listing.attributes;
  const entry = product.category ? config.category_map?.[product.category] : undefined;
  return entry?.attributes ?? [];
}

// Human-readable validation issues (empty = ready to list). Used by the editor.
export function validateListing(ctx: BuildContext): string[] {
  const { config, product, listing } = ctx;
  const issues: string[] = [];
  const brand = listing.brand_id ?? config.brand_id;
  if (!brand) issues.push("Lipsește brandul About You.");
  if (!effectiveCategoryId(config, product, listing)) issues.push("Categoria nu este mapată la About You.");
  if (!listing.color_id && !ctx.variants.some((v) => v.color_id)) issues.push("Lipsește culoarea.");
  if (productImages(product).length === 0) issues.push("Produsul nu are imagini valide (URL http/https).");
  const enabled = ctx.variants.filter((v) => v.enabled);
  if (enabled.length === 0) issues.push("Nicio variantă activă de listat.");
  for (const v of enabled) {
    if (!v.sku) issues.push("O variantă nu are SKU.");
    if (!v.ean) issues.push(`Varianta ${v.sku || "?"} nu are cod EAN.`);
  }
  return issues;
}

export function buildAboutYouItems(ctx: BuildContext): { items: AboutYouProductItem[] } | { error: string } {
  const { config, product, listing } = ctx;

  const brand = listing.brand_id ?? config.brand_id;
  if (!brand) return { error: "Alege brandul About You." };
  const category = effectiveCategoryId(config, product, listing);
  if (!category) return { error: "Categoria produsului nu este mapată la About You." };

  const images = productImages(product);
  if (images.length === 0) return { error: "Produsul nu are imagini valide." };

  const weight = productWeight(product);
  const countryOfOrigin = (listing.country_of_origin || config.default_country_of_origin || DEFAULT_COUNTRY_OF_ORIGIN).toUpperCase();
  const attributes = effectiveAttributes(config, product, listing);
  const name = stripHtml(product.name).slice(0, 120);
  const styleKey = product.id;

  const material = listing.material_composition;
  const materialFields: Pick<AboutYouProductItem, "material_composition_textile" | "material_composition_non_textile"> = {};
  if (material && material.type && Array.isArray(material.clusters) && material.clusters.length > 0) {
    if (material.type === "textile") materialFields.material_composition_textile = material.clusters;
    else materialFields.material_composition_non_textile = material.clusters;
  }

  const enabled = ctx.variants.filter((v) => v.enabled);
  if (enabled.length === 0) return { error: "Nicio variantă activă de listat." };

  const items: AboutYouProductItem[] = [];
  for (const v of enabled) {
    if (!v.sku) return { error: "O variantă nu are SKU." };
    const color = v.color_id ?? listing.color_id;
    if (!color) return { error: "Lipsește culoarea produsului." };
    const priced = buildVariantPrices(config, product, v);
    if ("error" in priced) return priced;

    const item: AboutYouProductItem = {
      style_key: styleKey,
      sku: v.sku,
      color,
      brand,
      category,
      weight,
      country_of_origin: countryOfOrigin,
      attributes,
      prices: priced.prices,
      images,
      name,
      ...materialFields,
    };
    if (v.ean) item.ean = v.ean;
    if (listing.hs_code) item.hs_code = listing.hs_code;
    if (v.size_id) item.size = v.size_id;
    if (v.second_size_id) item.second_size = v.second_size_id;
    if (v.quantity != null && v.quantity >= 0) item.quantity = v.quantity;
    items.push(item);
  }
  return { items };
}
