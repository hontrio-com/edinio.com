import type { FaqItem } from "./faq";

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

/* ═══════════════════════════════════════════════════════════════════════════
   Conversația din ilustrația cardului „Remedierea Problemelor"
   ═══════════════════════════════════════════════════════════════════════════ */

export interface MesajWhatsApp {
  text: string;
  ora: string;
  /** Cine scrie. Comerciantul e la dreapta, pe verde; suportul la stânga, pe alb. */
  dinPartea: "comerciant" | "suport";
}

/** Ce scrie în capul conversației. */
export const WHATSAPP_CONTACT = "Suport Edinio";

/**
 * Cele trei mesaje, în ordinea în care se scriu.
 *
 * ⚠ POVESTEA E CHIAR CEA DIN TEXTUL CARDULUI: apare o eroare, echipa o preia și
 * o investighează, apoi o rezolvă. Trei mesaje, trei pași — nici unul în plus.
 *
 * ⚠ Comerciantul scrie PRIMUL și e la DREAPTA. Într-o conversație de pe telefonul
 * tău, mesajele tale sunt la dreapta, pe verde; ale celuilalt la stânga, pe alb.
 * Invers, desenul ar arăta conversația de pe telefonul suportului — adică din
 * partea greșită.
 *
 * ⚠ Orele urcă, nu coboară: într-o conversație cel mai nou mesaj e JOS, pe dos
 * față de cutia poștală de la cardul de alături, unde e sus.
 */
export const WHATSAPP_MESAJE: MesajWhatsApp[] = [
  { dinPartea: "comerciant", text: "Nu se generează AWB-ul", ora: "10:14" },
  { dinPartea: "suport", text: "Am preluat, verificăm acum.", ora: "10:16" },
  { dinPartea: "suport", text: "Rezolvat. Încearcă din nou.", ora: "11:40" },
  /* ⚠ Închiderea conversației, cerută de client (13.08). Nu e de umplutură: fără
     ea, ultimul cuvânt e al suportului, iar desenul se termină cu o promisiune.
     Cu ea, se termină cu confirmarea celui care avea problema — adică lucrul pe
     care cardul îl susține. Și e la DREAPTA, deci deschide un șir nou, cu codiță. */
  { dinPartea: "comerciant", text: "Mulțumesc!", ora: "11:42" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   Întrebări frecvente, pe pagina „Mentenanță gratuită"
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ TITLUL E CEL OBIȘNUIT, dar DESCRIEREA E SCRISĂ DE MINE. Clientul a dat cele
 * opt perechi întrebare-răspuns (13.08), nu și rândul de sub titlu. Cel de pe
 * pagina de start („…despre Edinio") ar fi promis mai mult decât e aici: astea
 * sunt doar despre mentenanță.
 */
export const MENTENANTA_FAQ_LEAD =
  "Răspunsuri la cele mai comune întrebări despre mentenanța inclusă.";

/**
 * ⚠ TEXTELE SUNT ALE CLIENTULUI, date cuvânt cu cuvânt (13.08). Nu se rescriu,
 * nu se scurtează, nu se reordonează.
 *
 * ⚠ Sunt ALTELE decât cele zece de pe pagina de start (`FAQS`), și trebuie să
 * rămână așa: acolo se răspunde la „ce e Edinio", aici doar la ce ține de
 * mentenanță. O listă comună ar fi umplut pagina asta cu întrebări despre
 * integrări și prețuri.
 *
 * ⚠ Răspunsul la a patra spune limpede că NU există un termen garantat. E al
 * clientului și e bine că e acolo: o pagină care promite un timp de rezolvare
 * fără să-l poată susține e chiar felul de afirmație care se întoarce împotriva
 * ta. Nu se „îmbunătățește".
 */
export const MENTENANTA_FAQ: FaqItem[] = [
  {
    question: "Mentenanța este într-adevăr gratuită?",
    answer:
      "Da. Mentenanța tehnică a platformei Edinio este inclusă în abonament și nu se plătește separat.",
  },
  {
    question: "Trebuie să fac eu actualizările platformei?",
    answer:
      "Nu. Actualizările Edinio sunt gestionate de echipa noastră și sunt aplicate direct la nivelul platformei.",
  },
  {
    question: "Ce se întâmplă dacă apare o problemă tehnică?",
    answer:
      "Dacă problema ține de platforma Edinio, echipa noastră o investighează și lucrează la remedierea ei cât mai rapid posibil.",
  },
  {
    question: "În cât timp se rezolvă o problemă?",
    answer:
      "Timpul de rezolvare depinde de natura și complexitatea problemei. Nu avem un termen contractual garantat, dar problemele care țin de platformă sunt investigate și tratate cât mai rapid posibil.",
  },
  {
    question: "Mentenanța include și securitatea platformei?",
    answer:
      "Da. Ne ocupăm de întreținerea tehnică și de măsurile necesare pentru protejarea platformei și a magazinelor active.",
  },
  {
    question: "Sunt incluse și optimizările de performanță?",
    answer:
      "Da. Lucrăm constant la performanța, stabilitatea și experiența de utilizare a platformei.",
  },
  {
    question: "Ce se întâmplă dacă o integrare nu mai funcționează?",
    answer:
      "Dacă problema ține de integrarea Edinio, o investigăm și o actualizăm atunci când este necesar și posibil. Problemele care țin direct de serviciul extern rămân în responsabilitatea furnizorului respectiv.",
  },
  {
    question: "Trebuie să am un programator pentru magazin?",
    answer:
      "Nu. Pentru partea tehnică standard a platformei nu ai nevoie de un programator separat. Edinio se ocupă de actualizări, mentenanță și problemele care țin de platformă.",
  },
];
