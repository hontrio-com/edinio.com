import { isCardPaymentMethod } from "@/lib/payment-methods";

/**
 * Cand se da inapoi utilizarea unui cupon ramasa agatata de o plata online
 * care nu s-a incheiat niciodata.
 *
 * Comanda cu plata cu cardul se insereaza INAINTE de redirectul catre
 * procesator (`checkout-core.ts`), iar utilizarea cuponului se revendica atomic
 * chiar inainte de insert. Clientul care inchide pagina Stripe/Netopia lasa in
 * urma o comanda neplatita si o utilizare consumata. Nimic din sistem nu inchide
 * comanda aceea: masurat pe productie (2026-08-04) sunt 2 comenzi online
 * neplatite ramase in „pending" de peste 24 de ore (0 cu cupon, deci maturatoarea
 * elibereaza zero utilizari azi — pana la prima campanie cu cupon limitat).
 *
 * Regula sta aici, nu in ruta, ca sa poata fi verificata cu test: e singura
 * bucata din reparatie care hotaraste de una singura ca banii unei campanii se
 * intorc la comerciant.
 */

/** Cat asteptam dupa plasare inainte sa consideram plata online abandonata. */
export const ORE_PANA_LA_ELIBERARE = 24;

export interface ComandaDeMaturat {
  payment_method: string | null;
  payment_status: string | null;
  status: string | null;
  /** ISO, asa cum vine din Postgres. */
  created_at: string | null;
  discount_code: string | null;
}

export function cuponulSePoateElibera(
  comanda: ComandaDeMaturat,
  acum: number,
  oreDeAsteptare: number,
): boolean {
  // Fara cod nu poate exista revendicare. Reciproca nu e adevarata (o comanda
  // veche poate avea cod fara `discount_id`), dar aceea o taie functia din baza.
  if (!comanda.discount_code) return false;

  // Numai metodele platite in avans. La ramburs „neplatit" e starea NORMALA a
  // unei comenzi vii — 38 din cele 96 de comenzi din productie sunt ramburs
  // expediate si neplatite. Le-am elibera cuponul unor comenzi care se livreaza
  // chiar acum. `isCardPaymentMethod` e aceeasi multime folosita de reducerea de
  // card si de „incasat" pe factura; nu se rescrie aici.
  if (!isCardPaymentMethod(comanda.payment_method)) return false;

  // Platita intre timp (webhook intarziat, reconciliere) — nu se mai atinge.
  if (comanda.payment_status !== "unpaid") return false;

  // Doar comenzile pe care nu le-a atins nimeni. Daca comerciantul a confirmat-o
  // sau a si expediat-o desi e neplatita, vanzarea se face si cuponul ii apartine
  // clientului. Anularea, la randul ei, elibereaza deja pe alt drum (`updateOrder`).
  if (comanda.status !== "pending") return false;

  if (!comanda.created_at) return false;
  const plasata = new Date(comanda.created_at).getTime();
  if (!Number.isFinite(plasata)) return false;

  // Sesiunea de plata Stripe expira la cel mult 24 de ore, iar redirectul
  // Netopia/iPay mult mai devreme; peste pragul asta plata nu mai poate sosi.
  return acum - plasata >= oreDeAsteptare * 3600_000;
}
