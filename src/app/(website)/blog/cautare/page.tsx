import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { CardArticol } from "@/components/website/blog/CardArticol";
import { CautareBlog } from "@/components/website/blog/CautareBlog";
import { notFound } from "next/navigation";
import { Paginare, paginaCeruta, paginaNuExista } from "@/components/website/blog/Paginare";
import { cautaArticole } from "@/lib/blog/citire";
import { ACASA } from "@/lib/website/breadcrumbs";

type Props = { searchParams: Promise<{ q?: string; p?: string }> };

/**
 * Rezultatele căutării în blog.
 *
 * ⚠ `noindex` DINADINS, PE TOATE. O pagină de rezultate e conținut subțire și
 * repetat: aceleași articole, altfel amestecate, la o adresă pentru fiecare
 * căutare pe care o poate scrie cineva. Google cere explicit să nu fie
 * indexate, iar lăsate libere ar fi umplut indexul cu mii de adrese care nu
 * spun nimic nou.
 *
 * `follow` rămâne: legăturile către articole se urmează, doar pagina asta nu
 * intră în index.
 *
 * ⚠ `cautare` E SEGMENT STATIC, deci nu se ceartă cu `/blog/[slug]`. Un articol
 * cu slug-ul „cautare" ar fi umbrit — numele e ținut minte aici, nu doar în rută.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const cautat = (q ?? "").trim();
  return {
    title: cautat ? `Căutare: ${cautat}` : "Căutare pe blog",
    robots: { index: false, follow: true },
  };
}

export default async function CautareBlogPage({ searchParams }: Props) {
  const { q, p } = await searchParams;
  const cautat = (q ?? "").trim();
  const cerut = paginaCeruta(p);

  const { articole, total, pagini } = cautat
    ? await cautaArticole(cautat, cerut)
    : { articole: [], total: 0, pagini: 1 };

  /*
    ⚠ ȘI AICI, DEȘI PAGINA E `noindex`.

    Celelalte liste (`/blog`, rubrică, autor, etichetă) dau 404 pe o pagină care
    nu există; asta rămăsese pe dinafară. `?q=seo&p=99999` răspundea 200 cu o
    listă goală și cu paginarea desenată dedesubt — adică arăta ca o pagină
    adevărată care s-a golit, nu ca o adresă greșită.

    Miza SEO e mică, fiindcă e `noindex`. Miza e că omul care ajunge acolo dintr-o
    legătură veche nu află ce s-a întâmplat, iar ecranul se poartă altfel decât
    toate celelalte liste ale blogului.
  */
  if (cautat && paginaNuExista(cerut, total, pagini)) notFound();

  const preaScurt = cautat.length > 0 && cautat.length < 2;

  return (
    <>
      <PageHero
        sir={[ACASA, { label: "Blog", href: "/blog" }, { label: "Căutare" }]}
        title={cautat ? `Rezultate pentru „${cautat}”` : "Caută în articole"}
        lead={
          cautat && !preaScurt
            ? total === 1
              ? "Un articol găsit."
              : `${total} articole găsite.`
            : undefined
        }
      />

      <section className="mx-auto max-w-[1140px] px-5 pb-20">
        <div className="mb-8 flex justify-center">
          <CautareBlog initial={cautat} />
        </div>

        {preaScurt ? (
          <p className="rounded-2xl border border-dashed border-hairline bg-tint p-8 text-center text-[15px] text-ink-2">
            Scrie măcar două litere.
          </p>
        ) : !cautat ? (
          <p className="text-center text-[15px] text-ink-2">
            Scrie un cuvânt în caseta de mai sus.{" "}
            <Link href="/blog" className="font-semibold text-ink underline-offset-4 hover:underline">
              Sau vezi toate articolele
            </Link>
          </p>
        ) : total === 0 ? (
          /*
            ⚠ UN REZULTAT GOL NU E UN FUND DE SAC. Omul a scris ceva și n-a
            găsit; dacă pagina se oprește aici, drumul lui se termină. Cele două
            legături îl duc mai departe, iar a doua e cea mai folositoare:
            centrul de ajutor are peste 400 de ghiduri, deci multe întrebări
            care nu găsesc un articol de blog își găsesc răspunsul acolo.
          */
          <div className="rounded-2xl border border-dashed border-hairline bg-tint p-8 text-center">
            <p className="text-[15px] text-ink">Niciun articol pentru „{cautat}”.</p>
            <p className="mt-2 text-[14px] text-ink-2">
              Încearcă un cuvânt mai scurt, sau caută în{" "}
              <Link href="/ajutor" className="font-semibold text-ink underline-offset-4 hover:underline">
                Centrul de ajutor
              </Link>
              , unde sunt peste 400 de ghiduri despre platformă.
            </p>
            <Link
              href="/blog"
              className="mt-4 inline-block text-[13.5px] font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline"
            >
              Vezi toate articolele
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {articole.map((a, i) => (
                <CardArticol key={a.id} articol={a} prioritar={i === 0} />
              ))}
            </div>
            <Paginare
              pagina={cerut}
              pagini={pagini}
              adresa={`/blog/cautare?q=${encodeURIComponent(cautat)}`}
            />
          </>
        )}
      </section>

      <FinalCta />
    </>
  );
}
