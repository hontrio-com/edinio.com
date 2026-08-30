import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { CardArticol } from "@/components/website/blog/CardArticol";
import { articoleleCategoriei, categoriiBlog } from "@/lib/blog/citire";
import { ACASA } from "@/lib/website/breadcrumbs";
import { siteMetadata } from "@/lib/website/metadata";

type Props = { params: Promise<{ slug: string }> };

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await categoria(slug);
  if (!c) return { title: "Categorie negăsită" };
  return siteMetadata({
    title: c.seo_title?.trim() || `${c.name}: ghiduri si articole | Blog Edinio`,
    description:
      c.seo_description?.trim() || c.description ||
      `Articole despre ${c.name.toLowerCase()} de pe blogul Edinio.`,
    path: `/blog/categorie/${c.slug}`,
  });
}

export default async function CategorieBlogPage({ params }: Props) {
  const { slug } = await params;
  const c = await categoria(slug);
  if (!c) notFound();

  const articole = await articoleleCategoriei(slug);

  return (
    <>
      <PageHero
        sir={[ACASA, { label: "Blog", href: "/blog" }, { label: c.name }]}
        title={c.name}
        lead={c.description ?? undefined}
      />

      <section className="mx-auto max-w-[1140px] px-5 pb-20">
        {articole.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline bg-tint p-8 text-center text-[15px] text-ink-2">
            Încă niciun articol aici.{" "}
            <Link href="/blog" className="font-semibold text-ink underline-offset-4 hover:underline">
              Vezi toate articolele
            </Link>
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {articole.map((a, i) => <CardArticol key={a.id} articol={a} prioritar={i === 0} />)}
          </div>
        )}
      </section>

      <FinalCta />
    </>
  );
}
