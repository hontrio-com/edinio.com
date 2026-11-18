import "server-only";
import { contacteleMele } from "@/lib/cont/date";
import { apeleaza } from "./client";
import { modulPornit } from "./config";
import { citesteConfig } from "./server";

/*
  Punctele de fidelitate si codurile primite, pentru contul cumparatorului din magazin.

  Specul: developers.themarketer.com/reference/get_api-v1-loyalty-info si /get_api-v1-get-available-coupons.
  Amandoua cer emailul contactului. Se intreaba NUMAI dupa adresele VERIFICATE ale contului: o adresa
  adaugata si neconfirmata ar fi aratat punctele altui om.

  ⚠ TERMEN SCURT si nicio eroare spre om: pagina contului nu are voie sa astepte dupa theMarketer. Orice
  pana inseamna doar ca acel card nu apare.
*/

export type CodPrimit = { cod: string; valoare: string; tip: string; expira: string | null; campanie: string | null };

export type FidelitateCont = {
  puncte: number;
  nivel: string | null;
  nivelUrmator: string | null;
  /** Cate puncte mai lipsesc pana la nivelul urmator, cand se poate socoti. */
  panaLaUrmator: number | null;
  expiraCurand: number;
  coduri: CodPrimit[];
};

const TERMEN_MS = 3500;

function numar(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : null;
}

/** Raspunsul `loyalty_info`, in forma ecranului. `null` = omul nu e in program. Pura. */
export function fidelitateDinRaspuns(json: unknown): Omit<FidelitateCont, "coduri"> | null {
  const s = (json as { stats?: Record<string, unknown> } | null)?.stats;
  if (!s || s.membership === false) return null;
  const puncte = numar(s.current_points);
  if (puncte === null) return null;
  const capat = numar(s.current_tier_points_end);
  const urmator = text(s.next_tier);
  return {
    puncte: Math.max(0, Math.floor(puncte)),
    nivel: text(s.current_tier),
    nivelUrmator: urmator,
    panaLaUrmator: urmator && capat !== null ? Math.max(0, Math.floor(capat + 1 - puncte)) : null,
    expiraCurand: Math.max(0, Math.floor(numar(s.points_about_to_expire) ?? 0)),
  };
}

/** Raspunsul `get_available_coupons`. Pura. */
export function coduriDinRaspuns(json: unknown): CodPrimit[] {
  if (!Array.isArray(json)) return [];
  const iesire: CodPrimit[] = [];
  for (const brut of json.slice(0, 10)) {
    const c = (brut ?? {}) as Record<string, unknown>;
    const cod = text(c.code);
    if (!cod || !/^[A-Za-z0-9_-]{3,60}$/.test(cod)) continue;
    iesire.push({
      cod,
      valoare: text(c.value) ?? String(numar(c.value) ?? ""),
      tip: text(c.type) ?? "",
      expira: text(c.expire),
      campanie: text(c.campaign_name),
    });
  }
  return iesire;
}

export async function fidelitateaContului(businessId: string, contId: string): Promise<FidelitateCont | null> {
  try {
    const config = await citesteConfig(businessId);
    if (!modulPornit(config, "fidelitate")) return null;
    const emailuri = (await contacteleMele(businessId, contId))
      .filter((c) => c.fel === "email" && c.verificat)
      .map((c) => c.valoare)
      .slice(0, 2);
    for (const email of emailuri) {
      const [info, coduri] = await Promise.all([
        apeleaza(config!, "GET", "loyalty_info", { email }, { termenMs: TERMEN_MS }),
        apeleaza(config!, "GET", "get_available_coupons", { email }, { termenMs: TERMEN_MS }),
      ]);
      const f = info.ok ? fidelitateDinRaspuns(info.json) : null;
      const c = coduri.ok ? coduriDinRaspuns(coduri.json) : [];
      if (f || c.length > 0) {
        return { ...(f ?? { puncte: 0, nivel: null, nivelUrmator: null, panaLaUrmator: null, expiraCurand: 0 }), coduri: c };
      }
    }
    return null;
  } catch {
    return null;
  }
}
