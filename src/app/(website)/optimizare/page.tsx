import type { Metadata } from "next";
import { HeroPagina } from "@/components/website/sections/Hero";
import { SectiunePerformanta } from "@/components/website/sections/optimizare/SectiunePerformanta";
import { SectiuneSeo } from "@/components/website/sections/optimizare/SectiuneSeo";
import { TitluOptimizare } from "@/components/website/sections/optimizare/TitluOptimizare";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Optimizare: viteza, performanta si SEO",
  description:
    "Edinio optimizeaza magazinele pentru viteza, performanta si SEO, ca sa se incarce rapid si sa aiba o baza buna pentru motoarele de cautare.",
  path: "/optimizare",
});

/**
 * Pagina „Optimizare".
 *
 * ═══ ACELAȘI CADRU CA LA CELELALTE ═══
 *
 * Tot `HeroPagina`, adică chiar hero-ul de pe pagina de start. Ce e altfel aici
 * stă ÎNĂUNTRUL titlului, nu în jurul lui: cuvântul „Rapid" are o urmă de viteză,
 * iar litera G din „Google" e semnul lor. Amândouă sunt cerute de client
 * (2026-08-13) și sunt în `sections/optimizare/TitluOptimizare.tsx`.
 *
 * ⚠ Titlul rămâne NEGRU integral. Singura culoare din el e a siglei Google, adică
 * a altcuiva — regula „fără cuvinte verzi în titluri" nu e atinsă.
 *
 * ⚠ TITLUL ȘI DESCRIEREA SUNT ALE CLIENTULUI, date cuvânt cu cuvânt. Le-a
 * înlocuit pe cele dinainte („Rapid, găsibil în Google și făcut pentru
 * conversie"). Nu se rescriu.
 *
 * ⚠ Supratitlul „Performanță" a fost scos odată cu `PageShell`: `HeroPagina`
 * n-are pastilă deasupra titlului, ca la „Mentenanță gratuită" și „Integrări".
 *
 * ⚠ NETERMINATĂ. Are doar hero-ul; restul secțiunilor vin separat.
 */
export default function OptimizarePage() {
  return (
    <>
      <HeroPagina
        title={<TitluOptimizare />}
        lead="Edinio optimizează magazinele pentru viteză, performanță și SEO, astfel încât să se încarce rapid și să aibă o bază bună pentru motoarele de căutare."
        cta={{ label: "Începe gratuit", href: "/register" }}
        secundara={{ label: "Vezi prețurile", href: "/preturi" }}
      />

      {/* Cele trei secțiuni cerute: Performanță, SEO, GEO. A treia urmează. */}
      <SectiunePerformanta />
      <SectiuneSeo />
    </>
  );
}
