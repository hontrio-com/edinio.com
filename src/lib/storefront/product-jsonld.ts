import { getProductPriceRange } from "@/lib/utils/product-price";

// Computed once at module load (not during render — keeps callers pure).
const PRICE_VALID_UNTIL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const TODAY = new Date().toISOString().slice(0, 10);

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
    created_at?: string | null;
    /** Sectiunile produsului: starea de stoc aleasa din editor + combinatiile de variante. */
    page_sections?: unknown;
  },
  productUrl: string,
  brand: string,
  shipping: { cost: number; min: number; max: number },
) {
  const images = product.images as string[] | null;
  const desc = product.description ? product.description.replace(/<[^>]+>/g, "").slice(0, 500) : product.name;
  // Aceeasi regula de stoc ca pagina de produs: marcajul „Stoc epuizat" /
  // „Precomanda" din editor bate inventarul. Fara el, o pagina cu butonul stins
  // declara „InStock" in datele structurate si Google trimite clienti pe ea.
  const stockStatus = (product.page_sections as { stock_status?: string } | null)?.stock_status ?? "in_stock";
  const outOfStock = stockStatus === "out_of_stock"
    || (product.track_inventory === true && product.stock_quantity === 0);
  const availability = outOfStock
    ? "https://schema.org/OutOfStock"
    : stockStatus === "preorder"
      ? "https://schema.org/PreOrder"
      : "https://schema.org/InStock";
  // `validFrom` = date the price became valid. Google recommends it for merchant
  // listings (bounds a price/sale window) and Search Console warns when it's
  // absent. We don't track price-change time, so use the product's creation date
  // (always <= priceValidUntil, as Google requires); fall back to today.
  const validFrom = (typeof product.created_at === "string" && product.created_at)
    ? product.created_at.slice(0, 10)
    : TODAY;

  // Produs variabil cu preturi diferite: pagina afiseaza „De la X – Y lei", deci
  // un Offer cu pretul de baza ar contrazice pretul vizibil (si pretul de baza
  // poate sa nici nu fie cumparabil). Acelasi calcul ca pagina, ca sa nu poata
  // diverge.
  const priceRange = getProductPriceRange(Number(product.price) || 0, product.page_sections ?? null);
  const combos = (product.page_sections as { variants?: { combinations?: { enabled?: boolean }[] } } | null)
    ?.variants?.combinations;
  const offerCount = Array.isArray(combos) ? combos.filter((c) => c?.enabled !== false).length : 0;

  const shippingDetails = {
    "@type": "OfferShippingDetails",
    shippingRate: { "@type": "MonetaryAmount", value: shipping.cost, currency: "RON" },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "RO" },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: shipping.min, maxValue: shipping.max, unitCode: "DAY" },
    },
  };
  // Fereastra de 14 zile e cea legala (dreptul de retragere), deci se poate
  // declara. Taxa de retur NU: nu exista camp in care comerciantul sa o
  // introduca, iar deducerea ei din costul de LIVRARE anunta public o politica
  // pe care el n-a spus-o niciodata (livrare gratuita nu inseamna retur gratuit).
  const hasMerchantReturnPolicy = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "RO",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 14,
    returnMethod: "https://schema.org/ReturnByMail",
    // Google cere campul; fara el listarea pierde imbogatirea cu politica de
    // retur. Costul returului nu se mai deduce din pragul de transport gratuit —
    // sunt doua lucruri diferite — ci ramane pe situatia legala uzuala: clientul
    // plateste returul daca se razgandeste (OUG 34/2014, art. 13 alin. 3).
    returnFees: "https://schema.org/ReturnShippingFees",
  };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: desc,
    url: productUrl,
    ...(product.sku ? { sku: product.sku } : {}),
    brand: { "@type": "Brand", name: brand },
    ...(images?.length ? { image: images } : {}),
    offers: priceRange.hasRange
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "RON",
          lowPrice: priceRange.min,
          highPrice: priceRange.max,
          ...(offerCount > 1 ? { offerCount } : {}),
          itemCondition: "https://schema.org/NewCondition",
          availability,
          // `AggregateOffer` mosteneste ambele campuri de la `Offer`. Fara ele,
          // produsele cu variante pierdeau avertismentul reparat in iulie pe
          // oferta simpla si il primeau inapoi in Search Console.
          validFrom,
          priceValidUntil: PRICE_VALID_UNTIL,
          url: productUrl,
          shippingDetails,
          hasMerchantReturnPolicy,
        }
      : {
          "@type": "Offer",
          priceCurrency: "RON",
          price: product.price ?? 0,
          itemCondition: "https://schema.org/NewCondition",
          availability,
          validFrom,
          priceValidUntil: PRICE_VALID_UNTIL,
          url: productUrl,
          shippingDetails,
          hasMerchantReturnPolicy,
        },
  };
}
