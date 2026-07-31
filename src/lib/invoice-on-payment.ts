/**
 * Facturarea automata dupa o plata online confirmata.
 *
 * Dispecerul de facturare (`maybeAutoInvoice`) era chemat DOAR din panou, la
 * modificarea manuala a comenzii. Nicio cale de plata online nu il chema, deci
 * comerciantul cu declansatorul pe „Platita" nu primea factura niciodata: singurul
 * lucru care marcheaza plata la card e chiar calea de plata. Iar cel cu
 * declansatorul pe „Comanda confirmata" o pierdea la fel de sigur — plata pune
 * comanda direct in „confirmed", asa ca atunci cand comerciantul o muta mai
 * departe pe „Expediata", declansatorul nu se mai potriveste niciodata.
 *
 * Se cheama DUPA ce comanda a fost marcata platita, cu starea rezultata. Emiterea
 * ramane idempotenta in dispecer: daca exista deja factura de la orice furnizor,
 * nu se mai emite nimic, deci o re-livrare de webhook nu produce a doua factura.
 *
 * Fire-and-forget: emiterea unei facturi nu are voie sa rupa confirmarea platii.
 */
export function factureazaDupaPlata(
  businessId: string,
  orderId: string,
  status: string,
  paymentStatus: string,
): void {
  void (async () => {
    try {
      // Clientul de sistem se creeaza AICI si se paseaza mai departe. E si cheia
      // de acces peste RLS, si dovada ca apelul vine de pe server: dispecerul e
      // exportat dintr-un modul „use server", deci e si actiune apelabila din
      // browser, iar un client Supabase nu poate fi trimis dintr-o cerere.
      const [{ createAdminClient }, { maybeAutoInvoice }] = await Promise.all([
        import("@/lib/supabase/admin"),
        import("@/lib/actions/invoice-auto.actions"),
      ]);
      await maybeAutoInvoice(businessId, orderId, status, paymentStatus, createAdminClient() as never);
    } catch (err) {
      console.error("[facturare] auto-invoice dupa plata a esuat:", { orderId, err });
    }
  })();
}
