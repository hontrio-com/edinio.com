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

/* ═══════════════════════════════════════════════════════════════════════════
   Mailurile din ilustrația cardului „Actualizare Platformă"
   ═══════════════════════════════════════════════════════════════════════════ */

export interface MailMentenanta {
  titlu: string;
  descriere: string;
  /** Ce scrie în dreapta rândului: ora, sau data dacă e mai vechi de azi. */
  ora: string;
}

/** Expeditorul, la toate. */
export const MAIL_EXPEDITOR = "Edinio";

/**
 * Cele patru mailuri, ÎN ORDINEA DE PE ECRAN: primul e cel mai nou, sus.
 *
 * ⚠ TEXTELE SUNT ALE CLIENTULUI, date cuvânt cu cuvânt (13.08). Nu se rescriu.
 *
 * ⚠ ORDINEA DE PE ECRAN NU E ORDINEA SOSIRII, și asta e chiar ce face desenul să
 * pară o cutie poștală adevărată. Într-o cutie, mailul nou intră SUS și le împinge
 * pe celelalte în jos; deci sosesc de la coadă spre cap — al patrulea primul, al
 * întâi ultimul. Lista de aici rămâne în ordinea în care a scris-o clientul, iar
 * animația o parcurge invers.
 *
 * ⚠ Orele coboară odată cu lista, fiindcă sus stă cel mai nou. Cu ore amestecate,
 * oricine a deschis vreodată un mail ar vedea că ceva nu e în regulă, fără să
 * poată spune ce.
 */
export const MENTENANTA_MAILURI: MailMentenanta[] = [
  {
    titlu: "Integrare nouă disponibilă",
    descriere:
      "Am adăugat o nouă integrare în Edinio. O poți activa direct din contul tău.",
    ora: "14:32",
  },
  {
    titlu: "Problemă rezolvată",
    descriere:
      "Am identificat și remediat problema care afecta temporar o funcționalitate a platformei.",
    ora: "11:05",
  },
  {
    titlu: "Platforma a fost actualizată",
    descriere:
      "Am lansat o nouă actualizare Edinio cu îmbunătățiri de stabilitate și performanță.",
    ora: "9:41",
  },
  {
    titlu: "Funcționalitate nouă",
    descriere: "O nouă funcționalitate este acum disponibilă în magazinul tău.",
    ora: "12 aug.",
  },
];
