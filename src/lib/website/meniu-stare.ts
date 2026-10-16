import type { MenuId } from "./nav";

/** Starea mega-meniului din antet: ce panou e deschis și dacă trecerea la el e fără animație. */
export interface StareMeniu {
  open: MenuId | null;
  instant: boolean;
}

/**
 * Starea după ce se cere panoul `next` (sau închiderea, cu `null`).
 *
 * ⚠ Închis rămâne ACELAȘI obiect: React compară starea după identitate, iar un obiect nou ar redesena
 * toată bara. Și se cere des așa: orice atingere oriunde pe pagină închide meniul (`SiteHeader`,
 * `onPointerDown`). MĂSURAT 16.10.2026: prima atingere pe un telefon încetinit de 4 ori era un cadru
 * de 114 ms, aproape tot redesenarea barei.
 *
 * Trecerea e fără animație (`instant`) numai de la un panou deschis la altul.
 */
export function meniulUrmator(previous: StareMeniu, next: MenuId | null): StareMeniu {
  if (previous.open === null && next === null) return previous;
  return { open: next, instant: previous.open !== null && next !== null && previous.open !== next };
}
