/**
 * Poate punctul Ship & Go sa incaseze rambursul asa cum il vrea comerciantul?
 *
 * ═══ ⚠ DOUA INTREBARI, NU UNA ═══
 *
 * Pana azi se cerea un singur lucru de la punct: `ServiceCOD`, adica „accepta ramburs".
 * Documentatia lor cere doua, si a doua e chiar cea care se vede la ghiseu:
 *
 *     "ServiceCOD" - the delivery point dose or dose not allow COD
 *     "PaymentType" - payment type of the delivery point
 *                     ( 1 - no payment available, 2 - pay only by card,
 *                       3 - pay by cash or card, 4 - pay only cash )
 *
 * Un punct cu `ServiceCOD: true` si `PaymentType: 2` primeste ramburs, dar NUMAI PE CARD.
 * Trecea filtrul nostru, iar coletul pleca acolo cu `CashRepayment`. Cumparatorul ajunge la
 * ghiseu cu banii in mana si nu are cum sa plateasca: coletul se intoarce, marfa se blocheaza,
 * si nimeni nu stie de ce.
 *
 * ⚠ SI PE DOS, la fel de scump: comerciantul care isi ia rambursul in cont (`bank`) inseamna,
 * la ghiseu, plata cu cardul. Un punct `PaymentType: 4` (numai numerar) nu poate face asta.
 *
 * ⚠ `PaymentType: 1` nu incaseaza nimic, oricat ar spune `ServiceCOD`.
 */

/** Ce forme de plata primeste punctul, dupa documentatia lor. */
export const PLATA_IN_PUNCT = {
  NICIUNA: 1,
  DOAR_CARD: 2,
  NUMERAR_SAU_CARD: 3,
  DOAR_NUMERAR: 4,
} as const;

export type PunctCuPlata = {
  /** Steagul lor: punctul primeste sau nu ramburs. */
  serviceCod: boolean;
  /** `PaymentType` de la ei. Lipsa inseamna „nu stim", si atunci vezi nota de mai jos. */
  paymentType?: number | null;
};

/** Cum isi ia comerciantul rambursul: numerar in plic, sau in contul colector. */
export type FormaRambursului = "cash" | "bank";

/**
 * Poate pleca la punctul asta un colet cu ramburs, in forma pe care o vrea comerciantul?
 *
 * ⚠ `ramburs` zero inseamna ca intrebarea nu se pune: orice punct e bun.
 *
 * ⚠ CAND `paymentType` LIPSESTE, PUNCTUL RAMANE IN LISTA daca are `ServiceCOD`. E purtarea
 * de pana acum, si e alegerea prudenta: campul e optional in raspunsul lor, iar scos din
 * lista pentru lipsa lui, un cont care nu-l trimite ar ramane BRUSC fara niciun punct. O
 * lista goala nu produce niciun mesaj in interfata, deci defectul ar fi tacut.
 */
export function punctulPoateIncasa(
  punct: PunctCuPlata,
  ramburs: number,
  forma: FormaRambursului,
): boolean {
  if (!(ramburs > 0)) return true;
  if (!punct.serviceCod) return false;

  const tip = punct.paymentType;
  if (tip === null || tip === undefined || !Number.isFinite(tip)) return true;

  if (tip === PLATA_IN_PUNCT.NICIUNA) return false;
  if (tip === PLATA_IN_PUNCT.NUMERAR_SAU_CARD) return true;

  /*
   * Rambursul in cont se incaseaza la ghiseu CU CARDUL, iar cel in plic, in NUMERAR. De-aia
   * cele doua forme cer puncte diferite, si de-aia nu se poate raspunde fara sa stii forma.
   */
  if (tip === PLATA_IN_PUNCT.DOAR_CARD) return forma === "bank";
  if (tip === PLATA_IN_PUNCT.DOAR_NUMERAR) return forma === "cash";

  /*
   * ⚠ UN COD PE CARE NU-L STIM PASTREAZA PUNCTUL, ca si lipsa campului, si din acelasi
   * motiv: ei pot adauga maine o valoare noua, iar taiata, un cont intreg ar ramane peste
   * noapte fara niciun punct Ship & Go. O lista goala nu produce niciun mesaj in interfata,
   * deci ar fi un defect tacut si total; un colet trimis la un ghiseu care nu incaseaza e un
   * defect vizibil si rar. Intre cele doua, se alege cel vizibil.
   */
  return true;
}
