/**
 * Aritmetica cosului, intr-un singur loc.
 *
 * Aceleasi trei numere — transport, prag de livrare gratuita, comanda minima —
 * erau calculate in trei fisiere diferite: in sertar, in bara de progres de pe
 * pagina de magazin si, in forma extinsa, in formularul de comanda. Cu inca
 * trei modele de pagina de cos ar fi devenit sase copii, iar clientul ar fi
 * vazut totaluri diferite pentru acelasi cos, exact la prag si la comanda
 * minima, adica fix acolo unde se uita.
 *
 * Modul PUR: fara React, fara acces la retea. Ce intra e ce a ales clientul; ce
 * iese e ce se afiseaza.
 */

import { computeVat } from "@/lib/utils/vat";

export interface CartPricingInput {
  /** Valoarea produselor din cos, inainte de transport. */
  total: number;
  shippingCost: number;
  /** `null` = magazinul nu ofera livrare gratuita peste un prag. */
  freeShippingThreshold: number | null;
  /** `null` = magazinul nu impune o valoare minima de comanda. */
  minOrderAmount: number | null;
  /**
   * Regimul de TVA al magazinului. Lipsa inseamna „nu stim inca", adica exact
   * purtarea de pana acum: fara TVA in socoteala.
   *
   * Fara el, cosul era GRESIT, nu doar sarac: la magazinele cu preturi fara TVA
   * arata un total din care lipsea taxa, iar la finalizare aparea alt numar, mai
   * mare. eSAFE, cu cota de 21%, arata 120 lei in cos si cerea 141 la checkout.
   */
  vat?: {
    vat_enabled: boolean;
    vat_rate: number;
    prices_include_vat: boolean;
    /** Comerciantul vrea sa vada clientul linia de TVA. Suma se aduna oricum. */
    show_vat_breakdown?: boolean;
  };
}

export interface CartPricing {
  /** Costul transportului dupa aplicarea pragului. */
  shipping: number;
  shippingIsFree: boolean;
  /**
   * Magazinul chiar are un prag de livrare gratuita. Raspunsul sta aici, nu in
   * componente: intrebarea „exista prag" primea doua raspunsuri diferite pentru
   * pragul 0 — bara de progres se desena, dar aritmetica il ignora.
   */
  areaPrag: boolean;
  grandTotal: number;
  /** Comanda e sub minimul cerut, deci finalizarea se blocheaza. */
  belowMinOrder: boolean;
  /** Cat mai trebuie adaugat pana la comanda minima. 0 cand e indeplinita. */
  minOrderRemaining: number;
  /** Cat mai trebuie adaugat pana la livrarea gratuita. 0 cand e obtinuta. */
  freeShippingRemaining: number;
  /** Progresul catre livrarea gratuita, 0-100. 100 cand nu exista prag. */
  freeShippingPct: number;
  /**
   * TVA-ul de aratat pe o linie separata, sau `null` cand nu e nimic de aratat
   * (magazin neplatitor, ori comerciantul a stins defalcarea).
   *
   * La preturi CU TVA e portiunea extrasa din total, informativa. La preturi
   * FARA TVA e suma chiar adaugata la total.
   */
  vatAmount: number | null;
}

export function computeCartPricing({
  total,
  shippingCost,
  freeShippingThreshold,
  minOrderAmount,
  vat,
}: CartPricingInput): CartPricing {
  // Comparatiile se fac pe subtotalul ROTUNJIT LA BANI, adica pe numarul pe
  // care il si citeste clientul. Suma bruta e in virgula mobila: 10 bucati x
  // 19,99 dau 199.89999999999998, afisat „199,90 lei" dar sub pragul de 199,90.
  // Nerotunjit, textul spune „Mai adauga 0,00 lei" si transportul se taxeaza
  // oricum; la comanda minima e si mai rau, butonul ramane inactiv fara ca
  // clientul sa aiba ce sa mai adauge.
  const totalBani = laBani(total);

  // Un prag de 0 inseamna „fara prag", nu „gratuit mereu": asa se comporta si
  // citirea din baza, unde 0 si null ajung amandoua la fel.
  const areaPrag = !!freeShippingThreshold;
  const shippingIsFree = areaPrag && totalBani >= freeShippingThreshold;
  const shipping = shippingIsFree ? 0 : shippingCost;
  const belowMinOrder = minOrderAmount !== null && totalBani < minOrderAmount;

  /*
   * TVA-ul, cu ACELASI helper ca formularul de comanda si ca serverul.
   *
   * In cos nu exista inca extraoptiuni, cod de reducere, metoda de plata sau
   * taxa de ramburs: alea se aleg abia la finalizare. Deci baza e chiar marfa.
   * Cand clientul ajunge la checkout si adauga un cupon, numarul se reface
   * acolo, pe baza intreaga.
   *
   * Transportul ramane in afara bazei, ca peste tot.
   */
  const { vatAmount, vatAddOn } = vat
    ? computeVat(totalBani, vat)
    : { vatAmount: 0, vatAddOn: 0 };

  return {
    shipping,
    shippingIsFree,
    areaPrag,
    grandTotal: laBani(totalBani + shipping + vatAddOn),
    // Suma se ADUNA oricum la total; comutatorul spune doar daca se si ARATA pe
    // o linie. Stins, clientul vede totalul corect, fara defalcare.
    vatAmount: vat?.vat_enabled && vat.show_vat_breakdown !== false ? vatAmount : null,
    belowMinOrder,
    minOrderRemaining: belowMinOrder ? laBani(minOrderAmount! - totalBani) : 0,
    freeShippingRemaining: areaPrag && !shippingIsFree ? laBani(freeShippingThreshold - totalBani) : 0,
    // Fara prag nu exista drum de parcurs, deci bara e plina: asa componenta
    // care o deseneaza nu mai are de tratat un caz special.
    freeShippingPct: areaPrag
      ? Math.min(100, Math.round((totalBani / freeShippingThreshold) * 100))
      : 100,
  };
}

function laBani(n: number): number {
  return Math.round(n * 100) / 100;
}
