/*
  ═══════════════════════════════════════════════════════════════════════════════
  MAGISTRALA: SINGURA USA PRIN CARE IESE O MASURATOARE
  ═══════════════════════════════════════════════════════════════════════════════

  Componenta cheama `urmareste({ name: "cta_click", … })`. Atat. Ce se intampla
  mai departe — catre ce furnizori pleaca, sub ce nume, cu ce parametri — se
  hotaraste AICI si in adaptoare.

  ⚠ DE CE NU CHEAMA COMPONENTELE DIRECT `gtag`. Trei motive, si fiecare s-a vazut
  in proiectul asta:
    1. adaugarea unui furnizor ar cere umblat in zeci de componente
    2. paza anti-PII ar trebui repetata la fiecare chemare, si s-ar uita
    3. o componenta care stie de `gtag` nu se poate proba fara un browser

  ⚠ SI NU DOBOARA NIMIC. Orice cade aici — un adaptor, o verificare, o eroare de
  retea — se opreste aici. O masuratoare stricata n-are voie sa strice pagina
  omului. Asta e regula pe care o incalca cel mai des sistemele de tracking.
*/

import type { EvenimentEdinio } from "./evenimente";
import { clasificaPagina, grupPagina, type FelPagina, type GrupPagina } from "./pagini";
import { verificaFaraPii, EroarePii } from "./fara-pii";
import { eDepanare, eProductieMarketing } from "./mediu";

export type Adaptor = {
  nume: string;
  /** Furnizorul e gata sa primeasca? Daca nu, evenimentul intra la coada. */
  gata: () => boolean;
  trimite: (ev: EvenimentEdinio, context: { page_type: FelPagina; page_group: GrupPagina }) => void;
};

const adaptoare: Adaptor[] = [];

export function inregistreazaAdaptor(a: Adaptor): void {
  if (!adaptoare.some(x => x.nume === a.nume)) adaptoare.push(a);
}

/* ── Coada ─────────────────────────────────────────────────────────────────

  ⚠ DE CE E NEVOIE DE EA. Eticheta Google se incarca `afterInteractive`. Un
  eveniment tras dintr-un efect la montare — `page_view`, `article_view` — se
  produce INAINTE ca `gtag` sa existe. Fara coada, el se pierde tacut: exact
  felul de defect care se vede abia peste o luna, cand cineva se intreaba de ce
  paginile au mai putine vizualizari decat sesiuni.

  ⚠ PLAFON, ca sa nu creasca la nesfarsit daca un furnizor nu se incarca niciodata.
*/
type LaCoada = { ev: EvenimentEdinio; context: { page_type: FelPagina; page_group: GrupPagina }; adaptor: string };
const coada: LaCoada[] = [];
const PLAFON_COADA = 50;

/** Goleste coada pentru un adaptor care tocmai a devenit gata. */
export function goleste(numeAdaptor: string): void {
  const a = adaptoare.find(x => x.nume === numeAdaptor);
  if (!a || !a.gata()) return;
  for (let i = coada.length - 1; i >= 0; i--) {
    const item = coada[i];
    if (item.adaptor !== numeAdaptor) continue;
    coada.splice(i, 1);
    try { a.trimite(item.ev, item.context); } catch { /* vezi nota de sus */ }
  }
}

function contextul(): { page_type: FelPagina; page_group: GrupPagina } {
  const cale = typeof window === "undefined" ? null : window.location.pathname;
  const fel = clasificaPagina(cale);
  return { page_type: fel, page_group: grupPagina(fel) };
}

/**
 * Trimite un eveniment catre toti adaptorii care il vor.
 *
 * ⚠ VERIFICAREA ANTI-PII SE FACE O SINGURA DATA, AICI, inainte de orice adaptor.
 * In afara productiei ARUNCA — ca greseala sa fie vazuta de cine o scrie. In
 * productie se lasa balta si se scrie in consola: o masuratoare stricata n-are
 * voie sa doboare pagina.
 */
export function urmareste(ev: EvenimentEdinio): void {
  if (typeof window === "undefined") return;

  const { name, ...parametri } = ev;
  try {
    verificaFaraPii(name, parametri as Record<string, unknown>);
  } catch (e) {
    if (e instanceof EroarePii && eProductieMarketing()) {
      console.error("[edinio-marketing] eveniment oprit:", e.message);
      return;
    }
    throw e;
  }

  const context = contextul();
  if (eDepanare()) console.info("[edinio-marketing]", name, { ...parametri, ...context });

  for (const a of adaptoare) {
    try {
      if (a.gata()) { a.trimite(ev, context); continue; }
      if (coada.length >= PLAFON_COADA) coada.shift();
      coada.push({ ev, context, adaptor: a.nume });
    } catch (e) {
      /* ⚠ Un adaptor cazut nu-i opreste pe ceilalti, si nu opreste pagina. */
      console.error(`[edinio-marketing] adaptorul ${a.nume} a cazut:`, e);
    }
  }
}

/** Numai pentru probe: sterge starea dintre ele. */
export function resetPentruProbe(): void {
  adaptoare.length = 0;
  coada.length = 0;
}

/** Numai pentru probe: cate evenimente asteapta. */
export function lungimeCoada(): number {
  return coada.length;
}
