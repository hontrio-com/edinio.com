import type { Metadata } from "next";
import { PaginaLegal } from "@/components/website/legal/PaginaLegal";
import { COOKIES } from "@/lib/website/cookies";
import { siteMetadata } from "@/lib/website/metadata";
import { jsonLdSafe } from "@/lib/json-ld";
import { paginaSiteJsonLd } from "@/lib/website-jsonld";

/**
 * Politica de Cookies.
 *
 * ⚠ TEXTUL NU E AICI. E în `lib/website/cookies.ts`, dat cuvânt cu cuvânt de
 * client, iar desenul e în `components/website/legal/PaginaLegal.tsx`, comun cu
 * Termeni și Confidențialitate.
 *
 * ⚠ Documentul DESCRIE un banner cu trei butoane, categorii nepreselectate și un
 * link permanent „Setări Cookies". Sunt afirmații despre cum funcționează
 * site-ul, nu doar intenții — vezi nota din fișierul de conținut.
 */

export const metadata: Metadata = siteMetadata({
  title: "Politica privind cookie-urile",
  description:
    "Află ce tipuri de cookie-uri folosește Edinio, în ce scop sunt utilizate și cum îți poți gestiona preferințele privind cookie-urile.",
  path: "/cookies",
});

/*
 * Data se scrie O SINGURA DATA si alimenteaza si textul de pe ecran, si
 * `dateModified` din datele structurate. Tinute separat, cine actualizeaza
 * politica ar schimba unul si ar lasa celalalt sa minta despre cat de recenta e.
 */
const ULTIMA_ACTUALIZARE = { iso: "2026-05-30", text: "30 mai 2026" };

// Schema.org nu are tip pentru termeni sau politici de confidentialitate
// (subtipurile de WebPage sunt AboutPage, ContactPage, CollectionPage, FAQPage,
// ItemPage, ...). `WebPage` e raspunsul corect, si nu se inventeaza altul.
const jsonLd = paginaSiteJsonLd({
  cale: "cookies",
  nume: "Politica cookies",
  descriere: metadata.description as string,
  actualizata: ULTIMA_ACTUALIZARE.iso,
});

export default function CookiesPage() {
  /*
    ⚠ `{jsonLd ? … }` STĂTEA DEASUPRA LUI `return`, nu înăuntru. Reparat pe
    31.08.2026, după ce s-a văzut în producție.

    Ca instrucțiune de sine stătătoare, `{…}` e un bloc, iar JSX-ul dinăuntru e
    o expresie care se evaluează și se aruncă. Compilează. Trece de `tsc`. Trece
    de build. Și nu ajunge niciodată în pagină.

    Dovada, luată de pe edinio.com înainte de reparație:

        /cookies, /termeni, /gdpr, /confidentialitate → 2 blocuri ld+json
        /preturi, /despre                             → 6 blocuri ld+json

    Cele două de pe paginile legale erau Organization + WebSite, emise de
    aspectul comun. `WebPage` și `BreadcrumbList` ale paginii lipseau cu totul.

    ⚠ Toate patru paginile legale aveau exact aceeași formă, deci a fost o
    singură mișcare greșită copiată de patru ori. `src/lib/jsx-aruncat.test.ts`
    cere acum ca fiecare `jsonLd` construit într-o pagină să și ajungă în JSX-ul
    întors.

    ⚠ Rândul ăsta numea `date-structurate.test.ts`. Greșit: acela e despre
    construirea grafului, nu citește nicio pagină — zero potriviri pe `src/app`
    sau `page.tsx`. Cine se bizuia pe el credea că are o plasă pe care n-o avea.
  */
  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} /> : null}
      <PaginaLegal doc={COOKIES} />
    </>
  );
}
