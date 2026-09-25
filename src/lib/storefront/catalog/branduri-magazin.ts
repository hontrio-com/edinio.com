import { cache } from "react";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugCategorie } from "@/lib/storefront/category-href";
import { caleBrand, legaturaBrand, segmentBrand, valoareBrand } from "@/lib/storefront/brand-href";
import { canonicalCatalog } from "@/lib/storefront/catalog/url";
import { CHEIE_BRAND, jeton } from "@/lib/storefront/catalog/facets";
import { metadataCatalog } from "@/lib/storefront/catalog/date-catalog";
import { firimituriJsonLd, graf, paginaWebJsonLd, referintaMagazin } from "@/lib/storefront/date-structurate";
import { jsonLdSafe } from "@/lib/json-ld";
import { pluralRo } from "@/lib/utils/format";
import { hrefBrandSegment, hrefCatalogPropriu, PERMALINKURI_IMPLICITE, type Permalinkuri } from "@/lib/storefront/permalinkuri";

/**
 * Paginile de brand din magazin: `/<magazin>/brand/<segment>`.
 *
 * ═══ CE E O PAGINA DE BRAND ═══
 *
 * Pagina de catalog (`RandeazaMagazin`), filtrata pe jetonul `brand` din
 * `catalog_produs.fatete`, cu numele, logo-ul si descrierea brandului deasupra
 * grilei. Aceeasi grila, aceleasi filtre, aceeasi paginare: o pagina scrisa separat
 * ar fi fost a doua copie a catalogului.
 *
 * ⚠ NU prin filtrul „Brand” din bara laterala. Acela are praguri (cel putin 2
 * produse pe valoare, cel putin 2 branduri, cel mult 40), deci la un magazin cu un
 * singur brand, sau la al 41-lea brand, ar fi dat o pagina goala. Jetonul exista pe
 * FIECARE produs cu brand, oricare ar fi pragurile.
 *
 * ═══ SEGMENTUL ═══
 *
 * Numele slugificat, ca la categorii (`slugCategorie`): brandurile n-au coloana de
 * slug, iar produsele isi tin brandul ca text. Doua branduri cu acelasi segment
 * sunt o singura pagina: a celui cu mai multe produse vizibile (ordinea din
 * `catalog_branduri`).
 */

export type BrandMagazin = {
  nume: string;
  /** Produse VIZIBILE, numarate ca `catalog_pagina`. 0 = pagina exista, dar nu se indexeaza. */
  produse: number;
  logo: string | null;
  descriere: string | null;
  segment: string;
};

/** Jetonul de filtrare al brandului, EXACT cel scris de proiector. */
export function jetonBrand(nume: string): string {
  return jeton(CHEIE_BRAND, valoareBrand(nume));
}

/**
 * Filtrul `cs` pe `catalog_produs.fatete` (`text[]`), ca literal de vector Postgres CU GHILIMELE.
 *
 * ⚠ NU prin `contains` cu un vector JS: pentru un vector, postgrest-js scrie `cs.{a,b}` fara
 * ghilimele, deci un brand cu virgula („Dolce, Gabbana”) s-ar fi rupt in doua elemente si pagina
 * ar fi iesit goala, fara nicio eroare. Aici elementul se pune intre ghilimele, cu `\` si `"`
 * scapate, cum cere sintaxa vectorilor Postgres.
 */
export function filtruJetonBrand(nume: string): string {
  return `{"${jetonBrand(nume).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"}`;
}

export { caleBrand, legaturaBrand, segmentBrand, valoareBrand };

/** Brandul paginii cerute. Prima potrivire castiga: lista vine ordonata dupa produse vizibile. */
export function potrivesteBrand(lista: readonly BrandMagazin[], segment: string): BrandMagazin | null {
  const cautat = slugCategorie(segment);
  if (!cautat) return null;
  return lista.find((b) => b.segment === cautat) ?? null;
}

/**
 * Brandurile magazinului, asa cum le vede vizitatorul (`catalog_branduri`).
 *
 * ⚠ La eroare: `console.error` si `null`, NU o lista goala. „Nu stiu" nu e „nu exista":
 * o lista goala ar fi dat 404 pe toate paginile de brand si le-ar fi scos din sitemap.
 */
export const branduriMagazin = cache(async (
  businessId: string,
  faraImagini: boolean,
  faraStocAscuns: boolean,
): Promise<BrandMagazin[] | null> => {
  try {
    const { data, error } = await createAdminClient().rpc("catalog_branduri", {
      p_business: businessId,
      p_fara_imagini: faraImagini,
      p_fara_stoc_ascuns: faraStocAscuns,
    });
    if (error || !data) {
      console.error(`[branduri] lista lui ${businessId} n-a putut fi citita:`, error?.message ?? "raspuns gol");
      return null;
    }
    return data
      .map((r) => ({
        nume: r.brand,
        produse: Number(r.produse) || 0,
        logo: r.logo_url,
        descriere: r.descriere,
        segment: segmentBrand(r.brand),
      }))
      .filter((b) => b.segment !== "");
  } catch (e) {
    console.error(`[branduri] lista lui ${businessId} n-a putut fi citita:`, e instanceof Error ? e.message : e);
    return null;
  }
});

