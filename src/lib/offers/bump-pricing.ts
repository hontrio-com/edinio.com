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
  return aplicaPretPeBucati(linii, linie, pretRedus, 1);
}

/**
 * Același lucru, dar pe mai multe bucăți: setul „2 becuri + 1 lustră”.
 *
 * ⚠⚠ GARDA RĂMÂNE PE BUCATĂ, nu pe total. Mutată pe total, o diferență de
 * 0,003 lei × 4 bucăți ar fi trecut de ea și ar fi scris un preț acolo unde azi
 * nu se scrie nimic.
 *
 * ⚠ Când linia are mai multe bucăți decât cere setul, se desprind exact atâtea
 * pe o linie nouă, iar restul rămân la prețul întreg — la fel ca bump-ul, care e
 * chiar cazul `bucati = 1`.
 *
 * ⚠ Când linia are MAI PUȚINE decât cere setul, se ieftinesc cele care sunt.
 * Aici nu e locul care refuză: reconstituirea setului (`setulOfertei`) a
 * hotărât deja că oferta se aplică, iar un refuz strecurat în aritmetica de bani
 * ar fi oprit comenzi dintr-un fișier care n-ar trebui să oprească nimic.
 */
export function aplicaPretPeBucati(
  linii: BumpItem[], linie: BumpItem, pretRedus: number, bucati: number,
): number {
  const perBucata = round2(linie.price - pretRedus);
  if (perBucata <= 0) return 0;
  const cerute = Math.max(1, Math.floor(Number(bucati) || 1));
  const luate = Math.min(cerute, linie.quantity);
  if (linie.quantity <= luate) {
    linie.price = pretRedus;
  } else {
    linie.quantity -= luate;
    linii.push({ ...linie, quantity: luate, price: pretRedus });
  }
  return round2(perBucata * luate);
}
