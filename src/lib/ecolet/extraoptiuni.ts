/**
 * Care extraoptiuni le poate face CHIAR SERVICIUL ALES.
 *
 * ═══ ⚠ DOUA SURSE, SI A DOUA E CEA ADEVARATA ═══
 *
 * `/services` da, pe fiecare serviciu, un obiect `conditions` cu `has_cod`,
 * `has_open_package`, `has_saturday_delivery`, `has_sms_notify`, `has_rod`, `has_rop`,
 * `has_swap`. Alea spun ce poate serviciul IN GENERAL.
 *
 * Cotarea (`/add-parcel/reload-form`) da `form.additional_services`, indexat pe SLUG, si acela
 * spune ce poate serviciul pentru COMANDA ASTA. Exemplul din specificatia lor:
 *
 *     "additional_services": {
 *       "dpd_standard": { "cod": true, "rod": true, "open_package": false },
 *       "tnt_express":  { "cod": true, "rod": false, "open_package": false }
 *     }
 *
 * ⚠ CE FACEAM: citeam de acolo NUMAI `cod`. Restul extraoptiunilor plecau la emitere cu
 * `status: true` oricare ar fi fost serviciul ales, fiindca ele vin din configul magazinului,
 * o data pentru toate expedierile.
 *
 * Deci un comerciant care bifa „Deschidere la livrare" in Setari trimitea `open_package: true`
 * si pe `dpd_standard`, unde chiar exemplul LOR spune `false`. Ori emiterea cade cu un mesaj
 * pe care omul nu-l poate lega de nimic, ori eColet o ignora in tacere: comerciantul crede ca
 * i-a dat cumparatorului dreptul sa deschida coletul, si nu i l-a dat.
 *
 * ═══ ⚠ LIPSA CHEII NU INSEAMNA „NU POATE" ═══
 *
 * In exemplul lor, `dpd_standard` are trei chei: `cod`, `rod`, `open_package`. Nu are
 * `saturday_delivery`, nici `sms_notify`. Daca lipsa ar insemna „nu poate", am fi stins
 * livrarea de sambata pentru servicii care o fac foarte bine.
 *
 * Deci: se stinge DOAR cand ei spun limpede `false`. Aceeasi cumpana ca la `PaymentType`-ul
 * punctelor Cargus, si din acelasi motiv: o lipsa tratata ca refuz e un defect TACIT si total.
 *
 * ⚠ RAMBURSUL FACE EXCEPTIE, si ramane strict (`=== true`), asa cum era. Acolo tacerea se
 * plateste pe dos: un colet trimis cu ramburs pe un serviciu care nu incaseaza inseamna marfa
 * livrata si bani neluati. Vezi `acceptaRamburs` din `preturi.ts`.
 */

/** Numele extraoptiunilor, exact cum le indexeaza ei pe slug. */
export type ExtraEcolet =
  | "open_package"
  | "saturday_delivery"
  | "sms_notify"
  | "rod"
  | "rop"
  | "swap";

/**
 * Poate serviciul asta sa faca extraoptiunea, pentru comanda asta?
 *
 * ⚠ `true` si cand nu stim: vezi nota de mai sus despre cheia lipsa.
 */
export function serviciulPoate(
  disponibile: Record<string, Record<string, boolean>> | undefined,
  slug: string,
  extra: ExtraEcolet,
): boolean {
  const alServiciului = disponibile?.[slug];
  if (!alServiciului) return true;
  return alServiciului[extra] !== false;
}

/** Ce a cerut comerciantul din Setari. */
export type ExtraCerute = {
  deschidereLaLivrare?: boolean;
  livrareSambata?: boolean;
  smsNotificare?: boolean;
};

/** Ce se trimite chiar la emitere, dupa ce s-a intrebat serviciul. */
export type ExtraDeTrimis = ExtraCerute;

/** Perechea cerere/optiune, ca numele lor sa stea intr-un singur loc. */
const PERECHI: readonly (readonly [keyof ExtraCerute, ExtraEcolet])[] = [
  ["deschidereLaLivrare", "open_package"],
  ["livrareSambata", "saturday_delivery"],
  ["smsNotificare", "sms_notify"],
];

/**
 * Extraoptiunile cerute, taiate la ce poate serviciul ales.
 *
 * ⚠ Intoarce SI ce s-a taiat, fiindca tacerea ar fi chiar defectul pe dos: comerciantul a
 * cerut ceva, noi n-am trimis, si nimeni nu i-a spus.
 */
export function extraPentruServiciu(
  cerute: ExtraCerute,
  disponibile: Record<string, Record<string, boolean>> | undefined,
  slug: string,
): { deTrimis: ExtraDeTrimis; taiate: ExtraEcolet[] } {
  const deTrimis: ExtraDeTrimis = {};
  const taiate: ExtraEcolet[] = [];

  for (const [alNostru, alLor] of PERECHI) {
    if (!cerute[alNostru]) continue;
    if (serviciulPoate(disponibile, slug, alLor)) deTrimis[alNostru] = true;
    else taiate.push(alLor);
  }

  return { deTrimis, taiate };
}

/** Numele romanesc al extraoptiunii, pentru mesajul catre comerciant. */
export function numeExtra(extra: ExtraEcolet): string {
  switch (extra) {
    case "open_package": return "deschidere la livrare";
    case "saturday_delivery": return "livrare sambata";
    case "sms_notify": return "notificare prin SMS";
    case "rod": return "retur documente";
    case "rop": return "retur colet";
    case "swap": return "colet la schimb";
  }
}
