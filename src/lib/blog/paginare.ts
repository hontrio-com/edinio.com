/**
 * Regulile de paginare ale blogului: ce pagină a fost cerută, și dacă ea există.
 *
 * ═══ ⚠ DE CE NU MAI STAU ÎN `components/website/blog/Paginare.tsx` (04.09.2026) ═══
 *
 * Fiindcă acolo NU PUTEAU FI PROBATE. Harnessul de probe încarcă `.ts`, nu
 * `.tsx` („Unknown file extension .tsx", măsurat), deci proba lor citea REGULA
 * DIN SURSĂ ca text: cerea ca în corpul funcției să apară șirurile `pagina <= 1`,
 * `total === 0` și `pagina > pagini`.
 *
 * O probă care cere ca un șir să EXISTE nu spune nimic despre ce face codul.
 * Măsurat pe 04.09.2026: schimbând `if (pagina <= 1) return false;` în
 * `return true;`, toate cele 6 probe rămâneau verzi — inclusiv cea al cărei
 * mesaj scrie „prima pagină nu mai e scutită" — iar `/blog`, `/blog/categorie/…`,
 * `/blog/autor/…`, `/blog/eticheta/…` și căutarea ar fi răspuns 404 pe PRIMA
 * pagină. Adică tot blogul. Trecea și `||` schimbat în `&&`, și chiar un corp
 * nevalid sintactic — proba citea fișierul, nu-l executa.
 *
 * Mutate aici, se cheamă în probă și se măsoară ce fac.
 *
 * `Paginare.tsx` le re-exportă, deci paginile care le importau de acolo nu se
 * schimbă.
 */

/**
 * Numărul de pagină dintr-un `?p=`, curățat de ce nu e număr.
 *
 * ⚠ STRICT, NU ÎNGĂDUITOR. `Number.parseInt("2abc")` întoarce `2`, deci
 * `/blog?p=2abc` răspundea 200 cu conținutul paginii 2 — aceeași listă la două
 * adrese, adică exact ce nu vrem să vadă un motor de căutare. Acum orice altceva
 * decât cifre curate înseamnă pagina 1.
 */
export function paginaCeruta(v: string | string[] | undefined): number {
  const brut = Array.isArray(v) ? v[0] : v;
  if (brut === undefined || brut === null || brut === "") return 1;
  if (!/^\d+$/.test(brut.trim())) return 1;
  const n = Number.parseInt(brut, 10);
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

/**
 * A cerut cineva o pagină care nu există?
 *
 * ⚠ `?p=999999` RĂSPUNDEA 200, cu o listă goală. Pentru un cititor e derutant;
 * pentru un motor de căutare e o pagină subțire cu adresă proprie și canonică
 * proprie, iar cine vrea poate produce o mie ca ea dintr-o buclă.
 *
 * Pagina 1 rămâne mereu bună, chiar și fără articole: acolo e capul listei, cu
 * explicația pentru un blog gol.
 */
export function paginaNuExista(pagina: number, total: number, pagini: number): boolean {
  if (pagina <= 1) return false;
  return total === 0 || pagina > pagini;
}
