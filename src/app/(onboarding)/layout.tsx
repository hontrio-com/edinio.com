import "../globals.css";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { NotificariToast } from "@/components/ui/NotificariToast";
import { EtichetaGa4 } from "@/components/edinio-marketing/EtichetaGa4";
import { UrmaContNou } from "@/components/edinio-marketing/UrmaPalnie";
import { RuntimeMarketing } from "@/components/edinio-marketing/RuntimeMarketing";
import { EdinioMetaPixel } from "@/components/edinio-marketing/EdinioMetaPixel";
import { EdinioTikTokPixel } from "@/components/edinio-marketing/EdinioTikTokPixel";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { sesiuneCurentaNeconfirmata } from "@/lib/auth/cere-mfa";
import { BannerConsimtamant } from "@/components/edinio-marketing/BannerConsimtamant";
import { EtichetaGoogleAds } from "@/components/edinio-marketing/EtichetaGoogleAds";

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
      {/*
        ⚠ Contul nou se masoara AICI, nu in pagina de inregistrare: actiunea
        `register` se incheie cu `redirect`, deci nu se intoarce niciodata la
        client pe calea de succes. Semnalul vine printr-un jeton scris de server.
        Vezi `UrmaContNou`.
      */}
      <UrmaContNou />
      <RuntimeMarketing />
      <EdinioMetaPixel />
      <EdinioTikTokPixel />
      <EtichetaGoogleAds />
      <BannerConsimtamant />
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
