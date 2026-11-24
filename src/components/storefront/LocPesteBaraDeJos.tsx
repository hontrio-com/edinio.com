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
 *
 * ⚠ A doua regula (22.11.2026): bara isi anunta si inaltimea, prin `--bara-de-jos`, pentru butonul de contact al
 * magazinului (`ButonContact`), care sta fix in coltul de jos si urca deasupra ei. 4,25rem = cat urca si stiva veche
 * „Contact rapid” (de la `bottom-5` la `bottom-[5.5rem]`). Fara bara, variabila lipseste si butonul sta jos.
 */
export function LocPesteBaraDeJos() {
  return <style>{"@media (max-width:1023.98px){html{scroll-padding-bottom:calc(5.5rem + env(safe-area-inset-bottom))}}" + LOC_BUTON_PE_TELEFON}</style>;
}

/*
 * ⚠ Regula e buna numai pentru o bara FIXA, care sta mereu in acelasi loc. O bara lipicioasa (`sticky`, ca a cosului
 * compact) se desprinde si urca odata cu pagina: locul ei se masoara, in `suport/LocPentruButonulDeContact.tsx`.
 */
const LOC_BUTON_PE_TELEFON = "@media (max-width:1023.98px){html{--bara-de-jos:calc(4.25rem + env(safe-area-inset-bottom))}}";
