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
 */
export const COOKIE_SESIUNE: CookieOptions = {
  maxAge: 60 * 60 * 24 * 30,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
};
