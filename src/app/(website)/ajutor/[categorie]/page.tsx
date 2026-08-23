import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { BandaAjutor } from "@/components/website/ajutor/BandaAjutor";
import { PageHero } from "@/components/website/PageHero";
import { CATEGORII_AJUTOR } from "@/lib/website/ajutor";
import {
  adresaCategorie,
  adresaGhid,
  RADACINA,
} from "@/lib/website/ajutor-cautare";
import { ACASA } from "@/lib/website/breadcrumbs";
import { siteMetadata } from "@/lib/website/metadata";

interface Props {
  params: Promise<{ categorie: string }>;
}

/*
  Toate categoriile se cunosc la construire, deci paginile ies statice. Nu e o
  optimizare de dragul ei: un centru de ajutor e citit de oameni care au deja o
  problemă, iar o pagină care se randează la cerere se deschide mai încet exact
  în clipa în care răbdarea e cea mai scurtă.
*/
export function generateStaticParams() {
  return CATEGORII_AJUTOR.map((c) => ({ categorie: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorie } = await params;
  const c = CATEGORII_AJUTOR.find((x) => x.slug === categorie);
  if (!c) return {};
  return siteMetadata({
    title: `${c.titlu} - Centru de ajutor Edinio`,
    description: c.descriere,
    path: adresaCategorie(c.slug),
  });
}

/**
 * Lista ghidurilor dintr-o categorie a centrului de ajutor.
 *
 * Pagina cea mai simplă din cele trei, dinadins: e un popas între cardul de
 * categorie și ghid, iar tot ce trebuie să facă e să arate ce e înăuntru, cu
 * rezumatul fiecăruia. Orice ar mai fi pus aici ar sta între om și răspuns.
 *
 * ⚠ Rezumatele se văd în listă, nu doar titlurile. Un rând de titluri cere să fie
 * deschise pe rând ca să afli care e al tău; cu rezumatul dedesubt, alegerea se
 * face din pagina asta.
 */
export default async function CategorieAjutorPage({ params }: Props) {
  const { categorie } = await params;
  const c = CATEGORII_AJUTOR.find((x) => x.slug === categorie);
  if (!c) notFound();

  return (
    <>
      <PageHero
        sir={[
          ACASA,
          { label: "Centru de ajutor", href: RADACINA },
          { label: c.titlu },
        ]}
        title={c.titlu}
        lead={c.descriere}
      />

      <section className="bg-white">
        {/* Același container ca `PageHero`, cu lista limitată înăuntrul lui, la
            stânga. Vezi nota din pagina ghidului: centrată, lista pornea din alt
            loc decât titlul de deasupra. */}
        <div className="mx-auto max-w-[1200px] px-5 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-[860px]">
            {/*
              ⚠ PE GRUPURI, NU O LISTĂ LUNGĂ. Categoriile au între nouă și
              nouăzeci și șase de ghiduri; nouăzeci de rânduri unul sub altul nu
              se citesc, se derulează. Grupurile taie categoria pe zonele
              panoului, adică fix după cum caută omul: cine are o problemă cu
              retururile nu vrea să treacă peste tot ce ține de comenzi.

              Titlul de grup se ascunde când categoria are unul singur: acolo n-ar
              despărți nimic de nimic, ar fi doar un rând în plus.
            */}
            {c.grupuri.map((gr) => (
              <section key={gr.titlu} className="mb-12 last:mb-0">
                {c.grupuri.length > 1 ? (
                  <h2 className="mb-4 text-[17px] font-bold tracking-[-0.01em] text-ink">
                    {gr.titlu}
                  </h2>
                ) : null}

                <ul role="list" className="grid gap-3">
                  {gr.ghiduri.map((g) => (
                    <li key={g.slug}>
                      <Link
                        href={adresaGhid(c.slug, g.slug)}
                        className="group flex items-start gap-4 rounded-[12px] border border-hairline bg-white px-5 py-4 transition-colors duration-200 hover:bg-tint"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[16.5px] font-semibold tracking-[-0.01em] text-ink">
                            {g.titlu}
                          </span>
                          <span className="mt-1 block text-[14.5px] leading-[1.55] text-ink-2">
                            {g.rezumat}
                          </span>
                        </span>
                        <ArrowRight
                          aria-hidden="true"
                          className="mt-1 h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <Link
              href={RADACINA}
              className="mt-10 inline-flex items-center gap-1.5 text-[14.5px] font-medium text-ink-2 transition-opacity hover:opacity-70"
            >
              Toate categoriile
            </Link>
          </div>
        </div>
      </section>

      <BandaAjutor />
    </>
  );
}
