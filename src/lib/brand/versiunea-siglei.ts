/*
  ═══════════════════════════════════════════════════════════════════════════
  DE CE PICTOGRAMELE AU O VERSIUNE IN ADRESA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ MASURAT PE 21.09.2026, NU BANUIT. Sigla noua a intrat in productie pe
  20.09. Fisierele de pe server sunt cele noi - `sha1` identic cu cel din
  depozit - dar browserele aratau mai departe pictograma VECHE.

  Raspunsul e chiar in antetul cu care Vercel serveste ce e in `public/`:

      Cache-Control: public, max-age=31536000, immutable

  Un an, si `immutable` inseamna „nici macar nu intreba". Browserul care a
  intrat pe site inainte de 20.09 are pictograma veche in cache si NU o va mai
  cere pana anul viitor. Fisierul e bun, serverul e bun, si totusi omul vede
  sigla veche - inclusiv proprietarul, care a crezut ca rebrandingul n-a ajuns.

  ⚠ CALEA TREBUIE SA SE SCHIMBE, fiindca aia e cheia din cache. Nu se poate
  lupta cu `immutable` altfel: nu exista „reincarca pictograma". De-aia adresa
  poarta `?v=`, iar `v` se schimba cand se schimba sigla.

  ⚠ NU E UN NUMAR DE VERSIUNE AL APLICATIEI. Pus pe fiecare build, ar cere
  browserelor sa descarce din nou toate pictogramele la fiecare desfasurare -
  adica ar arunca tocmai cacheul de un an, care e bun cand sigla NU se schimba.
  Se schimba numai cand se schimba desenul.
*/

/** Ziua in care s-a schimbat sigla. Se muta doar la urmatorul rebranding. */
export const VERSIUNEA_SIGLEI = "2026-09-20";

/**
 * Adresa unei pictograme, cu versiune.
 *
 * ⚠ `favicon.ico` de la RADACINA ramane si el cerut direct de unele browsere,
 * fara sa se uite la `<link>`. Acolo nu se poate face nimic - dar cele care
 * citesc `<link rel="icon">` (adica toate cele moderne) iau adresa de aici si
 * vad sigla noua imediat.
 */
export function cuVersiune(cale: string): string {
  return `${cale}?v=${VERSIUNEA_SIGLEI}`;
}
