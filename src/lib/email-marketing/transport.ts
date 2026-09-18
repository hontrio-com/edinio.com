/*
  ═══════════════════════════════════════════════════════════════════════════════
  TRANSPORTUL COMUN AL CELOR TREI FURNIZORI DE EMAIL (Mailchimp, Brevo, Klaviyo)
  ═══════════════════════════════════════════════════════════════════════════════

  Pana pe 18.09.2026 numai Mailchimp avea termen si interzicerea redirectarilor.
  Brevo si Klaviyo chemau `fetch` gol: un furnizor care nu raspunde tinea apelul
  deschis la nesfarsit, iar o redirectare ar fi dus cheia API (din antet) la alta
  gazda. Si niciunul nu stia ce e un `429`.

  ⚠ 429 NU E O EROARE DE DATE, e un „mai incearca”. Limitele lor sunt mici:
  Brevo, pe planul gratuit, primeste 2 cereri pe secunda la `POST /v3/products` si
  10 la contacte; Klaviyo 75/s si 700-750/min la catalog si la abonari. O bucla de
  sincronizare produs cu produs le depaseste in cateva secunde, iar pana acum prima
  respingere oprea tot lotul.

  ⚠ SE REIA NUMAI 429. Un `429` inseamna „n-am facut nimic”, deci repetarea e
  sigura si pentru un POST. O cadere de retea sau un termen depasit NU se reiau:
  cererea poate sa fi ajuns, iar un POST repetat poate dubla o comanda.

  Cat se asteapta: `Retry-After` (standard, Klaviyo il trimite), apoi
  `x-sib-ratelimit-reset` (Brevo, in secunde, vezi developers.brevo.com/docs/limit-headers),
  altfel 1s, apoi 2s. Peste `ASTEPTARE_MAXIMA_MS` nu se mai asteapta deloc: o
  limita pe ORA nu se rezolva stand pe loc intr-o functie serverless.
*/

export const TERMEN_MS = 15_000;
export const REINCERCARI_429 = 2;
export const ASTEPTARE_MAXIMA_MS = 10_000;

export interface RaspunsExtern {
  status: number;
  ok: boolean;
  json: unknown;
}

export type RezultatExtern = { raspuns: RaspunsExtern } | { retea: true };

/**
 * Cat asteptam dupa un 429, in milisecunde, sau `null` daca furnizorul cere mai
 * mult decat putem sta pe loc.
 */
export function asteptareDupa429(antete: Headers, incercarea: number, acum: number = Date.now()): number | null {
  const retry = antete.get("retry-after")?.trim();
  if (retry) {
    const secunde = Number(retry);
    if (Number.isFinite(secunde) && secunde >= 0) {
      const ms = Math.ceil(secunde * 1000);
      return ms <= ASTEPTARE_MAXIMA_MS ? ms : null;
    }
    const cand = Date.parse(retry);
    if (Number.isFinite(cand)) {
      const ms = Math.max(0, cand - acum);
      return ms <= ASTEPTARE_MAXIMA_MS ? ms : null;
    }
  }
  const reset = antete.get("x-sib-ratelimit-reset")?.trim();
  if (reset) {
    const secunde = Number(reset);
    if (Number.isFinite(secunde) && secunde >= 0) {
      const ms = Math.ceil(secunde * 1000);
      return ms <= ASTEPTARE_MAXIMA_MS ? ms : null;
    }
  }
  return 1000 * 2 ** incercarea;
}

const dormiImplicit = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * O cerere catre un furnizor de email: termen, fara redirectari, reluata la 429.
 *
 * Intoarce `{ retea: true }` cand nu s-a primit niciun raspuns (termen, DNS,
 * redirectare refuzata), altfel statusul si corpul citit ca JSON (sau `null`).
 */
export async function cerereExterna(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  optiuni: { termenMs?: number; reincercari?: number; dormi?: (ms: number) => Promise<void> } = {},
): Promise<RezultatExtern> {
  const termen = optiuni.termenMs ?? TERMEN_MS;
  const reincercari = optiuni.reincercari ?? REINCERCARI_429;
  const dormi = optiuni.dormi ?? dormiImplicit;

  for (let incercarea = 0; ; incercarea++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), termen);
    let res: Response;
    try {
      res = await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      return { retea: true };
    }

    let text = "";
    try {
      text = await res.text();
    } catch {
      clearTimeout(timer);
      return { retea: true };
    }
    clearTimeout(timer);

    if (res.status === 429 && incercarea < reincercari) {
      const ms = asteptareDupa429(res.headers, incercarea);
      if (ms !== null) {
        await dormi(ms);
        continue;
      }
    }

    let json: unknown = null;
    if (text) {
      try { json = JSON.parse(text); } catch { json = null; }
    }
    return { raspuns: { status: res.status, ok: res.ok, json } };
  }
}
