/**
 * Pe ce camp pleaca punctul ales la Sameday: `lockerLastMile` sau `oohLastMile`.
 *
 * ═══ ⚠ SAMEDAY ARE DOUA RETELE DE RIDICARE, NU UNA ═══
 *
 * `api/client/lockers` sunt DULAPURILE lor (easybox). `api/client/ooh-locations` sunt
 * punctele PUDO, adica tejghele in magazine partenere. Se suprapun, dar nu sunt aceeasi lista:
 * masurat pe contul de productie, 7.021 lockere fata de 6.706 puncte ooh.
 *
 * Iar AWB-ul le cere pe CAMPURI DIFERITE. Modulul lor oficial de WooCommerce (1.11.1,
 * `classes/samedaycourier-sameday-class.php`, randurile 534-552) alege dupa CODUL
 * SERVICIULUI, nu dupa lista din care a venit punctul:
 *
 *     LN (Locker Next Day)  → lockerLastMile
 *     PP (PUDO)             → oohLastMile
 *
 * Noi trimiteam mereu `lockerLastMile`. Pe drumul de azi iese acelasi lucru, fiindca fereastra
 * noastra ofera numai dulapuri, si numai serviciul `LN` e cautat pentru ele, dar legatura
 * era o coincidenta, nu o regula: un cont al carui serviciu implicit e `PP` ar fi primit
 * id-ul unui punct PUDO scris pe campul dulapurilor, adica un colet trimis unde nu trebuie.
 *
 * ⚠ NECUNOSCUTUL CADE PE `lockerLastMile`, si nu la intamplare: aia e purtarea de pana
 * acum, iar toate cele cinci comenzi la punct masurate in productie sunt easybox. Un cod
 * nou al lor nu are voie sa schimbe tacit drumul coletelor care merg azi.
 */

export type CampUltimaMila = "lockerLastMile" | "oohLastMile";

/** Codurile PUDO. Singurele care cer `oohLastMile`. */
export const CODURI_PUDO: readonly string[] = ["PP"];
const PUDO = new Set(CODURI_PUDO);

/**
 * Codurile de dulap, scrise doar ca sa se vada ca sunt CUNOSCUTE, nu doar nimerite pe
 * ramura implicita: `LN` = Locker Next Day, `XL` = Locker Crossborder.
 */
export const CODURI_EASYBOX: readonly string[] = ["LN", "XL"];

export function campulUltimeiMile(codServiciu: string | null | undefined): CampUltimaMila {
  const cod = String(codServiciu ?? "").trim().toUpperCase();
  return PUDO.has(cod) ? "oohLastMile" : "lockerLastMile";
}
