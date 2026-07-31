import type { Metadata } from "next";
import { PageShell } from "@/components/website/PageShell";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Curieri si AWB automat pentru magazinul online",
  description: "FAN Courier, Sameday, Cargus, DPD, Colete Online si Woot. Tarife live la checkout, lockere pe harta si AWB generat automat din comanda.",
  path: "/curieri",
});

export default function CurieriPage() {
  return (
    <PageShell
      eyebrow="Livrare"
      title="Curierii din România, cu AWB generat automat"
      lead="FAN Courier, Sameday, Cargus, DPD, Colete Online și Woot. Tarife live la checkout, lockere pe hartă și AWB făcut din comandă, fără să tastezi adresa."
    />
  );
}
