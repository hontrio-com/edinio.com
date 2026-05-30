import { Inter } from "next/font/google";
import { Navbar } from "@/components/website/Navbar";
import { Footer } from "@/components/website/Footer";
import { StickyContact } from "@/components/website/StickyContact";

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
      <Navbar />
      <main>{children}</main>
      <Footer />
      <StickyContact />
    </div>
  );
}
