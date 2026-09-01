"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { GAZDE_PRODUCTIE } from "@/lib/edinio-marketing/mediu";
import { faraUrmarire } from "@/lib/edinio-marketing/fara-urmarire";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  PIXELUL TIKTOK AL EDINIO — nu al vreunui comerciant
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SE NUMEA `PlatformTikTokPixel`. Vezi nota din `EdinioMetaPixel.tsx` pentru de
  ce s-a schimbat numele si pentru ce era stricat — ACELASI defect era si aici, si
  aici era mai grav.

  ⚠ MAI GRAV FIINDCA ID-UL E SCRIS IN COD. La Meta, pixelul pornea in
  previzualizari doar daca variabila de mediu ajungea acolo. Aici id-ul e o
  rezerva scrisa in fisier, deci pixelul pornea GARANTAT oriunde rula aplicatia —
  inclusiv pe `localhost`, la fiecare `npm run dev`.

  ⚠ SI ID-UL RAMANE SCRIS IN COD, dinadins. Nu e un secret (orice vizitator il
  vede in pagina), iar scos de aici s-ar stinge masuratoarea in productie in
  clipa in care cineva uita variabila. Poarta care conteaza e gazda, si acum
  exista.
*/

const ID_PIXEL = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? "D8N5ATBC77UA0GPRAUBG";

export function EdinioTikTokPixel() {
  /* ⚠ Hook-ul inaintea oricarei iesiri — regulile hook-urilor. */
  const cale = usePathname();

  if (!ID_PIXEL) return null;
  if (faraUrmarire(cale)) return null;

  const gazde = JSON.stringify(GAZDE_PRODUCTIE);

  return (
    <Script id="edinio-tiktok-pixel" strategy="afterInteractive">{`
      (function (w, d, t) {
        if (${gazde}.indexOf(location.hostname) === -1) return;
        if (w.__edinioTikTokPornit) return;
        w.__edinioTikTokPornit = true;

        w.TiktokAnalyticsObject = t;
        var ttq = w[t] = w[t] || [];
        ttq.methods = ["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
        ttq.setAndDefer = function (obj, m) {
          obj[m] = function () { obj.push([m].concat(Array.prototype.slice.call(arguments, 0))); };
        };
        for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
        ttq.instance = function (id) {
          var e = ttq._i[id] || [];
          for (var n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
          return e;
        };
        ttq.load = function (id, cfg) {
          var url = "https://analytics.tiktok.com/i18n/pixel/events.js";
          ttq._i = ttq._i || {}; ttq._i[id] = []; ttq._i[id]._u = url;
          ttq._t = ttq._t || {}; ttq._t[id] = +new Date();
          ttq._o = ttq._o || {}; ttq._o[id] = cfg || {};
          var s = d.createElement("script");
          s.type = "text/javascript"; s.async = true;
          s.src = url + "?sdkid=" + id + "&lib=" + t;
          var f = d.getElementsByTagName("script")[0];
          f.parentNode.insertBefore(s, f);
        };
        ttq.load(${JSON.stringify(ID_PIXEL)});
        ttq.page();

        if (w.__edinioMarketingGata) w.__edinioMarketingGata('tiktok');
      })(window, document, 'ttq');
    `}</Script>
  );
}
