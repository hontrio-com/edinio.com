import { pcCuCiorna, type ContinutCiorna } from "@/lib/storefront/design/continut-ciorna";
import { CHEIE_FONT_TEXT, CHEIE_FONT_TITLURI } from "@/lib/storefront/design/fonturi-magazin";
import type { IdentitateTema } from "./tipuri";

/*
  ═══════════════════════════════════════════════════════════════════════════
  APLICAREA UNEI TEME (etapa 17 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Bucatile pure ale aplicarii: ce se scrie in magazin, pe langa designul temei. Le folosesc actiunile
  (`aplicaTema`, `puneLaLocDesignulDeDinainte` din `store-design.actions.ts`), scriptul magazinului demo si probele.

  ⚠ Identitatea temei (culoarea principala, fundalul, fonturile) se scrie acolo unde o regleaza fila „Stil”
  (`businesses.primary_color`, `page_content`), NU in `design.style`: acolo ar fi castigat peste „Stil”
  (`resolveStyle`), iar dupa aplicare culoarea si fonturile alese de om n-ar mai fi facut nimic (17.1). Scrisa ca un
  continut de ciorna, trece prin „Publică” si intra in Istoric, deci „Pune la loc” o readuce.
*/

/** Identitatea temei ca un continut de ciorna: cheile fundalului si fonturilor din „Stil”, plus culoarea. */
export function continutIdentitate(identitate: IdentitateTema): ContinutCiorna {
  return {
    pc: { store_bg_color: identitate.fundal, [CHEIE_FONT_TITLURI]: identitate.fontTitluri, [CHEIE_FONT_TEXT]: identitate.fontText },
    magazin: { primary_color: identitate.culoare },
  };
}

/** `page_content` cu fundalul si fonturile temei, peste ce are magazinul (restul cheilor raman ale lui). */
export function pageContentCuIdentitatea(pc: Record<string, unknown>, identitate: IdentitateTema): Record<string, unknown> {
  return pcCuCiorna(pc, continutIdentitate(identitate));
}

/** Coloanele din `businesses` scrise de tema: doar culoarea principala. */
export function magazinCuIdentitatea(identitate: IdentitateTema): { primary_color: string } {
  return { primary_color: identitate.culoare };
}

/** Cu un furnizor de newsletter conectat, coloana „Newsletter” a temei intra in subsol (cum cere si panoul). */
export function areFurnizorNewsletter(n: { mailchimp: boolean; brevo: boolean; klaviyo: boolean }): boolean {
  return n.mailchimp || n.brevo || n.klaviyo;
}

/**
 * Semnul din `page_content` pus la aplicare: ce tema si cand, pentru pagina „Teme”. Nu e o cheie a editorului, deci
 * nu intra in Istoric; „Pune la loc designul de dinainte” il scoate.
 */
export const CHEIE_TEMA_APLICATA = "tema_aplicata";

export interface TemaAplicata {
  cheie: string;
  la: string;
}

export function temaAplicataDin(pageContent: unknown): TemaAplicata | null {
  if (!pageContent || typeof pageContent !== "object") return null;
  const v = (pageContent as Record<string, unknown>)[CHEIE_TEMA_APLICATA];
  if (!v || typeof v !== "object") return null;
  const { cheie, la } = v as Record<string, unknown>;
  return typeof cheie === "string" && typeof la === "string" && !Number.isNaN(Date.parse(la)) ? { cheie, la } : null;
}

/**
 * Datele versiunilor de dinainte de tema: ce era publicat (`tema`), apoi ciorna de atunci (`ciorna`), fiecare cu o
 * milisecunda inaintea lui `acum`, ca in Istoric sa stea in ordine, sub publicarea temei care urmeaza.
 */
export function dateleVersiunilorDeDinainte(acum: number): { tema: string; ciorna: string } {
  return { tema: new Date(acum - 2).toISOString(), ciorna: new Date(acum - 1).toISOString() };
}
