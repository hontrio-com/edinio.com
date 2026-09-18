"use client";

import Script from "next/script";
import { useEffect } from "react";
import { CONSENT_EVENT, CONSENT_VERSION, readConsent } from "@/lib/cookie-consent";

/**
 * Loads gtag.js and configures one or more Google tags (Google Ads AW-…,
 * GA4 G-…) with Consent Mode v2 signals.
 *
 * Cu `requireConsent` (implicit), componenta e randata in spatele lui ConsentGate cu AMANDOUA categoriile
 * (analiza SI marketing): ajunge oricare, fiindca tagul poarta si masuratoarea GA4, si conversiile Google
 * Ads. Ce are voie sa faca hotarasc apoi semnalele de consimtamant, fiecare din categoria lui, iar
 * schimbarile din banner se impinge prin `consent update`.
 *
 * When the merchant disabled the cookie banner (`requireConsent=false`), there
 * is no consent flow, so every signal defaults to granted.
 */
export function GoogleTag({ tagIds, slug, requireConsent = true, adsId }: {
  tagIds: string[];
  slug?: string;
  requireConsent?: boolean;
  /** ID-ul de conversie Google Ads (`AW-…`), pentru remarketingul dinamic din `gtagEvent`. */
  adsId?: string | null;
}) {
  // Defense-in-depth: these values end up inside an inline script.
  const ids = [...new Set(tagIds.map((t) => (t ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "")).filter(Boolean))];
  const safeSlug = (slug ?? "").replace(/[^a-zA-Z0-9-]/g, "");
  const safeAds = (adsId ?? "").replace(/[^A-Za-z0-9_-]/g, "");

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

  /*
   * Semnalele de consimtamant, pe CATEGORII (18.09.2026). Bannerul oprit -> totul acordat. Cu banner, tagul
   * se incarca daca omul a acceptat ORICARE dintre analiza si marketing, iar apoi fiecare semnal citeste
   * chiar categoria lui: `analytics_storage` din analiza, `ad_*` din marketing.
   *
   * ⚠ Inainte `analytics_storage` era scris mereu `granted`, fiindca tagul se incarca doar dupa acordul de
   * analiza. Acum poate porni si fara el, deci minciuna aceea ar fi devenit adevarata scurgere.
   */
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
        var adGranted = false, analyticsGranted = false;
        try {
          var c = JSON.parse(localStorage.getItem('edinio_cc_${safeSlug}') || 'null');
          adGranted = !!(c && c.v === ${CONSENT_VERSION} && c.marketing);
          analyticsGranted = !!(c && c.v === ${CONSENT_VERSION} && c.analytics);
        } catch (e) {}
        gtag('consent', 'default', {
          analytics_storage: analyticsGranted ? 'granted' : 'denied',
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
        ${safeAds ? `window.__edinioGoogleAds={id:'${safeAds}'};` : ""}
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
