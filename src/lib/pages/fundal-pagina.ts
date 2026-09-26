import { culoareSigura } from "./culori";

/*
  Fundalul paginilor construite (26.09.2026, cerut de el: „alb by default”).

  Pana acum pagina statea pe fundalul implicit al magazinului, `#F9FAFB` (gri
  deschis), si in editor la fel. Acum:
    - comerciantul care si-a ALES un fundal pentru magazin (in designul
      magazinului sau `store_bg_color`) il pastreaza si pe pagini;
    - ceilalti au pagini albe.
  Aceeasi functie da fundalul si pe magazin, si in editor: ce vezi cand
  construiesti e ce se publica.

  Masurat in productie pe 26.09.2026: 45 din 135 de magazine au fundal ales.
*/
export const FUNDAL_PAGINA_IMPLICIT = "#FFFFFF";

/** `fundalMagazin` = `resolveDesign(...).style.colors.background`. */
export function fundalulPaginii(fundalMagazin: string | null | undefined): string {
  // Fundalul implicit al magazinului e un token (`var(--color-background)`), nu o alegere.
  if (!fundalMagazin || fundalMagazin.trim().startsWith("var(")) return FUNDAL_PAGINA_IMPLICIT;
  return culoareSigura(fundalMagazin) ?? FUNDAL_PAGINA_IMPLICIT;
}
