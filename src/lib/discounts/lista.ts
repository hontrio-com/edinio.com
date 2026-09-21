import type { CifreleCodului } from "./stare";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN RÂND DIN LISTA DE CODURI                                   (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ NU MAI E `Database["public"]["Tables"]["discounts"]["Row"]`, și asta e
 * dinadins. De când lista se paginează în bază, rândul nu mai vine din tabelă
 * ci din `discounts_page` — care aduce, pe lângă coloane, și cifrele fiecărui
 * cod, într-un singur drum.
 *
 * Ținut ca `Row`, ecranul ar fi cerut cifrele separat: încă o interogare peste
 * toate codurile magazinului, adică exact lucrul de care am scăpat.
 *
 * ⚠ `business_id` NU e aici, și nici nu trebuie: pagina lucrează pe magazinul
 * celui logat, iar RLS o ține. Purtat mai departe, ar fi fost încă un câmp pe
 * care cineva l-ar fi putut crede o alegere.
 */
export interface CodDinLista {
  id: string;
  code: string;
  type: string;
  value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  per_customer_limit: number | null;
  doar_prima_comanda: boolean;
  restrangere: unknown;
  created_at: string;
  updated_at: string;
  /** Ce a făcut codul: comenzi, bani dați, vânzări. Vine în același rând. */
  cifre: CifreleCodului;
}

/** Cifrele din cap, socotite pe TOT magazinul — nu pe pagina adusă. */
export interface TotalurileCodurilor {
  coduri: number;
  potiFolosi: number;
  comenzi: number;
  baniDati: number;
  vanzari: number;
}

/**
 * Câte pagini are mulțimea filtrată.
 *
 * ⚠ Zero rânduri înseamnă O pagină, nu zero: altfel „pagina 1 din 0” ar fi scris
 * pe ecran, iar butoanele de răsfoire s-ar fi purtat ciudat pe un magazin fără
 * niciun cod.
 */
export function catePagini(cateSunt: number, pePagina: number): number {
  return Math.max(1, Math.ceil(Math.max(0, cateSunt) / Math.max(1, pePagina)));
}

/**
 * Ce scrie sub listă: „1–25 din 137 de coduri”.
 *
 * ⚠ SE SPUNE ȘI CÂT E TOTALUL, nu doar pagina. O listă care arată douăzeci și
 * cinci de rânduri fără să spună câte sunt îl lasă pe comerciant să creadă că
 * atâtea are — exact felul de tăcere pe care îl vânez peste tot.
 */
export function rezumatulPaginii(cateSunt: number, pagina: number, pePagina: number): string {
  if (cateSunt === 0) return "Niciun cod";
  const de = (pagina - 1) * pePagina + 1;
  const la = Math.min(cateSunt, pagina * pePagina);
  const cuvant = cateSunt === 1 ? "cod" : cateSunt < 20 ? "coduri" : "de coduri";
  if (cateSunt <= pePagina) return `${cateSunt} ${cuvant}`;
  return `${de}–${la} din ${cateSunt} ${cuvant}`;
}
