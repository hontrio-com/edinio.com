"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { detaliiPentruAwb, FARA_DETALII, type CampCheckoutAwb, type DetaliiPentruAwb } from "@/lib/orders/detalii-pentru-awb";

/**
 * Campurile de checkout ale magazinului, date ferestrelor de AWB fara sa treaca prin fiecare
 * dintre ele ca prop. Regula: `detalii-pentru-awb.ts`.
 *
 * ⚠ Fara furnizor (o fereastra deschisa din alta parte), fiecare fereastra primeste „nimic": campurile
 * raman goale, ca inainte, nu se rupe nimic.
 */
const CampuriCheckout = createContext<ReadonlyArray<CampCheckoutAwb>>([]);

export function CampuriCheckoutProvider({ campuri, children }: { campuri: ReadonlyArray<CampCheckoutAwb>; children: ReactNode }) {
  return <CampuriCheckout.Provider value={campuri}>{children}</CampuriCheckout.Provider>;
}

/** Observatiile si codul postal din formular, pentru comanda deschisa in fereastra. */
export function useDetaliiPentruAwb(order: { notes?: unknown } | null | undefined): DetaliiPentruAwb {
  const campuri = useContext(CampuriCheckout);
  const note = typeof order?.notes === "string" ? order.notes : null;
  return useMemo(() => (note ? detaliiPentruAwb(note, campuri) : FARA_DETALII), [note, campuri]);
}
