// OAuth 2.0 for the OLX Partner API (multi-tenant: one Edinio app, many
// merchant OLX accounts). Two grant flows:
//  - authorization_code + refresh_token: per-merchant (required to manage adverts)
//  - client_credentials: config data only (categories, cities) — no user context
//
// CRITICAL (differs from Google): OLX refresh tokens ROTATE — the token
// response may contain a NEW refresh_token, and the old one expires after one
// month. Every refresh must persist the returned tokens back into olx_config,
// otherwise the connection silently dies within a month.

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { OlxConfig } from "./types";
import { patchOlxConfig } from "./config";
import type { Json } from "@/types/database.types";

type Db = SupabaseClient<Database>;

const AUTH_URL = "https://www.olx.ro/oauth/authorize/";
const TOKEN_URL = "https://www.olx.ro/api/open/oauth/token";
const SCOPE = "v2 read write";

function clientId(): string { return process.env.OLX_CLIENT_ID ?? ""; }
function clientSecret(): string { return process.env.OLX_CLIENT_SECRET ?? ""; }

export function redirectUri(): string {
  // MUST match the Callback/Redirect URI registered on developer.olx.ro
  // character-for-character (registered with www — the proxy 301s non-www).
  const base = process.env.OLX_REDIRECT_BASE || "https://www.edinio.com";
  return `${base.replace(/\/$/, "")}/api/olx/oauth/callback`;
}

export function olxConfigured(): boolean {
  return !!(clientId() && clientSecret());
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    state,
    scope: SCOPE,
    redirect_uri: redirectUri(),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface OlxTokens {
  accessToken: string;
  expiresAt: string;          // ISO
  refreshToken: string | null;
}

async function tokenRequest(body: Record<string, string>): Promise<OlxTokens | { error: string; invalidGrant?: boolean }> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !data.access_token) {
      return {
        error: data.error_description ?? data.error ?? `HTTP ${res.status}`,
        /*
         * ═══ ⚠ ORICE 400 SAU 401 TRECEA DREPT „SESIUNE MOARTA" (30.08.2026, tarziu) ═══
         *
         * `invalidGrant` duce, mai sus, la `needs_reconnect` — adica ii spunem comerciantului sa
         * reconecteze contul. Dar OLX raspunde `400` si pentru `invalid_client`, `invalid_scope`,
         * `invalid_request`, iar `401` si pentru un antet gresit sau o cheie de aplicatie schimbata.
         * Niciuna nu inseamna ca refresh tokenul LUI a expirat.
         *
         * Un `400` de la o greseala de-a noastra in configurarea aplicatiei ar fi trimis TOTI
         * comerciantii sa reconecteze conturi perfect sanatoase.
         *
         * ⚠ Se cere chiar codul lor. Restul raman erori trecatoare, deci se reincearca.
         */
        invalidGrant: data.error === "invalid_grant",
      };
    }
    const expiresAt = new Date(Date.now() + (Number(data.expires_in) || 86400) * 1000).toISOString();
    return { accessToken: data.access_token, expiresAt, refreshToken: data.refresh_token ?? null };
  } catch {
    return { error: "Eroare de retea la conectarea OLX." };
  }
}

export function exchangeCode(code: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: clientId(),
    client_secret: clientSecret(),
    code,
    scope: SCOPE,
    // Mandatory here because the auth URL included redirect_uri (must match exactly).
    redirect_uri: redirectUri(),
  });
}

function refreshTokens(refreshToken: string) {
  return tokenRequest({
    grant_type: "refresh_token",
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
  });
}

