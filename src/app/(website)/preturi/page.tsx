import type { Metadata } from "next";
import { PageHero } from "@/components/website/PageHero";
import { PricingSection } from "@/components/website/PricingSection";
import { Comparison } from "@/components/website/sections/Comparison";
import { BandaContact } from "@/components/website/BandaContact";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { UrmaAterizare } from "@/components/edinio-marketing/UrmaAterizare";
import { ACASA } from "@/lib/website/breadcrumbs";
import { PRICING_EYEBROW, PRICING_LEAD } from "@/lib/website/pricing";
import { siteMetadata } from "@/lib/website/metadata";
import { jsonLdSafe } from "@/lib/json-ld";
import { paginaSiteJsonLd } from "@/lib/website-jsonld";

/*
  Metadatele treceau prin obiectul scris de mana, ca la `/contact`, deci adresa
  canonica era pe `www` doar din intamplare. Acum vin din acelasi ajutor ca
  restul paginilor. Textele lor raman neatinse — sunt scrise pentru cautare.
*/
export const metadata: Metadata = siteMetadata({
  title: "Preturi creare magazin online - de la 99 lei/luna",
  description:
    "Pret creare magazin online de la 99 lei/luna. Plan gratuit 15 zile, fara card. Mentenanta gratuita pe viata, integrari curierat, plati online si facturare.",
  path: "/preturi",
});

const FIRIMITURI = [ACASA, { label: PRICING_EYEBROW }];

/*
 * Doar `WebPage` + firimituri, fara oferte.
 *
 * Ofertele cu abonament stau pe nodul `SoftwareApplication` de pe pagina
 * principala, si acolo raman: doua adrese care declara amandoua acelasi produs
 * cu aceleasi preturi ar fi doua entitati care se bat pe acelasi lucru.
 */
const jsonLd = paginaSiteJsonLd({
  /* `PageHero` de mai jos emite deja `BreadcrumbList` din sirul desenat.
     Pana pe 04.09.2026 ieseau DOUA in acelasi document. */
  faraFirimituri: true,
  cale: "preturi",
  nume: "Preturi",
  descriere: metadata.description as string,
});

export default function PreturiPage() {
  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} /> : null}
      <UrmaAterizare nume="Preturi" categorie="pricing" />

      {/*
        Capul paginii, ca la `/intrebari-frecvente` si `/contact`: firimituri,
        numele paginii, o fraza. Inainte era un `<div>` propriu, cu clasele
        vechi (`text-foreground`, `text-muted-foreground`, 4xl/5xl) si fara
        firimituri — singurul cap de pagina ramas asa dintre cele refacute.

        Titlul e chiar numele paginii, acelasi cuvant ca in firimituri si in
        meniu. Fraza e `PRICING_LEAD`, textul clientului, luat din aceeasi sursa
        ca sectiunea de preturi — deci nu se pot desparti. Nu se dubleaza cu
        nimic: antetul sectiunii e stins mai jos.
      */}
      <PageHero
        sir={FIRIMITURI}
        title={PRICING_EYEBROW}
        lead={PRICING_LEAD}
        aliniere="centru"
      />

      {/*
        Fara antet: pagina are deja titlul si fraza chiar deasupra. Cu antetul
        pornit ieseau trei blocuri de text unul sub altul — titlu de pagina,
        eticheta, titlu de sectiune — inainte de primul pret.
      */}
      <PricingSection cuAntet={false} />

      {/*
        Tabelul de comparatie, cerut aici de client.

        E chiar sectiunea de pe pagina de start, refolosita: aceleasi randuri,
        aceleasi sigle, acelasi text. Ca peste tot, o a doua copie s-ar fi
        despartit la prima corectura — iar aici textele sunt publicitate
        comparativa, unde doua variante ale aceleiasi afirmatii sunt chiar
        lucrul care nu are voie sa se intample.

        Ancora ei ramane `#comparatie`, tintita din subsol. Acum exista pe doua
        pagini, deci linkul din subsol duce in continuare pe pagina de start —
        e in regula, dar daca se schimba vreodata, aici e al doilea loc.
      */}
      <Comparison />

      {/*
        Banda cu telefon, e-mail si formular, ca pe `/intrebari-frecvente`
        (cerut). Aceeasi placa, acelasi ax, aceeasi propozitie de deasupra:
        dupa preturi si comparatie, intrebarea care ramane e „cu cine vorbesc",
        nu „cat costa".
      */}
      <section className="bg-white pb-14 lg:pb-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-6 lg:px-8">
          <p className="mx-auto max-w-[820px] text-center text-[15px] leading-[1.6] text-ink-2">
            Nu ești sigur ce plan ți se potrivește? Ne găsești oricum îți e mai ușor.
          </p>
          <BandaContact className="mx-auto mt-5 max-w-[820px]" />
        </div>
      </section>

      {/*
        Banda de final, aceeasi ca pe pagina de start.

        ⚠ Ce era aici: o sectiune verde plina (`bg-primary`), cu text alb si
        fara diacritice. Calca trei reguli spuse explicit de client — fundal alb
        peste tot, diacritice in textele de fatada, si un singur buton verde
        plin pe pagina. Era ultimul loc de pe site ramas pe fundal colorat.

        Se REFOLOSESTE `FinalCta` in loc sa se scrie alta: textul ei e al
        clientului, aprobat, si se termina tot cu inscrierea — adica exact ce
        trebuie sa urmeze dupa preturi. O varianta noua ar fi insemnat text
        inventat de mine pe o pagina comerciala.
      */}
      <FinalCta />
    </>
  );
}
