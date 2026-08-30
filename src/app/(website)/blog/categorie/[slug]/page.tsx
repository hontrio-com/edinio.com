import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { CardArticol } from "@/components/website/blog/CardArticol";
import { Paginare, paginaCeruta, paginaNuExista } from "@/components/website/blog/Paginare";
import { articoleleCategoriei, categoriiBlog, undeS_aMutat } from "@/lib/blog/citire";
import { ACASA } from "@/lib/website/breadcrumbs";
import { siteMetadata } from "@/lib/website/metadata";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ p?: string }> };

/**
 * Articolele unei categorii.
 *
 * ⚠ `categorie` E SEGMENT STATIC, deci nu se ceartă cu `/blog/[slug]`: Next
 * alege întotdeauna staticul. Un articol care ar avea chiar slug-ul „categorie"
 * ar fi umbrit — de aceea numele ăsta e ținut minte aici, nu doar în rută.
 *
 * ⚠ ADRESA ARTICOLULUI RĂMÂNE PLATĂ, `/blog/<slug>`, nu sub categorie. Un
 * articol mutat dintr-o categorie în alta n-are voie să-și schimbe adresa, iar
 * unul care ar sta în două categorii n-are voie să aibă două adrese pentru
 * același text. Pagina asta e o listă, nu un dosar.
 */
async function categoria(slug: string) {
  return (await categoriiBlog()).find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { p } = await searchParams;
  const pagina = paginaCeruta(p);
  const c = await categoria(slug);
  if (!c) return { title: "Categorie negăsită" };

  /* ⚠ FĂRĂ marca la sfârșit: aspectul rădăcină adaugă „| Edinio" singur
     (`template` din `app/layout.tsx`). Scrisă și aici, ieșea de două ori. */
  const titlu = c.seo_title?.trim() || `${c.name}: ghiduri si articole de blog`;
  return siteMetadata({
    title: pagina > 1 ? `${titlu}, pagina ${pagina}` : titlu,
    description:
      c.seo_description?.trim() || c.description ||
      `Articole despre ${c.name.toLowerCase()} de pe blogul Edinio.`,
    path: pagina > 1 ? `/blog/categorie/${c.slug}?p=${pagina}` : `/blog/categorie/${c.slug}`,
  });
}

export default async function CategorieBlogPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { p } = await searchParams;
  const cerut = paginaCeruta(p);

  const c = await categoria(slug);
  if (!c) {
    /*
      ⚠ NU 404 DIRECT: poate doar s-a mutat.

      Adresa unei rubrici e la fel de indexata ca a unui articol, si de obicei
      mai veche decat articolele din ea. Pana pe 30.08.2026, o redenumire din
      admin o omora fara urma — articolele isi pastrau adresele, rubrica nu. Un
      308 duce mai departe tot ce a strans.
    */
    const mutatLa = await undeS_aMutat(slug, "categorie");
    if (mutatLa) permanentRedirect(`/blog/categorie/${mutatLa}`);
    notFound();
  }

  const { articole, total, pagini } = await articoleleCategoriei(slug, cerut);

  /*
    ⚠ O CATEGORIE FĂRĂ ARTICOLE PUBLICATE DĂ 404, ca eticheta și ca autorul.

    Pagina ei nu e legată de nicăieri când e goală — filtrele din lista de blog
    sar peste categoriile fără articole — deci se ajunge la ea doar pe adresa
    directă. Un 200 cu o pagină goală e conținut subțire, și intră în judecata pe
    tot domeniul.
  */
  if (total === 0) notFound();

  /* ⚠ Și o pagină de paginare care nu există: `?p=999` pe o categorie cu două
     pagini răspundea 200 cu o listă goală. Vezi `paginaNuExista`. */
  if (paginaNuExista(cerut, total, pagini)) notFound();

  return (
    <>
      <PageHero
        sir={[ACASA, { label: "Blog", href: "/blog" }, { label: c.name }]}
        title={c.name}
        lead={c.description ?? undefined}
      />

      <section className="mx-auto max-w-[1140px] px-5 pb-20">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articole.map((a, i) => (
            <CardArticol key={a.id} articol={a} prioritar={i === 0} />
          ))}
        </div>

        {/* ⚠ PAGINARE ȘI AICI. Fără ea, categoria se oprea la primele articole
            aduse, iar restul deveneau de negăsit din pagină — același defect
            mut pe care paginarea listei principale îl repară. */}
        <Paginare pagina={cerut} pagini={pagini} adresa={`/blog/categorie/${c.slug}`} />

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
