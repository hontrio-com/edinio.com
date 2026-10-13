import { logError } from "@/lib/error-logger";
import {
  ASTEPTARE_EMITERE_MS, CALE_TOKEN, DURATA_TOKEN_SEC, LEASE_EMITERE_SEC, SCOPURI, SCOPURI_ESENTIALE,
  TERMEN_SIMPLU_MS, VERSIUNE_SCOPURI, gazdaEasySales,
} from "./constante";
import { citesteJwt } from "./jwt";
import { mesajulLor } from "./erori";
import type { DepozitEasySales } from "./depozit";
import type { EasySalesConfig } from "./tipuri";

/**
 * Emiterea tokenului de acces easySales, cu grantul `website`.
 *
 * ═══ ⚠ ORICE EMITERE PE ACELASI CLIENT REVOCA TOKENUL IN UZ ═══
 *
 * „Only one token per client can be created, when the new access token is generated the old one
 * is revoked automatically" [A]. Deci:
 *
 *   - zavorul se ia INAINTEA apelului (`easysales_ia_emiterea`), nu la scriere: doua fire care
 *     emit in paralel s-ar revoca reciproc chiar daca scrierea ar avea un singur castigator;
 *   - cine pierde zavorul NU emite: asteapta cel mult 10 secunde si citeste tokenul castigatorului;
 *   - „Testeaza conexiunea" NU trece pe aici niciodata (planul, §4.7).
 *
 * ═══ ⚠ UN REFUZ NE-AL NOSTRU NU TRIMITE OMUL SA RECONECTEZE ═══
 *
 * Numai formele recunoscute ale unui refuz de credentiale duc la `needs_reconnect`: clientul
 * respins (`invalid_client`) si website token-ul respins (`invalid_grant`, sau `invalid_request`
 * cu indiciul pe `website_token`). O pana a noastra (baza, retea, 5xx) sau o cursa pierduta nu
 * declara niciodata conexiunea moarta: e lectia OLX, unde numai `invalid_grant` duce la
 * reconectare (`src/lib/olx/ce-a-reusit-la-ei-se-scrie-si-la-noi.test.ts`).
 *
 * ⚠ Formele exacte ale refuzurilor se strang in E0 (M-AUTH-4). Documentat e numai cazul
 * `website_token` lipsa: 400 `invalid_request`, cu `hint` „Check the `website_token` parameter".
 */

export type MotivEsecToken =
  | "configurare"       // lipsesc client_id, secretul sau website token-ul
  | "credentiale"       // clientul respins: sters sau secret gresit
  | "website_token"     // website token-ul respins: reimprospatat sau website sters
  | "scope"             // nici lista esentiala nu e primita
  | "refuz"             // alt 4xx: defect al nostru, nu al omului
  | "trecatoare"        // retea, 429, 5xx
  | "ocupat";           // altcineva emite chiar acum si n-a terminat in timp

export type RezultatToken =
  | { ok: true; token: string; cfg: EasySalesConfig }
  | { ok: false; motiv: MotivEsecToken; mesaj: string; reconectare: boolean };

/** Textul pentru om, pe motiv. */
export const MESAJ_TOKEN: Record<MotivEsecToken, string> = {
  configurare: "Lipsesc datele de conectare easySales. Reconectează integrarea.",
  credentiale: "easySales nu mai recunoaște clientul API (a fost șters sau secretul s-a schimbat). Creează în easySales un client nou de tip „Website Grant” și reconectează.",
  website_token: "Tokenul website-ului nu mai este valabil (a fost reîmprospătat sau website-ul a fost șters). Copiază tokenul nou din easySales și lipește-l în Edinio.",
  scope: "easySales nu acordă drepturile de care are nevoie integrarea. Scrie-ne la suport.",
  refuz: "easySales a refuzat cererea de autentificare. Am fost anunțați.",
  trecatoare: "easySales nu răspunde acum. Reîncercăm automat.",
  ocupat: "O altă cerere tocmai se autentifică la easySales. Reîncercăm imediat.",
};

/** Raspunsul OAuth, cat ne trebuie din el. */
interface RaspunsOAuth {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  error?: unknown;
  hint?: unknown;
}

const dormi = (ms: number) => new Promise<void>((gata) => setTimeout(gata, ms));

/**
 * Scope-ul numit in indiciul unui refuz `invalid_scope`, daca e unul de-al nostru.
 * Passport scrie „Check the `x` scope"; daca nu spune, intoarce `null`.
 */
