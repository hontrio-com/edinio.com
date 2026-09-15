import { tipPunctFan, type TipPunctFan } from "@/lib/fancourier";
import type { PlanExpedierii } from "./quote-token";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RETEAUA SUB CARE A FOST SERVIT PUNCTUL                        (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `punctul-ales-e-semnat.ts` cere `retea` in identitatea sub care semneaza, si o cere OBLIGATORIU:
 * la FAN acelasi `locker_id` poate fi un FANbox, un PayPoint sau un oficiu, iar la SmartShip un
 * easybox sau un FANbox. Sunt nomenclatoare diferite, cu id-uri din spatii diferite.
 *
 * ⚠ DAR RETEAUA NU SE POATE LUA DE UNDE PARE. Al cincilea argument al lui `getLockers` poarta
 * PATRU lucruri diferite, dupa curier, si asta e masurat in cod, nu banuit:
 *
 *   * la SmartShip, chiar reteaua (`easybox` / `fanbox`);
 *   * la FAN, tipul punctului (`fanbox` / `paypoint` / `office`);
 *   * la Shipo, `rate_id`-ul SERVICIULUI, fiindca punctele lor nu se cer pe curier;
 *   * ⚠ la UPS, JUDETUL CUMPARATORULUI, fiindca `Locator` cauta punctele pe oras plus judet.
 *
 * ⚠ SI DE AICI VINE DEFECTUL PE CARE MODULUL ASTA IL OPRESTE. Semnat asa cum vine, la UPS punctul
 * ar purta in semnatura judetul cumparatorului. Iar cheia de cache a punctelor UPS foloseste doar
 * `orasUps(city, retea)`, care plieaza sectoarele si NU cuprinde judetul: doi cumparatori din
 * acelasi oras cu judete scrise diferit impart aceeasi lista din cache, deci al doilea ar primi
 * puncte semnate cu judetul PRIMULUI, si fiecare comanda UPS la punct ar cadea la verificare.
 * De aceea reteaua semnata e hotarata de SERVER, si la UPS e o constanta.
 *
 * ═══ ⚠ SI DE CE STA AICI, NU IN `shipping.actions.ts` ═══
 *
 * Fiindca acolo fisierul e `"use server"`, unde FIECARE export devine o usa chemabila din browser.
 * Regula asta e pura si o cer amandoua capetele: `getLockers` cand semneaza, si plasarea comenzii
 * cand verifica. Scrisa a doua oara de mana la celalalt capat, cele doua copii s-ar fi despartit la
 * prima corectura, iar despartirea lor nu arata ca o eroare: arata ca fiecare comanda cinstita la
 * punct cade cu motivul „semnatura".
 */

/** Curierul are o singura retea de puncte, deci nu e nimic de deosebit. */
export const RETEA_UNICA = "unica";

/**
 * Reteaua de lockere SmartShip.
 *
 * ⚠ Ingustata la cele doua valori cunoscute fiindca valoarea vine de la client si intra si in cheia
 * de cache: nefiltrata, cineva ar putea umple cache-ul cu chei inventate.
 */
export function reteaSmartship(semnal: string | null | undefined): "easybox" | "fanbox" {
  return semnal === "fanbox" ? "fanbox" : "easybox";
}

/**
 * `rate_id`-ul serviciului Shipo, ingustat la cifre.
 *
 * ⚠ Zero inseamna „niciun serviciu", si e chiar valoarea pe care `getLockers` o refuza mai departe.
 */
export function serviciulShipo(semnal: string | null | undefined): number {
  return /^\d{1,9}$/.test(semnal ?? "") ? Number(semnal) : 0;
}

/**
 * Reteaua de puncte Sameday: dulapurile lor, sau punctele PUDO.
 *
 * Sameday are DOUA nomenclatoare, si nu se suprapun: `api/client/lockers` da 7.021 de dulapuri,
 * `api/client/ooh-locations` da 6.706 puncte PUDO (tejghele in magazine partenere). Id-urile vin
 * din spatii diferite, iar AWB-ul le cere pe campuri diferite (`lockerLastMile` fata de
 * `oohLastMile`) si pe servicii diferite (`LN` fata de `PP`). Vezi `sameday/ultima-mila.ts`.
 *
 * Lipsa inseamna `easybox`, exact ca la FAN si din acelasi motiv: pana azi aia era singura retea
 * oferita, iar optiunile ramase deschise in browserul unui cumparator nu poarta inca semnalul.
 * Tratata ca lipsa, fiecare comanda pornita inainte de schimbare ar fi cazut.
 *
 * ⚠ FEREASTRA DE DOUA ORE DE LA DESFASURARE, spusa pe fata. Pana azi Sameday cadea pe ramura
 * implicita a lui `reteauaPunctului`, deci punctele lui erau semnate sub `unica`. De acum sunt
 * semnate sub `easybox`, iar un token emis INAINTE de desfasurare nu mai verifica. Fisa punctului
 * traieste doua ore, deci fereastra se inchide singura; iar ce se intampla in ea e o comanda
 * REFUZATA cu motiv clar, nu un colet trimis aiurea. Masurat: cinci comenzi la easybox Sameday in
 * toata viata platformei. Aceeasi cumpana s-a luat la FAN pe 13.09.2026.
 */
export function reteaSameday(semnal: string | null | undefined): "easybox" | "pudo" {
  return semnal === "pudo" ? "pudo" : "easybox";
}

/**
 * Tipul punctului FAN, cu lipsa insemnand `fanbox`.
 *
 * ⚠ Lipsa NU inseamna „nicio retea": pana pe 13.09.2026 FANbox era singura oferita, iar optiunile
 * vechi ramase deschise in browserul unui cumparator nu poarta inca tipul. Tratata ca lipsa, fiecare
 * comanda pornita inainte de schimbare ar fi cazut.
 */
export function tipPunctFanCuImplicit(semnal: string | null | undefined): TipPunctFan {
  return tipPunctFan(semnal) ?? "fanbox";
}

/**
 * Reteaua sub care se SEMNEAZA si se VERIFICA punctul.
 *
 * `semnal` e al cincilea argument al lui `getLockers`, asa cum vine. Ce inseamna el depinde de
 * curier, si tocmai asta rezolva functia: la curierii cu o singura retea valoarea se ARUNCA, oricat
 * ar parea de utila.
 */
export function reteauaPunctului(curier: string, semnal: string | null | undefined): string {
  switch (curier) {
    case "smartship":
      return reteaSmartship(semnal);
    case "fan-courier":
      return tipPunctFanCuImplicit(semnal);
    case "shipo":
      return String(serviciulShipo(semnal));
    case "sameday":
      return reteaSameday(semnal);
    /*
     * ⚠ UPS INTRA AICI DINADINS, si e singurul caz in care aruncarea semnalului chiar apara ceva:
     * acolo semnalul e judetul cumparatorului. Vezi capul fisierului.
     */
    default:
      return RETEA_UNICA;
  }
}

/**
 * Semnalul de retea, scos dintr-un plan de expediere DEJA VERIFICAT.
 *
 * ⚠ ASTA E JUMATATEA CARE INCHIDE BUCLA. La plasarea comenzii, `verificaCotatia` a confruntat deja
 * `fanPointType`, `smartshipLockerNet` si `shipoRateId` cu ce am semnat noi la cotare: toate trei
 * intra in `amprentaPlanului`. Deci reteaua nu se mai ia din cererea browserului, ci din singura
 * forma pe care serverul a apucat s-o semneze el insusi.
 *
 * ⚠ Formele difera de cele din browser si asta conteaza: `shipoRateId` e NUMAR in plan si SIR in
 * argumentul lui `getLockers`, iar un `fanPointType` absent trebuie sa dea tot `fanbox`. Trecute
 * prin `reteauaPunctului`, amandoua capetele ajung la acelasi sir.
 */
export function semnalulRetelei(curier: string, plan: PlanExpedierii | null | undefined): string | null {
  if (!plan) return null;
  switch (curier) {
    case "smartship":
      return plan.smartshipLockerNet ?? null;
    case "fan-courier":
      return plan.fanPointType ?? null;
    case "shipo":
      return plan.shipoRateId == null ? null : String(plan.shipoRateId);
    case "sameday":
      return plan.samedayPointNet ?? null;
    default:
      return null;
  }
}

/** Reteaua semnata, pornind de la un plan verificat. Scurtatura peste cele doua de mai sus. */
export function reteauaDinPlan(curier: string, plan: PlanExpedierii | null | undefined): string {
  return reteauaPunctului(curier, semnalulRetelei(curier, plan));
}
