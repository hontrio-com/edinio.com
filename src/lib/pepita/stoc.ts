/**
 * Cat stoc se anunta la Pepita, si cand se anunta „nu e pe stoc".
 *
 * ⚠ EDINIO RAMANE SINGURUL ADEVAR DESPRE STOC. Aici nu se scrie nimic in baza si
 * nu exista un al doilea inventar pentru Pepita. Se raspunde la o singura
 * intrebare: din stocul real, cat se ARATA.
 */

export interface StocPepita {
  /** `<Available>` */
  disponibil: boolean;
  /**
   * `<Quantity>`. `null` inseamna „nu se trimite deloc", si e felul corect de a
   * spune „nu tin evidenta bucatilor". Zero ar insemna cu totul altceva.
   */
  cantitate: number | null;
}

/**
 * Stocul de siguranta scazut din cel real.
 *
 *   exportat = max(0, real - siguranta)
 *
 * Cu stoc 5 si siguranta 2, la Pepita pleaca 3. Cu stoc 1 si siguranta 2, pleaca
 * 0, adica marfa nu se mai vinde acolo, dar ramane in magazinul propriu. Asta e
 * si rostul: ultimele bucati se pastreaza pentru canalul unde stocul se vede in
 * timp real, nu pentru cel care citeste feedul o data pe ora.
 */
export function stocExportat(stocReal: number | null | undefined, siguranta: number): number {
  const real = Number(stocReal);
  if (!Number.isFinite(real)) return 0;
  const s = Number(siguranta);
  const rezerva = Number.isFinite(s) && s > 0 ? Math.floor(s) : 0;
  return Math.max(0, Math.floor(real) - rezerva);
}

/**
 * Disponibilitatea unui articol, gata de scris in feed.
 *
 * ⚠ CANTITATE INTREAGA SI NENEGATIVA. Stocul din Edinio poate ajunge negativ
 * dupa o cursa de comenzi; trimis ca atare, un `<Quantity>-3</Quantity>` ar fi
 * ori respins, ori citit ca 3. `stocExportat` il opreste in zero.
 *
 * ⚠ CAND NU SE TINE EVIDENTA, se trimite doar `Available=true`, fara cantitate.
 * Un numar inventat acolo (99, 1000) ar fi o minciuna pe care marketplace-ul o
 * afiseaza clientului ca „mai sunt N bucati".
 */
export function disponibilitate(p: {
  tineEvidenta: boolean;
  stoc: number | null | undefined;
  siguranta: number;
  /** Verdictul gata calculat, pentru pachete: componentele hotarasc, nu campul lor de stoc. */
  disponibilImpus?: boolean;
}): StocPepita {
  if (p.disponibilImpus !== undefined) {
    return { disponibil: p.disponibilImpus, cantitate: null };
  }
  if (!p.tineEvidenta) return { disponibil: true, cantitate: null };
  const cantitate = stocExportat(p.stoc, p.siguranta);
  return { disponibil: cantitate > 0, cantitate };
}
