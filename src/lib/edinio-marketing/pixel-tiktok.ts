/*
  ═══════════════════════════════════════════════════════════════════════════════
  ID-UL PIXELULUI TIKTOK — UN SINGUR LOC, PENTRU BROWSER SI PENTRU SERVER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E UN MODUL SI NU DOUA CITIRI DIN `process.env`.

  Pana pe 02.09.2026 erau doua. Browserul citea variabila SI avea o rezerva scrisa
  in cod; serverul o citea fara rezerva. Cele doua nu se potriveau:

    browser -> process.env... ?? "D8N5ATBC77UA0GPRAUBG"
    server  -> process.env..., iar fara ea REFUZA tot

  Masurat in pachetul viu de pe www.edinio.com: pagina foloseste
  `DAC0RFJC77UC8FLJHJC0`. Deci rezerva din cod nu era o plasa, ci o capcana: la
  prima variabila uitata, browserul ar fi inceput sa trimita tacut catre ALT
  pixel, iar serverul catre niciunul. Aceeasi conversie sub doua adrese nu se mai
  poate deduplica, si niciun raport n-ar fi aratat de ce.

  ⚠ SI DE CE RAMANE SCRIS IN COD. Nu e un secret — orice vizitator il vede in
  pagina — iar scos de tot, o variabila uitata ar stinge masuratoarea in productie
  fara ca nimic sa strige. Poarta care conteaza e gazda, nu ascunderea id-ului.
*/

/** Pixelul Edinio. Cel din pachetul viu pe 02.09.2026. */
const IMPLICIT = "DAC0RFJC77UC8FLJHJC0";

export const ID_PIXEL_TIKTOK: string =
  process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim() || IMPLICIT;

/*
  ⚠ SCHIMBAREA VARIABILEI CERE O DESFASURARE. `NEXT_PUBLIC_*` se coace in pachetul
  browserului la build. Deci pixelul schimbat in Vercel nu se muta pana la
  urmatorul deploy — pentru pagina, sigur; iar de cand serverul citeste de aici,
  cele doua se misca impreuna in loc sa se desparta pentru cateva ore.
*/
