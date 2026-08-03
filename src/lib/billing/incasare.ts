/**
 * O factura pleaca marcata INCASATA doar daca banii au intrat deja.
 *
 * Aceeasi intrebare primea doua raspunsuri diferite, de la doua case:
 *
 *  - SmartBill (`paymentAtIssue`) cerea `payment_status === "paid"`.
 *  - Oblio (`buildCollect`) lasa sa treaca si rambursul NEPLATIT:
 *    `if (paymentStatus !== "paid" && paymentMethod !== "cash_on_delivery") return`.
 *    Documentul pleca fara camp `value`, iar fara `value` Oblio incaseaza automat
 *    TOTALUL facturii. O comanda refuzata la livrare ramanea deci cu factura
 *    incasata integral.
 *
 * Cat de aproape e capcana, masurat in productie pe 2026-08-04: zero facturi Oblio
 * emise vreodata, dar 80 din cele 96 de comenzi sunt ramburs (72 neplatite, 5
 * platite, 3 restituite). Cele doua magazine cu Oblio pornit — teoshop si
 * ciprian-piese-auto-brasov — n-au inca nicio comanda. Prima lor vanzare intra
 * direct in tipar.
 *
 * De ce nu se cheama aici `rambursDeIncasat` din `lib/orders/ramburs.ts`: acolo
 * intrebarea e „cat are curierul de incasat la livrare", si ea raspunde 0 si
 * pentru `refunded` — la o comanda restituita nu mai e nimic de luat de la client.
 * Aici intrebarea e „sunt banii la comerciant ACUM, cand pleaca documentul", iar la
 * o comanda restituita raspunsul e nu: au intrat si au iesit la loc. Doua intrebari
 * vecine, nu aceeasi. Ce ramane comun e adevarat intr-o singura directie si e
 * verificat ca atare in test: daca factura iese incasata, curierul n-are ce colecta.
 *
 * Modul pur: cele trei case sunt `"use server"` si nu se pot incarca in teste.
 */

/**
 * Au intrat banii? Singurul raspuns, pentru toate casele de facturare.
 *
 * `payment_status` e OBLIGATORIU in semnatura (chiar daca valoarea poate fi
 * `undefined`), ca `tsc` sa enumere apelantii: intrebarea e despre incasare, si
 * n-are voie sa fie raspunsa din metoda de plata, cum se intampla la Oblio.
 */
export function baniiAuIntrat(o: { payment_status: string | null | undefined }): boolean {
  return o.payment_status === "paid";
}

/**
 * Tipul incasarii in vocabularul Oblio.
 *
 * „Ramburs" nu dispare din harta: cele 5 comenzi cu ramburs deja incasat din
 * productie chiar asa trebuie sa iasa. Se schimba doar CAND se ajunge aici —
 * numai dupa ce `baniiAuIntrat` a spus da.
 */
export function tipIncasareOblio(paymentMethod: string | null | undefined): string {
  const map: Record<string, string> = {
    cash_on_delivery: "Ramburs",
    stripe: "Card",
    ipay: "Card",
    netopia: "Card",
    klarna: "Alta incasare banca",
    revolut: "Card",
  };
  return map[paymentMethod ?? ""] ?? "Alta incasare banca";
}
