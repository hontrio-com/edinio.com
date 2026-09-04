import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { BandaAjutor } from "@/components/website/ajutor/BandaAjutor";
import { CapturaGhid } from "@/components/website/ajutor/CapturaGhid";
import { PageHero } from "@/components/website/PageHero";
import {
  capturaPasului,
  CATEGORII_AJUTOR,
  ghidurileCategoriei,
  textulPasului,
} from "@/lib/website/ajutor";
import {
  adresaCategorie,
  adresaGhid,
  RADACINA,
} from "@/lib/website/ajutor-cautare";
import { ACASA } from "@/lib/website/breadcrumbs";
import { siteMetadata } from "@/lib/website/metadata";
import { ghidJsonLd } from "@/lib/website/ajutor-jsonld";
import { jsonLdSafe } from "@/lib/json-ld";

interface Props {
  params: Promise<{ categorie: string; ghid: string }>;
}

function gaseste(categorieSlug: string, ghidSlug: string) {
  const c = CATEGORII_AJUTOR.find((x) => x.slug === categorieSlug);
  if (!c) return null;
  /* Grupul se caută odată cu ghidul: se scrie în firimituri și dă titlul listei
     de la sfârșit, „Tot din ...”. Fără el, un ghid dintr-o categorie de nouăzeci
     ar fi trimis la toate celelalte optzeci și nouă. */
  for (const gr of c.grupuri) {
    const g = gr.ghiduri.find((x) => x.slug === ghidSlug);
    if (g) return { c, gr, g };
  }
  return null;
}

