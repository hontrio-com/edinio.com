/**
 * Coletele unui AWB, in unitatile LOR.
 *
 * ═══ ⚠ FISIER SEPARAT, SI NU DIN COCHETARIE ═══
 *
 * Functia de mai jos e chemata SI din ecran (`EmagAwbModal`, care e `"use client"`),
 * SI de pe server. `awb.ts`, unde statea la inceput, importa clientul de serviciu
 * Supabase, registrul de operatii externe si clientul eMAG cu `undici` — tot cod de
 * server. Importata de acolo intr-o componenta de client, ar fi tras intreg lantul
 * acela in pachetul trimis in browser.
 *
 * Aici nu e niciun import. Nici nu are voie sa fie.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   COLETELE: ALTE UNITATI DECAT MASURATORILE PRODUSULUI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Un colet, in unitatile pe care le cere `/awb/save`.
 *
 * ═══ ⚠ CENTIMETRI SI KILOGRAME. LA PRODUS E MILIMETRI SI GRAME ═══
 *
 * Nu e o subtilitate, e scris in chiar schemele lor:
 *
 *   `Measurement`   (`/measurements/save`) — „length … in millimeters (mm)",
 *                                            „weight … in grams (g)"
 *   `AWBSavePackage` (`/awb/save`)         — „Package length in centimeters",
 *                                            „Package weight in kilograms"
 *
 * Acelasi cuvant, `length`, in acelasi API, cu unitati de o mie de ori diferite.
 * Un colet de 30 cm trimis ca 300 (crezand ca-s milimetri) devine un colet de trei
 * metri, iar taxarea volumetrica a curierului se face pe cifra aceea.
 *
 * De aceea tipul e SEPARAT si poarta unitatea in nume. Un `dimensions` generic
 * trecut de la o functie la alta ar fi fost exact greseala pe care o previne.
 */
export interface ColetCm {
  /** Kilograme. */
  weight: number;
  /** Centimetri. */
  length: number;
  width: number;
  height: number;
}

/**
 * Coletele, sau `undefined` cand nu se stiu dimensiunile.
 *
 * ═══ ⚠ MAI BINE NIMIC DECAT NUMERE INVENTATE ═══
 *
 * Prima forma a ecranului trimitea `20 × 15 × 10` pentru ORICE colet — o valoare pe
 * care o pusesem ca sa nu ramana campul gol. Dar `packages` nu e decor: eMAG il
 * foloseste la taxarea volumetrica. Un frigider declarat cutie de pantofi inseamna
 * un cost de transport calculat gresit, iar diferenta o refactureaza curierul la
 * depozit — peste saptamani, cand nimeni nu mai leaga suma de un camp dintr-un
 * formular.
 *
 * `packages` e OPTIONAL la ei. Deci cand nu stim, nu trimitem: curierul cantareste
 * si masoara coletul, ceea ce oricum face. Cand stim, trimitem adevarul.
 *
 * ⚠ Greutatea se imparte la numarul de colete, dimensiunile NU. Doua cutii identice
 * cantaresc fiecare jumatate din total, dar fiecare are dimensiunile ei intregi.
 */
export function coleteDeTrimis(
  greutateTotalaKg: number,
  cateColete: number,
  dimensiuniCm: { length?: number; width?: number; height?: number } | null | undefined,
): ColetCm[] | undefined {
  const n = Math.max(1, Math.floor(cateColete) || 1);
  const g = Number(greutateTotalaKg);
  if (!Number.isFinite(g) || g <= 0) return undefined;

  const cm = (v: unknown): number | null => {
    const x = typeof v === "number" ? v : Number(v);
    return Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : null;
  };
  const l = cm(dimensiuniCm?.length);
  const w = cm(dimensiuniCm?.width);
  const h = cm(dimensiuniCm?.height);

  /*
   * ⚠ Toate trei sau niciuna. O cutie cu doua laturi si a treia inventata e mai rea
   * decat una nedeclarata: prima arata ca o masuratoare, a doua arata ca o lipsa.
   */
  if (l == null || w == null || h == null) return undefined;

  return Array.from({ length: n }, () => ({
    weight: Math.round((g / n) * 100) / 100,
    length: l,
    width: w,
    height: h,
  }));
}
