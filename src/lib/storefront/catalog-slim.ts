import { getProductPriceRange, type PriceRange } from "@/lib/utils/product-price";

/**
 * Slimuire payload catalog pentru homepage-ul storefront.
 *
 * Homepage-ul trimite TOT catalogul in browser (cautarea/filtrele sunt
 * client-side, prin design), deci fiecare byte per produs se inmulteste cu
 * numarul de produse. Masurat pe un catalog real de 1181 produse variabile:
 * ~4,6 MB bruti, din care 3 MB doar combinatiile de variante si ~0,6 MB
 * imaginile 2+ — niciuna necesara la randarea listei.
 *
 * Pastram exact ce consuma UI-ul listei:
 *  - variants.options (fatete, cautare, filtre, picker) — combinatiile se
 *    incarca LA CERERE cand se deschide quick-add-ul (VariantQuickAdd cu
 *    `deferCombinations`); intervalul de pret al cardului („De la X–Y") se
 *    precalculeaza aici, cat combinatiile sunt inca prezente;
 *  - bundle (config pachet) — stocul derivat al pachetelor;
 *  - prima imagine — card, linie de cos, fallback quick-add;
 *  - primele 300 de caractere din descriere — doar indexul de cautare o citeste.
 *
 * Pagina de produs si One Product Store isi fac fetch-ul lor complet — neatinse.
 */
const SEARCH_DESCRIPTION_CHARS = 300;

interface CatalogRowShape {
  price: unknown;
  description: string | null;
  images: unknown;
  page_sections: unknown;
}

export function slimCatalogProduct<T extends CatalogRowShape>(p: T): T & { price_range: PriceRange } {
  // Intervalul de pret se calculeaza INAINTE de a arunca combinatiile.
  const price_range = getProductPriceRange(Number(p.price), p.page_sections);

  const ps = (p.page_sections ?? null) as {
    variants?: { enabled?: boolean; options?: unknown } | null;
    bundle?: unknown;
  } | null;

  let slim: Record<string, unknown> | null = null;
  if (ps?.variants) {
    slim = { variants: { enabled: ps.variants.enabled ?? false, options: ps.variants.options ?? [] } };
  }
  if (ps?.bundle) {
    slim = { ...(slim ?? {}), bundle: ps.bundle };
  }

  const images = Array.isArray(p.images) ? (p.images as unknown[]).slice(0, 1) : p.images;

  const description =
    typeof p.description === "string" && p.description.length > SEARCH_DESCRIPTION_CHARS
      ? p.description.slice(0, SEARCH_DESCRIPTION_CHARS)
      : p.description;

  return {
    ...p,
    images: images as T["images"],
    description: description as T["description"],
    page_sections: slim as T["page_sections"],
    price_range,
  };
}
