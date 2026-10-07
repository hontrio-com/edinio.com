/**
 * Codul postal al comenzilor din ROMANIA, cand magazinul il cere (`checkout_config.postal_field`).
 *
 * ═══ DE CE (cerut de un magazin, 07.10.2026) ═══
 *
 * Checkoutul cerea codul postal numai la livrarea internationala. Un magazin si-a facut singur un
 * camp personalizat „Cod postal" (completat la 86 din 91 de comenzi), dar el ajungea doar in note:
 * pe comanda, `postal_code` era gol la TOATE, deci niciun AWB nu-l primea. Campul de aici se scrie
 * chiar in `shipping_address.postal_code`, pe care il citesc ferestrele de AWB ale tuturor
 * curierilor.
 *
 * ⚠ O SINGURA regula pentru cele doua checkout-uri (pagina si fereastra din magazin): scrisa de
 * doua ori, una ar fi cerut 6 cifre si cealalta ar fi lasat orice.
 */
export type CampCodPostal = { enabled: boolean; required: boolean };

export const CAMP_COD_POSTAL_OPRIT: CampCodPostal = { enabled: false, required: false };

/** Romania: exact 6 cifre (spatiile scrise de om se iarta). */
export function codPostalRoCurat(valoare: string | null | undefined): string {
  return (valoare ?? "").replace(/\s+/g, "");
}

/** Eroarea de afisat sub camp, sau `null`. Numai pentru livrarea in Romania. */
export function eroareCodPostalRo(camp: CampCodPostal | null | undefined, valoare: string | null | undefined): string | null {
  if (!camp?.enabled) return null;
  const cod = codPostalRoCurat(valoare);
  if (!cod) return camp.required ? "Introduceti codul postal" : null;
  return /^\d{6}$/.test(cod) ? null : "Codul postal are 6 cifre";
}

/**
 * Ce pleaca la server in `customer_postal_code`. Internationalul ramane cum era; in Romania,
 * numai cu campul pornit si numai un cod valid (validarea de mai sus l-a cerut deja).
 */
export function codPostalDeTrimis(
  international: boolean,
  camp: CampCodPostal | null | undefined,
  valoare: string | null | undefined,
): string | undefined {
  if (international) return (valoare ?? "").trim();
  if (!camp?.enabled) return undefined;
  const cod = codPostalRoCurat(valoare);
  return /^\d{6}$/.test(cod) ? cod : undefined;
}
