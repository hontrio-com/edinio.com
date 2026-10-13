import type { ElementRevendicat } from "@/lib/marketplace/coada-cas";

/**
 * Elementul cozii `easysales_sync_queue` si asteptarile dupa pane, comune lucratorului comenzilor
 * (`coada.ts`) si celui al catalogului (`catalog.ts`). Stau aici, nu in `coada.ts`, ca cele doua
 * sa nu se importe una pe alta.
 */

export const COADA = "easysales_sync_queue" as const;

export interface ElementCoada extends ElementRevendicat {
  op: string;
  cheie: string;
  incercari: number;
  pauze: number;
  created_at: string;
}

export type Soarta = "gata" | "amanat" | "abandonat";

/** 1, 2, 5, 10, 30 de minute, apoi din ora in ora (planul, §5.1.6). */
const TREPTE_MIN = [1, 2, 5, 10, 30];
export function asteptareaDupaPauze(pauze: number): number {
  return (pauze < TREPTE_MIN.length ? TREPTE_MIN[pauze] : 60) * 60_000;
}
