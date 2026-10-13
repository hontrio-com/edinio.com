/**
 * Citirea toleranta a numerelor si a identificatorilor easySales.
 *
 * ⚠ TIPURILE LOR NU SUNT CONSTANTE [A: exemplele colectiei]. `id` e numar in 50 de raspunsuri si
 * sir in 13; un `product_website_id` trimis 51 revine 51, dar `order_display_id` si `parent_id`
 * apar numai ca sir. Sumele vin cand `964.15`, cand `"964.15"`, cand `"53.8500"`, iar un exemplu
 * are chiar `42.862100999999996`. Deci:
 *
 *   - identificatorii se compara ca TEXT, dupa `String(...)` si taierea spatiilor;
 *   - sumele se citesc dintr-un singur loc, care accepta numar sau sir zecimal si refuza restul.
 */

/** Identificatorul ca text comparabil, sau `null` cand lipseste. */
export function idText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "string") {
    const s = v.trim();
    return s === "" ? null : s;
  }
  return null;
}

/** Acelasi identificator, oricum ar fi venit? `"2"` si `2` da; lipsa cu lipsa NU. */
export function acelasiId(a: unknown, b: unknown): boolean {
  const x = idText(a);
  const y = idText(b);
  return x !== null && y !== null && x === y;
}

/**
 * O suma, sau `null` cand nu se poate citi.
 *
 * ⚠ Virgula NU e acceptata ca separator zecimal: la ei nu apare, iar un „1,234" ar fi ambiguu
 * (o mie doua sute sau unu virgula doua). Mai bine „nu stiu" decat o suma gresita.
 */
export function suma(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Un intreg (cantitate, cod de stare), sau `null`. */
export function intreg(v: unknown): number | null {
  const n = suma(v);
  if (n === null) return null;
  return Number.isInteger(n) ? n : null;
}

/** Rotunjire la `zecimale`, fara capcana lui `toFixed` cu .5 (1.005 -> 1.01, nu 1.00). */
export function rotunjeste(n: number, zecimale: number): number {
  const f = 10 ** zecimale;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Banii in bani (intregi), ca sa se compare fara virgula mobila. */
export function inBani(n: number): number {
  return Math.round((n + Number.EPSILON) * 100);
}
