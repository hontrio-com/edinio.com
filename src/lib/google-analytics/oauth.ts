// Google OAuth 2.0 for the Analytics APIs (multi-tenant: one Edinio app, many
// GA accounts). Scope `analytics.readonly` lets us list the user's properties
// and read their reports. We store the refresh token per store.
//
// Uses the same GCP OAuth client as Google Merchant (one consent screen, one
// verification); GOOGLE_ANALYTICS_CLIENT_ID/SECRET can override if we ever
// split projects.

import crypto from "node:crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

function clientId(): string {
  return process.env.GOOGLE_ANALYTICS_CLIENT_ID ?? process.env.GOOGLE_MERCHANT_CLIENT_ID ?? "";
}
function clientSecret(): string {
  return process.env.GOOGLE_ANALYTICS_CLIENT_SECRET ?? process.env.GOOGLE_MERCHANT_CLIENT_SECRET ?? "";
}

/*
  ═══════════════════════════════════════════════════════════════════════════════
  DOUA APLICATII GOOGLE, SAU UNA — DUPA CE E PUS IN MEDIU
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE SE DESPART. Pana acum, `/admin/analytics` (masuratoarea NOASTRA) si
  integrarea Google a COMERCIANTILOR foloseau aceeasi aplicatie OAuth. Datele
  raman separate — fiecare cu jetonul lui — dar infrastructura nu: orice
  schimbare ceruta de una o atinge pe cealalta. Concret, adaugarea unui drept nou
  pentru noi (de pilda Search Console) poate declansa o re-verificare Google a
  aplicatiei prin care isi leaga clientii conturile lor.

  ⚠ SI DE CE CU CADERE INAPOI, nu cu inlocuire. Fara variabilele corporate,
  `credentialeCorporate()` intoarce EXACT ce se folosea si ieri — deci punerea
  codului asta in productie nu schimba nimic si nu poate strica nimic. Separarea
  se intampla in clipa in care se adauga variabilele, nu in clipa desfasurarii.

  ⚠ CE TREBUIE STIUT INAINTE DE A LE ADAUGA: un `refresh_token` apartine
  aplicatiei care l-a cerut. In clipa in care creditele corporate se schimba,
  legatura salvata NU mai merge si `/admin/analytics` cere reconectare. Nu e un
  defect, e felul in care lucreaza Google — dar trebuie stiut dinainte, nu
  descoperit.

  ⚠ SEMNATURA STARII RAMANE COMUNA, dinadins. `stateSecret()` foloseste mai
  departe secretul comun: plecarea si intoarcerea trec prin ACEEASI aterizare
  (`/api/google-analytics/oauth/callback`), iar daca una ar semna cu alt secret
  decat verifica cealalta, fiecare conectare ar esua cu „stare nevalida".
*/
export type Credentiale = { id: string; secret: string };

export function credentialeComune(): Credentiale {
  return { id: clientId(), secret: clientSecret() };
}

/** Creditele platformei. Fara ele, aceleasi ca ale comerciantilor. */
export function credentialeCorporate(): Credentiale {
  const id = process.env.EDINIO_ANALYTICS_GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.EDINIO_ANALYTICS_GOOGLE_CLIENT_SECRET?.trim();
  /*
    ⚠ AMANDOUA SAU NICIUNA. Cu id-ul nou si secretul vechi, Google raspunde
    `invalid_client` si nimic nu spune de ce — iar cine a pus doar una crede ca a
    terminat. Jumatatea de configurare cade inapoi pe cea care merge.
  */
  if (!id || !secret) return credentialeComune();
  return { id, secret };
}

/** Platforma are aplicatia ei, sau imparte cu comerciantii? */
export function credentialeCorporateSeparate(): boolean {
  return !!process.env.EDINIO_ANALYTICS_GOOGLE_CLIENT_ID?.trim()
    && !!process.env.EDINIO_ANALYTICS_GOOGLE_CLIENT_SECRET?.trim();
}

export function redirectUri(): string {
  // Canonical www host (the proxy 301-redirects non-www -> www, and Google OAuth
  // redirect URIs must resolve without a redirect). Override only if needed.
  const base = process.env.GOOGLE_MERCHANT_REDIRECT_BASE || "https://www.edinio.com";
  return `${base.replace(/\/$/, "")}/api/google-analytics/oauth/callback`;
}

export function googleAnalyticsConfigured(): boolean {
  return !!(clientId() && clientSecret());
}

