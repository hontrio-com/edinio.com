/*
  Filtrele din adresa ale paginii de Decontări.

  Aceeasi reteta ca la Comenzi si Retururi: filtrarea si paginarea se fac pe server, iar starea
  lor sta in adresa. Pana pe 25.11.2026 pagina avea doar trei butoane de perioada, socotite in
  browser peste cele mai noi 500 de randuri; de atunci are cautare, curier si o perioada cu doua
  capete, toate aplicate in baza.

  ⚠ Modul SIMPLU, fara „use client": il citesc si pagina de pe server, si piesele din browser.
*/

import { ziuaFiltrului } from "@/lib/orders/filtrele-listei";
import { firstParam, pageParam } from "@/lib/orders/pagination";

/** Cate colete pe pagina. */
export const PE_PAGINA = 50;

export interface FiltreDecont {
  q: string;
  /** „all" sau cheia unui curier, cum sta in `courier_settlements.courier`. */
  curier: string;
  /** Zile „YYYY-MM-DD" ale VIRARII; `""` = fara capatul acela. */
  deLa: string;
  panaLa: string;
  page: number;
}

export const FILTRE_GOALE: FiltreDecont = { q: "", curier: "all", deLa: "", panaLa: "", page: 1 };

/** Citeste filtrele din adresa. Orice valoare necunoscuta cade pe implicit, nu ajunge in interogare. */
export function filtreDinAdresa(sp: Record<string, string | string[] | undefined>): FiltreDecont {
  const curierBrut = (firstParam(sp.curier) ?? "all").toLowerCase();
  return {
    q: (firstParam(sp.q) ?? "").trim().slice(0, 80),
    curier: /^[a-z0-9_-]{1,40}$/.test(curierBrut) ? curierBrut : "all",
    deLa: ziuaFiltrului(firstParam(sp.de_la)),
    panaLa: ziuaFiltrului(firstParam(sp.pana_la)),
    page: pageParam(sp.page),
  };
}

/** Adresa unei stari a filtrelor. Ce e pe implicit nu se scrie, ca adresa sa ramana scurta. */
export function adresaFiltrelor(cale: string, f: FiltreDecont): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.curier !== "all") p.set("curier", f.curier);
  if (f.deLa) p.set("de_la", f.deLa);
  if (f.panaLa) p.set("pana_la", f.panaLa);
  if (f.page > 1) p.set("page", String(f.page));
  const coada = p.toString();
  return coada ? `${cale}?${coada}` : cale;
}

/** Adevarat cand e pus vreun filtru. */
export function areFiltre(f: FiltreDecont): boolean {
  return !!f.q || !!f.deLa || !!f.panaLa || f.curier !== "all";
}
