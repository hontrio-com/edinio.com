import type { Metadata } from "next";
import { PaginaLegal } from "@/components/website/legal/PaginaLegal";
import { GDPR } from "@/lib/website/gdpr";
import { siteMetadata } from "@/lib/website/metadata";

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

export default function GDPRPage() {
  return <PaginaLegal doc={GDPR} />;
}
