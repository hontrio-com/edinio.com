/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHEIA CACHE-ULUI DE LOCKERE CUPRINDE CONTUL CU CARE A FOST ADUSA LISTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lista de lockere se tine zece minute in memoria instantei. Pana azi cheia era
 * `magazin:curier:ramburs` plus discriminantul de retea, si nimic din configul
 * curierului. Comerciantul care isi schimba contul (parola rotita, alt contract,
 * alta retea de dulapuri) primea zece minute lista veche, adusa cu creditele
 * contului vechi.
 *
 * ⚠ SI NU EXISTA STERGERE CARE SA-L AJUTE. `CacheScurt` e PER INSTANTA: o golire
 * la salvarea setarilor ar fi curatat o singura instanta din cate sunt calde, iar
 * celelalte ar fi servit mai departe lista veche. Corectitudinea unui cache per
 * instanta vine din CHEIE, nu din evacuare. Cu amprenta configului in cheie, contul
 * nou citeste de la alta cheie si intrarea veche se stinge singura.
 *
 * ═══ ⚠ DE CE E UN MODUL SEPARAT ═══
 *
 * `shipping.actions.ts` e `"use server"`, unde FIECARE export devine o usa
 * chemabila din browser si unde exporturile trebuie sa fie functii async. O regula
 * sincrona nu poate sta acolo nici exportata, nici probata. Acelasi zid si acelasi
 * leac ca la `recotarea.ts`.
 */

import { createHash } from "node:crypto";

/**
 * Amprenta configului de curier al magazinului.
 *
 * ═══ ⚠ SE IA AMPRENTA INTREGULUI RAND, NU A CAMPULUI CURIERULUI CERUT ═══
 *
 * O harta curier -> camp de config ar fi fost a doua sursa de adevar langa cele
 * unsprezece ramuri din cotare care isi citesc fiecare configul, si s-ar fi departat
 * de ele la prima schimbare. Mai rau: o potrivire gresita ar fi luat amprenta ALTUI
 * curier, deci rotatia contului n-ar mai fi schimbat cheia, si reparatia ar fi parut
 * pusa fara sa invalideze nimic.
 *
 * Pretul, pe fata: rotind parola Sameday se improspateaza si lista FAN. Zece minute
 * pe o lista care se schimba rar, in schimbul unei harti care nu poate arata tacut
 * spre campul gresit.
 *
 * ⚠ NICIODATA SECRETUL INSUSI IN CHEIE, ci sha256 taiat la 16 hex, ca la
 * `aboutyou/client.ts:113` si `taxonomy.ts:52`. Cheia ajunge in memoria instantei si
 * poate ajunge intr-un jurnal de diagnostic; o parola de curier nu are ce cauta acolo.
 *
 * ⚠ SI FARA LISTA DE CHEI LA `JSON.stringify`. Al doilea argument al lui filtreaza
 * si IN ADANCIME: dat o lista de campuri de nivel intai, ar fi taiat chiar `username`
 * si `password` dinauntrul configurilor, iar amprenta ar fi iesit oarba exact la
 * rotatia pe care trebuie s-o prinda. Ordinea campurilor nu e o grija: aceeasi cerere
 * scrie si citeste cheia, in acelasi proces, si nimic nu se compara intre procese.
 *
 * ⚠ Tipul e `object`, nu `string`: un secret dat din greseala ca sir ar fi fost
 * amprentat la fel de linistit, dar apelantul ar fi pierdut restul randului.
 */
export function amprentaConfigului(config: object): string {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16);
}

/**
 * Cheia sub care se tine lista de lockere a unui magazin.
 *
 * ⚠ DISCRIMINANTUL vine gata facut de la apelant fiindca fiecare curier are alta
 * gramatica: reteaua la SmartShip, tipul de punct la FAN, localitatea la Shipo si
 * UPS. Regula de aici nu-l interpreteaza, doar se ingrijeste sa intre in cheie.
 *
 * ⚠ RAMBURSUL e in cheie de dinainte: lista de dulapuri care accepta plata la
 * livrare nu e aceeasi cu lista intreaga.
 */
export function cheiaLockerelor(p: {
  businessId: string;
  curier: string;
  esteRamburs: boolean;
  discriminant: string;
  config: object;
}): string {
  return `${p.businessId}:${p.curier}:${p.esteRamburs ? "cod" : "-"}${p.discriminant}:${amprentaConfigului(p.config)}`;
}
