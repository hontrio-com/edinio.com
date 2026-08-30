import Link from "next/link";
import Image from "next/image";
import { Clock } from "lucide-react";
import { PageHero } from "@/components/website/PageHero";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { CardArticol } from "@/components/website/blog/CardArticol";
import { AbonareBlog } from "@/components/website/blog/AbonareBlog";
import { IndemnArticol } from "@/components/website/blog/IndemnArticol";
import { articoleInrudite, eticheteArticol } from "@/lib/blog/citire";
import type { ArticolIntreg } from "@/lib/blog/citire";
import { curataArticol } from "@/lib/blog/curata";
import { cuprinsSiHtml, meritaCuprins } from "@/lib/blog/cuprins";
import { ACASA } from "@/lib/website/breadcrumbs";

/**
 * Articolul, așa cum îl vede cititorul.
 *
 * ⚠ EXISTĂ CA SĂ FIE UN SINGUR LOC.
 *
 * Redactorii n-aveau NICIUN fel de a se uita la o ciornă înainte de publicare:
 * pagina publică refuză tot ce nu e `published` cu data trecută — și bine face.
 * Deci singurul fel de a vedea cum arată textul era să-l publici.
 *
 * O pagină de previzualizare care ar fi refăcut aranjarea „cam la fel" ar fi
 * fost mai rea decât nimic: omul ar fi luat hotărâri despre spațiere, despre
 * lungimea titlului, despre unde cade coperta — uitându-se la altceva decât la
 * ce urmează să apară. De aceea corpul e AICI, iar cele două pagini îl folosesc
 * pe același.
 *
 * ⚠ CE NU E AICI, DINADINS: datele structurate și numărătoarea citirilor. Prima
 * n-are ce căuta pe o pagină `noindex`; a doua ar fi umflat cifrele cu vizitele
 * redacției.
 */
