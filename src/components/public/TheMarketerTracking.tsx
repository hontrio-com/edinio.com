"use client";

import Script from "next/script";
import { cheieUrmarireValida } from "@/lib/themarketer/config";

/**
 * Scriptul de urmarire theMarketer al comerciantului (developers.themarketer.com/reference/javascript-tracking-code).
 *
 * ⚠ SE MONTEAZA NUMAI SUB `ConsentGate` „marketing”, ca pixelii Meta si TikTok: scriptul pune cookie-uri
 * de urmarire si leaga vizitatorul de emailul lui.
 *
 * ⚠ FARA GOOGLE TAG MANAGER. Documentatia lor scrie ca GTM „trebuie” instalat, dar pluginul lor oficial de
 * WooCommerce nu-l incarca (doar optional): pune evenimentele in `window.dataLayer` si incarca scriptul,
 * care le citeste de acolo, inclusiv pe cele puse inainte sa se incarce. Asa facem si noi.
 *
 * ⚠ `mktr_key` GLOBAL, ca in fragmentul lor oficial: scriptul il poate citi de acolo.
 *
 * `window.__edinioMktr` spune runtime-ului (`mktrEvent` din `lib/marketing.ts`) ca theMarketer e gata;
 * golirea cozii (`__edinioFlushQueue('mk')`) trimite evenimentele asteptate pana la acord.
 */
export function TheMarketerTracking({ cheie, captura }: { cheie: string; captura: boolean }) {
  /* Aparare in adancime: numai o cheie care nu poate iesi din sir ajunge in scriptul inline. */
  if (!cheieUrmarireValida(cheie)) return null;
  const k = JSON.stringify(cheie);
  return (
    <Script id="themarketer" strategy="afterInteractive">{`
      window.dataLayer=window.dataLayer||[];
      window.__edinioMktr={captura:${captura ? "true" : "false"}};
      window.mktr_key=${k};
      (function(){var m=document.createElement("script");m.async=true;m.src="https://t.themarketer.com/t/j/"+encodeURIComponent(${k});
      var s=document.getElementsByTagName("script")[0];if(s&&s.parentNode)s.parentNode.insertBefore(m,s);else document.head.appendChild(m);})();
      if(window.__edinioFlushQueue)window.__edinioFlushQueue('mk');
    `}</Script>
  );
}
