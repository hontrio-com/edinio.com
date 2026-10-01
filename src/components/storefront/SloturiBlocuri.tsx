"use client";

import { createContext, useContext, type ReactNode } from "react";

/*
  Blocurile unei pagini din „Pagini" puse pe pagina principala (01.10.2026).

  Se randeaza pe SERVER (au interogari proprii: produse, formulare, pachete) si
  ajung aici gata facute, cate un grup pentru fiecare sectiune `rich_blocks`.
  Vezi `lib/storefront/design/pagina-acasa.ts`.
*/
const SloturiContext = createContext<Record<string, ReactNode> | null>(null);

export function FurnizorSloturiBlocuri({ sloturi, children }: { sloturi?: Record<string, ReactNode>; children: ReactNode }) {
  if (!sloturi) return <>{children}</>;
  return <SloturiContext.Provider value={sloturi}>{children}</SloturiContext.Provider>;
}

export function SlotBlocuri({ cheie }: { cheie: string }) {
  const sloturi = useContext(SloturiContext);
  return <>{sloturi?.[cheie] ?? null}</>;
}
