"use client";

import { useEffect } from "react";
import { useIdentitateMagazin } from "@/components/storefront/IdentitateMagazin";
import { raporteazaEroarea } from "@/lib/sentry/raporteaza";

/*
  ═══════════════════════════════════════════════════════════════════════════
  EROAREA UNEI PAGINI DE MAGAZIN                                    (19.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Pana la auditul temelor, singura granita de eroare a vitrinei era cea de la radacina (`app/error.tsx`): un „500” mare,
  gri, cu un singur buton, acelasi pentru panou si pentru magazinele comerciantilor. Cumparatorul care nimerea o cadere
  (baza intarzie, o citire pica) nu avea niciun drum inapoi in magazin.

  Granita asta e a magazinului: fara cifra de eroare, cu „Incearca din nou” si cu drumul spre prima pagina a
  magazinului. Caderile unei singure sectiuni nu ajung aici: le opreste `PazaSectiune`, la marginea sectiunii.

  ⚠ Text de vitrina, deci FARA diacritice. Stilurile vin din foaia magazinului (o importa `layout.tsx` de alaturi), iar
  culorile au valori de rezerva: variabilele temei se pun mai jos in pagina, pe care caderea a scos-o.
*/
export default function EroareMagazin({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  /*
   * Prima pagina a magazinului o stie layoutul (pe platforma adresele poarta slugul, pe domeniul propriu si pe
   * subdomeniul demo nu) si o da prin `IdentitateMagazin`: granita asta sta SUB layout, deci contextul lui e viu si
   * cand pagina a cazut. Aceeasi sursa ca 404-ul de alaturi.
   */
  const { acasa } = useIdentitateMagazin();

  useEffect(() => {
    raporteazaEroarea(error);
  }, [error]);

  return (
    <main role="alert" className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center bg-white text-[#111827]">
      <h1 className="text-xl font-semibold">Pagina nu s-a putut afisa</h1>
      <p className="mt-2 max-w-md text-sm text-[#4b5563]">A aparut o eroare neasteptata. Incearca din nou; daca tot nu merge, intoarce-te in magazin.</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset}
          className="h-11 px-5 rounded-xl bg-[#111827] text-white text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111827]/40 focus-visible:ring-offset-2">
          Incearca din nou
        </button>
        <a href={acasa}
          className="h-11 px-5 inline-flex items-center rounded-xl border border-[#d1d5db] text-sm font-semibold text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111827]/40 focus-visible:ring-offset-2">
          Inapoi in magazin
        </a>
      </div>
    </main>
  );
}
