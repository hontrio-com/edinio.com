/**
 * Ce ramane afara din feedul Compari si ce i se spune comerciantului.
 *
 * ⚠ AICI E DOAR VOCABULARUL, NU HOTARAREA. Cine hotaraste e `motivulLipseiDinCompari` din `feed.ts`, folosit chiar de
 * generator ca sa opreasca produsul. O a doua judecata, scrisa pentru ecran, s-ar fi departat de prima la prima
 * schimbare, iar panoul ar fi spus „pleaca tot” despre un produs care nu pleaca (lectia catalogului Meta).
 *
 * ⚠ `Record<MotivLipsaCompari, ...>` de mai jos face ca un motiv nou fara text sa nu compileze.
 *
 * Fisierul il importa si panoul, care e componenta de client: de aceea are doar tipuri si texte.
 */

import { MOTIV_PRET_CARE_MINTE } from "@/lib/customization/pretul-din-catalog-minte";

/** Motivele pentru care un produs activ nu ajunge in feed. */
export type MotivLipsaCompari = "pret-care-minte" | "fara-imagine" | "fara-categorie" | "fara-pret";

/** Un produs lasat afara, asa cum il primeste panoul. */
export interface ProdusLasatAfaraCompari {
  id: string;
  name: string;
  motiv: MotivLipsaCompari;
}

/** Ce spune panoul despre feed: cate produse pleaca, cate sunt ascunse de Compari si cate raman afara. */
export interface RezumatCompari {
  /** Produsele active ale magazinului. */
  active: number;
  /** Cate dintre ele sunt in feed (cu tot cu cele epuizate). */
  inFeed: number;
  /** Cate dintre cele din feed pleaca marcate „NO”: Compari nu le afiseaza pana revin in stoc. */
  epuizate: number;
  /** Cate raman afara. Numarul e pe TOATE, nu doar pe cele din `exemple`. */
  lasate: number;
  /** Primele produse lasate afara, cu motivul fiecaruia. */
  exemple: ProdusLasatAfaraCompari[];
}

/*
 * ⚠ Textele de mai jos le citeste COMERCIANTUL, deci au diacritice, ca restul panoului. Comentariile si codul
 * raman fara, ca peste tot in proiect.
 */
export const MOTIVE_COMPARI: Record<MotivLipsaCompari, { eticheta: string; explicatie: string }> = {
  "pret-care-minte": {
    eticheta: "Prețul din catalog nu e prețul plătit",
    explicatie: MOTIV_PRET_CARE_MINTE,
  },
  "fara-imagine": {
    eticheta: "Fără imagine",
    explicatie:
      "Un comparator de prețuri nu poate arăta un produs fără poză. Adaugă-i cel puțin o imagine și intră "
      + "singur în feed la următoarea descărcare.",
  },
  "fara-categorie": {
    eticheta: "Fără categorie",
    explicatie:
      "Categoria e câmp obligatoriu la Compari: după ea își așază produsele. Alege o categorie pentru produs.",
  },
  "fara-pret": {
    eticheta: "Fără preț",
    explicatie: "Produsul are prețul zero, iar Compari cere un preț pentru fiecare produs. Completează prețul.",
  },
};