// ── Per-merchant token with rotation persistence ────────────────────────────────
// `db` must be able to update store_settings for this business (admin client, or
// the owner's server client). Returns a usable access token, refreshing +
// persisting rotated tokens when needed.
export async function ensureMerchantToken(
  db: Db,
  businessId: string,
  config: OlxConfig,
): Promise<{ token: string; config: OlxConfig } | { error: string; needsReconnect: boolean }> {
  const now = Date.now();
  const exp = config.access_token_expires_at ? Date.parse(config.access_token_expires_at) : 0;
  if (config.access_token && exp > now + 120_000) {
    return { token: config.access_token, config };
  }
  if (!config.refresh_token) return { error: "Contul OLX nu este conectat.", needsReconnect: true };

  const res = await refreshTokens(config.refresh_token);
  if ("error" in res) {
    if (res.invalidGrant) {
      /*
       * ═══ ⚠ `invalid_grant` POATE INSEMNA „ALTCINEVA A ROTIT DEJA" (30.08.2026, tarziu) ═══
       *
       * Doua fire pornesc cu acelasi refresh token R1. Primul primeste A2 + R2 si scrie. Al doilea
       * cere tot cu R1 — deja consumat — si OLX ii raspunde `invalid_grant`. Pana azi, al doilea
       * scria `needs_reconnect = true` peste configul SANATOS al primului:
       *
       *     A repara sesiunea ✅
       *     B o marcheaza „reconecteaza contul" ❌
       *
       * Iar CAS-ul de mai jos nu-l prindea, fiindca B iesea de-aici fara sa mai ajunga la el.
       *
       * ⚠ SE INTREABA MARTORUL INAINTE DE A DA VESTEA PROASTA: daca `token_updated_at` s-a miscat
       * de cand am citit, altcineva a rotit — si atunci tokenul LUI e bun, iar al nostru era doar
       * vechi. Numai daca nimeni n-a rotit, refresh tokenul chiar a murit.
       */
      const proaspat = await citesteConfig(db, businessId);
      const altcinevaARotit = proaspat != null
        && (proaspat.token_updated_at ?? null) !== (config.token_updated_at ?? null);
      if (altcinevaARotit && proaspat.access_token && proaspat.refresh_token) {
        return { token: proaspat.access_token, config: proaspat };
      }
      await persistConfig(db, businessId, { needs_reconnect: true });
      return { error: "Sesiunea OLX a expirat. Reconecteaza contul OLX.", needsReconnect: true };
    }
    return { error: res.error, needsReconnect: false };
  }

  const petic: Partial<OlxConfig> = {
    access_token: res.accessToken,
    access_token_expires_at: res.expiresAt,
    // Rotation: keep the new refresh token when one is issued.
    refresh_token: res.refreshToken ?? config.refresh_token,
    token_updated_at: new Date().toISOString(),
    needs_reconnect: false,
  };

  /*
   * ═══ ⚠ ROTATIA ARE UN SINGUR CASTIGATOR (30.08.2026) ═══
   *
   * Functia asta se cheama din cron, din actiuni si din callback. Doua fire care gasesc acelasi
   * access token expirat pornesc AMANDOUA reimprospatarea, cu acelasi refresh token:
   *
   *     A si B citesc configul: acces expirat, refresh R1
   *     A: OLX -> A2 + R2, scrie R2
   *     B: OLX cu R1 -> refuz, fiindca R1 s-a consumat
   *     B scrie peste configul SANATOS al lui A ❌
   *
   * ⚠ COMPARAREA NU SE POATE FACE PE TOKEN: `refresh_token` e criptat in baza, deci ce sta acolo nu
   * se poate confrunta cu ce tine firul in mana. Dar rotatia lasa un martor necriptat —
   * `token_updated_at` — si „nimeni n-a rotit de cand am citit eu" se spune atunci simplu.
   *
   * ⚠ CINE PIERDE CURSA NU SE PLANGE, RECITESTE. Celalalt fir a scris deja un token bun; a-l
   * declara „sesiune moarta" ar trimite comerciantul sa reconecteze un cont viu.
   */
  const vazut = config.token_updated_at ?? null;
  const { data: aScris, error: eRotatie } = await db.rpc("olx_roteste_tokenul", {
    p_business_id: businessId,
    p_vazut: vazut,
    p_patch: petic as unknown as Json,
  });

  if (!eRotatie && aScris === false) {
    /* Altcineva a rotit intre timp: se ia ce a scris el, nu se scrie peste. */
    const proaspat = await citesteConfig(db, businessId);
    if (proaspat?.access_token && proaspat.refresh_token) {
      return { token: proaspat.access_token, config: proaspat };
    }
    return { error: "Sesiunea OLX se reinnoieste in alta parte; se reia.", needsReconnect: false };
  }

  const scris = eRotatie ? await persistConfig(db, businessId, petic) : true;

  /*
   * ═══ ⚠ UN REFRESH TOKEN ROTIT SI NESCRIS INSEAMNA CONEXIUNE MOARTA (29.08.2026, noaptea) ═══
   *
   * OLX roteste refresh tokenul: cand da unul nou, cel vechi nu mai e bun. Pana azi scrierea mergea
   * oarba si se raporta oricum sanatate:
   *
   *     avem R1 -> OLX ne da A2 + R2
   *     scrierea lui R2 pica -> in baza ramane R1
   *     mergem mai departe cu A2, deci totul pare bine
   *     A2 expira -> incercam iar cu R1, care nu mai e bun -> „reconecteaza contul" ❌
   *
   * ⚠ DEOSEBIREA E CHIAR ROTATIA. Daca ei NU ne-au dat alt refresh token, cel din baza e inca bun:
   * o scriere picata costa doar o reimprospatare in plus, deci se merge mai departe. Daca ne-au dat
   * unul nou si nu l-am scris, singurul martor al conexiunii e in memoria procesului asta — si
   * moare cu el. Atunci NU se raporteaza sanatate.
   */
  const rotit = !!res.refreshToken && res.refreshToken !== config.refresh_token;
  if (!scris && rotit) {
    return {
      error: "Nu am putut salva sesiunea OLX reînnoită; se reia.",
      needsReconnect: false,
    };
  }
  return { token: res.accessToken, config: { ...config, ...petic } };
}

