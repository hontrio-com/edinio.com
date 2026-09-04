import sanitizeHtmlLib from "sanitize-html";

import { indreaptaInchiderile } from "@/lib/utils/inchideri-malformate";
import { adresaAbsoluta, adresaRezolvata, eCaleInterna, esteEdinio } from "./adresa-scrisa";

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

/**
 * Gazdele de la care se acceptă imagini, scrise pe nume.
 *
 * ⚠ AICI A FOST `hostname.endsWith(".r2.dev")`, ȘI ERA O UȘĂ DESCHISĂ.
 * `r2.dev` e domeniul public pe care Cloudflare îl dă ORICĂREI găleți, a
 * oricui. Regula aceea nu spunea „imaginile noastre", spunea „imaginile oricui
 * are cont de Cloudflare" — deci cine putea pune HTML într-un articol putea lăsa
 * în pagină un pixel de urmărire găzduit de el, care ne raporta cititorii.
 *
 * ⚠ DACĂ MEDIUL N-ARE `R2_PUBLIC_URL`, NU SE ACCEPTĂ NICIO GAZDĂ EXTERNĂ, și e
 * dinadins: un articol cu imagini lipsă se vede din prima privire, o gaură prin
 * care intră conținut străin nu se vede niciodată. `curata` rulează numai pe
 * server (vezi `blog/[slug]/page.tsx`), deci variabila fără `NEXT_PUBLIC_` chiar
 * ajunge aici.
 */
