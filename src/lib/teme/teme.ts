import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import { DATE_DEMO_JUPITER } from "./jupiter/date-demo";
import { designJupiter, faraTexteleDemo, IDENTITATE_JUPITER } from "./jupiter/design";
import type { IdentitateTema, OptiuniTema, SetDateDemo } from "./tipuri";

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
  date: SetDateDemo;
  /**
   * Designul temei peste magazinul dat; cu `date`, si textele de exemplu ale sectiunilor ei; cu `baza`, peste designul
   * de acum al magazinului (sectiunile, blocurile si coloanele lui raman).
   */
  design: (ctx: DesignContext, date: SetDateDemo | null, baza?: StoreDesign, optiuni?: OptiuniTema) => StoreDesign;
  /** Inversul textelor demo din `design` („Șterge datele demo”, etapa 18.4): ce a ramas neschimbat din ele iese. */
  faraTexteleDemo: (design: StoreDesign, date: SetDateDemo) => { design: StoreDesign; schimbat: boolean };
  /** Culoarea, fundalul si fonturile: scrise in magazin, unde le regleaza fila „Stil” (`lib/teme/aplicare.ts`). */
  identitate: IdentitateTema;
  /**
   * Reglajele din `page_content` ale magazinului demo, ca demo-ul sa arate ca modelul (Jupiter: fara categoria pe card).
   * Doar pentru demo: la aplicare (etapa 17), reglajele comerciantului raman ale lui.
   */
  setariDemo: Record<string, unknown>;
}

export const TEME: readonly Tema[] = [
  {
    cheie: "jupiter",
    nume: "Jupiter",
    descriere: "Pentru magazine mari, cu multe categorii: bricolaj, casă și grădină. Căutare la vedere, meniu de categorii pe două niveluri și carduri de produs cu prețul în prim-plan.",
    slugDemo: "tema-jupiter",
    date: DATE_DEMO_JUPITER,
    design: designJupiter,
    faraTexteleDemo,
    identitate: IDENTITATE_JUPITER,
    setariDemo: { show_category_badges: false },
  },
];

export function temaDupaCheie(v: unknown): Tema | null {
  return TEME.find((t) => t.cheie === v) ?? null;
}

/**
 * Unde se vede demo-ul temei: azi magazinul ei, pe adresa platformei (`/tema-jupiter`); la etapa 19, subdomeniul ei
 * (`jupiter.edinio.com`).
 */
export function adresaDemo(tema: Pick<Tema, "slugDemo">): string {
  return `/${tema.slugDemo}`;
}
