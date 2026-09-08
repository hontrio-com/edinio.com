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

/**
 * Cota unei linii, sau `null` cand linia n-o poarta.
 *
 * ⚠ LIPSA NU E ZERO, si asta e chiar deosebirea care conteaza. `Number(undefined) || 0` ar fi dat
 * 0%, adica „scutit de TVA" — iar toate comenzile din magazin, care n-au cota pe linie, ar fi
 * plecat cu 0% la facturare. Lipsa inseamna „linia n-are opinie", si atunci hotaraste documentul.
 */
export function cotaLiniei(l: LinieCuTva): number | null {
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
 * Cota cu care pleaca ACEASTA linie pe factura: a ei, altfel a documentului.
 *
 * ⚠ REGULA E `cota liniei ?? cota documentului`, si trebuie probata chiar asa. Scrisa
 * `Number(l.vat_rate) || cotaDocumentului`, o linie cu 0% ADEVARAT (o carte, un produs scutit) ar
 * fi capatat tacut cota documentului. Zero e o cota, nu o lipsa.
 */
export function cotaDeFacturare(l: LinieCuTva, cotaDocumentului: number): number {
  const a = cotaLiniei(l);
  return a === null ? cotaDocumentului : a;
}

export interface GrupaDeCota {
  cota: number;
  /** Valoarea liniilor din grupa, in unitatea in care sunt scrise in comanda. */
  valoare: number;
}

/**
 * Liniile comenzii, adunate pe cote.
 *
 * ⚠ DE CE E NEVOIE: cand cotele difera, TVA-ul continut in totalul comenzii nu se mai poate scoate
 * impartind la un singur numar. Se scoate pe grupe, si abia suma lor e adevarul. Vezi
 * `reconciliazaFactura`.
 *
 * ⚠ Transportul, reducerile si taxele NU sunt aici. Ele n-au cota proprie nicaieri in baza, si
 * apelantul trebuie sa hotarasca ce face cu ele — vezi `imparteProportional`.
 */
export function grupePeCota(items: unknown, cotaDocumentului: number): GrupaDeCota[] {
  const linii = Array.isArray(items) ? (items as LinieCuTva[]) : [];
  const peCota = new Map<number, number>();
  for (const l of linii) {
    const cota = cotaDeFacturare(l, cotaDocumentului);
    const valoare = numar(l.price) * (numar(l.quantity) || 1);
    peCota.set(cota, (peCota.get(cota) ?? 0) + valoare);
  }
  return [...peCota.entries()]
    .map(([cota, valoare]) => ({ cota, valoare }))
    .sort((a, b) => a.cota - b.cota);
}

/**
 * TVA-ul CONTINUT intr-o suma bruta, pe grupe de cota.
 *
 * ⚠ `brut × c / (100 + c)`, nu `brut × c / 100`. A doua formula adauga TVA peste o suma care il
 * contine deja, si iese cu vreo cincime mai mare — greseala clasica, si tacuta, fiindca rezultatul
 * arata plauzibil.
 */
export function tvaContinut(grupe: GrupaDeCota[]): number {
  const suma = grupe.reduce((s, g) => s + (g.valoare * g.cota) / (100 + g.cota), 0);
  return Math.round(suma * 100) / 100;
}

/**
 * Imparte o suma (reducere, transport, taxa) intre grupele de cota, PROPORTIONAL cu valoarea lor.
 *
 * ═══ ⚠ DE CE PROPORTIONAL, SI DE CE TREBUIE IMPARTITA ═══
 *
 * O reducere de 100 de lei peste linii de 11% si de 21% nu are o cota a ei: ea micsoreaza baza
 * fiecarei grupe. Pusa intreaga pe o singura cota, TVA-ul reducerii iese gresit — si iese cu semn
 * OPUS fata de eroarea de pe linii, deci totalul poate parea corect in timp ce defalcarea de TVA e
 * gresita. Exact felul de eroare pe care n-o vede nici comerciantul, nici garda de reconciliere.
 *
 * ⚠ ULTIMA GRUPA IA RESTUL. Trei impartiri rotunjite la doi bani nu dau intotdeauna suma de la
 * care s-a plecat; fara randul asta, factura ar fi iesit cu un ban pe langa si garda ar fi
 * absorbit-o printr-o „ajustare de rotunjire" care de fapt ascunde o impartire gresita.
 */
export function imparteProportional(suma: number, grupe: GrupaDeCota[]): Map<number, number> {
  const out = new Map<number, number>();
  if (grupe.length === 0) return out;

  const total = grupe.reduce((s, g) => s + g.valoare, 0);
  if (total <= 0) {
    /* Fara valoare pe care sa se sprijine impartirea, tot pe prima grupa: nu se inventeaza cote. */
    out.set(grupe[0].cota, Math.round(suma * 100) / 100);
    return out;
  }

  let dat = 0;
  grupe.forEach((g, i) => {
    const ultima = i === grupe.length - 1;
    const parte = ultima
      ? Math.round((suma - dat) * 100) / 100
      : Math.round((suma * g.valoare / total) * 100) / 100;
    dat += parte;
    out.set(g.cota, (out.get(g.cota) ?? 0) + parte);
  });
  return out;
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
