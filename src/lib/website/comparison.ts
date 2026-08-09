/**
 * Tabelul de comparație Edinio vs. celelalte platforme.
 *
 * ═══ TEXTELE SUNT ALE CLIENTULUI ═══
 *
 * Titlul și descrierea au fost date cuvânt cu cuvânt (2026-08-09), iar rândurile
 * tabelului vin dintr-un PDF trimis de el, din care s-a extras DOAR informația.
 * Nu se rescriu, nu se scurtează, nu se „îmbunătățesc" fără să întrebi.
 *
 * ═══ E PUBLICITATE COMPARATIVĂ ═══
 *
 * Un tabel care ne pune lângă concurenți nominalizați intră sub reguli: fiecare
 * afirmație trebuie să fie verificabilă și să compare ACEEAȘI caracteristică la
 * toate platformele. De aceea valorile sunt descriptive („Prin aplicații", „Prin
 * pluginuri"), nu judecăți — și de aceea nota de la sfârșit există și rămâne:
 * ea spune exact ce înseamnă „X" și îngustează afirmația la ce se poate susține.
 *
 * Dacă cineva adaugă un rând, regula e aceeași: se descrie cum se face lucrul pe
 * fiecare platformă, nu cât de bună e platforma.
 */

export const COMPARISON_EYEBROW = "Comparație";

export const COMPARISON_TITLE = [
  "Construit în România.",
  "Gândit pentru antreprenorii români.",
];

export const COMPARISON_LEAD =
  "Nu trebuie să adaptezi o platformă globală la piața locală. Edinio a fost construit de la început pentru afacerile din România.";

/**
 * Platformele, în ordinea din PDF.
 *
 * Edinio stă separat, nu în listă: e coloana care se evidențiază, are alt desen
 * și pe telefon apare prima în fiecare card. Băgat în aceeași listă, ar fi
 * trebuit tratat cu excepții în trei locuri.
 */
export const COMPARISON_US = "Edinio";

export const COMPARISON_RIVALS = ["Shopify", "WooCommerce", "OpenCart", "Wix"] as const;

export type ComparisonRival = (typeof COMPARISON_RIVALS)[number];

export interface ComparisonRow {
  /** Criteriul, exact ca în PDF. */
  criteriu: string;
  /** Ce oferă Edinio. */
  edinio: string;
  /** Câte o valoare pentru fiecare concurent, în ordinea din `COMPARISON_RIVALS`. */
  rivali: [string, string, string, string];
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    criteriu: "Construit special pentru România",
    edinio: "Da",
    rivali: ["Platformă globală", "Platformă globală", "Platformă globală", "Platformă globală"],
  },
  {
    criteriu: "Curieri românești integrați nativ",
    edinio: "Da",
    rivali: ["Prin aplicații", "Prin pluginuri", "Prin extensii", "Aplicații / parteneri"],
  },
  {
    criteriu: "SmartBill / Oblio / FGO integrate direct",
    edinio: "Da",
    rivali: ["Aplicații terțe", "Prin pluginuri", "Prin extensii", "Soluții externe"],
  },
  {
    criteriu: "Fără pluginuri pentru fluxul local de bază",
    edinio: "Da",
    rivali: ["Nu", "Nu", "Nu", "Parțial"],
  },
  {
    criteriu: "AWB + factură + comandă în același flux",
    edinio: "Inclus nativ",
    rivali: ["Prin aplicații", "Prin pluginuri", "Prin extensii", "Depinde de integrare"],
  },
  {
    criteriu: "Mentenanță și asistență gratuită",
    edinio: "Da",
    rivali: ["X", "X", "X", "X"],
  },
  {
    criteriu: "Configurat din start pentru vânzarea în România",
    edinio: "Da",
    rivali: ["Necesită configurare", "Necesită configurare", "Necesită configurare", "Necesită configurare"],
  },
];

/**
 * Nota de sub tabel.
 *
 * NU e un detaliu de subsol care se poate tăia dacă strânge locul: e chiar
 * lămurirea care face rândul cu „X" o afirmație susținută, nu una absolută.
 */
export const COMPARISON_NOTE =
  "Notă: X indică faptul că mentenanța și asistența gratuită, în forma inclusă de Edinio, nu sunt incluse ca beneficiu echivalent în comparație.";
