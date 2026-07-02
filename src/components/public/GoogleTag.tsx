"use client";

import Script from "next/script";
import { useEffect } from "react";
import { CONSENT_EVENT, CONSENT_VERSION, readConsent } from "@/lib/cookie-consent";

/**
 * Loads gtag.js and configures one or more Google tags (Google Ads AW-…,
 * GA4 G-…) with Consent Mode v2 signals.
 *
 * Rendered behind ConsentGate (category "analytics"), so by the time it mounts
 * the visitor HAS consented to analytics ("basic" consent mode: nothing loads
 * before consent). We still declare the four consent signals so Google models
 * correctly: ad signals follow the visitor's "marketing" choice, and later
 * changes from the cookie banner are pushed via `consent update`.
 */
export function GoogleTag({ tagIds, slug }: { tagIds: string[]; slug?: string }) {
  // Defense-in-depth: these values end up inside an inline script.
  const ids = [...new Set(tagIds.map((t) => (t ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "")).filter(Boolean))];
  const safeSlug = (slug ?? "").replace(/[^a-zA-Z0-9-]/g, "");

  // Push consent changes (from the cookie banner) into Google tags live.
  useEffect(() => {
    if (!safeSlug) return;
    const update = () => {
      const consent = readConsent(safeSlug);
      const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
      if (!consent || typeof gtag !== "function") return;
      gtag("consent", "update", {
        analytics_storage: consent.analytics ? "granted" : "denied",
        ad_storage: consent.marketing ? "granted" : "denied",
        ad_user_data: consent.marketing ? "granted" : "denied",
        ad_personalization: consent.marketing ? "granted" : "denied",
      });
    };
    window.addEventListener(CONSENT_EVENT, update);
    return () => window.removeEventListener(CONSENT_EVENT, update);
  }, [safeSlug]);

  if (ids.length === 0) return null;

  // Consent defaults read from the stored banner choice. This component only
  // mounts after analytics consent, so analytics_storage defaults to granted.
  const consentDefault = safeSlug
    ? `
        var adGranted = false;
        try {
          var c = JSON.parse(localStorage.getItem('edinio_cc_${safeSlug}') || 'null');
          adGranted = !!(c && c.v === ${CONSENT_VERSION} && c.marketing);
        } catch (e) {}
        gtag('consent', 'default', {
          analytics_storage: 'granted',
          ad_storage: adGranted ? 'granted' : 'denied',
          ad_user_data: adGranted ? 'granted' : 'denied',
          ad_personalization: adGranted ? 'granted' : 'denied'
        });`
    : "";

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${ids[0]}`}
        strategy="afterInteractive"
      />
      <Script id="google-tag" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        ${consentDefault}
        gtag('js', new Date());
        ${ids.map((id) => `gtag('config', '${id}');`).join("\n        ")}
      `}</Script>
    </>
  );
}
