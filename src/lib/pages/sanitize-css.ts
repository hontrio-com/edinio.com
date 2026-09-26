/**
 * Neutralize attempts to break out of a `<style>` element when CSS is injected
 * via dangerouslySetInnerHTML (e.g. `</style><img src=x onerror=alert(1)>`).
 *
 * React does NOT escape dangerouslySetInnerHTML, and on SSR the string is placed
 * literally inside `<style>…</style>`, so a stray `</style>` would terminate the
 * tag and let following markup execute. Stripping the tag-open sequences makes
 * the payload inert (CSS itself cannot run JS in modern browsers). Pure module —
 * safe to import in client components.
 */
export function sanitizeCss(css?: string | null): string {
  if (!css) return "";
  /*
    ⚠⚠ 26.09.2026 (auditul paginilor): lista neagra de dinainte scotea `</style`,
    `<!--` & co. INTR-O SINGURA TRECERE, deci scoaterea uneia le lipea pe cele din jur
    intr-una noua: `</sty<!--le>` devenea `</style>`, iar markupul de dupa rula pe
    originea platformei (cea a panoului). Acum NICIUN `<` nu mai ramane: devine
    escaparea CSS `\3C `, care in textul CSS (`content: "<"`) se afiseaza la fel, dar
    nu mai poate inchide eticheta `<style>`, oricum ar fi despicat.
  */
  return css.replace(/</g, "\\3C ");
}
