import type { Metadata } from "next";
import { PaginaLegal } from "@/components/website/legal/PaginaLegal";
import { CONFIDENTIALITATE } from "@/lib/website/confidentialitate";
import { siteMetadata } from "@/lib/website/metadata";
import { jsonLdSafe } from "@/lib/json-ld";
import { paginaSiteJsonLd } from "@/lib/website-jsonld";

/**
 * Politica de Confidențialitate.
 *
 * ⚠ TEXTUL NU E AICI. E în `lib/website/confidentialitate.ts`, dat cuvânt cu
 * cuvânt de client, iar desenul e în `components/website/legal/PaginaLegal.tsx`,
 * comun cu Termeni și Cookies.
 *
 * ═══ AICI STAU DATELE FIRMEI ═══
 *
 * Au fost scoase din subsol (2026-08-10) tocmai fiindcă apar în Politici.
 * Articolele 1 și 62 din documentul ăsta sunt printre locurile care le mai țin.
 * Nu le goli fără să le muți în altă parte.
 */

export const metadata: Metadata = siteMetadata({
  title: "Politica de confidentialitate",
  description:
    "Cum colecteaza, foloseste si protejeaza Edinio datele cu caracter personal: roluri GDPR, furnizori, temeiuri juridice, perioade de pastrare si drepturile tale.",
  path: "/confidentialitate",
});

/*
 * Data se scrie O SINGURA DATA si alimenteaza si textul de pe ecran, si
 * `dateModified` din datele structurate. Tinute separat, cine actualizeaza
 * politica ar schimba unul si ar lasa celalalt sa minta despre cat de recenta e.
 */
const ULTIMA_ACTUALIZARE = { iso: "2026-06-16", text: "16 iunie 2026" };

// Schema.org nu are tip pentru termeni sau politici de confidentialitate
// (subtipurile de WebPage sunt AboutPage, ContactPage, CollectionPage, FAQPage,
// ItemPage, ...). `WebPage` e raspunsul corect, si nu se inventeaza altul.
const jsonLd = paginaSiteJsonLd({
  cale: "confidentialitate",
  nume: "Politica de confidentialitate",
  descriere: metadata.description as string,
  actualizata: ULTIMA_ACTUALIZARE.iso,
});

export default function ConfidentialitatePage() {
  // ⚠ Stătea deasupra lui `return`, deci nu se randa. Vezi nota lungă din
  // `cookies/page.tsx` — aceeași greșeală, în toate patru paginile legale.
  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} /> : null}
      <PaginaLegal doc={CONFIDENTIALITATE} />
    </>
  );
}
