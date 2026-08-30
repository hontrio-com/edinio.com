import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { CardArticol } from "@/components/website/blog/CardArticol";
import { notFound } from "next/navigation";
import { Paginare, paginaCeruta, paginaNuExista } from "@/components/website/blog/Paginare";
import { CautareBlog } from "@/components/website/blog/CautareBlog";
import { AbonareBlog } from "@/components/website/blog/AbonareBlog";
import { categoriiBlog, paginaDeArticole } from "@/lib/blog/citire";
import { listaBlogJsonLd } from "@/lib/blog/jsonld";
import { jsonLdSafe } from "@/lib/json-ld";
import { ACASA } from "@/lib/website/breadcrumbs";
import { siteMetadata } from "@/lib/website/metadata";

/**
 * Blogul, care a luat locul paginii de Roadmap (cerut 2026-08-09).
 *
 * ⚠ TOT CONȚINUTUL VINE DE LA SERVER, fără nimic încărcat din browser.
 * Păianjenii motoarelor care răspund cu text în general nu execută JavaScript,
 * deci ce nu e în HTML-ul dintâi nu există pentru ei.
 */
type Props = { searchParams: Promise<{ p?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { p } = await searchParams;
  const pagina = paginaCeruta(p);

  /*
    ⚠ FIECARE PAGINĂ ARE TITLUL ȘI ADRESA EI CANONICĂ.

    Cu un canonical care arată mereu spre `/blog`, Google ar fi socotit paginile
    2, 3, 4 drept copii ale primei și n-ar mai fi urmat legăturile din ele. Adică
    articolele mai vechi ar fi devenit de negăsit — chiar defectul pe care
    paginarea trebuia să-l repare.
  */
  return siteMetadata({
    title:
      pagina > 1
        ? `Blog, pagina ${pagina}`
        : "Blog: ghiduri si noutati despre vanzarea online",
    description:
      "Ghiduri practice despre magazine online, curierat, facturare si vanzare in Romania, plus noutatile platformei Edinio.",
    path: pagina > 1 ? `/blog?p=${pagina}` : "/blog",
  });
}

export default async function BlogPage({ searchParams }: Props) {
  const { p } = await searchParams;
  const cerut = paginaCeruta(p);

  const [{ articole, total, pagini }, categorii] = await Promise.all([
    paginaDeArticole(cerut),
    categoriiBlog(),
  ]);

  /* ⚠ O pagină care nu există dă 404, nu o listă goală cu adresă proprie.
     Vezi `paginaNuExista`. */
  if (paginaNuExista(cerut, total, pagini)) notFound();

  /* Categoriile fără niciun articol publicat nu se arată: un filtru care duce la
     o pagină goală e o promisiune neonorată. Se socotesc pe TOATE articolele,
     nu doar pe cele de pe pagina curentă. */
  const cuArticole = new Set(articole.map((a) => a.categorie?.slug).filter(Boolean));
  const categoriiDeAratat = categorii.filter((c) => cuArticole.has(c.slug));

  /* Cel scos în față stă lat, dar DOAR pe prima pagină: pe a treia, un articol
     mare în capul listei ar rupe ordinea cronologică fără să spună de ce. */
  const scosInFata = cerut === 1 ? (articole.find((a) => a.is_featured) ?? articole[0]) : null;
  const restul = scosInFata ? articole.filter((a) => a.id !== scosInFata.id) : articole;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(listaBlogJsonLd()) }} />

      <PageHero
        sir={[ACASA, { label: "Blog" }]}
        title="Ghiduri și noutăți despre vânzarea online"
        lead="Scriem despre ce ține un magazin online pe picioare în România: curierat, facturare, plăți și tot ce aflăm construind Edinio."
      />

      <section className="mx-auto max-w-[1140px] px-5 pb-20">
        {total === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline bg-tint p-8 text-center text-[15px] text-ink-2">
            Primele articole sunt în lucru. Până atunci, în{" "}
            <Link href="/ajutor" className="font-semibold text-ink underline-offset-4 hover:underline">
              Centrul de ajutor
            </Link>{" "}
            găsești peste 400 de ghiduri despre folosirea platformei.
          </p>
        ) : (
          <>
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {categoriiDeAratat.length > 0 ? (
                <nav className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-medium text-white">
                    Toate
                  </span>
                  {categoriiDeAratat.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/blog/categorie/${c.slug}`}
                      className="rounded-full border border-hairline px-3.5 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-3/40 hover:text-ink"
                    >
                      {c.name}
                    </Link>
                  ))}
                </nav>
              ) : (
                <span />
              )}
              <CautareBlog />
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {scosInFata && <CardArticol articol={scosInFata} mare prioritar />}
              {restul.map((a, i) => (
                <CardArticol key={a.id} articol={a} prioritar={!scosInFata && i === 0} />
              ))}
            </div>

            <Paginare pagina={cerut} pagini={pagini} adresa="/blog" />
          </>
        )}

        {/*
          ⚠ ÎN AFARA CONDIȚIEI, DINADINS. Prima dată caseta era înăuntrul ramurii
          cu articole, deci pe un blog gol nu se vedea deloc — exact momentul în
          care are cel mai mult rost. Cine ajunge pe un blog fără articole și
          vrea să afle când apar primele n-are altă cale să o spună.
        */}
        <AbonareBlog />
      </section>

      <FinalCta />
    </>
  );
}
