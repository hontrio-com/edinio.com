/**
 * Cat are de incasat curierul la livrare.
 *
 * Intrebarea corecta nu e „ce metoda de plata a ales clientul", ci „au intrat
 * banii". Toate cele opt locuri care completau suma de ramburs puneau zero pentru
 * orice metoda diferita de ramburs, indiferent daca plata online chiar se
 * facuse — iar plata online se poate opri oriunde: clientul inchide pagina
 * procesatorului, cardul e refuzat, sesiunea expira. Comanda ramane in panou cu
 * `payment_status: unpaid`, arata ca o comanda cu card, si pleaca cu ramburs 0.
 *
 * S-a intamplat deja: comanda #0033 de la Suporti-Numar.ro (netopia, neplatita)
 * a plecat pe 2026-07-15 cu AWB Woot si fara nicio cale de incasare a celor
 * 105,50 lei.
 *
 * Suma ramane EDITABILA in fiecare formular: asta e valoarea implicita, nu o
 * incuietoare. O comanda platita prin transfer si nemarcata inca „platita" se
 * corecteaza de comerciant inainte de a genera AWB-ul.
 */

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Starile in care banii au fost deja decontati intr-un fel sau altul. */
const FARA_INCASARE = new Set(["paid", "refunded"]);

export function rambursDeIncasat(o: {
  payment_status?: string | null;
  total?: unknown;
}): number {
  /*
   * Se incaseaza doar cand banii chiar lipsesc. „Platita" e limpede; „restituita"
   * intra si ea aici, fiindca a incasa la livrare o comanda ai carei bani tocmai
   * i-ai dat inapoi inseamna sa iei de doua ori de la acelasi om. Daca marfa chiar
   * pleaca dupa o restituire, comerciantul completeaza suma cu mana — greseala in
   * favoarea clientului se vede si se repara, cea inversa se vede abia la reclamatie.
   */
  if (o.payment_status && FARA_INCASARE.has(o.payment_status)) return 0;
  const total = round2(Number(o.total));
  return total > 0 ? total : 0;
}
