import { cheieUrmarireValida, MODULE_IMPLICITE } from "./config";

/**
 * Ce stie vitrina despre theMarketer: NUMAI campuri publice, citite prin cale JSON in antetul magazinului
 * (`tm_*` in `incarcaAntetMagazin`). Cheia REST si cheia adreselor nu ajung niciodata aici.
 *
 * ⚠ Fara `server-only`: o citeste si layoutul, si componentele din vitrina.
 */
export type VitrinaTM = {
  /** Tracking Key-ul, verificat ca poate intra intr-o adresa de script. */
  cheie: string;
  /** Emailul din checkout pleaca la iesirea din camp. */
  captura: boolean;
  /** Fisierele notificarilor push, pe domeniul propriu. */
  push: boolean;
  fidelitate: boolean;
  recenzii: boolean;
};

export type SetariTMBrute = {
  tm_activ?: unknown;
  tm_cheie?: unknown;
  tm_urmarire?: unknown;
  tm_captura?: unknown;
  tm_push?: unknown;
  tm_fidelitate?: unknown;
  tm_recenzii?: unknown;
};

function bool(v: unknown, implicit: boolean): boolean {
  return typeof v === "boolean" ? v : implicit;
}

/**
 * Starea theMarketer a vitrinei, sau `null` cand scriptul nu are ce cauta in pagina (integrarea oprita,
 * urmarirea oprita sau o cheie care n-ar putea intra intr-o adresa). Pura.
 */
export function vitrinaTheMarketer(s: SetariTMBrute | null | undefined): VitrinaTM | null {
  if (!s || s.tm_activ !== true) return null;
  if (!bool(s.tm_urmarire, MODULE_IMPLICITE.urmarire)) return null;
  const cheie = typeof s.tm_cheie === "string" ? s.tm_cheie.trim() : "";
  if (!cheieUrmarireValida(cheie)) return null;
  return {
    cheie,
    captura: bool(s.tm_captura, MODULE_IMPLICITE.captura_email),
    push: bool(s.tm_push, MODULE_IMPLICITE.push),
    fidelitate: bool(s.tm_fidelitate, MODULE_IMPLICITE.fidelitate),
    recenzii: bool(s.tm_recenzii, MODULE_IMPLICITE.recenzii),
  };
}

/**
 * Recenziile si fidelitatea NU depind de script (vin de pe server), deci au poarta lor: integrarea pornita
 * si modulul pornit, oricum ar fi urmarirea.
 */
export function moduleServerVitrina(s: SetariTMBrute | null | undefined): { fidelitate: boolean; recenzii: boolean } {
  if (!s || s.tm_activ !== true) return { fidelitate: false, recenzii: false };
  return {
    fidelitate: bool(s.tm_fidelitate, MODULE_IMPLICITE.fidelitate),
    recenzii: bool(s.tm_recenzii, MODULE_IMPLICITE.recenzii),
  };
}

/**
 * Randul de setari fara campurile `tm_*`, inainte sa plece spre o componenta de client: acolo nu au ce
 * cauta (sunt citite doar ca sa hotarasca serverul ce randeaza).
 */
export function faraCampuriTM<T extends object>(o: T | null | undefined): T | null {
  if (!o) return null;
  const copie: Record<string, unknown> = { ...(o as Record<string, unknown>) };
  for (const k of Object.keys(copie)) if (k.startsWith("tm_")) delete copie[k];
  return copie as T;
}
