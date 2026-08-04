import type { Metadata } from "next";
import { metadataMagazin, RandeazaMagazin } from "@/lib/storefront/catalog/pagina-magazin";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

/**
 * Pagina de catalog.
 *
 * Exista doar pentru magazinele care si-au ales catalogul ca pagina de sine
 * statatoare; la restul, produsele stau pe pagina principala si aici nu are ce
 * cauta nimeni. Alegerea e a designului, deci se citeste din aceeasi
 * configuratie ca header-ul si footerul.
 *
 * Spre deosebire de cos si de finalizare, pagina asta e INDEXABILA: e chiar
 * catalogul magazinului. De aceea are canonical, OpenGraph si intrare in
 * sitemap, si de aceea ii pasa ce filtre sunt in adresa.
 *
 * Tot ce face traieste in `lib/storefront/catalog/pagina-magazin`, impreuna cu
 * paginile de categorie: sunt aceeasi pagina, cu sau fara o categorie fixata.
 */

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return metadataMagazin({ slug, sp });
}

export default async function PaginaMagazin({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  return RandeazaMagazin({ slug, sp });
}
