"use client";

import { useEffect, useState } from "react";
import { CONSENT_EVENT, readConsent, type ConsentCategory } from "@/lib/cookie-consent";

/**
 * Renders its children (a tracking script) only once the visitor has granted
 * consent for the given category. Subscribes to consent changes so toggling
 * preferences in the banner starts/keeps tracking without a page reload.
 *
 * Note: scripts already injected can't be "unloaded" within the same page; a
 * later revoke takes effect on the next navigation. We never inject before grant.
 */
export function ConsentGate({ slug, category, children }: {
  slug: string;
  category: ConsentCategory;
  children: React.ReactNode;
}) {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const evaluate = () => {
      const consent = readConsent(slug);
      if (consent?.[category]) setGranted(true);
    };
    evaluate();
    window.addEventListener(CONSENT_EVENT, evaluate);
    return () => window.removeEventListener(CONSENT_EVENT, evaluate);
  }, [slug, category]);

  return granted ? <>{children}</> : null;
}
