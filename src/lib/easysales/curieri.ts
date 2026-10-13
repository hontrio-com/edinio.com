import { idText } from "./numere";

/**
 * Curierul unui AWB easySales, ca cheie Edinio (cea din `NUME_CURIER` si din `urmarire.ts`).
 *
 * ⚠ PE ID, NU PE NUME. `curierulReal` potriveste primul cuvant si nu recunoaste „UrgentCargus";
 * un nume nou ar da o potrivire ghicita. Id-urile vin din filtrul `courier_id` al listei de
 * comenzi [A]; ca `shipments[].courier.id` foloseste aceleasi id-uri e confirmat numai pentru
 * 4 FanCourier, in exemplul Get Order (IPOTEZA pentru rest, M-AWB-1).
 *
 * ⚠ 13 „Manual" (AWB urcat de mana la ei) si orice id necunoscut dau `null`: fara legatura de
 * urmarire, decat una catre alt curier.
 */
export type CurierEasySales = "dpd" | "cargus" | "fancourier" | "sameday" | "gls" | "dhl" | "packeta" | "ups";

const DUPA_ID: Readonly<Record<string, CurierEasySales>> = {
  "2": "dpd",
  "3": "cargus",
  "4": "fancourier",
  "5": "sameday",
  "6": "gls",
  "18": "dhl",
  "23": "packeta",
  "26": "ups",
};

export function curierulDupaId(id: unknown): CurierEasySales | null {
  const t = idText(id);
  return t !== null && Object.hasOwn(DUPA_ID, t) ? DUPA_ID[t] : null;
}

/** Cheile de mai sus, pentru probe si pentru ramura din `urmarire.ts`. */
export const CURIERI_EASYSALES: readonly CurierEasySales[] = Object.values(DUPA_ID);
