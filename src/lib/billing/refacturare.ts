/**
 * Cand se poate emite o factura pentru o comanda si cand nu — regula celor trei case.
 *
 * Pana acum, dupa un storno reusit comanda ramanea DEFINITIV nefacturabila.
 * Stornarea scria numarul notei de credit si lasa pe loc numarul facturii, iar
 * garda de emitere se uita exact la el („Factura a fost deja generata"). Nicaieri
 * in `src/` nu se punea vreodata pe null vreunul din `smartbill_invoice_number`,
 * `oblio_invoice_number`, `smartbill_storno_number`, `oblio_storno_number`,
 * `fgo_storno_number`.
 *
 * Masurat in productie pe 2026-08-04: 7 comenzi in starea asta, pe 3 magazine
 * (suporti-numar 3, tonel-beauty 1, itp-blk 3). Doua nu sunt istorie, sunt marfa
 * vie: itp-blk #0006 e `pending` si #0007 e `confirmed`, amandoua cu factura fGO
 * stornata. Interfata de editare a comenzii sfatuia chiar „emite storno si
 * refactureaza din sectiunea de facturare" — un sfat neexecutabil.
 *
 * Regula, scrisa o singura data pentru toate cele trei case: slotul e OCUPAT cat
 * timp exista o factura FARA storno. Cu storno, factura e desfiintata fiscal, deci
 * slotul e din nou liber.
 *
 * Ce se pierde la reemitere si de ce e acceptabil: se sterg si numerele de storno.
 * Altfel a doua stornare ar fi blocata de propria ei garda („deja stornata"), iar
 * ecranul ar arata factura NOUA drept stornata prin nota de credit a celei vechi —
 * adica o minciuna. Perechea desfiintata nu dispare fara urma: pleaca in mentiunile
 * facturii noi si in cheia ei de idempotenta (`cheieDocument`), se scrie in
 * `error_logs`, si ramane oricum in contul furnizorului, care e evidenta fiscala
 * reala. Randul comenzii tine documentul VIU, nu arhiva.
 *
 * Modul pur: cele trei case sunt `"use server"` si nu se pot incarca in teste.
 */

/** Numele casei, asa cum il vede comerciantul pe ecran. */
export type Casa = "SmartBill" | "Oblio" | "fGO";

/** Documentul desfiintat pe care il inlocuieste factura care urmeaza sa plece. */
export interface DocumentInlocuit {
  /** Numarul facturii stornate. Null doar la un storno ramas orfan (fara factura). */
  factura: string | null;
  /** Numarul notei de credit. E el insusi discriminantul reemiterii. */
  storno: string;
}

export type SlotFacturare =
  | { poateEmite: false; mesaj: string }
  | { poateEmite: true; inlocuieste?: DocumentInlocuit };

function text(v: string | null | undefined): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

/**
 * Se poate emite factura?
 *
 * Toate cele trei campuri sunt OBLIGATORII in semnatura, chiar daca valoarea lor
 * poate fi `undefined`: asa `tsc` enumera apelantii si nimeni nu poate uita sa
 * treaca stornul — adica exact omisiunea din care s-a nascut defectul.
 */
export function slotFacturare(d: {
  casa: Casa;
  factura: string | null | undefined;
  storno: string | null | undefined;
}): SlotFacturare {
  const factura = text(d.factura);
  const storno = text(d.storno);

  if (factura && !storno) {
    return {
      poateEmite: false,
      // Mesaj ACTIONABIL: spune ce document blocheaza si care e pasul urmator.
      // „A fost deja generata" lasa comerciantul fara nicio miscare de facut.
      mesaj: `Comanda are deja factura ${d.casa} ${factura}. Ca sa emiti alta, storneaz-o intai din sectiunea de facturare, apoi emite din nou.`,
    };
  }
  // Un storno fara factura nu apare azi in productie (0 randuri), dar apare daca
  // cineva anuleaza factura fara sa curete stornul. Se trateaza tot ca reemitere:
  // altfel documentul nou ar pleca la fGO cu acelasi `IdExtern` si ar lua 409.
  if (storno) return { poateEmite: true, inlocuieste: { factura, storno } };
  return { poateEmite: true };
}

/**
 * Cheia de idempotenta / id-ul extern al documentului.
 *
 * La PRIMA emitere ramane exact ce era, ca sa nu stricam dedublarea documentelor
 * deja emise. La reemitere primeste numarul notei de credit ca sufix: e stabil
 * (o reincercare dupa o cadere de retea da aceeasi cheie, deci nu se emit doua
 * facturi) si e unic pe reemitere (fiecare stornare produce alta nota de credit).
 *
 * Fara el, reemiterea era imposibila si acolo unde garda ar fi lasat-o sa treaca:
 * Oblio ar fi intors chiar factura stornata, iar fGO ar fi raspuns 409 pe acelasi
 * `IdExtern`.
 */
export function cheieDocument(baza: string, slot: SlotFacturare): string {
  if (!slot.poateEmite || !slot.inlocuieste) return baza;
  return `${baza}-R${slot.inlocuieste.storno}`;
}

/**
 * Mentiunea care leaga factura noua de cea desfiintata.
 *
 * E singura urma care ramane pe hartie dupa ce randul comenzii pastreaza doar
 * documentul viu, si e si practica normala de contabilitate: o factura care
 * inlocuieste una stornata o referentiaza.
 */
export function mentiuneRefacturare(baza: string, slot: SlotFacturare): string {
  if (!slot.poateEmite || !slot.inlocuieste) return baza;
  const { factura, storno } = slot.inlocuieste;
  return factura
    ? `${baza} (inlocuieste factura ${factura}, stornata prin ${storno})`
    : `${baza} (inlocuieste o factura stornata prin ${storno})`;
}
