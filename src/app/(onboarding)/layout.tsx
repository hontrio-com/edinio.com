import "../globals.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { NotificariToast } from "@/components/ui/NotificariToast";
import { EtichetaGa4 } from "@/components/edinio-marketing/EtichetaGa4";
import { RuntimeMarketing } from "@/components/edinio-marketing/RuntimeMarketing";
import { PlatformMetaPixel } from "@/components/platform/PlatformMetaPixel";
import { PlatformTikTokPixel } from "@/components/platform/PlatformTikTokPixel";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { sesiuneCurentaNeconfirmata } from "@/lib/auth/cere-mfa";

export const metadata: Metadata = {
  title: "Configurare initiala",
};

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * Aceeasi poarta ca in layout-ul de panou, din acelasi motiv.
   *
   * Onboarding-ul era singurul grup de rute autentificate fara ea. Nu e teoretic:
   * cand citirea profilului esueaza la login, `login()` merge deliberat mai
   * departe (disponibilitate) SI trimite omul in /onboarding/details, fiindca
   * `onboarding_completed` iese nedefinit. Adica exact drumul pe care o sesiune
   * neconfirmata ajungea intr-un grup de rute fara nicio verificare.
   *
   * Pentru conturile fara MFA nu costa nimic: poarta iese pe prima intrebare.
   */
  const user = await getCachedUser();
  if (user && (await sesiuneCurentaNeconfirmata(user.id))) redirect("/login/mfa");

  return (
    <div className="min-h-screen bg-background">
      {/*
        ⚠ MASURAREA NOASTRA, nu a comerciantilor. Vezi
        `lib/edinio-marketing/` si granita probata in `lib/granita-tracking.test.ts`.
        NU se pune in `(dashboard)`, `(admin)` sau in magazine.
      */}
      <EtichetaGa4 />
      <RuntimeMarketing />
      <PlatformMetaPixel />
      <PlatformTikTokPixel />
      <header className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          <Logo size="md" eager />
        </div>
      </header>
      <main>{children}</main>
      <NotificariToast />
    </div>
  );
}
