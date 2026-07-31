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
      <PlatformMetaPixel />
      <PlatformTikTokPixel />
      <SiteHeader />
      <main>{children}</main>
      <Footer />
      <StickyContact />
    </div>
  );
}
