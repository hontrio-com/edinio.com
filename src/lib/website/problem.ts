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
  image: {
    /** Lipsește => se afișează substituentul. */
    src?: string;
    alt: string;
    /** Ce trebuie să arate imaginea. Se vede pe substituent. */
    hint: string;
  };
}

/**
 * Trei carduri, fiecare pentru altă durere: unde stau comenzile, cine face
 * hârtiile, cum arată magazinul. Nu cinci și nu cincisprezece — trei se rețin.
 */
export const PROBLEM_CARDS: ProblemCard[] = [
  {
    id: "comenzi",
    title: "Comenzile trăiesc în conversații.",
    description:
      "Una s-a pierdut între „mai aveți pe stoc?” și „am găsit în altă parte”, iar tu afli abia a doua zi.",
    image: {
      alt: "Comenzi amestecate printre mesaje, pe telefon",
      hint: "Conversație pe telefon, cu comenzi fără răspuns",
    },
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
