/**
 * Siglele partenerilor (curieri, case de facturare, marketplace-uri), asa cum se arata in panou.
 *
 * ⚠ Modul PUR: fara importuri, citit si de server, si de browser, si de probe.
 */

export interface Sigla {
  cheie: string;
  nume: string;
  /** Calea fisierului din `public/integrations/`. */
  logo: string;
  /** Siglele desenate in alb (Oblio, Facturis): inversate, ca sa se vada pe buton alb. */
  inversat?: boolean;
}

/**
 * Siglele grele au o varianta MICA in `public/integrations/mici/` (WebP, cel mult 260 x 84 px),
 * facuta din fisierul mare. In panou o sigla se vede la cel mult 112 x 38 px, iar fisierele mari
 * sunt gandite pentru paginile de integrare: `cargus.svg` are 215 KB (un PNG impachetat intr-un
 * SVG), `emag.webp` are 3840 px latime. Cu toti curierii porniti, siglele coborau 444 KB;
 * variantele mici, 77 KB.
 *
 * ⚠ O sigla noua nu trebuie trecuta aici: fara rand, se foloseste fisierul ei, ca pana acum.
 * ⚠ Fiecare nume de aici are un fisier in `public/integrations/mici/`; proba de alaturi o cere.
 */
export const SIGLE_MICI: ReadonlySet<string> = new Set([
  "aboutyou", "cargus", "curiera", "easybill", "easysales", "emag", "facturis", "oblio", "packeta", "sameday", "smartbill",
  "smartship", "woot",
]);

/** Adresa siglei de folosit in panou: varianta mica, daca exista; altfel fisierul ei. */
export function siglaMica(logo: string): string {
  const nume = logo.match(/^\/integrations\/([^/.]+)\.[a-z]+$/)?.[1];
  return nume && SIGLE_MICI.has(nume) ? `/integrations/mici/${nume}.webp` : logo;
}
