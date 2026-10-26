import { CHEI_CONTINUT } from "@/lib/editor-magazin/noduri";
import type { DesignContext } from "./types";

/**
 * Continutul NEPUBLICAT al magazinului, tinut in ciorna de design (etapa 6 din
 * `docs/editor-magazin/PLAN.md`, decizia lui: „Totul la „Publică””).
 *
 * Pana la etapa 6, textele, listele, imaginile, logo-ul si culoarea se salvau direct in magazin
 * (`page_content`, `businesses`), iar designul astepta „Publică”. Acum asteapta si ele: cheile
 * atinse in editor stau in `storefront_design_draft`, sub `continut`, langa design. O singura
 * scriere, deci o singura garda de concurenta; „Renunță” (coloana `NULL`) le arunca pe amandoua;
 * „Publică” scrie intai continutul, apoi designul.
 *
 * Ce e aici sunt functii pure: le folosesc actiunile de server, rutele magazinului (in modul
 * editor) si editorul, la fel.
 */

/** Cheia ciornei sub care sta continutul. Parserul designului n-o cunoaste, deci n-o atinge. */
export const CHEIE_CONTINUT = "continut";

/**
 * Cheile din `page_content` pe care le poate tine ciorna: exact cele pe care le scrie editorul
 * (`CHEI_CONTINUT`). `permalinks`, `pagina_acasa`, SEO, modul magazinului, formularul de comanda
 * si catalogul le scriu alte ecrane, pe loc, si nu au ce cauta aici.
 */
export const CHEI_PC_CIORNA: ReadonlySet<string> = new Set(Object.values(CHEI_CONTINUT).flat());

/** Coloanele din `businesses` pe care le regleaza editorul. */
export const COLOANE_MAGAZIN_CIORNA = ["logo_url", "cover_url", "primary_color", "gallery"] as const;
export type ColoanaMagazinCiorna = (typeof COLOANE_MAGAZIN_CIORNA)[number];

export interface ContinutMagazinCiorna {
  logo_url?: string | null;
  cover_url?: string | null;
  primary_color?: string;
  gallery?: string[];
}

export interface ContinutCiorna {
  /** Cheile atinse din `page_content`, cu valoarea lor noua. */
  pc: Record<string, unknown>;
  /** Coloanele atinse din `businesses`. */
  magazin: ContinutMagazinCiorna;
  /**
   * Cheile din `page_content` care se SCOT la „Publică” (etapa 7): o versiune readusa din istoric in
   * care cheia lipsea, desi acum exista. Scoasa, nu `null`: magazinul cade pe implicitul lui, ca la un
   * magazin care n-a atins-o niciodata, iar un `null` scris ar fi fost o valoare noua. Ordonate, fara
   * dubluri, niciuna si in `pc`; lipseste cand e goala, ca ciornele de pana acum sa-si pastreze amprenta.
   */
  scoase?: string[];
}

export const CONTINUT_GOL: ContinutCiorna = Object.freeze({ pc: Object.freeze({}), magazin: Object.freeze({}) }) as ContinutCiorna;

/** Plafonul continutului din ciorna, separat de cel al designului (`MAX_DESIGN_BYTES`). */
export const MAX_CONTINUT_BYTES = 200_000;

/** Cate imagini poate avea galeria. Editorul nu are plafon; aici e doar o plasa. */
const MAX_GALERIE = 100;

const CULOARE_RE = /^#[0-9A-Fa-f]{6}$/;

function obiect(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Aceeasi regula ca imaginile din design (`parse.ts`): http(s) sau o cale a site-ului. */
function imagine(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s || s.length > 1000) return undefined;
  return /^(https?:\/\/|\/)/i.test(s) ? s : undefined;
}

/**
 * Parser total: pentru ORICE intrare intoarce un continut valid, cel mult gol.
 *
 * Valorile din `pc` raman cum le-a scris editorul: la salvarea directa de pana acum
 * (`updatePageContent`) nu se validau nici ele, le curata cititorii. Se taie doar cheile din
 * afara listei si `undefined`.
 */
