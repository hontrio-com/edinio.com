import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Link2 } from "lucide-react";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { CardArticol } from "@/components/website/blog/CardArticol";
import { Paginare, paginaCeruta, paginaNuExista } from "@/components/website/blog/Paginare";
import { articoleleAutorului, autorDupaSlug } from "@/lib/blog/citire";
import { adreseBune } from "@/lib/blog/types";
import { autorJsonLd } from "@/lib/blog/jsonld";
import { jsonLdSafe } from "@/lib/json-ld";
import { ACASA } from "@/lib/website/breadcrumbs";
import { siteMetadata } from "@/lib/website/metadata";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ p?: string }> };

/**
 * Pagina unui autor.
 *
 * ⚠ EXISTĂ CA SĂ FACĂ ADEVĂRAT UN `@id`. Articolele declarau autorul cu
 * `@id` pe `/blog/autor/<slug>#persoana` înainte ca pagina asta să existe. Ca
 * identificator era valid, dar nu ducea nicăieri: un motor care voia să afle
 * cine e persoana nu avea unde să se uite. Acum are.
 *
 * ⚠ UN AUTOR FĂRĂ ARTICOLE NU PRIMEȘTE PAGINĂ (dă 404). O pagină cu un nume, o
 * poză și nimic altceva e o pagină subțire — pentru Google mai rău decât una
 * care lipsește, fiindcă intră în judecata pe tot domeniul.
 */
async function autorulSiArticolele(slug: string, pagina = 1) {
  const autor = await autorDupaSlug(slug);
  if (!autor) return null;
  const { articole, total, pagini } = await articoleleAutorului(autor.id, pagina);
  return { autor, articole, total, pagini };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { p } = await searchParams;
  const pagina = paginaCeruta(p);
  const gasit = await autorulSiArticolele(slug, pagina);
  if (!gasit || gasit.total === 0) return { title: "Autor negăsit" };

  const { autor, total } = gasit;
  return siteMetadata({
    title: `${autor.name}${autor.role_title ? `, ${autor.role_title}` : ""}`,
    description:
      autor.bio?.trim() ||
      `${total} ${total === 1 ? "articol scris" : "articole scrise"} de ${autor.name} pe blogul Edinio.`,
    path: pagina > 1 ? `/blog/autor/${autor.slug}?p=${pagina}` : `/blog/autor/${autor.slug}`,
  });
}

export default async function AutorBlogPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { p } = await searchParams;
  const cerut = paginaCeruta(p);
  const gasit = await autorulSiArticolele(slug, cerut);
  if (!gasit || gasit.total === 0) notFound();

  const { autor, articole, total, pagini } = gasit;
  if (paginaNuExista(cerut, total, pagini)) notFound();
  const profiluri = adreseBune(autor.sameas);
  const subiecte = [
    ...new Set(articole.map((a) => a.categorie?.name).filter((n): n is string => !!n)),
  ];

  return (
    <>
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(autorJsonLd(autor, subiecte)) }} />

      <PageHero
        sir={[ACASA, { label: "Blog", href: "/blog" }, { label: autor.name }]}
        title={autor.name}
        lead={autor.role_title ?? undefined}
      />

      <section className="mx-auto max-w-[1140px] px-5 pb-20">
        <div className="flex flex-col gap-5 rounded-2xl border border-hairline bg-tint p-6 sm:flex-row sm:items-start">
          {autor.avatar_url && (
            <Image src={autor.avatar_url} alt="" width={80} height={80}
              className="h-20 w-20 shrink-0 rounded-full object-cover" />
          )}
          <div className="min-w-0">
            {autor.bio && <p className="text-[15.5px] leading-[1.7] text-ink-2">{autor.bio}</p>}

            {/*
              Profilurile publice se ARATĂ, nu stau doar în datele structurate.
              Un cititor care vrea să știe cine scrie are unde să verifice, iar
              motoarele văd aceleași adrese și în pagină, și în `sameAs` — ceea
              ce le face verificabile, nu doar declarate.
            */}
            {profiluri.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {profiluri.map((adresa) => {
                  /* `adreseBune` a trecut deja fiecare rând prin `new URL`, deci
                     aici nu mai poate arunca. Fără filtrul acela, un rând care
                     nu e adresă ajungea chip cu textul lui brut — și, mai rău,
                     ajungea și în `sameAs`. */
                  const gazda = new URL(adresa).hostname.replace(/^www\./, "");
                  return (
                    <li key={adresa}>
                      <a href={adresa} target="_blank" rel="noopener noreferrer me"
                        className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-3/40 hover:text-ink">
                        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {gazda}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}

            {subiecte.length > 0 && (
              <p className="mt-4 text-[13px] text-ink-3">
                Scrie despre: {subiecte.join(", ")}
              </p>
            )}
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between">
          <h2 className="text-[20px] font-semibold text-ink">
            {total === 1 ? "Un articol" : `${total} articole`}
          </h2>
          <Link href="/blog" className="text-[13.5px] font-medium text-ink-2 hover:text-ink">
            Toate articolele
          </Link>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articole.map((a, i) => <CardArticol key={a.id} articol={a} prioritar={i === 0} />)}
        </div>

        <Paginare pagina={cerut} pagini={pagini} adresa={`/blog/autor/${autor.slug}`} />
      </section>

      <FinalCta />
    </>
  );
}
