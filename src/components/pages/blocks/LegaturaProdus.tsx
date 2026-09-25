"use client";

import type { ReactNode } from "react";
import { usePermalinkuri } from "@/components/storefront/PermalinkuriMagazin";
import { hrefProdus } from "@/lib/storefront/permalinkuri";

/**
 * Legatura catre un produs, cu prefixul din Setari > Permalink-uri.
 *
 * ⚠ Doar legatura e de client, nu cardul intreg: `PageProductCard` ramane de server,
 * altfel fiecare bloc de produse din paginile proprii ar fi trimis in browser tot
 * produsul (imagini, `page_sections`), doar ca sa afle un prefix.
 */
export function LegaturaProdus({ basePath, slugSauId, className, children }: {
  basePath: string;
  slugSauId: string;
  className?: string;
  children: ReactNode;
}) {
  const { produs } = usePermalinkuri();
  return <a href={hrefProdus(basePath, slugSauId, produs)} className={className}>{children}</a>;
}
