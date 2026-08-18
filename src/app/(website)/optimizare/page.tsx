import type { Metadata } from "next";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { HeroPagina } from "@/components/website/sections/Hero";
import { SectiunePerformanta } from "@/components/website/sections/optimizare/SectiunePerformanta";
import { SectiuneGeo } from "@/components/website/sections/optimizare/SectiuneGeo";
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
 * Cele trei secțiuni cerute de client sunt toate aici: Performanță, SEO, GEO.
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

      {/*
        Cele trei secțiuni, în ordinea cerută. Nu e o ordine oarecare: viteza se
        simte la primul click, SEO se vede în rezultate, iar GEO abia în ce spune
        un asistent despre tine. De la ce atinge omul spre ce nu se vede.
      */}
      <SectiunePerformanta />
      <SectiuneSeo />
      <SectiuneGeo />

      {/*
        Aceeași bandă de final ca pe pagina de start, „Integrări", „Prețuri" și
        paginile vs. Se REFOLOSEȘTE, nu se scrie alta: textul e al clientului și
        e aprobat, iar o variantă proprie ar fi însemnat text inventat de mine pe
        o pagină comercială. Dacă se schimbă vreodată o vorbă acolo, se schimbă
        peste tot deodată — ăsta e chiar rostul.

        Fără ea pagina se termina în gol: după ultima siglă din GEO intrai direct
        în subsol, fără să ți se spună ce ai de făcut mai departe.

        `SectiuneGeo` e tot pe alb, ca banda — la fel stau lucrurile și pe
        „Prețuri" și „Mentenanță gratuită". Nu se lipesc: banda are 96–128px de
        aer și harta în spate, deci se citește ca alt lucru, nu ca o continuare.
      */}
      <FinalCta />
    </>
  );
}
