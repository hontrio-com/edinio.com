"use client";

import { useEffect } from "react";
import { noteazaComanda } from "@/lib/suport/context-vitrina";

/**
 * Pe pagina de multumire: noteaza comanda abia plasata, ca butonul de chat s-o poata spune operatorului
 * („Am o intrebare despre comanda #1234”).
 *
 * ⚠ Numai numarul, valoarea si felul platii, care sunt oricum scrise pe pagina. Nimic despre om.
 * ⚠ Se monteaza numai la magazinele cu chat si cu „Comanda abia plasata” pornita (hotarat pe server, in
 * pagina): celelalte magazine nu primesc componenta deloc.
 */
export function ComandaPentruChat({ slug, numar, total, plata }: { slug: string; numar: string; total: string; plata?: string }) {
  useEffect(() => {
    noteazaComanda(slug, { numar, total, ...(plata ? { plata } : {}) });
  }, [slug, numar, total, plata]);
  return null;
}
