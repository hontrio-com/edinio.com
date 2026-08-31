/**
 * Îndreaptă etichetele de ÎNCHIDERE scrise strâmb, înainte de curățare.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DE CE EXISTĂ (31.08.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ ASTA A FOST O GAURĂ ADEVĂRATĂ, NU O PRECAUȚIE. Măsurată pe pachetul
 * instalat, cu opțiunile reale din `sanitizeEmbedHtml`:
 *
 *     intrare:  <style>a{}</style/><img src=x onerror=alert(1)>
 *     ieșire:   <style>a{}</style/><img src=x onerror=alert(1)></style>
 *
 * `onerror` trecea NEATINS. Și la fel `<script>alert(1)</script>`.
 *
 * Cauza e în tokenizatorul lui `htmlparser2`: pentru elementele cu text brut
 * (`style`, `textarea`, `xmp`) o închidere cu bară — `</style/>` — nu e
 * socotită închidere, deci tot ce urmează rămâne „text" și e scos verbatim.
 * Dar BROWSERUL o socotește închidere validă. Deci ce pentru curățător era
 * text nevinovat devine, în pagina cititorului, `<img>` cu manipulator viu.
 *
 * Se vede că e chiar defectul de tokenizare, fiindcă `</style>` scris corect
 * era curățat cum trebuie. Singura deosebire e bara.
 *
 * ⚠ DE CE NU S-A REPARAT PRIN URCAREA PACHETULUI, care ar fi fost calea dreaptă.
 *
 * `sanitize-html` 2.17.6 și 2.17.7 repară defectul la furnizor. Dar 2.17.7 cere
 * `htmlparser2` ^12, iar acela e NUMAI ESM:
 *
 *     htmlparser2 10.1.0 → exports are ramuri separate `import` ȘI `require`
 *     htmlparser2 12.0.0 → exports are doar `default`, iar `main` e ESM
 *
 * `sanitize-html` e în `serverExternalPackages`, deci Next NU îl împachetează,
 * ci îl cere cu `require()` la RULARE, prin `externalRequire`. Pe 30.08.2026 am
 * încercat urcarea și platforma a căzut cu `ERR_REQUIRE_ESM` din chiar acel loc:
 * 56 de erori, 21 de oameni, build verde tot timpul.
 *
 * Deci reparația de aici nu ține locul urcării — o face POSIBILĂ mai târziu,
 * fără să ținem o gaură deschisă între timp.
 *
 * ⚠ CE FACE, EXACT ȘI ATÂT: într-o etichetă de ÎNCHIDERE, aruncă tot ce stă
 * între numele etichetei și `>`, DAR numai când acolo se află o bară.
 * Standardul HTML spune că o etichetă de închidere nu poate purta atribute —
 * ce e scris acolo se aruncă oricum de orice parser. Deci nu se pierde nimic
 * care ar fi însemnat ceva.
 *
 * Îngustimea e dinadins. Un tipar care ar îndrepta TOATE închiderile ar atinge
 * și `<style>a::before{content:"</div bar>"}</style>`, adică ar schimba CSS-ul
 * omului. Cerând bara, atingem numai forma stricată.
 *
 * ⚠ NU POATE NAȘTE MARKUP NOU. Înlocuirea scrie mereu `</nume>` — o închidere
 * bine formată. Nu poate scrie `<`, nu poate face o etichetă de deschidere și
 * nu poate lipi două bucăți într-una.
 *
 * Probele stau în `inchideri-malformate.test.ts` și trec sarcinile prin
 * curățătoarele ADEVĂRATE, nu prin funcția asta singură — altfel ar dovedi doar
 * că un șir s-a schimbat, nu că pagina e curată.
 */
export function indreaptaInchiderile(html: string): string {
  return html.replace(/<\/\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*?)\/\s*>/g, "</$1>");
}
