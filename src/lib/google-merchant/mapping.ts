// Maps an Edinio product to a Merchant API productInput payload.

import { storeBaseUrl } from "@/lib/seo";
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
}

function priceMicros(value: number) {
  return { amountMicros: String(Math.round((Number(value) || 0) * 1_000_000)), currencyCode: CURRENCY };
}

function plainText(html: string | null, fallback: string): string {
  const text = (html ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, 4900);
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
  const hasIdentifier = !!(g.gtin || g.mpn);

  const attributes: Record<string, unknown> = {
    title: product.name.slice(0, 150),
    description: plainText(product.description, product.name),
    link,
    availability: inStock ? "in_stock" : "out_of_stock",
    condition: g.condition || config.condition_default || "new",
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
  // v1 renamed the single `gtin` attribute to a `gtins` array.
  if (g.gtin) attributes.gtins = [g.gtin];
  if (g.mpn) attributes.mpn = g.mpn;
  if (g.gender) attributes.gender = g.gender;
  if (g.age_group) attributes.ageGroup = g.age_group;
  if (g.color) attributes.color = g.color;
  if (g.size) attributes.sizes = [g.size];
  if (g.material) attributes.material = g.material;
  if (product.weight_grams) attributes.shipping = [{ country: config.country || "RO" }];

  return {
    offerId: product.id,
    contentLanguage: lang,
    feedLabel,
    attributes,
  };
}
