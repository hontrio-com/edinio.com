/*
  ═══════════════════════════════════════════════════════════════════════════
  TERMENUL DE LIVRARE AL UNUI PRODUS IN PRECOMANDA                (01.10.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Un produs marcat „Precomanda" spunea doar atat. Cat asteapta clientul nu
  aparea nicaieri, iar estimarea generala a magazinului („livrare 2-4 zile")
  ramanea pe aceeasi pagina si spunea ceva fals pentru produsul asta.

  Comerciantul scrie termenul liber in formularul produsului („Livrare in 3-4
  saptamani", „Se livreaza din 15 noiembrie"); se tine in
  `page_sections.termen_precomanda`. Cand exista, pagina produsului il arata
  langa eticheta de precomanda si NU mai arata estimarea generala.
*/

export const TERMEN_PRECOMANDA_MAX = 120;

/** Textul curatat pentru salvare: fara spatii in plus, taiat la plafon; gol = null. */
export function curataTermenPrecomanda(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  const t = brut.replace(/\s+/g, " ").trim().slice(0, TERMEN_PRECOMANDA_MAX);
  return t || null;
}

/**
 * Termenul de afisat, sau null. Numai pentru produsele chiar in precomanda:
 * un termen ramas de cand produsul era in precomanda nu mai are ce cauta pe
 * pagina dupa ce a intrat in stoc.
 */
export function termenPrecomanda(pageSections: unknown): string | null {
  if (!pageSections || typeof pageSections !== "object") return null;
  const ps = pageSections as { stock_status?: unknown; termen_precomanda?: unknown };
  if (ps.stock_status !== "preorder") return null;
  return curataTermenPrecomanda(ps.termen_precomanda);
}
