/**
 * Resolve an author-provided link, honouring the store basePath (custom domain
 * vs /{slug}). Store-relative links (starting with "/") get the basePath prefix;
 * absolute/mailto/tel/anchor links are left untouched.
 */
export function resolveHref(href: string | undefined | null, basePath: string): string {
  const h = (href ?? "").trim();
  if (!h) return "#";
  if (h.startsWith("#")) return h;
  // Safe absolute links.
  if (/^(https?:\/\/|mailto:|tel:)/i.test(h)) return h;
  // Store-relative links honour the basePath (custom domain vs /{slug}).
  if (h.startsWith("/")) return `${basePath}${h}`;
  // Anything else that carries a URL scheme (javascript:, data:, vbscript:, file: …)
  // is rejected to prevent stored XSS through author-provided hrefs.
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return "#";
  // Bare relative text (e.g. "contact") -> treat as a store-relative path.
  return `${basePath}/${h}`;
}

export function isExternalHref(href: string | undefined | null): boolean {
  return /^https?:\/\//i.test((href ?? "").trim());
}

/*
  ═══ LINKUL IN CAMPUL EDITORULUI (etapa 25.9-25.10, 11.11.2026) ═══

  Gasite la proba de dinaintea lansarii: un link scris „javascript:...” devenea in magazin „#” FARA niciun cuvant in panou,
  iar linkurile categoriilor (si cele demo) apareau in camp codificate, „/magazin?cat=Termice%20%C8%99i...”. Campul arata
  acum textul citibil si spune pe loc cand un link nu va merge. Ce se SALVEAZA ramane forma codificata, exact ca pana
  acum: drumul dus-intors e fara pierderi (proba in `href.test.ts`).
*/

/** Schema unui link pe care magazinul il refuza (`resolveHref` il face „#”), sau `null` cand linkul e bun. */
export function schemaRefuzata(href: string | undefined | null): string | null {
  const h = (href ?? "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(h)) return null;
  const m = h.match(/^([a-z][a-z0-9+.-]*):/i);
  return m ? `${m[1].toLowerCase()}:` : null;
}

/** Caracterele care raman codificate si in camp: fara ele, adresa s-ar citi altfel („&” ar desparti filtrul in doua). */
const RAMAN_CODIFICATE = new Set(["&", "=", "+", "#", "?", "%", "/"]);

/**
 * Linkul cum se arata in camp: secventele `%XX` decodate, in afara de cele care schimba intelesul adresei
 * (`RAMAN_CODIFICATE`) si de spatiile albe ascunse. Doar pentru adresele magazinului si cele web; `tel:`/`mailto:` raman.
 */
export function linkAfisat(href: string): string {
  if (!/^(\/|https?:)/i.test(href)) return href;
  return href.replace(/(?:%[0-9A-Fa-f]{2})+/g, (secventa) => {
    let text: string;
    try {
      text = decodeURIComponent(secventa);
    } catch {
      return secventa;
    }
    return [...text].map((c) => (RAMAN_CODIFICATE.has(c) || (/\s/.test(c) && c !== " ") ? encodeURIComponent(c) : c)).join("");
  });
}

/** Inversul lui `linkAfisat`, pentru ce scrie omul: spatiile si literele din afara ASCII (diacriticele) se codifica. */
export function linkDeSalvat(text: string): string {
  if (!/^(\/|https?:)/i.test(text)) return text;
  return text.replace(/[ \u{80}-\u{10FFFF}]/gu, (c) => encodeURIComponent(c));
}
