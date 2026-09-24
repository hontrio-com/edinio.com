/**
 * Brandurile produselor, fara nimic de server: le folosesc lista de produse,
 * formularul de produs si pagina Branduri.
 *
 * ⚠ Brandul sta in `products.page_sections.google.brand` (acolo il citesc feedurile,
 * marketplace-urile si pagina produsului). Aici e numai forma lui.
 */

export type BrandCuProduse = { brand: string; produse: number };

export const BRAND_LUNGIME_MAXIMA = 120;

/** Spatiile de la capete taiate, cele din mijloc stranse la unul. */
export function curataBrand(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, BRAND_LUNGIME_MAXIMA) : "";
}

/**
 * Brandul scris de om, adus la forma unui brand care EXISTA deja in magazin, cand
 * difera numai prin majuscule sau spatii.
 *
 * ⚠ De aici veneau dublurile: „Armaf” si „ARMAF” erau doua branduri, deci in filtrul
 * magazinului aparea de doua ori, iar cine alegea unul nu vedea produsele celuilalt.
 * Un brand nou (fara pereche) ramane exact cum l-a scris omul.
 */
export function brandCanonic(scris: string, existente: readonly string[]): string {
  const curat = curataBrand(scris);
  if (!curat) return "";
  const cheie = curat.toLocaleLowerCase("ro");
  return existente.find((b) => curataBrand(b).toLocaleLowerCase("ro") === cheie) ?? curat;
}

/**
 * Grupuri de branduri care difera numai prin majuscule (pentru pagina Branduri:
 * „posibile dubluri”). Intoarce doar grupurile cu mai mult de un nume.
 */
export function dubluriDeBrand(lista: readonly BrandCuProduse[]): BrandCuProduse[][] {
  const grupuri = new Map<string, BrandCuProduse[]>();
  for (const b of lista) {
    const cheie = curataBrand(b.brand).toLocaleLowerCase("ro");
    grupuri.set(cheie, [...(grupuri.get(cheie) ?? []), b]);
  }
  return [...grupuri.values()].filter((g) => g.length > 1);
}
