"use client";

import { useEffect, useRef } from "react";
import { urmareste } from "@/lib/edinio-marketing/magistrala";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE A CAUTAT OMUL, SI DACA A GASIT
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SE TRAGE PE PAGINA DE REZULTATE, nu la apasarea butonului de cautare.

  Deosebirea conteaza: cautarea din blog e un formular obisnuit care navigheaza
  (`method="get"`). Masurata la trimitere, s-ar fi numarat si cautarile care n-au
  ajuns nicaieri — pagina inchisa in timpul incarcarii, o retea care cade. Iar
  numele evenimentului spune limpede ce inseamna: `view_search_results`, adica
  omul a VAZUT rezultatele.

  ⚠ SI SE TRIMITE SI CATE, fiindca intrebarea care merita pusa nu e „ce cauta
  oamenii" ci „ce cauta si NU gasesc". Un termen cu zero rezultate, cautat de
  cincizeci de ori, e un articol care trebuie scris.
*/
export function UrmaCautare({
  termen,
  domeniu,
  rezultate,
}: {
  termen: string;
  domeniu: "blog" | "help";
  rezultate: number;
}) {
  const tras = useRef("");

  useEffect(() => {
    const curatat = termen.trim();
    if (!curatat) return;

    /*
      ⚠ O DATA PER TERMEN, nu la fiecare randare. Fara paza asta, o schimbare de
      pagina in paginare ar fi tras acelasi termen din nou, si cifrele ar fi
      spus ca oamenii cauta de doua ori mai mult decat o fac.
    */
    const cheie = `${domeniu}:${curatat}`;
    if (tras.current === cheie) return;
    tras.current = cheie;

    urmareste({
      name: "view_search_results",
      zero_results: rezultate === 0,
      search_scope: domeniu,
      search_results: rezultate,
    });
  }, [termen, domeniu, rezultate]);

  return null;
}
