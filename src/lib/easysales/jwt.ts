/**
 * Ce se poate citi din tokenul de acces easySales, FARA sa i se verifice semnatura.
 *
 * ⚠ E O INFORMATIE AFISATA, NU O DOVADA. Raspunsul documentat al `POST /oauth/token` are numai
 * `token_type`, `expires_in`, `access_token` si `refresh_token`, fara `scope` [A]. Revendicarea
 * `scopes` apare doar in JWT-ul-mostra din colectie (decodat: `aud`, `jti`, `iat`, `nbf`, `exp` =
 * `iat` + 31536000, `sub`, `scopes`) [A]. Ca tokenul grantului website o poarta si el, si ca lista
 * e cea ACORDATA, nu cea ceruta, e IPOTEZA (M-AUTH-1).
 *
 * Deci:
 *   - lipsa revendicarii `scopes` inseamna „necunoscut", NU „fara drepturi";
 *   - `sub` serveste doar drept cheie de ritm (contul lor); lipsa lui muta cheia pe `client_id`;
 *   - nimic de aici nu hotaraste o autorizare.
 */

export interface RevendicariJwt {
  sub: string | null;
  scopuri: string[] | null;
  /** Expirarea, in milisecunde, sau `null`. */
  expiraLaMs: number | null;
  aud: string | null;
}

function base64UrlInText(parte: string): string | null {
  try {
    const normal = parte.replace(/-/g, "+").replace(/_/g, "/");
    const cuUmplutura = normal + "=".repeat((4 - (normal.length % 4)) % 4);
    return Buffer.from(cuUmplutura, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** Revendicarile unui JWT, sau `null` cand sirul nu arata a JWT. Nu arunca niciodata. */
export function citesteJwt(token: string | null | undefined): RevendicariJwt | null {
  if (typeof token !== "string") return null;
  const parti = token.trim().split(".");
  if (parti.length !== 3 || !parti[1]) return null;
  const text = base64UrlInText(parti[1]);
  if (!text) return null;
  let corp: unknown;
  try {
    corp = JSON.parse(text);
  } catch {
    return null;
  }
  if (!corp || typeof corp !== "object") return null;
  const c = corp as Record<string, unknown>;

  const sub = typeof c.sub === "string" && c.sub.trim() ? c.sub.trim()
    : typeof c.sub === "number" ? String(c.sub) : null;
  const scopuri = Array.isArray(c.scopes)
    ? c.scopes.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim())
    : null;
  const exp = typeof c.exp === "number" && Number.isFinite(c.exp) ? c.exp * 1000 : null;
  const aud = typeof c.aud === "string" ? c.aud : null;
  return { sub, scopuri, expiraLaMs: exp, aud };
}
