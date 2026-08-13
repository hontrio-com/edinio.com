import type { Metadata } from "next";
import { FAQSection } from "@/components/website/FAQSection";
import { FinalCta } from "@/components/website/sections/FinalCta";
import { HeroPagina } from "@/components/website/sections/Hero";
import { SectiuneCeInclude } from "@/components/website/sections/mentenanta/SectiuneCeInclude";
import { TitluMentenanta } from "@/components/website/sections/mentenanta/TitluMentenanta";
import { intrebariStructurate } from "@/lib/website/faq";
import { MENTENANTA_FAQ, MENTENANTA_FAQ_LEAD } from "@/lib/website/mentenanta";
import { siteMetadata } from "@/lib/website/metadata";

export const metadata: Metadata = siteMetadata({
  title: "Mentenanta gratuita pe viata, la orice abonament",
  description: "Actualizari, securitate, copii de siguranta si disponibilitate, incluse in orice abonament Edinio. Suport 7 zile din 7, fara costuri separate.",
  path: "/mentenanta-gratuita",
});

/**
 * Pagina „Mentenanță gratuită".
 *
 * ═══ AICI NU SE PUN FIRIMITURI ═══
 *
 * Cerut explicit, si e o alegere de rol, nu de gust. `/intrebari-frecvente`,
 * `/contact` si `/preturi` sunt pagini in care ajungi CAUTAND ceva anume, deci
 * capul lor scurt cu firimituri iti spune unde esti si te lasa sa cobori la
 * continut. Asta e o pagina care CONVINGE: primul ecran trebuie sa fie
 * afirmatia, nu o dara de navigare deasupra ei.
 *
 * De aceea foloseste `HeroPagina` — chiar cadrul hero-ului de pe pagina de
 * start, nu o copie a lui. Vezi nota din `sections/Hero.tsx`.
 *
 * ⚠ NETERMINATA. Are hero-ul si „Ce include"; restul sectiunilor vin separat, la
 * cererea clientului. Ce e pana acum e final, nu coaja.
 */
/*
  Datele structurate `FAQPage`, construite CHIAR DIN LISTA RANDATĂ.

  ⚠ Nu se scriu de mână. Pagina de start a avut o dată întrebările copiate în
  două locuri, iar la prima corectură Google a rămas cu întrebări care nu mai
  existau pe pagină — regulile lui cer explicit ca datele structurate să
  corespundă conținutului vizibil. De atunci se construiesc din listă.
*/
const jsonLd = {
  "@context": "https://schema.org",
  ...intrebariStructurate(MENTENANTA_FAQ),
};

export default function MentenantaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <HeroPagina
        /*
          Titlul e o piesă, nu un șir: „tehnică" stă între paranteze drepte,
          cerute de client (13.08). Textul e același, doar așezat altfel — vezi
          `TitluMentenanta`, unde scrie și de ce parantezele nu par paranteze.
        */
        title={<TitluMentenanta />}
        /*
          ⚠ Mai lat decât cei 900px din oficiu, și e o măsurătoare, nu un gust:
          propoziția a doua — „Noi ne ocupăm de partea <tehnică/>." — are 1087px
          la corpul de 66, iar clientul a cerut (13.08) să stea întreagă pe un
          rând. La 900 se rupea, iar semnele rămâneau singure pe al treilea rând.

          1120 lasă și o rezervă mică. Mai mult n-are rost: cadrul hero-ului e de
          1200px cu spațiere, deci pe la 1136 se termină oricum locul.
        */
        latimeTitlu="max-w-[1120px]"
        lead="Actualizări, securitate, optimizări și probleme tehnice. Mentenanța magazinului tău este inclusă în Edinio, fără costuri suplimentare."
        /*
          Textul butonului e al clientului, cu diacriticele puse: el l-a scris
          „Testeaza", dar regula site-ului e diacritice peste tot in textele de
          fatada, iar aici ar fi stat sub un titlu care le are. Aceleasi cuvinte,
          nu alta formulare.
        */
        cta={{ label: "Testează gratuit 15 zile", href: "/register" }}
      />

      <SectiuneCeInclude />

      {/*
        Întrebările paginii — ALTELE decât cele de pe pagina de start. Aceeași
        componentă, altă listă: vezi nota de la `FAQSection`.

        ⚠ Titlul rămâne cel obișnuit, dar rândul de sub el e al paginii ăsteia:
        cel de pe start promite răspunsuri „despre Edinio", iar aici sunt doar
        despre mentenanță.
      */}
      <FAQSection intrebari={MENTENANTA_FAQ} lead={MENTENANTA_FAQ_LEAD} />

      {/* Aceeași bandă de final ca pe pagina de start și pe „Integrări". */}
      <FinalCta />
    </>
  );
}
