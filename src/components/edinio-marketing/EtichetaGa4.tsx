"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { codGa4, GAZDE_PRODUCTIE } from "@/lib/edinio-marketing/mediu";
import { faraUrmarire } from "@/lib/edinio-marketing/fara-urmarire";
import { useConsimtamant } from "@/lib/edinio-marketing/consimtamant-browser";
import { corpBazaGtag } from "@/lib/edinio-marketing/corp-gtag";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ETICHETA GOOGLE A EDINIO — nu a vreunui comerciant
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ FARA TAG MANAGER, dinadins. Un container extern poate schimba ce se incarca pe
  site fara sa treaca prin verificarea codului — adica exact lucrul impotriva
  caruia e construit tot restul. Eticheta se pune direct, e versionata si se vede
  in diff.

  ⚠ NU E ETICHETA COMERCIANTILOR. Ei isi pun propriile coduri prin
  `components/public/GoogleTag.tsx`, cu id-urile lor, in magazinele lor. Cele doua
  n-au voie sa se intalneasca: vezi `lib/granita-tracking.test.ts`.

  ⚠ SI NU SE INCARCA NICAIERI IN AFARA SUPRAFETELOR NOASTRE. Se randeaza numai din
  layouturile prezentarii, ajutorului, autentificarii si onboardingului. NU din
  `(dashboard)`, NU din `(admin)`, NU din magazine.

  ═══ ⚠ DE CE GAZDA SE VERIFICA IN SCRIPT, SI NU LA RANDARE ═══

  Prima forma a componentei randa eticheta oriunde exista codul — deci si pe
  `localhost`, si pe desfasurarile de previzualizare. Datele de acolo ar fi ajuns
  in ACEEASI proprietate ca traficul adevarat, si nu se mai pot scoate: GA4 n-are
  „sterge sesiunile de la gazda cutare".

  Verificarea nu se poate face la randare, fiindca `window` nu exista pe server si
  o randare deosebita intre server si browser strica hidratarea. Deci markup-ul e
  acelasi peste tot, iar scriptul HOTARASTE: pe alta gazda nu incarca nimic si nu
  configureaza nimic. Zero cereri catre Google in afara productiei.
*/

export function EtichetaGa4() {
  /* ⚠ Hook-ul inaintea oricarei iesiri — regulile hook-urilor. */
  const cale = usePathname();
  const c = useConsimtamant();

  const cod = codGa4();
  if (!cod) return null;

  /*
    ⚠ ACEEASI POARTA CA LA PIXELI. Previzualizarea unui articol nepublicat e un
    ecran autentificat cu continut privat. Vezi `lib/edinio-marketing/fara-urmarire.ts`.
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
  if (!c.mounted || !c.statistici) return null;



  const baza = corpBazaGtag({
    gazde: GAZDE_PRODUCTIE,
    statistici: c.statistici,
    marketing: c.marketing,
    idIncarcare: cod,
  });

  return (
    <Script id="edinio-ga4" strategy="afterInteractive">{`
      (function () {
${baza}
        if (window.__edinioGa4Pornit) return;
        window.__edinioGa4Pornit = true;

        /*
          ⚠ send_page_view: false, dinadins. Aplicatia are o singura pagina care
          se schimba sub picioare; numarate de ei, s-ar fi numarat gresit. Le
          trimitem noi, din RuntimeMarketing.
        */
        gtag('config', ${JSON.stringify(cod)}, { send_page_view: false });

        if (window.__edinioMarketingGata) window.__edinioMarketingGata('ga4');
      })();
    `}</Script>
  );
}