/**
 * Sunt gata creditele pe care le foloseste CHIAR fluxul de admin?
 *
 * ═══ ⚠ DE CE NU E DE AJUNS `googleAnalyticsConfigured` ═══
 *
 * Aceea intreaba de creditele COMUNE (`GOOGLE_ANALYTICS_*`, cu `GOOGLE_MERCHANT_*`
 * pe post de rezerva) — cele cu care se leaga comerciantii. Fluxul de la
 * `/admin/analytics` pleaca insa cu `credentialeCorporate()`.
 *
 * ⚠ CE STRICA ASTA, gasit pe 03.09.2026: cine pune NUMAI perechea corporate —
 * adica exact ce cere despartirea celor doua aplicatii — primeste „Aplicatia
 * Google nu e configurata", desi e. Poarta cantarea alte credite decat cele pe
 * care le-ar fi folosit un rand mai jos.
 *
 * ⚠ SI DE CE NU DOAR CELE CORPORATE: fara ele, `credentialeCorporate()` cade
 * inapoi pe cele comune, si atunci fluxul chiar merge. Deci intrebarea corecta e
 * despre ce se INTOARCE, nu despre ce variabile sunt puse.
 */
export function credentialeAdminGata(): boolean {
  const c = credentialeCorporate();
  return !!(c.id && c.secret);
}

/**
 * Numele variabilelor din care se pot lua creditele, in ordinea incercarii.
 *
 * ⚠ EXISTA CA SA NU MINTA MESAJUL DE EROARE. El numea o singura pereche, iar cine
 * il citea configura ce nu trebuie. Lista se citeste si dintr-o proba, ca sa nu se
 * desparta de cod — vezi `stare-oauth.test.ts`.
 */
export const VARIABILE_CREDITE = [
  "EDINIO_ANALYTICS_GOOGLE_CLIENT_ID / _SECRET",
  "GOOGLE_ANALYTICS_CLIENT_ID / _SECRET",
  "GOOGLE_MERCHANT_CLIENT_ID / _SECRET",
] as const;

export function buildAuthUrl(state: string, cred: Credentiale = credentialeComune()): string {
  const params = new URLSearchParams({
    client_id: cred.id,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: `openid email ${ANALYTICS_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export async function exchangeCode(
  code: string,
  cred: Credentiale = credentialeComune(),
): Promise<{ accessToken: string; refreshToken: string | null; email: string | null } | { error: string }> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cred.id,
        client_secret: cred.secret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const data = (await res.json()) as TokenResponse;
    if (!res.ok || !data.access_token) {
      return { error: data.error_description ?? data.error ?? "Schimbul de token a esuat." };
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      email: decodeEmail(data.id_token),
    };
  } catch {
    return { error: "Eroare de retea la conectarea Google." };
  }
}

// Short-lived in-process cache (best-effort across a warm lambda).
const tokenCache = new Map<string, { token: string; exp: number }>();

export async function getAccessToken(
  refreshToken: string,
  cred: Credentiale = credentialeComune(),
): Promise<string | null> {
  /*
    ⚠ CHEIA CUPRINDE SI APLICATIA. Acelasi jeton de reimprospatare da alt raspuns
    sub alt client — de fapt niciunul, fiindca nu-i apartine. Cheiata numai pe
    jeton, memoria ar fi putut intoarce jetonul unei aplicatii pentru cererea
    celeilalte.
  */
  const cheie = `${cred.id}:${refreshToken}`;
  const cached = tokenCache.get(cheie);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: cred.id,
        client_secret: cred.secret,
        grant_type: "refresh_token",
      }),
    });
    const data = (await res.json()) as TokenResponse;
    if (!res.ok || !data.access_token) return null;
    tokenCache.set(cheie, { token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 });
    return data.access_token;
  } catch {
    return null;
  }
}

// Signed OAuth `state` — ties the callback to a business + prevents forgery/CSRF.
function stateSecret(): string {
  return clientSecret() || process.env.CRON_SECRET || "edinio-ga-state";
}

export function signState(businessId: string): string {
  const payload = `${businessId}.${Date.now()}`;
  const sig = crypto.createHmac("sha256", stateSecret()).update(payload).digest("hex").slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const [businessId, ts, sig] = Buffer.from(state, "base64url").toString("utf8").split(".");
    if (!businessId || !ts || !sig) return null;
    const expected = crypto.createHmac("sha256", stateSecret()).update(`${businessId}.${ts}`).digest("hex").slice(0, 32);
    if (sig !== expected) return null;
    if (Date.now() - Number(ts) > 15 * 60_000) return null; // 15 min validity
    return businessId;
  } catch {
    return null;
  }
}

function decodeEmail(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
