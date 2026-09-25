import { slugCategorie } from "@/lib/storefront/category-href";
import { SEGMENT_BRAND, SEGMENT_MAGAZIN } from "@/lib/pages/reserved-slugs";

/**
 * Adresa paginii unui brand, fara nimic de server: o citesc si pagina de produs
 * (componenta de client) si randarea catalogului. Restul regulilor paginilor de
 * brand sta in `catalog/branduri-magazin.ts`, care cere clientul de serviciu si
 * n-are ce cauta in bundle-ul browserului.
 */

/** Forma pe care o poarta jetonul din `catalog_produs.fatete` (proiectorul strange spatiile). */
export function valoareBrand(nume: string): string {
  return nume.replace(/\s+/g, " ").trim();
}

/** Segmentul din cale: numele slugificat, ca la categorii (brandurile n-au coloana de slug). */
export function segmentBrand(nume: string): string {
  return slugCategorie(valoareBrand(nume));
}

/**
 * Adresa paginii brandului, relativa la magazin; `null` cand numele n-are segment.
 * `prefix` = prefixul brandurilor din Setari > Permalink-uri; lipsa = `brand`, ca inainte.
 */
export function caleBrand(basePath: string, nume: string, prefix: string = SEGMENT_BRAND): string | null {
  const s = segmentBrand(nume);
  return s ? `${basePath}/${prefix}/${s}` : null;
}

/**
 * Legatura de pe pagina produsului catre pagina brandului.
 *
 * Numai cand magazinul ARE pagina de catalog (`catalogRoot` e chiar ea): fara ea,
 * pagina brandului trimite pe prima pagina, deci linkul n-ar duce nicaieri nou.
 */
export function legaturaBrand(
  basePath: string,
  catalogRoot: string | undefined,
  nume: string,
  prefixe: { magazin: string; brand: string } = { magazin: SEGMENT_MAGAZIN, brand: SEGMENT_BRAND },
): string | null {
  if (!nume.trim() || catalogRoot !== `${basePath}/${prefixe.magazin}`) return null;
  return caleBrand(basePath, nume, prefixe.brand);
}
