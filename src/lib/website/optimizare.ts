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
];

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

/* ── Arcul care urcă scorurile ─────────────────────────────────────────────── */

/**
 * Numerele arcului.
 *
 * Rigiditatea e cea din componenta trimisă de client. AMORTIZAREA nu: acolo era
 * 60, iar proba a arătat de ce nu merge — la 60, arcul e amortizat de trei ori
 * peste prag (`60 / (2·√100) = 3`), iar modul lui lent se stinge cu `e^(-1,72·t)`.
 * Măsurat: **288 de cadre, adică 4,8 secunde** până se oprește. Un cadran care
 * urcă atât se citește ca blocat, nu ca animat — și pe pagina despre viteză, cu
 * atât mai rău.
 *
 * 20 e amortizarea CRITICĂ pentru rigiditatea 100 (`2·√100`): cel mai repede se
 * poate ajunge FĂRĂ să treci de valoare. Măsurat, se oprește în ~66 de cadre,
 * puțin peste o secundă. Iar „fără să treci" contează aici la propriu: un cadran
 * care sare o clipă la 103 ar arăta un scor care nu există.
 */
export const RIGIDITATE = 100;
export const AMORTIZARE = 20;
/** Sub atâta e oprit: se pune fix pe valoare și nu se mai cere alt cadru. */
export const PRAG_OPRIRE = 0.05;

/**
 * Un pas de integrare al arcului.
 *
 * Stă aici, ca funcție pură, și nu în componentă, dintr-un motiv practic:
 * `requestAnimationFrame` nu rulează într-o filă de fundal, deci mișcarea nu se
 * poate proba din browser. Așa se probează pe Node, unde chiar contează — că
 * ajunge la valoare, că nu trece de ea, și că se oprește.
 */
export function pasArc(
  x: number,
  viteza: number,
  tinta: number,
  dt: number,
): { x: number; viteza: number } {
  const vitezaNoua = viteza + (-RIGIDITATE * (x - tinta) - AMORTIZARE * viteza) * dt;
  return { x: x + vitezaNoua * dt, viteza: vitezaNoua };
}

/** Adevărat când arcul a ajuns și poate fi pus fix pe valoare. */
export function arcOprit(x: number, viteza: number, tinta: number): boolean {
  return Math.abs(x - tinta) < PRAG_OPRIRE && Math.abs(viteza) < PRAG_OPRIRE;
}
