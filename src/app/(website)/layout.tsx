import { Inter } from "next/font/google";
import { Navbar } from "@/components/website/Navbar";
import { Footer } from "@/components/website/Footer";
import { StickyContact } from "@/components/website/StickyContact";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";

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
      <Navbar />
      <main>{children}</main>
      <Footer />
      <StickyContact />
    </div>
  );
}
