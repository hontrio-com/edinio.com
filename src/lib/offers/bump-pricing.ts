export interface BumpItem { product_id: string; name: string; price: number; quantity: number }

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Bump-ul e „inca una, la pretul asta", nu „toate la pretul asta".
 *
 * Cand linia are mai multe bucati — produsul e comandat si normal, nu doar prin
 * bump — o bucata pleaca pe linia ei, la pretul redus, iar restul raman la
 * pretul intreg. Fara asta, cine ridica cantitatea la cinci lua toate cele cinci
 * la pretul de bump.
 *
 * Sta singura in fisierul asta fiindca e aritmetica de bani: nu are nevoie de
 * baza de date, deci poate fi testata direct.
 *
 * Intoarce economia, si modifica `linii` pe loc.
 */
export function aplicaBumpPeOBucata(linii: BumpItem[], linie: BumpItem, pretRedus: number): number {
  const economie = round2(linie.price - pretRedus);
  if (economie <= 0) return 0;
  if (linie.quantity <= 1) {
    linie.price = pretRedus;
  } else {
    linie.quantity -= 1;
    linii.push({ ...linie, quantity: 1, price: pretRedus });
  }
  return economie;
}
