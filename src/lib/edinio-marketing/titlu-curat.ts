/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE A TASTAT OMUL NU SE INTOARCE PRIN TITLU
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ CUM A IESIT LA IVEALA. `curataAdresa` taie din `page_location` orice parametru
  care nu e pe lista alba, deci ce cauta cineva pe blog nu ajunge in GA4 pe acolo.
  Numai ca pagina de cautare isi pune in titlu chiar ce s-a cautat
  (`Căutare: <text>`), iar `page_view` trimite `document.title` ca `page_title`.

  Deci textul scapa pe usa din dos. Si nu doar el: ORICE pagina care isi pune in
  titlu o valoare din adresa scurge acea valoare, azi sau maine.

  ⚠ SI E SI O CHESTIUNE DE ROBUSTETE, nu doar de confidentialitate. `page_title`
  nu e anuntat ca text liber, deci paza anti-PII il opreste peste 100 de
  caractere — iar cand ea opreste, se pierde evenimentul pentru TOTI furnizorii.
  O cautare lunga ar fi omorat `page_view`-ul intreg. Acelasi tipar ca la adresele
  de reclama, reparat in aceeasi zi.

  ⚠ REGULA E GENERALA, DINADINS. Nu „scoate prefixul «Căutare:»" — aia s-ar strica
  la prima pagina noua care pune altceva in titlu. Regula e: ce a venit prin
  adresa nu are voie sa iasa prin titlu. Ea se tine singura la zi.
*/

/** Cat de scurt trebuie sa fie ca sa nu fie oprit de paza. */
export const LUNGIME_MAXIMA = 100;

/**
 * Cea mai scurta bucata cautata. Sub atat, potrivirile sunt intamplatoare
 * (`a`, `de`) si ar ciopirti titluri curate degeaba.
 */
const MINIM_CAUTAT = 3;

/**
 * Scoate din titlu valorile venite prin adresa, si il scurteaza.
 *
 * @param titlu   `document.title`
 * @param cautare `location.search`, cu tot cu `?`
 */
export function curataTitlu(titlu: string, cautare: string): string {
  let t = titlu.trim();
  if (!t) return "";

  let parametri: URLSearchParams;
  try {
    parametri = new URLSearchParams(cautare);
  } catch {
    /* O adresa stricata nu e motiv sa pierdem titlul; se scurteaza si atat. */
    return scurteaza(t);
  }

  for (const valoare of parametri.values()) {
    const v = valoare.trim();
    if (v.length < MINIM_CAUTAT) continue;
    /*
      ⚠ FARA REGEX, DINADINS. Textul vine de la om si poate purta `.`, `*`, `(`.
      Construit intr-un regex, ar fi aruncat sau ar fi potrivit altceva decat
      trebuie. `split`/`join` face inlocuirea literal, si nu poate gresi.
    */
    if (t.includes(v)) t = t.split(v).join("…");
  }

  return scurteaza(t.replace(/\s+/g, " ").trim());
}

function scurteaza(t: string): string {
  return t.length <= LUNGIME_MAXIMA ? t : `${t.slice(0, LUNGIME_MAXIMA - 1).trimEnd()}…`;
}