export function generateStaticParams() {
  return CATEGORII_AJUTOR.flatMap((c) =>
    ghidurileCategoriei(c).map((g) => ({ categorie: c.slug, ghid: g.slug })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorie, ghid } = await params;
  const gasit = gaseste(categorie, ghid);
  if (!gasit) return {};
  return siteMetadata({
    title: `${gasit.g.titlu} - Centru de ajutor Edinio`,
    description: gasit.g.rezumat,
    path: adresaGhid(gasit.c.slug, gasit.g.slug),
  });
}

/**
 * Un ghid din centrul de ajutor.
 *
 * ═══ PAȘII SUNT O LISTĂ NUMEROTATĂ ADEVĂRATĂ ═══
 *
 * `<ol>`, nu `<div>`-uri cu cifre desenate. Numerotarea e chiar înțelesul —
 * ordinea contează, iar cititoarele de ecran anunță „pasul 3 din 6”, ceea ce
 * într-un ghid e jumătate din orientare. Cifrele desenate de mână arată la fel și
 * nu spun nimic.
 *
 * ⚠ COLOANĂ ÎNGUSTĂ, 720px. Un ghid se citește, nu se scanează: peste ~75 de
 * semne pe rând, ochiul pierde începutul rândului următor. E aceeași lățime ca la
 * paginile legale, din același motiv.
 *
 * ⚠ SE TERMINĂ CU CELELALTE GHIDURI DIN CATEGORIE, nu cu un buton de înscriere.
 * Cine a citit „cum conectezi un curier” are, de obicei, și a doua întrebare din
 * aceeași zonă. Dedesubt vine banda de contact, pentru cazul în care ghidul n-a
 * fost de ajuns.
 */
export default async function GhidPage({ params }: Props) {
  const { categorie, ghid } = await params;
  const gasit = gaseste(categorie, ghid);
  if (!gasit) notFound();
  const { c, gr, g } = gasit;

  /* Doar din GRUPUL lui, nu din toată categoria. */
  const restul = gr.ghiduri.filter((x) => x.slug !== g.slug);

  return (
    <>
      {/* Nodul ARTICOLULUI. Firimiturile vin din `PageHero`, imediat dedesubt —
          aici NU se emit a doua oara. Vezi `ajutor-jsonld.ts`. */}
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(ghidJsonLd({ ...g, categorie: { slug: c.slug, titlu: c.titlu }, grup: gr.titlu })) }} />
      <PageHero
        sir={[
          ACASA,
          { label: "Centru de ajutor", href: RADACINA },
          { label: c.titlu, href: adresaCategorie(c.slug) },
          { label: g.titlu },
        ]}
        title={g.titlu}
        lead={g.rezumat}
      />

      <section className="bg-white">
        {/*
            ⚠ ACELAȘI CONTAINER CA `PageHero`: 1200px cu aceleași margini
            laterale, iar coloana de text limitată ÎNĂUNTRUL lui, la stânga.

            Prima formă avea `mx-auto max-w-[720px]` direct pe container, deci
            textul se centra pe ecran în timp ce titlul din cap rămânea la stânga:
            măsurat în pagină, 196px diferență între începutul titlului și
            începutul primului pas. E chiar defectul descris în nota lui
            `PageHero` — un cap și un conținut care pornesc din locuri diferite se
            citesc ca o scăpare, fiindcă asta și sunt.
          */}
        <div className="mx-auto max-w-[1200px] px-5 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-[720px]">
            {/* Lămurirea de dinaintea pașilor, când există. Vezi `Ghid.intro`
                pentru ce are voie să stea aici și ce nu. */}
            {g.intro ? (
              <p className="mb-8 text-[16.5px] leading-[1.65] text-ink-2">{g.intro}</p>
            ) : null}

            <ol role="list" className="grid gap-5">
              {g.pasi.map((pas, i) => {
                const text = textulPasului(pas);
                const captura = capturaPasului(pas);
                return (
                  <li key={text} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint-2 text-[14px] font-semibold text-ink"
                    >
                      {i + 1}
                    </span>
                    {/* `min-w-0` ca o captură lată să nu împingă coloana în afara
                        cutiei: fără el, imaginea impune lățimea rândului. */}
                    <div className="min-w-0 flex-1">
                      <p className="pt-1 text-[16px] leading-[1.65] text-ink-2">{text}</p>
                      {captura ? <CapturaGhid captura={captura} /> : null}
                    </div>
                  </li>
                );
              })}
            </ol>

            {/*
              Amănuntul, sub pași. Fiecare secțiune are titlu propriu, ca omul
              care caută un singur lucru (ce înseamnă un câmp, ce se întâmplă
              într-un caz aparte) să sară direct la el, fără să recitească ghidul.

              `<h2>`, nu text îngroșat: sunt titluri adevărate în pagină, deci
              intră în cuprinsul citit de cititoarele de ecran.
            */}
            {g.detalii?.length ? (
              <div className="mt-12 grid gap-8">
                {g.detalii.map((d) => (
                  <section key={d.titlu}>
                    <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink">
                      {d.titlu}
                    </h2>
                    <p className="mt-2 text-[16px] leading-[1.65] text-ink-2">{d.text}</p>
                  </section>
                ))}
              </div>
            ) : null}

            {g.nota ? (
              /*
              ⚠ NU E O CASETĂ DE SFAT. Regula 15 dată de client oprește casetele
              de tip „Pro Tip” și atenționările, iar regula 22 cere ca o limitare
              să fie spusă direct. Deci nota e un paragraf obișnuit, despărțit de
              pași printr-o linie de un fir, fără iconiță și fără tentă colorată.

              Prima formă avea chenar, fundal și un semn de informare. Arăta ca un
              „sfat”, adică exact ca lucrul pe care ochiul îl sare, când de fapt
              acolo scrie de ce nu merge: un plan care nu include funcția, un cont
              care trebuie deschis în altă parte.
            */
              <p className="mt-10 border-t border-hairline pt-6 text-[15px] leading-[1.65] text-ink-2">
                {g.nota}
              </p>
            ) : null}

            {restul.length > 0 ? (
              <div className="mt-14 border-t border-hairline pt-8">
                <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink">
                  Tot din „{gr.titlu}”
                </h2>
                <ul role="list" className="mt-4 grid gap-2">
                  {restul.map((alt) => (
                    <li key={alt.slug}>
                      <Link
                        href={adresaGhid(c.slug, alt.slug)}
                        className="group flex items-center gap-2 text-[15px] text-ink-2 transition-colors hover:text-ink"
                      >
                        <ArrowRight
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5"
                        />
                        {alt.titlu}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <BandaAjutor />
    </>
  );
}
