import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { metadataProdus, PaginaProdus } from "../_rute/pagina-produs";
import { metadataMagazin, RandeazaMagazin } from "@/lib/storefront/catalog/pagina-magazin";
import { metadataBrand } from "@/lib/storefront/catalog/metadata-magazin";
import { felulSegmentului } from "@/lib/storefront/permalinkuri";
import { adresaCurenta, setareaPermalinkurilorMagazinului } from "@/lib/storefront/permalinkuri-server";

/**
 * Orice adresa de sub magazin pe care n-o revendica nicio alta ruta.
 *
 * Fara ea, `caian-textile.ro/aaa/bbb` nu se potrivea cu nimic din `[slug]` —
 * `[pageSlug]` prinde un singur segment — deci cadea pe 404-ul RADACINII, cu
 * titlul, descrierea si og-ul platformei pe domeniul comerciantului. Exact
 * lucrul pe care il reparam, ramas neacoperit pentru adresele cu doua sau mai
 * multe segmente.
 *
 * Ruta nu fura nimic: in App Router, segmentele statice bat parametrul, iar
 * parametrul bate captura-tot. `magazin/<categorie>`, `politici/<tip>`,
 * `product/<slug>` si paginile proprii raman ale lor; aici ajunge doar ce n-a
 * vrut nimeni.
 *
 * ═══ PERMALINK-URILE (25.09.2026) ═══
 *
 * Aici ajung si prefixele alese de magazin in Setari > Permalink-uri, fiindca
 * pentru ele nu exista dosar static: `/<prefix-produs>/<slug>`,
 * `/<prefix-catalog>/<categorie>`, `/<prefix-branduri>/<brand>`. Prefixul
 * CURENT se randeaza cu aceeasi pagina ca ruta implicita; un prefix VECHI al
 * magazinului ia redirectionare permanenta spre cel curent. Restul ramane 404.
 * Fara setare, `felulSegmentului` nu recunoaste aici nimic (prefixele implicite
 * au dosarele lor), deci ruta se poarta exact ca inainte.
 */

interface Props {
  params: Promise<{ slug: string; rest: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function tinta(slug: string, rest: string[]) {
  if (rest.length !== 2) return null;
  const felul = felulSegmentului(rest[0], await setareaPermalinkurilorMagazinului(slug));
  return felul ? { ...felul, valoare: rest[1] } : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug, rest }, sp] = await Promise.all([params, searchParams]);
  const t = await tinta(slug, rest);
  if (!t || !t.curent) return {};
  if (t.fel === "produs") return metadataProdus({ slug, productSlug: t.valoare });
  if (t.fel === "magazin") return metadataMagazin({ slug, sp, categorieSlug: t.valoare });
  return metadataBrand({ slug, sp, brandSlug: t.valoare });
}

export default async function RestNegasit({ params, searchParams }: Props) {
  const [{ slug, rest }, sp] = await Promise.all([params, searchParams]);
  const t = await tinta(slug, rest);
  if (!t) notFound();
  if (!t.curent) permanentRedirect(await adresaCurenta(slug, t.fel, [t.valoare], sp));
  if (t.fel === "produs") return PaginaProdus({ slug, productSlug: t.valoare });
  if (t.fel === "magazin") return RandeazaMagazin({ slug, sp, categorieSlug: t.valoare });
  return RandeazaMagazin({ slug, sp, brandSlug: t.valoare });
}
