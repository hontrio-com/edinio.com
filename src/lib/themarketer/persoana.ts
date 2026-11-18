import { normalizePhone } from "@/lib/marketing-config";

/**
 * Numele si telefonul in forma ceruta de theMarketer, intr-un singur loc: le folosesc si serverul
 * (`save_order`, feedul de comenzi, abonarea) si browserul (`__sm__order` pe pagina de multumire).
 *
 * ⚠ Fara `server-only` si fara importuri grele: ajunge in pachetul vitrinei.
 */

/** Telefonul in forma din exemplele lor („+40700000000”). Un numar pe care nu-l putem citi pleaca asa cum e. */
export function telefonTM(t: string | null | undefined): string {
  const brut = (t ?? "").trim();
  const d = normalizePhone(brut);
  return d ? `+${d}` : brut;
}

/**
 * Prenumele si numele. ⚠ Numele lipsa ia valoarea prenumelui: `save_order` refuza cu 422 o comanda fara
 * `lastname`, iar un om care a scris un singur cuvant n-a gresit nimic.
 */
export function numeTM(nume: string | null | undefined): { firstname: string; lastname: string } {
  const parti = (nume ?? "").trim().split(/\s+/).filter(Boolean);
  if (parti.length === 0) return { firstname: "", lastname: "" };
  if (parti.length === 1) return { firstname: parti[0], lastname: parti[0] };
  return { firstname: parti[0], lastname: parti.slice(1).join(" ") };
}
