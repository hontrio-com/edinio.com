/*
  ═══════════════════════════════════════════════════════════════════════════════
  CONVERSIA GOOGLE ADS: UNDE PLEACA SI CU CE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠⚠ DEFECTUL REPARAT AICI (18.09.2026). `send_to` se compunea din `google_tag_id`, campul in care
  comerciantul poate pune ORICE tag Google: `G-…` (GA4), `GT-…` sau `AW-…`. Cu un `G-`, adresa iesea
  `G-76XBCVV0P2/eticheta`, iar Google Ads nu primea nimic: conversia pleca intr-un container care nu stie ce
  e o conversie Ads. Singurul magazin cu tag din productie avea exact asa ceva.

  Documentatia conversiilor: fragmentul de eveniment e
  `gtag('event', 'conversion', {'send_to': 'AW-CONVERSION_ID/CONVERSION_LABEL', ...})`. Deci ID-ul de
  conversie e intotdeauna unul `AW-`, iar eticheta n-are niciun inteles fara el.

  ⚠ `transaction_id` = id-ul comenzii: asa isi da Google seama ca o pagina de confirmare reincarcata e
  aceeasi conversie, nu inca una.
*/

/** ID-ul de conversie Google Ads: numai `AW-…`. Un `G-` sau `GT-` nu e un cont de Ads. */
export function parseIdConversieAds(brut?: string | null): string | null {
  if (!brut) return null;
  const c = brut.trim().toUpperCase();
  /* Si forma lipita intreaga, „AW-123/eticheta”: se pastreaza doar ID-ul. */
  const doarId = c.includes("/") ? c.split("/")[0] : c;
  return /^AW-[A-Z0-9]{4,20}$/.test(doarId) ? doarId : null;
}

/** Eticheta de conversie, din forma scurta sau din „AW-123/eticheta”. */
export function parseEtichetaAds(brut?: string | null): string | null {
  if (!brut) return null;
  const c = brut.trim();
  const eticheta = c.includes("/") ? (c.split("/").pop() ?? "") : c;
  return /^[A-Za-z0-9_-]{3,40}$/.test(eticheta) ? eticheta : null;
}

export interface ConversieAds {
  send_to: string;
  value: number;
  currency: string;
  transaction_id: string;
}

/**
 * Sarcina evenimentului `conversion`, sau `null` cand nu e nimic de trimis.
 *
 * ⚠ Amandoua sunt obligatorii: fara ID de conversie `AW-` sau fara eticheta, evenimentul ar pleca intr-o
 * adresa care nu exista. Mai bine nimic decat o conversie pierduta in tacere.
 */
export function conversieCumparare(
  idConversie: string | null | undefined,
  eticheta: string | null | undefined,
  comanda: { orderId: string; valoare: number; moneda?: string },
): ConversieAds | null {
  const id = parseIdConversieAds(idConversie);
  const label = parseEtichetaAds(eticheta);
  if (!id || !label || !comanda.orderId) return null;
  return {
    send_to: `${id}/${label}`,
    value: Math.round((Number(comanda.valoare) || 0) * 100) / 100,
    currency: comanda.moneda || "RON",
    transaction_id: comanda.orderId,
  };
}
