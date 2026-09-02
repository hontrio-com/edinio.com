import "../globals.css";
import type { Metadata } from "next";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { Logo } from "@/components/ui/Logo";
import { NotificariToast } from "@/components/ui/NotificariToast";
import { EtichetaGa4 } from "@/components/edinio-marketing/EtichetaGa4";
import { RuntimeMarketing } from "@/components/edinio-marketing/RuntimeMarketing";
import { EdinioMetaPixel } from "@/components/edinio-marketing/EdinioMetaPixel";
import { EdinioTikTokPixel } from "@/components/edinio-marketing/EdinioTikTokPixel";
import { BannerConsimtamant } from "@/components/edinio-marketing/BannerConsimtamant";
import { EtichetaGoogleAds } from "@/components/edinio-marketing/EtichetaGoogleAds";

export const metadata: Metadata = {
  title: "Autentificare",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuroraBackground>
      {/*
        ⚠ MASURAREA NOASTRA, nu a comerciantilor. Vezi
        `lib/edinio-marketing/` si granita probata in `lib/granita-tracking.test.ts`.
        NU se pune NICIODATA in magazinele clientilor, si nici in `(admin)`.

        ⚠ CE SCRIA AICI SI ERA FALS: „NU se pune in `(dashboard)`". Se pune, din
        01.06.2026, si e o alegere a proprietarului — pixelii Meta si TikTok
        ruleaza si in aplicatia autentificata, pentru retargetarea clientilor
        activi. Vezi motivul scris in `fara-urmarire.ts`.

        Un comentariu care descrie contrariul codului nu e o scapare de stil: cine
        il citeste peste sase luni ia hotarari pe el.
      */}
      <EtichetaGa4 />
      <RuntimeMarketing />
      <EdinioMetaPixel />
      <EdinioTikTokPixel />
      <EtichetaGoogleAds />
      <BannerConsimtamant />
      <div className="w-full max-w-md px-4 py-8">
        <div className="mb-6 sm:mb-8 flex justify-center">
          <Logo size="lg" iconSize={64} showText={false} eager />
        </div>
        <div className="bg-white rounded-xl border border-border p-6 sm:p-8 shadow-md">
          {children}
        </div>
      </div>
      <NotificariToast />
    </AuroraBackground>
  );
}
