import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/website/PageHero";
import { FaqAccordion } from "@/components/website/FAQSection";
import { ACASA } from "@/lib/website/breadcrumbs";
import { FAQ_LEAD, FAQ_TITLE } from "@/lib/website/faq";
import { siteMetadata } from "@/lib/website/metadata";

/*
  ⚠ Descrierea de mai jos vorbea despre „cat costa" si „ce se intampla cu
  magazinul actual" — doua intrebari care NU MAI SUNT in lista. Setul de sase a
  fost inlocuit integral cu cel de zece (2026-08-09), iar descrierea a ramas de
  la cel vechi. Acum enumera intrebari care chiar exista.

  Fara diacritice, ca restul metadatelor din depozit. Textul din PAGINA are
  diacritice; cel care pleaca in datele structurate la fel — vezi nota din
  `faq.ts`, acolo diferenta chiar conteaza pentru Google.
*/
export const metadata: Metadata = siteMetadata({
  title: "Intrebari frecvente despre Edinio",
  description:
    "Ce este Edinio, in cat timp iti lansezi magazinul, ce integrari poti conecta, ce include mentenanta gratuita si cum anulezi abonamentul.",
  path: "/intrebari-frecvente",
});

/*
  Doua trepte, nu trei: site-ul e PLAT, `/intrebari-frecvente` e adresa de nivel
  intai. „Resurse" e panoul din bara, nu o pagina — n-are adresa proprie, deci
  n-are ce cauta in firimituri. Un drum inventat ar promite o pagina care nu
  exista si ar strica si blocul trimis catre Google (vezi `verificaFirimituri`).
*/
const FIRIMITURI = [ACASA, { label: FAQ_TITLE }];

export default function IntrebariFrecventePage() {
  return (
    <>
      {/*
        Capul SCURT (`PageHero`), nu `PageShell`: omul a venit cu o intrebare,
        iar doua butoane intre el si raspuns sunt in drum. Explicatia intreaga e
        in `PageHero.tsx`.

        Titlul e chiar numele paginii, acelasi cuvant ca in meniu, in firimituri
        si in eticheta din subsol. `FAQ_TITLE`, nu scris de mana, ca sa nu se
        desparta de sectiunea de pe pagina de start.
      */}
      <PageHero sir={FIRIMITURI} title={FAQ_TITLE} lead={FAQ_LEAD} />

      <section className="bg-white py-14 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
          {/*
            `h2`, nu `h3`: aici intrebarile stau direct sub `h1`-ul din
            `PageHero`. Pe pagina de start stau sub un `h2`, deci acolo sunt
            `h3`. Vezi nota din `FaqAccordion`.

            FARA `mx-auto`, si e o corectura facuta uitandu-ma la pagina: titlul
            e la stanga, iar placa centrata in containerul de 1200 pornea cu
            ~130px mai la dreapta decat el. Doua margini din stanga in locuri
            diferite se citesc ca o scapare, nu ca o alegere.
          */}
          <FaqAccordion nivelTitlu="h2" />

          {/*
            Rândul de închidere. Un `.placa` al doilea sub primul ar fi arătat ca
            încă o listă; aici e doar text și o acțiune cu chenar — verdele plin
            rămâne al butonului din hero-ul paginii de start.
          */}
          <div className="mt-10 max-w-[820px] border-t border-hairline pt-10 lg:mt-12 lg:pt-12">
            <p className="text-[17px] font-semibold tracking-[-0.01em] text-ink sm:text-[19px]">
              Nu ai găsit răspunsul?
            </p>
            <p className="mt-2 max-w-[440px] text-[15px] leading-[1.6] text-ink-2">
              Scrie-ne și te ajutăm.
            </p>
            <Link
              href="/contact"
              className="group mt-6 inline-flex h-12 items-center justify-center gap-1.5 rounded-[8px] border border-hairline px-6 text-[15px] font-medium text-ink transition-colors duration-200 hover:bg-tint-2"
            >
              Contactează-ne
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
