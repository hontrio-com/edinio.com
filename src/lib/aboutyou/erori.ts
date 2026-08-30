/**
 * Felurile de esec pe care le deosebim, ca TIPURI.
 *
 * ═══ ⚠ DE CE UN FISIER SEPARAT ═══
 *
 * `EroareTrecatoare` sta intre `orders.ts` (care o arunca) si `inbox.ts` (care o prinde). Pusa in
 * oricare din ele, cele doua se importa reciproc — un cerc care merge in ESM, dar care se rupe
 * urat la prima reordonare de importuri, si care face imposibil de spus care fisier se incarca
 * primul. Un fisier fara nicio dependinta il taie.
 */

/**
 * O cauza care nu spune NIMIC despre lucrul incercat: o pana la ei, o limita de rata atinsa, baza
 * cazuta, o comanda care inca nu s-a asezat la ei.
 *
 * ⚠ SE DEOSEBESTE PE TIP, NU PE TEXTUL EROARII. Regula casei e ca esecul se clasifica pe cod sau
 * pe tip, niciodata pe mesaj — un text se schimba la ei fara sa ne intrebe, iar o clasificare
 * sprijinita pe el se strica in tacere.
 *
 * ⚠ CINE O PRINDE nu numara incercarea: altfel o pana de-o zi ar trimite in scrisori moarte tocmai
 * evenimentele care n-au nicio vina.
 */
/**
 * Evenimentul e bun, dar inca n-are de ce sa se agate.
 *
 * ═══ ⚠ „NECORELAT ACUM" NU E ACELASI LUCRU CU „NECORELABIL" (27.08.2026, noaptea) ═══
 *
 * Doua situatii ardeau incercari desi n-aveau nicio vina, si amandoua se pot repara singure:
 *
 *   * un `order_items.*` sosit INAINTEA comenzii — evenimentele lor nu vin in ordine, iar
 *     sondarea aduce comanda in minutele urmatoare;
 *   * un magazin caruia i s-a invalidat cheia API — se repara cand omul o reconecteaza.
 *
 * Cu zece incercari si amanare crescatoare, asta insemna vreo sase ore de rabdare. About You
 * reincearca livrarea vreo DOUA ZILE: renuntam inaintea lor, la un eveniment care s-ar fi
 * rezolvat singur.
 *
 * ⚠ DAR NU E NICI TRECATOARE. O comanda care la ei nu mai exista n-o sa se coreleze niciodata, iar
 * o astfel de eroare tratata ca „nu numara" ar tine locul la nesfarsit celor care chiar se pot
 * rezolva. De-aia are TIP PROPRIU: cine o prinde se uita la VARSTA randului — sub `RABDARE_MS` nu
 * numara, peste, da. Rabdare marginita, nu rabdare fara capat.
 */
export class EroareNecorelata extends Error {
  readonly necorelata: true;

  constructor(mesaj: string) {
    super(mesaj);
    this.name = "EroareNecorelata";
    this.necorelata = true;
  }
}

/** Cat timp „inca nu se poate corela" nu numara o incercare. Ei reincearca doua zile. */
export const RABDARE_CORELARE_MS = 36 * 60 * 60 * 1000;

export class EroareTrecatoare extends Error {
  /**
   * ⚠ Campul se declara si se atribuie SEPARAT, nu ca `constructor(public …)`: probele ruleaza pe
   * dezbracarea de tipuri a lui Node, care doar STERGE adnotarile si nu poate genera codul pe care
   * il presupune un camp declarat in lista de argumente. Aceeasi capcana ca la `EroareCitireBaza`.
   */
  readonly trecatoare: true;

  constructor(mesaj: string) {
    super(mesaj);
    this.name = "EroareTrecatoare";
    this.trecatoare = true;
  }
}
