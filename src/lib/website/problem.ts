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
 * Patru. Au fost trei o vreme, după ce a patra fusese scoasă fiindcă firul arăta
 * înghesuit — dar aia era lungă și se rupea în două rânduri. Cea de acum, „Pot să
 * plătesc cu cardul?", încape pe un rând, deci intră fără să strângă nimic.
 * Măsurat: firul ajunge la 213px într-un slot de 261.
 *
 * Nu există niciun răspuns printre ele, dinadins. Asta e tot cardul: întrebările
 * vin, iar tu ești singurul canal.
 *
 * Patru oameni diferiți, nu unul care scrie de patru ori — de aia fiecare mesaj
 * are alt chip.
 *
 * Lungimile contează mai mult decât ordinea: ultima e cea mai lungă, fiindcă stă
 * cel mai jos și se vede întreagă la orice lățime. Cele de deasupra se taie de
 * marginea cardului pe ecrane înguste, ca într-un fir derulat.
 *
 * ═══ DESPRE `zoom` ȘI `focus` ═══
 *
 * Pozele sunt portrete întregi, tăiate pătrat, dar fiecare e încadrat altfel: la
 * unele capul ține jumătate de cadru, la altele se vede tot bustul. Puse așa cum
 * sunt într-un cerc de 28px, chipul iese de vreo zece pixeli și nu se distinge
 * nimic.
 *
 * Nu am tăiat fișierele, ci le apropii din CSS: `zoom` e cât se mărește poza, iar
 * `focus` e punctul care rămâne pe loc când se mărește — adică mijlocul capului.
 * Sunt reglate una câte una, uitându-mă la ele; o valoare comună ar fi tăiat
 * creștetul la unele și ar fi lăsat prea mult aer la altele.
 *
 * Netăierea are și un motiv practic: dacă mâine se schimbă mărimea cercului sau
 * încadrarea, se ajustează două numere, nu se recomprimă pozele.
 */
export interface ProblemMessage {
  text: string;
  /** Numele expeditorului, pentru cititoarele de ecran. */
  name: string;
  photo: string;
  /** Cât se apropie poza, ca să încapă capul în cerc. */
  zoom: number;
  /** Punctul care rămâne pe loc la apropiere, în procente: `x% y%`. */
  focus: string;
}

export const PROBLEM_MESSAGES: ProblemMessage[] = [
  {
    text: "Bună ziua! Cum pot comanda?",
    name: "Andreea M.",
    photo: "/avatars/avatar1.webp",
    zoom: 2.1,
    focus: "50% 26%",
  },
  {
    text: "Aveți produsul acesta pe stoc?",
    name: "Ionuț P.",
    photo: "/avatars/avatar2.webp",
    zoom: 1.9,
    focus: "50% 28%",
  },
  {
    text: "Pot să plătesc cu cardul?",
    name: "Maria D.",
    photo: "/avatars/avatar4.webp",
    zoom: 2.0,
    focus: "50% 27%",
  },
  {
    text: "Unde pot vedea mai multe produse?",
    name: "Radu C.",
    photo: "/avatars/avatar3.webp",
    zoom: 2.9,
    focus: "52% 21%",
  },
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
