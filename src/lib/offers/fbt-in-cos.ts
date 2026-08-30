import { aplicaBumpPeOBucata, type BumpItem } from "./bump-pricing";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Un companion al setului FBT, cu pretul lui de set (vezi `distributeFbtSavings`). */
export interface CompanionFbt {
  product_id: string;
  price: number;
}

export interface RezultatFbtInCos<T> {
  /**
   * Economia setului pe fiecare linie purtata din cos, dupa POZITIA ei in lista
   * primita. Zero acolo unde linia nu face parte din set. Are exact atatea
   * elemente cate linii s-au dat.
   */
  economiePeLinie: number[];
  /** Suma economiilor de mai sus, rotunjita la ban. */
  economieTotala: number;
  /** Companionii fara linie in cos: ei intra in comanda cu linia lor. */
  companioniNoi: T[];
}

/**
 * Setul „cumparate frecvent impreuna" asezat peste liniile purtate din cos.
 *
 * DE CE exista: formularul de comanda scotea din cos, integral, orice linie al
 * carei produs era in setul acceptat, si punea setul inapoi cu o bucata fixa.
 * Cine avea 3 bucati din companion in cos apasa „Cumpara impreuna", nu mai vedea
 * produsul nicaieri in formular, si comanda pleca cu 1 bucata: doua bucati
 * pierdute din vanzare si o comanda cu alta cantitate decat ceruse clientul.
 * Linia ramanea in plus si in cos, necomandata si nespusa, deci urmatoarea
 * finalizare o comanda a doua oara.
 *
 * Serverul stia deja regula buna: `aplicaOfertaPeLinii` cauta PRIMA linie a
 * companionului si ii da pretul de set pe O SINGURA bucata
 * (`aplicaBumpPeOBucata`), restul raman la pretul intreg. Functia asta e oglinda
 * ei pentru formular, si cheama chiar `aplicaBumpPeOBucata`, ca aritmetica sa nu
 * poata diverge intre ce scrie pe buton si ce se incaseaza.
 *
 * Companionul care NU e in cos iese prin `companioniNoi` si se trimite ca linie
 * proprie, exact ca pana acum. Asa setul ramane INTREG oricum ar edita clientul
 * cosul din formular: daca sterge linia companionului, el reintra prin
 * `companioniNoi` si serverul nu mai are motiv sa refuze comanda cu
 * „set_incomplet".
 *
 * Masurat in productie pe 2026-08-04: o singura oferta `frequently_bought`
 * activa (magazin nepublicat, un companion) si 0 comenzi cu oferte acceptate,
 * deci azi nu curge niciun leu gresit — dar mecanismul e cel care se vinde.
 */
export function fbtInCos<T extends CompanionFbt>(
  liniiCos: readonly BumpItem[],
  companioni: readonly T[],
): RezultatFbtInCos<T> {
  // Copie de lucru: `aplicaBumpPeOBucata` modifica pe loc si desprinde linii noi,
  // iar apelantul ne da chiar starea din care randeaza.
  const lucru: BumpItem[] = liniiCos.map((l) => ({ ...l }));
  const economiePeLinie = liniiCos.map(() => 0);
  const atinse = new Set<number>();
  const companioniNoi: T[] = [];
  for (const c of companioni) {
    // Acelasi criteriu ca serverul: prima linie NEATINSA, cu macar o bucata, a
    // produsului cerut. Fara `atinse`, doi companioni ai aceluiasi produs ar
    // reduce de doua ori aceeasi linie.
    const idx = lucru.findIndex((l, k) => !atinse.has(k) && l.quantity >= 1 && l.product_id === c.product_id);
    if (idx < 0) {
      companioniNoi.push(c);
      continue;
    }
    atinse.add(idx);
    const inainte = lucru.length;
    economiePeLinie[idx] = aplicaBumpPeOBucata(lucru, lucru[idx], c.price);
    // Bucata desprinsa e tot o linie a aceluiasi produs: nemarcata, un companion
    // urmator ar fi gasit-o si ar fi redus-o a doua oara.
    if (lucru.length > inainte) atinse.add(lucru.length - 1);
  }
  return {
    economiePeLinie,
    economieTotala: round2(economiePeLinie.reduce((s, e) => s + e, 0)),
    companioniNoi,
  };
}
