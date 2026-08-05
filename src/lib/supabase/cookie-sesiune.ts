import type { CookieOptions } from "@supabase/ssr";

/**
 * Optiunile cookie-ului de sesiune, intr-un SINGUR loc.
 *
 * Pana la 05.08.2026 niciunul dintre cele patru locuri unde se construieste un
 * client Supabase nu pasa `cookieOptions`, deci se aplicau implicitele
 * @supabase/ssr (constants.js): path "/", sameSite "lax", httpOnly false,
 * maxAge 400 de zile si NICIUN `secure`. Doua consecinte reale:
 *
 *   - un token copiat de pe un calculator comun sau dintr-un profil de browser
 *     sincronizat ramanea valabil 400 de zile, fara nicio limita absoluta;
 *   - lipsa lui `secure` insemna ca o cerere ajunsa pe http (un link vechi,
 *     inainte ca HSTS sa fie memorat) trimitea tokenul in clar.
 *
 * Contrastul era in propriul cod: TOATE cookie-urile scrise de Edinio —
 * `mfa_pending`, `onboarding_done`, `impersonare`, `mfa_asteptare` — aveau si
 * `httpOnly: true` si `secure` in productie. Doar cel care poarta tokenul nu
 * avea niciunul.
 *
 * CE NU SE SCHIMBA, si de ce:
 *
 *   `httpOnly` ramane FALS. Nu e o scapare, e o constrangere a lui
 *   `createBrowserClient`: codul din browser chiar trebuie sa citeasca sesiunea
 *   (vezi si src/lib/json-ld.ts:14-17, unde limita e deja consemnata). Un
 *   `httpOnly: true` aici ar rupe fiecare componenta client care vorbeste cu
 *   Supabase.
 *
 * DE CE 30 DE ZILE nu ii da afara pe cei activi: cookie-ul se rescrie la fiecare
 * reimprospatare de token, adica la fiecare navigare prin proxy. Fereastra se
 * inchide doar pentru cine chiar nu a mai intrat 30 de zile.
 *
 * ---------------------------------------------------------------------------
 * ATENTIE: `maxAge` DE AICI NU AJUNGE LA COOKIE. Nu-l sterge crezand ca merge.
 *
 * @supabase/ssr construieste optiunile de scriere asa
 * (node_modules/@supabase/ssr/dist/main/cookies.js:357-361 si :202-206):
 *
 *     { ...DEFAULT_COOKIE_OPTIONS, ...cookieOptions, maxAge: DEFAULT_COOKIE_OPTIONS.maxAge }
 *
 * `maxAge` vine ULTIMUL si forteaza implicitul bibliotecii, adica 400 de zile
 * (utils/constants.js:10). `sameSite`, `path` si `secure` chiar se aplica; durata
 * nu. De aceea exista `cuDurataNoastra` mai jos, care o pune inapoi in fiecare
 * `setAll` scris de noi.
 *
 * Ce ramane in afara: reimprospatarile facute EXCLUSIV de `createBrowserClient`,
 * intr-o fila lasata deschisa fara nicio navigare. Acolo scrie biblioteca, nu
 * noi. Nu se poate corecta fara sa reimplementam adaptorul de cookie-uri.
 */
export const COOKIE_SESIUNE: CookieOptions = {
  maxAge: 60 * 60 * 24 * 30,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

/**
 * Pune durata NOASTRA peste ce a decis biblioteca, pastrand restul optiunilor.
 *
 * Se cheama in fiecare `setAll` propriu. Cookie-urile de STERGERE (`maxAge: 0`)
 * se lasa in pace: acolo zero chiar inseamna „sterge acum".
 */
export function cuDurataNoastra(optiuni?: CookieOptions, durataSec?: number): CookieOptions | undefined {
  const maxAge = durataSec ?? COOKIE_SESIUNE.maxAge;
  if (!optiuni) return { maxAge };
  if (optiuni.maxAge === 0) return optiuni;
  return { ...optiuni, maxAge };
}
