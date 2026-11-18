import "server-only";
import { asteptareDupa429, REINCERCARI_429 } from "@/lib/email-marketing/transport";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CLIENTUL API-ULUI REST THEMARKETER (`https://t.themarketer.com/api/v1/`)
  ═══════════════════════════════════════════════════════════════════════════════

  Autentificarea e in PARAMETRI, nu in antet: `k` (cheia REST, secreta) si `u` (Customer ID). De aici
  doua reguli:
    - la POST, `k` si `u` pleaca in CORP, nu in adresa. Specul lor (developers.themarketer.com) le
      declara „in: query”, dar serverul e Laravel si citeste la fel corpul de formular; pluginul lor
      oficial de WooCommerce trimite tot in corp (`wp_remote_post` cu `body`). O adresa ajunge in
      jurnalele oricarui proxy de pe drum; corpul, nu;
    - la GET nu exista corp, deci cheia sta in adresa. Rutele GET sunt dictate de ei (un POST pe
      `update_order_status` da 405, masurat pe 18.11.2026).

  ⚠ FARA REDIRECTARI. O redirectare ar duce cheia REST la alta gazda.

  ═══ CE INSEAMNA STATUSURILE (masurat pe 18.11.2026 cu chei inventate, plus specul lor) ═══

    404 „Customer not found.” / „No query results for model [App\\Models\\System\\Domain] …”
        Customer ID-ul nu exista. Unele rute raspund aici cu o PAGINA HTML de 404, nu cu JSON
        (`unsubscribed_emails`, `remove_subscriber`, `product_reviews`): statusul decide, nu corpul;
    401 „Invalid REST Key.”, dar si erori de VALIDARE: `add_subscriber` fara email a raspuns 401
        „The email field is required.”, iar `reports/get-audience` 401 „The selected type is invalid.”
        Deci 401 NU inseamna mereu cheie gresita; mesajul spune care e;
    400 „Customer ID not provided.” / „REST Key not provided.”;
    422 validare (`save_order`: „One of the following required attributes is empty: …”);
    405 metoda gresita: o greseala a NOASTRA, nu a comerciantului.

  Toate cele de mai sus sunt REFUZURI: o reincercare primeste acelasi raspuns. Se reia numai ce n-a
  primit raspuns (retea, termen), 5xx si 429.
*/

export const ADRESA_API = "https://t.themarketer.com/api/v1/";
/** Scriptul de urmarire; raspunde 200 la o cheie buna si 404 la una gresita (masurat). */
export const ADRESA_SCRIPT = "https://t.themarketer.com/t/j/";

export const TERMEN_MS = 10_000;

export type Acreditari = { customer_id: string; rest_key: string };

export type ParametriTM = Record<string, unknown>;

export type RaspunsTM = { status: number; text: string; json: unknown; tip: string };

export type RezultatTM =
  | { ok: true; status: number; json: unknown; text: string }
  | { ok: false; status?: number; mesaj: string; fel: FelEroare; brut?: string | null };

/**
 * De ce a cazut un apel, pe intelesul codului care hotaraste ce urmeaza:
 * - `acreditari`: Customer ID sau cheia REST gresite. Nimic nu merge pana le repara omul;
 * - `refuz`: datele noastre au fost respinse (validare, metoda). Reluarea da acelasi raspuns;
 * - `limita`: 429, mai tarziu;
 * - `server`: 5xx;
 * - `retea`: niciun raspuns (termen, DNS, redirectare refuzata). Cererea poate sa fi ajuns.
 */
export type FelEroare = "acreditari" | "refuz" | "limita" | "server" | "retea";

/* ───────────────────────── codarea parametrilor ───────────────────────── */

/**
 * Parametrii in forma PHP pe care o citeste Laravel: `products[0][product_id]=…`, `attributes[oras]=…`.
 * Asa ii trimite si pluginul lor (`http_build_query`). `undefined` si `null` nu pleaca deloc: un camp
 * gol trimis ca „null” ar fi scris textual in contul comerciantului.
 */
export function parametriFormular(p: ParametriTM, prefix = ""): [string, string][] {
  const iesire: [string, string][] = [];
  for (const [cheie, valoare] of Object.entries(p)) {
    const nume = prefix ? `${prefix}[${cheie}]` : cheie;
    if (valoare === undefined || valoare === null) continue;
    if (Array.isArray(valoare)) {
      valoare.forEach((v, i) => {
        if (v !== null && typeof v === "object") iesire.push(...parametriFormular(v as ParametriTM, `${nume}[${i}]`));
        else if (v !== undefined && v !== null) iesire.push([`${nume}[${i}]`, scalar(v)]);
      });
    } else if (typeof valoare === "object") {
      iesire.push(...parametriFormular(valoare as ParametriTM, nume));
    } else {
      iesire.push([nume, scalar(valoare)]);
    }
  }
  return iesire;
}

