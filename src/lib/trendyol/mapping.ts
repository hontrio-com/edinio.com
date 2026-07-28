// Maps an Edinio product + its Trendyol enrichment into Trendyol product items
// (one item per variant/barcode). Trendyol is variant-first: variants share a
// `productMainId` (we use the Edinio product id) and each carries its own barcode.
//
// Preturile pleaca DIRECT, fara conversie: Trendyol le citeste in moneda vitrinei
// alese (RO -> RON). listPrice e pretul taiat cand exista, salePrice cel de
// vanzare, si listPrice trebuie sa fie >= salePrice. Atributele `varianter`
// (marime/culoare) stau pe varianta; restul sunt la nivel de produs si se repeta
// pe fiecare item.
//
// Ce NU trimitem, desi API-ul domestic turcesc le are: `currencyType` (moneda o da
// vitrina) si `cargoCompanyId` (curierul se declara la expediere).

import type { TrendyolConfig, TrendyolProductAttribute, TrendyolProductItem } from "./types";
import { coteTvaVitrina, infoVitrina, tvaImplicitVitrina } from "./types";

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

// Trendyol accepta DOAR https la imagini; una pe http e respinsa la validare si
// pica tot produsul, asa ca o sarim din start.
function productImages(product: MappableProduct): string[] {
  const raw = Array.isArray(product.images) ? product.images : [];
  return raw.map((x) => String(x).trim()).filter((u) => /^https:\/\//i.test(u)).slice(0, 8);
}

/**
 * Barcode-ul, verificat dupa regulile Trendyol.
 *
 * Documentatia lasa litere, cifre si doar `.`, `-`, `_`. Un SKU cu spatii sau
 * diacritice trece de noi si e respins de ei abia dupa procesarea lotului, cu un
 * mesaj greu de legat de produs — deci il prindem aici.
 */
export function verificaBarcode(barcode: string): string | null {
  if (!barcode) return "O variantă nu are barcode.";
  if (barcode.length > 40) return `Barcode-ul „${barcode}" depășește 40 de caractere (limita Trendyol).`;
  if (!/^[A-Za-z0-9._-]+$/.test(barcode)) {
    return `Barcode-ul „${barcode}" conține caractere nepermise. Trendyol acceptă doar litere, cifre, punct, liniuță și underscore.`;
  }
  return null;
}

/**
 * Cota de TVA a variantei, adusa in setul acceptat de vitrina.
 *
 * Vitrina RO primeste doar 0, 11 sau 21. O cota veche (19) sau lipsa ar fi
 * respinsa, deci alegem cea mai apropiata valoare permisa in loc sa trimitem un
 * lot intreg la refuz.
 */
export function tvaPentruVitrina(config: TrendyolConfig, vatRate: number | null): number {
  const permise = coteTvaVitrina(config.storefront);
  if (vatRate == null) return tvaImplicitVitrina(config.storefront);
  if (permise.includes(vatRate)) return vatRate;
  return permise.reduce((best, c) => (Math.abs(c - vatRate) < Math.abs(best - vatRate) ? c : best), permise[0]);
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
  // Curierul si adresele NU mai sunt conditii pentru listare: pe marketplace-ul
  // international curierul se comunica abia la expediere (`providerCode`), iar
  // adresele sunt optionale — Trendyol foloseste implicitele contului. Cerute
  // aici, blocau listarea unor produse perfect valide.

  const images = productImages(product);
  if (images.length === 0) {
    return { error: "Produsul nu are imagini pe https. Trendyol acceptă doar imagini https." };
  }

  const title = stripHtml(product.name).slice(0, 100);
  const description = stripHtml(product.description ?? product.name).slice(0, 30000);
  const weight = productWeight(product, listing);
  const productLevelAttrs = effectiveAttributes(config, product, listing);
  // `productMainId` are aceeasi limita ca barcode-ul: 40 de caractere. Un uuid
  // intra lejer, dar taiem oricum, ca sa nu depinda de forma id-ului.
  const productMainId = product.id.slice(0, 40);

  const enabled = ctx.variants.filter((v) => v.enabled);
  if (enabled.length === 0) return { error: "Nicio variantă activă de listat." };
  const single = enabled.length === 1;

  const items: TrendyolProductItem[] = [];
  for (const v of enabled) {
    // Barcode is the cross-endpoint identifier (create, inventory, order match); it
    // must be identical everywhere, so reject bad ones rather than silently fixing.
    const barcode = (v.barcode || "").trim();
    const problema = verificaBarcode(barcode);
    if (problema) return { error: problema };
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
      listPrice: priced.listPrice,
      salePrice: priced.salePrice,
      vatRate: tvaPentruVitrina(config, v.vat_rate),
      images: images.map((url) => ({ url })),
      attributes: [...productLevelAttrs, ...(Array.isArray(v.attributes) ? v.attributes : [])],
    };
    // Adresele sunt optionale: le trimitem doar daca vanzatorul a ales explicit
    // altele decat implicitele contului sau.
    if (config.shipment_address_id) item.shipmentAddressId = config.shipment_address_id;
    if (config.returning_address_id) item.returningAddressId = config.returning_address_id;
    items.push(item);
  }
  return { items };
}

/** Moneda in care Trendyol citeste preturile trimise, dupa vitrina aleasa. */
export function monedaVitrina(config: TrendyolConfig): string {
  return infoVitrina(config.storefront).moneda;
}
