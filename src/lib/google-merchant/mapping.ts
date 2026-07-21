// Maps an Edinio product to a Merchant API productInput payload.

import { storeBaseUrl } from "@/lib/seo";
import { parseVariants, VARIANT_TITLE_SEP, comboUnitPrice, comboCompareAtPrice } from "@/lib/storefront/variants";
import { CURRENCY, DEFAULT_CONTENT_LANGUAGE, DEFAULT_FEED_LABEL, type GoogleMerchantConfig } from "./types";

export interface MappableBusiness {
  slug: string;
  custom_domain: string | null;
  store_name: string | null;
  business_name: string;
}

export interface MappableProduct {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: unknown;
  category: string | null;
  track_inventory: boolean;
  stock_quantity: number | null;
  weight_grams: number | null;
  is_bundle?: boolean;
  page_sections?: unknown;
}

// Optional per-product Google overrides, stored in page_sections.google.
interface GoogleAttrs {
  brand?: string;
  gtin?: string;
  mpn?: string;
  condition?: string;
  google_product_category?: string;
  gender?: string;
  age_group?: string;
  color?: string;
  size?: string;
  material?: string;
  custom_label_0?: string;
  custom_label_1?: string;
  custom_label_2?: string;
  custom_label_3?: string;
  custom_label_4?: string;
}

function priceMicros(value: number) {
  return { amountMicros: String(Math.round((Number(value) || 0) * 1_000_000)), currencyCode: CURRENCY };
}

