import type { Metadata } from "next";
import { metadataMagazin, RandeazaMagazin } from "@/lib/storefront/catalog/pagina-magazin";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

/**
 * Pagina unei categorii.
 *
 * Aceeasi pagina ca `/magazin`, cu categoria luata din cale in loc de `?cat=`.
 * Forma cu interogare ramane citita mai departe — linkuri vechi, marcaje,
 * rezultate deja indexate — dar linkurile pe care le scrie magazinul de acum
 * incolo arata incoace: o adresa pe care o poate citi si un om, cu titlu propriu
 * si canonical propriu.
 *
 * Segmentul e numele categoriei slugificat. Categoriile n-au coloana `slug`, iar
 * produsele isi tin categoria ca text; vezi `slugCategorie`.
 */

interface Props {
  params: Promise<{ slug: string; categorie: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug, categorie }, sp] = await Promise.all([params, searchParams]);
  return metadataMagazin({ slug, sp, categorieSlug: categorie });
}

export default async function PaginaCategorie({ params, searchParams }: Props) {
  const [{ slug, categorie }, sp] = await Promise.all([params, searchParams]);
  return RandeazaMagazin({ slug, sp, categorieSlug: categorie });
}
