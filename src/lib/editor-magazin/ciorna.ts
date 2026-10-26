import { anuleaza, istoricGol, noteaza, reface, type Istoric } from "./istoric";
import { rederiva } from "./derivare";
import {
  CONTINUT_GOL,
  amprentaContinut,
  areContinut,
  contextCuCiorna,
  jsonCanonic,
  pcCuCiorna,
  type ContinutCiorna,
  type ContinutMagazinCiorna,
} from "@/lib/storefront/design/continut-ciorna";
import type { DesignContext, StoreDesign } from "@/lib/storefront/design/types";

/**
 * Ciorna editorului unic: designul SI continutul nepublicat, impreuna (etapa 6 din
 * `docs/editor-magazin/PLAN.md`, decizia lui: „Totul la „Publică””).
 *
 * Un singur istoric pentru amandoua: Anuleaza desface ultima modificare, fie ea un banner, un
 * text sau varianta unei sectiuni. Fiecare pas tine perechea intreaga, deci un design si
 * continutul din care a fost derivat nu se pot desparti la Anuleaza.
 *
 * Functii pure: hook-ul (`useCiornaDesign`) le cheama, probele le verifica fara React.
 */

export interface Ciorna {
  design: StoreDesign;
  continut: ContinutCiorna;
}

export interface StareCiorna {
  ciorna: Ciorna;
  istoric: Istoric<Ciorna>;
}

export type ActiuneCiorna =
  | { tip: "aplica"; urmatorul: StoreDesign | ((d: StoreDesign) => StoreDesign); cheie: string | null; acum: number }
  | {
      tip: "aplicaContinut";
      fn: (c: ContinutCiorna) => ContinutCiorna;
      /** Contextul parserului din ce e PUBLICAT: peste el se pune continutul ciornei. */
      ctxPublicat: DesignContext;
      cheie: string | null;
      acum: number;
    }
  | { tip: "anuleaza" }
  | { tip: "reface" }
  /**
   * O versiune din istoric readusa in editor (etapa 7): un pas ca oricare altul, deci Anuleaza
   * aduce inapoi ciorna de dinainte. Spre deosebire de `inlocuieste`, care uita tot.
   */
  | { tip: "readu"; ciorna: Ciorna; acum: number }
  /** Dupa Publica sau Renunta: o ciorna noua, fara istoric. */
  | { tip: "inlocuieste"; ciorna: Ciorna };

export function stareInitiala(ciorna: Ciorna): StareCiorna {
  return { ciorna, istoric: istoricGol<Ciorna>() };
}

export function reductorCiorna(stare: StareCiorna, a: ActiuneCiorna): StareCiorna {
  const { ciorna } = stare;
  switch (a.tip) {
    case "aplica": {
      const design = typeof a.urmatorul === "function" ? a.urmatorul(ciorna.design) : a.urmatorul;
      // Operatiile intorc ACELASI obiect cand n-au ce face (`edit.ts`): nu e un pas.
      if (design === ciorna.design) return stare;
      return { ciorna: { ...ciorna, design }, istoric: noteaza(stare.istoric, ciorna, { cheie: a.cheie, acum: a.acum }) };
    }
    case "aplicaContinut": {
      const continut = a.fn(ciorna.continut);
      if (continut === ciorna.continut || amprentaContinut(continut) === amprentaContinut(ciorna.continut)) return stare;
      // Designul se re-deriva din continutul nou: un rand de produse adaugat apare in arbore, un
      // banner nou schimba hero-ul. Parserul pastreaza alegerile omului (`derivare.ts`).
      const design = rederiva(ciorna.design, contextCuCiorna(a.ctxPublicat, continut));
      return { ciorna: { design, continut }, istoric: noteaza(stare.istoric, ciorna, { cheie: a.cheie, acum: a.acum }) };
    }
    case "anuleaza": {
      const pas = anuleaza(stare.istoric, ciorna);
      return pas ? { ciorna: pas.stare, istoric: pas.istoric } : stare;
    }
    case "reface": {
      const pas = reface(stare.istoric, ciorna);
      return pas ? { ciorna: pas.stare, istoric: pas.istoric } : stare;
    }
    case "readu":
      // Versiunea care e deja pe ecran nu e un pas.
      if (amprentaCiornei(a.ciorna) === amprentaCiornei(ciorna)) return stare;
      return { ciorna: a.ciorna, istoric: noteaza(stare.istoric, ciorna, { cheie: null, acum: a.acum }) };
    case "inlocuieste":
      return stareInitiala(a.ciorna);
  }
}

/** Amprenta perechii, pentru „e deja salvata?” si „are modificari?”. */
export function amprentaCiornei(c: Ciorna): string {
  return `${JSON.stringify(c.design)}|${amprentaContinut(c.continut)}`;
}

/** Ce e publicat acum din continut: tot `page_content` si cele patru coloane din `businesses`. */
export interface ContinutPublicat {
  pc: Record<string, unknown>;
  magazin: Required<Pick<ContinutMagazinCiorna, "primary_color">> & {
    logo_url: string | null;
    cover_url: string | null;
    gallery: string[];
  };
}

/**
 * Scrie in ciorna cheile schimbate din `page_content`. O cheie adusa inapoi la valoarea publicata
 * iese din ciorna: punctul „nepublicat” din arbore si „Publică” nu mai au de ce sa o poarte.
 * O cheie scrisa nu mai e nici scoasa (`scoase`, etapa 7): omul a ales o valoare pentru ea.
 * Intoarce ACELASI obiect cand nu se schimba nimic.
 */
export function cuCheilePc(c: ContinutCiorna, schimbari: Record<string, unknown>, publicat: ContinutPublicat): ContinutCiorna {
  const pc = { ...c.pc };
  const scoase = new Set(c.scoase ?? []);
  for (const [cheie, valoare] of Object.entries(schimbari)) {
    scoase.delete(cheie);
    if (jsonCanonic(valoare) === jsonCanonic(publicat.pc[cheie])) delete pc[cheie];
    else pc[cheie] = valoare;
  }
  if (jsonCanonic(pc) === jsonCanonic(c.pc) && scoase.size === (c.scoase?.length ?? 0)) return c;
  const urmator: ContinutCiorna = { pc, magazin: c.magazin };
  if (scoase.size > 0) urmator.scoase = [...scoase].sort();
  return urmator;
}

/** La fel, pentru coloanele din `businesses`. */
export function cuColoanele(c: ContinutCiorna, schimbari: ContinutMagazinCiorna, publicat: ContinutPublicat): ContinutCiorna {
  const magazin: ContinutMagazinCiorna = { ...c.magazin };
  for (const [cheie, valoare] of Object.entries(schimbari) as [keyof ContinutMagazinCiorna, unknown][]) {
    if (jsonCanonic(valoare) === jsonCanonic(publicat.magazin[cheie])) delete magazin[cheie];
    else (magazin as Record<string, unknown>)[cheie] = valoare;
  }
  return jsonCanonic(magazin) === jsonCanonic(c.magazin) ? c : { ...c, magazin };
}

/** Ce devine publicat dupa un „Publică” reusit: ciorna peste ce era. */
export function dupaPublicare(publicat: ContinutPublicat, c: ContinutCiorna): ContinutPublicat {
  if (!areContinut(c)) return publicat;
  return { pc: pcCuCiorna(publicat.pc, c), magazin: { ...publicat.magazin, ...c.magazin } as ContinutPublicat["magazin"] };
}

export { CONTINUT_GOL };
