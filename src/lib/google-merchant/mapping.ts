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

  const attributes: Record<string, unknown> = {
    title: product.name.slice(0, 150),
    description: plainText(product.description, product.name),
    link,
    availability: inStock ? "in_stock" : "out_of_stock",
    condition: config.condition_default || "new",
    brand: config.brand_default || business.store_name || business.business_name,
    // List price shows as the strike-through price when a sale price is present.
    price: hasSale ? priceMicros(compare!) : priceMicros(base),
    identifierExists: false,
  };
  if (hasSale) attributes.salePrice = priceMicros(base);
  if (images[0]) attributes.imageLink = images[0];
  if (images.length > 1) attributes.additionalImageLinks = images.slice(1, 10);
  const googleCat = product.category ? config.category_map?.[product.category] : undefined;
  if (googleCat) attributes.googleProductCategory = googleCat;
  if (product.weight_grams) attributes.shipping = [{ country: config.country || "RO" }];

  return {
    offerId: product.id,
    contentLanguage: lang,
    feedLabel,
    attributes,
  };
}
