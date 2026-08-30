import type { Metadata } from "next";
import { PaginaLegal } from "@/components/website/legal/PaginaLegal";
import { GDPR } from "@/lib/website/gdpr";
import { siteMetadata } from "@/lib/website/metadata";
import { jsonLdSafe } from "@/lib/json-ld";
import { paginaSiteJsonLd } from "@/lib/website-jsonld";

/**
 * Drepturile GDPR.
 *
 * ⚠ TEXTUL NU E AICI. E în `lib/website/gdpr.ts`, iar desenul e în
 * `components/website/legal/PaginaLegal.tsx`, comun cu Termeni,
 * Confidențialitate și Cookies.
 *
 * Pagina asta era, până la auditul din 23.08, singura dintre cele patru cu
 * textul scris direct în JSX și cu desenul ei propriu. Ce a câștigat trecând
 * prin `PaginaLegal`: cuprins, ancore pe fiecare articol, aceeași treaptă de
 * titlu ca surorile ei și `siteMetadata()` în loc de un obiect scris de mână.
 */

export const metadata: Metadata = siteMetadata({
  title: "Drepturile GDPR",
  description:
    "Drepturile tale privind protectia datelor personale: acces, rectificare, stergere, restrictionare, portabilitate, opozitie. Cum le exerciti si in cat timp raspundem.",
  path: "/gdpr",
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
  cale: "gdpr",
  nume: "Drepturile GDPR",
  descriere: metadata.description as string,
  actualizata: ULTIMA_ACTUALIZARE.iso,
});

export default function GDPRPage() {
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} /> : null}
  return <PaginaLegal doc={GDPR} />;
}
