import crypto from "node:crypto";

/**
 * Semnatura linkului de dezabonare de la emailurile de recuperare a cosului.
 *
 * DE CE: linkul continea doar `?b=<businessId>&e=<email>`, in clar, fara nicio
 * semnatura. `businessId` NU e secret — e randat in HTML-ul public al fiecarui
 * magazin — iar adresele de email se ghicesc sau se cunosc. Deci oricine putea
 * dezabona pe oricine de la orice magazin, cu un simplu GET, si scrierea se
 * facea cu service role (ocolind RLS). Un concurent putea taia in tacere tot
 * canalul de recuperare al unui magazin.
 *
 * Cheia: `RECOVERY_UNSUBSCRIBE_SECRET` daca exista, altfel cheia de service role
 * (deja prezenta pe server si niciodata expusa clientului). ATENTIE: daca se
 * roteste cheia de service role, linkurile din emailurile deja trimise devin
 * invalide — de aceea variabila dedicata e de preferat.
 */
function cheie(): string {
  return process.env.RECOVERY_UNSUBSCRIBE_SECRET
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? "";
}

/** Semnatura pentru perechea (magazin, adresa). Adresa se normalizeaza, ca
 *  linkul sa nu depinda de majuscule sau spatii. */
export function semneazaDezabonare(businessId: string, email: string): string {
  return crypto
    .createHmac("sha256", cheie())
    .update(`${businessId}:${email.trim().toLowerCase()}`)
    .digest("hex");
}

/** Verificare in timp constant. Refuza si cand semnatura lipseste. */
export function verificaDezabonare(businessId: string, email: string, semnatura: string | null): boolean {
  if (!semnatura) return false;
  const asteptat = Buffer.from(semneazaDezabonare(businessId, email));
  const primit = Buffer.from(semnatura);
  if (asteptat.length !== primit.length) return false;
  return crypto.timingSafeEqual(asteptat, primit);
}

/** URL-ul complet, folosit la compunerea emailurilor de recuperare. */
export function urlDezabonare(origine: string, businessId: string, email: string): string {
  const s = semneazaDezabonare(businessId, email);
  return `${origine}/api/recovery/unsubscribe?b=${encodeURIComponent(businessId)}&e=${encodeURIComponent(email)}&s=${s}`;
}
