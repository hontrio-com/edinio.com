import type { Metadata } from "next";
import { RandeazaMagazin } from "@/lib/storefront/catalog/pagina-magazin";
import { metadataBrand } from "@/lib/storefront/catalog/metadata-magazin";
import { redirectioneazaDacaPrefixulEAltul } from "@/lib/storefront/permalinkuri-server";

/**
 * Pagina unui brand: catalogul magazinului, filtrat pe brand, cu logo-ul si
 * descrierea lui deasupra grilei.
 *
 * Aceeasi pagina ca `/magazin/<categorie>`, cu brandul luat din cale. Regulile ei
 * (segmentul, filtrarea, indexarea) stau in `lib/storefront/catalog/branduri-magazin.ts`.
 */

interface Props {
  params: Promise<{ slug: string; brand: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug, brand }, sp] = await Promise.all([params, searchParams]);
  return metadataBrand({ slug, sp, brandSlug: brand });
}

export default async function PaginaBrand({ params, searchParams }: Props) {
  const [{ slug, brand }, sp] = await Promise.all([params, searchParams]);
  // Magazinul cu alt prefix de branduri (Setari > Permalink-uri): 308 spre el.
  await redirectioneazaDacaPrefixulEAltul(slug, "brand", [brand], sp);
  return RandeazaMagazin({ slug, sp, brandSlug: brand });
}
