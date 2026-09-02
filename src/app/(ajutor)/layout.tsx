import "../website.css";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/website/site-header/SiteHeader";
import { Footer } from "@/components/website/Footer";
import { StickyContact } from "@/components/website/StickyContact";
import { EtichetaGa4 } from "@/components/edinio-marketing/EtichetaGa4";
import { RuntimeMarketing } from "@/components/edinio-marketing/RuntimeMarketing";
import { EdinioMetaPixel } from "@/components/edinio-marketing/EdinioMetaPixel";
import { EdinioTikTokPixel } from "@/components/edinio-marketing/EdinioTikTokPixel";
import { BannerConsimtamant } from "@/components/edinio-marketing/BannerConsimtamant";

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

/**
 * Învelișul centrului de ajutor.
 *
 * ═══ BARA E CEA A SITE-ULUI, DIN 31.08.2026 ═══
 *
 * ⚠ AICI A FOST O BARĂ SCRISĂ ANUME, ȘI S-A SCOS. Merită spus de ce a existat și
 * de ce nu mai are rost, altfel cineva o reface.
 *
 * A fost cerută pe 30.08 — „în centrul de ajutor nu se pune bara site-ului, ci
 * doar trei butoane" — iar motivul din spate era mutarea pe `ajutor.edinio.com`:
 * pe un subdomeniu, meniul care duce la `/preturi` și `/integrari` n-ar mai fi
 * avut unde să ducă.
 *
 * Mutarea s-a ANULAT pe 31.08 (vezi `lib/website/ajutor.ts`). Odată cu ea a
 * căzut și motivul barei proprii — iar cusurul ei a rămas: cele trei butoane nu
 * încăpeau pe telefon. Clientul a cerut bara obișnuită, care are meniu de
 * telefon adevărat.
 *
 * ⚠ CE SE PIERDE, ca să fie o alegere, nu o scăpare: bara proprie era componentă
 * de SERVER și nu trimitea niciun JavaScript. `SiteHeader` e de client — meniuri
 * mari, stare de derulare, meniu de telefon. Pe un centru de ajutor deschis de pe
 * telefon, de către un om care are deja o problemă, asta se simte. S-a plătit
 * pentru ceva care se vede: o bară care încape.
 *
 * ═══ GRUPUL DE RUTE `(ajutor)` RĂMÂNE ═══
 *
 * Nu mai e nevoie de el ca să scoatem bara părintelui, dar nici nu strică: ține
 * centrul cu învelișul lui, iar adresele nu depind de el — grupurile de rute nu
 * apar în URL. Paginile rămân la `/ajutor`, `/ajutor/<categorie>` și
 * `/ajutor/<categorie>/<ghid>`.
 */
export default function AjutorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.className} bg-white`}>
      {/*
        ⚠ MASURAREA NOASTRA, nu a comerciantilor. Vezi
        `lib/edinio-marketing/` si granita probata in `lib/granita-tracking.test.ts`.
        NU se pune in `(dashboard)`, `(admin)` sau in magazine.
      */}
      <EtichetaGa4 />
      <RuntimeMarketing />
      <EdinioMetaPixel />
      <EdinioTikTokPixel />

      <BannerConsimtamant />
      <SiteHeader />

      <main>{children}</main>
      <Footer />
      <StickyContact />
    </div>
  );
}
