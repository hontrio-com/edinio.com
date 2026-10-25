import { HONTRIO_CLIENT_ID } from "./config";
import { formaProvocariiValida } from "./jetoane";

/**
 * Cererea de autorizare a lui Hontrio: ce se citeste din adresa, ce se tine minte in cookie si
 * unde se intoarce raspunsul.
 *
 * ═══ ⚠ DE CE COOKIE, SI NU PARAMETRII IN ADRESA PANOULUI ═══
 *
 * Comerciantul trimis de Hontrio poate sa nu fie logat in Edinio. Proxy-ul il duce atunci la
 * `/login`, iar logarea (parola, apoi codul din email) se termina MEREU in `/dashboard`: nu exista
 * nicio adresa de intoarcere. Parametrii cererii s-ar fi pierdut pe drum si omul ar fi ajuns in panou
 * fara sa stie de ce a venit.
 *
 * Cookie-ul trece si prin logare si prin codul din email. Pagina `/dashboard` il vede si trimite omul
 * mai departe la ecranul de aprobare (`cerereInAsteptare`).
 *
 * ⚠ SE VALIDEAZA DE DOUA ORI: la intrare si la fiecare citire din cookie. Cookie-ul vine din browser,
 * deci poate fi scris de oricine: o adresa de intoarcere din el se crede numai daca e inca pe lista.
 */

/** Cat traieste o cerere de autorizare. Ajunge pentru logare, codul din email si citirea ecranului. */
export const DURATA_CERERE_MS = 10 * 60_000;

export const COOKIE_CERERE = "edinio_hontrio_cerere";

export interface CerereAutorizare {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  /** Cand a pornit cererea (ms). Fara ea, un cookie vechi ar fi fost aprobat oricat de tarziu. */
  creataLa: number;
}

export type RezultatCerere =
  | { fel: "buna"; cerere: CerereAutorizare }
  /*
   * ⚠ CLIENT SAU ADRESA NECUNOSCUTE: NU SE INTOARCE NIMIC NICAIERI (RFC 6749, 4.1.2.1). O adresa de
   * intoarcere necunoscuta e chiar unealta cu care cineva ar fi cules coduri: raspunsul cu eroare
   * plecat acolo ar fi confirmat ca adresa „merge". Omul vede un ecran de eroare la noi.
   */
  | { fel: "oprita"; motiv: "neconfigurat" | "client" | "adresa" }
  /* Clientul si adresa sunt bune, restul nu: eroarea se intoarce la Hontrio, cu `state`. */
  | { fel: "intoarsa"; catre: string };

/** `state` e al lui Hontrio si se intoarce neatins. Un sir lizibil, cu o lungime rezonabila. */
function stateBun(state: string): boolean {
  return state.length > 0 && state.length <= 512 && /^[\x20-\x7E]+$/.test(state);
}

export function adresaCuParametri(redirectUri: string, parametri: Record<string, string>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(parametri)) u.searchParams.set(k, v);
  return u.toString();
}

export function adresaCuEroare(redirectUri: string, eroare: string, state: string | null): string {
  return adresaCuParametri(redirectUri, state ? { error: eroare, state } : { error: eroare });
}

export function adresaCuCod(redirectUri: string, cod: string, state: string): string {
  return adresaCuParametri(redirectUri, { code: cod, state });
}

/**
 * Cererea venita de la Hontrio, verificata in ordinea din RFC: intai cine cere si unde se intoarce,
 * abia apoi restul.
 *
 * @param permise adresele de intoarcere din mediu; lista goala inseamna legatura oprita.
 */
export function citesteCererea(
  p: URLSearchParams,
  permise: readonly string[],
  configurat: boolean,
  acum: number,
): RezultatCerere {
  if (!configurat) return { fel: "oprita", motiv: "neconfigurat" };
  if (p.get("client_id") !== HONTRIO_CLIENT_ID) return { fel: "oprita", motiv: "client" };

  const redirectUri = p.get("redirect_uri") ?? "";
  /* ⚠ EGALITATE EXACTA, nu prefix si nu „acelasi domeniu" (RFC 6749, 3.1.2.3; OAuth 2.1). */
  if (!permise.includes(redirectUri)) return { fel: "oprita", motiv: "adresa" };

  const stateBrut = p.get("state");
  const state = stateBrut && stateBun(stateBrut) ? stateBrut : null;

  if (p.get("response_type") !== "code") {
    return { fel: "intoarsa", catre: adresaCuEroare(redirectUri, "unsupported_response_type", state) };
  }
  /*
   * ⚠ PKCE E OBLIGATORIU, si numai S256. `plain` ar fi trimis verificatorul prin browser, adica exact
   * pe drumul de pe care PKCE il scoate.
   */
  const codeChallenge = p.get("code_challenge") ?? "";
  if (p.get("code_challenge_method") !== "S256" || !formaProvocariiValida(codeChallenge)) {
    return { fel: "intoarsa", catre: adresaCuEroare(redirectUri, "invalid_request", state) };
  }
  /* Fara `state`, Hontrio n-ar avea cum sa lege raspunsul de cererea lui: ar fi deschis CSRF-ul. */
  if (!state) return { fel: "intoarsa", catre: adresaCuEroare(redirectUri, "invalid_request", null) };

  return { fel: "buna", cerere: { redirectUri, state, codeChallenge, creataLa: acum } };
}

export function serializeazaCererea(c: CerereAutorizare): string {
  return Buffer.from(JSON.stringify({ r: c.redirectUri, s: c.state, c: c.codeChallenge, t: c.creataLa }), "utf8")
    .toString("base64url");
}

/**
 * Cererea din cookie, sau `null` cand lipseste, e stricata, a expirat sau nu mai e pe lista.
 *
 * ⚠ TRECE PRIN ACEEASI VERIFICARE CA LA INTRARE, prin `citesteCererea`, nu printr-o a doua regula
 * scrisa aici: doua reguli ar fi ajuns, la prima schimbare, sa accepte lucruri diferite.
 */
export function cerereaDinCookie(
  valoare: string | null | undefined,
  permise: readonly string[],
  configurat: boolean,
  acum: number,
): CerereAutorizare | null {
  if (!valoare || valoare.length > 2000) return null;
  let brut: { r?: unknown; s?: unknown; c?: unknown; t?: unknown };
  try {
    brut = JSON.parse(Buffer.from(valoare, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof brut !== "object" || brut === null) return null;
  const { r, s, c, t } = brut;
  if (typeof r !== "string" || typeof s !== "string" || typeof c !== "string" || typeof t !== "number") return null;
  /* ⚠ O cerere „din viitor" e tot o cerere scrisa de altcineva decat noi. */
  if (!Number.isFinite(t) || t > acum + 60_000 || acum - t > DURATA_CERERE_MS) return null;

  const p = new URLSearchParams({
    client_id: HONTRIO_CLIENT_ID, redirect_uri: r, response_type: "code",
    code_challenge: c, code_challenge_method: "S256", state: s,
  });
  const rez = citesteCererea(p, permise, configurat, acum);
  return rez.fel === "buna" ? { ...rez.cerere, creataLa: t } : null;
}
