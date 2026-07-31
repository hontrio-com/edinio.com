export interface QuantityTier {
  qty: number;
  /** Pretul TOTAL al pachetului, nu pe bucata. */
  price: number;
  badge?: string;
}

export interface PretPeTrepte {
  /** Indexul treptei bifate, sau -1 cand cantitatea nu cade pe nicio treapta. */
  index: number;
  /** Cat se afiseaza clientului pentru produsul asta. */
  subtotal: number;
  /** Cat se trimite serverului ca pret unitar. */
  unitPrice: number;
}

/**
 * Pretul produsului la o cantitate data, cu sau fara trepte.
 *
 * Un singur loc calculeaza si treapta bifata, si totalul afisat, si pretul unitar
 * trimis serverului. Cat timp au fost trei surse separate, formularul de comanda
 * bifa o treapta, afisa pretul alteia si trimitea pretul unitar al celei ramase
 * in stare: clientul vedea pachetul de 2 la 170 lei si platea 179,98.
 *
 * Treptele se aplica doar cand cantitatea CHIAR e o treapta. Paginile de produs
 * cu selector liber pot cere orice numar, iar lista contine mereu si intrarea de
 * o bucata; fara verificarea asta, cine alegea 7 bucati ajungea in formular cu
 * una singura, fara niciun semn.
 */
export function pretPeTrepte(
  tiers: QuantityTier[] | undefined,
  quantity: number,
  basePrice: number,
): PretPeTrepte {
  const index = tiers && tiers.length > 0 ? tiers.findIndex((t) => t.qty === quantity) : -1;
  if (index < 0) {
    return { index: -1, subtotal: basePrice * quantity, unitPrice: basePrice };
  }
  const treapta = tiers![index];
  return { index, subtotal: treapta.price, unitPrice: treapta.price / treapta.qty };
}
