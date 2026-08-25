import type { SamedayStareAwb } from "./client";

/**
 * Ce inseamna, pentru comanda, ce ne-au spus ei despre colet.
 *
 * ═══ ⚠ HOTARAREA SE IA DIN DOI BOOLEENI, NU DINTR-UN ENUM GHICIT ═══
 *
 * Raspunsul lor poarta si `expeditionStatus.statusState`, un sir despre care NICI
 * documentatia v2.3, NICI SDK-ul lor oficial nu spun ce valori poate lua — le-am cautat in
 * amandoua. Un `switch` pe el ar fi fost o presupunere imbracata in logica, si prima valoare
 * neprevazuta ar fi cazut tacut pe ramura implicita.
 *
 * `expeditionSummary.delivered` si `.canceled` sunt insa booleeni. Pe ei se hotaraste.
 * `statusLabel` se pastreaza doar ca sa fie ARATAT omului.
 *
 * ═══ ⚠ SI DE CE SUMARUL, NU ULTIMUL EVENIMENT DIN ISTORIC ═══
 *
 * E o lectie platita la GLS, scrisa in `posta/statusuri.ts`: intre doua treceri ale cronului
 * pot intra mai multe evenimente, iar ultimul poate fi unul administrativ („Reambalat",
 * „Schimbare cod"). Citind doar pe el, o livrare petrecuta intre timp n-ar mai fi vazuta
 * NICIODATA — iar la o comanda cu plata la livrare asta inseamna bani neinregistrati.
 *
 * La Sameday paza vine gata facuta: `delivered` din sumar e cumulativ, nu un eveniment.
 * De-aia nu ne uitam deloc la coada istoricului.
 */

/** Treptele comenzii, in ordine. Ce nu e aici nu se compara. */
const TREAPTA: Record<string, number> = {
  pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4,
};

export type StatusComanda = "processing" | "shipped" | "delivered";

/**
 * Ce status merita comanda dupa ce ne-am uitat la colet — sau `null` daca nu se schimba.
 *
 * ⚠ NU SE COBOARA NICIODATA. Iar o comanda anulata sau rambursata nu se misca de la un
 * transportator: alea sunt hotarari ale comerciantului.
 */
export function statusUrmator(statusCurent: string, stare: SamedayStareAwb): StatusComanda | null {
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;

  /*
   * ⚠ ANULAREA NU COBOARA COMANDA, si nu din delicatete.
   *
   * Un AWB anulat la ei poate insemna ca s-a reemis altul (adresa gresita, colet pierdut).
   * Coborand comanda din „expediat" in altceva, am sterge o expediere care poate chiar a
   * plecat. Se SEMNALEAZA — vezi `cereOmul` — si il lasam pe om sa hotarasca.
   */
  const tinta: StatusComanda | null = stare.livrat ? "delivered" : stare.anulat ? null : "shipped";
  if (!tinta) return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

/**
 * Coletul si-a incheiat drumul: nu mai are rost intrebat.
 *
 * ⚠ Cronul se opreste din a-l intreba, dar comanda ramane in fereastra: daca cineva
 * reemite un AWB pe ea, marcajul se rescrie si intra iar.
 */
export function eStareFinala(stare: SamedayStareAwb): boolean {
  return stare.livrat || stare.anulat;
}

/**
 * Cand trebuie sa afle omul, fiindca urmeaza o hotarare pe care n-o putem lua noi.
 *
 * ⚠ Livrarea NU e aici. Ea se vede in panou si nu cere nimic de la nimeni; un rand de
 * jurnal la fiecare colet livrat ar ineca exact semnalele pentru care exista jurnalul.
 */
export function cereOmul(stare: SamedayStareAwb): string | null {
  if (stare.anulat) {
    return `Sameday a anulat expeditia${stare.motiv ? `: ${stare.motiv}` : ""}. Verifica daca trebuie reemis AWB-ul.`;
  }
  /*
   * ⚠ Trei incercari de livrare inseamna ca urmeaza returul, iar returul e o hotarare
   * (se reincearca? se ramburseaza?). Doua sunt inca rutina si nu merita zgomot.
   */
  if (!stare.livrat && stare.incercariDeLivrare >= 3) {
    return `Sameday a incercat livrarea de ${stare.incercariDeLivrare} ori si n-a reusit${stare.motiv ? `: ${stare.motiv}` : ""}.`;
  }
  return null;
}
