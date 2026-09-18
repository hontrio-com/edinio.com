"use client";

import { useEffect, useState } from "react";
import { CONSENT_EVENT, readConsent, areAcordPentru, type ConsentCategory } from "@/lib/cookie-consent";

/**
 * Renders its children (a tracking script) only once the visitor has granted
 * consent for the given category. Subscribes to consent changes so toggling
 * preferences in the banner starts/keeps tracking without a page reload.
 *
 * Note: scripts already injected can't be "unloaded" within the same page; a
 * later revoke takes effect on the next navigation. We never inject before grant.
 *
 * `bypass` short-circuits the gate: when the merchant disabled the cookie
 * banner there is no consent flow, so trackers load unconditionally (the
 * merchant owns the GDPR responsibility — see Settings → Banner Cookies).
 */
/*
 * ⚠ `category` poate fi si o LISTA (18.09.2026), si atunci ajunge ORICARE dintre ele. Tagul Google statea
 * numai sub „analiza”, desi poarta si conversiile Google Ads: cine accepta marketingul dar refuza analiza
 * nu trimitea nicio conversie. Semnalele de consimtamant (consent mode) le desparte apoi tagul insusi.
 */
export function ConsentGate({ slug, category, bypass = false, children }: {
  slug: string;
  category: ConsentCategory | ConsentCategory[];
  bypass?: boolean;
  children: React.ReactNode;
}) {
  const [granted, setGranted] = useState(false);
  const categorii = Array.isArray(category) ? category : [category];
  const cheie = categorii.join(",");

  useEffect(() => {
    if (bypass) return;
    const evaluate = () => {
      const consent = readConsent(slug);
      if (areAcordPentru(consent, cheie.split(",") as ConsentCategory[])) setGranted(true);
    };
    evaluate();
    window.addEventListener(CONSENT_EVENT, evaluate);
    return () => window.removeEventListener(CONSENT_EVENT, evaluate);
  }, [slug, cheie, bypass]);

  if (bypass) return <>{children}</>;
  return granted ? <>{children}</> : null;
}
