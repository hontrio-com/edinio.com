"use client";

import Script from "next/script";
import { parseTikTokPixelId } from "@/lib/marketing";

export function TikTokPixel({ pixelId }: { pixelId: string }) {
  // Defense-in-depth: only a valid TikTok ID may reach the inline script.
  const id = parseTikTokPixelId(pixelId);
  if (!id) return null;

  // Current TikTok base code — methods list includes the Consent API stubs
  // (holdConsent/revokeConsent/grantConsent) present in Events Manager today.
  return (
    <Script id="tiktok-pixel" strategy="afterInteractive">{`
      !function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
      ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],
      ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
      for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
      ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
      ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};
      var a=document.createElement("script");a.type="text/javascript",a.async=!0,
      a.src=i+"?sdkid="+e+"&lib="+t;var s=document.getElementsByTagName("script")[0];
      s.parentNode.insertBefore(a,s)};ttq.load('${id}');ttq.page();
      if(window.__edinioFlushQueue)window.__edinioFlushQueue('tt');}
      (window,document,'ttq');
    `}</Script>
  );
}
