/**
 * Poate o plata confirmata sa avanseze comanda la „confirmed"?
 *
 * Doar din „pending". Confirmarea unei plati poate veni tarziu — dintr-un
 * webhook re-livrat sau din cronul de reconciliere, care se uita si la comenzi
 * de acum cateva zile. Fara garda asta, o astfel de confirmare ar da comanda
 * inapoi din „shipped" sau „delivered" in „confirmed", adica ar sterge munca pe
 * care comerciantul o facuse deja.
 *
 * Modul separat si fara dependinte: e o regula pura, testabila, iar restul
 * lantului de finalizare a platii atinge Supabase si Stripe.
 */
export function poateAvansaLaConfirmat(status: string | null | undefined): boolean {
  return status === "pending";
}
