/*
  ═════════════════════════════════════════════════════════════════════════════════════════════════
  O SINGURA REGULA A MONEDEI, FIINDCA DOUA S-AU DESPARTIT DEJA
  ═════════════════════════════════════════════════════════════════════════════════════════════════

  Aceeasi conversie pleaca pe doua drumuri: din browser, cand omul se intoarce de
  la Stripe, si de pe server, din webhook. Amandoua trebuiau sa refuze o moneda pe
  care n-o cunoastem. Browserul a fost invatat sa refuze SI probat; webhook-ul a
  ramas cu `session.currency ?? "ron"` — adica turna exact ce comentariul lui de
  deasupra interzicea, cu litere mari.

  ⚠ DE CE STA AICI, SI NU DE DOUA ORI. Cat timp regula e scrisa in doua locuri, o
  reparatie facuta intr-unul nu trece in celalalt. S-a intamplat, si nu prima oara.

  ⚠ CE INSEAMNA „DE INCREDERE". Ca putem eticheta suma `RON` fara sa mintim.
  Taxonomia noastra cunoaste doar leul, fiindca atat facturam. O suma in euro
  trimisa cu eticheta `RON` nu cade nicaieri: raporteaza un venit fals si nimic
  n-arata de ce.

  ⚠ „NU STIU" SE POARTA CA „ALTCEVA". Moneda lipsa si moneda straina duc amandoua
  la `null`, deci la „nu trimite". Cand nu stim ce s-a incasat, tacerea e singurul
  raspuns cinstit.
*/

/**
 * Intoarce `"RON"` daca suma incasata poate fi raportata ca lei, altfel `null`.
 *
 * `null` NU inseamna „eroare": inseamna „nu trimite conversia si scrie in jurnal".
 */
export function monedaDeIncredere(currency: string | null | undefined): "RON" | null {
  return currency?.toLowerCase() === "ron" ? "RON" : null;
}
