import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";
import { DATE_DEMO_JUPITER, MENIU_DEMO_JUPITER } from "./jupiter/date-demo";
import { designJupiter, faraTexteleDemo, IDENTITATE_JUPITER } from "./jupiter/design";
import { CHEIE_MAGAZIN_DEMO } from "./gazde-demo";
import { MARTE, MERCUR, TERRA, VENUS } from "./lotul-1";
import { NEPTUN, SATURN, SIRIUS, URANUS } from "./lotul-2";
import { ALTAIR, POLARIS, RIGEL, VEGA } from "./lotul-3";
import { ALDEBARAN, ANTARES, ARCTURUS, CAPELLA } from "./lotul-4";
import { CANOPUS, DENEB, PROCYON, SPICA } from "./lotul-5";
import { ACHERNAR, BELLATRIX, BETELGEUSE, REGULUS } from "./lotul-6";
import { ALNILAM, ELECTRA, MAIA, MINTAKA, MIRA } from "./lotul-7";
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
  /** Si subdomeniul demo-ului (`<cheie>.edinio.com`) si prefixul codurilor produselor demo. Din `CHEI_TEME` (gazde-demo). */
  cheie: string;
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
   * Reglajele din `page_content` ale magazinului demo, ca demo-ul sa arate ca modelul (Jupiter: fara categoria pe card),
   * plus semnul magazinului demo (`magazin_demo`: fara comenzi, etapa 19.2). Doar pentru demo: la aplicare (etapa 17),
   * reglajele comerciantului raman ale lui.
   */
  setariDemo: Record<string, unknown>;
  /** Sigla magazinului demo (`businesses.logo_url`), din `public/`. Doar a lui: importul n-o atinge pe a comerciantului. */
  siglaDemo: string;
  /** Sloganul magazinului demo (`businesses.tagline`), din subsol. Tot doar al lui. */
  sloganDemo: string;
  /**
   * Magazinul demo, cand `seamana-demo.ts` il face singur (temele 2-30, etapa 24; Jupiter are `magazinul-demo.sql`):
   * numele, descrierea si emailul lui de exemplu.
   */
  magazinDemo?: { nume: string; descriere: string; email: string };
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
    setariDemo: { show_category_badges: false, [CHEIE_MAGAZIN_DEMO]: true, menu: MENIU_DEMO_JUPITER, favicon_url: "/teme/jupiter/favicon.png" },
    siglaDemo: "/teme/jupiter/logo.webp",
    sloganDemo: "Tot ce trebuie pentru casă, grădină și șantier.",
  },
  // Temele 2-30 (etapa 24), pe loturi, in ordinea lui.
  MERCUR,
  VENUS,
  TERRA,
  MARTE,
  SATURN,
  URANUS,
  NEPTUN,
  SIRIUS,
  VEGA,
  ALTAIR,
  RIGEL,
  POLARIS,
  ANTARES,
  ARCTURUS,
  ALDEBARAN,
  CAPELLA,
  DENEB,
  SPICA,
  PROCYON,
  CANOPUS,
  REGULUS,
  BELLATRIX,
  BETELGEUSE,
  ACHERNAR,
  MIRA,
  ALNILAM,
  MINTAKA,
  ELECTRA,
  MAIA,
];

export function temaDupaCheie(v: unknown): Tema | null {
  return TEME.find((t) => t.cheie === v) ?? null;
}

/**
 * Unde se vede demo-ul temei („Vezi demo”, etapa 19): pe subdomeniul ei (`https://jupiter.edinio.com`; local, pe
 * `http://jupiter.localhost:3000`). Pe o gazda de desfasurare (`*.vercel.app`) subdomeniul nu exista, deci magazinul
 * demo pe adresa platformei (`/tema-jupiter`). `host` = antetul `Host` al cererii paginii „Teme”.
 */
export function adresaDemo(tema: Pick<Tema, "cheie" | "slugDemo">, host: string | null | undefined): string {
  const [gazda = "", port] = (host ?? "").trim().toLowerCase().split(":");
  if (gazda === "localhost") return `http://${tema.cheie}.localhost${port ? `:${port}` : ""}`;
  if (gazda === "www.edinio.com" || gazda === "edinio.com") return `https://${tema.cheie}.edinio.com`;
  return `/${tema.slugDemo}`;
}

/**
 * Miniatura vie de pe pagina „Teme”: pe ACEEASI origine cu panoul, fiindca vitrina raspunde cu
 * `X-Frame-Options: SAMEORIGIN`, deci un cadru de pe subdomeniu n-ar fi aratat nimic.
 */
export function adresaMiniaturii(tema: Pick<Tema, "slugDemo">): string {
  return `/${tema.slugDemo}`;
}
