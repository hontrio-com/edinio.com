import type { Metadata } from "next";
import { PaginaLegal } from "@/components/website/legal/PaginaLegal";
import { CONFIDENTIALITATE } from "@/lib/website/confidentialitate";
import { siteMetadata } from "@/lib/website/metadata";

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

export default function ConfidentialitatePage() {
  return <PaginaLegal doc={CONFIDENTIALITATE} />;
}
