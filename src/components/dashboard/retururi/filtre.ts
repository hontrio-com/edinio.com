/*
  Filtrele din adresa ale paginii de Retururi.

  Aceeasi reteta ca la Comenzi si Decontări: filtrarea si paginarea se fac pe server, in SQL, iar
  starea lor sta in adresa. Pana pe 25.11.2026 pagina avea doar `?page=`; de atunci are si
  starea, cautarea si perioada.

  ⚠ Modul SIMPLU, fara „use client": il citesc si pagina de pe server, si piesele din browser.
*/

import { ziuaFiltrului } from "@/lib/orders/filtrele-listei";
import { firstParam, pageParam } from "@/lib/orders/pagination";

/** Cele patru stari ale unei cereri, cum stau in `return_requests.status`. */
export const STARI_RETUR = ["nou", "aprobat", "respins", "rambursat"] as const;
export type StareRetur = (typeof STARI_RETUR)[number];

/** Filele listei: toate, apoi starile in ordinea drumului unei cereri. */
export const FILE_RETUR: readonly { cheie: "all" | StareRetur; eticheta: string }[] = [
  { cheie: "all", eticheta: "Toate" },
  { cheie: "nou", eticheta: "Noi" },
  { cheie: "aprobat", eticheta: "Aprobate" },
  { cheie: "rambursat", eticheta: "Rambursate" },
  { cheie: "respins", eticheta: "Respinse" },
];

/** Cate cereri pe pagina. */
export const PE_PAGINA = 25;

export interface FiltreRetur {
  q: string;
  /** „all" sau una dintre cele patru stari. */
  status: "all" | StareRetur;
  /** Zile romanesti „YYYY-MM-DD"; `""` = fara capatul acela. */
  deLa: string;
  panaLa: string;
  page: number;
}

export const FILTRE_GOALE: FiltreRetur = { q: "", status: "all", deLa: "", panaLa: "", page: 1 };

/** Citeste filtrele din adresa. Orice valoare necunoscuta cade pe implicit, nu ajunge in interogare. */
export function filtreDinAdresa(sp: Record<string, string | string[] | undefined>): FiltreRetur {
  const statusBrut = firstParam(sp.status) ?? "all";
  return {
    q: (firstParam(sp.q) ?? "").trim().slice(0, 80),
    status: (STARI_RETUR as readonly string[]).includes(statusBrut) ? (statusBrut as StareRetur) : "all",
    deLa: ziuaFiltrului(firstParam(sp.de_la)),
    panaLa: ziuaFiltrului(firstParam(sp.pana_la)),
    page: pageParam(sp.page),
  };
}

/** Adresa unei stari a filtrelor. Ce e pe implicit nu se scrie, ca adresa sa ramana scurta. */
export function adresaFiltrelor(cale: string, f: FiltreRetur): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.status !== "all") p.set("status", f.status);
  if (f.deLa) p.set("de_la", f.deLa);
  if (f.panaLa) p.set("pana_la", f.panaLa);
  if (f.page > 1) p.set("page", String(f.page));
  const coada = p.toString();
  return coada ? `${cale}?${coada}` : cale;
}

/** Adevarat cand e pus vreun filtru. */
export function areFiltre(f: FiltreRetur): boolean {
  return !!f.q || !!f.deLa || !!f.panaLa || f.status !== "all";
}
