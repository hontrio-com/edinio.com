// Computed once at module load (not during render — keeps callers pure).
const PRICE_VALID_UNTIL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * schema.org Product JSON-LD for a storefront product. Shared by the product
 * route (/[slug]/product/[slug]) and the One Product Store homepage so both emit
 * identical, valid structured data. `productUrl` is the page's canonical URL (the
 * homepage URL in OPS mode, the product URL otherwise).
 */
export function buildProductJsonLd(
  product: {
    name: string;
    description: string | null;
    price: number | null;
    images: unknown;
    sku?: string | null;
    track_inventory?: boolean;
    stock_quantity?: number | null;
  },
  productUrl: string,
  brand: string,
  shipping: { cost: number; min: number; max: number },
) {
  const images = product.images as string[] | null;
  const desc = product.description ? product.description.replace(/<[^>]+>/g, "").slice(0, 500) : product.name;
  const inStock = !product.track_inventory || (product.stock_quantity ?? 0) > 0;
  const freeReturn = shipping.cost <= 0;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: desc,
    url: productUrl,
    ...(product.sku ? { sku: product.sku } : {}),
    brand: { "@type": "Brand", name: brand },
    ...(images?.length ? { image: images } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "RON",
      price: product.price ?? 0,
      itemCondition: "https://schema.org/NewCondition",
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      priceValidUntil: PRICE_VALID_UNTIL,
      url: productUrl,
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: { "@type": "MonetaryAmount", value: shipping.cost, currency: "RON" },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "RO" },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
          transitTime: { "@type": "QuantitativeValue", minValue: shipping.min, maxValue: shipping.max, unitCode: "DAY" },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "RO",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: freeReturn ? "https://schema.org/FreeReturn" : "https://schema.org/ReturnShippingFees",
        ...(freeReturn ? {} : { returnShippingFeesAmount: { "@type": "MonetaryAmount", value: shipping.cost, currency: "RON" } }),
      },
    },
  };
}
