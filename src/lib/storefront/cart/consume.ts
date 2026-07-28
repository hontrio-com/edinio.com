export interface LinieCos {
  productId: string;
  variantTitle?: string;
}

/** Aceeasi identitate de linie ca in CartProvider: produs + combinatia aleasa. */
function cheie(i: Pick<LinieCos, "productId" | "variantTitle">): string {
  return i.variantTitle ? `${i.productId}::${i.variantTitle}` : i.productId;
}

/**
 * Scoate din cos exact liniile care au intrat in comanda.
 *
 * Inainte se stergea INTREAGA cheie `cart_<slug>`, desi comanda plecata de pe
 * pagina de produs duce cu ea doar celelalte linii — produsul curent e comandat
 * separat, cu cantitatea lui din formular. Cine adaugase produsul in cos si apoi
 * apasa „Comanda acum" ramanea fara acea linie, necomandata si nespusa.
 *
 * Intoarce ce ramane in cos, ca apelantul sa scrie si sa anunte schimbarea.
 */
export function cosDupaComanda<T extends LinieCos>(cosCurent: T[], liniiComandate: LinieCos[]): T[] {
  const comandate = new Set(liniiComandate.map(cheie));
  return cosCurent.filter((i) => !comandate.has(cheie(i)));
}
