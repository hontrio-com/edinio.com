/**
 * Secțiunea „Problema" de pe pagina de acasă.
 *
 * Textele stau aici ca să se schimbe fără să umbli în JSX, ca la
 * `lib/website/features.ts`.
 *
 * Imaginile sunt substituenți: ca să pui una adevărată, completezi `image.src` și
 * caseta gri dispare singură. Cât `src` lipsește se afișează `hint`, adică exact
 * ce imagine așteptăm acolo, ca să nu se piardă ideea până vine fișierul.
 */

/**
 * Titlul, rupt de mână în două rânduri.
 *
 * Lăsat într-un singur șir, se rupea unde apuca — fix peste mijlocul propoziției
 * a doua. Aici toată puterea stă în cele două afirmații puse una sub alta: laudă,
 * apoi palmă. Fiecare intrare din listă e un rând.
 *
 * Ruptura e o decizie de CONȚINUT, nu de stil: mărimea, grosimea, culoarea și
 * centrarea rămân identice cu ale titlului de la „Soluția".
 */
export const PROBLEM_TITLE = [
  "Produsul tău este bun.",
  "Magazinul online lasă de dorit.",
];

export const PROBLEM_LEAD =
  "Nu-ți lipsesc clienții. Îți lipsește locul în care să cumpere singuri, fără să te întrebe pe tine. Așa arată o zi obișnuită.";

export interface ProblemCard {
  /** Cheie stabilă pentru `key`, chiar dacă se schimbă titlul. */
  id: string;
  title: string;
  description: string;
  /**
   * Desen făcut de noi, în locul unei poze. Cardul cu `art` nu mai are `image`.
   * Deocamdată există un singur desen: firul de mesaje.
   */
  art?: "messages";
  image?: {
    /** Lipsește => se afișează substituentul. */
    src?: string;
    alt: string;
    /** Ce trebuie să arate imaginea. Se vede pe substituent. */
    hint: string;
  };
}

/**
 * Mesajele din primul card, desenate ca bule iMessage.
 *
 * TREI, nu patru. A patra a fost scoasă (2026-08-06): umplea cardul până sus și
 * firul arăta înghesuit. Cu trei, între bule încape aer, iar ideea trece la fel
 * de bine — nu numărul întrebărilor o duce, ci faptul că nu are cine să le
 * răspundă.
 *
 * Nu există niciun răspuns printre ele, dinadins. Asta e tot cardul: întrebările
 * vin, iar tu ești singurul canal.
 *
 * `face`, `initials` și `photo` se văd doar în varianta cu cercul expeditorului.
 * Sunt trei oameni diferiți, nu unul care scrie de trei ori — de aia fiecare
 * mesaj are alt chip.
 *
 * `photo` e portița pentru poze adevărate: pui o cale și portretul desenat dispare
 * singur. `initials` rămâne oricum, ca text pentru cititoarele de ecran. Vezi
 * `Avatar` din `MessagesThread.tsx` pentru de ce sunt desenate deocamdată.
 *
 * Lungimile contează mai mult decât ordinea: ultima e cea mai lungă, fiindcă stă
 * cel mai jos și se vede întreagă la orice lățime. Cele de deasupra se taie de
 * marginea cardului pe ecrane înguste, ca într-un fir derulat.
 */
export interface ProblemMessage {
  text: string;
  /** Numele expeditorului, pentru cititoarele de ecran. */
  name: string;
  initials: string;
  /** Care dintre cele trei portrete desenate. */
  face: 0 | 1 | 2;
  /** Lipsește => se desenează portretul. */
  photo?: string;
}

export const PROBLEM_MESSAGES: ProblemMessage[] = [
  { text: "Bună ziua! Cum pot comanda?", name: "Andreea M.", initials: "AM", face: 0 },
  { text: "Aveți produsul acesta pe stoc?", name: "Ionuț P.", initials: "IP", face: 1 },
  { text: "Unde pot vedea mai multe produse?", name: "Maria D.", initials: "MD", face: 2 },
];

/**
 * Trei carduri, fiecare pentru altă durere: unde stau comenzile, cine face
 * hârtiile, cum arată magazinul. Nu cinci și nu cincisprezece — trei se rețin.
 */
export const PROBLEM_CARDS: ProblemCard[] = [
  {
    id: "comenzi",
    title: "Comenzile trăiesc în conversații.",
    description:
      "Răspunzi la aceleași întrebări de zece ori pe zi, iar cine nu primește răspuns pleacă.",
    art: "messages",
  },
  {
    id: "hartii",
    title: "Hârtiile le faci noaptea.",
    description:
      "Vineri, 23:47. Facturile de azi, AWB-urile de mâine, stocul cine știe când.",
    image: {
      alt: "Facturi făcute manual într-o foaie de calcul, noaptea",
      hint: "Foaie de calcul cu facturi, seara târziu",
    },
  },
  {
    id: "viteza",
    title: "Magazinul se vede după 6,8 secunde.",
    description:
      "Pe telefon, în mijlocul zilei, pe date mobile. Clientul nu are răbdarea ta.",
    image: {
      alt: "Magazin online care se încarcă greu pe telefon",
      hint: "Pagină care se încarcă greu pe telefon",
    },
  },
];
