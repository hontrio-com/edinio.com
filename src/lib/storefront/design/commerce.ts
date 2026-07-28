import { variantMeta } from "./registry";
import type { StoreDesign } from "./types";

/**
 * Cosul si finalizarea comenzii: panou sau pagina de sine statatoare?
 *
 * Raspunsul se da AICI, intr-un singur loc, si niciodata ghicind dupa id-ul
 * variantei. Il citesc rutele publice, `buildChromeData` (deci toate header-ele),
 * `MiniStoreRenderer` si invelisul paginilor fara catalog. Daca fiecare l-ar
 * deduce singur, s-ar ajunge la starea cea mai proasta cu putinta: magazinul cu
 * pagina de cos publicata si butonul din header care deschide in continuare un
 * sertar care nu mai exista.
 *
 * Alegerea e EXCLUSIVA, prin design: cine alege pagina nu mai are sertar, si
 * invers. Doua drumuri catre acelasi lucru ar insemna doua fluxuri de urmarit si
 * doua suprafete de intretinut.
 */

/** Segmentele rutelor de comert. Rezervate deja in `lib/pages/reserved-slugs.ts`. */
export const SEGMENT_COS = "cos";
export const SEGMENT_CHECKOUT = "checkout";

/** `true` cand designul publicat pune cosul pe o pagina proprie. */
export function cartOnPage(design: StoreDesign): boolean {
  return variantMeta("cart_drawer", design.commerce.cartDrawer.variant)?.surface === "page";
}

/** `true` cand designul publicat pune finalizarea comenzii pe o pagina proprie. */
export function checkoutOnPage(design: StoreDesign): boolean {
  return variantMeta("checkout", design.commerce.checkout.variant)?.surface === "page";
}

export function cartHref(basePath: string): string {
  return `${basePath}/${SEGMENT_COS}`;
}

export function checkoutHref(basePath: string): string {
  return `${basePath}/${SEGMENT_CHECKOUT}`;
}
