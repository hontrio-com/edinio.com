import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HeroPagina } from "@/components/website/sections/Hero";
import { SectionEyebrow } from "@/components/website/sections/SectionEyebrow";
import { siteMetadata } from "@/lib/website/metadata";
import { COMPETITORS } from "@/lib/website/nav";

/**
 * Paginile de comparatie, din aceeasi lista care alimenteaza meniul.
 *
 * Textele sunt publicitate comparativa: afirmatiile trebuie sa rimana
 * verificabile si sa compare aceleasi caracteristici. Vezi nota din
 * `src/lib/website/nav.ts`.
 */

interface Props {
  params: Promise<{ competitor: string }>;
}

/** Ultimul segment din `href`, ex. "shopify" din "/vs/shopify". */
function slugOf(href: string) {
  return href.split("/").pop() ?? "";
}

export function generateStaticParams() {
  return COMPETITORS.map((competitor) => ({ competitor: slugOf(competitor.href) }));
}

/* Doar slug-urile din lista. Pentru ce se intampla cu un slug greșit, vezi nota
   din `industrii/[industrie]/page.tsx`. */
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competitor } = await params;
  const found = COMPETITORS.find((item) => slugOf(item.href) === competitor);
  if (!found) return {};
  return siteMetadata({
    title: `Edinio vs ${found.name}`,
    /* ⚠ Fraza LUNGĂ, nu rândul scurt din meniu. Cel din meniu are vreo șaizeci
       de semne — ca descriere în rezultatele Google e subțire, iar ei o taie
       oricum pe la 155. Asta e chiar textul de sub titlu, deci și cel mai
       aproape de ce găsește omul pe pagină. */
    description: found.lead,
    path: found.href,
  });
}

export default async function ComparatiePage({ params }: Props) {
  const { competitor } = await params;
  const found = COMPETITORS.find((item) => slugOf(item.href) === competitor);
  if (!found) notFound();

  return (
    /*
      ⚠ ACELAȘI CADRU CA LA CELELALTE PAGINI (`HeroPagina`), nu `PageShell`.
      Cerut de client (13.08). `PageShell` e capul scurt al paginilor în care
      ajungi căutând ceva anume — ajutor, termeni, industrii; astea sunt pagini
      care CONVING, deci primul ecran trebuie să fie afirmația, cu butoanele ei.

      ⚠ ETICHETA spune cu cine se compară, fiindcă titlul nu mai spune. Titlurile
      sunt ale clientului și vorbesc despre ce câștigi („O alternativă românească
      la Shopify"), nu despre cine cu cine — fără eticheta de deasupra, omul n-ar
      ști pe ce pagină a ajuns. Scrisă „vs", se citește „VS": eticheta e cu
      majuscule din stil.
    */
    <HeroPagina
      eticheta={<SectionEyebrow label={`Edinio vs ${found.name}`} />}
      title={found.titlu}
      lead={found.lead}
      cta={{ label: "Începe gratuit", href: "/register" }}
      secundara={{ label: "Vezi prețurile", href: "/preturi" }}
    />
  );
}
