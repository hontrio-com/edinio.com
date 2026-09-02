"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { GAZDE_PRODUCTIE } from "@/lib/edinio-marketing/mediu";
import { faraUrmarire } from "@/lib/edinio-marketing/fara-urmarire";
import { ID_PIXEL_TIKTOK } from "@/lib/edinio-marketing/pixel-tiktok";
import { useConsimtamant } from "@/lib/edinio-marketing/consimtamant-browser";

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

const ID_PIXEL = ID_PIXEL_TIKTOK;

export function EdinioTikTokPixel() {
  /* ⚠ Hook-ul inaintea oricarei iesiri — regulile hook-urilor. */
  const cale = usePathname();
  const c = useConsimtamant();

  if (!ID_PIXEL) return null;
  if (faraUrmarire(cale)) return null;

  /*
    ═══ ⚠ POARTA DE CONSIMTAMANT: NU SE RANDEAZA, DECI NU SE INCARCA ═══

    Poarta e chiar ne-randarea, nu o conditie inauntrul scriptului. Un `<Script>`
    care nu intra in arbore nu e injectat NICIODATA — deci zero cereri catre
    furnizor, zero cookie-uri, nimic de sters mai tarziu. Asta e „Basic consent
    mode" pe gratis, si e singura forma care chiar tine: un script incarcat si
    „oprit" dinauntru a scris deja pe terminal.

    ⚠ `!c.mounted` E JUMATATE DIN REGULA. Serverul nu stie ce scrie in cookie
    (si n-are voie sa afle — ar face paginile dinamice, iar ele se servesc din
    cache). Deci prima randare din browser trebuie sa iasa IDENTIC cu cea de pe
    server: null. Hotararea se afla abia in efect. Fara asta, prima zi ar aduce
    erori de hidratare pe fiecare pagina.

    ⚠ SI POARTA CALATORESTE CU PIXELUL, nu cu layoutul. Layouturile sunt deja
    neuniforme — `(dashboard)` randeaza Meta si TikTok dar nu si GA4 — deci o
    poarta cheiata pe ele s-ar rupe la primul layout nou.
  */
  if (!c.mounted || !c.marketing) return null;


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
