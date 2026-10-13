import { logError } from "@/lib/error-logger";
import { asteaptaJetonImpartit, asteptareaCerutaDeEi, spunePauza } from "@/lib/marketplace/ritm-impartit";
import {
  BUGET_PE_MINUT, PAUZA_REEMITERE_MS, PRAG_RAMASE, PREFIX_API, TERMEN_BLOC_MS, TERMEN_SIMPLU_MS, gazdaEasySales,
} from "./constante";
import { clasificaCaderea, clasificaRaspuns, type Clasificare } from "./erori";
import { asiguraToken, emiteToken, type RezultatToken } from "./token";
import type { DepozitEasySales } from "./depozit";
import type { EasySalesConfig } from "./tipuri";

/**
 * Clientul HTTP comun al integrarii easySales.
 *
 * ═══ CE FACE, SI DE CE AICI SI NU IN FIECARE APEL ═══
 *
 *   1. RITMUL, impartit pe CONTUL lor, nu pe magazin: limita e „500 de cereri pe minut per user"
 *      [A], iar doua magazine Edinio pe acelasi cont o impart. Bugetul nostru e 250.
 *   2. TERMENELE: 20 s la cererile simple, 60 s la cele in bloc.
 *   3. `website_token` LA RADACINA corpului, numai pe scrierile care il au in colectie (Add, Save,
 *      Update la comenzi, produse, categorii, caracteristici, stoc, preturi). Pe abonari, anulari
 *      si metadate exemplele nu-l au; daca un camp in plus le strica e IPOTEZA (M-AUTH-6), deci nu
 *      se trimite acolo unde nu e documentat.
 *   4. 401: tokenul se trateaza ca invalid, fara nicio presupunere despre corp (colectia n-are
 *      niciun exemplu 401). Cel mult o reemitere la 10 minute pe magazin, urmata de o singura
 *      reluare; o revocare neexplicata se numara (a doua in 24 h cere reconectarea).
 *   5. JURNALUL: scrierile si orice esec, fara corpuri, antete sau date personale.
 *
 * ⚠ Nicio decizie despre continut nu se ia aici. Clientul spune doar ce s-a intamplat.
 */

export type Metoda = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ContextEasySales {
  dep: DepozitEasySales;
  businessId: string;
  /** Configurarea, DECRIPTATA. Se inlocuieste aici cand tokenul se schimba. */
  cfg: EasySalesConfig;
  /** Firul lucrarii, pentru jurnal. */
  corelatie?: string | null;
  /**
   * ⚠ „Testeaza conexiunea" si orice citire de diagnostic: niciodata o emitere. Orice emitere
   * revoca tokenul in uz, deci un test care emite ar strica exact ce verifica.
   */
  faraEmitere?: boolean;
}

export interface OptiuniCerere {
  metoda: Metoda;
  /** Calea-sablon de dupa `/api/v2`, ex. `/orders/{id}/metadata`. Asa se scrie si in jurnal. */
  cale: string;
  parametri?: Record<string, string | number>;
  interogare?: Record<string, string | number | boolean | null | undefined>;
  corp?: Record<string, unknown> | null;
  /** Cererile in bloc primesc termenul lung. */
  inBloc?: boolean;
  /** Pune `website_token` la radacina corpului (numai unde colectia il arata). */
  cuWebsiteToken?: boolean;
  /**
   * Cererea schimba ceva la ei? Implicit: orice nu e GET. Conteaza la caderi fara raspuns: la o
   * scriere, rezultatul e `necunoscut`, nu `esuat`.
   */
  scriere?: boolean;
}

export interface Raspuns<T> extends Clasificare {
  ok: boolean;
  /** 0 = n-am ajuns la ei. */
  status: number;
  /** `data` din plic, sau corpul intreg cand nu e plic. */
  date: T | null;
  /** Corpul citit, ca JSON (sau `null`). Nu se scrie nicaieri intreg. */
  corp: unknown;
  /** `X-RateLimit-Remaining`, daca a venit. */
  ramase: number | null;
}

