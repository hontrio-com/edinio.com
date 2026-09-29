/** Cookie-ul pus cand comerciantul inchide cardul de ajutor la configurare. */
export const COOKIE_AJUTOR_ASCUNS = "edinio_ajutor_configurare_ascuns";

/** Cat timp de la crearea contului se arata cardul. */
export const ZILE_AJUTOR_CONFIGURARE = 30;

/**
 * Contul e „nou" in primele `ZILE_AJUTOR_CONFIGURARE` zile. O data lipsa sau
 * stricata inseamna NU: mai bine lipseste cardul decat sa-l vada toti.
 */
export function esteContNou(creatLa: string | undefined | null, acum = Date.now()): boolean {
  if (!creatLa) return false;
  const t = Date.parse(creatLa);
  if (Number.isNaN(t)) return false;
  return acum - t < ZILE_AJUTOR_CONFIGURARE * 24 * 60 * 60 * 1000;
}
