import { mesajRefuzStoc, type RefuzStoc } from "./refuz-stoc";

/**
 * Ce s-a intamplat cu rezervarea de stoc a unei comenzi.
 *
 * ═══ NU MAI EXISTA „MERGI MAI DEPARTE FARA VERDICT" ═══
 *
 * Pana la 19.08 exista o a treia stare, `nerevendicat`: cand RPC-ul nu raspundea,
 * comanda trecea mai departe si se scadea stocul pe algoritmul VECHI — cel care
 * plafoneaza la zero in loc sa refuze, adica exact cel care supravindea marimile.
 *
 * Justificarea scrisa atunci era „cat timp migratia nu e aplicata". Migratia E
 * aplicata de o zi, iar ce ramasese nu mai era o punte, ci o trapa: un cache de
 * schema stricat, un `REVOKE` gresit sau un deploy ajuns inaintea migratiei ar fi
 * REDESCHIS supravanzarea singure, in tacere.
 *
 * Asta e forma de defect pe care o vanam de doua zile: **sistemul de siguranta
 * cade, aplicatia continua, si continua pe purtarea nesigura.** Un checkout oprit
 * doua minute e incomparabil mai ieftin decat marfa vanduta de doua ori.
 */
export type Revendicare =
  | { fel: "revendicat" }
  /** Verdictul nu s-a putut da. Comanda NU intra. */
  | { fel: "esuat"; error: string }
  /** Verdict adevarat: nu mai e marfa. */
  | { fel: "refuzat"; error: string };

/** Ce i se spune clientului cand nu putem AFLA daca e stoc. */
export const MESAJ_ESUAT =
  "Nu putem verifica stocul chiar acum. Reincearca peste cateva momente.";

/**
 * Traduce raspunsul lui `revendica_stoc_complet` intr-un verdict.
 *
 * Sta separat de `order.actions.ts` fiindca acolo, sub `"use server"`, nu poate fi
 * testat — si tocmai asta trebuie sa fie: singurul loc unde se hotaraste daca o
 * comanda are voie sa intre fara ca stocul sa fi fost rezervat.
 *
 * Regula, intr-o propozitie: **numai `{ok: true}` lasa comanda sa treaca.** Orice
 * altceva — eroare, `null`, forma neasteptata — o opreste.
 */
export function interpreteazaRevendicarea(
  data: unknown,
  error: { message?: string } | null,
): Revendicare {
  if (error) return { fel: "esuat", error: MESAJ_ESUAT };

  const rez = data as (RefuzStoc & { ok?: boolean }) | null;
  if (rez?.ok === true) return { fel: "revendicat" };
  if (rez?.ok === false) return { fel: "refuzat", error: mesajRefuzStoc(rez) };

  /*
   * Raspuns de alta forma: se OPRESTE, nu se presupune nimic.
   *
   * Varianta veche presupunea aici „n-a mers revendicarea, dar mergem inainte".
   * Un `revendicat` pe ghicite ar fi si mai rau: comanda ar pleca fara sa fi
   * scazut stocul nicaieri — adica invers decat supravanzarea, si la fel de tacut.
   */
  return { fel: "esuat", error: MESAJ_ESUAT };
}
