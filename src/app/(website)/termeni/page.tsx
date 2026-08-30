import type { Metadata } from "next";
import { PaginaLegal } from "@/components/website/legal/PaginaLegal";
import { siteMetadata } from "@/lib/website/metadata";
import { TERMENI } from "@/lib/website/termeni";
import { jsonLdSafe } from "@/lib/json-ld";
import { paginaSiteJsonLd } from "@/lib/website-jsonld";

/**
 * Termenii și condițiile.
 *
 * ⚠ TEXTUL NU E AICI. E în `lib/website/termeni.ts`, dat cuvânt cu cuvânt de
 * client, iar desenul e în `components/website/legal/PaginaLegal.tsx`, comun cu
 * Confidențialitate și Cookies.
 *
 * ═══ AICI STAU DATELE FIRMEI ═══
 *
 * Au fost scoase din subsol (2026-08-10) tocmai fiindcă apar în Politici.
 * Articolul 1 din documentul ăsta e unul dintre locurile care le mai țin. Nu-l
 * goli fără să le muți în altă parte — identificarea comerciantului trebuie să
 * rămână accesibilă de pe site, și pentru procesatorii de plăți.
 */

export const metadata: Metadata = siteMetadata({
  title: "Termeni si conditii",
  description:
    "Termenii si conditiile de utilizare a platformei Edinio: abonamente, plati, raspunderea comerciantului, integrari, date si incetarea contractului.",
  path: "/termeni",
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
  cale: "termeni",
  nume: "Termeni si conditii",
  descriere: metadata.description as string,
  actualizata: ULTIMA_ACTUALIZARE.iso,
});

export default function TermeniPage() {
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} /> : null}
  return <PaginaLegal doc={TERMENI} />;
}
