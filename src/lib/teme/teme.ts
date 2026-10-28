import { DATE_DEMO_JUPITER } from "./jupiter/date-demo";
import type { SetDateDemo } from "./tipuri";

/*
  ═══════════════════════════════════════════════════════════════════════════
  TEMELE MAGAZINULUI (etapele 16-19 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Cerut de el (28.10.2026): teme intregi, optionale, „sa se aplice direct pe magazinul lui”, cu nume de planete, demo pe
  subdomenii si „Importare date demo”. Prima e Jupiter, dupa dedeman.ro.

  ⚠ O tema nu se aplica niciodata singura: magazinele de azi raman exact cum sunt pana o alege comerciantul.
*/

export interface Tema {
  /** Si subdomeniul demo-ului (`<cheie>.edinio.com`) si prefixul codurilor produselor demo. */
  cheie: "jupiter";
  nume: string;
  descriere: string;
  /** Magazinul demo al temei, cu datele ei. */
  slugDemo: string;
  /** Culoarea principala, pentru cardul temei. */
  culoare: string;
  date: SetDateDemo;
}

export const TEME: readonly Tema[] = [
  {
    cheie: "jupiter",
    nume: "Jupiter",
    descriere: "Pentru magazine mari, cu multe categorii: bricolaj, casă și grădină. Căutare la vedere, meniu de categorii pe două niveluri și carduri de produs cu prețul în prim-plan.",
    slugDemo: "tema-jupiter",
    culoare: "#215196",
    date: DATE_DEMO_JUPITER,
  },
];

export function temaDupaCheie(v: unknown): Tema | null {
  return TEME.find((t) => t.cheie === v) ?? null;
}
