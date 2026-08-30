import sanitizeHtmlLib from "sanitize-html";

/*
  ⚠ FĂRĂ `import "server-only"` AICI, DINADINS.

  Pachetul nu e o dependință instalată — îl rezolvă Next la build. Merge în
  aplicație, dar face fișierul de necitit pentru rularea probelor cu node, iar
  bucata asta chiar are probe (`curata.test.ts`), fiindcă ține două hotărâri de
  securitate și de SEO care se pot pierde tăcut.

  Paza nu lipsește, doar vine din altă parte: `sanitize-html` e în
  `serverExternalPackages` din `next.config.ts`, deci un component de client
  care ar importa fișierul ăsta ar pica la build, zgomotos.
*/

/**
 * Curățarea HTML-ului unui articol de blog.
 *
 * ═══ DE CE NU `lib/utils/sanitize-html.ts` ═══
 *
 * Acela e croit pentru text scris de COMERCIANȚI — descrieri de produs,
 * politici, blocuri de pagină. Acolo autorul e necunoscut și posibil ostil, iar
 * două dintre alegerile lui sunt exact bune: nicio imagine, și `nofollow` pe
 * fiecare legătură. Blogul e scris din panoul de Admin al platformei, de noi.
 *
 * ⚠ 1. `nofollow` PE LEGĂTURILE INTERNE ANULEAZĂ MOTIVUL BLOGULUI.
 *
 * Un blog aduce vizitatori pe articole și îi trimite mai departe către paginile
 * care vând — prețuri, comparații, industrii. Legăturile alea sunt jumătate din
 * folos, iar `nofollow` le spune motoarelor să nu le urmeze. Aici, o legătură
 * internă rămâne curată; una către alt site primește `nofollow`, fiindcă nu
 * răspundem de unde duce.
 *
 * ⚠ 2. FĂRĂ `img`, UN ARTICOL N-ARE POZE.
 *
 * Se acceptă, dar numai de la gazdele noastre. O imagine de pe alt domeniu
 * pusă într-un articol e un pixel de urmărire cu alt nume: încarcă adresa IP a
 * fiecărui cititor la cine o servește, fără ca cineva să fi cerut asta.
 *
 * `id` NU e îngăduit nici aici: ancorele de cuprins se pun DUPĂ curățare, din
 * `cuprins.ts`, cu valori făcute de noi. Îngăduit, ar fi lăsat un autor să
 * scrie un id care se ciocnește cu ceva din pagină.
 */

/** Gazdele de la care se acceptă imagini. R2 direct, sau CDN-ul din fața lui. */
function gazdaNoastra(src: string): boolean {
  if (src.startsWith("/")) return true; // din `public/`, deci al nostru
  try {
    const u = new URL(src);
    if (u.protocol !== "https:") return false;
    const cdn = process.env.NEXT_PUBLIC_CDN_URL;
    if (cdn && src.startsWith(cdn.replace(/\/+$/, "") + "/")) return true;
    return u.hostname.endsWith(".r2.dev") || u.hostname.endsWith(".edinio.com");
  } catch {
    return false;
  }
}

/** Legătura duce în afara site-ului nostru? */
export function esteInAfara(href: string): boolean {
  if (href.startsWith("/") || href.startsWith("#")) return false;
  try {
    const u = new URL(href);
    if (u.protocol === "mailto:" || u.protocol === "tel:") return false;
    return !u.hostname.endsWith("edinio.com");
  } catch {
    return false;
  }
}

export function curataArticol(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtmlLib(html, {
    allowedTags: [
      "p", "br", "span", "div",
      "strong", "b", "em", "i", "u", "s", "strike", "del", "mark", "sub", "sup",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "code", "pre", "hr",
      "a", "img", "figure", "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading", "decoding"],
      "*": ["style"],
    },
    allowedStyles: {
      "*": { "text-align": [/^(left|right|center|justify)$/] },
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { a: ["http", "https", "mailto", "tel"], img: ["https"] },
    disallowedTagsMode: "discard",
    transformTags: {
      a: (numeEticheta, atribute) => {
        const href = atribute.href ?? "";
        const inAfara = esteInAfara(href);
        return {
          tagName: numeEticheta,
          attribs: {
            ...atribute,
            /* În afară: se deschide în filă nouă, cu `noopener` (altfel pagina
               țintă poate rescrie fila noastră) și cu `nofollow`. Înăuntru:
               nimic, ca legătura să conteze. */
            ...(inAfara
              ? { target: "_blank", rel: "noopener noreferrer nofollow" }
              : {}),
          },
        };
      },
      img: (numeEticheta, atribute) => {
        const src = atribute.src ?? "";
        /* O imagine de pe altă gazdă se aruncă, nu se lasă stricată: `src` gol
           ar fi lăsat în pagină un cadru gol pe care nimeni nu-l observă. */
        if (!gazdaNoastra(src)) return { tagName: "span", attribs: {}, text: "" };
        return {
          tagName: numeEticheta,
          attribs: {
            ...atribute,
            /* Pozele din corpul articolului sunt aproape întotdeauna sub prima
               fereastră. Amânate, nu mai concurează cu coperta pentru LCP. */
            loading: "lazy",
            decoding: "async",
          },
        };
      },
    },
  });
}
