/**
 * Cand isi poate anula omul singur comanda, din cont.
 *
 * ⚠⚠ ACEEASI REGULA CA IN BAZA (`cont_anuleaza_comanda`), iar o proba le tine
 * impreuna. Baza e apararea; asta decide numai daca butonul se arata, ca omul sa
 * nu apese pe ceva ce baza oricum refuza.
 *
 * Numai neplatita, cu plata la livrare sau prin transfer, si inca neintrata in
 * lucru: la card, banii pot intra chiar in clipa anularii.
 */
export const METODE_ANULABILE = ["cash_on_delivery", "ramburs", "bank_transfer"] as const;

export function sePoateAnulaDinCont(c: { stare: string; starePlata: string | null; metodaPlata: string | null }): boolean {
  return (
    c.stare === "pending"
    && (c.starePlata ?? "unpaid") === "unpaid"
    && (METODE_ANULABILE as readonly string[]).includes(c.metodaPlata ?? "")
  );
}