export function parseContinutCiorna(raw: unknown): ContinutCiorna {
  const r = obiect(raw);
  const pc: Record<string, unknown> = {};
  for (const [cheie, valoare] of Object.entries(obiect(r.pc))) {
    if (CHEI_PC_CIORNA.has(cheie) && valoare !== undefined) pc[cheie] = valoare;
  }

  const m = obiect(r.magazin);
  const magazin: ContinutMagazinCiorna = {};
  for (const col of ["logo_url", "cover_url"] as const) {
    if (!(col in m)) continue;
    if (m[col] === null) magazin[col] = null;
    else {
      const url = imagine(m[col]);
      if (url) magazin[col] = url;
    }
  }
  if (typeof m.primary_color === "string" && CULOARE_RE.test(m.primary_color)) magazin.primary_color = m.primary_color;
  if (Array.isArray(m.gallery)) {
    magazin.gallery = m.gallery.map(imagine).filter((u): u is string => !!u).slice(0, MAX_GALERIE);
  }

  // Tot pe lista alba; o cheie si scrisa, si scoasa ramane scrisa.
  const scoase = Array.isArray(r.scoase)
    ? [...new Set(r.scoase.filter((k): k is string => typeof k === "string" && CHEI_PC_CIORNA.has(k) && !Object.hasOwn(pc, k)))].sort()
    : [];
  return scoase.length > 0 ? { pc, magazin, scoase } : { pc, magazin };
}

/** Continutul unei cioarne asa cum sta in coloana (designul, cu `continut` alaturi). */
export function continutDinCiorna(ciorna: unknown): ContinutCiorna {
  return parseContinutCiorna(obiect(ciorna)[CHEIE_CONTINUT]);
}

/** Schimba ciorna ceva in `page_content` (o cheie scrisa sau una scoasa)? */
export function atingeCheiPc(c: ContinutCiorna): boolean {
  return Object.keys(c.pc).length > 0 || (c.scoase?.length ?? 0) > 0;
}

/** Are ciorna vreun continut nepublicat? */
export function areContinut(c: ContinutCiorna): boolean {
  return atingeCheiPc(c) || Object.keys(c.magazin).length > 0;
}

/**
 * Ciorna de scris in coloana: designul, si continutul langa el doar cand exista. Fara continut
 * ramane EXACT obiectul de pana la etapa 6, deci cioarnele vechi si amprentele lor nu se schimba.
 */
export function ciornaCuContinut<T extends object>(design: T, continut: ContinutCiorna): T | (T & { continut: ContinutCiorna }) {
  return areContinut(continut) ? { ...design, [CHEIE_CONTINUT]: continut } : design;
}

/** `page_content` cu cheile din ciorna peste el, fara cele scoase. */
export function pcCuCiorna<T extends Record<string, unknown>>(pc: T, continut: ContinutCiorna): T {
  if (!atingeCheiPc(continut)) return pc;
  const out: Record<string, unknown> = { ...pc, ...continut.pc };
  for (const cheie of continut.scoase ?? []) delete out[cheie];
  return out as T;
}

/** Randul din `businesses` cu coloanele din ciorna peste el; doar cele atinse. */
export function magazinCuCiorna<T extends object>(business: T, continut: ContinutCiorna): T {
  const m = continut.magazin;
  if (Object.keys(m).length === 0) return business;
  return { ...business, ...m };
}

/** Contextul parserului de design, cu continutul din ciorna (culoarea, coperta, `page_content`). */
export function contextCuCiorna(ctx: DesignContext, continut: ContinutCiorna): DesignContext {
  if (!areContinut(continut)) return ctx;
  const m = continut.magazin;
  return {
    ...ctx,
    pageContent: pcCuCiorna(ctx.pageContent, continut),
    ...(m.primary_color !== undefined ? { primaryColor: m.primary_color } : {}),
    ...(m.cover_url !== undefined ? { coverUrl: m.cover_url } : {}),
  };
}

/**
 * JSON cu cheile ordonate, la orice adancime.
 *
 * ⚠ `jsonb` isi rearanjeaza cheile (dupa lungime, apoi dupa octeti): un obiect citit din baza si
 * acelasi obiect de pe ecran dau alt `JSON.stringify`. Designul scapa prin parser, care isi
 * reface obiectele intr-o ordine fixa; valorile libere din `pc` nu trec prin el.
 */
export function jsonCanonic(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : jsonCanonic(x))).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const chei = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${chei.map((k) => `${JSON.stringify(k)}:${jsonCanonic(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Amprenta continutului, pentru garda de concurenta si pentru „are modificari”. */
export function amprentaContinut(c: ContinutCiorna): string {
  return jsonCanonic(c);
}

/** Cat ocupa continutul in coloana, aproximativ (pentru `MAX_CONTINUT_BYTES`). */
export function marimeContinut(c: ContinutCiorna): number {
  return JSON.stringify(c).length;
}
