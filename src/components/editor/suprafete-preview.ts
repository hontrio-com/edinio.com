/**
 * Paginile pe care le poate arata previzualizarea din „Editeaza magazinul".
 *
 * ⚠ PANOURILE CELE MAI MARI DIN EDITOR NU AVEAU NICIO SUPRAFATA IN CARE SA SE
 * VADA.
 *
 * Rama era legata rigid de pagina principala. „Pagina produs" — garantii,
 * beneficii, „Cum functioneaza", intrebari frecvente, zoom, estimare de livrare,
 * contor de vizitatori — si tot „Formularul de comanda" se randeaza pe ALTE
 * rute, deci comerciantul regla zeci de comutatoare si nu se schimba nimic
 * vizibil, nici dupa salvare. Singurul drum catre ele ar fi fost un click in
 * previzualizare, si tocmai clicurile erau blocate acolo.
 */
export const SUPRAFETE = [
  { cheie: "acasa", eticheta: "Acasa" },
  { cheie: "produs", eticheta: "Produs" },
  { cheie: "cos", eticheta: "Cos" },
  { cheie: "comanda", eticheta: "Comanda" },
] as const;

export type CheieSuprafata = (typeof SUPRAFETE)[number]["cheie"];

/**
 * Calea suprafetei, pentru un magazin.
 *
 * Pagina de produs are nevoie de un produs REAL: fara niciunul, ruta ar da 404 si
 * comerciantul ar vedea o eroare in loc de un panou gol care se explica singur.
 * De aceea `produsSlug` poate lipsi, iar atunci suprafata cade pe pagina
 * principala — iar interfata o arata dezactivata, cu motivul scris.
 */
export function caleaSuprafetei(
  cheie: CheieSuprafata,
  slug: string,
  produsSlug: string | null,
): string {
  const radacina = `/${slug}`;
  if (cheie === "cos") return `${radacina}/cos`;
  if (cheie === "comanda") return `${radacina}/checkout`;
  if (cheie === "produs") return produsSlug ? `${radacina}/product/${produsSlug}` : radacina;
  return radacina;
}

/** Ce suprafete EXISTA cu adevarat la magazinul asta. */
export interface SuprafeteDisponibile {
  /** Slugul unui produs activ, sau `null` cand magazinul n-are niciunul. */
  produsSlug: string | null;
  /** Magazinul are cosul ca pagina de sine statatoare (nu sertar). */
  cosPePagina: boolean;
  /** Magazinul are finalizarea ca pagina (nu fereastra). */
  comandaPePagina: boolean;
  /** Magazinul vinde un singur produs: pagina principala ESTE pagina lui. */
  unSingurProdus: boolean;
}

/**
 * De ce nu se poate arata suprafata, daca e cazul.
 *
 * ⚠ Nu doar „lipseste produsul". `/{slug}/cos` si `/{slug}/checkout`
 * REDIRECTEAZA catre pagina principala la magazinele care tin cosul in sertar si
 * comanda in fereastra — adica la implicitul tuturor magazinelor. Iar
 * redirectarile arunca sirul de interogare, deci si `preview=1`: butonul ramanea
 * aprins, previzualizarea sarea pe acasa, si la magazinele cu domeniu propriu
 * cadrul ramanea alb cu „refused to connect". Un buton care nu poate face ce
 * scrie pe el trebuie sa spuna de ce, nu sa para ca merge.
 */
export function motivSuprafataIndisponibila(
  cheie: CheieSuprafata,
  d: SuprafeteDisponibile,
): string | null {
  if (cheie === "produs") {
    if (d.unSingurProdus) return "Magazinul vinde un singur produs: pagina principala este chiar pagina lui.";
    if (!d.produsSlug) return "Adauga un produs ca sa poti vedea pagina de produs.";
  }
  if (cheie === "cos" && !d.cosPePagina) {
    return "Cosul magazinului se deschide ca sertar, nu ca pagina. Il schimbi din Design sectiuni > Cos si comanda.";
  }
  if (cheie === "comanda" && !d.comandaPePagina) {
    return "Comanda se completeaza intr-o fereastra, nu pe o pagina. O schimbi din Design sectiuni > Cos si comanda.";
  }
  return null;
}