export function scopeDinIndiciu(hint: unknown, cerute: readonly string[]): string | null {
  if (typeof hint !== "string") return null;
  const m = /`([a-z][a-z-]+)`/i.exec(hint);
  if (!m) return null;
  const s = m[1].toLowerCase();
  return cerute.includes(s) ? s : null;
}

/** Ce inseamna refuzul endpointului de token. Pura. */
export function motivulRefuzului(status: number, corp: RaspunsOAuth | null): MotivEsecToken {
  if (status === 429 || status >= 500 || status === 0) return "trecatoare";
  const eroare = typeof corp?.error === "string" ? corp.error : "";
  const hint = typeof corp?.hint === "string" ? corp.hint.toLowerCase() : "";
  if (eroare === "invalid_client") return "credentiale";
  if (eroare === "invalid_grant") return "website_token";
  if (eroare === "invalid_request" && hint.includes("website_token")) return "website_token";
  if (eroare === "invalid_request" && (hint.includes("client_id") || hint.includes("client_secret"))) return "credentiale";
  if (eroare === "invalid_scope") return "scope";
  /* Passport raspunde 401 la client respins, chiar fara `error` citibil. */
  if (status === 401) return "credentiale";
  return "refuz";
}

/** Un singur apel la `/oauth/token`. Nu atinge baza. */
async function cereToken(cfg: EasySalesConfig, scopuri: readonly string[]): Promise<{ status: number; corp: RaspunsOAuth | null }> {
  try {
    const res = await fetch(`${gazdaEasySales()}${CALE_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "website",
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
        website_token: cfg.website_token,
        scope: scopuri.join(" "),
      }),
      signal: AbortSignal.timeout(TERMEN_SIMPLU_MS),
      cache: "no-store",
    });
    let corp: RaspunsOAuth | null = null;
    try { corp = (await res.json()) as RaspunsOAuth; } catch { corp = null; }
    return { status: res.status, corp };
  } catch {
    return { status: 0, corp: null };
  }
}

/**
 * Ce se scrie in configurare dupa o emitere reusita. Pura, ca sa se poata proba.
 *
 * ⚠ `scopuri` vine din JWT si poate lipsi: atunci e `null` („necunoscut"), nu `[]`.
 */
export function peticulTokenului(
  corp: RaspunsOAuth, scopuriCerute: readonly string[], acumMs: number,
): Partial<EasySalesConfig> {
  const token = String(corp.access_token);
  const jwt = citesteJwt(token);
  const durataSec = typeof corp.expires_in === "number" && corp.expires_in > 0 ? corp.expires_in : DURATA_TOKEN_SEC;
  const expiraMs = jwt?.expiraLaMs ?? acumMs + durataSec * 1000;
  return {
    access_token: token,
    ...(typeof corp.refresh_token === "string" && corp.refresh_token ? { refresh_token: corp.refresh_token } : {}),
    token_emis_la: new Date(acumMs).toISOString(),
    token_expira_la: new Date(expiraMs).toISOString(),
    scopuri_cerute: [...scopuriCerute],
    scopuri_versiune: VERSIUNE_SCOPURI,
    scopuri: jwt?.scopuri ?? null,
    jwt_sub: jwt?.sub ?? null,
    needs_reconnect: false,
    motiv_reconectare: null,
  };
}

/**
 * Emite un token nou, sub zavor. Intoarce tokenul scris (al nostru sau al firului castigator).
 *
 * @param cfgVazut configurarea citita de apelant; `token_versiune` din ea e versiunea „vazuta".
 */
export async function emiteToken(
  dep: DepozitEasySales, businessId: string, cfgVazut: EasySalesConfig,
): Promise<RezultatToken> {
  if (!cfgVazut.client_id || !cfgVazut.client_secret || !cfgVazut.website_token) {
    return { ok: false, motiv: "configurare", mesaj: MESAJ_TOKEN.configurare, reconectare: true };
  }

  const versiune = Number(cfgVazut.token_versiune) || 0;
  let zavor = await dep.iaEmiterea(businessId, versiune, LEASE_EMITERE_SEC);

  if (!zavor) {
    /*
     * ⚠ Altcineva emite (sau tocmai a emis). Nu se emite a doua oara: ar revoca tokenul lui.
     * Se asteapta tokenul castigatorului; daca zavorul lui expira fara token, se incearca o
     * singura data sa se ia zavorul pe aceeasi versiune.
     */
    const pana = Date.now() + ASTEPTARE_EMITERE_MS;
    while (Date.now() < pana) {
      await dormi(1000);
      let cfg: EasySalesConfig;
      try { cfg = await dep.citesteConfig(businessId); } catch { continue; }
      if ((Number(cfg.token_versiune) || 0) > versiune && cfg.access_token) {
        return { ok: true, token: cfg.access_token, cfg };
      }
      const zavorExpirat = !cfg.emitere_pana || Date.parse(cfg.emitere_pana) <= Date.now();
      if (zavorExpirat && (Number(cfg.token_versiune) || 0) === versiune) {
        zavor = await dep.iaEmiterea(businessId, versiune, LEASE_EMITERE_SEC);
        if (zavor) break;
      }
    }
    if (!zavor) return { ok: false, motiv: "ocupat", mesaj: MESAJ_TOKEN.ocupat, reconectare: false };
  }

  /* Lista intreaga; la `invalid_scope` se scoate scope-ul numit, sau se cade pe cele esentiale. */
  let scopuri: string[] = [...SCOPURI];
  let raspuns = await cereToken(cfgVazut, scopuri);
  for (let i = 0; i < 4 && raspuns.status === 400 && raspuns.corp?.error === "invalid_scope"; i++) {
    const vinovat = scopeDinIndiciu(raspuns.corp?.hint, scopuri);
    const urmatoarea = vinovat ? scopuri.filter((s) => s !== vinovat) : [...SCOPURI_ESENTIALE];
    if (urmatoarea.length === scopuri.length && urmatoarea.every((s, k) => s === scopuri[k])) break;
    await logError({
      action: "easysales.token", severity: "warning", businessId,
      message: vinovat
        ? `grantul website nu primeste scope-ul „${vinovat}”; se reincearca fara el`
        : "grantul website refuza lista de scope-uri fara sa spuna care; se reincearca cu cele esentiale",
    });
    scopuri = urmatoarea;
    raspuns = await cereToken(cfgVazut, scopuri);
  }

  if (raspuns.status >= 200 && raspuns.status < 300 && typeof raspuns.corp?.access_token === "string" && raspuns.corp.access_token) {
    const petic = peticulTokenului(raspuns.corp, scopuri, Date.now());
    const scris = await dep.scrieTokenul(businessId, zavor, petic);
    if (!scris) {
      /*
       * ⚠ Zavorul nostru a fost luat de altul (al nostru expirase). Tokenul nostru e deja revocat
       * de emiterea lui, deci NU se scrie: se citeste al lui.
       */
      await logError({
        action: "easysales.token", severity: "critical", businessId,
        message: "tokenul emis nu s-a scris: zavorul a trecut la alt fir intre timp",
      });
      try {
        const cfg = await dep.citesteConfig(businessId);
        if (cfg.access_token && (Number(cfg.token_versiune) || 0) > versiune) return { ok: true, token: cfg.access_token, cfg };
      } catch { /* cade mai jos */ }
      return { ok: false, motiv: "ocupat", mesaj: MESAJ_TOKEN.ocupat, reconectare: false };
    }
    return {
      ok: true,
      token: String(raspuns.corp.access_token),
      cfg: { ...cfgVazut, ...petic, token_versiune: versiune + 1, emitere_pana: null, emitere_id: null },
    };
  }

  await dep.elibereazaEmiterea(businessId, zavor);
  const motiv = motivulRefuzului(raspuns.status, raspuns.corp);
  const reconectare = motiv === "credentiale" || motiv === "website_token";
  if (motiv !== "trecatoare") {
    await logError({
      action: "easysales.token", severity: reconectare ? "warning" : "error", businessId,
      message: `emiterea tokenului a fost refuzata (${raspuns.status}): ${mesajulLor(raspuns.corp) || "fara mesaj"}`,
      details: { motiv, eroare: raspuns.corp?.error ?? null },
    });
  }
  return { ok: false, motiv, mesaj: MESAJ_TOKEN[motiv], reconectare };
}

/** Tokenul e bun inca cel putin o zi? Reinnoirea planificata (cu 30 de zile) o face cronul. */
export function tokenulMaiTine(cfg: EasySalesConfig, acumMs = Date.now()): boolean {
  if (!cfg.access_token) return false;
  const exp = cfg.token_expira_la ? Date.parse(cfg.token_expira_la) : NaN;
  if (!Number.isFinite(exp)) return true; // fara data, il folosim; un 401 il va inlocui
  return exp - acumMs > 24 * 60 * 60 * 1000;
}

/** Un token folosibil: cel salvat daca mai tine, altfel unul nou, sub zavor. */
export async function asiguraToken(
  dep: DepozitEasySales, businessId: string, cfg: EasySalesConfig,
): Promise<RezultatToken> {
  if (tokenulMaiTine(cfg)) return { ok: true, token: cfg.access_token!, cfg };
  return emiteToken(dep, businessId, cfg);
}
