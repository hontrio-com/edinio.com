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
  title: "Politica de cookies",
  description:
    "Ce cookie-uri foloseste Edinio, de ce, cat timp si cum iti poti schimba oricand optiunile: strict necesare, functionale, analiza si marketing.",
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
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} /> : null}
  return <PaginaLegal doc={COOKIES} />;
}
