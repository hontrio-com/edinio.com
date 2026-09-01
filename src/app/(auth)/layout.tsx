import "../globals.css";
import type { Metadata } from "next";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { Logo } from "@/components/ui/Logo";
import { NotificariToast } from "@/components/ui/NotificariToast";
import { EtichetaGa4 } from "@/components/edinio-marketing/EtichetaGa4";
import { RuntimeMarketing } from "@/components/edinio-marketing/RuntimeMarketing";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";
import { PlatformTikTokPixel } from "@/components/platform/PlatformTikTokPixel";

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
        NU se pune in `(dashboard)`, `(admin)` sau in magazine.
      */}
      <EtichetaGa4 />
      <RuntimeMarketing />
      <PlatformMetaPixel />
      <PlatformTikTokPixel />
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
