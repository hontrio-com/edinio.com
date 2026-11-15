/**
 * Cererea de filtru pentru lista de oferte eMAG (`EmagListings`), trimisa din alta fila a paginii.
 *
 * Butonul „Vezi ofertele” din „De făcut în contul eMAG” (fila Prezentare) duce la fila Oferte si cere
 * lista „De reparat” (cheia `probleme`): acolo stau ofertele despre care vorbeste notificarea. Fara asta, omul ajungea
 * in fila Oferte, la lista intreaga, si cauta singur filtrul pomenit in text.
 *
 * ⚠ LISTA POATE FI INCA NEMONTATA. Filele se monteaza la prima deschidere (`FileMarketplace`), deci un
 * eveniment trimis inainte s-ar pierde. Cererea se tine minte aici pana o citeste lista la montare; daca
 * lista e deja montata, o prinde din eveniment.
 *
 * Numai in browser: pe server nu se cheama nimic de aici, iar cererea ramane `null`.
 */

export type CerereFiltruOferte = {
  /** Valoarea din lista de filtre a ecranului (de exemplu `"probleme"`). */
  filtru?: string;
  cautare?: string;
};

export const FILTRU_OFERTE_CERUT = "edinio:emag-filtru-oferte";

let inAsteptare: CerereFiltruOferte | null = null;

export function cereFiltruOferte(cerere: CerereFiltruOferte): void {
  inAsteptare = cerere;
  window.dispatchEvent(new CustomEvent<CerereFiltruOferte>(FILTRU_OFERTE_CERUT, { detail: cerere }));
}

/** Se uita, nu se consuma: in modul strict React cheama initializatorul de doua ori. */
export function filtruOferteInAsteptare(): CerereFiltruOferte | null {
  return inAsteptare;
}

export function uitaFiltrulOferte(): void {
  inAsteptare = null;
}