/** Cheia de ritm: contul lor (`sub` din JWT), cu `client_id` ca rezerva (IPOTEZA, M-LIM-1). */
export function cheiaDeRitm(cfg: EasySalesConfig): string {
  const sub = typeof cfg.jwt_sub === "string" && cfg.jwt_sub.trim() ? cfg.jwt_sub.trim() : null;
  return `easysales:${sub ?? `client:${cfg.client_id ?? "necunoscut"}`}`;
}

/** Adresa intreaga a unei cereri. Parametrii de cale se codifica; interogarea sare peste goluri. */
export function adresaCererii(o: Pick<OptiuniCerere, "cale" | "parametri" | "interogare">): string {
  let cale = o.cale;
  for (const [k, v] of Object.entries(o.parametri ?? {})) {
    cale = cale.replace(`{${k}}`, encodeURIComponent(String(v)));
  }
  if (/\{[a-z_]+\}/i.test(cale)) throw new Error(`parametru de cale lipsa in ${o.cale}`);
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(o.interogare ?? {})) {
    if (v === null || v === undefined || v === "") continue;
    q.set(k, String(v));
  }
  const sir = q.toString();
  return `${gazdaEasySales()}${PREFIX_API}${cale}${sir ? `?${sir}` : ""}`;
}

/** Corpul trimis: `website_token` la radacina numai unde e cerut, fara sa suprascrie unul dat. */
export function corpulTrimis(o: OptiuniCerere, cfg: EasySalesConfig): string | undefined {
  if (o.corp == null) return undefined;
  const corp: Record<string, unknown> = { ...o.corp };
  if (o.cuWebsiteToken && cfg.website_token && corp.website_token === undefined) {
    corp.website_token = cfg.website_token;
  }
  return JSON.stringify(corp);
}

/** Cate milisecunde pana la minutul urmator, plus o secunda de siguranta. */
function panaLaMinutulUrmator(): number {
  return 60_000 - (Date.now() % 60_000) + 1000;
}

/** Pauza ceruta dupa un 429: `Retry-After`, apoi `X-RateLimit-Reset`, apoi 60 s. */
export function pauzaDupa429(antete: Headers, acumMs = Date.now()): number {
  if (antete.get("retry-after")) return asteptareaCerutaDeEi(antete, 60_000);
  const reset = Number(antete.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    /* Epoch in secunde (Laravel) sau secunde ramase: nedocumentat (ES-13). */
    const ms = reset > 1e9 ? reset * 1000 - acumMs : reset * 1000;
    if (ms > 0 && ms <= 10 * 60_000) return ms;
  }
  return 60_000;
}

interface Incercare {
  status: number;
  corp: unknown;
  antete: Headers | null;
  cadere: unknown;
  durataMs: number;
}

async function faCererea(url: string, metoda: Metoda, token: string, corp: string | undefined, termenMs: number): Promise<Incercare> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: metoda,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: corp,
      signal: AbortSignal.timeout(termenMs),
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try { json = JSON.parse(text); } catch { json = null; }
    }
    return { status: res.status, corp: json, antete: res.headers, cadere: null, durataMs: Date.now() - start };
  } catch (e) {
    return { status: 0, corp: null, antete: null, cadere: e, durataMs: Date.now() - start };
  }
}

