import { Inter } from "next/font/google";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={inter.className}>
      <PlatformMetaPixel />
      <main>{children}</main>
    </div>
  );
}
