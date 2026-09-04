import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { CardArticol } from "@/components/website/blog/CardArticol";
import { notFound } from "next/navigation";
import { Paginare, paginaCeruta, paginaNuExista } from "@/components/website/blog/Paginare";
import { CautareBlog } from "@/components/website/blog/CautareBlog";
import { AbonareBlog } from "@/components/website/blog/AbonareBlog";
import { articolulDinVitrina, categoriiFolosite, paginaDeArticole } from "@/lib/blog/citire";
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
  const meta = siteMetadata({
    title:
      pagina > 1
        ? `Blog, pagina ${pagina}`
        : "Blog eCommerce: sfaturi, noutăți și tendințe",
    description:
      "Citește sfaturi practice, noutăți și tendințe despre eCommerce, magazine online, marketing, vânzare online și evoluția comerțului digital.",
    path: pagina > 1 ? `/blog?p=${pagina}` : "/blog",
  });

  /*
    Legatura catre feed, ca sa poata fi GASIT.

    Un feed pe care nu-l anunta nicio pagina exista doar pentru cine ii ghiceste
    adresa. Randul asta e felul in care cititoarele de feeduri si crawlerele afla
    ca avem unul — si crawlerele se intorc la un feed mai des decat la sitemap.
  */
  return {
    ...meta,
    alternates: {
      ...meta.alternates,
      types: { "application/rss+xml": [{ url: "/blog/feed", title: "Blogul Edinio" }] },
    },
  };
}

export default async function BlogPage({ searchParams }: Props) {
  const { p } = await searchParams;
  const cerut = paginaCeruta(p);

  const [{ articole, total, pagini }, categoriiDeAratat, vitrina] = await Promise.all([
    paginaDeArticole(cerut),
    categoriiFolosite(),
    /* Vitrina se caută doar când chiar se arată, adică pe prima pagină. */
    cerut === 1 ? articolulDinVitrina() : Promise.resolve(null),
  ]);

  /* ⚠ O pagină care nu există dă 404, nu o listă goală cu adresă proprie.
     Vezi `paginaNuExista`. */
  if (paginaNuExista(cerut, total, pagini)) notFound();

  /*
    ⚠ RUBRICILE SE SOCOTESC PE TOATE ARTICOLELE, ȘI ACUM CHIAR SE SOCOTESC.

    Comentariul de aici spunea exact asta, dar codul de dedesubt făcea pe dos:
    `new Set(articole.map(...))` — adică din cele 12 rânduri ale paginii curente.
    Urmarea: navigația se schimba sub picioarele omului de la o pagină la alta, iar
    o rubrică ale cărei articole erau abia în pagina 3 nu se vedea de nicăieri.

    Cele fără niciun articol publicat tot nu se arată: un filtru care duce la o
    pagină goală e o promisiune neonorată. Numai că acum „fără articole" se
    hotărăște în bază, nu din ce s-a nimerit pe ecran.
  */

  /* Cel scos în față stă lat, dar DOAR pe prima pagină: pe a treia, un articol
     mare în capul listei ar rupe ordinea cronologică fără să spună de ce.

     ⚠ Se caută în TOATĂ baza, nu în pagina curentă — vezi `articolulDinVitrina`.
     Dacă nu e ales niciunul, stă primul din listă, ca pagina să nu arate ciuntită. */
  const scosInFata = cerut === 1 ? (vitrina ?? articole[0] ?? null) : null;
  const restul = scosInFata ? articole.filter((a) => a.id !== scosInFata.id) : articole;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(listaBlogJsonLd()) }} />

      <PageHero
        sir={[ACASA, { label: "Blog" }]}
        title="Ghiduri și noutăți despre vânzarea online"
        lead="Scriem despre ce ține un magazin online pe picioare în România: curierat, facturare, plăți și tot ce aflăm construind Edinio."
      />

      <section className="mx-auto max-w-[1200px] px-5 pt-10 pb-20 sm:px-6 lg:px-8 lg:pt-14">
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
