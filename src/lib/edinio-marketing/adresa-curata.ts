/*
  ═══════════════════════════════════════════════════════════════════════════════
  ADRESA CARE AJUNGE IN GA4 NU E ADRESA DIN BARA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CE POATE STA IN ADRESELE NOASTRE. Site-ul are cai care poarta lucruri ce n-au
  ce cauta intr-un raport:

      /blog/confirma?token=…        jetonul de confirmare a abonarii
      /blog/dezabonare?token=…      jetonul de dezabonare
      orice callback de autentificare cu `code`

  ⚠ SI DE CE E MAI GRAV DECAT PARE. Un jeton ajuns in `page_location` nu e doar o
  scapare de confidentialitate: cine are acces la rapoartele GA4 poate CONFIRMA
  sau DEZABONA in numele omului, fiindca alea sunt chiar cheile. Iar din GA4 nu
  se sterge.

  ⚠ SI NU SE POATE REZOLVA CU O LISTA DE PARAMETRI OPRITI. Un parametru nou
  adaugat maine ar trece. De aceea regula e inversa: se pastreaza NUMAI ce e pe
  lista alba, si numai pe caile care n-au nimic sensibil.
*/

/**
 * Parametrii de achizitie care au voie sa ramana.
 *
 * ⚠ Doar cei care spun DE UNDE a venit omul. `fbclid` si `ttclid` sunt dinadins
 * absenti: sunt identificatori de clic ai unor terti, si n-au ce cauta intr-un
 * raport de analiza. Ei se pastreaza separat, pentru potrivirea conversiilor.
 */
export const PARAMETRI_PASTRATI = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id",
  "gclid", "gbraid", "wbraid", "dclid",
] as const;

/**
 * Caile pe care NU se pastreaza NICIUN parametru.
 *
 * ⚠ Nici macar cei de pe lista alba: pe o cale cu jeton, un `?token=…&utm_source=x`
 * ar face lista alba sa para o paza, pastrand tocmai ce trebuia scos daca cineva
 * inverseaza vreodata ordinea. Aici se taie tot, fara exceptie.
 */
const CAI_FARA_PARAMETRI = [
  "/blog/confirma",
  "/blog/dezabonare",
  "/auth/",
  "/login",
  "/register",
] as const;

/**
 * Adresa curata, pentru `page_location`.
 *
 * Intoarce mereu o adresa absoluta. La o intrare nevalida intoarce doar originea
 * si calea, fara sa arunce: o adresa ciudata n-are voie sa opreasca masuratoarea.
 */
export function curataAdresa(brut: string): string {
  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    return "";
  }

  const cale = u.pathname;
  const eSensibila = (CAI_FARA_PARAMETRI as readonly string[]).some(
    c => cale === c || cale.startsWith(c),
  );

  /* ⚠ Fragmentul se arunca intotdeauna: poate purta orice, si nu spune nimic. */
  u.hash = "";

  if (eSensibila) {
    u.search = "";
    return u.toString();
  }

  const pastrati = new URLSearchParams();
  for (const p of PARAMETRI_PASTRATI) {
    const v = u.searchParams.get(p);
    /* Lungimea taiata: un parametru de campanie de o mie de caractere e o unealta,
       nu o campanie. */
    if (v) pastrati.set(p, v.slice(0, 100));
  }
  u.search = pastrati.toString();
  return u.toString();
}

/**
 * Calea singura, fara nimic altceva. Pentru parametrii de eveniment care vor
 * doar „pe ce pagina s-a intamplat".
 */
export function doarCalea(brut: string): string {
  try {
    return new URL(brut).pathname;
  } catch {
    return "";
  }
}
