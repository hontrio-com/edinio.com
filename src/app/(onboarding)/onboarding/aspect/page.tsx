import { headers } from "next/headers";
import { UrmaPasOnboarding } from "@/components/edinio-marketing/UrmaPalnie";
import { AspectInscriere } from "@/components/onboarding/AspectInscriere";
import { temelePeScurt } from "@/lib/teme/teme-pe-scurt";

/*
 * Pasul 2: cum arata magazinul (27.09.2026; din 16.11.2026 tema si culoarea, in locul celor patru stiluri).
 *
 * Vine INAINTEA planului, anume: omul ajunge la pret dupa ce si-a ales cum arata magazinul, nu inainte. Tema se schimba
 * mai tarziu din pagina „Teme”, culoarea din editor, la „Stil”.
 *
 * Componenta de SERVER doar ca sa faca lista temelor: `TEME` (designurile si datele demo ale celor 30) ramane pe server,
 * iar clientul primeste numele, capturile si culorile (`temelePeScurt`). Gazda cererii da adresa „Vezi demo”.
 */
export default async function OnboardingAspectPage() {
  const gazda = (await headers()).get("host");
  return (
    <>
      <UrmaPasOnboarding pas="aspect" index={2} />
      <AspectInscriere teme={temelePeScurt(gazda)} />
    </>
  );
}
