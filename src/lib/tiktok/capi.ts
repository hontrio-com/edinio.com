import { VERSIUNE_TIKTOK } from "@/lib/edinio-marketing/server/versiuni-api";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  EVENTS API 2.0 CU TOKENUL COMERCIANTULUI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ ALT DRUM DECAT `edinio-marketing/server/trimite-tiktok.ts`. Acela trimite in pixelul PLATFORMEI, cu
  tokenul nostru din mediu. Aici trimite in pixelul comerciantului, cu tokenul generat de el: ghidul „Setup
  guide for Web” spune „Alternatively, you can Generate access token from pixel > Settings”. Nu cere nici
  aplicatie TikTok, nici OAuth.

  ⚠ CODUL HTTP NU E VERDICTUL: adevarul e in `code` din corp, iar `0` inseamna primit. Masurat pe platforma
  (02.09.2026): un pixel la care tokenul n-avea drept a intors HTTP 200 cu `code: 40001`.

  ⚠ CODURILE, din „Appendix - Return codes”:
      0     primit
      40001 fara drept pe pixelul acela        -> comerciantul schimba tokenul
      40105 token nevalid sau gresit           -> comerciantul schimba tokenul
      40002 parametri gresiti                  -> mesajul NOSTRU e stricat, reincercarea da acelasi raspuns
      40007 obiectul nu exista                 -> pixel sters sau ID gresit
      40100 / 40133 prea multe cereri          -> ⚠ TRECATOR, se reincearca
      50000 eroare de sistem                   -> trecator

  ⚠ NU EXISTA COD DE TEST. Documentatia parametrilor enumera exact trei campuri de nivel intai
  (`event_source`, `event_source_id`, `data`); Meta are `test_event_code`, TikTok nu. Verificarea se face in
  Events Manager, unde sursa apare cu „Connection Method: Server”.
*/

const ADRESA = `https://business-api.tiktok.com/open_api/${VERSIUNE_TIKTOK}/event/track/`;
const ADRESA_UTILIZATOR = `https://business-api.tiktok.com/open_api/${VERSIUNE_TIKTOK}/user/info/`;

/** Cat asteapta o cerere: chemarea sta dupa raspuns, dar functia nu are voie sa atarne. */
const MS_CERERE = 10_000;

export interface EvenimentTikTok {
  event: string;
  event_time: number;
  event_id: string;
  user: Record<string, unknown>;
  page: { url: string; referrer?: string };
  properties?: Record<string, unknown>;
}

export interface TintaTikTok {
  pixelId: string;
  token: string;
}

export type RezultatTikTok =
  | { ok: true }
  | { ok: false; mesaj: string; cod?: number; tokenInvalid: boolean; trecator: boolean };

const CODURI_TOKEN = new Set([40001, 40105, 40007]);
const CODURI_TRECATOARE = new Set([40100, 40133, 50000]);

export async function trimiteLaTikTok(tinta: TintaTikTok, evenimente: EvenimentTikTok[]): Promise<RezultatTikTok> {
  let raspuns: Response;
  try {
    raspuns = await fetch(ADRESA, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": tinta.token },
      body: JSON.stringify({ event_source: "web", event_source_id: tinta.pixelId, data: evenimente }),
      signal: AbortSignal.timeout(MS_CERERE),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, mesaj: e instanceof Error ? e.message : "reteaua a cazut", tokenInvalid: false, trecator: true };
  }
  let corp: { code?: number; message?: string } = {};
  try {
    corp = (await raspuns.json()) as typeof corp;
  } catch {
    return { ok: false, mesaj: `raspuns necitibil (HTTP ${raspuns.status})`, tokenInvalid: false, trecator: true };
  }
  if (corp.code === 0) return { ok: true };
  const cod = corp.code;
  return {
    ok: false,
    cod,
    mesaj: `code ${cod ?? "lipsa"}: ${corp.message ?? "fara mesaj"}`,
    tokenInvalid: cod !== undefined && CODURI_TOKEN.has(cod),
    trecator: cod === undefined || CODURI_TRECATOARE.has(cod),
  };
}

/**
 * Ce spune TikTok despre token, fara sa trimita niciun eveniment.
 *
 * ⚠ RASPUNSUL NU E O DOVADA DEPLINA, si de aceea nu se opreste salvarea pe el. `/user/info/` e facut pentru
 * tokenurile aplicatiilor de dezvoltator; unul generat din Events Manager poate sa nu aiba drept acolo fara
 * sa fie gresit. Doar `40105` („Invalid or incorrect access token”) spune sigur ca tokenul e rau.
 */
export async function intreabaDespreToken(token: string): Promise<{ stare: "bun" | "rau" | "nesigur"; mesaj: string }> {
  try {
    const r = await fetch(ADRESA_UTILIZATOR, {
      headers: { "Access-Token": token },
      signal: AbortSignal.timeout(MS_CERERE),
      cache: "no-store",
    });
    const corp = (await r.json().catch(() => ({}))) as { code?: number; message?: string };
    if (corp.code === 0) return { stare: "bun", mesaj: "TikTok a recunoscut tokenul." };
    if (corp.code === 40105) return { stare: "rau", mesaj: corp.message ?? "token nevalid sau gresit" };
    return { stare: "nesigur", mesaj: `code ${corp.code ?? "lipsa"}: ${corp.message ?? "fara mesaj"}` };
  } catch (e) {
    return { stare: "nesigur", mesaj: e instanceof Error ? e.message : "reteaua a cazut" };
  }
}

/** `ttclid` ajunge pana la 1000 de caractere („you need to ensure that you don't truncate it”). */
export function ttclidValid(v: unknown): string | undefined {
  return typeof v === "string" && /^[\w.~-]{6,1000}$/.test(v) ? v : undefined;
}

/** Cookie-ul `_ttp` pus de pixel: identificatorul de browser pe care il cere `user.ttp`. */
export function ttpValid(v: unknown): string | undefined {
  return typeof v === "string" && /^[\w.~-]{6,200}$/.test(v) ? v : undefined;
}
