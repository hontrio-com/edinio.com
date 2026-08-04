/**
 * Starea provocarii MFA, citita de pe SERVER.
 *
 * DE CE STA AICI, si nu in auth.actions.ts: acel fisier are `"use server"`, iar
 * de acolo Next.js accepta DOAR exporturi de functii asincrone — o functie pura
 * ca asta rupe build-ul ("Ecmascript file had an error"). Modulul de fata e unul
 * obisnuit, deci poate fi importat si de Server Components, si de actiuni.
 *
 * DE CE EXISTA: starea „al doilea factor neterminat" statea doar in cookie-ul
 * `mfa_pending`. Cookie-ul e trimis de client, iar dupa `signInWithPassword`
 * sesiunea E DEJA valida — al doilea factor doar intarzie redirectarea. Deci un
 * atacator care avea numai parola nu trebuia decat sa NU trimita cookie-ul.
 *
 * Sursa de adevar e provocarea din baza: la login cu MFA pornit se scrie
 * `mfa_otp`, iar verificarea reusita il sterge. „Provocare deschisa" inseamna
 * cod nefolosit si neexpirat.
 */
export interface ProfilMfa {
  mfa_email_enabled?: boolean | null;
  mfa_otp?: string | null;
  mfa_otp_expires_at?: string | null;
}

export function mfaInAsteptare(profil: ProfilMfa | null | undefined): boolean {
  if (!profil?.mfa_email_enabled) return false;
  if (!profil.mfa_otp || !profil.mfa_otp_expires_at) return false;
  return new Date(profil.mfa_otp_expires_at) > new Date();
}
