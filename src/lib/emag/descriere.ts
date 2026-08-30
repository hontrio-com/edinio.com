import sanitizeHtmlLib from "sanitize-html";

/**
 * Descrierea produsului, pregatita pentru eMAG.
 *
 * ═══ ⚠ DE CE NU SE FOLOSESTE `sanitizeHtml` AL CASEI ═══
 *
 * Acela e croit pentru CE ARATA EDINIO: pastreaza `div`, `span`, titluri de la `h1`
 * la `h6` si atributul `style` cu aliniere. Sunt bune pe magazinul nostru, unde
 * exista foaia de stil care le da inteles.
 *
 * eMAG spune despre acelasi camp doar atat: „Can contain basic HTML tags." Nu
 * enumera care. Iar descrierea ajunge pe pagina LOR, cu foaia LOR de stil.
 *
 * Ce iese din nepotrivire nu e o eroare, ci ceva mai rau: `div`-urile si clasele
 * storefrontului nostru ajung acolo fara CSS-ul care le tine, iar descrierea se
 * desface — blocuri lipite, aliniere aiurea, uneori text alb pe alb. Produsul se
 * publica, arata rupt, si nimeni nu leaga forma de o integrare care „a mers".
 *
 * Deci lista de aici e MAI STRAMTA decat a casei, si dinadins: numai marcajele care
 * inseamna acelasi lucru pe orice pagina.
 *
 * ⚠ `style` iese cu totul. E singurul atribut care poate face textul nevazut pe
 * fundalul lor, si nu aduce nimic ce nu se poate spune cu `strong` sau `ul`.
 */

/**
 * Marcajele pastrate.
 *
 * ⚠ Fara `div` si `span`: ele nu inseamna nimic singure, si tot ce purtau la noi era
 * o clasa care nu exista la ei. Fara `h1`: pagina lor are deja un titlu, iar al
 * doilea strica structura. Titlurile din descriere coboara la `h2`–`h4`.
 */
const INGADUITE: string[] = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "sub", "sup",
  "h2", "h3", "h4",
  "ul", "ol", "li", "blockquote", "hr", "table", "thead", "tbody", "tr", "th", "td",
];

/** ⚠ Lungimea maxima din schema lor. Peste, cererea e respinsa intreaga. */
const MAXIM = 16_777_215;

export function descriereaPentruEmag(brut: string | null | undefined): string | undefined {
  if (!brut) return undefined;

  const curat = sanitizeHtmlLib(brut, {
    allowedTags: INGADUITE,
    /* ⚠ NICIUN atribut. Nici `style`, nici `class`, nici `id`. Vezi antetul. */
    allowedAttributes: {},
    disallowedTagsMode: "discard",
    /*
     * `h1` devine `h2`, ca structura paginii lor sa ramana intreaga. Nu se sterge:
     * textul din el e chiar ce vrea comerciantul sa spuna.
     */
    transformTags: { h1: "h2", h5: "h4", h6: "h4" },
  })
    /* Randuri goale lasate in urma de marcajele scoase. */
    .replace(/(?:<p>\s*<\/p>\s*)+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!curat) return undefined;
  /* ⚠ Taiat la limita LOR, nu la una aleasa de noi: peste, cererea cade intreaga si
     odata cu ea tot lotul de pana la 50 de produse. */
  return curat.length > MAXIM ? curat.slice(0, MAXIM) : curat;
}
