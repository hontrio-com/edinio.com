import { FETE_ROMANESTI, type FataRomaneasca } from "@/lib/fonturi-ro";

/*
  ═══════════════════════════════════════════════════════════════════════════
  LITERELE ROMANESTI, DINTR-UN FISIER MIC                             (19.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  `next/font/google` imparte fiecare font pe subseturi, iar ă, ș, ț stau in „latin-ext”, langa sute de litere ale altor
  limbi. O pagina romaneasca descarca deci, pe fiecare familie folosita, tot fisierul latin-ext (15-85 KB) pentru cateva
  litere. Masurat la auditul temelor, pe tema Jupiter: 106 KB din 211 KB de fonturi.

  Fetele de aici arata spre fisiere de 1-6 KB, taiate din chiar acele fisiere (`scripts/fonturi-ro.py`), cu acelasi
  desen, aceleasi latimi si aceleasi axe variabile. Poarta ACELASI nume de familie ca fetele `next/font` si un
  `unicode-range` doar cu literele romanesti (si dublul accent unguresc).

  ⚠ DE CE MERGE: la intervale suprapuse, browserul ia ULTIMA fata declarata a familiei (CSS Fonts, „font matching”).
  De aceea fetele astea se pun intr-un `<style>` din corpul paginii (`FeteRomanesti`), dupa toate foile din `<head>`:
  ordinea din document nu depinde de felul in care isi asaza Next bucatile de CSS. Latin-ext ramane declarat: o pagina
  cu „ł” sau „č” il descarca in continuare, ca pana acum.

  ⚠ CAND NU MAI MERGE, NU SE STRICA NIMIC: daca numele familiei s-ar schimba (un `next/font` care le-ar scrie altfel),
  fetele de aici n-ar mai apartine nimanui, iar literele ar veni din nou din latin-ext. Se pierde castigul, nu textul.
*/

/** De unde se servesc fisierele (`public/fonturi-ro/`). */
export const CALE_FONTURI_RO = "/fonturi-ro/";

function fata(f: FataRomaneasca): string {
  return `@font-face{font-family:"${f.familie}";font-style:${f.stil};font-weight:${f.greutate};font-display:swap;`
    + `src:url(${CALE_FONTURI_RO}${f.fisier})format("woff2");unicode-range:${f.interval}}`;
}

/** CSS-ul fetelor romanesti: al familiilor date, sau al tuturor cand lista lipseste. */
export function cssFeteRomanesti(familii?: Iterable<string>): string {
  const alese = familii ? new Set(familii) : null;
  return FETE_ROMANESTI.filter((f) => !alese || alese.has(f.familie)).map(fata).join("");
}
