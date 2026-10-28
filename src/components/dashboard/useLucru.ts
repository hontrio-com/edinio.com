"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { raporteazaEroarea } from "@/lib/sentry/raporteaza";

/* ═══════════════════════════════════════════════════════════════════════════
   O ROTITA CARE NU TINE PAGINA PE LOC (28.10.2026)
   ═══════════════════════════════════════════════════════════════════════════

   `useTransition` cu o functie `async` pare locul firesc pentru un buton care cheama
   o actiune de server. Dar in React 19, cat timp o asemenea tranzitie e in curs, ORICE
   tranzitie noua primeste aceeasi banda si asteapta dupa ea: `requestTransitionLane`
   intoarce `currentEntangledLane`, iar randarea se suspenda pana se termina TOATE
   actiunile din grup. Navigarea din Next e tot o tranzitie, deci un clic in meniu nu
   duce nicaieri pana nu raspunde serverul.

   ⚠ Masurat in productie pe 28.10.2026, la MNY AROMA: „Sugerează” a stat patru minute
   pe drumul spre eMAG, si in tot timpul asta niciun clic nu scotea omul din pagina.
   El a scris ca „apas peste tot si nu ma lasa sa ies”.

   Aici rotita e o stare obisnuita, nu o tranzitie. Navigarea nu mai asteapta nimic:
   pagina se schimba, iar raspunsul care vine dupa nu mai are unde sa se aseze.

   ⚠ Aceeasi forma ca `useTransition` (`[inCurs, porneste]`), ca schimbarea sa fie de
   un rand in fiecare ecran. Mai multe lucrari pornite deodata se numara: rotita se
   opreste abia cand s-a terminat ultima, ca la tranzitie.

   ⚠ O cadere nu mai urca la granita de eroare, cum facea tranzitia. Acolo ar fi
   inlocuit tot panoul cu un ecran de eroare pentru un singur buton. Se spune intr-un
   mesaj si pleaca la Sentry.
*/
export function useLucru(): readonly [boolean, (lucru: () => Promise<unknown> | void) => void] {
  const [cate, setCate] = useState(0);
  const montat = useRef(true);

  useEffect(() => {
    montat.current = true;
    return () => {
      montat.current = false;
    };
  }, []);

  const porneste = useCallback((lucru: () => Promise<unknown> | void) => {
    setCate((n) => n + 1);
    void (async () => {
      try {
        await lucru();
      } catch (eroare) {
        if (eroare instanceof Error) raporteazaEroarea(eroare);
        if (montat.current) toast.error("Nu s-a putut termina. Încearcă din nou.");
      } finally {
        if (montat.current) setCate((n) => n - 1);
      }
    })();
  }, []);

  return [cate > 0, porneste] as const;
}
