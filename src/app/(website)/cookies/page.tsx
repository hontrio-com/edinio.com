import type { Metadata } from "next";
import { PaginaLegal } from "@/components/website/legal/PaginaLegal";
import { COOKIES } from "@/lib/website/cookies";
import { siteMetadata } from "@/lib/website/metadata";

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

export default function CookiesPage() {
  return <PaginaLegal doc={COOKIES} />;
}
