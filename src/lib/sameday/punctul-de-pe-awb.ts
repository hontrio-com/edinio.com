/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CE PUNCT POARTA COMANDA DUPA EMITERE                          (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ STA AICI, NU IN `sameday.actions.ts`, si nu din gust. Acolo fisierul e `"use server"`, unde
 * Next cere ca FIECARE export sa fie o functie `async`, iar fiecare export devine o usa chemabila
 * din browser. O functie pura exportata de acolo ar fi rupt buildul si ar fi deschis o usa degeaba.
 * Aceeasi hotarare ca la `shipping/reteaua-punctului.ts`.
 */

/** Ce alege comerciantul in fereastra de AWB, peste ce a ales cumparatorul la checkout. */
export type LockerAles = {
  id: number;
  name?: string;
  address?: string;
  city?: string;
  county?: string;
  /** ⚠ Dus pana la capat desi Sameday nu-l da: `getLockers` il are la alti curieri, iar GLS il CERE. */
  postCode?: string;
};

/** Cheile punctului din `shipping_address`. Intr-un singur loc, ca sa nu se uite una la curatare. */
const CHEI_PUNCT = [
  "locker_id", "locker_name", "locker_address", "locker_city", "locker_county", "locker_post_code",
] as const;

/**
 * Ce a facut CU ADEVARAT AWB-ul, asezat inapoi peste adresa comenzii.
 *
 * ═══ ⚠ DE CE EXISTA (15.09.2026) ═══
 *
 * Comerciantul poate MUTA coletul: o comanda la adresa poate pleca intr-un easybox, iar una la
 * easybox poate pleca acasa. Comutatorul din fereastra face exact asta, si a fost cerut anume.
 * Pana azi alegerea lui nu se scria NICAIERI inapoi: AWB-ul pleca unde a zis el, iar comanda
 * ramanea cu ce alesese cumparatorul.
 *
 * ⚠ Si a doua directie e cea mai rea dintre cele doua: cu easybox-ul STINS pe o comanda la punct,
 * coletul pleaca acasa, iar comanda spune in continuare „easybox X". Cumparatorul primeste de la
 * noi un email care il trimite la un dulap in care nu e nimic.
 *
 * ⚠ CE SE SCRIE SI CE NU. Pe ramura cu punct se scrie si `courier`, fiindca altfel as CREA eu o
 * nepotrivire noua: o comanda cotata la alt curier, mutata intr-un easybox Sameday, ar fi aratat
 * „celalalt curier, punctul X". Pe ramura fara punct nu se atinge `courier`: acolo doar curat date
 * ramase, iar cine a expediat se stie oricum din `sameday_awb_number`.
 */
export function adresaDupaEmitereSameday(
  veche: Record<string, unknown>,
  punct: LockerAles | null,
): Record<string, unknown> {
  const fara: Record<string, unknown> = { ...veche };
  /* ⚠ Se STERG, nu se pun pe `undefined`: cheia ramasa goala se citeste altfel decat cheia lipsa. */
  for (const k of CHEI_PUNCT) delete fara[k];

  if (!punct) return { ...fara, delivery_type: "address" };

  return {
    ...fara,
    courier: "sameday",
    delivery_type: "locker",
    /* ⚠ SIR, nu numar: asa il scrie checkoutul si asa il citeste emiterea (`Number(locker_id)`). */
    locker_id: String(punct.id),
    locker_name: punct.name ?? "",
    locker_address: punct.address ?? "",
    locker_city: punct.city ?? "",
    locker_county: punct.county ?? "",
    ...(punct.postCode ? { locker_post_code: punct.postCode } : {}),
  };
}
