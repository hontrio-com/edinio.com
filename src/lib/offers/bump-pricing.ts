import type { InstantaneuConfiguratie } from "@/lib/configurators/repretuire";

export interface BumpItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  /**
   * Ce s-a configurat pe linie. Ofertele nu se uita niciodata la el.
   *
   * ⚠ Declarat AICI, desi nu-l foloseste nimic din fisierul asta. Re-evaluarea ofertelor
   * copiaza liniile cu `{ ...i }`, deci campul supravietuieste la rulare — dar nu si in TIP.
   * Nedeclarat, ar fi trecut prin oferte doar din intamplare, iar prima rescriere care
   * construieste liniile camp cu camp l-ar fi pierdut TACUT: comanda ar fi ajuns fara
   * specificatie, dar cu pretul configuratiei incasat.
   *
   * Proiectul are lectia asta scrisa despre un prop inghitit de `{...props}`.
   */
  configuratie?: InstantaneuConfiguratie;
}

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
