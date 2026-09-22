import type { CifreleCodului } from "./stare";
import {
  catePagini,
  rezumatulPaginii as rezumatulPaginiiComun,
  type CuvinteleListei,
} from "@/lib/dashboard/paginare";

/* ⚠ Se trece mai departe ca s-o poată aduce cine aduce lista, dintr-un loc. */
export { catePagini };

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
 * ⚠ RĂSFOIREA E CEA COMUNĂ, din `lib/dashboard/paginare.ts`. `catePagini` era
 * scrisă aici a doua oară, pe lângă cea din `lib/perioade.ts`, cu corpuri
 * deosebite. Aici rămân doar CUVINTELE codurilor.
 */
const CUVINTELE_CODURILOR: CuvinteleListei = {
  niciunul: "Niciun cod", unul: "cod", putine: "coduri", multe: "de coduri",
};

export function rezumatulPaginii(cateSunt: number, pagina: number, pePagina: number): string {
  return rezumatulPaginiiComun(cateSunt, pagina, pePagina, CUVINTELE_CODURILOR);
}
