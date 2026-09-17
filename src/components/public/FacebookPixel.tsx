"use client";

import Script from "next/script";
import { parseMetaPixelId } from "@/lib/marketing-config";

/**
 * Codul de baza al pixelului Meta al comerciantului.
 *
 * ⚠ POTRIVIREA AVANSATA INTRA IN `init`, nu intr-un `init` al doilea. Documentatia: „Be sure to place
 * advanced matching parameters in the pixel base code or the values will not be treated as manual advanced
 * matching values.” Pagina de confirmare pune datele omului (hash-uite pe server) in `window.__edinioAM`
 * printr-un script randat in HTML, care ruleaza la parsare, deci inaintea acestui cod (`afterInteractive`,
 * adica dupa hidratare). Pe celelalte pagini obiectul lipseste si `init` primeste `{}`.
 *
 * ⚠ `window.__edinioMeta` spune runtime-ului (`fbTrack`) ce magazin e si daca are Conversions API. Fara el,
 * nimic nu pleaca spre server: magazinele fara token raman exact cum erau.
 */
export function FacebookPixel({ pixelId, magazin, capi = false }: { pixelId: string; magazin: string; capi?: boolean }) {
  // Defense-in-depth: this value is interpolated into an inline script on the
  // shared edinio.com origin. Only a valid numeric Meta ID may pass through.
  const id = parseMetaPixelId(pixelId);
  if (!id) return null;
  /* Slugul intra intr-un script: doar caracterele unui slug, si prin JSON. */
  const slug = JSON.stringify(String(magazin).replace(/[^a-z0-9-]/gi, "").slice(0, 100));

  return (
    <>
      <Script id="fb-pixel" strategy="afterInteractive">{`
        window.__edinioMeta={magazin:${slug},capi:${capi ? "true" : "false"}};
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
        n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
        s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
        (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init','${id}',window.__edinioAM||{});
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
