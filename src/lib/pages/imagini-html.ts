import { imaginePagina } from "@/lib/cdn-image";

/**
 * Pozele din HTML-ul blocului de cod (cel afisat in pagina, nu in cadrul izolat) trec prin
 * optimizator.
 *
 * ═══ ⚠ DE CE (09.10.2026) ═══
 *
 * Blocul de cod scrie `<img src="https://edinio-cdn.com/products/…">`, adica ORIGINALUL: pe pagina
 * „Cum alegi prosoapele pentru hotel” (caian-textile) erau poze de 250-410 KB, aratate la cateva
 * sute de pixeli, pe telefon la fel ca pe desktop. Aici `src`-ul devine varianta de 1536 de pe
 * scara: nu se vede nicio diferenta, iar fisierul e de cateva ori mai mic. (Textul bogat nu lasa
 * deloc `<img>`, deci acolo n-are ce rescrie.) Un GIF ramane originalul, vezi `imaginePagina`.
 *
 * ⚠ SE RULEAZA DUPA CURATARE (`prepare-blocks`), pe HTML-ul deja igienizat, si ATINGE DOAR
 * VALOAREA lui `src`: o rescrie numai cand e o adresa a depozitului nostru, scrisa doar din
 * caractere de adresa, iar ce pune in loc e tot o adresa din caractere sigure. Deci nu poate
 * deschide un atribut, nu poate lipi doua bucati de marcaj si nu poate schimba ce a hotarat
 * curatarea.
 *
 * ⚠ `srcset`, `data-src` si celelalte raman neatinse: tiparul cere `src=` precedat de un spatiu,
 * imediat dupa un `<img`.
 */

/** O valoare de `src` pe care o rescriem: doar caractere de adresa, fara entitati sau ghilimele. */
const VALOARE_SIGURA = /^https:\/\/[\w.-]+\/[\w./-]+$/;

/** Latimea variantei puse in HTML: continutul unei pagini nu trece de ~1150 px, deci 1536 acopera si ecranele dense. */
export const LATIME_IMAGINE_HTML = 1536;

export function optimizeazaImaginiHtml(html: string): string {
  if (!html || !html.includes("<img")) return html;
  return html.replace(/(<img\b[^>]*?\ssrc=")([^"<>]*)(")/gi, (tot, inainte: string, valoare: string, dupa: string) => {
    if (!VALOARE_SIGURA.test(valoare)) return tot;
    const noua = imaginePagina(valoare, LATIME_IMAGINE_HTML);
    if (noua === valoare) return tot;
    return `${inainte}${noua.replace(/&/g, "&amp;")}${dupa}`;
  });
}
