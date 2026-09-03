"use client";

import { useEffect, useRef } from "react";
import { urmareste } from "@/lib/edinio-marketing/magistrala";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE NU GASESC OAMENII (fara sa aflam CE au cautat)
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SE TRAGE PE PAGINA DE REZULTATE, nu la apasarea butonului de cautare.

  Deosebirea conteaza: cautarea din blog e un formular obisnuit care navigheaza
  (`method="get"`). Masurata la trimitere, s-ar fi numarat si cautarile care n-au
  ajuns nicaieri — pagina inchisa in timpul incarcarii, o retea care cade. Iar
  numele evenimentului spune limpede ce inseamna: `view_search_results`, adica
  omul a VAZUT rezultatele.

  ⚠ SE TRIMITE CATE REZULTATE, NU CE S-A CAUTAT. Textul brut a fost scos pe
  03.09.2026: tiparele anti-PII prind emailul si telefonul, dar nu „Ion Popescu"
  si nu o adresa de strada, iar Google avertizeaza chiar despre casetele de
  cautare ca fiind o cale pe care datele personale ajung din greseala in Analytics.

  ⚠ CE SE MAI POATE AFLA, si ce nu. Cate cautari raman fara raspuns, si pe ce
  domeniu — blog fata de ajutor — se vede in continuare, din `zero_results` si
  `search_results`. CARE anume au fost, nu: pentru asta ar trebui un jurnal al
  NOSTRU, cu pastrarea si stergerea lui, nu un cont de analiza al altcuiva.
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
