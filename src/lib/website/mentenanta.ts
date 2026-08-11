/**
 * Textele paginii „Mentenanță gratuită".
 *
 * ⚠ TOATE sunt ale clientului, date cuvânt cu cuvânt (2026-08-11). Singura
 * atingere: diacriticele la titlurile cardurilor, cerute explicit („pui și tu
 * diacritice la titluri"). Scrierea cu majuscule e a lui și n-a fost schimbată.
 * Nu le rescrie fără să întrebi — tiparul e confirmat de multe ori.
 */

export interface CardMentenanta {
  /** Cheia ilustrației desenate pentru cardul ăsta. Vezi `IlustratieMentenanta`. */
  id: "actualizari" | "remediere" | "securitate" | "optimizari";
  titlu: string;
  descriere: string;
}

export const MENTENANTA_TITLU = "Ce include";

export const MENTENANTA_LEAD =
  "Nu trebuie să cauți programatori și nu plătești separat de fiecare dată când platforma are nevoie de o actualizare tehnică.";

export const MENTENANTA_CARDURI: CardMentenanta[] = [
  {
    id: "actualizari",
    titlu: "Actualizare Platformă",
    descriere:
      "Edinio este actualizat constant, fără să trebuiască să îți faci griji pentru module, erori sau alte probleme tehnice.",
  },
  {
    id: "remediere",
    titlu: "Remedierea Problemelor",
    descriere:
      "Dacă apare o eroare care ține de platformă, echipa noastră o investighează și lucrează la rezolvarea ei cât mai rapid posibil.",
  },
  {
    id: "securitate",
    titlu: "Securitate și Infrastructură",
    descriere:
      "Ne ocupăm constant de întreținerea tehnică și de măsurile necesare pentru protejarea platformei și a magazinelor active.",
  },
  {
    id: "optimizari",
    titlu: "Optimizări Constante",
    descriere:
      "Lucrăm permanent la performanța, stabilitatea și experiența de utilizare a platformei.",
  },
];
