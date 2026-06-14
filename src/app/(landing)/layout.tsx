import { Inter } from "next/font/google";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";
import { PlatformTikTokPixel } from "@/components/platform/PlatformTikTokPixel";

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
      <PlatformTikTokPixel />
      <main>{children}</main>
    </div>
  );
}
