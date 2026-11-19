/**
 * Loc de derulare deasupra unei bare lipite de josul ecranului, pe telefon (WCAG 2.4.11, „Focus Not Obscured”).
 *
 * Gasit la auditul temelor (19.11.2026), trecand cu Tab prin pagina de produs la 390 px: 7-12 din 39 de opriri pe fiecare
 * tema ajungeau CU TOTUL sub bara de cumparare („Creste cantitatea”, „Adauga in cos”, „Descriere”, legaturile din
 * subsol). Browserul aduce elementul cu focus exact la marginea de jos a ecranului, adica sub bara fixa, iar cine
 * navigheaza din tastatura (sau cu un cititor de ecran) nu mai vede unde se afla.
 *
 * `scroll-padding-bottom` ii spune browserului ca josul ecranului e ocupat: derularea adusa de focus, de
 * `scrollIntoView` si de o ancora se opreste deasupra barei. Nu muta nimic pe pagina si nu schimba derularea facuta de
 * om. Se pune INAUNTRUL barei, deci exista exact cat exista si ea; pe calculator bara e ascunsa, deci si regula tace.
 */
export function LocPesteBaraDeJos() {
  return <style>{"@media (max-width:1023.98px){html{scroll-padding-bottom:calc(5.5rem + env(safe-area-inset-bottom))}}"}</style>;
}