/**
 * Scrie un petic peste configul OLX, si SPUNE daca a intrat.
 *
 * ═══ ⚠ ERA O PAZA CARE NU SE PUTEA APRINDE (29.08.2026, noaptea) ═══
 *
 * Avea `try/catch` in jurul unei cereri care NU arunca: `supabase-js` intoarce `{ error }` la o
 * eroare PostgREST. Deci `catch`-ul prindea doar caderile de retea ale clientului, iar un refuz al
 * bazei se scurgea tacut — si comentariul „best-effort — next call refreshes again" nu era
 * adevarat pentru cazul care conteaza.
 *
 * ⚠ SI SCRIE UN PETIC, NU CONFIGUL INTREG. Scris intreg, doua salvari care se suprapun se calca —
 * iar cea mai scumpa de pierdut e chiar cea de aici, fiindca refresh tokenul SE ROTESTE.
 */
/**
 * Citeste configul proaspat, prin vederea care decripteaza.
 *
 * ⚠ Se cheama cand am PIERDUT cursa rotatiei: celalalt fir a scris deja un token bun, si pe acela
 * il vrem — nu unul pe care tocmai l-am invalidat noi ceruind altul.
 */
async function citesteConfig(db: Db, businessId: string): Promise<OlxConfig | null> {
  const { data, error } = await db
    .from("store_settings").select("olx_config").eq("business_id", businessId).maybeSingle();
  if (error) return null;
  return ((data?.olx_config as OlxConfig) ?? null);
}

async function persistConfig(db: Db, businessId: string, patch: Partial<OlxConfig>): Promise<boolean> {
  try {
    await patchOlxConfig(db, businessId, patch);
    return true;
  } catch {
    return false;
  }
}

// ── App-level token for config data (categories, cities) ────────────────────────
let appToken: { token: string; exp: number } | null = null;

export async function getAppToken(): Promise<string | null> {
  if (appToken && appToken.exp > Date.now() + 60_000) return appToken.token;
  const res = await tokenRequest({
    grant_type: "client_credentials",
    client_id: clientId(),
    client_secret: clientSecret(),
    scope: "v2 read",
  });
  if ("error" in res) return null;
  appToken = { token: res.accessToken, exp: Date.parse(res.expiresAt) };
  return res.accessToken;
}

// ── Signed OAuth `state` — ties the callback to a business + prevents CSRF ──────
function stateSecret(): string {
  return process.env.OLX_CLIENT_SECRET || process.env.CRON_SECRET || "edinio-olx-state";
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
