import type { Metadata } from "next";
import { PageHero } from "@/components/website/PageHero";
import { BandaContact } from "@/components/website/BandaContact";
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
      <PageHero sir={FIRIMITURI} title={FAQ_TITLE} lead={FAQ_LEAD} aliniere="centru" />

      <section className="bg-white py-14 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
          {/*
            `h2`, nu `h3`: aici intrebarile stau direct sub `h1`-ul din
            `PageHero`. Pe pagina de start stau sub un `h2`, deci acolo sunt
            `h3`. Vezi nota din `FaqAccordion`.

            `mx-auto`: placa sta pe mijloc, cerut de client. De aceea si capul
            paginii e centrat — o placa centrata sub un titlu aliniat la stanga
            pornea cu ~130px mai la dreapta decat el, si se citea ca o scapare.
          */}
          <FaqAccordion nivelTitlu="h2" className="mx-auto" />

          {/*
            Banda cu telefon, e-mail si formular. Aceeasi latime si acelasi ax
            ca placa de deasupra: sunt o pereche, intrebarile si raspunsul „daca
            n-ai gasit, uite cum ne gasesti".

            Randul de dinainte (titlu + fraza + buton cu chenar) a fost inlocuit
            de ea, cerut de client. Propozitia de deasupra ramane fiindca fara ea
            banda apare fara motiv, imediat dupa ultima intrebare.
          */}
          <p className="mx-auto mt-12 max-w-[820px] text-center text-[15px] leading-[1.6] text-ink-2 lg:mt-14">
            Nu ai găsit răspunsul? Ne găsești oricum îți e mai ușor.
          </p>
          <BandaContact className="mx-auto mt-5 max-w-[820px]" />
        </div>
      </section>
    </>
  );
}
