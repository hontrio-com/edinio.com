/**
 * Secțiunea „Problema" de pe pagina de acasă.
 *
 * Textele stau aici ca să se schimbe fără să umbli în JSX.
 *
 * `COMPLAINTS` e împărțit pe rânduri DE MÂNĂ, nu tăiat automat. Rândurile sunt
 * mai late decât cardul și plutesc, unul dus, unul întors, așa că prin fața
 * ochilor trec toate, pe rând. Ordinea în listă nu mai contează cât conta când
 * stăteau pe loc, dar lungimile da: un rând din plângeri scurte trece vizibil
 * mai repede prin dreptul cardului decât unul din plângeri lungi. Ține-le cam pe
 * aceeași măsură.
 *
 * Al patrulea rând nu se pune fără să te uiți la înălțimea cardului pe telefon.
 */

export const PROBLEM_EYEBROW = "Problema";

/**
 * Titlul, rupt de mână în două rânduri.
 *
 * Lăsat într-un singur șir, se rupea unde apuca („Produsul tău este bun.
 * Magazinul online / lasă de dorit."), adică fix peste mijlocul propoziției a
 * doua. Aici toată puterea stă în cele două afirmații puse una sub alta: laudă,
 * apoi palmă. Fiecare intrare din listă e un rând.
 */
export const PROBLEM_TITLE = [
  "Produsul tău este bun.",
  "Magazinul online lasă de dorit.",
];

export const PROBLEM_LEAD =
  "Pierzi comenzi în fiecare zi, nu din cauza produsului, ci a magazinului: se încarcă greu, nu inspiră încredere și îl lasă pe client să plece fără să cumpere.";

export const COMPLAINTS: string[][] = [
  [
    "Scrii AWB-urile de mână, unul câte unul",
    "Stocul de pe site nu e cel din depozit",
    "Comenzile se pierd printre mesaje",
    "Nu poți încasa cu cardul",
    "Site-ul se încarcă greu pe telefon",
  ],
  [
    "Nu apari în Google",
    "Magazinul arată ca acum zece ani",
    "Facturile le faci seara, în Excel",
    "Fiecare modificare cere un programator",
    "Coșurile abandonate rămân abandonate",
  ],
  [
    "Nu știi ce s-a vândut și ce a rămas",
    "Mentenanța costă cât abonamentul",
    "Vinzi doar pe WhatsApp și pe Facebook",
    "Clienții întreabă cât costă transportul",
    "Ai plătit un site care n-a fost gata niciodată",
  ],
];
