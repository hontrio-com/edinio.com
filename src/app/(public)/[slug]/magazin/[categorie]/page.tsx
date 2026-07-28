import type { Metadata } from "next";
import { metadataMagazin, RandeazaMagazin } from "@/lib/storefront/catalog/pagina-magazin";

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