/** Descrierea paginii: textul comerciantului, taiat la o fraza de cautare, sau una compusa. */
export function descriereBrand(brand: Pick<BrandMagazin, "nume" | "produse" | "descriere">, displayName: string): string {
  const proprie = (brand.descriere ?? "").replace(/\s+/g, " ").trim();
  if (proprie) {
    if (proprie.length <= 160) return proprie;
    const taiat = proprie.slice(0, 157);
    const spatiu = taiat.lastIndexOf(" ");
    return `${(spatiu > 100 ? taiat.slice(0, spatiu) : taiat).replace(/[\s,.;:]+$/, "")}...`;
  }
  const cate = brand.produse > 0 ? ` ${pluralRo(brand.produse, "produs", "produse")} disponibile.` : "";
  return `Produsele ${brand.nume} de la ${displayName}.${cate}`;
}

/**
 * Metadata paginii de brand, din date deja citite (ruleaza in probe).
 *
 * ⚠ Brandul fara niciun produs vizibil NU se indexeaza, ca o categorie goala (decizia 6):
 * pagina ramane, dar `noindex, follow`, si nu intra in sitemap.
 */
export function metadataPaginiiBrand(a: {
  brand: BrandMagazin;
  displayName: string;
  /** `storeBaseUrl(business)`: domeniul propriu sau adresa de pe platforma. */
  radacina: string;
  sp: Record<string, string | string[] | undefined>;
  noindexMagazin: boolean;
  imagineMagazin: string | null;
  /** Prefixele din Setari > Permalink-uri. Lipsa = cele implicite, ca inainte. */
  permalinkuri?: Permalinkuri;
}): Metadata {
  const prefixe = a.permalinkuri ?? PERMALINKURI_IMPLICITE;
  const { url, indexabila } = canonicalCatalog(hrefBrandSegment(a.radacina, a.brand.segment, prefixe.brand), { ...a.sp, cat: undefined });
  const imagine = a.brand.logo || a.imagineMagazin;
  return metadataCatalog({
    titlu: `${a.brand.nume} | ${a.displayName}`,
    descriere: descriereBrand(a.brand, a.displayName),
    displayName: a.displayName,
    url,
    indexabila,
    noindex: a.noindexMagazin || a.brand.produse === 0,
    images: imagine ? [imagine] : [],
  });
}

/**
 * JSON-LD-ul paginii de brand: `CollectionPage` care descrie un `Brand`, plus firimiturile.
 *
 * Aceeasi regula ca la catalog: se descrie numai pagina care are voie in index si al
 * carei canonical arata catre ea insasi (fara filtre peste el, fara ciorna).
 */
export function dateStructurateBrand(a: {
  brand: BrandMagazin;
  business: { store_name?: string | null; business_name: string };
  radacina: string;
  titluCatalog: string;
  sp: Record<string, string | string[] | undefined>;
  noindexMagazin: boolean;
  esteCiorna: boolean;
  /** Prefixele din Setari > Permalink-uri. Lipsa = cele implicite, ca inainte. */
  permalinkuri?: Permalinkuri;
}): string | null {
  const displayName = a.business.store_name ?? a.business.business_name;
  const prefixe = a.permalinkuri ?? PERMALINKURI_IMPLICITE;
  const { url, indexabila } = canonicalCatalog(hrefBrandSegment(a.radacina, a.brand.segment, prefixe.brand), { ...a.sp, cat: undefined });
  if (a.esteCiorna || a.noindexMagazin || !indexabila || a.brand.produse === 0) return null;
  const magazin = referintaMagazin(a.business, a.radacina);
  const brand = {
    "@type": "Brand",
    "@id": `${url.split("?")[0]}#brand`,
    name: a.brand.nume,
    ...(a.brand.logo ? { logo: a.brand.logo } : {}),
  };
  const nod = graf(
    paginaWebJsonLd({
      tip: "CollectionPage",
      nume: a.brand.nume,
      url,
      descriere: descriereBrand(a.brand, displayName),
      parteDin: magazin,
      despre: brand,
    }),
    magazin,
    firimituriJsonLd([
      { nume: displayName, url: a.radacina },
      { nume: a.titluCatalog, url: hrefCatalogPropriu(a.radacina, prefixe.magazin) },
      { nume: a.brand.nume, url: hrefBrandSegment(a.radacina, a.brand.segment, prefixe.brand) },
    ]),
  );
  return nod ? jsonLdSafe(nod) : null;
}
