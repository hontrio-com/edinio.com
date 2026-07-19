// Maps an Edinio product + its Trendyol enrichment into Trendyol product items
// (one item per variant/barcode). Trendyol is variant-first: variants share a
// `productMainId` (we use the Edinio product id) and each carries its own barcode.
//
// Pricing is DIRECT in RON (decision: Trendyol RO) — no FX. listPrice is the
// crossed-out (compare-at) price when higher, salePrice the selling price;
// listPrice must be >= salePrice. `varianter` attributes (size/color) live on the
// variant; the rest are product-level and repeated on every item.

import type { TrendyolConfig, TrendyolProductAttribute, TrendyolProductItem } from "./types";
import { TRENDYOL_CURRENCY, TRENDYOL_DEFAULT_VAT } from "./types";

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
  track_inventory?: boolean | null;
  stock_quantity?: number | null;
  page_sections?: {
    variants?: {
      enabled?: boolean;
      combinations?: { id: string; title: string; price: string; sku: string; enabled: boolean }[];
    };
  } | null;
}

export interface TrendyolListingEnrichment {
  brand_id: number | null;
  category_id: number | null;
  attributes: TrendyolProductAttribute[]; // product-level (non-varianter)
  dimensional_weight: number | null;
  cargo_company_id: number | null;
}

