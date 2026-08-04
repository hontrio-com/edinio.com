"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cautare cu intarziere („debouncing") si garda impotriva raspunsurilor vechi.
 *
 * DOUA PROBLEME, nu una:
 *
 * 1. FARA INTARZIERE, fiecare tasta trimite o cerere. „rochie" inseamna cinci
 *    apeluri catre furnizor pentru un singur lucru cautat. Asteptam sa se
 *    opreasca din tastat, si abia atunci intrebam.
 *
 * 2. FARA GARDA DE CURSA, raspunsurile pot sosi in alta ordine decat au plecat.
 *    Cererea pentru „ro" e mai lenta decat cea pentru „rochie", ajunge dupa, si
 *    suprascrie rezultatul corect cu unul vechi. Nu e o problema de viteza, ci
 *    de CORECTITUDINE: omul vede rezultate care nu corespund cu ce a scris.
 *    Fiecare cautare primeste un numar; cand se intoarce, il aplicam doar daca
 *    e inca cel mai recent. Atentie: `clearTimeout` NU e suficient — el anuleaza
 *    doar o cautare care inca asteapta, nu una deja plecata spre server.
 *
 * DE CE IN MANIPULATOR SI NU INTR-UN EFECT: pornirea cautarii dintr-un
 * `useEffect` ar cere `setState` sincron in corpul efectului, ceea ce
 * declanseaza randari in cascada (si e semnalat ca atare de regulile React).
 * Tastarea e un eveniment, deci ii raspundem in manipulator.
 *
 * Lungimea minima ramane utila si cu intarziere: o litera aduce oricum prea
 * multe rezultate ca sa insemne ceva.
 */
export function useCautareIntarziata<T>(
  executa: (termen: string) => Promise<T | null>,
  optiuni?: { intarziereMs?: number; minLungime?: number },
) {
  const { intarziereMs = 300, minLungime = 2 } = optiuni ?? {};

  const [termen, setTermenBrut] = useState("");
  const [rezultat, setRezultat] = useState<T | null>(null);
  const [seCauta, setSeCauta] = useState(false);

  const generatie = useRef(0);
  const temporizator = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Functia de cautare sta intr-un ref: apelantii o dau de obicei ca sageata
  // definita in corpul componentei, deci identitatea ei se schimba la fiecare
  // randare. Legata direct, ar reconstrui `setTermen` de fiecare data.
  const executaRef = useRef(executa);
  useEffect(() => { executaRef.current = executa; });

  // La demontare, temporizatorul in asteptare nu mai are ce declansa.
  useEffect(() => () => {
    if (temporizator.current) clearTimeout(temporizator.current);
  }, []);

  const setTermen = useCallback((valoare: string) => {
    setTermenBrut(valoare);
    if (temporizator.current) clearTimeout(temporizator.current);

    const curat = valoare.trim();
    if (curat.length < minLungime) {
      generatie.current++;          // anuleaza si ce e deja in zbor
      setRezultat(null);
      setSeCauta(false);
      return;
    }

    setSeCauta(true);
    const a_mea = ++generatie.current;
    temporizator.current = setTimeout(async () => {
      try {
        const r = await executaRef.current(curat);
        if (a_mea !== generatie.current) return;   // a plecat deja alta cautare
        setRezultat(r);
      } finally {
        if (a_mea === generatie.current) setSeCauta(false);
      }
    }, intarziereMs);
  }, [intarziereMs, minLungime]);

  const reseteaza = useCallback(() => {
    if (temporizator.current) clearTimeout(temporizator.current);
    generatie.current++;
    setTermenBrut("");
    setRezultat(null);
    setSeCauta(false);
  }, []);

  return { termen, setTermen, rezultat, seCauta, reseteaza };
}
