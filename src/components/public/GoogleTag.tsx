"use client";

import { useEffect } from "react";
import { readConsent } from "@/lib/cookie-consent";
import { corpEticheteiGoogle } from "@/lib/eticheta-google/corp";
import { leagaEtichetaGoogle, type FereastraEtichetei } from "@/lib/eticheta-google/legatura";

/**
 * Jumatatea din BROWSER a etichetei Google a magazinului (Google Ads `AW-…`, GA4 `G-…`).
 *
 * ⚠⚠ SCRIPTUL ETICHETEI E SCRIS DE SERVER in pagina (layoutul vitrinei), ca sa ruleze la citirea ei. Cand
 * porneste si ce are voie sa trimita inainte de acord hotaraste `lib/eticheta-google/corp.ts`; citeste-i
 * antetul. Pe scurt: eticheta de reclame poate porni cu toate semnalele refuzate, ca Google Ads sa o gaseasca
 * pe site; Analytics si evenimentele asteapta acordul, ca inainte.
 *
 * Aici raman doua lucruri pe care serverul nu le poate face, amandoua in `lib/eticheta-google/legatura.ts`
 * (o functie simpla, ca sa poata fi rulata in probe):
 *   1. raspunsul din banner (si retragerea lui) ajunge la eticheta pe loc;
 *   2. eticheta se porneste de aici, cu ACELASI script, cand n-a pornit din pagina (omul tocmai a acceptat,
 *      iar pana atunci nu avea voie sa porneasca).
 *
 * ⚠ Sta sub `DoarInMagazinReal` si `DoarInAfaraContului niciDupaIesire`; scriptul isi mai verifica o data,
 * singur, cele doua reguli, din adresa.
 */
export function GoogleTag({ tagIds, slug, requireConsent = true, adsId, adsInainteDeAcord }: {
  tagIds: string[];
  slug?: string;
  requireConsent?: boolean;
  /** ID-ul de conversie Google Ads (`AW-…`): eticheta de reclame si remarketingul dinamic din `gtagEvent`. */
  adsId?: string | null;
  /** Optiunea comerciantului: eticheta de reclame porneste si fara raspuns la banner, cu semnalele refuzate. */
  adsInainteDeAcord?: boolean;
}) {
  const script = corpEticheteiGoogle({ tagIds, slug, cuBanner: requireConsent, adsId, adsInainteDeAcord })?.script ?? null;
  const safeSlug = (slug ?? "").replace(/[^a-zA-Z0-9-]/g, "");

  useEffect(() => {
    if (!script) return;
    return leagaEtichetaGoogle({
      fereastra: window as unknown as FereastraEtichetei,
      script,
      slug: safeSlug,
      cuBanner: requireConsent,
      citesteAcord: readConsent,
    });
  }, [script, safeSlug, requireConsent]);

  return null;
}