export interface TrendyolVariantData {
  barcode: string;
  stock_code: string | null;
  attributes: TrendyolProductAttribute[]; // per-variant (varianter, e.g. size/color)
  quantity: number | null;
  list_price: number | null;
  sale_price: number | null;
  vat_rate: number | null;
  enabled: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

function productImages(product: MappableProduct): string[] {
  const raw = Array.isArray(product.images) ? product.images : [];
  return raw.map((x) => String(x).trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 8);
}

function productWeight(product: MappableProduct, listing: TrendyolListingEnrichment): number {
  if (listing.dimensional_weight && listing.dimensional_weight > 0) return listing.dimensional_weight;
  const kg = product.weight_grams && product.weight_grams > 0 ? product.weight_grams / 1000 : 1;
  return Math.max(0.1, round2(kg));
}

// ── Variant slots (derived from the Edinio product for the editor) ────────────
export interface VariantSlot { key: string; label: string; barcode: string; ron_price: number }

export function deriveVariantSlots(product: MappableProduct): VariantSlot[] {
  const v = product.page_sections?.variants;
  if (v?.enabled && Array.isArray(v.combinations) && v.combinations.length > 0) {
    return v.combinations
      .filter((c) => c.enabled !== false)
      .map((c, i) => ({
        key: c.id || `c${i}`,
        label: (c.title || `Variantă ${i + 1}`).trim(),
        barcode: (c.sku || `${product.id}-${c.id || i}`).trim(),
        ron_price: Number(c.price) > 0 ? Number(c.price) : product.price,
      }));
  }
  return [{ key: "default", label: "Unic", barcode: (product.sku || product.id).trim(), ron_price: product.price }];
}

// Resolve the quantity to send for a variant. Shared by createProducts (buildTrendyolItems)
// AND the inventory push (sync.computeInventoryItems) so a listed product never gets a
// different stock across the two paths. Single-variant products with inventory tracking
// take the product's own stock; explicit per-variant quantities win otherwise.
export function resolveVariantQuantity(
  product: { track_inventory?: boolean | null; stock_quantity?: number | null },
  variantQuantity: number | null,
  single: boolean,
  forceZero = false,
): number {
  let qty: number;
  if (forceZero) qty = 0;
  else if (single && product.track_inventory) qty = product.stock_quantity ?? 0;
  else if (variantQuantity != null) qty = variantQuantity;
  else if (product.track_inventory) qty = product.stock_quantity ?? 0;
  else qty = 100;
  return Math.max(0, Math.min(20000, Math.round(qty)));
}

// ── Price building (direct RON) ───────────────────────────────────────────────
export function buildVariantPrices(product: MappableProduct, variant: TrendyolVariantData): { listPrice: number; salePrice: number } | { error: string } {
  const onSale = product.compare_at_price != null && product.compare_at_price > product.price;
  const sale = variant.sale_price != null && variant.sale_price > 0 ? variant.sale_price : product.price;
  let list = variant.list_price != null && variant.list_price > 0
    ? variant.list_price
    : (onSale ? (product.compare_at_price as number) : product.price);
  if (!(sale > 0)) return { error: `Prețul variantei ${variant.barcode} este 0.` };
  if (list < sale) list = sale; // Trendyol requires listPrice >= salePrice
  return { listPrice: round2(list), salePrice: round2(sale) };
}

// ── Item building ─────────────────────────────────────────────────────────────
export interface BuildContext {
  config: TrendyolConfig;
  product: MappableProduct;
  listing: TrendyolListingEnrichment;
  variants: TrendyolVariantData[];
}

export function effectiveCategoryId(config: TrendyolConfig, product: MappableProduct, listing: TrendyolListingEnrichment): number | null {
  if (listing.category_id) return listing.category_id;
  const entry = product.category ? config.category_map?.[product.category] : undefined;
  return entry?.category_id ?? null;
}
export function effectiveBrandId(config: TrendyolConfig, product: MappableProduct, listing: TrendyolListingEnrichment): number | null {
  if (listing.brand_id) return listing.brand_id;
  const entry = product.category ? config.category_map?.[product.category] : undefined;
  return entry?.brand_id ?? config.brand_id ?? null;
}
function effectiveAttributes(config: TrendyolConfig, product: MappableProduct, listing: TrendyolListingEnrichment): TrendyolProductAttribute[] {
  if (listing.attributes && listing.attributes.length > 0) return listing.attributes;
  const entry = product.category ? config.category_map?.[product.category] : undefined;
  return entry?.attributes ?? [];
}

export function buildTrendyolItems(ctx: BuildContext): { items: TrendyolProductItem[] } | { error: string } {
  const { config, product, listing } = ctx;

  const brandId = effectiveBrandId(config, product, listing);
  if (!brandId) return { error: "Alege brandul Trendyol." };
  const categoryId = effectiveCategoryId(config, product, listing);
  if (!categoryId) return { error: "Categoria produsului nu este mapată la Trendyol." };
  const cargoCompanyId = listing.cargo_company_id ?? config.default_cargo_company_id;
  if (!cargoCompanyId) return { error: "Alege compania de curierat Trendyol." };
  if (!config.shipment_address_id || !config.returning_address_id) {
    return { error: "Setează adresele de expediere și retur în setări." };
  }

  const images = productImages(product);
  if (images.length === 0) return { error: "Produsul nu are imagini valide." };

  const title = stripHtml(product.name).slice(0, 100);
  const description = stripHtml(product.description ?? product.name).slice(0, 30000);
  const weight = productWeight(product, listing);
  const productLevelAttrs = effectiveAttributes(config, product, listing);
  const currencyType = config.currency || TRENDYOL_CURRENCY;
  const productMainId = product.id;

  const enabled = ctx.variants.filter((v) => v.enabled);
  if (enabled.length === 0) return { error: "Nicio variantă activă de listat." };
  const single = enabled.length === 1;

  const items: TrendyolProductItem[] = [];
  for (const v of enabled) {
    const barcode = (v.barcode || "").trim();
    if (!barcode) return { error: "O variantă nu are barcode." };
    // Barcode is the cross-endpoint identifier (create, inventory, order match); it
    // must be identical everywhere, so reject > 40 rather than silently truncating.
    if (barcode.length > 40) return { error: `Barcode-ul „${barcode}" depășește 40 de caractere (limita Trendyol).` };
    const priced = buildVariantPrices(product, v);
    if ("error" in priced) return priced;

    const item: TrendyolProductItem = {
      barcode,
      title,
      productMainId,
      brandId,
      categoryId,
      quantity: resolveVariantQuantity(product, v.quantity, single),
      stockCode: (v.stock_code || barcode).slice(0, 100),
      dimensionalWeight: weight,
      description,
      currencyType,
      listPrice: priced.listPrice,
      salePrice: priced.salePrice,
      vatRate: v.vat_rate ?? TRENDYOL_DEFAULT_VAT,
      cargoCompanyId,
      images: images.map((url) => ({ url })),
      attributes: [...productLevelAttrs, ...(Array.isArray(v.attributes) ? v.attributes : [])],
      shipmentAddressId: config.shipment_address_id,
      returningAddressId: config.returning_address_id,
    };
    items.push(item);
  }
  return { items };
}
