/**
 * Marcajul de impersonare: cine a imprumutat contul, si PANA CAND.
 *
 * ---------------------------------------------------------------------------
 * DE CE NU E DE AJUNS UN COOKIE CU maxAge (constatarea 22, a doua incercare)
 *
 * Prima reparatie a dat cookie-urilor de sesiune acelasi `maxAge` de o ora ca
 * marcajul. Nu e suficient: `updateSession` reimprospateaza tokenul cand expira
 * — adica exact pe la minutul 60 — si rescrie cookie-ul de sesiune cu durata
 * normala. Deci marcajul expira, bara galbena dispare, iar sesiunea imprumutata
 * pleaca mai departe. Aceeasi constatare, doar mutata cu o ora.
 *
 * Termenul limita sta acum IN VALOAREA marcajului, nu in viata cookie-ului, iar
 * `updateSession` il verifica la fiecare cerere: dupa el, sesiunea se inchide
 * fortat. Cookie-ul insusi traieste mai mult decat termenul TOCMAI ca sa mai
 * existe cine sa declanseze inchiderea.
 *
 * Ce NU incearca sa apere: un operator care isi sterge singur marcajul din
 * browser. E propriul lui browser si e un administrator de incredere — controlul
 * asta exista impotriva uitarii („am plecat de la birou cu sesiunea deschisa"),
 * nu impotriva lui. Ce apara e altceva: ca sesiunea imprumutata sa nu
 * supravietuiasca TACUT semnalului vizual care spune ca e imprumutata.
 */

export const COOKIE_IMPERSONARE = "impersonare";

/** Cat tine o preluare pentru suport. */
export const DURATA_IMPERSONARE_SEC = 60 * 60;

/**
 * Cookie-ul traieste mai mult decat termenul, ca `updateSession` sa mai gaseasca
 * ce sa verifice dupa ce termenul a trecut. Fara asta, marcajul ar disparea
 * inaintea sesiunii si nu ar mai avea cine sa o inchida.
 */
export const VIATA_COOKIE_IMPERSONARE_SEC = 60 * 60 * 24;

export function valoareMarcaj(adminId: string, acum = Date.now()): string {
  return `${adminId}.${acum + DURATA_IMPERSONARE_SEC * 1000}`;
}

export interface MarcajImpersonare {
  adminId: string;
  expiraLa: number;
}

/**
 * Citeste marcajul. `null` inseamna „nu e nicio impersonare in curs".
 *
 * Forma VECHE (doar id-ul de admin, fara termen) se trateaza ca EXPIRATA: la
 * desfasurare, sesiunile de impersonare deja deschise se inchid. E rar, e
 * vizibil, si e directia sigura — alternativa ar fi fost sa le lasam fara termen.
 */
export function citesteMarcaj(valoare: string | undefined | null): MarcajImpersonare | null {
  if (!valoare) return null;
  const punct = valoare.lastIndexOf(".");
  if (punct <= 0) return { adminId: valoare, expiraLa: 0 };
  const expiraLa = Number(valoare.slice(punct + 1));
  if (!Number.isFinite(expiraLa)) return { adminId: valoare.slice(0, punct), expiraLa: 0 };
  return { adminId: valoare.slice(0, punct), expiraLa };
}

/** Secundele ramase, pentru plafonarea cookie-ului de sesiune. Minim 1. */
export function secundeRamase(marcaj: MarcajImpersonare, acum = Date.now()): number {
  return Math.max(1, Math.ceil((marcaj.expiraLa - acum) / 1000));
}
