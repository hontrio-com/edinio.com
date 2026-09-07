/**
 * Ce se poate citi dintr-o valoare de fisier, si de ce modulul asta e SEPARAT.
 *
 * ═══ ⚠ DE CE UN MODUL PROPRIU, SI NU INCA O FUNCTIE IN `comanda.ts` ═══
 *
 * `comanda.ts` e poarta de SERVER, iar de cand verifica semnatura cheilor importa
 * `fisiere-private.ts`, adica `node:crypto`. Doua componente `"use client"` — vitrina
 * (`CampuriPersonalizare`) si panoul de comenzi (`OrderDetailClient`) — cereau de acolo o
 * singura functie, `sePoateRandaCaImagine`. Asta punea `node:crypto` in graful pachetului de
 * BROWSER al fiecarei pagini de produs: bundlerul nu stie sa rezolve schema `node:` pentru web
 * (harta de polyfill a lui Next e pe numele neprefixat, `crypto`), deci ori cadea chiar build-ul,
 * ori intra degeaba o biblioteca de criptografie in fiecare vitrina.
 *
 * Acelasi tipar ca `r2-url.ts`, despartit de `r2.ts` cu exact aceeasi motivare scrisa acolo:
 * „No AWS SDK or other server-only deps".
 *
 * ⚠ AICI NU INTRA NIMIC DE SERVER. Fara `node:*`, fara `process.env`, fara secrete. Ce se scrie
 * aici ajunge in browserul fiecarui cumparator.
 *
 * ═══ ⚠ SI DE CE CITIREA TERMINATIEI E O SINGURA REGULA ═══
 *
 * Valoarea unui camp de fisier si-a schimbat forma: era o adresa absoluta din depozitul public,
 * acum e o CHEIE semnata (`products/customizations/<magazin>/<uuid>-<semnatura>.<ext>`), fiindca
 * adresa nu mai are voie sa plece nicaieri — vezi `fisiere-private.ts`.
 *
 * Citirea de dinainte trecea prin `new URL(adresa)`, care ARUNCA pentru o cheie. Intorcea deci
 * `null`, si de acolo: poarta comenzii refuza ORICE fisier incarcat („se accepta doar imagini"
 * pe un JPG adevarat), iar amandoua ecranele nu mai desenau nicio miniatura. Tacut, cu tsc curat
 * si cu toate probele verzi — fiindca fiecare proba folosea inca forma veche.
 */

/** Prefixul sub care ruta publica de incarcare scrie fisierele clientilor. */
export const PREFIX_INCARCARI = "products/customizations/";

/** Ce se poate DESENA ca imagine in browser. Vezi `sePoateRandaCaImagine`. */
const DESENABILE = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

/**
 * Terminatia unei valori de fisier, mica — sau `null` cand nu se poate citi.
 *
 * ⚠ CITESTE AMANDOUA FORMELE: cheia noua (fara schema, fara gazda) si adresa intreaga a
 * comenzilor de dinainte. Prima nu e o adresa absoluta, deci `new URL()` arunca pe ea; a doua are
 * si sir de interogare, care nu face parte din nume.
 */
export function terminatia(valoare: string): string | null {
  if (typeof valoare !== "string") return null;

  let cale = valoare;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(valoare)) {
    try {
      cale = new URL(valoare).pathname;
    } catch {
      return null;
    }
  } else {
    /* O cheie n-are sir de interogare, dar o valoare stramba poate purta unul. */
    cale = valoare.split("?")[0].split("#")[0];
  }

  /* ⚠ Ultima bucata, nu ultimul punct: un dosar cu punct in nume ar fi dat o terminatie falsa. */
  const ultima = cale.slice(cale.lastIndexOf("/") + 1);
  const punct = ultima.lastIndexOf(".");
  if (punct === -1) return null;

  const ext = ultima.slice(punct + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : null;
}

/**
 * Se poate desena valoarea asta ca IMAGINE, in browser si in panou?
 *
 * ═══ ⚠ DE CE NU E ACELASI LUCRU CU „E O IMAGINE" ═══
 *
 * `heic` si `heif` sunt imagini adevarate, trec de verificarea pe octeti, si au voie intr-un
 * camp de tip `image` — vezi `TERMINATII` din `comanda.ts`. Dar nu se pot DESENA: Chrome, Firefox
 * si Edge n-au decodor HEIC, iar `/api/img` nu le primeste dinadins, ca octetii HEIF trimisi de un
 * anonim sa nu ajunga la libheif (vezi `securitate-audit.test.ts`).
 *
 * Deci un client care incarca poza de pe iPhone vedea un patrat rupt in locul in care tocmai
 * pusese poza — fara niciun mesaj, fiindca nu era nicio eroare. Sterge, incarca iar, acelasi
 * patrat. Iar in panoul comerciantului se rupea in ORICE browser, Safari inclusiv: `/api/img`
 * raspunde 404 pe `.heic`, masurat. Adica pe hartia dupa care se produce marfa.
 *
 * ⚠ Raspunsul e o singura regula, folosita de amandoua ecranele: unde nu se poate desena, se
 * arata numele si o legatura — chiar tiparul scris pentru documente. Doua reguli s-ar fi departat,
 * si atunci un ecran ar fi aratat poza si celalalt un patrat.
 *
 * ⚠ SI NU SE REPARA „EVIDENT": nu se adauga `.heic` in `KEY_RE` din `/api/img` si nu se
 * pune conversie cu `sharp` pe server. Amandoua ar duce octeti straini la libheif, adica ar
 * redeschide o usa inchisa cu bilet. Daca se vrea vreodata HEIC vizibil, conversia se face IN
 * BROWSER.
 */
export function sePoateRandaCaImagine(valoare: string): boolean {
  const t = terminatia(valoare);
  return t !== null && DESENABILE.includes(t);
}

/**
 * Numele sub care se arata un fisier incarcat de client.
 *
 * ⚠ O SINGURA COPIE, pentru amandoua ecranele. Erau doua, scrise la fel, si s-au departat: pe
 * forma noua una cadea pe „Fisierul N" si cealalta scria 65 de caractere de hexazecimal.
 *
 * ⚠ CHEIA NU POARTA NUMELE OMULUI. Ea e `<uuid>-<semnatura>.<ext>`, fiindca numele trimis de
 * browser nu se scrie niciodata pe disc — vezi ruta de incarcare. Deci ce se poate arata cinstit
 * e pozitia si felul: „Fisierul 2.pdf". Cine are numele adevarat la indemana (vitrina, care
 * tocmai a primit fisierul din mana omului) il trece prin `nume`.
 */
export function numeleFisierului(valoare: string, i: number, nume?: string): string {
  if (nume && nume.trim() !== "") return nume.trim();

  /*
   * ⚠ COMENZILE VECHI PASTREAZA CE ARATAU. Ele poarta adresa intreaga, iar panoul scria de acolo
   * ultima bucata a caii. Sarita, fiecare fisier al lor ar fi devenit „Fisierul N" peste noapte —
   * o schimbare in rau pe randuri pe care nimeni nu le-a atins.
   */
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(valoare)) {
    try {
      const cale = new URL(valoare).pathname;
      const ultima = decodeURIComponent(cale.slice(cale.lastIndexOf("/") + 1));
      if (ultima) return ultima;
    } catch { /* o adresa stramba cade mai jos, pe numele dupa pozitie */ }
  }

  const ext = terminatia(valoare);
  if (ext) return `Fisierul ${i + 1}.${ext}`;
  return `Fisierul ${i + 1}`;
}
