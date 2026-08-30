import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { CardArticol } from "@/components/website/blog/CardArticol";
import { articolePublicate, categoriiBlog } from "@/lib/blog/citire";
import { listaBlogJsonLd } from "@/lib/blog/jsonld";
import { jsonLdSafe } from "@/lib/json-ld";
import { ACASA } from "@/lib/website/breadcrumbs";
import { siteMetadata } from "@/lib/website/metadata";

/**
 * Blogul, care a luat locul paginii de Roadmap (cerut 2026-08-09).
 *
 * A fost o coajă până pe 30.08.2026: `PageShell` cu titlu și introducere, fără
 * articole, ca legăturile din meniu și din subsol să ducă undeva. Acum arată
 * articolele adevărate, iar coaja a rămas doar pentru cazul în care nu e încă
 * niciunul publicat.
 *
 * ⚠ TOT CONȚINUTUL VINE DE LA SERVER, fără nimic încărcat din browser. Nu e o
 * preferință: păianjenii motoarelor care răspund cu text în general nu execută
 * JavaScript, deci ce nu e în HTML-ul dintâi nu există pentru ei. Aceeași
 * lecție ca la `useSearchParams` pe pagina de integrări.
 */
export const metadata: Metadata = siteMetadata({
  title: "Blog Edinio: ghiduri si noutati despre vanzarea online",
  description:
    "Ghiduri practice despre magazine online, curierat, facturare si vanzare in Romania, plus noutatile platformei Edinio.",
  path: "/blog",
});

export default async function BlogPage() {
  const [articole, categorii] = await Promise.all([articolePublicate(), categoriiBlog()]);

  /* Categoriile fără niciun articol publicat nu se arată: un filtru care duce
     la o pagină goală e o promisiune neonorată. */
  const cuArticole = new Set(articole.map((a) => a.categorie?.slug).filter(Boolean));
  const categoriiDeAratat = categorii.filter((c) => cuArticole.has(c.slug));

  /* Cel scos în față stă primul și lat. Dacă nu e ales niciunul, cel mai nou ia
     locul: un cap de listă gol ar arăta a greșeală, nu a alegere. */
  const scosInFata = articole.find((a) => a.is_featured) ?? articole[0];
  const restul = articole.filter((a) => a.id !== scosInFata?.id);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(listaBlogJsonLd()) }} />

      <PageHero
        sir={[ACASA, { label: "Blog" }]}
        title="Ghiduri și noutăți despre vânzarea online"
        lead="Scriem despre ce ține un magazin online pe picioare în România: curierat, facturare, plăți și tot ce aflăm construind Edinio."
      />

      <section className="mx-auto max-w-[1140px] px-5 pb-20">
        {articole.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline bg-tint p-8 text-center text-[15px] text-ink-2">
            Primele articole sunt în lucru. Până atunci, în{" "}
            <Link href="/ajutor" className="font-semibold text-ink underline-offset-4 hover:underline">
              Centrul de ajutor
            </Link>{" "}
            găsești peste 400 de ghiduri despre folosirea platformei.
          </p>
        ) : (
          <>
            {categoriiDeAratat.length > 0 && (
              <nav className="mb-8 flex flex-wrap gap-2">
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
            )}

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {scosInFata && <CardArticol articol={scosInFata} mare prioritar />}
              {restul.map((a) => (
                <CardArticol key={a.id} articol={a} />
              ))}
            </div>
          </>
        )}
      </section>

      <FinalCta />
    </>
  );
}
