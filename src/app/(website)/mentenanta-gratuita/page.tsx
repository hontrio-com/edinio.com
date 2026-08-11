import type { Metadata } from "next";
import { HeroPagina } from "@/components/website/sections/Hero";
import { SectiuneCeInclude } from "@/components/website/sections/mentenanta/SectiuneCeInclude";
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
export default function MentenantaPage() {
  return (
    <>
      <HeroPagina
        title="Tu te ocupi de afacere. Noi ne ocupăm de partea tehnică."
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
    </>
  );
}
