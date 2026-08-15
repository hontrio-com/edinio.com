import { Inter } from "next/font/google";
import { Navbar } from "@/components/website/Navbar";
import { Footer } from "@/components/website/Footer";
import { StickyContact } from "@/components/website/StickyContact";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";
import { PlatformTikTokPixel } from "@/components/platform/PlatformTikTokPixel";
import { jsonLdSafe } from "@/lib/json-ld";
import { identitateEdinioJsonLd } from "@/lib/website-jsonld";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export default function WebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={inter.className}>
      {/*
        Identitatea Edinio, o singura data, pe toate cele opt pagini de prezentare.
        Layout-ul si pagina se randeaza in acelasi document, deci referintele
        `@id` din nodurile fiecarei pagini gasesc aici nodul intreg. Vezi
        `website-jsonld.ts` — inclusiv de ce nu are ce cauta in layout-ul radacina.
      */}
      {identitateEdinioJsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(identitateEdinioJsonLd) }} />
      ) : null}
      <PlatformMetaPixel />
      <PlatformTikTokPixel />
      <Navbar />
      <main>{children}</main>
      <Footer />
      <StickyContact />
    </div>
  );
}
