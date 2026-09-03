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

        ⚠ SI NU SE PUNE IN `(dashboard)`, de pe 03.09.2026.

        Randurile astea au spus contrariul de doua ori, in doua directii, si de aia
        merita citite pana la capat.

        Intai spuneau „NU se pune in `(dashboard)`" cand se punea — din 01.06.2026,
        printr-o alegere a proprietarului, pentru retargetarea clientilor activi.
        Un audit din afara a citit nota si a raportat o incalcare de scop care nu
        era. Atunci s-a scris adevarul de atunci: „rulează si in aplicatia
        autentificata".

        Pe 03.09.2026 pixelii au fost SCOSI din panou, iar randurile care spuneau
        asta au ramas — deci au devenit false a doua oara, in cealalta directie. Le
        gasise tot o maturare din afara, nu o proba.

        ⚠ DE CE E ACUM APARATA DE O PROBA CARE NU POATE IMBATRANI. Plasa dinainte
        interzicea o formulare anume, deci apara o singura directie: cand codul s-a
        intors, ea a ajuns sa apere chiar minciuna. Acum proba CITESTE layoutul
        panoului si cere ca notele astea sa spuna ce vede acolo — vezi
        „niciun layout nu spune despre sine contrariul a ce face" din `poarta.test.ts`.

        Motivul scoaterii e scris pe larg in `(dashboard)/layout.tsx` si in
        `fara-urmarire.ts`.
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
