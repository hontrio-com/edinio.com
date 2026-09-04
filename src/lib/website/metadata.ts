import type { Metadata } from "next";

/**
 * Metadate pentru paginile site-ului de prezentare.
 *
 * Adresa canonică e pe `www`: proxy-ul mută de la vârf spre www, deci un
 * canonical fără www ar arăta spre o adresă care redirectează.
 *
 * ═══ ⚠ DE CE `openGraph` ȘI `twitter` SE DECLARĂ AICI, ÎNTREGI (04.09.2026) ═══
 *
 * Next NU îmbină în adâncime obiectele de metadate: `openGraph` și `twitter`
 * sunt chei de nivel întâi, iar un segment care le declară ÎNLOCUIEȘTE integral
 * ce a pus rădăcina (`resolve-metadata.js`, `case "openGraph"`). Helperul ăsta
 * declara `openGraph: { title, description, url }` — fără imagine — deci pe
 * fiecare din cele 24 de pagini care trec prin el se pierdeau `og:image`,
 * `og:site_name`, `og:locale` și `og:type` ale rădăcinii.
 *
 * Iar `twitter`, pe care helperul NU îl declara, se moștenea ÎNTREG de la
 * rădăcină: măsurat în producție, fiecare pagină de prețuri, de comparație, de
 * ajutor și fiecare articol de blog spunea pe X titlul și descrierea paginii de
 * start. Completarea automată din `openGraph` nu pornește, fiindcă twitter-ul
 * moștenit are deja titlu.
 *
 * ⚠ NU se rezolvă „scoțând twitter din rădăcină ca să-l deducă Next": derivarea
 * ar copia din `openGraph`, care oricum n-avea imagine, și ar depinde de o
 * ordine de rezolvare pe care n-o controlăm. Fiecare pagină își spune singură
 * cine e.
 *
 * Textele NU se schimbă: `openGraph` și `twitter` primesc chiar `title` și
 * `description` pe care pagina le trimitea deja.
 */

export const SITE_URL = "https://www.edinio.com";

/**
 * Bannerul mărcii, folosit când pagina n-are o imagine proprie.
 *
 * Aceleași valori ca în `src/app/layout.tsx` (rădăcina). Calea relativă se
 * face absolută prin `metadataBase`, setat tot acolo.
 */
export const OG_IMAGINE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Edinio - Platforma de creare magazin online",
} as const;

/** Ce se adaugă la `openGraph` când pagina e un articol, nu o pagină de site. */
export interface ArticolOpenGraph {
  /** ISO. `article:published_time`. */
  publicatLa?: string | null;
  /** ISO. `article:modified_time`. */
  modificatLa?: string | null;
  /** Rubrica articolului. `article:section`. */
  rubrica?: string | null;
}

export function siteMetadata({
  title,
  description,
  path,
  imagine,
  articol,
  titluComplet,
}: {
  title: string;
  description: string;
  /** Calea, cu slash la început, ex. `/integrari`. */
  path: string;
  /**
   * Imaginea paginii (coperta unui articol), absolută sau relativă. Lipsă,
   * se folosește bannerul mărcii — niciodată „nicio imagine".
   */
  imagine?: string | null;
  /** Prezent, pagina se declară `og:type=article` cu datele lui. */
  articol?: ArticolOpenGraph;
  /**
   * `title` e titlul ÎNTREG, nu bucata dinaintea sufixului.
   *
   * ⚠ EXISTĂ FIINDCĂ RĂDĂCINA PUNE UN ȘABLON. `app/layout.tsx` declară
   * `template: "%s | Edinio"`, deci tot ce trece pe aici primește sufixul.
   * Aproape toate titlurile îl vor — dar trei nu se termină în „| Edinio" și,
   * lăsate pe șablon, ar fi ieșit dublate sau caraghioase:
   *
   *   „Contact Edinio | Suport și asistență"      -> „… | Suport și asistență | Edinio"
   *   „Întrebări frecvente despre Edinio"          -> „… despre Edinio | Edinio"
   *   „Centru de ajutor Edinio: ghiduri și tutoriale" -> „… tutoriale | Edinio"
   *
   * Cu steagul, `<title>` se declară `absolute` (Next sare peste șablon) ȘI
   * titlul social rămâne același text — altfel `og:title` ar fi purtat sufixul
   * pe care `<title>` tocmai l-a refuzat, adică două nume pentru aceeași pagină.
   */
  titluComplet?: boolean;
}): Metadata {
  const url = `${SITE_URL}${path}`;
  /* Titlul social poartă sufixul mărcii, ca `<title>`-ul de după șablon — afară
     de titlurile care se dau întregi, unde ar fi fost un al doilea „Edinio". */
  const titluSocial = titluComplet ? title : `${title} | Edinio`;
  const poza = imagine?.trim() || null;
  const imagini = poza ? [{ url: poza }] : [{ ...OG_IMAGINE }];
  const comun = {
    locale: "ro_RO",
    siteName: "Edinio",
    url,
    title: titluSocial,
    description,
    images: imagini,
  };

  return {
    /* `absolute` face Next sa sara peste sablonul radacinii. Vezi `titluComplet`. */
    title: titluComplet ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    /* Cele două ramuri există fiindcă `type` e discriminantul uniunii din
       tipurile Next: un `type` calculat n-ar trece de verificare. */
    openGraph: articol
      ? {
        ...comun,
        type: "article",
        ...(articol.publicatLa ? { publishedTime: articol.publicatLa } : {}),
        ...(articol.modificatLa ? { modifiedTime: articol.modificatLa } : {}),
        ...(articol.rubrica ? { section: articol.rubrica } : {}),
      }
      : { ...comun, type: "website" },
    twitter: {
      card: "summary_large_image",
      title: titluSocial,
      description,
      images: [poza ?? OG_IMAGINE.url],
    },
  };
}
