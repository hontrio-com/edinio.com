import type { Metadata } from "next";
import { metadataProdus, PaginaProdus } from "../../_rute/pagina-produs";
import { redirectioneazaDacaPrefixulEAltul } from "@/lib/storefront/permalinkuri-server";

/*
 * Ruta cu segmentul IMPLICIT al produselor (`/product/<slug>`). Pagina insasi sta
 * in `_rute/pagina-produs.tsx`, fiindca o randeaza si prefixul ales de magazin.
 *
 * Magazinul care si-a ales alt prefix (Setari > Permalink-uri) primeste aici o
 * redirectionare permanenta: linkurile vechi (Google, feeduri, emailuri) merg mai
 * departe. Fara setare, pagina e exact cea de dinainte.
 */

interface Props {
  params: Promise<{ slug: string; productSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productSlug } = await params;
  return metadataProdus({ slug, productSlug });
}

export default async function ProductDetailPage({ params, searchParams }: Props) {
  const [{ slug, productSlug }, sp] = await Promise.all([params, searchParams]);
  await redirectioneazaDacaPrefixulEAltul(slug, "produs", [productSlug], sp);
  return PaginaProdus({ slug, productSlug });
}
