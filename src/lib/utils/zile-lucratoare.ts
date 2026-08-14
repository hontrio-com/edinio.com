/**
 * Zile calendaristice si zile lucratoare, in ora Romaniei.
 *
 * ⚠ MUTATE AICI DIN `lib/pallex/expediere.ts`, 2026-09-02, cand Posta Romana a
 * avut nevoie de aceleasi doua functii. Nu s-au copiat: doua copii ale unei reguli
 * de calendar se despart la prima corectura, si nimic nu se plange. Pall-Ex le
 * re-exporta, deci apelantii si probele lui n-au fost atinse.
 *
 * Comentariile de mai jos sunt cele originale: fiecare descrie un defect masurat,
 * nu o preferinta.
 */

/**
 * Ziua de azi in Romania, ca „AAAA-LL-ZZ".
 *
 * ⚠ NU se ia din `toISOString()`. Serverul ruleaza pe UTC, iar Romania e cu doua
 * ore inainte vara: o partida creata la 22:30 ora Bucurestiului ar primi data de
 * IERI, deci o data in trecut — pe care Pall-Ex o respinge (`meta:
 * ["collection_date"]`). Se intampla o data la fiecare zi, timp de doua ore, si
 * numai seara: exact felul de defect care pare intamplator.
 */
export function ziuaInRomania(acum: Date = new Date()): string {
  const parti = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(acum);
  const ia = (tip: string) => parti.find((p) => p.type === tip)?.value ?? "";
  return `${ia("year")}-${ia("month")}-${ia("day")}`;
}

/** „AAAA-LL-ZZ" → numarul de zile de la epoca, sau `null` daca nu e o data. */
function laZile(zi: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(zi.trim());
  if (!m) return null;
  const [, a, l, z] = m;
  const ms = Date.UTC(Number(a), Number(l) - 1, Number(z));
  const d = new Date(ms);
  /* Respinge „2026-02-31": `Date.UTC` il primeste si il muta pe 3 martie. */
  if (d.getUTCFullYear() !== Number(a) || d.getUTCMonth() !== Number(l) - 1 || d.getUTCDate() !== Number(z)) {
    return null;
  }
  return Math.floor(ms / 86400000);
}

function dinZile(zile: number): string {
  return new Date(zile * 86400000).toISOString().slice(0, 10);
}

/**
 * Adauga zile LUCRATOARE peste o data.
 *
 * ⚠ Sarbatorile legale NU sunt tratate, si asta se spune in interfata.
 *
 * Ar cere un calendar romanesc intretinut de mana, cu Pastele ortodox cu tot, si
 * un calendar gresit e mai rau decat niciunul: ar muta tacut data cu o zi in fata
 * pe zile in care furnizorul chiar lucreaza. Sambetele si duminicile se sar
 * fiindca alea sunt sigure; restul ramane pe seama comerciantului, care oricum
 * poate schimba data in formular.
 */
export function adaugaZileLucratoare(zi: string, cate: number): string {
  const start = laZile(zi);
  if (start === null) return zi;

  let curent = start;
  let ramase = Math.max(0, Math.floor(cate));

  /* Zero zile inseamna „chiar azi", dar tot nu intr-o sambata. */
  if (ramase === 0) {
    while (esteWeekend(curent)) curent += 1;
    return dinZile(curent);
  }

  while (ramase > 0) {
    curent += 1;
    if (!esteWeekend(curent)) ramase -= 1;
  }
  return dinZile(curent);
}

function esteWeekend(zile: number): boolean {
  /* 1970-01-01 a fost joi, deci `getUTCDay` e cel mai limpede. */
  const zi = new Date(zile * 86400000).getUTCDay();
  return zi === 0 || zi === 6;
}

/** `true` daca `a` e strict inaintea lui `b`. Datele invalide nu se compara. */
export function inainteDe(a: string, b: string): boolean {
  const za = laZile(a);
  const zb = laZile(b);
  return za !== null && zb !== null && za < zb;
}
