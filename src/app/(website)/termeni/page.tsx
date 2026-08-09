import type { Metadata } from "next";
import { PaginaLegal } from "@/components/website/legal/PaginaLegal";
import { siteMetadata } from "@/lib/website/metadata";
import { TERMENI } from "@/lib/website/termeni";

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

export default function TermeniPage() {
  return <PaginaLegal doc={TERMENI} />;
}
