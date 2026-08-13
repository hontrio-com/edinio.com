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

/**
 * Cum stau cardurile pe pagină: două mari alături, unul lat sub ele.
 *
 * Cerut de client (13.08), după o referință trimisă de el.
 *
 * ⚠ TREI LOCURI, PATRU TEXTE. Unul rămâne pe dinafară, și e o alegere pe care
 * clientul o poate întoarce dintr-un rând de aici. Am scos „Optimizări
 * Constante", și nu la întâmplare: de când există pagina „Optimizare", cu
 * secțiunile ei despre performanță, SEO și GEO, cardul ăla spunea pe scurt ce
 * acolo se arată pe larg. Celelalte trei n-au altă casă.
 *
 * Ordinea de aici e ordinea de pe ecran: `mari[0]` la stânga sus, `mari[1]` la
 * dreapta sus, `lat` dedesubt.
 */
export const MENTENANTA_ASEZARE = {
  mari: ["actualizari", "remediere"],
  lat: "securitate",
} as const satisfies {
  mari: readonly CardMentenanta["id"][];
  lat: CardMentenanta["id"];
};

/** Cardul cu id-ul dat, sau o eroare — un id greșit n-are voie să treacă tăcut. */
export function cardMentenanta(id: CardMentenanta["id"]): CardMentenanta {
  const card = MENTENANTA_CARDURI.find((c) => c.id === id);
  if (!card) throw new Error(`MENTENANTA_ASEZARE: nu există cardul „${id}"`);
  return card;
}
