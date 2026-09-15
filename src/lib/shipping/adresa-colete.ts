/**
 * Adresa, in forma pe care o cere COLETE ONLINE, si numai ea.
 *
 * ═══ ⚠ AICI DIACRITICELE SE PASTREAZA, PE DOS FATA DE CEILALTI ═══
 *
 * La Cargus, DPD sau FAN nomenclatorul e fara diacritice, si de aceea `normalizeLocalityName`
 * si `normalizeCountyName` le scot. La Colete Online e invers, si o spun chiar ei, de doua ori:
 *
 *   1. Colectia lor Postman oficiala trimite, in corpul comenzii, `"city": "Timișoara"`,
 *      `"county": "Timiș"`, `"street": "Piața Avram Iancu"`, `"street": "Băncilă Octav"`.
 *   2. Modulul lor oficial de WordPress (2.1.1) ia orasul si judetul din comanda VERBATIM
 *      (`WoocommerceOrderRepository::getDeliveryAddressCity` intoarce
 *      `get_shipping_city()` si atat) si nu are nicaieri vreo transliterare.
 *
 * ═══ ⚠ SI CE FACEAM: DOUA REGULI PENTRU ACELASI CAMP, IN ACELASI CORP ═══
 *
 * `buildOrderBody` trecea orasul DESTINATARULUI prin `normalizeLocalityName` (care scoate
 * diacriticele), dar lasa judetul lui neatins, si lasa si orasul EXPEDITORULUI neatins. Adica
 * aceeasi cerere purta „Timisoara" langa „Timiș": una ciuntita, una intreaga.
 *
 * ⚠ Masurat pe 15.09.2026, din 468 de comenzi cu adresa: 64 au diacritice in oras, 14 in judet
 * si 44 pe strada. Nu e un caz de colt, e una din sapte comenzi.
 *
 * ═══ ⚠ CE RAMANE NEVERIFICAT, SI SE SPUNE PE FATA ═══
 *
 * Forma pe care o vor ei pentru CAPITALA. Nomenclatorul lor (`/search/city/RO/...`) cere
 * autentificare, iar la 15.09.2026 niciun magazin al platformei n-are credentiale Colete
 * Online, deci nu se poate intreba. Alegerea de mai jos, „București" cu sectorul lasat in
 * adresa, e forma pe care o produce chiar integrarea lor de WooCommerce: acolo judetul vine
 * din lista de state a WooCommerce (`B` = `București`), iar sectorul nu e oras, ci ajunge in
 * strada. Cand apare primul cont, se confirma din nomenclatorul lor.
 */

/** Forma capitalei, cu diacritice, cum o are lista de judete a WooCommerce. */
const CAPITALA = "București";

const RE_SECTOR = /sec(?:tor(?:ul)?)?\.?\s*[1-6]\b/i;
const RE_CAPITALA = /bucure[sșş]ti|bucharest/i;

/** Prefixul pus de selectorul NOSTRU, nu de ei: „Judetul Timis", „Municipiul Bucuresti". */
function faraPrefixul(text: string): string {
  return text.replace(/^\s*(jude[țţt]ul|municipiul)\s+/i, "").trim();
}

/**
 * Judetul, pentru Colete Online.
 *
 * ⚠ Se scoate doar prefixul pus de selectorul nostru. Diacriticele RAMAN: „Timiș" e chiar
 * forma din exemplele lor.
 */
export function judetulColete(county: string): string {
  const curat = faraPrefixul(county ?? "");
  return RE_CAPITALA.test(curat) ? CAPITALA : curat;
}

/**
 * Localitatea, pentru Colete Online.
 *
 * ⚠ SECTORUL SE PLIAZA IN CAPITALA, si asta e singura interventie. Colete Online e BROKER: el
 * da mai departe la Cargus, DPD si ceilalti, iar acolo Bucurestiul e o singura localitate.
 * „Sector 3" trimis ca oras n-ar fi gasit in niciun nomenclator din lantul lor. Pe dos fata de
 * Sameday, unde sectoarele CHIAR sunt orase.
 *
 * ⚠ Restul textului nu se atinge deloc: nici diacritice scoase, nici litere schimbate.
 */
export function localitateaColete(city: string, county?: string): string {
  const curat = faraPrefixul(city ?? "");
  const inCapitala =
    RE_CAPITALA.test(curat)
    || RE_SECTOR.test(curat)
    || (county ? RE_CAPITALA.test(faraPrefixul(county)) : false);

  return inCapitala ? CAPITALA : curat;
}
