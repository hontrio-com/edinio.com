import "../website.css";
import { Inter } from "next/font/google";
import { SiteHeader } from "@/components/website/site-header/SiteHeader";
import { Footer } from "@/components/website/Footer";
import { StickyContact } from "@/components/website/StickyContact";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";
import { PlatformTikTokPixel } from "@/components/platform/PlatformTikTokPixel";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
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
      <PlatformMetaPixel />
      <PlatformTikTokPixel />

      <SiteHeader />

      <main>{children}</main>
      <Footer />
      <StickyContact />
    </div>
  );
}