function gazdaDin(adresa: string | undefined): string | null {
  if (!adresa) return null;
  try {
    return new URL(adresa).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/*
  ⚠ SE CITEȘTE LA FIECARE FOLOSIRE, NU O DATĂ LA ÎNCĂRCAREA MODULULUI.

  O constantă de modul ar fi fost cu un pic mai iute și ar fi avut două neajunsuri
  adevărate: valoarea s-ar fi copt la import — deci orice mediu care pune
  variabilele mai târziu ar fi rămas cu o listă goală, tăcut — și n-ar fi putut fi
  probată deloc, fiindcă `import` se ridică deasupra oricărei linii care ar seta
  mediul.

  Prețul e două `new URL` pe imagine, adică nimic pe lângă curățarea HTML-ului.
*/
function gazdeleNoastre(): ReadonlySet<string> {
  return new Set(
    [gazdaDin(process.env.R2_PUBLIC_URL), gazdaDin(process.env.NEXT_PUBLIC_CDN_URL)].filter(
      (g): g is string => !!g,
    ),
  );
}

/**
 * R2 direct, CDN-ul din fața lui, sau chiar `public/`-ul nostru.
 *
 * ⚠ REGULA STĂ ÎN `adresa-scrisa.ts`, ÎNTR-UN SINGUR LOC. Aceeași întrebare era
 * răspunsă în trei porți ale blogului (curățător, imagini de copertă, îndemn) cu
 * trei copii ale ei, și toate trei numărau barele de la început. Acolo scrie de
 * ce nu se mai numără și ce ieșea din asta.
 *
 * ⚠ AICI SE CERE MAI MULT DECÂT LA O LEGĂTURĂ, și deosebirea e voită. La o
 * legătură întrebarea e „unde duce"; la o imagine pe care o SERVIM întrebarea e
 * „e a noastră, fără îndoială". De aceea calea trebuie să înceapă cu `/`, iar o
 * adresă întreagă trebuie să-și declare singură schema — altfel `poza.png`, sau
 * chiar șirul GOL, ar cădea pe gazda noastră la rezolvare și ar lăsa în articol
 * un cadru gol, exact ce ramura de mai jos aruncă dinadins.
 */
function gazdaNoastra(src: string): boolean {
  if (eCaleInterna(src)) return true;
  const u = adresaAbsoluta(src);
  /* `data:`, `blob:`, `http:` — niciuna nu e o imagine servită de noi. */
  if (!u || u.protocol !== "https:") return false;
  return esteEdinio(u.hostname) || gazdeleNoastre().has(u.hostname.toLowerCase());
}

/**
 * Legătura duce în afara site-ului nostru?
 *
 * ⚠ AICI SE REZOLVĂ, NU SE CERE BARĂ LA ÎNCEPUT. Întrebarea e „unde ajunge
 * cititorul dacă apasă", iar răspunsul e chiar cel al browserului: `/\gazdă` și
 * `//gazdă` ajung în altă parte, `poza.png` și `#ancoră` rămân la noi.
 */
export function esteInAfara(href: string): boolean {
  const u = adresaRezolvata(href);
  /* Nu e adresă deloc: n-are unde duce, deci nu duce în afară. */
  if (!u) return false;
  /* Scrisă către o persoană, nu către un site: nu e „în afară" în sensul SEO. */
  if (u.protocol === "mailto:" || u.protocol === "tel:") return false;
  return !esteEdinio(u.hostname);
}

/**
 * Semnalele pe care redactorul le poate cere pe o legătură din afară.
 *
 * ═══ ⚠ DE CE NU MAI E `nofollow` PE TOT (04.09.2026) ═══
 *
 * Curățătorul punea `rel="noopener noreferrer nofollow"` pe ORICE legătură din
 * afară și ștergea ce scrisese redactorul — inclusiv un `rel="sponsored"` pus
 * anume. Nota de atunci spunea „nu răspundem de unde duce", raționament de
 * conținut generat de utilizatori. Blogul ăsta nu e așa: se scrie doar din
 * panou, de noi.
 *
 * `nofollow` pe tot înseamnă că o trimitere editorială către o sursă (un ghid
 * oficial, documentația unui partener) nu spune nimic, iar Google nu mai are de
 * unde ști ce citate stau la baza textului. Semnalele lui au înțelesuri
 * diferite, iar noi le putem spune corect:
 *
 *   - editorial (implicit) — `noopener noreferrer`, legătura contează;
 *   - `sponsored` — reclamă, parteneriat plătit;
 *   - `ugc` — conținut scris de altcineva (comentarii, citate);
 *   - `nofollow` — „nu garantez pentru asta", când e chiar așa.
 *
 * `noopener` rămâne NEGOCIABIL: fără el, pagina-țintă poate rescrie fila
 * noastră. `noreferrer` rămâne și el, ca alegere de intimitate.
 */
const REL_INGADUITE = new Set(["sponsored", "ugc", "nofollow"]);

/** `rel`-ul final al unei legături din afară: baza plus ce a cerut redactorul. */
export function relPentruExtern(relScris: string | undefined): string {
  const cerute = (relScris ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => REL_INGADUITE.has(t));
  /* Ordine stabilă și fără dubluri, ca ieșirea să nu depindă de cum a scris omul. */
  return ["noopener", "noreferrer", ...[...REL_INGADUITE].filter((t) => cerute.includes(t))].join(" ");
}

export function curataArticol(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtmlLib(indreaptaInchiderile(html), {
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
      /*
        ⚠ `h1` DIN CORP COBOARA LA `h2`.

        Doua motive, si al doilea e cel care musca. Intai: titlul paginii e deja
        un `h1`, pus de `PageHero`. Doi `h1` intr-o pagina spun cititoarelor de
        ecran si motoarelor ca pagina are doua subiecte.

        Al doilea: cuprinsul citeste DOAR `h2` si `h3`. Bara editorului are un
        buton „Titlu mare" care punea `h1`, deci autorul care isi structura
        firesc articolul cu el ramanea fara cuprins — fara niciun semn, si fara
        nicio diferenta vizibila in pagina, fiindca `.blog-articol` nici nu
        imbraca `h1`. Coborat aici, butonul face ce pare ca face.
      */
      h1: (_numeEticheta, atribute) => ({ tagName: "h2", attribs: atribute }),
      a: (numeEticheta, atribute) => {
        const href = atribute.href ?? "";
        /* `target` si `rel` se recompun mai jos; ce a scris editorul nu trece. */
        const restul = { ...atribute };
        delete restul.target;
        delete restul.rel;
        return {
          tagName: numeEticheta,
          attribs: esteInAfara(href)
            /* În afară: filă nouă, `noopener noreferrer` și, dacă redactorul a
               marcat legătura, `sponsored`/`ugc`/`nofollow`. */
            ? { ...restul, target: "_blank", rel: relPentruExtern(atribute.rel) }
            /* Înăuntru: `target` și `rel` se ȘTERG, ca legătura să conteze. */
            : restul,
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
