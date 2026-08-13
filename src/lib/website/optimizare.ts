/**
 * Conținutul paginii „Optimizare".
 *
 * Textele sunt ale clientului, date cuvânt cu cuvânt (2026-08-13). Nu se rescriu.
 */

export const PERFORMANTA = {
  eyebrow: "Performanță",
  titlu: "Un magazin rapid se simte de la primul click.",
  descriere:
    "Edinio este construit pentru încărcare rapidă și o experiență fluidă, indiferent dacă magazinul este accesat de pe telefon sau desktop.",
} as const;

export interface CardPerformanta {
  /** Cheie stabilă pentru `key`, chiar dacă se schimbă titlul. */
  id: string;
  titlu: string;
  descriere: string;
}

/**
 * Cardurile secțiunii.
 *
 * ⚠ NEÎNCHEIATĂ. Clientul a cerut TREI carduri și a dat textele doar pentru
 * primul (2026-08-13). Celelalte două se adaugă aici, în ordine, când vin
 * textele — nu trebuie schimbat nimic altceva.
 *
 * ⚠ Cât timp e unul singur, teancul care se strânge la derulare nu se vede: el
 * are nevoie de cel puțin două carduri ca să aibă ce acoperi. Nu e o lipsă a
 * desenului, e o consecință a listei.
 */
export const CARDURI_PERFORMANTA: CardPerformanta[] = [
  {
    id: "incarcare",
    titlu: "Încărcare rapidă",
    descriere:
      "Paginile magazinului sunt construite și optimizate pentru a se încărca cât mai rapid, fără a ține clienții să aștepte.",
  },
  {
    id: "imagini",
    titlu: "Imagini optimizate",
    descriere:
      "Imaginile produselor sunt livrate eficient, astfel încât să păstrăm calitatea fără să încetinim inutil magazinul.",
  },
];

/**
 * Ilustrația cardului „Imagini optimizate": aceeași poză de două ori, cu
 * greutatea scrisă sub fiecare.
 *
 * ⚠ ACEEAȘI POZĂ, DINADINS. Ideea cardului e că imaginea ARATĂ LA FEL și doar
 * cântărește altceva. Două fișiere diferite ar fi spus altceva — că a doua e mai
 * mică pentru că e mai proastă.
 *
 * `inainte` e cifra dată de client: cât are o fotografie ieșită dintr-un telefon.
 * `dupa` NU e scris de mână — se citește chiar din fișierul pe care îl trimitem,
 * la construirea paginii. Vezi `PanouImagini`. Un număr scris aici ar fi rămas în
 * urmă la prima reîncărcare a pozei, iar panoul ar fi arătat o greutate pe care
 * n-o are nimic.
 */
export const IMAGINE_OPTIMIZATA = {
  /** Fișierul trimis către vizitator. Lipsă = se vede substituentul. */
  src: "/optimizare/produs.jpg",
  alt: "",
  /** Cât are aceeași poză nefolosită, direct din telefon. Cifra clientului. */
  inainte: "5 MB",
  /** Se folosește doar dacă fișierul lipsește de pe disc la construire. */
  dupaDeRezerva: "câțiva KB",
  hint: "Fotografie de produs",
} as const;

/**
 * Scorurile arătate în ilustrația cu PageSpeed Insights.
 *
 * ⚠⚠ NUMERELE ASTEA SUNT DE ÎNLOCUIT CU O MĂSURĂTOARE ADEVĂRATĂ.
 *
 * Panoul arată ca rezultatul unei unelte, deci se citește ca DOVADĂ, nu ca
 * desen. Pe o pagină comercială, o dovadă inventată e o afirmație pe care n-o
 * poate susține nimeni — și e cea mai ușor de verificat dintre toate: oricine
 * poate deschide pagespeed.web.dev și rula chiar magazinul lui.
 *
 * Ce trebuie făcut înainte de lansare: se rulează PageSpeed Insights pe un
 * magazin Edinio real, pe MOBIL (acolo scorurile sunt mai mici, deci ăla e
 * numărul onest), și se trec aici cele patru valori obținute, cu data rulării.
 * Clientul a cerut „toate peste 90"; dacă măsurătoarea nu dă asta, se schimbă
 * ori magazinul ales, ori afirmația — nu numerele.
 *
 * Etichetele sunt cele patru ale uneltei, în ordinea din ea.
 */
export interface ScorPageSpeed {
  eticheta: string;
  scor: number;
}

export const SCORURI_PAGESPEED: ScorPageSpeed[] = [
  { eticheta: "Performanță", scor: 96 },
  { eticheta: "Accesibilitate", scor: 98 },
  { eticheta: "Bune practici", scor: 100 },
  { eticheta: "SEO", scor: 100 },
];

/**
 * Pragurile de culoare ale uneltei, ca să nu fie inventate.
 *
 * PageSpeed Insights colorează un scor verde de la 90 în sus, portocaliu între
 * 50 și 89, roșu sub 50. Culorile de mai jos sunt chiar ale lui.
 */
export const PRAG_BUN = 90;
export const PRAG_MEDIU = 50;

export const CULORI_SCOR = {
  bun: "#0CCE6B",
  mediu: "#FFA400",
  slab: "#FF4E42",
} as const;

/**
 * Culoarea inelului pentru un scor.
 *
 * Se socotește, nu se scrie de mână: dacă cineva coboară vreodată un scor sub 90
 * fără să schimbe culoarea, panoul ar arăta un verde care nu i se cuvine — adică
 * ar minți exact în felul în care unealta nu minte niciodată.
 */
export function culoareScor(scor: number): string {
  if (scor >= PRAG_BUN) return CULORI_SCOR.bun;
  if (scor >= PRAG_MEDIU) return CULORI_SCOR.mediu;
  return CULORI_SCOR.slab;
}
