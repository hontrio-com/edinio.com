import { Inter } from "next/font/google";
import { Navbar } from "@/components/website/Navbar";
import { Footer } from "@/components/website/Footer";
import { StickyContact } from "@/components/website/StickyContact";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";
import { PlatformTikTokPixel } from "@/components/platform/PlatformTikTokPixel";

// Validarea „instant" e amanata pentru aceasta ruta: `cacheComponents` a fost
// activat pe tot proiectul deodata, iar rutele se convertesc pe rand. Cand
// ruta e pregatita (date cachuite cu `use cache` sau invelite in `Suspense`),
// linia de mai jos se sterge si ruta incepe sa se prerandeze.
export const instant = false;

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
      <PlatformMetaPixel />
      <PlatformTikTokPixel />
      <Navbar />
      <main>{children}</main>
      <Footer />
      <StickyContact />
    </div>
  );
}
