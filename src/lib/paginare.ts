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
