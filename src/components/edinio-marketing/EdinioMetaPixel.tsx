"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { GAZDE_PRODUCTIE } from "@/lib/edinio-marketing/mediu";
import { faraUrmarire } from "@/lib/edinio-marketing/fara-urmarire";
import { ID_PIXEL_META } from "@/lib/edinio-marketing/pixel-meta";
import { useConsimtamant } from "@/lib/edinio-marketing/consimtamant-browser";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  PIXELUL META AL EDINIO — nu al vreunui comerciant
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SE NUMEA `PlatformMetaPixel` si statea IN `components/platform/`. Numele era
  echivoc: „platform" nu spune AL CUI e pixelul, iar in acelasi proiect exista si
  pixelul fiecarui comerciant. Redenumit pe 01.09.2026, fara alias in urma.

  ═══ ⚠ CE ERA STRICAT: SE INCARCA PESTE TOT ═══

  Forma veche nu verifica gazda deloc. Deci pixelul pornea si pe `localhost`, si
  pe FIECARE desfasurare de previzualizare, si trimitea `PageView` si
  `ViewContent` in pixelul ADEVARAT.

  Datele acelea nu se mai pot scoate din contul de reclame, si nu sunt doar
  murdarie in rapoarte: audientele de retargetare se construiesc din ele, deci
  banii de reclama ajungeau sa urmareasca sesiuni de dezvoltare.

  Aceeasi paza ca la eticheta Google, si pentru acelasi motiv. Verificarea sta IN
  SCRIPT, nu la randare: `window` nu exista pe server, iar o randare deosebita
  intre server si browser strica hidratarea. Markup-ul e la fel peste tot;
  scriptul hotaraste, si in afara productiei nu pleaca nicio cerere.

  ═══ ⚠ DE CE NU MAI EXISTA `<noscript>` ═══

  Meta pune in instructiuni un `<img>` intr-un `<noscript>`. L-am scos, si nu din
  scapare:

  - el se randeaza in HTML ORICUM, deci ar fi fost singura gaura din paza de mai
    sus — de pe fiecare previzualizare ar fi plecat un `PageView` adevarat;
  - iar cine are JavaScript oprit nu poate oricum folosi site-ul: e o aplicatie
    App Router, unde fara JS nu merge nici navigarea, nici formularele, nici
    inregistrarea. Nu pierdem o masuratoare, fiindca n-avea ce sa masoare.
*/

const ID_PIXEL = ID_PIXEL_META;

export function EdinioMetaPixel() {
  /* ⚠ Hook-ul inaintea oricarei iesiri — regulile hook-urilor. */
  const cale = usePathname();
  const c = useConsimtamant();

  if (!ID_PIXEL) return null;

  /*
    ⚠ Previzualizarea unui articol nepublicat e un ecran autentificat cu continut
    privat. Vezi `lib/edinio-marketing/fara-urmarire.ts`.
  */
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
    <Script id="edinio-meta-pixel" strategy="afterInteractive">{`
      (function (w, d) {
        if (${gazde}.indexOf(location.hostname) === -1) return;
        if (w.__edinioMetaPornit) return;
        w.__edinioMetaPornit = true;

        if (!w.fbq) {
          var n = w.fbq = function () {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
          };
          if (!w._fbq) w._fbq = n;
          n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
          var t = d.createElement('script'); t.async = true;
          t.src = 'https://connect.facebook.net/en_US/fbevents.js';
          var s = d.getElementsByTagName('script')[0];
          s.parentNode.insertBefore(t, s);
        }

        w.fbq('init', ${JSON.stringify(ID_PIXEL)});
        w.fbq('track', 'PageView');

        if (w.__edinioMarketingGata) w.__edinioMarketingGata('meta');
      })(window, document);
    `}</Script>
  );
}
