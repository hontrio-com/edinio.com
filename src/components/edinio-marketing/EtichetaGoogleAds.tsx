"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { GAZDE_PRODUCTIE } from "@/lib/edinio-marketing/mediu";
import { faraUrmarire } from "@/lib/edinio-marketing/fara-urmarire";
import { useConsimtamant } from "@/lib/edinio-marketing/consimtamant-browser";
import { corpBazaGtag } from "@/lib/edinio-marketing/corp-gtag";
import { ID_GOOGLE_ADS } from "@/lib/edinio-marketing/pixel-google-ads";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ETICHETA GOOGLE ADS
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CATEGORIA E „MARKETING", NU „STATISTICI", si de aceea e o componenta de sine
  statatoare si nu un rand in `EtichetaGa4`.

  Cele doua etichete Google masoara lucruri deosebite si atarna de alegeri
  deosebite: cineva poate accepta statistici si refuza reclame, sau pe dos. Pusa
  langa GA4, eticheta de reclame ar fi pornit odata cu ea — adica pentru cineva
  care tocmai refuzase marketingul.

  ⚠ CINE ACORDA MARKETING SI REFUZA STATISTICI ajunge aici FARA ca GA4 sa fi
  rulat. Atunci `gtag` nu exista si nimeni n-a declarat starea de consimtamant —
  de aceea temeiul comun (`corpBazaGtag`) e inclus si aici, nu presupus.

  ⚠ SI NU INCARCA A DOUA BIBLIOTECA. `gtag.js` e una singura; id-ul din adresa
  spune doar ce se configureaza implicit. Cand GA4 a incarcat-o deja, temeiul o
  gaseste pusa si aici ramane doar `config`.
*/

export function EtichetaGoogleAds() {
  /* ⚠ Hook-ul inaintea oricarei iesiri — regulile hook-urilor. */
  const cale = usePathname();
  const c = useConsimtamant();

  if (!ID_GOOGLE_ADS) return null;
  if (faraUrmarire(cale)) return null;

  /*
    ⚠ POARTA E NE-RANDAREA, ca la ceilalti trei: un `<Script>` care nu intra in
    arbore nu e injectat niciodata. Si `!c.mounted` face parte din ea — serverul
    nu stie ce scrie in cookie, deci prima randare din browser trebuie sa iasa
    identic cu cea de pe server.
  */
  if (!c.mounted || !c.marketing) return null;

  const baza = corpBazaGtag({
    gazde: GAZDE_PRODUCTIE,
    statistici: c.statistici,
    marketing: c.marketing,
    idIncarcare: ID_GOOGLE_ADS,
  });

  return (
    <Script id="edinio-google-ads" strategy="afterInteractive">{`
      (function () {
${baza}
        if (window.__edinioAdsPornit) return;
        window.__edinioAdsPornit = true;

        /*
          ⚠ FARA 'send_page_view'. Google Ads nu numara vizualizari de pagina, ci
          conversii — iar remarketingul lui se face din chiar aceasta comanda.
        */
        gtag('config', ${JSON.stringify(ID_GOOGLE_ADS)});

        if (window.__edinioMarketingGata) window.__edinioMarketingGata('google-ads');
      })();
    `}</Script>
  );
}
