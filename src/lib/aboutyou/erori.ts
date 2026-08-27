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