// v1 turned these free-text attributes into enums; normalize merchant-entered
// lowercase values ("new", "male") to the enum names, dropping unknown values.
function toEnum(value: string | undefined, allowed: string[]): string | undefined {
  const v = (value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  return allowed.includes(v) ? v : undefined;
}
const CONDITIONS = ["NEW", "REFURBISHED", "USED"];
const GENDERS = ["MALE", "FEMALE", "UNISEX"];
const AGE_GROUPS = ["ADULT", "KIDS", "TODDLER", "INFANT", "NEWBORN"];

function plainText(html: string | null, fallback: string): string {
  const text = (html ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, 4900);
}

// A GTIN must be 8/12/13/14 digits with a valid mod-10 check digit; sending an
// invalid one gets the product disapproved, so we drop it rather than submit it.
function isValidGtin(raw: string | undefined): boolean {
  const s = (raw ?? "").replace(/\s/g, "");
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(s)) return false;
  const d = s.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function toGoogleProductInput(
  business: MappableBusiness,
  product: MappableProduct,
  config: GoogleMerchantConfig,
): Record<string, unknown> {
  const lang = config.content_language || DEFAULT_CONTENT_LANGUAGE;
  const feedLabel = config.feed_label || DEFAULT_FEED_LABEL;

  const images = Array.isArray(product.images) ? product.images.map(String).filter(Boolean) : [];
  const link = `${storeBaseUrl({ slug: business.slug, custom_domain: business.custom_domain })}/product/${product.slug ?? product.id}`;
  const inStock = !product.track_inventory || (product.stock_quantity ?? 0) > 0;

  const base = Number(product.price) || 0;
  const compare = product.compare_at_price != null ? Number(product.compare_at_price) : null;
  const hasSale = compare != null && compare > base;

  const g = ((product.page_sections as { google?: GoogleAttrs } | null)?.google) ?? {};
  const validGtin = isValidGtin(g.gtin);
  const hasIdentifier = !!(validGtin || g.mpn);

  const attributes: Record<string, unknown> = {
    title: product.name.slice(0, 150),
    description: plainText(product.description, product.name),
    link,
    availability: inStock ? "IN_STOCK" : "OUT_OF_STOCK",
    condition: toEnum(g.condition || config.condition_default, CONDITIONS) ?? "NEW",
    brand: g.brand || config.brand_default || business.store_name || business.business_name,
    // List price shows as the strike-through price when a sale price is present.
    price: hasSale ? priceMicros(compare!) : priceMicros(base),
    identifierExists: hasIdentifier,
  };
  if (hasSale) attributes.salePrice = priceMicros(base);
  if (images[0]) attributes.imageLink = images[0];
  if (images.length > 1) attributes.additionalImageLinks = images.slice(1, 10);
  const googleCat = g.google_product_category || (product.category ? config.category_map?.[product.category] : undefined);
  if (googleCat) attributes.googleProductCategory = googleCat;
  // v1 renamed the single `gtin` attribute to a `gtins` array. Only valid GTINs
  // are submitted; an invalid one would disapprove the product.
  if (validGtin) attributes.gtins = [g.gtin!.replace(/\s/g, "")];
  if (g.mpn) attributes.mpn = g.mpn;
  const gender = toEnum(g.gender, GENDERS);
  if (gender) attributes.gender = gender;
  const ageGroup = toEnum(g.age_group, AGE_GROUPS);
  if (ageGroup) attributes.ageGroup = ageGroup;
  if (g.color) attributes.color = g.color;
  if (g.size) attributes.size = g.size;
  if (g.material) attributes.material = g.material;
  if (g.custom_label_0) attributes.customLabel0 = g.custom_label_0;
  if (g.custom_label_1) attributes.customLabel1 = g.custom_label_1;
  if (g.custom_label_2) attributes.customLabel2 = g.custom_label_2;
  if (g.custom_label_3) attributes.customLabel3 = g.custom_label_3;
  if (g.custom_label_4) attributes.customLabel4 = g.custom_label_4;
  // Bundles (Edinio is_bundle) map to Google's is_bundle attribute.
  if (product.is_bundle) attributes.isBundle = true;
  // Weight feeds carrier-calculated rates; a bare `shipping: [{country}]` entry
  // (pre-v1 shape) would instead override the account's shipping settings.
  if (product.weight_grams) attributes.shippingWeight = { value: product.weight_grams, unit: "g" };

  // v1 renamed ProductInput.attributes -> productAttributes.
  return {
    offerId: product.id,
    contentLanguage: lang,
    feedLabel,
    productAttributes: attributes,
  };
}

export interface OfferInput {
  offerId: string;
  input: Record<string, unknown>;
}

// Option axes we can auto-map to Google's color/size/material attributes by name.
const COLOR_OPTION_RE = /cul|colou?r/i;
const SIZE_OPTION_RE = /m[aă]rim|size|talie|numar|număr/i;
const MATERIAL_OPTION_RE = /material|tesatur|țesătur|compozi/i;

/**
 * Expand a product into one or more Merchant offers. Simple products yield a
 * single offer (offerId = product.id). Variable products yield one offer per
 * ENABLED combination, linked by `itemGroupId`, each carrying its own price,
 * sale price, availability and (auto-derived) color/size from the variant axes.
 * The cron reconciles the returned offer ids against what was previously synced,
 * so switching a product simple<->variable cleans up stale offers automatically.
 */
export function expandProductOffers(
  business: MappableBusiness,
  product: MappableProduct,
  config: GoogleMerchantConfig,
): OfferInput[] {
  const variants = parseVariants(product.page_sections);
  const enabled = variants?.combinations.filter((c) => c.enabled && c.title) ?? [];
  const base = toGoogleProductInput(business, product, config);
  if (!variants || enabled.length === 0) {
    return [{ offerId: product.id, input: base }];
  }

  const lang = base.contentLanguage as string;
  const feedLabel = base.feedLabel as string;
  const baseAttrs = base.productAttributes as Record<string, unknown>;
  const basePrice = Number(product.price) || 0;
  const baseCompare = product.compare_at_price != null ? Number(product.compare_at_price) : null;
  // Assign each option axis to a DISTINCT Google variant attribute so every
  // combination has a unique attribute set — Google disapproves an item_group
  // whose members don't each differ by a variant attribute. Recognized axes map
  // by name (color/size/material); the rest fill the leftover slots.
  const VARIANT_SLOTS = ["color", "size", "material", "pattern"] as const;
  const usedSlots = new Set<string>();
  const slotFor: (string | undefined)[] = variants.options.map((o) => {
    const named = COLOR_OPTION_RE.test(o.name) ? "color"
      : SIZE_OPTION_RE.test(o.name) ? "size"
      : MATERIAL_OPTION_RE.test(o.name) ? "material" : undefined;
    if (named && !usedSlots.has(named)) { usedSlots.add(named); return named; }
    return undefined;
  });
  variants.options.forEach((_, i) => {
    if (slotFor[i]) return;
    const free = VARIANT_SLOTS.find((s) => !usedSlots.has(s));
    if (free) { usedSlots.add(free); slotFor[i] = free; }
  });

  return enabled.map((combo) => {
    const offerId = `${product.id}-${combo.id}`.slice(0, 50);
    const parts = combo.title.split(VARIANT_TITLE_SEP);
    const attrs: Record<string, unknown> = { ...baseAttrs };
    attrs.title = `${product.name} - ${combo.title}`.slice(0, 150);
    attrs.itemGroupId = product.id;
    // No per-variant identifiers exist in our model; a product-level GTIN shared
    // across variants would be a duplicate-GTIN disapproval, so strip identifiers.
    delete attrs.gtins;
    delete attrs.mpn;
    attrs.identifierExists = false;

    const unit = comboUnitPrice(combo, basePrice) || basePrice;
    const compare = comboCompareAtPrice(combo, baseCompare);
    const hasSale = compare != null && compare > unit;
    attrs.price = priceMicros(hasSale ? compare : unit);
    if (hasSale) attrs.salePrice = priceMicros(unit);
    else delete attrs.salePrice;

    const stock = combo.stock_quantity != null && String(combo.stock_quantity).trim() !== "" ? Number(combo.stock_quantity) : null;
    if (product.track_inventory && stock != null && Number.isFinite(stock)) {
      attrs.availability = stock > 0 ? "IN_STOCK" : "OUT_OF_STOCK";
    }
    // Differentiating attributes — guarantees a unique variant attribute set.
    variants.options.forEach((_, i) => {
      const slot = slotFor[i];
      if (slot && parts[i]) attrs[slot] = parts[i];
    });
    if (combo.image) attrs.imageLink = combo.image;

    return { offerId, input: { offerId, contentLanguage: lang, feedLabel, productAttributes: attrs } };
  });
}
