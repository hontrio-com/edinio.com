/*
  ═══════════════════════════════════════════════════════════════════════════════
  CAND E O COMANDA O VANZARE PE CARE O PUTEM RAPORTA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DEFECTUL CARE A NASCUT FISIERUL ASTA, si a fost gasit pe magazine vii.

  Netopia e singurul procesator FARA ruta de intoarcere: `stripe`, `ipay`,
  `revolut` si `klarna` au fiecare un `/api/<furnizor>/return` care, la esec,
  trimite clientul catre `/confirm?status=esuat`. Netopia il trimite direct catre
  `/{slug}/confirm?orderId=…`, la orice deznodamant.

  Pagina de confirmare are ecran de esec si iese devreme la `status === "esuat"` —
  numai ca Netopia nu aseaza niciodata acel parametru. Deci o plata REFUZATA ajungea
  pe ecranul de izbanda si trimitea, in contul de reclame al COMERCIANTULUI, Meta
  `Purchase`, TikTok `PlaceAnOrder` + `CompletePayment`, GA4 `purchase` si conversia
  Google Ads — cu valoarea intreaga a comenzii.

  Masurat pe 03.09.2026: din 32 de comenzi Netopia, 15 sunt neplatite.

  ⚠ SI A DOUA JUMATATE, gasita cautand-o pe prima: conversia GA4 de pe server
  (Measurement Protocol) pleca la CREAREA comenzii — deci inainte ca omul sa fi
  ajuns macar la procesator. Pentru card, raporta venit pentru comenzi care nu se
  plateau niciodata, fara sa depinda de vreo pagina.

  ═══ ⚠ DE CE NU SE CERE PUR SI SIMPLU „PLATIT" ═══

  Fiindca la RAMBURS nimeni nu plateste in clipa comenzii, si totusi comanda ESTE
  vanzarea: banii vin curierului, zile mai tarziu. 165 din 343 de comenzi sunt asa.
  O regula „doar `paid`" ar sterge conversia celei mai umblate cai din magazine.

  Deci regula are doua brate, si fiecare masoara altceva:
    - plata la livrare (sau marketplace): vanzarea e comanda insasi;
    - plata online: vanzarea e incasarea, si pana atunci nu stim nimic.

  ⚠ SI DE CE E SCRISA AICI, INTR-UN SINGUR LOC. O intreaba pagina de confirmare,
  crearea comenzii si finalizarea platii. Scrisa de trei ori, s-ar desparti la
  primul procesator adaugat — chiar felul in care s-a nascut defectul de sus:
  patru furnizori aveau ruta de intoarcere, al cincilea nu, si nimic n-a cazut.
*/

/**
 * Metodele la care banii se incaseaza ONLINE, inainte de livrare.
 *
 * ⚠ LISTA E POZITIVA, nu negativa (adica „astea asteapta incasare", nu „toate afara
 * de ramburs"). O metoda noua adaugata maine si uitata de aici va fi tratata ca
 * ramburs — deci conversia pleaca la comanda. Directia asta greseste in plus, dar
 * o metoda noua se adauga odata cu ruta ei si cu proba de mai jos, pe cand o lista
 * negativa ar fi taiat tacut rambursul la prima greseala de scriere.
 */
export const PLATI_ONLINE = ["netopia", "stripe", "revolut", "klarna", "ipay"] as const;

/** Metoda asta asteapta o incasare online inainte sa fie o vanzare? */
export function asteaptaIncasareOnline(metoda: string | null | undefined): boolean {
  return (PLATI_ONLINE as readonly string[]).includes((metoda ?? "").toLowerCase());
}

/**
 * Comanda asta e o vanzare pe care o putem raporta in conturile de reclame?
 *
 * ⚠ „NU STIU" SE POARTA CA „NU". La o plata online neconfirmata nu putem deosebi
 * „refuzata" de „notificarea n-a ajuns inca" — randul ramane `unpaid` in amandoua.
 * Netrimisa, conversia se poate recupera cand notificarea soseste; trimisa gresit,
 * intra in invatarea licitatiei si nu mai iese.
 */
export function vanzareaEConfirmata(
  metoda: string | null | undefined,
  stareaPlatii: string | null | undefined,
): boolean {
  if (!asteaptaIncasareOnline(metoda)) return true;
  return (stareaPlatii ?? "").toLowerCase() === "paid";
}
