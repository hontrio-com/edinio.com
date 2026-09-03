import type { Metadata } from "next";
import { metadataMagazin, RandeazaMagazin } from "@/lib/storefront/catalog/pagina-magazin";

/**
 * Pagina de catalog.
 *
 * Exista doar pentru magazinele care si-au ales catalogul ca pagina de sine
 * statatoare; la restul, produsele stau pe pagina principala si aici nu are ce
 * cauta nimeni. Alegerea e a designului, deci se citeste din aceeasi
 * configuratie ca header-ul si footerul.
 *
 * Spre deosebire de cos si de finalizare, pagina asta e INDEXABILA pe domeniul
 * propriu al magazinului: e chiar catalogul lui. De aceea are canonical,
 * OpenGraph si intrare in sitemapul domeniului, si de aceea ii pasa ce filtre
 * sunt in adresa. (Pe www.edinio.com/{slug} e `noindex`, ca toata vitrina —
 * invarianta din `indexare-pe-platforma.ts`, 03.09.2026.)
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
