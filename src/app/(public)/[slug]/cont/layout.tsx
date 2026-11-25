import type { Metadata } from "next";

/*
  ZONA DE CONT NU ISI SPUNE ADRESA MAI DEPARTE (25.11.2026, gasit la recenzie).

  Din zona de cont se iese printr-o incarcare completa (antetul magazinului si legaturile din ecrane sunt
  `<a>`), ca pixelii magazinului sa nu ajunga niciodata in acelasi document cu ea. Dar o incarcare completa
  duce cu ea „pagina de unde vine omul”: pagina urmatoare ar fi primit `/cont/comenzi/<id>` drept
  `document.referrer`, iar pixelii ei (cu acord) il trimit mai departe. Identificatorul comenzii deschide
  rezumatul comenzii pe pagina de confirmare, fara sesiune.

  `strict-origin`: de aici pleaca numai originea (`https://magazin.ro/`), niciodata calea. Atribuirea vizitei
  nu pierde nimic: zona de cont exista doar pe domeniul propriu, unde orice provenienta de pe aceeasi gazda e
  socotita navigare interna (`lib/storefront/attribution.ts`, `clasificaSursa`). Cererile zonei de cont catre
  propriile rute se verifica dupa `Origin`, nu dupa `Referer` (`lib/cont/cerere.ts`).

  ⚠ Layoutul NU scoate pixelii din zona de cont: un layout copil nu poate sterge ce a desenat parintele.
  Asta face `DoarInAfaraContului`. Aici se adauga doar metadatele comune tuturor paginilor de cont.
*/
export const metadata: Metadata = { referrer: "strict-origin" };

export default function ZonaDeCont({ children }: { children: React.ReactNode }) {
  return children;
}
