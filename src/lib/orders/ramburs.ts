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

/**
 * Banii ii incaseaza marketplace-ul, nu curierul comerciantului?
 *
 * ═══ ⚠ DE CE NU SE DEDUCE AICI, CI SE CITESTE ═══
 *
 * Raspunsul depinde de reguli ale FURNIZORULUI, si nu de aceleasi la fiecare: la
 * Pepita atarna de perechea plata + livrare (rambursul unei comenzi Pepita Delivery
 * ajunge la ei, al uneia cu curierul comerciantului nu). Regula aia se poate schimba
 * la ei fara sa ne spuna nimeni.
 *
 * De aceea hotararea se ia O SINGURA DATA, la ingest, cu documentatia in fata, si se
 * SCRIE pe comanda. Aici doar se citeste. Dedusa la fiecare emitere de AWB, s-ar fi
 * putut schimba sub picioarele unei comenzi deja intrate.
 *
 * ⚠ Lipsa cheii inseamna „nu stim, deci se poarta ca pana acum". Comenzile din
 * magazin si cele ale marketplace-urilor care nu o scriu raman neatinse.
 */
export function baniiIiIaMarketplaceul(orderSource: unknown): boolean {
  return (orderSource as { incaseaza_marketplace?: unknown } | null)?.incaseaza_marketplace === true;
}

/**
 * Comanda e intr-o moneda pe care curierul nu o poate incasa la usa.
 *
 * ⚠ REGULA E „RON", nu „moneda magazinului", si asta nu e o scapare: rambursul il incaseaza
 * un curier care lucreaza in lei. Nu poti cere unui curier roman sa stranga 15.000 de forinti,
 * oricare ar fi moneda in care isi tine magazinul socotelile.
 *
 * ⚠ Lipsa cheii inseamna „nu stim, deci se poarta ca pana acum": comenzile din magazin si cele
 * vechi, care n-au deloc `order_source`, raman neatinse.
 */
export function monedaNeincasabila(orderSource: unknown): boolean {
  const src = orderSource as { currency?: unknown; moneda_necitita?: unknown } | null;
  /*
   * ⚠ SI CAND NU STIM IN CE MONEDA E. Marketplace-ul a trimis un cod pe care nu l-am putut citi;
   * `currency` de pe comanda ramane cea mai buna presupunere, dar a precompleta un ramburs pe o
   * presupunere despre bani inseamna sa ceri la usa o cifra care poate fi in alta moneda.
   */
  if (src?.moneda_necitita === true) return true;
  const m = src?.currency;
  return typeof m === "string" && m.trim() !== "" && m.trim().toUpperCase() !== "RON";
}

export interface ComandaCuRamburs {
  payment_status?: string | null;
  total?: unknown;
  /**
   * ⚠ OBLIGATORIU, SI ASTA E TOATA IDEEA.
   *
   * Campul e cerut, nu optional, fiindca altfel cele unsprezece locuri care pasau
   * `{ payment_status, total }` ar fi trecut mai departe pe langa regula noua fara ca
   * nimic sa spuna ceva: exact tiparul „paza pe un fisier nu e paza pe regula".
   * Cerut, `tsc` numeste fiecare apelant care nu-l trimite.
   *
   * Poate fi `null` la comenzile vechi: acolo nu exista `order_source` deloc.
   */
  order_source: unknown;
}

export function rambursDeIncasat(o: ComandaCuRamburs): number {
  /*
   * Se incaseaza doar cand banii chiar lipsesc. „Platita" e limpede; „restituita"
   * intra si ea aici, fiindca a incasa la livrare o comanda ai carei bani tocmai
   * i-ai dat inapoi inseamna sa iei de doua ori de la acelasi om. Daca marfa chiar
   * pleaca dupa o restituire, comerciantul completeaza suma cu mana — greseala in
   * favoarea clientului se vede si se repara, cea inversa se vede abia la reclamatie.
   */
  if (o.payment_status && FARA_INCASARE.has(o.payment_status)) return 0;
  /*
   * ⚠ SI CAND BANII AJUNG LA MARKETPLACE, oricare ar fi starea platii.
   *
   * O comanda Pepita Delivery cu ramburs e „neplatita" pana cand clientul plateste la
   * usa, dar plateste curierului LOR, iar decontarea vine de la ei. Precompletat aici,
   * totalul ar fi fost cerut a doua oara de curierul comerciantului.
   */
  if (baniiIiIaMarketplaceul(o.order_source)) return 0;
  /*
   * ⚠ SI CAND CIFRA NU E IN LEI. `orders.total` e citit ca lei peste tot; precompletat pe o
   * comanda in HUF, ar fi trecut cifra ungureasca in campul de ramburs al AWB-ului, si curierul
   * ar fi cerut atatia LEI la usa. Comerciantul completeaza suma convertita cu mana.
   */
  if (monedaNeincasabila(o.order_source)) return 0;
  const total = round2(Number(o.total));
  return total > 0 ? total : 0;
}
