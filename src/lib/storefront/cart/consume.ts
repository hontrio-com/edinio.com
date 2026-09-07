import { lineKey } from "./normalize";

export interface LinieCos {
  productId: string;
  variantTitle?: string;
  /*
   * ⚠ DECLARATA, desi `lineKey` o citea si fara ea.
   *
   * Identitatea unei linii include personalizarea: „Robert" si „Maria" sunt doua linii ale
   * aceluiasi produs. Tipul de aici nu o pomenea, iar la rulare mergea din intamplare fericita —
   * apelantii dau chiar obiectele din cos, filtrate, nu remapate, deci campul era acolo.
   *
   * ⚠ „Din intamplare fericita" nu e o paza. Un apelant care ar fi construit lista prin
   * `.map(i => ({ productId: i.productId }))` — ceva ce tipul PERMITEA — ar fi produs chei care nu
   * se potrivesc cu niciuna din cos: ori nu se scotea nimic, ori se scotea linia gresita. Declarata,
   * greseala aia devine o eroare de compilare, nu o comanda cu cana greșita.
   */
  customization?: Record<string, unknown>;
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
