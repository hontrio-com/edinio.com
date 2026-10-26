import { parseStoreDesign } from "@/lib/storefront/design/parse";
import {
  CHEI_PC_CIORNA,
  COLOANE_MAGAZIN_CIORNA,
  contextCuCiorna,
  jsonCanonic,
  parseContinutCiorna,
  type ContinutCiorna,
  type ContinutMagazinCiorna,
} from "@/lib/storefront/design/continut-ciorna";
import type { DesignContext } from "@/lib/storefront/design/types";
import type { Ciorna, ContinutPublicat } from "./ciorna";

/**
 * Istoricul publicarilor (etapa 7 din `docs/editor-magazin/PLAN.md`): „revino la ce era ieri”.
 *
 * O versiune e ce a dus un „Publică” in magazin: designul publicat si continutul pe care il
 * regleaza editorul (cheile lui din `page_content` si cele patru coloane din `businesses`). Readusa,
 * nu ajunge in magazin: intra in ciorna, ca orice modificare, si pleaca la clienti abia la
 * „Publică”, care pastreaza la randul lui o versiune noua. Deci nimic nu se pierde.
 *
 * Functii pure: actiunile de server, editorul si probele le folosesc la fel.
 */

/** Cate versiuni se pastreaza pe magazin; cele mai vechi se sterg la scriere. */
export const VERSIUNI_PASTRATE = 30;

/**
 * `publicare` = ce a dus un „Publică” in magazin; `inainte` = ce era in magazin inaintea primei
 * versiuni, ca si primul „Publică” sa se poata desface.
 */
export type OrigineVersiune = "publicare" | "inainte";

export interface VersiuneInLista {
  id: string;
  /** Data publicarii (la `inainte`: a publicarii de dinainte, cand se stie). */
  la: string;
  origine: OrigineVersiune;
}

/** Ce se pastreaza din continut: cheile editorului aflate in `page_content`, plus cele patru coloane. */
export function instantaneuContinut(pc: Record<string, unknown>, magazin: ContinutPublicat["magazin"]): ContinutCiorna {
  const chei: Record<string, unknown> = {};
  for (const cheie of CHEI_PC_CIORNA) {
    if (Object.hasOwn(pc, cheie) && pc[cheie] !== undefined) chei[cheie] = pc[cheie];
  }
  return {
    pc: chei,
    magazin: { logo_url: magazin.logo_url, cover_url: magazin.cover_url, primary_color: magazin.primary_color, gallery: magazin.gallery },
  };
}

/**
 * Ciorna care face magazinul sa arate ca in versiune, socotita fata de ce e PUBLICAT acum.
 *
 * In ciorna intra doar ce difera, ca dupa orice modificare (`cuCheilePc`): o cheie din versiune egala
 * cu cea publicata nu are ce cauta acolo. O cheie care lipsea din versiune, dar exista acum, se SCOATE
 * (`scoase`): altfel revenirea la „Cum era înainte” ar fi pastrat, de pilda, fundalul ales dupa.
 * Designul se parseaza cu contextul versiunii, ca randurile de produse ale ei sa nu iasa ca orfane.
 */
export function ciornaDinVersiune(
  v: { design: unknown; continut: unknown },
  publicat: ContinutPublicat,
  ctxPublicat: DesignContext,
): Ciorna {
  const inVersiune = parseContinutCiorna(v.continut);
  const pc: Record<string, unknown> = {};
  const scoase: string[] = [];
  for (const cheie of CHEI_PC_CIORNA) {
    const acum = Object.hasOwn(publicat.pc, cheie) && publicat.pc[cheie] !== undefined;
    if (Object.hasOwn(inVersiune.pc, cheie)) {
      if (!acum || jsonCanonic(inVersiune.pc[cheie]) !== jsonCanonic(publicat.pc[cheie])) pc[cheie] = inVersiune.pc[cheie];
    } else if (acum) {
      scoase.push(cheie);
    }
  }
  const magazin: ContinutMagazinCiorna = {};
  for (const col of COLOANE_MAGAZIN_CIORNA) {
    if (!(col in inVersiune.magazin)) continue;
    const valoare = inVersiune.magazin[col];
    if (jsonCanonic(valoare) !== jsonCanonic(publicat.magazin[col])) (magazin as Record<string, unknown>)[col] = valoare;
  }
  const continut: ContinutCiorna = scoase.length > 0 ? { pc, magazin, scoase: scoase.sort() } : { pc, magazin };
  return { design: parseStoreDesign(v.design, contextCuCiorna(ctxPublicat, continut)), continut };
}

/**
 * „În magazin acum”: versiunea care poarta CHIAR data publicarii din magazin. Nu „cea mai noua”:
 * daca scrierea unei versiuni a cazut, cea mai noua din lista nu mai e ce vad clientii.
 */
export function esteInMagazin(la: string, publicatLa: string | null): boolean {
  if (!publicatLa) return false;
  const a = Date.parse(la);
  return Number.isFinite(a) && a === Date.parse(publicatLa);
}

/** Ziua unei clipe, `AAAA-LL-ZZ`, in fusul dat (implicit, al browserului). */
function ziua(clipa: Date, timeZone?: string): string {
  const parti = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(clipa);
  const p = (tip: string) => parti.find((x) => x.type === tip)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")}`;
}

/** Data unei versiuni, pe scurt: „Azi, 14:32”, „Ieri, 09:05”, „24 oct., 18:05”, „24 oct. 2025, 18:05”. */
export function dataVersiunii(la: string, acum: Date, timeZone?: string): string {
  const d = new Date(la);
  if (!Number.isFinite(d.getTime())) return "";
  const ora = new Intl.DateTimeFormat("ro-RO", { timeZone, hour: "2-digit", minute: "2-digit" }).format(d);
  const zi = ziua(d, timeZone);
  const azi = ziua(acum, timeZone);
  if (zi === azi) return `Azi, ${ora}`;
  const [an, luna, z] = azi.split("-").map(Number);
  if (zi === new Date(Date.UTC(an, luna - 1, z - 1)).toISOString().slice(0, 10)) return `Ieri, ${ora}`;
  const data = new Intl.DateTimeFormat("ro-RO", {
    timeZone, day: "numeric", month: "short", year: zi.slice(0, 4) === azi.slice(0, 4) ? undefined : "numeric",
  }).format(d);
  return `${data}, ${ora}`;
}
