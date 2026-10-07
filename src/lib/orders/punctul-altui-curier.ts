/**
 * Comanda facuta pentru punctul de ridicare al ALTUI curier decat cel din fereastra de AWB.
 *
 * ═══ DE CE (masurat, 07.10.2026) ═══
 *
 * La livrarea in punct, adresa de pe comanda e a PUNCTULUI, nu a clientului:
 *   - checkoutul nostru scrie in `address` adresa punctului (`delivery_type: "locker"`), iar strada
 *     clientului, cand a scris-o, in `home_address`. Productie: 6 din 6 comenzi cu punct aveau
 *     `address` identic cu `locker_address`, niciuna `home_address`;
 *   - eMAG trimite easybox-ul fara `delivery_type` si fara curier, cu adresa punctului in `street`
 *     si FARA adresa de acasa. Productie: 157 de comenzi; la 15 din 16 puncte repetate, strada e
 *     aceeasi la fiecare comanda, deci e a punctului.
 *
 * Toate cele 19 ferestre de AWB completau strada din `address` (sau `street`). Deschisa pe o
 * comanda de punct al altui curier, o fereastra emitea „la adresa", adica la supermarketul cu
 * dulapul, pe numele clientului. Gasit in fereastra e-packet, pe un FANbox comandat prin Curiera.
 *
 * Regula: punctul altui curier nu se poate folosi, deci coletul merge ACASA, iar strada vine numai
 * din `home_address`. Fara ea campul ramane GOL: omul afla adresa de la client, nu o ghicim.
 * `city`, `county` si `postal_code` sunt ale formularului, deci ale clientului, si raman.
 */

export type AdresaCuPunctStrain = {
  courier?: string | null;
  courier_label?: string | null;
  delivery_type?: string | null;
  locker_id?: string | number | null;
  locker_name?: string | null;
  home_address?: string | null;
  source?: string | null;
};

export type PunctStrain = {
  /** Numele punctului, cum l-a vazut clientul. */
  numePunct: string;
  /** Curierul sau canalul punctului („Curiera: locker sau punct", „eMAG"). */
  dePe: string;
  /** Strada clientului, scrisa de el in checkout, sau sir gol. */
  linieAcasa: string;
};

/** E o comanda de punct? Checkoutul nostru o marcheaza; eMAG lasa doar `locker_id`. */
export function eComandaDePunct(adresa: object | null | undefined): boolean {
  const a = adresa as AdresaCuPunctStrain | null | undefined;
  if (!a) return false;
  return a.delivery_type === "locker" || String(a.locker_id ?? "").trim() !== "";
}

/**
 * Punctul ALTUI curier, sau `null` (livrare la adresa, ori punctul chiar al ferestrei).
 *
 * `alFerestrei` primeste `courier` de pe comanda, deja mic si fara spatii. ⚠ Comanda de punct FARA
 * curier (eMAG) e mereu straina: eMAG o emite prin AWB-ul lui, nu prin contul curierului.
 */
export function punctulAltuiCurier(
  /* ⚠ `object`, nu tipul de mai sus: tipurile de adresa ale ferestrelor nu declarau campurile de
     punct deloc, si tocmai de aceea nu le vedeau. */
  adresa: object | null | undefined,
  alFerestrei: (curier: string) => boolean,
): PunctStrain | null {
  const a = adresa as AdresaCuPunctStrain | null | undefined;
  if (!a || !eComandaDePunct(a)) return null;
  const curier = (a.courier ?? "").toLowerCase().trim();
  if (curier && alFerestrei(curier)) return null;
  const sursa = (a.source ?? "").trim();
  return {
    numePunct: (a.locker_name ?? "").toString().trim() || "un punct de ridicare",
    dePe: (a.courier_label ?? "").trim() || curier || (sursa.toLowerCase() === "emag" ? "eMAG" : sursa) || "alt curier",
    linieAcasa: (a.home_address ?? "").trim(),
  };
}
