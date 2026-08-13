import type { Metadata } from "next";

/**
 * Metadate pentru paginile site-ului de prezentare.
 *
 * Adresa canonică e pe `www`: proxy-ul mută 301 de la vârf spre www, deci un
 * canonical fără www ar arăta spre o adresă care redirectează.
 */

export const SITE_URL = "https://www.edinio.com";

export function siteMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  /** Calea, cu slash la început, ex. `/integrari`. */
  path: string;
}): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} | Edinio`, description, url },
  };
}
