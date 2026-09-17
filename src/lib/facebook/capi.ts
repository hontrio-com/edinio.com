import { VERSIUNE_META } from "@/lib/edinio-marketing/server/versiuni-api";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CONVERSIONS API CU TOKENUL COMERCIANTULUI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ ALT DRUM DECAT `edinio-marketing/server/trimite-meta.ts`. Acela trimite in pixelul PLATFORMEI, cu
  tokenul nostru din mediu. Aici trimite in pixelul comerciantului, cu tokenul generat de el in Events
  Manager (Settings -> Conversions API -> Generate access token). Documentatia „Set up Conversions API as a
  Platform” numeste exact optiunea asta: „Client System User Access Token”. Nu cere App Review pentru noi.

  ⚠ TOKENUL PLEACA IN CORP, nu in adresa: in query string ar ajunge in jurnalele oricui sta pe drum.

  ⚠ MARTORUL E `events_received`, NU CODUL HTTP. Un raspuns fara eroare si fara `events_received` nu
  spune ca a ajuns ceva (aceeasi lectie ca la trimiterea platformei).
*/

export interface EvenimentCapi {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url: string;
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
}

export interface TintaCapi {
  pixelId: string;
  token: string;
  /** Codul din Events Manager -> Test events. Cu el, evenimentele se vad acolo si NU intra in rapoarte. */
  testEventCode?: string | null;
}

export type RezultatCapi =
  | { ok: true; primite: number }
  | { ok: false; mesaj: string; cod?: number; subcod?: number; tokenInvalid: boolean };

/** Cat asteapta o cerere catre Meta: chemarea sta dupa raspuns, dar functia nu are voie sa atarne. */
const MS_CERERE = 10_000;

const adresaEvenimente = (pixelId: string) => `https://graph.facebook.com/${VERSIUNE_META}/${encodeURIComponent(pixelId)}/events`;

type RaspunsMeta = {
  events_received?: number;
  error?: { message?: string; code?: number; error_subcode?: number };
};

/**
 * ⚠ 190 e tokenul (expirat, revocat, gresit); 10 si 200 sunt drepturi lipsa pe pixelul asta. Toate se
 * repara DOAR de comerciant, cu alt token, deci panoul trebuie sa le spuna ca atare.
 */
const CODURI_TOKEN = new Set([190, 10, 200]);

export async function trimiteLaMeta(tinta: TintaCapi, evenimente: EvenimentCapi[]): Promise<RezultatCapi> {
  const corp: Record<string, unknown> = { data: evenimente, access_token: tinta.token };
  if (tinta.testEventCode) corp.test_event_code = tinta.testEventCode;
  let raspuns: Response;
  try {
    raspuns = await fetch(adresaEvenimente(tinta.pixelId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corp),
      signal: AbortSignal.timeout(MS_CERERE),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, mesaj: e instanceof Error ? e.message : "reteaua a cazut", tokenInvalid: false };
  }
  let date: RaspunsMeta = {};
  try {
    date = (await raspuns.json()) as RaspunsMeta;
  } catch {
    return { ok: false, mesaj: `raspuns necitibil (HTTP ${raspuns.status})`, tokenInvalid: false };
  }
  if (!date.error && typeof date.events_received === "number" && date.events_received > 0) {
    return { ok: true, primite: date.events_received };
  }
  const cod = date.error?.code;
  return {
    ok: false,
    cod,
    subcod: date.error?.error_subcode,
    mesaj: date.error?.message ?? `fara eroare, dar events_received=${date.events_received ?? "lipsa"}`,
    tokenInvalid: cod !== undefined && CODURI_TOKEN.has(cod),
  };
}

/**
 * Verifica tokenul pe pixelul dat, fara sa trimita vreun eveniment: citeste numele pixelului.
 *
 * ⚠ Tokenul pleaca in antetul `Authorization`, nu in adresa, din acelasi motiv ca mai sus.
 */
export async function verificaTokenul(pixelId: string, token: string): Promise<{ ok: true; nume: string | null } | { ok: false; mesaj: string }> {
  try {
    const r = await fetch(`https://graph.facebook.com/${VERSIUNE_META}/${encodeURIComponent(pixelId)}?fields=id,name`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(MS_CERERE),
      cache: "no-store",
    });
    const date = (await r.json().catch(() => ({}))) as { id?: string; name?: string; error?: { message?: string } };
    if (r.ok && date.id === pixelId) return { ok: true, nume: date.name ?? null };
    return { ok: false, mesaj: date.error?.message ?? `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, mesaj: e instanceof Error ? e.message : "reteaua a cazut" };
  }
}

/** `fbp` si `fbc` au forma `fb.<subdomeniu>.<ms>.<valoare>`; altceva nu pleaca (ar fi respins). */
export function cookieMetaValid(v: unknown): string | undefined {
  return typeof v === "string" && /^fb\.\d\.\d{10,13}\..{1,400}$/.test(v) ? v : undefined;
}

/**
 * `fbc` construit din `fbclid`, cand cookie-ul `_fbc` lipseste: „version.subdomainIndex.creationTime.<fbclid>”,
 * cu indexul 1 („If you're generating this field on a server, and not saving an `_fbc` cookie, use the value
 * 1”) si momentul in care l-am vazut prima oara.
 */
export function fbcDinFbclid(fbclid: unknown, vazutLa: unknown): string | undefined {
  if (typeof fbclid !== "string" || !/^[\w-]{10,500}$/.test(fbclid)) return undefined;
  const ms = typeof vazutLa === "string" ? Date.parse(vazutLa) : NaN;
  return `fb.1.${Number.isFinite(ms) ? ms : Date.now()}.${fbclid}`;
}
