import "../website.css";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/website/site-header/SiteHeader";
import { Footer } from "@/components/website/Footer";
import { StickyContact } from "@/components/website/StickyContact";
import { EtichetaGa4 } from "@/components/edinio-marketing/EtichetaGa4";
import { RuntimeMarketing } from "@/components/edinio-marketing/RuntimeMarketing";
import { EdinioMetaPixel } from "@/components/edinio-marketing/EdinioMetaPixel";
import { EdinioTikTokPixel } from "@/components/edinio-marketing/EdinioTikTokPixel";
import { jsonLdSafe } from "@/lib/json-ld";
import { identitateEdinioJsonLd } from "@/lib/website-jsonld";
import { BannerConsimtamant } from "@/components/edinio-marketing/BannerConsimtamant";
import { EtichetaGoogleAds } from "@/components/edinio-marketing/EtichetaGoogleAds";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  /*
    ⚠ NU SE PREINCARCA — masurat, si e invers decat pare.

    Cei 1.220 ms pe care PSI ii pune pe seama „blocarii redarii" NU sunt CSS-ul.
    Foile blocante sunt 20.779 octeti pe fir, adica 249 ms la incetinirea folosita
    de Lighthouse pe mobil — 20% din ei. Restul vin din ce cere `<head>`-ul
    INAINTEA lor, in ordinea documentului:

        2 preincarcari de font      77.720 octeti
        4 preincarcari de imagine   13.068
        11 scripturi async         171.757

    Foaia de stil nu e lenta, e LA COADA. Modelul „CSS plus preincarcarile din
    fata" prezice raportul mobil/desktop 5,45 fata de 5,545 masurat de PSI —
    eroare 1,7%. Ipoteza „doar CSS" da 4,46 si nu se potriveste.

    ⚠ SI NU SE PIERDE NIMIC VIZUAL. `display: swap` plus rezerva cu metrici
    potrivite pe care o genereaza `next/font` (`Inter Fallback`, `Geist Fallback`)
    fac textul sa apara imediat, la marimea buna. Fontul soseste dupa si se
    schimba fara salt. Masurat pe trei variante, acelasi build: FCP 1,2 s in
    TOATE, iar LCP si TBT in zgomotul de masurare.

    ⚠ CE SE CASTIGA: 77.720 de octeti ies din coada de dinaintea foii de stil.
    ⚠ CE NU SE CASTIGA: nimic din ce am putut masura local. Cifra de sus e o
    socoteala pe constantele lui Lighthouse, nu o masuratoare a mea.
  */
  preload: false,
});

export default function WebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * Fundal alb pe tot site-ul de prezentare.
   *
   * Bara de sus e transparenta pana la prima derulare, deci prin ea se vede
   * fundalul paginii. Fara alb aici s-ar vedea gri-ul implicit (--background),
   * iar intre bara si un hero alb ar aparea o dunga. Sectiunile care vor fundal
   * calm il cer explicit, cu `bg-tint`.
   */
  return (
    <div className={`${inter.className} bg-white`}>
      {/*
        Identitatea Edinio, o singura data, pe toate cele opt pagini de prezentare.
        Layout-ul si pagina se randeaza in acelasi document, deci referintele
        `@id` din nodurile fiecarei pagini gasesc aici nodul intreg. Vezi
        `website-jsonld.ts` — inclusiv de ce nu are ce cauta in layout-ul radacina.
      */}
      {identitateEdinioJsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(identitateEdinioJsonLd) }} />
      ) : null}
      {/*
        ⚠ MASURAREA NOASTRA, nu a comerciantilor. Vezi
        `lib/edinio-marketing/` si granita probata in `lib/granita-tracking.test.ts`.
        NU se pune NICIODATA in magazinele clientilor, si nici in `(admin)`.

        ⚠ SI NU SE PUNE IN `(dashboard)`, de pe 03.09.2026.

        Randurile astea au spus contrariul de doua ori, in doua directii, si de aia
        merita citite pana la capat.

        Intai spuneau „NU se pune in `(dashboard)`" cand se punea — din 01.06.2026,
        printr-o alegere a proprietarului, pentru retargetarea clientilor activi.
        Un audit din afara a citit nota si a raportat o incalcare de scop care nu
        era. Atunci s-a scris adevarul de atunci: „rulează si in aplicatia
        autentificata".

        Pe 03.09.2026 pixelii au fost SCOSI din panou, iar randurile care spuneau
        asta au ramas — deci au devenit false a doua oara, in cealalta directie. Le
        gasise tot o maturare din afara, nu o proba.

        ⚠ DE CE E ACUM APARATA DE O PROBA CARE NU POATE IMBATRANI. Plasa dinainte
        interzicea o formulare anume, deci apara o singura directie: cand codul s-a
        intors, ea a ajuns sa apere chiar minciuna. Acum proba CITESTE layoutul
        panoului si cere ca notele astea sa spuna ce vede acolo — vezi
        „niciun layout nu spune despre sine contrariul a ce face" din `poarta.test.ts`.

        Motivul scoaterii e scris pe larg in `(dashboard)/layout.tsx` si in
        `fara-urmarire.ts`.
      */}
      <EtichetaGa4 />
      <RuntimeMarketing />
      <EdinioMetaPixel />
      <EdinioTikTokPixel />
      <EtichetaGoogleAds />
      <BannerConsimtamant />
      <SiteHeader />
      <main>{children}</main>
      <Footer />
      <StickyContact />
    </div>
  );
}
