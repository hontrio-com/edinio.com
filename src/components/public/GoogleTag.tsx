"use client";

import Script from "next/script";
import { useEffect } from "react";
import { CONSENT_EVENT, CONSENT_VERSION, readConsent } from "@/lib/cookie-consent";

/**
 * Loads gtag.js and configures one or more Google tags (Google Ads AW-…,
 * GA4 G-…) with Consent Mode v2 signals.
 *
 * With `requireConsent` (the default), this is rendered behind ConsentGate
 * (category "analytics"), so by mount time the visitor HAS consented to
 * analytics; ad signals still follow the "marketing" choice and later banner
 * changes are pushed via `consent update`.
 *
 * When the merchant disabled the cookie banner (`requireConsent=false`), there
 * is no consent flow, so every signal defaults to granted.
 */
export function GoogleTag({ tagIds, slug, requireConsent = true }: { tagIds: string[]; slug?: string; requireConsent?: boolean }) {
  // Defense-in-depth: these values end up inside an inline script.
  const ids = [...new Set(tagIds.map((t) => (t ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "")).filter(Boolean))];
  const safeSlug = (slug ?? "").replace(/[^a-zA-Z0-9-]/g, "");

  // Push consent changes (from the cookie banner) into Google tags live.
  useEffect(() => {
    if (!safeSlug || !requireConsent) return;
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
  }, [safeSlug, requireConsent]);

  if (ids.length === 0) return null;

  // Consent defaults. Banner disabled → everything granted. Banner enabled →
  // this component only mounts after analytics consent (so analytics granted);
  // ad signals read the stored "marketing" choice.
  const consentDefault = !requireConsent
    ? `
        gtag('consent', 'default', {
          analytics_storage: 'granted',
          ad_storage: 'granted',
          ad_user_data: 'granted',
          ad_personalization: 'granted'
        });`
    : safeSlug
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
        if(window.__edinioFlushQueue)window.__edinioFlushQueue('ga');
      `}</Script>
    </>
  );
}