export async function CorpArticol({ a }: { a: ArticolIntreg }) {
  /* Ordinea contează: se curăță ÎNTÂI, apoi se pun ancorele. Curățătorul nu
     îngăduie `id`, deci ancorele puse înainte ar fi fost șterse. */
  const { cuprins, html } = cuprinsSiHtml(curataArticol(a.content_html));
  const [inrudite, etichete] = await Promise.all([
    articoleInrudite(a),
    eticheteArticol(a.id),
  ]);

  const data = a.published_at
    ? new Date(a.published_at).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })
    : null;
  /*
    ⚠ `content_updated_at`, NU `updated_at`.

    Al doilea se mută la orice atingere administrativă. Deci un articol pe care
    nimeni nu-l atinsese începea să scrie „Actualizat 30 august" pentru că altul
    fusese pus în vitrină, iar triggerul îl coborâse pe ăsta.

    Pragul de 24 de ore rămâne: între publicare și primele corecturi trec de
    obicei câteva ore, iar „Actualizat" în aceeași zi cu publicarea nu spune
    nimic nimănui.
  */
  const actualizat =
    a.published_at &&
    new Date(a.content_updated_at).getTime() - new Date(a.published_at).getTime() > 86_400_000
      ? new Date(a.content_updated_at).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })
      : null;

  return (
    <>
      <PageHero
        sir={[
          ACASA,
          { label: "Blog", href: "/blog" },
          ...(a.categorie ? [{ label: a.categorie.name, href: `/blog/categorie/${a.categorie.slug}` }] : []),
          { label: a.title },
        ]}
        title={a.title}
        lead={a.excerpt ?? undefined}
      />

      <article className="mx-auto max-w-[1140px] px-5 pb-20">
        {/* Rândul de sub titlu: cine a scris, când, cât durează. Semnale de
            încredere pentru cititor, și de prospețime pentru motoare. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline pb-6 text-[13.5px] text-ink-2">
          {a.autor && (
            /* Legătura către pagina autorului nu e doar comoditate: ea face ca
               `@id`-ul de persoană din datele structurate să aibă un drum pe
               care poate merge și un motor, și un cititor. */
            <Link href={`/blog/autor/${a.autor.slug}`}
              className="flex items-center gap-2 transition-colors hover:text-ink">
              {a.autor.avatar_url && (
                <Image src={a.autor.avatar_url} alt="" width={28} height={28}
                  className="h-7 w-7 rounded-full object-cover" />
              )}
              <span className="font-medium text-ink">{a.autor.name}</span>
              {a.autor.role_title && <span className="text-ink-3">· {a.autor.role_title}</span>}
            </Link>
          )}
          {data && <time dateTime={a.published_at ?? undefined}>{data}</time>}
          {actualizat && <span className="text-ink-3">Actualizat {actualizat}</span>}
          {a.reading_minutes && (
            <span className="inline-flex items-center gap-1.5 text-ink-3">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {a.reading_minutes} min
            </span>
          )}
        </div>

        {a.cover_url && (
          <div className="relative mt-8 aspect-[16/7] w-full overflow-hidden rounded-2xl bg-tint">
            <Image src={a.cover_url} alt={a.cover_alt ?? ""} fill priority
              sizes="(max-width: 1140px) 100vw, 1100px" className="object-cover" />
          </div>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0">
            {/*
              ═══ RĂSPUNSUL SCURT, SUS ═══

              Stă înaintea articolului fiindcă exact asta caută și cititorul
              grăbit, și motoarele care răspund cu text: un pasaj care se
              înțelege singur, scos din pagină. Regula prin care se scrie e
              chiar sub câmpul din editor.
            */}
            {a.answer_summary && (
              <div className="mb-10 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">Pe scurt</p>
                <p className="mt-2 text-[16px] leading-[1.65] text-ink">{a.answer_summary}</p>
              </div>
            )}

            {/*
              ⚠ CUPRINSUL, SI PE TELEFON. Coloana din dreapta e ascunsa sub `lg`,
              deci pe telefon cuprinsul lipsea cu totul — exact unde e mai
              nevoie de el, fiindca un articol lung derulat pe un ecran mic e
              cel mai greu de strabatut. Aici e o lista stransa, deschisa de
              cititor cand vrea, ca sa nu impinga textul in jos.
            */}
            {meritaCuprins(cuprins) && (
              <details className="mb-8 rounded-xl border border-hairline bg-tint p-4 lg:hidden">
                <summary className="cursor-pointer text-[13.5px] font-semibold text-ink">
                  Cuprins
                </summary>
                <ul className="mt-3 space-y-2">
                  {cuprins.map((t) => (
                    <li key={t.id} className={t.nivel === 3 ? "pl-3" : ""}>
                      <a href={`#${t.id}`} className="block text-[13.5px] leading-[1.5] text-ink-2">
                        {t.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="policy-content blog-articol" dangerouslySetInnerHTML={{ __html: html }} />

            {/* Îndemnul potrivit CU TEXTUL, înaintea întrebărilor. Banda de
                final a site-ului rămâne jos și spune altceva. */}
            <IndemnArticol cta={a.cta} />

            {a.faq.length > 0 && (
              <section className="mt-14">
                <h2 className="text-[22px] font-semibold leading-[1.3] text-ink">Întrebări frecvente</h2>
                {/*
                  ⚠ ÎNTREBĂRILE SUNT ȘI AICI, ȘI ÎN DATELE STRUCTURATE, din
                  ACEEAȘI listă. Regula lui Google e că datele structurate
                  descriu ce vede omul; un `FAQPage` cu întrebări care nu apar
                  în pagină e conținut ascuns, și se pedepsește pe tot domeniul.
                  Legate de aceeași sursă, nu se pot despărți.
                */}
                <dl className="mt-5 divide-y divide-hairline border-t border-hairline">
                  {a.faq.map((i, k) => (
                    <div key={k} className="py-5">
                      <dt className="text-[16px] font-semibold leading-[1.4] text-ink">{i.q}</dt>
                      <dd className="mt-2 text-[15px] leading-[1.7] text-ink-2">{i.a}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {/*
              Etichetele stau după text, nu înaintea lui: sunt drumuri către alte
              articole, folositoare abia după ce omul a terminat de citit. Puse
              sus, ar fi trimis cititorul altundeva înainte să afle ce scrie aici.
            */}
            {etichete.length > 0 && (
              <nav aria-label="Etichete" className="mt-12 flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] text-ink-3">Etichete:</span>
                {etichete.map((e) => (
                  <Link
                    key={e.slug}
                    href={`/blog/eticheta/${e.slug}`}
                    className="rounded-full border border-hairline px-3 py-1 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-ink-3/40 hover:text-ink"
                  >
                    {e.name}
                  </Link>
                ))}
              </nav>
            )}

            {a.autor?.bio && (
              <aside className="mt-14 flex gap-4 rounded-2xl border border-hairline bg-tint p-5">
                {a.autor.avatar_url && (
                  <Image src={a.autor.avatar_url} alt="" width={56} height={56}
                    className="h-14 w-14 shrink-0 rounded-full object-cover" />
                )}
                <div>
                  <Link href={`/blog/autor/${a.autor.slug}`}
                    className="text-[15px] font-semibold text-ink underline-offset-4 hover:underline">
                    {a.autor.name}
                  </Link>
                  {a.autor.role_title && <p className="text-[13px] text-ink-3">{a.autor.role_title}</p>}
                  <p className="mt-2 text-[14px] leading-[1.6] text-ink-2">{a.autor.bio}</p>
                </div>
              </aside>
            )}
          </div>

          {/* Cuprinsul, lipit la derulare. Sub trei titluri nu apare deloc:
              ar ocupa mai mult loc decât economisește. */}
          {meritaCuprins(cuprins) && (
            <nav aria-label="Cuprins" className="hidden lg:block">
              <div className="sticky top-24">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Cuprins</p>
                <ul className="mt-3 space-y-2">
                  {cuprins.map((t) => (
                    <li key={t.id} className={t.nivel === 3 ? "pl-3" : ""}>
                      <a href={`#${t.id}`}
                        className="block text-[13px] leading-[1.5] text-ink-2 transition-colors hover:text-ink">
                        {t.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          )}
        </div>

        <AbonareBlog />

        {inrudite.length > 0 && (
          <section className="mt-20 border-t border-hairline pt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] font-semibold text-ink">Mai departe</h2>
              <Link href="/blog" className="text-[13.5px] font-medium text-ink-2 hover:text-ink">
                Toate articolele
              </Link>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {inrudite.map((x) => <CardArticol key={x.id} articol={x} />)}
            </div>
          </section>
        )}
      </article>

      <FinalCta />
    </>
  );
}
