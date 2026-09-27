"use client";

import { useEffect } from "react";
import { stergeCiorna } from "@/lib/onboarding/ciorna";

/*
 * Ciorna inscrierii (nume, telefon, adresa) sta in `localStorage`, deci supravietuieste
 * si unei deconectari. Pe un calculator folosit de doi oameni, al doilea ar fi gasit
 * datele primului in formular. Ciorna tine de CONT: alt cont, ciorna se sterge.
 *
 * ⚠ Sta INAINTEA paginii in layout: efectele fratilor ruleaza in ordine, deci stergerea
 * se face inainte ca pasul 1 sa citeasca ciorna.
 */
const CHEIE_CONT = "onboarding_cont";

export function PazaCiorna({ cont }: { cont: string }) {
  useEffect(() => {
    try {
      const anterior = window.localStorage.getItem(CHEIE_CONT);
      if (anterior !== cont) {
        stergeCiorna();
        window.localStorage.setItem(CHEIE_CONT, cont);
      }
    } catch {
      /* fara stocare in browser nu exista nici ciorna de pazit */
    }
  }, [cont]);
  return null;
}
