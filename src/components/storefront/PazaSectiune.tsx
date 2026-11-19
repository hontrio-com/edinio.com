"use client";

import { useEffect, type ReactNode } from "react";
import { catchError, type ErrorInfo } from "next/error";
import { raporteazaEroarea } from "@/lib/sentry/raporteaza";

/*
  ═══════════════════════════════════════════════════════════════════════════
  PAZA UNEI SECTIUNI: O SECTIUNE CAZUTA NU MAI DARAMA PAGINA        (19.11.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Gasit la auditul temelor: vitrina nu avea NICIO granita de eroare sub cea de la radacina (`app/error.tsx`). O singura
  sectiune care arunca la randare (un banner cu o valoare neasteptata, o varianta noua cu un defect) inlocuia TOATA
  pagina magazinului cu „500 · Ceva nu a functionat corect”: fara antet, fara produse, fara cos. Cumparatorul nu mai
  putea comanda nimic din cauza unei benzi de beneficii.

  Acum fiecare sectiune sta in paza ei: caderea ei ramane a ei. Sectiunea lipseste, restul paginii merge, iar eroarea
  pleaca la Sentry cu numele sectiunii, ca lipsa sa nu ramana tacuta. In editor, in locul ei apare o caseta care spune
  care sectiune a cazut, ca omul sa stie ce sa schimbe.

  ⚠ FARA `<Suspense>` in jurul sectiunii, dinadins. Ar fi oprit caderea si la randarea pe SERVER, dar React 19 scoate
  din fluxul paginii orice granita `Suspense` mai mare de ~12 KB si o dezvaluie printr-un script, dupa restul: grila de
  produse si bannerul (elementul LCP) ar fi ajuns pe ecran pe alt drum decat azi, la toate magazinele, pentru o cadere
  care poate nu vine niciodata. Granita de eroare nu schimba nimic din ce se trimite cat timp nimic nu cade.

  ⚠ CE FACE SI CE NU, MASURAT pe un build cu o cadere pusa dinadins (19.11.2026, trei locuri: o varianta incarcata cu
  `dynamic()`, o sectiune importata static, continutul paginii de produs):
   - caderea doar in BROWSER (hidratare, efect): raspuns 200, sectiunea lipseste, restul paginii merge;
   - caderea si pe SERVER: raspunsul e 500 si HTML-ul vine fara continut (fara `Suspense`, React nu are unde opri
     caderea pe server), dar browserul randeaza pagina din datele primite: omul vede magazinul intreg, fara sectiunea
     cazuta (sau, la continutul paginii, mesajul de mai jos intre antet si subsol). Robotii vad 500 pana se repara.
     Inainte de paza, acelasi caz arata tuturor „500 · Ceva nu a functionat corect”, fara antet si fara cos;
   - caderea NUMAI pe server: tot 500 in raspuns, dar pagina din browser e intreaga.
  De aceea prima aparare ramane parserul (`parseStoreDesign`), care nu lasa sa treaca date din care o sectiune sa arunce
  (`intrari-ostile.test.ts`); paza e plasa de dedesubt.

  ⚠ GRANITA E A LUI NEXT (`catchError` din `next/error`, stabil din 16.3), NU o clasa scrisa de mana. Prima varianta,
  din aceeasi zi, era o clasa cu `getDerivedStateFromError` + `unstable_rethrow`. Citind sursa lui `catchError`
  (`next/dist/client/components/catch-error.js`) s-au vazut trei lucruri pe care clasa nu le facea:
   - STAREA DE CADERE SE STERGE LA NAVIGARE (cand se schimba calea). Clasa o tinea cat traia instanta: pe paginile care
     isi pastreaza instanta la navigare, mesajul „Pagina nu s-a putut afisa” ar fi ramas si pe pagina urmatoare;
   - `notFound()` si `redirect()` trec mai departe prin verificarea lui Next (`isNextRouterError`), aceeasi pe care o
     folosesc granitele lui, nu printr-o functie cu `unstable_` in nume;
   - pentru ROBOTI (Googlebot) granita nu arata rezerva, ci lasa caderea sa urce, iar Next pastreaza HTML-ul venit de la
     server: o cadere doar din browser nu scoate sectiunea din ce indexeaza motorul de cautare.
  In plus da `retry()`: recere si rerandeaza copiii, intr-o tranzitie.
*/

interface Proprietati {
  /** Numele sectiunii, pentru raport si pentru caseta din editor („Banner principal”). */
  nume: string;
  /** In editorul de design caderea se spune pe ecran; pe magazinul public sectiunea doar lipseste. */
  inEditor?: boolean;
  /** Ce se arata pe magazinul public in locul ei; lipsa = nimic (o sectiune de pe prima pagina). */
  rezerva?: ReactNode;
}

/** Ce ramane in locul unei sectiuni cazute. Componenta ei, ca raportul sa plece dintr-un efect, o data pe cadere. */
function SectiuneCazuta({ nume, inEditor, rezerva, eroare, reincearca }: Proprietati & { eroare: unknown; reincearca: () => void }) {
  useEffect(() => {
    // Lipsa nu ramane tacuta: pleaca la Sentry cu numele sectiunii. (Caderile de pe server au deja raportul lor.)
    raporteazaEroarea(eroare instanceof Error ? eroare : new Error(String(eroare)), { sectiune: nume });
  }, [eroare, nume]);

  if (!inEditor) return rezerva ?? null;
  return (
    <div role="alert" className="max-w-[var(--st-container,72rem)] mx-auto px-4 py-3">
      <div className="rounded-xl border-2 border-dashed border-[#fca5a5] bg-[#fef2f2] px-4 py-5 text-center text-sm text-[#b91c1c]">
        <p>Secțiunea „{nume}” nu s-a putut afișa. Schimbă-i designul sau conținutul; în magazin ea lipsește, restul paginii merge.</p>
        <button type="button" onClick={reincearca}
          className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-[#fca5a5] bg-white px-3 text-xs font-semibold text-[#b91c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b91c1c]/40">
          Încearcă din nou
        </button>
      </div>
    </div>
  );
}

export const PazaSectiune = catchError(function PazaSectiune(proprietati: Proprietati, { error, retry }: ErrorInfo) {
  return <SectiuneCazuta {...proprietati} eroare={error} reincearca={retry} />;
});

/**
 * Ce vede cumparatorul cand a cazut chiar continutul paginii (produsul, catalogul, cosul), cu antetul si subsolul
 * magazinului ramase in jur: un mesaj scurt si doua drumuri mai departe. Text de vitrina, fara diacritice.
 */
export function ContinutCazut({ acasa }: { acasa: string }) {
  return (
    <div role="alert" className="max-w-[var(--st-container,72rem)] mx-auto px-4 py-16 text-center">
      <p className="text-lg font-semibold text-[var(--st-text,#111827)]">Pagina nu s-a putut afisa</p>
      <p className="mt-2 text-sm text-[var(--st-muted,#6b7280)]">A aparut o eroare neasteptata. Incearca din nou sau intoarce-te in magazin.</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => window.location.reload()}
          className="h-11 px-5 rounded-[var(--st-radius-btn,0.75rem)] bg-[var(--st-primary,#111827)] text-[var(--st-primary-contrast,#ffffff)] text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-primary)]/30">
          Incearca din nou
        </button>
        <a href={acasa}
          className="h-11 px-5 inline-flex items-center rounded-[var(--st-radius-btn,0.75rem)] border border-[var(--st-border,#e5e7eb)] text-sm font-semibold text-[var(--st-text,#111827)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-primary)]/30">
          Inapoi in magazin
        </a>
      </div>
    </div>
  );
}
