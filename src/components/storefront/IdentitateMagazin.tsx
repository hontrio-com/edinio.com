"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Cat stie layoutul magazinului despre el, pentru paginile care nu primesc `params`: 404-ul si pagina de eroare.
 *
 * `not-found.tsx` si `error.tsx` nu primesc slugul, deci pana pe 19.11.2026 404-ul ghicea magazinul dupa gazda si
 * reusea doar pe domeniu propriu: pe adresa cu slug (`edinio.com/magazin/...`, adica cele mai multe magazine) butonul
 * „Inapoi la pagina principala” ducea la `/`, pe site-ul platformei, si era verde ca platforma. Layoutul stie insa tot:
 * are randul magazinului si a hotarat deja daca adresele poarta slugul (`basePath`). Le da mai departe pe aici.
 */
export interface IdentitateMagazin {
  /** Numele afisat al magazinului, sau `null` cand nu se stie. */
  nume: string | null;
  /** Culoarea magazinului, deja curatata (`culoareMagazin`), si culoarea textului care se citeste pe ea. */
  culoare: string;
  culoareText: string;
  /** Prima pagina a magazinului pe cererea asta: `/` pe domeniu propriu, `/<slug>` pe adresa platformei. */
  acasa: string;
  /**
   * Subsolul, adus de layout pe server: HTML-ul curatat al insignei Netopia (`""` = magazinul n-are) si daca „Creat cu
   * Edinio” e ascuns. `null` = nu se stie (in afara layoutului magazinului, sau citirea a cazut): piesa cere atunci
   * singura, din browser, ca pana pe 19.11.2026.
   */
  insignaNetopia: string | null;
  creditAscuns: boolean | null;
}

const IMPLICIT: IdentitateMagazin = { nume: null, culoare: "#111827", culoareText: "#ffffff", acasa: "/", insignaNetopia: null, creditAscuns: null };
const Context = createContext<IdentitateMagazin>(IMPLICIT);

export function IdentitateMagazinProvider({ valoare, children }: { valoare: IdentitateMagazin; children: ReactNode }) {
  return <Context.Provider value={valoare}>{children}</Context.Provider>;
}

export function useIdentitateMagazin(): IdentitateMagazin {
  return useContext(Context);
}
