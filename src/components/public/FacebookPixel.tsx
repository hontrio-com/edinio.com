"use client";

import Script from "next/script";
import { parseMetaPixelId } from "@/lib/marketing";

export function FacebookPixel({ pixelId }: { pixelId: string }) {
  // Defense-in-depth: this value is interpolated into an inline script on the
  // shared edinio.com origin. Only a valid numeric Meta ID may pass through.
  const id = parseMetaPixelId(pixelId);
  if (!id) return null;

  return (
    <>
      <Script id="fb-pixel" strategy="afterInteractive">{`
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
        n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
        s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
        (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init','${id}');
        fbq('track','PageView');
        if(window.__edinioFlushQueue)window.__edinioFlushQueue('fb');
      `}</Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1`}
          alt="" />
      </noscript>
    </>
  );
}
