import type { CurierCuPuncte, PunctEpacket } from "./client";
import { KG_MAXIM_PUNCT, punctOferit } from "./expediere";

/**
 * Punctele e-packet: codul postal al unei localitati si lista din checkout.
 *
 * ═══ ⚠ CODUL POSTAL, si de ce vine din puncte ═══
 *
 * E-packet il cere OBLIGATORIU la adresa (422 fara el), iar checkoutul nostru NU il cere la
 * comenzile din tara (vezi memoria „cod postal lipsa in checkout"). Masurat pe 600 de comenzi
 * reale: doar 73 au un cod de 6 cifre. Si nu orice cod merge: DPD REFUZA un cod care nu e al
 * localitatii (502 `courier_refused`, masurat cu un cod de Bucuresti pe o adresa din Cluj), iar
 * Sameday primeste orice, chiar `000000`.
 *
 * Punctele lor au TOATE cod postal si localitate (16.128, masurat). Un cod al unui punct din
 * aceeasi localitate e un cod al localitatii: DPD a primit si codul oficiului (`400001`), si al
 * unui locker de cartier (`400663`) pe aceeasi adresa din Cluj. Pe comenzile reale, 364 din 447
 * de localitati au macar un punct.
 *
 * Ordinea: codul scris de om in comanda, apoi al OFICIILOR DPD (e codul „de sediu" al localitatii
 * la DPD, `400001` la Cluj), apoi cel mai des intalnit printre celelalte puncte. Fara puncte,
 * omul il scrie in fereastra. ⚠ Pentru orasele mari codul e al localitatii, nu al strazii.
 */

export type SursaCodPostal = "comanda" | "localitate";

export function codulCelMaiDes(puncte: PunctEpacket[]): string | null {
  const numar = new Map<string, number>();
  for (const p of puncte) {
    const c = (p.codPostal ?? "").trim();
    if (/^\d{6}$/.test(c)) numar.set(c, (numar.get(c) ?? 0) + 1);
  }
  let cel: string | null = null;
  let max = 0;
  for (const [c, n] of numar) if (n > max || (n === max && cel !== null && c < cel)) { cel = c; max = n; }
  return cel;
}

/**
 * Codul postal de trimis, cu sursa lui (fereastra o arata). `puncteDpd` si `alte` sunt punctele
 * din localitatea ALEASA; `null` = nu s-au putut citi (si atunci omul scrie codul).
 */
export function codPostalPentru(p: {
  dinComanda?: string | null;
  puncteDpd?: PunctEpacket[] | null;
  alte?: PunctEpacket[] | null;
}): { cod: string; sursa: SursaCodPostal } | null {
  const scris = (p.dinComanda ?? "").replace(/\s+/g, "");
  if (/^\d{6}$/.test(scris)) return { cod: scris, sursa: "comanda" };
  const oficii = (p.puncteDpd ?? []).filter((x) => x.tip === "office");
  const cod = codulCelMaiDes(oficii) ?? codulCelMaiDes(p.puncteDpd ?? []) ?? codulCelMaiDes(p.alte ?? []);
  return cod ? { cod, sursa: "localitate" } : null;
}

// ─── Lista din checkout ───────────────────────────────────────────────────────

/** Forma `LockerItem` din `shipping.actions.ts` (aceleasi chei, fara sa-l importe aici). */
export type PunctCheckout = {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  postCode?: string;
  lat: number;
  lng: number;
};

/**
 * Punctele oferite in checkout, din punctele unei localitati.
 *
 * ⚠ Doar tipurile care primesc greutatea pragului retelei (`KG_MAXIM_PUNCT`): la FAN numai
 * FANbox (PayPoint-urile, 10 kg, ar fi coborat tot FAN-ul la 10). Fara coordonate, punctul nu se
 * poate arata pe harta, deci nu se ofera (masurat: toate au, deci nu se pierde nimic azi).
 * ⚠ `id` ramane SIR NEATINS (`F1000142` la FAN): e chiar `locker_id` la emitere.
 */
export function puncteDeCheckout(
  curier: CurierCuPuncte,
  puncte: PunctEpacket[],
  localitate: { nume: string; judet: string },
): PunctCheckout[] {
  const iesire: PunctCheckout[] = [];
  for (const p of puncte) {
    if (!punctOferit(curier, p.tip)) continue;
    if (p.lat === null || p.lng === null) continue;
    iesire.push({
      id: p.id,
      name: p.nume || p.id,
      address: p.adresa,
      city: localitate.nume,
      county: localitate.judet,
      ...(p.codPostal ? { postCode: p.codPostal } : {}),
      lat: p.lat,
      lng: p.lng,
    });
  }
  return iesire;
}

/** Pragul de greutate al retelei de puncte, pentru checkout. */
export function kgMaximPunct(curier: CurierCuPuncte): number {
  return KG_MAXIM_PUNCT[curier];
}
