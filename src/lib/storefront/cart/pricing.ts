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

export interface CartPricingInput {
  /** Valoarea produselor din cos, inainte de transport. */
  total: number;
  shippingCost: number;
  /** `null` = magazinul nu ofera livrare gratuita peste un prag. */
  freeShippingThreshold: number | null;
  /** `null` = magazinul nu impune o valoare minima de comanda. */
  minOrderAmount: number | null;
}

export interface CartPricing {
  /** Costul transportului dupa aplicarea pragului. */
  shipping: number;
  shippingIsFree: boolean;
  grandTotal: number;
  /** Comanda e sub minimul cerut, deci finalizarea se blocheaza. */
  belowMinOrder: boolean;
  /** Cat mai trebuie adaugat pana la comanda minima. 0 cand e indeplinita. */
  minOrderRemaining: number;
  /** Cat mai trebuie adaugat pana la livrarea gratuita. 0 cand e obtinuta. */
  freeShippingRemaining: number;
  /** Progresul catre livrarea gratuita, 0-100. 100 cand nu exista prag. */
  freeShippingPct: number;
}

export function computeCartPricing({
  total,
  shippingCost,
  freeShippingThreshold,
  minOrderAmount,
}: CartPricingInput): CartPricing {
  // Un prag de 0 inseamna „fara prag", nu „gratuit mereu": asa se comporta si
  // citirea din baza, unde 0 si null ajung amandoua la fel.
  const areaPrag = !!freeShippingThreshold;
  const shippingIsFree = areaPrag && total >= freeShippingThreshold;
  const shipping = shippingIsFree ? 0 : shippingCost;
  const belowMinOrder = minOrderAmount !== null && total < minOrderAmount;

  return {
    shipping,
    shippingIsFree,
    grandTotal: total + shipping,
    belowMinOrder,
    minOrderRemaining: belowMinOrder ? minOrderAmount! - total : 0,
    freeShippingRemaining: areaPrag && !shippingIsFree ? freeShippingThreshold - total : 0,
    // Fara prag nu exista drum de parcurs, deci bara e plina: asa componenta
    // care o deseneaza nu mai are de tratat un caz special.
    freeShippingPct: areaPrag
      ? Math.min(100, Math.round((total / freeShippingThreshold) * 100))
      : 100,
  };
}
