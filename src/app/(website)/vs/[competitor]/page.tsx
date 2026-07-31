import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/website/PageShell";
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
    description: found.description,
    path: found.href,
  });
}

export default async function ComparatiePage({ params }: Props) {
  const { competitor } = await params;
  const found = COMPETITORS.find((item) => slugOf(item.href) === competitor);
  if (!found) notFound();

  return (
    <PageShell
      eyebrow="Comparație"
      title={`Edinio vs ${found.name}`}
      lead={found.lead}
    />
  );
}
