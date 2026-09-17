"use client";

import Script from "next/script";
import { parseTikTokPixelId } from "@/lib/marketing-config";

/**
 * Codul de baza al pixelului TikTok al comerciantului.
 *
 * ⚠ POTRIVIREA AVANSATA INTRA INAINTEA EVENIMENTELOR. Documentatia: „Use `ttq.identify` as the start of the
 * Advanced Matching code before the event code e.g. `ttq.track`.” Pagina de confirmare pune datele omului
 * (hash-uite pe SERVER, ca sa nu stea in clar in HTML) in `window.__edinioTTAM`, printr-un script randat in
 * HTML, care ruleaza la parsare, deci inaintea acestui cod (`afterInteractive`). Documentatia primeste si
 * valori deja hash-uite: „Pass the hashed values”.
 *
 * ⚠ `window.__edinioTikTok` spune runtime-ului (`ttqTrack`) ce magazin e si daca are Events API. Fara el,
 * nimic nu pleaca spre server: magazinele fara token raman exact cum erau.
 */
export function TikTokPixel({ pixelId, magazin, capi = false }: { pixelId: string; magazin: string; capi?: boolean }) {
  // Defense-in-depth: only a valid TikTok ID may reach the inline script.
  const id = parseTikTokPixelId(pixelId);
  if (!id) return null;
  /* Slugul intra intr-un script: doar caracterele unui slug, si prin JSON. */
  const slug = JSON.stringify(String(magazin).replace(/[^a-z0-9-]/gi, "").slice(0, 100));

  // Current TikTok base code — methods list includes the Consent API stubs
  // (holdConsent/revokeConsent/grantConsent) present in Events Manager today.
  return (
    <Script id="tiktok-pixel" strategy="afterInteractive">{`
      window.__edinioTikTok={magazin:${slug},capi:${capi ? "true" : "false"}};
      !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
      ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],
      ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
      for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
      ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
      ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};
      var a=document.createElement("script");a.type="text/javascript",a.async=!0,
      a.src=i+"?sdkid="+e+"&lib="+t;var s=document.getElementsByTagName("script")[0];
      s.parentNode.insertBefore(a,s)};ttq.load('${id}');
      if(window.__edinioTTAM)ttq.identify(window.__edinioTTAM);
      ttq.page();
      if(window.__edinioFlushQueue)window.__edinioFlushQueue('tt');}
      (window,document,'ttq');
    `}</Script>
  );
}
