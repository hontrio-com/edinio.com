import { sarcinaMeta, eRefuzMeta } from "./sarcina-meta";
import { ID_PIXEL_META } from "../pixel-meta";
import type { SarcinaPastrata } from "./coada-conversii";
import type { Rezultat } from "./trimite-tiktok";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  TRIMITEREA CATRE META CONVERSIONS API
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ TOKENUL PLEACA IN CORP, nu in adresa. In query string ar ajunge in jurnalele
  de acces ale oricui sta pe drum, si in ale lor.
*/

const VERSIUNE = "v21.0";

function adresa(pixel: string): string {
  return `https://graph.facebook.com/${VERSIUNE}/${pixel}/events`;
}

type RaspunsMeta = {
  events_received?: number;
  messages?: unknown[];
  error?: { message?: string; code?: number; error_subcode?: number; type?: string };
};

/*
  ⚠ CE E DE REINCERCAT SI CE NU.

  Un drept lipsa sau un mesaj stricat dau acelasi raspuns oricat s-ar reincerca —
  deci reincercarea ar fi doar zgomot pana la abandon, iar motivul adevarat s-ar
  pierde in spatele ultimei incercari. O limitare sau o pana de-a lor trec.

  ⚠ TOKENUL LIPSA E ALTCEVA DECAT TOKENUL GRESIT. Lipsa inseamna configuratie
  neterminata — se repara punand o variabila, deci merita asteptat. Gresit
  inseamna ca cineva trebuie sa faca altul; e tot configuratie, dar pana atunci
  nicio reincercare nu ajuta. Amandoua raman esecuri, nu refuzuri, fiindca
  amandoua se pot repara FARA sa se schimbe mesajul.
*/
const PERMANENTE = new Set([
  100,  // parametru gresit — mesajul nostru
  102,  // sesiune
  2500, // camp necunoscut
]);

export async function trimiteMeta(s: SarcinaPastrata): Promise<Rezultat> {
  const token = process.env.META_CAPI_TOKEN?.trim();
  if (!token) return { fel: "esec", motiv: "META_CAPI_TOKEN lipseste" };

  const mesaj = sarcinaMeta(s.ev, s.ctx, ID_PIXEL_META, s.amprentaOmului, s.cand);
  if (eRefuzMeta(mesaj)) return { fel: "refuzat", motiv: mesaj.motiv };

  let raspuns: Response;
  try {
    raspuns = await fetch(adresa(ID_PIXEL_META), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...mesaj, access_token: token }),
      cache: "no-store",
    });
  } catch (e) {
    return { fel: "esec", motiv: e instanceof Error ? e.message : "reteaua a cazut" };
  }

  let corp: RaspunsMeta = {};
  try {
    corp = (await raspuns.json()) as RaspunsMeta;
  } catch {
    return { fel: "esec", motiv: `raspuns necitibil (HTTP ${raspuns.status})` };
  }

  /*
    ⚠ MARTORUL E `events_received`, NU CODUL HTTP si nici lipsa unei erori. Un
    corp fara `error` si fara `events_received` nu spune ca a ajuns ceva — spune
    doar ca n-a explodat. Lectia de la TikTok, unde HTTP 200 acoperea un refuz.
  */
  if (!corp.error && typeof corp.events_received === "number" && corp.events_received > 0) {
    return { fel: "trimis" };
  }

  const cod = corp.error?.code;
  const motiv = `code ${cod ?? "?"}${corp.error?.error_subcode ? `/${corp.error.error_subcode}` : ""}: ${
    corp.error?.message ?? `fara eroare, dar events_received=${corp.events_received ?? "lipsa"}`
  }`;

  /*
    ⚠ 190 (token nevalid) SI 200/10 (drept lipsa) NU SUNT REFUZURI. Asa arata azi
    tokenul nostru, caruia ii lipseste `ads_management`. Marcate permanent, toate
    conversiile s-ar abandona pe loc, si in clipa in care tokenul devine bun
    n-ar mai fi nimic de trimis.
  */
  return PERMANENTE.has(cod ?? -1) ? { fel: "refuzat", motiv } : { fel: "esec", motiv };
}
