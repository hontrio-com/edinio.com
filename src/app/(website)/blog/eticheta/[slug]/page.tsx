import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { CardArticol } from "@/components/website/blog/CardArticol";
import { Paginare, paginaCeruta } from "@/components/website/blog/Paginare";
import { articoleleEtichetei, eticheta } from "@/lib/blog/citire";
import { ACASA } from "@/lib/website/breadcrumbs";
import { siteMetadata } from "@/lib/website/metadata";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ p?: string }> };

/**
 * Articolele unei etichete.
 *
 * ⚠ ETICHETELE NU SUNT CATEGORII, deși paginile seamănă. Un articol are o
 * singură categorie, aleasă dintr-o listă scurtă ținută de noi; poate avea mai
 * multe etichete, scrise liber în editor. De aceea categoria intră în firimituri
 * și în `articleSection` din datele structurate, iar eticheta nu: ar fi spus
 * despre articol că e în cinci secțiuni deodată.
 *
 * ⚠ O ETICHETĂ FĂRĂ ARTICOLE PUBLICATE DĂ 404, chiar dacă rândul ei există. Se
 * poate întâmpla firesc: o etichetă pusă doar pe o ciornă. O pagină goală ar fi
 * conținut subțire, și ar intra în judecata pe tot domeniul.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const e = await eticheta(slug);
  if (!e) return { title: "Etichetă negăsită" };
  return siteMetadata({
    title: `${e.name}: articole de blog`,
    description: `Toate articolele etichetate „${e.name}" de pe blogul Edinio.`,
    path: `/blog/eticheta/${e.slug}`,
  });
}

export default async function EticheteBlogPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { p } = await searchParams;
  const cerut = paginaCeruta(p);

  const e = await eticheta(slug);
  if (!e) notFound();

  const { articole, total, pagini } = await articoleleEtichetei(slug, cerut);
  if (total === 0) notFound();

  return (
    <>
      <PageHero
        sir={[ACASA, { label: "Blog", href: "/blog" }, { label: e.name }]}
        title={e.name}
        lead={
          total === 1
            ? "Un articol cu eticheta aceasta."
            : `${total} articole cu eticheta aceasta.`
        }
      />

      <section className="mx-auto max-w-[1140px] px-5 pb-20">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articole.map((a, i) => (
            <CardArticol key={a.id} articol={a} prioritar={i === 0} />
          ))}
        </div>

        <Paginare pagina={cerut} pagini={pagini} adresa={`/blog/eticheta/${e.slug}`} />

        <p className="mt-10 text-center text-[13.5px] text-ink-2">
          <Link href="/blog" className="font-medium underline-offset-4 hover:text-ink hover:underline">
            Toate articolele
          </Link>
        </p>
      </section>

      <FinalCta />
    </>
  );
}
