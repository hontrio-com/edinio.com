/**
 * Cotele de TVA ale liniilor unei comenzi, si ce se poate face cu ele.
 *
 * ═══ ⚠ EDINIO FACTUREAZA CU O SINGURA COTA ═══
 *
 * `invoiceVat` intoarce UN numar, iar SmartBill, Oblio si fGO il pun pe toate liniile. Pentru
 * o comanda din magazin asta e adevarat prin constructie: cota e a magazinului, una singura.
 *
 * ⚠ NU SI PENTRU O COMANDA DE MARKETPLACE. Pepita trimite TVA pe FIECARE linie, iar in Romania
 * cotele chiar difera: hrana are 11%, restul 21%. O comanda cu amandoua, facturata cu o
 * singura cota, produce un document fiscal gresit. Iar o factura fiscala gresita nu se retrage,
 * se STORNEAZA.
 *
 * ⚠ DE CE NU SE ALEGE PUR SI SIMPLU CEA MAI MARE. Asta faceam pana la auditul din 08.09.2026:
 * `max(cote)`. E cea mai proasta alegere din toate, fiindca supra-taxeaza TOATE liniile, si o
 * face tacut. Cand chiar trebuie ales un singur numar, se alege cota liniei cu valoarea cea
 * mai mare: aceea aduce totalul cel mai aproape de adevar.
 *
 * ⚠ DAR ALEGEREA NU E O REPARATIE, ci o valoare de rezerva. Cand cotele difera, factura NU se
 * emite automat, si comerciantul afla de ce.
 *
 * Modul e PUR: se cheama si din ingest, si din facturare, si din panou.
 */

export interface LinieCuTva {
  price?: unknown;
  quantity?: unknown;
  vat_rate?: unknown;
}

export interface CoteleLiniilor {
  /** Cotele distincte, crescator. Gol cand nicio linie n-are cota scrisa. */
  cote: number[];
  /** Toate liniile poarta aceeasi cota (sau niciuna n-o poarta). */
  uniforma: boolean;
  /**
   * Cota cu care s-ar factura, daca s-ar factura.
   *
   * La cote uniforme e chiar aceea. La cote diferite e a liniei cu valoarea cea mai mare:
   * nu e corecta, dar e cea mai putin gresita. Se foloseste doar ca sa nu ramana comanda
   * fara nicio cota scrisa; emiterea automata se opreste oricum.
   */
  cotaDominanta: number;
}

function numar(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Cota unei linii, sau `null` cand linia n-o poarta. */
function cotaLiniei(l: LinieCuTva): number | null {
  if (l?.vat_rate === null || l?.vat_rate === undefined || l.vat_rate === "") return null;
  const n = Number(l.vat_rate);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function coteleLiniilor(items: unknown): CoteleLiniilor {
  const linii = Array.isArray(items) ? (items as LinieCuTva[]) : [];
  const valoarePeCota = new Map<number, number>();

  for (const l of linii) {
    const cota = cotaLiniei(l);
    if (cota === null) continue;
    const valoare = numar(l.price) * (numar(l.quantity) || 1);
    valoarePeCota.set(cota, (valoarePeCota.get(cota) ?? 0) + valoare);
  }

  const cote = [...valoarePeCota.keys()].sort((a, b) => a - b);
  if (cote.length === 0) return { cote: [], uniforma: true, cotaDominanta: 0 };

  /*
   * ⚠ La valori egale castiga cota MAI MARE, nu prima intalnita. Ordinea liniilor intr-un
   * `jsonb` nu e o hotarare a nimanui, iar un rezultat care atarna de ea s-ar schimba singur
   * la prima rescriere a comenzii. Iar dintre doua rele, sub-taxarea e cea care aduce control
   * fiscal, nu supra-taxarea.
   */
  let dominanta = cote[0];
  let maxim = -1;
  for (const c of cote) {
    const v = valoarePeCota.get(c) ?? 0;
    if (v > maxim || (v === maxim && c > dominanta)) { maxim = v; dominanta = c; }
  }

  return { cote, uniforma: cote.length === 1, cotaDominanta: dominanta };
}

/**
 * Ce i se spune comerciantului cand comanda are cote diferite, sau `null` cand n-are.
 *
 * ⚠ SPUNE SI UNDE SE FACE, nu doar ca nu se poate. Un „nu se poate" fara urmatoarea miscare
 * l-a pus deja pe comerciant sa apese de 208 ori un buton care n-avea cum sa mearga.
 */
export function motivCoteAmestecate(items: unknown): string | null {
  const r = coteleLiniilor(items);
  if (r.uniforma) return null;
  return `Comanda are cote de TVA diferite pe linii (${r.cote.map((c) => `${c}%`).join(", ")}), `
    + "iar Edinio emite factura cu o singură cotă. Emite factura din contul tău de facturare, "
    + "cu cotele corecte pe fiecare produs.";
}
