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
