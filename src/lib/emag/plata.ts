/**
 * Au intrat banii la eMAG?
 *
 * ═══ ⚠ DE CE E O FUNCTIE, SI NU O COMPARATIE SCRISA LA FATA LOCULUI ═══
 *
 * `c.payment_status === 1 ? "paid" : "pending"` era scrisa de DOUA ori in `orders.ts`
 * (la insert si la actualizare). A treia oara ar fi fost aici. Iar in casa s-a vazut de
 * mai multe ori ce se intampla cu aceeasi regula scrisa in doua locuri: se despart.
 *
 * ⚠ 1 = platita LA EI, prin card sau transfer. Orice altceva — inclusiv lipsa campului —
 * inseamna „banii nu s-au incasat", deci curierul are de luat.
 */
export function platitLaEi(payment_status: unknown): "paid" | "pending" {
  return payment_status === 1 ? "paid" : "pending";
}

/**
 * Ce stare de plata se ia in seama la o comanda eMAG.
 *
 * ═══ ⚠ AICI SE PIERD BANI, SI E A DOUA OARA (25.08.2026) ═══
 *
 * `rambursDeIncasat` — regula casei, scrisa dupa comanda #0033 de la Suporti-Numar.ro,
 * 105,50 lei plecati pe 15.07.2026 fara nicio cale de incasare — intreaba „au intrat
 * banii", si citeste raspunsul din `orders.payment_status`.
 *
 * ⚠ DAR PE O COMANDA eMAG CAMPUL ACELA E EDITABIL DE MANA, iar magazinul nu incaseaza el
 * banii: ii incaseaza eMAG. Deci un „Platit" pus din selectorul generic al Edinio facea ca
 * AWB-ul sa plece cu `cod: 0` pe o comanda cu ramburs. Curierul livreaza si nu ia nimic.
 *
 * ⚠ SI NU SE POATE INDREPTA DIN FORMULAR. Regula casei se sprijina anume pe faptul ca
 * „suma ramane EDITABILA in fiecare formular" — dar pe calea eMAG suma e TEXT, nu camp
 * (`EmagAwbModal`), fiindca acolo AWB-ul se emite prin ei. Deci singura plasa pe care se
 * bizuia regula lipseste exact unde greseala costa.
 *
 * ⚠ IAR URMA SE STERGE SINGURA: reconcilierea readuce `payment_status` la ce spun ei
 * (`orders.ts`), deci randul se repara — dupa ce coletul a plecat. Cine s-ar uita a doua zi
 * n-ar gasi nimic in neregula.
 *
 * ⚠ ALEGEREA IZVORULUI, si de ce NU `cashed_cod`: acela e cat s-a INCASAT deja, adica zero
 * inainte de livrare — l-am folosi si am trimite ramburs pe o comanda platita cu cardul.
 * Se ia `payment_status` DIN RASPUNSUL LOR: e chiar campul din care ingestul scrie starea
 * locala, doar ca necopiat si neatins de mana nimanui.
 *
 * ⚠ SENSUL GRESELII E ALES DINADINS. Cand nu stim (campul lipseste din raspuns), iese
 * „pending", adica se incaseaza. O incasare in plus pe o comanda deja platita se vede la
 * usa si se repara pe loc; una lipsa se vede abia la socoteala de la sfarsitul lunii.
 */
export function stareaPlatiiPentruRamburs(
  raspunsulLor: { payment_status?: unknown } | null | undefined,
  comandaNoastra: { payment_status?: string | null } | null | undefined,
): string | null {
  /* Ei ne-au spus ceva? Atunci cuvantul lor bate ce scrie la noi. */
  if (raspunsulLor && raspunsulLor.payment_status != null) {
    return platitLaEi(raspunsulLor.payment_status);
  }
  /*
   * ⚠ N-avem raspunsul lor pastrat (o comanda foarte veche, sau `raw` gol). Atunci se cade
   * inapoi pe ce stim noi — dar asta e chiar valoarea editabila, deci e cazul in care
   * greseala tot se poate strecura. Se intampla numai fara `raw`, iar `raw` se scrie la
   * fiecare citire a comenzii.
   */
  return comandaNoastra?.payment_status ?? null;
}
