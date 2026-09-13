/* ═══════════════════════════════════════════════════════════════════════════
   O SINGURA CITIRE A ADRESEI DE LIVRARE
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ `shipping_address` are DOUA familii de campuri pentru acelasi lucru.

   ⚠ CINE SCRIE FIECARE FAMILIE, MASURAT PE COD SI PE BAZA (13.09.2026), nu presupus:

     `address`     checkout-ul propriu (`order.actions.ts`), editarea din panou, si
                   marketplace-urile Pepita, Trendyol, About You. E MEREU ultima
                   valoare confirmata de un OM.
     `street`      DOAR ingestul eMAG (`lib/emag/orders.ts`). E linia bruta primita de
                   la ei, cu numarul deja in text, si nu se mai actualizeaza niciodata.
     `street_no`   NIMENI. Zero scrieri in tot `src/`, zero randuri din cele 425 din
                   productie. Ramane doar pentru ce tasteaza omul in ferestrele de AWB.

   Cifrele de atunci: 271 de comenzi proprii, toate cu `address` si niciuna cu `street`;
   102 eMAG, toate cu `street` si niciuna cu `address`.

   ⚠ PRIMA FORMA A ACESTUI BLOC SPUNEA PE DOS („checkout-ul scrie `street`"), si din
   premisa aia gresita au iesit doua ferestre intoarse. De aceea sta scris aici ce s-a
   MASURAT, cu locurile in care se poate remasura.

   ⚠ ALEGEREA AJUTORULUI SE FACE DUPA FORMA CAMPULUI, nu dupa curier:

     un singur camp de adresa      -> `liniaAdresei`   (Cargus, Woot, Sameday)
     un camp „Strada" fara numar   -> `stradaCuNumar`  (GLS, Pall-Ex)
     campuri separate strada+numar -> `stradaDestinatarului` (FAN, DPD, eColet, Colete)

   ⚠ CELE DOUA CARE PREFERA `street` SE SPRIJINA PE EDITARE. `stradaCuNumar` si
   `stradaDestinatarului` ar intoarce linia VECHE pe o comanda eMAG corectata in panou,
   daca acolo ar ramane si `street`, si `address`. Nu ramane: `editeazaComanda` stinge
   familia veche cand scrie corectura (`order.actions.ts`), iar ajutoarele cad si pe
   sirul gol. Cine slabeste vreodata partea aia trebuie sa reciteasca randurile astea.

   Scrisa aici o data, regula nu se mai poate dezbina la a douazecea fereastra.
*/

/** Ce anume tine adresa unei comenzi, in oricare din cele doua familii de campuri. */
export interface AdresaLivrare {
  street?: string | null;
  address?: string | null;
  street_no?: string | null;
}

/**
 * Strada destinatarului, din oricare familie de campuri o are comanda.
 *
 * ⚠ `street` are intaietate DOAR unde numarul pleaca printr-un camp separat, fiindca
 * acolo strada fara numar e ce trebuie. Pe o comanda eMAG EDITATA in panou, `street`
 * ramane linia veche si `address` poarta corectura: vezi nota de la `liniaAdresei`.
 */
export function stradaDestinatarului(addr: AdresaLivrare | null | undefined): string {
  /*
   * ⚠ SE CADE SI PE SIRUL GOL, nu doar pe `null`.
   *
   * Prima forma era `addr?.street ?? addr?.address`, iar `??` nu cade decat pe
   * `null`/`undefined`. O comanda cu `street: ""` si `address` completat, cazul
   * obisnuit pentru randurile venite din marketplace, unde coloana exista dar e
   * goala, ar fi iesit cu adresa GOALA. Iar de cand strada e obligatorie la
   * emitere, aia ar fi devenit un refuz pe o comanda perfect buna.
   */
  const dinStreet = (addr?.street ?? "").trim();
  if (dinStreet) return dinStreet;
  return (addr?.address ?? "").trim();
}

/** Strada si numarul, intr-o singura linie, pentru curierii care cer asa. */
export function stradaCuNumar(addr: AdresaLivrare | null | undefined): string {
  return [stradaDestinatarului(addr), (addr?.street_no ?? "").trim()]
    .filter(Boolean).join(" ").trim();
}

/**
 * Adresa ca O SINGURA LINIE, pentru curierii care nu au camp separat de numar.
 *
 * ⚠ Ordinea e INVERSA fata de `stradaDestinatarului`, si dinadins, din doua motive:
 *
 *   1. Acolo unde incape un singur camp, linia intreaga e mai completa decat strada
 *      structurata fara numarul ei.
 *   2. `address` e singura familie pe care o scrie EDITAREA din panou. Pe o comanda
 *      eMAG corectata de comerciant, `street` ramane adresa DINAINTE de corectura, iar
 *      o fereastra care ar prefera `street` ar trimite coletul unde clientul nu mai e.
 *
 * Cine are `street`+`street_no` le primeste lipite, ca sa nu piarda numarul.
 */
export function liniaAdresei(addr: AdresaLivrare | null | undefined): string {
  const dinAddress = (addr?.address ?? "").trim();
  if (dinAddress) return dinAddress;
  return stradaCuNumar(addr);
}