function ramaseDin(antete: Headers | null): number | null {
  const v = antete?.get("x-ratelimit-remaining");
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** `data` din plicul lor, sau corpul intreg cand nu e plic. */
function dateDin(corp: unknown): unknown {
  if (corp && typeof corp === "object" && !Array.isArray(corp) && "data" in (corp as Record<string, unknown>)) {
    return (corp as Record<string, unknown>).data ?? null;
  }
  return corp ?? null;
}

/**
 * O revocare din afara: un 401 pe tokenul cel mai nou, fara o emitere proprie in ultimele 10
 * minute. Intoarce lista actualizata (ultimele 24 h) si daca trebuie ceruta reconectarea.
 */
export function numaraRevocarea(cfg: EasySalesConfig, acumMs = Date.now()): { lista: string[]; reconectare: boolean } {
  const zi = 24 * 60 * 60 * 1000;
  const vechi = (cfg.revocari_neexplicate ?? []).filter((t) => {
    const ms = Date.parse(t);
    return Number.isFinite(ms) && acumMs - ms < zi;
  });
  const lista = [...vechi, new Date(acumMs).toISOString()];
  return { lista, reconectare: lista.length >= 2 };
}

export const MESAJ_CLIENT_FOLOSIT_DE_ALTUL =
  "Clientul API e folosit și de alt program, care îl revocă. Creează în easySales un client dedicat Edinio („Website Grant”) și reconectează.";

/**
 * O cerere catre easySales.
 *
 * ⚠ Nu arunca la raspunsurile lor: intoarce verdictul. Arunca numai la o eroare de programare
 * (parametru de cale lipsa).
 */
export async function cerereEasySales<T = unknown>(ctx: ContextEasySales, o: OptiuniCerere): Promise<Raspuns<T>> {
  const scriere = o.scriere ?? o.metoda !== "GET";
  const url = adresaCererii(o);
  const termen = o.inBloc ? TERMEN_BLOC_MS : TERMEN_SIMPLU_MS;

  const tok: RezultatToken = ctx.faraEmitere
    ? (ctx.cfg.access_token ? { ok: true, token: ctx.cfg.access_token, cfg: ctx.cfg } : { ok: false, motiv: "configurare", mesaj: "Nu există un token salvat.", reconectare: false })
    : await asiguraToken(ctx.dep, ctx.businessId, ctx.cfg);
  if (!tok.ok) {
    const c: Clasificare = { verdict: tok.motiv === "trecatoare" || tok.motiv === "ocupat" ? "trecatoare" : "neautorizat", mesaj: tok.mesaj, campuri: [] };
    await jurnalizeaza(ctx, o, scriere, { status: 0, corp: null, antete: null, cadere: null, durataMs: 0 }, c, `token:${tok.motiv}`);
    return { ok: false, status: 0, date: null, corp: null, ramase: null, ...c };
  }
  ctx.cfg = tok.cfg;

  const incearca = async (token: string) => {
    await asteaptaJetonImpartit(cheiaDeRitm(ctx.cfg), BUGET_PE_MINUT, 60_000, "easysales");
    return faCererea(url, o.metoda, token, corpulTrimis(o, ctx.cfg), termen);
  };

  let tokenFolosit = tok.token;
  let versiuneFolosita = Number(ctx.cfg.token_versiune) || 0;
  let inc = await incearca(tokenFolosit);
  let c = inc.status === 0 ? clasificaCaderea(scriere, inc.cadere) : clasificaRaspuns({ status: inc.status, corp: inc.corp });

  if (c.verdict === "neautorizat" && !ctx.faraEmitere) {
    /* 1. Poate s-a emis deja un token mai nou de catre alt fir: se reia cu el, fara emitere. */
    let proaspat: EasySalesConfig | null = null;
    try { proaspat = await ctx.dep.citesteConfig(ctx.businessId); } catch { proaspat = null; }

    if (proaspat && (Number(proaspat.token_versiune) || 0) > versiuneFolosita && proaspat.access_token) {
      ctx.cfg = proaspat;
      tokenFolosit = proaspat.access_token;
      versiuneFolosita = Number(proaspat.token_versiune) || 0;
      await jurnalizeaza(ctx, o, scriere, inc, c, "401:token-vechi");
      inc = await incearca(tokenFolosit);
      c = inc.status === 0 ? clasificaCaderea(scriere, inc.cadere) : clasificaRaspuns({ status: inc.status, corp: inc.corp });
    } else if (proaspat) {
      /* 2. Tokenul cel mai nou a fost revocat. De noi (o emitere a noastra recenta) sau din afara? */
      const acum = Date.now();
      const emitereProprie = proaspat.emitere_incercata_la ? acum - Date.parse(proaspat.emitere_incercata_la) < PAUZA_REEMITERE_MS : false;
      if (!emitereProprie) {
        const { lista, reconectare } = numaraRevocarea(proaspat, acum);
        await ctx.dep.peticConfig(ctx.businessId, reconectare
          ? { revocari_neexplicate: lista, needs_reconnect: true, motiv_reconectare: MESAJ_CLIENT_FOLOSIT_DE_ALTUL }
          : { revocari_neexplicate: lista });
        if (reconectare) {
          await logError({
            action: "easysales.token", severity: "error", businessId: ctx.businessId,
            message: "a doua revocare neexplicata in 24 de ore: clientul API e folosit si de alt program",
          });
        }
      }
      const ultimaReemitere = proaspat.reemitere_401_la ? Date.parse(proaspat.reemitere_401_la) : 0;
      if (acum - ultimaReemitere >= PAUZA_REEMITERE_MS) {
        await ctx.dep.peticConfig(ctx.businessId, { reemitere_401_la: new Date(acum).toISOString() });
        await jurnalizeaza(ctx, o, scriere, inc, c, "401:reemitere");
        const nou = await emiteToken(ctx.dep, ctx.businessId, proaspat);
        if (nou.ok) {
          ctx.cfg = nou.cfg;
          tokenFolosit = nou.token;
          inc = await incearca(tokenFolosit);
          c = inc.status === 0 ? clasificaCaderea(scriere, inc.cadere) : clasificaRaspuns({ status: inc.status, corp: inc.corp });
        } else if (nou.reconectare) {
          await ctx.dep.peticConfig(ctx.businessId, { needs_reconnect: true, motiv_reconectare: nou.mesaj });
        }
      }
    }
  }

  const ramase = ramaseDin(inc.antete);
  if (inc.status === 429 && inc.antete) {
    await spunePauza(cheiaDeRitm(ctx.cfg), pauzaDupa429(inc.antete), "easysales");
  } else if (ramase !== null && ramase < PRAG_RAMASE) {
    /* ⚠ Restul bugetului lor e al celorlalte programe ale comerciantului: ne oprim pana la minutul urmator. */
    await spunePauza(cheiaDeRitm(ctx.cfg), panaLaMinutulUrmator(), "easysales");
  }

  if (c.anomalie) {
    await logError({
      action: "easysales.client", severity: "warning", businessId: ctx.businessId,
      message: `raspuns in afara formelor documentate (${c.anomalie}) la ${o.metoda} ${o.cale}`,
    });
  }
  await jurnalizeaza(ctx, o, scriere, inc, c, null);

  return {
    ok: c.verdict === "reusit",
    status: inc.status,
    date: (c.verdict === "reusit" ? dateDin(inc.corp) : null) as T | null,
    corp: inc.corp,
    ramase,
    ...c,
  };
}

async function jurnalizeaza(
  ctx: ContextEasySales, o: OptiuniCerere, scriere: boolean, inc: Incercare, c: Clasificare, cod: string | null,
): Promise<void> {
  /* Citirile reusite nu se scriu: ar fi zeci de mii de randuri pe zi din care niciunul nu spune nimic. */
  if (!scriere && c.verdict === "reusit") return;
  await ctx.dep.scrieJurnal({
    business_id: ctx.businessId,
    corelatie: ctx.corelatie ?? null,
    metoda: o.metoda,
    cale: o.cale,
    status: inc.status,
    verdict: c.verdict,
    durata_ms: inc.durataMs,
    rata_ramasa: ramaseDin(inc.antete),
    cod,
    /* Mesajul LOR, scurt. Mesajele de validare vorbesc despre campuri, nu despre oameni. */
    mesaj: c.verdict === "reusit" ? null : (c.campuri.length ? c.campuri.slice(0, 3).join("; ") : c.mesaj || null),
  });
}
