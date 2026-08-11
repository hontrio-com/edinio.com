import { SITE_URL } from "./metadata";

/**
 * Firimiturile („breadcrumbs") paginilor de prezentare.
 *
 * Fișierul ăsta ține DOAR regula, fără desen: e `.ts`, nu `.tsx`, ca probele să
 * poată rula pe Node — care dezbracă tipurile, dar nu știe JSX. Aceeași
 * împărțire ca la `cuprins.ts`.
 *
 * ═══ ACELAȘI ȘIR MERGE ȘI PE ECRAN, ȘI CĂTRE GOOGLE ═══
 *
 * `PageHero` desenează firimiturile ȘI trimite blocul `BreadcrumbList` din
 * ACEEAȘI listă. Nu se pot despărți, și asta e intenționat: aceeași lecție ca
 * la `intrebariStructurate()` din `faq.ts`, unde întrebările erau scrise de
 * mână a doua oară pentru Google și ar fi rămas în urmă la prima corectură.
 * Google cere explicit ca datele structurate să corespundă cu ce se vede.
 *
 * ═══ ULTIMA FIRIMITURĂ NU E LINK ═══
 *
 * E pagina pe care ești deja. Un link către locul în care te afli nu duce
 * nicăieri și, pentru cititoarele de ecran, adaugă o țintă în plus fără rost.
 * Ea primește `aria-current="page"`, iar în datele structurate rămâne fără
 * `item` — forma pe care Google o acceptă pentru ultimul element.
 */

export interface Firimitura {
  label: string;
  /**
   * Calea, cu slash la început (ex. `/industrii`). Se omite DOAR la ultima
   * firimitură, care e pagina curentă.
   *
   * ⚠ O firimitură din mijloc fără `href` strică blocul `BreadcrumbList`:
   * Google cere `item` pentru tot ce nu e ultimul. Vezi `verificaFirimituri`.
   */
  href?: string;
}

/** Prima firimitură, aceeași peste tot. */
export const ACASA: Firimitura = { label: "Acasă", href: "/" };

/**
 * Ce e greșit în șirul ăsta, dacă e ceva. Întoarce `null` când e în regulă.
 *
 * Nu aruncă: o pagină de prezentare n-are voie să cadă din cauza unei
 * firimituri. Proba din `breadcrumbs.test.ts` e cea care oprește greșeala
 * înainte să ajungă în producție.
 */
export function verificaFirimituri(sir: Firimitura[]): string | null {
  if (sir.length === 0) return "șir gol";

  for (let i = 0; i < sir.length - 1; i++) {
    if (!sir[i].href) {
      return `firimitura „${sir[i].label}" (poziția ${i + 1}) n-are href, dar nu e ultima`;
    }
  }
  if (sir.some((f) => !f.label.trim())) return "o firimitură are eticheta goală";

  return null;
}

/**
 * Blocul `BreadcrumbList` pentru datele structurate, construit din același șir.
 *
 * Adresele sunt ABSOLUTE și pe `www`, ca peste tot: `SITE_URL` e forma
 * canonică, iar proxy-ul mută 301 de la vârf spre www. O cale relativă aici ar
 * fi ignorată de Google.
 */
export function firimituriStructurate(sir: Firimitura[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: sir.map((f, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: f.label,
      /* Ultima (pagina curentă) rămâne fără `item`. `...(x ? {k:v} : {})` și nu
         `item: undefined`, fiindcă `JSON.stringify` păstrează cheia doar dacă
         valoarea există — iar o cheie `item: null` ar fi o eroare de validare. */
      ...(f.href ? { item: `${SITE_URL}${f.href === "/" ? "" : f.href}` } : {}),
    })),
  };
}

/**
 * Blocul de mai sus, gata de pus într-un `<script type="application/ld+json">`.
 *
 * ⚠ `<` se scrie escapat. Datele de aici sunt scrise de noi, deci nu e o gaură
 * azi, dar un `</script>` nimerit într-o etichetă ar închide blocul mai devreme
 * și ar arunca restul în pagină ca HTML. Costă un `replace` și scapă de o
 * întrebare la fiecare recitire.
 */
export function firimituriJsonLd(sir: Firimitura[]): string {
  return JSON.stringify(firimituriStructurate(sir)).replace(/</g, "\\u003c");
}
