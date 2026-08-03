import { lineKey } from "./normalize";

export interface LinieCos {
  productId: string;
  variantTitle?: string;
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
  const comandate = new Set(liniiComandate.map(lineKey));
  return cosCurent.filter((i) => !comandate.has(lineKey(i)));
}
