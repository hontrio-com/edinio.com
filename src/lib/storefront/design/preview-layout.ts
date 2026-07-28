/**
 * Cum se aseaza miniatura unei variante in cardul din galeria de design-uri.
 *
 * Aritmetica sta aici, in afara componentei, pentru ca e singurul lucru din card
 * care se poate insela in tacere: o scara gresita nu da nicio eroare, doar o
 * miniatura care arata altfel decat magazinul.
 */

/**
 * Latimea la care se randeaza miniatura inainte de micsorare.
 *
 * Pe un card ingust nu micsoram desktopul si mai tare — la 350 de pixeli, un
 * desktop de 1280 ajunge la un sfert si nu se mai citeste nimic. Randam direct
 * varianta de telefon, aproape la marime reala: cine alege designul de pe
 * telefon vede exact ce vor vedea clientii lui de pe telefon.
 */
export const LATIME_DESKTOP = 1280;
export const LATIME_MOBIL = 390;
const PRAG_MOBIL = 560;

export interface AsezareMiniatura {
  /** Latimea ferestrei in care randeaza miniatura. */
  latimeRandare: number;
  /** Factorul de micsorare. Niciodata peste 1. */
  scara: number;
  /** Cati pixeli de la marginea din stanga a cardului, ca sa iasa centrata. */
  marginea: number;
}

export function asezareMiniatura({
  latimeCard,
  peMobil,
  latimeFixa,
}: {
  latimeCard: number;
  peMobil: boolean;
  /** Latime impusa de sectiune; are prioritate peste comutatorul telefon/calculator. */
  latimeFixa?: number;
}): AsezareMiniatura {
  const latimeRandare =
    latimeFixa ?? (peMobil || (latimeCard > 0 && latimeCard < PRAG_MOBIL) ? LATIME_MOBIL : LATIME_DESKTOP);

  // Miniatura se micsoreaza, dar nu se mareste NICIODATA peste marimea reala.
  // Sectiunile randate la latime de telefon — cosul si formularul de comanda —
  // intra intr-un card de vreo 860 de pixeli, deci raportul ar fi 2,2: text de
  // 14 px desenat la 31 px si carduri de peste o mie de pixeli inaltime.
  const scara = Math.min(latimeCard > 0 ? latimeCard / latimeRandare : 0, 1);

  return { latimeRandare, scara, marginea: Math.max(0, (latimeCard - latimeRandare * scara) / 2) };
}
