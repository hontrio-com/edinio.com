/**
 * Ce numere de pagină se arată într-o bară de paginare.
 *
 * ═══ ⚠ DE CE STĂ AICI, ȘI NU LÂNGĂ COMPONENTĂ ═══
 *
 * Regulile de fereastră cu „…" se strică la MARGINI: prima pagină, ultima, liste
 * scurte. Acolo greșeala arată ca un buton lipsă, nu ca o eroare, deci trebuie probată.
 * Iar probele casei rulează pe `.ts`, nu pe `.tsx` (vezi `npm test`), așa că o funcție
 * pură închisă într-o componentă e o funcție care nu se probează niciodată.
 *
 * De ce a fost nevoie de bară: ecranul de oferte eMAG arată 50 pe pagină, iar după
 * importul din contul unui comerciant erau 3.754 de oferte. Adică 76 de pagini, cu
 * „înainte" ca singură cale către pagina 60.
 */

/**
 * Prima pagină, ultima, și o fereastră în jurul celei curente. Restul se strâng în „…".
 *
 * Toate cele 76 de numere pe un rând ar fi un zid pe care nu-l citește nimeni; doar
 * „înainte/înapoi" e o plimbare. Fereastra dă și lucrul care lipsea cu totul: unde ești.
 */
export function numereDeAratat(pagina: number, pagini: number): (number | "…")[] {
  if (pagini <= 7) return Array.from({ length: Math.max(0, pagini) }, (_, i) => i + 1);

  const iesire: (number | "…")[] = [1];
  const de = Math.max(2, pagina - 1);
  const pana = Math.min(pagini - 1, pagina + 1);

  if (de > 2) iesire.push("…");
  for (let i = de; i <= pana; i++) iesire.push(i);
  if (pana < pagini - 1) iesire.push("…");

  iesire.push(pagini);
  return iesire;
}

/**
 * Fereastra de rânduri a unei pagini, STRÂNSĂ la câte pagini există cu adevărat.
 *
 * ⚠ CERUTĂ DE UN DEFECT CARE SE APRINDEA CU BAZA SĂNĂTOASĂ (31.08.2026).
 *
 * `listeazaAbonati` lua `?p=` din adresă și cerea direct
 * `range(de_la, de_la + 49)`, fără să știe câte rânduri există. Când `de_la`
 * trece de numărul de rânduri, PostgREST răspunde **416** cu `PGRST103`, iar
 * `postgrest-js` citește `count` DOAR când răspunsul e bun — deci aruncă exact
 * numărul pe care serverul tocmai i-l trimisese în `Content-Range`.
 *
 * Probat pe producție, cu o citire: `Range: 50-99` pe o tabelă cu 0 rânduri →
 * `HTTP/1.1 416`, `Content-Range: * / 0`, `{"code":"PGRST103"}`.
 *
 * Ce vedea omul: „N abonați confirmați" și „Niciun abonat încă" în același
 * ecran, scăderea dintre ele negativă, paginația dispărută — deci fără drum
 * înapoi. Se ajungea tastând `?p=4` cu trei pagini, sau rămânând pe pagina 3
 * după ce ștergeai destui abonați.
 *
 * ⚠ STĂ AICI, NU ÎN ACȚIUNE, din chiar motivul scris la începutul fișierului:
 * probele casei rulează pe `.ts`, iar acțiunile sunt `"use server"`. O strângere
 * scrisă în linie, acolo, ar fi o regulă pe care n-o probează nimeni.
 */
export function fereastraPaginii(
  pagina: number,
  total: number,
  pePagina: number,
): { pagina: number; pagini: number; deLa: number; panaLa: number } {
  const n = Math.max(0, Math.trunc(total));
  const pe = Math.max(1, Math.trunc(pePagina));
  const pagini = Math.max(1, Math.ceil(n / pe));

  /* Un `?p=` scris de mână poate fi orice: text, negativ, fracție, uriaș. */
  const cerut = Number.isSafeInteger(pagina) && pagina >= 1 ? pagina : 1;
  const p = Math.min(cerut, pagini);

  const deLa = (p - 1) * pe;
  return { pagina: p, pagini, deLa, panaLa: deLa + pe - 1 };
}
