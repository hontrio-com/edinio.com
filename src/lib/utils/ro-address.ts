/**
 * Normalization helpers for Romanian addresses sent to courier APIs.
 *
 * Courier nomenclatures (FAN Courier, Sameday, ...) list counties/localities
 * without diacritics, while customers type free text ("București", "Sector 3",
 * "Județul Cluj"). A locality that doesn't match the nomenclature gets the AWB
 * rejected or tariffed wrong, so every value sent to a courier API goes
 * through these helpers.
 */

const DIACRITICS: Record<string, string> = {
  "ș": "s", "ş": "s", "ț": "t", "ţ": "t", "ă": "a", "î": "i", "â": "a",
  "Ș": "S", "Ş": "S", "Ț": "T", "Ţ": "T", "Ă": "A", "Î": "I", "Â": "A",
};

export function stripDiacritics(value: string): string {
  return value.replace(/[șşțţăîâȘŞȚŢĂÎÂ]/g, (ch) => DIACRITICS[ch] ?? ch);
}

/** County name as courier nomenclatures expect it: no "Județul/Municipiul" prefix, no diacritics. */
export function normalizeCountyName(county: string): string {
  const cleaned = county.replace(/^\s*(jude[țţt]ul|municipiul)\s+/i, "");
  return stripDiacritics(cleaned).trim();
}

/**
 * Locality as courier nomenclatures expect it. Bucharest is a single locality
 * in courier systems: sectors and diacritic/English variants all map to
 * "Bucuresti" (the sector is derived from street/zip by the courier).
 */
export function normalizeLocalityName(locality: string, county?: string): string {
  const clean = stripDiacritics(locality).trim();
  const countyClean = county ? normalizeCountyName(county).toLowerCase() : "";
  if (
    countyClean === "bucuresti" ||
    /^sector\s*[1-6]$/i.test(clean) ||
    clean.toLowerCase() === "bucharest" ||
    clean.toLowerCase() === "bucuresti"
  ) {
    return "Bucuresti";
  }
  return clean;
}

/**
 * Sectorul, extras din orice mod in care il scrie lumea. `null` daca nu e niciunul.
 *
 * ⚠ Nu ghiceste NICIODATA. „Bucuresti" simplu intoarce `null`, fiindca sectorul
 * nu se poate deduce dintr-un nume de oras — iar un sector inventat ar trimite
 * coletul in alta parte a orasului.
 *
 * Formele vin din comenzi ADEVARATE: „Sector 1", „bucuresti sector 3", „Sec 5",
 * „SECTOR 3", „sectorul 3".
 */
export function sectorBucuresti(locality: string | null | undefined): number | null {
  const m = stripDiacritics(locality ?? "").match(/sec(?:tor(?:ul)?)?\.?\s*([1-6])\b/i);
  return m ? Number(m[1]) : null;
}

/**
 * Localitatea asa cum o cere SAMEDAY — si numai ea.
 *
 * ⚠ EA E PE DOS FATA DE TOTI CEILALTI CURIERI. La Cargus, DPD sau FAN,
 * Bucurestiul e O SINGURA localitate si sectoarele se pliaza in „Bucuresti"
 * (exact ce face `normalizeLocalityName`). La Sameday, „Bucuresti" nu exista ca
 * oras: oraseleAlese sunt „Sector 1"…„Sector 6".
 *
 * De aceea Sameday NU poate folosi `normalizeLocalityName` — l-ar strica.
 *
 * ⚠ Daca sectorul lipseste, se intoarce textul curatat, nu o presupunere:
 * cotatia va cadea si se va folosi pretul din zona, ceea ce e neplacut, dar
 * onest. Un sector ghicit ar produce un AWB catre alta adresa.
 */
export function localitateSameday(locality: string, county?: string): string {
  const clean = stripDiacritics(locality).trim();
  const inBucuresti =
    (county ? normalizeCountyName(county).toLowerCase() === "bucuresti" : false) ||
    /bucuresti|bucharest/i.test(clean) ||
    sectorBucuresti(clean) !== null;

  if (!inBucuresti) return clean;

  const sector = sectorBucuresti(clean);
  return sector ? `Sector ${sector}` : clean;
}