function scalar(v: unknown): string {
  if (typeof v === "boolean") return v ? "1" : "0";
  return String(v);
}

function codeaza(perechi: [string, string][]): string {
  return perechi.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

/* ───────────────────────── mesajele lor ───────────────────────── */

function mesajDinJson(json: unknown): string | null {
  if (json && typeof json === "object" && "message" in json) {
    const m = (json as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return null;
}

const CLIENT_NEGASIT = /customer not found|no query results for model/i;
const CHEIE_GRESITA = /invalid rest key|rest key not provided|customer id not provided/i;

/**
 * Felul unui raspuns cu eroare, dupa status si dupa mesajul lor. Pura.
 *
 * ⚠ 401 se citeste dupa MESAJ: „Invalid REST Key.” e o cheie gresita, „The email field is required.”
 * e o validare a datelor noastre.
 */
/** Raspunsul spune ca CONTUL (Customer ID) nu exista, nu ca lipseste ceva din el. */
export function contulNuExista(status: number | undefined, mesaj: string | null | undefined): boolean {
  return status === 404 && (!mesaj || CLIENT_NEGASIT.test(mesaj));
}

export function felulErorii(status: number, mesaj: string | null): FelEroare {
  if (status === 429) return "limita";
  if (status >= 500) return "server";
  if (status === 408) return "retea";
  if (status === 404) return "acreditari";
  if (status === 401 || status === 400) {
    if (mesaj && CHEIE_GRESITA.test(mesaj)) return "acreditari";
    return mesaj ? "refuz" : "acreditari";
  }
  return "refuz";
}

/** Mesajul pentru om, in romana. Pur. */
export function mesajPentruOm(status: number | undefined, mesaj: string | null, fel: FelEroare): string {
  switch (fel) {
    case "retea":
      return "theMarketer nu a răspuns la timp. Încearcă din nou peste câteva minute.";
    case "limita":
      return "theMarketer a cerut o pauză (prea multe cereri). Se reîncearcă automat.";
    case "server":
      return `theMarketer are o problemă temporară (eroare ${status}). Se reîncearcă automat.`;
    case "acreditari":
      if (status === 404 || (mesaj && CLIENT_NEGASIT.test(mesaj))) {
        return "theMarketer nu găsește contul: verifică Customer ID-ul (Settings → Technical Integration).";
      }
      return "Cheia REST API nu e bună: copiaz-o din nou din theMarketer (Settings → Technical Integration).";
    case "refuz":
      return mesaj ? `theMarketer a refuzat cererea: ${mesaj}` : `theMarketer a refuzat cererea (eroare ${status}).`;
  }
}

/* ───────────────────────── transportul ───────────────────────── */

const dormiImplicit = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type OptiuniCerere = {
  termenMs?: number;
  /** Doar pentru probe. */
  fetchImpl?: typeof fetch;
  dormi?: (ms: number) => Promise<void>;
};

/**
 * O cerere bruta: termen, fara redirectari, reluata numai la 429 (care inseamna „n-am facut nimic”,
 * deci e sigura si pentru un POST). O cadere de retea NU se reia aici: un `save_order` repetat ar
 * putea dubla o comanda; reluarea o hotaraste coada, cu ritmul ei.
 */
export async function cerereBruta(
  url: string,
  init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string },
  optiuni: OptiuniCerere = {},
): Promise<RaspunsTM | { retea: true }> {
  const f = optiuni.fetchImpl ?? fetch;
  const dormi = optiuni.dormi ?? dormiImplicit;
  for (let incercarea = 0; ; incercarea++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), optiuni.termenMs ?? TERMEN_MS);
    let res: Response;
    let text: string;
    try {
      res = await f(url, {
        method: init.method,
        headers: { Accept: "application/json, text/xml;q=0.9, */*;q=0.1", ...init.headers },
        body: init.body,
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      text = await res.text();
    } catch {
      clearTimeout(timer);
      return { retea: true };
    }
    clearTimeout(timer);
    if (res.status === 429 && incercarea < REINCERCARI_429) {
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
    return { status: res.status, text, json, tip: res.headers.get("content-type") ?? "" };
  }
}

/**
 * Un apel catre API-ul REST. Nu arunca.
 *
 * `cale` e partea de dupa `/api/v1/` (de ex. `save_order`, `reports/get-email-campaigns`).
 */
export async function apeleaza(
  acreditari: Acreditari,
  metoda: "GET" | "POST",
  cale: string,
  parametri: ParametriTM = {},
  optiuni: OptiuniCerere = {},
): Promise<RezultatTM> {
  const auth = { k: acreditari.rest_key.trim(), u: acreditari.customer_id.trim() };
  if (!auth.k || !auth.u) {
    return { ok: false, mesaj: "Lipsesc cheile theMarketer (Customer ID și REST API Key).", fel: "acreditari" };
  }
  const perechi = parametriFormular({ ...auth, ...parametri });
  const r = metoda === "GET"
    ? await cerereBruta(`${ADRESA_API}${cale}?${codeaza(perechi)}`, { method: "GET" }, optiuni)
    : await cerereBruta(`${ADRESA_API}${cale}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: codeaza(perechi),
      }, optiuni);

  if ("retea" in r) return { ok: false, mesaj: mesajPentruOm(undefined, null, "retea"), fel: "retea" };
  if (r.status >= 200 && r.status < 300) return { ok: true, status: r.status, json: r.json, text: r.text };
  const mesaj = mesajDinJson(r.json);
  const fel = felulErorii(r.status, mesaj);
  return { ok: false, status: r.status, mesaj: mesajPentruOm(r.status, mesaj, fel), fel, brut: mesaj };
}

/* ───────────────────────── proba de conexiune ───────────────────────── */

/** Ziua de azi in Romania, `YYYY-MM-DD`: `unsubscribed_emails` cere zile, nu clipe. */
function ziuaDeAzi(acum: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(acum);
}

export type RezultatProba =
  | { ok: true }
  | { ok: false; camp: "tracking_key" | "customer_id" | "rest_key" | null; mesaj: string };

/**
 * Verifica toate cele trei chei, fara sa scrie nimic in contul comerciantului:
 *   1. cheia de urmarire: scriptul lor raspunde 404 la o cheie gresita. ⚠⚠ La una BUNA raspunde 403 de aici:
 *      theMarketer da scriptul numai pe domeniile contului (primar + „Extra domains”), iar cererea noastra,
 *      de pe server, n-are domeniu. Masurat pe 18.11.2026 cu cheia publica a unui client real: 403 cerut
 *      direct, 200 si `__sm__tracking_loaded` pe site-ul lui. Domeniul nu se poate verifica de aici (ar
 *      cere un `Referer` mintit), deci panoul il spune omului;
 *   2. Customer ID + cheia REST: o citire de dezabonati pe o singura zi (`unsubscribed_emails`, ruta
 *      prezenta pe toate planurile lor). 200 = amandoua bune.
 */
export async function testeazaConexiunea(
  chei: { tracking_key: string; customer_id: string; rest_key: string },
  optiuni: OptiuniCerere & { acum?: Date } = {},
): Promise<RezultatProba> {
  const script = await cerereBruta(`${ADRESA_SCRIPT}${encodeURIComponent(chei.tracking_key)}`, { method: "GET" }, { ...optiuni, termenMs: optiuni.termenMs ?? 8000 });
  if ("retea" in script) return { ok: false, camp: null, mesaj: mesajPentruOm(undefined, null, "retea") };
  if (script.status === 404) {
    return { ok: false, camp: "tracking_key", mesaj: "Tracking Key-ul nu e bun: theMarketer nu are niciun script pentru el." };
  }
  if (script.status >= 500) return { ok: false, camp: null, mesaj: mesajPentruOm(script.status, null, "server") };
  /* 403 = cheie cunoscuta, ceruta din afara domeniilor contului (adica de aici). Vezi mai sus. */
  if (script.status !== 200 && script.status !== 403) {
    return { ok: false, camp: "tracking_key", mesaj: `Scriptul theMarketer a răspuns neașteptat (eroare ${script.status}).` };
  }

  const zi = ziuaDeAzi(optiuni.acum ?? new Date());
  const r = await apeleaza(chei, "GET", "unsubscribed_emails", { date_from: zi, date_to: zi }, { ...optiuni, termenMs: optiuni.termenMs ?? 8000 });
  if (r.ok) {
    /* Raspunsul bun e o lista de adrese. Orice altceva cu 200 e o pagina de undeva, nu API-ul lor. */
    if (Array.isArray(r.json)) return { ok: true };
    return { ok: false, camp: null, mesaj: "theMarketer a răspuns, dar nu cu ce ne așteptam. Încearcă din nou." };
  }
  if (r.fel === "acreditari") {
    return { ok: false, camp: r.status === 404 ? "customer_id" : "rest_key", mesaj: r.mesaj };
  }
  return { ok: false, camp: null, mesaj: r.mesaj };
}
