import { ProxyAgent, fetch as fetchUndici } from "undici";
import { adresaApiTbi, type ProdusFinantareTbi, type TbiConfig } from "./config";
import { cripteazaPentruTbi } from "./cripto";
import type { CerereTbi } from "./cerere";

/**
 * Apelurile catre tbi Fusion Pay. Numai pe server.
 *
 * ═══ FORMA CERERILOR (documentatia „RO Fusion Pay" + masuratori pe serverul de test, 16.11.2026) ═══
 *
 * Toate sunt POST cu JSON. `reseller_code` si `reseller_key` pleaca in clar in fiecare; ce e despre
 * comanda pleaca CRIPTAT, in `data` (vezi `cripto.ts`):
 *
 *   GetCalculations       { reseller_code, reseller_key }                     -> produsele de finantare
 *   RegisterApplication   { reseller_code, reseller_key, data }               -> { error: 0, order_id, token, url }
 *   GetApplicationStatus  { reseller_code, reseller_key, order_id, token }    -> { error: 0, status, status_chain }
 *   loanCancellation      { ..., data: { platform, orderId, token, action: "cancel" } }  -> { error: 200 }
 *   loanRefund            { ..., data: { ..., action: "refund", type, amount, refundLink } } -> { error: 200 }
 *
 * ⚠ `order_id`/`orderId` din ultimele trei e id-ul dat de TBI la `RegisterApplication`, nu al nostru.
 *
 * ═══ RASPUNSURILE, CUM VIN DE FAPT ═══
 *
 * Codul din `error` vine si ca stare HTTP (401, 404, 207 masurate), iar reusita are `error: 0` la
 * inregistrare si `error: 200` la anulare si rambursare. ⚠ Cu `data` care nu se poate descifra sau
 * fara `items`, inregistrarea raspunde **204 fara corp**, nu 207/208 cum scrie documentatia; deci o
 * cheie de criptare gresita NU se poate deosebi acolo de o cerere incompleta. Se deosebeste la
 * anulare: o anulare pentru o cerere inexistenta da 404 cu cheia buna si 207 cu cea gresita, fara sa
 * atinga nimic la banca. Asa lucreaza `verificaLegatura`.
 *
 * ═══ RELEUL CU IP FIX (`TBI_PROXY_URL`) ═══
 *
 * Masurat 16.11.2026: si testul, si productia raspund public. Daca tbi cere vreodata o adresa fixa,
 * apelurile pot trece prin acelasi releu CONNECT ca eMAG (`scripts/emag-proxy/`), cu gazdele tbi
 * adaugate in lista lui, iar variabila se pune in Vercel. Nepusa, se iese direct.
 */

const TIMP_MAXIM_MS = 25_000;

type Credentiale = Pick<TbiConfig, "sandbox" | "reseller_code" | "reseller_key">;
type CredentialeCuCheie = Credentiale & Pick<TbiConfig, "cheie_criptare">;

type Iesire = { dispatcher: ProxyAgent | null; eroare: string | null };
let releuMemorat: ProxyAgent | null = null;
let adresaReleuMemorata: string | null = null;

function iesireTbi(): Iesire {
  const url = (process.env.TBI_PROXY_URL || "").trim();
  if (!url) return { dispatcher: null, eroare: null };
  if (url !== adresaReleuMemorata) {
    try {
      releuMemorat = new ProxyAgent(url);
      adresaReleuMemorata = url;
    } catch {
      releuMemorat = null;
      adresaReleuMemorata = null;
      return { dispatcher: null, eroare: "Adresa releului catre tbi (TBI_PROXY_URL) nu este valida." };
    }
  }
  return { dispatcher: releuMemorat, eroare: null };
}

type Raspuns = { status: number; corp: string; json: Record<string, unknown> | unknown[] | null };

/** Un apel. Arunca doar la retea / timp depasit; orice raspuns HTTP se intoarce, de citit de apelant. */
async function posteaza(cfg: Credentiale, metoda: string, corp: Record<string, unknown>): Promise<Raspuns> {
  const iesire = iesireTbi();
  if (iesire.eroare) throw new Error(iesire.eroare);
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ reseller_code: cfg.reseller_code, reseller_key: cfg.reseller_key, ...corp }),
    signal: AbortSignal.timeout(TIMP_MAXIM_MS),
  };
  const url = `${adresaApiTbi(cfg.sandbox)}/${metoda}`;
  const r = iesire.dispatcher
    ? await fetchUndici(url, { ...init, dispatcher: iesire.dispatcher })
    : await fetch(url, init);
  let text = "";
  try {
    text = await r.text();
  } catch {
    text = "";
  }
  return { status: r.status, corp: text, json: jsonDin(text) };
}

/**
 * JSON-ul din raspuns. ⚠ Serverul lor de test pune AVERTISMENTE PHP (HTML) inaintea JSON-ului cand
 * lipsesc campuri optionale (masurat: „Undefined property: stdClass::$firstname"), deci se cauta
 * obiectul de la primul `{`/`[` incolo, nu doar corpul intreg.
 */
function jsonDin(text: string): Raspuns["json"] {
  const t = text.trim();
  if (!t) return null;
  for (const start of [0, t.search(/[{[]/)]) {
    if (start < 0) continue;
    try {
      const v: unknown = JSON.parse(t.slice(start));
      if (v && typeof v === "object") return v as Raspuns["json"];
    } catch { /* urmatoarea forma */ }
  }
  return null;
}

/** Un fragment citibil din raspuns, pentru jurnal: fara HTML, scurt. Nu contine credentiale. */
function fragment(corp: string): string {
  return corp.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

function obiect(r: Raspuns): Record<string, unknown> | null {
  return r.json && !Array.isArray(r.json) ? r.json : null;
}

/** Codul `error` din raspuns, ca numar, sau `null`. */
function codEroare(r: Raspuns): number | null {
  const v = obiect(r)?.error;
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function mesajLor(r: Raspuns): string {
  const m = obiect(r)?.message;
  return typeof m === "string" ? m.trim().slice(0, 200) : "";
}

function esteTimp(e: unknown): boolean {
  return (e as { name?: string }).name === "TimeoutError";
}

const NU_RASPUNDE = "Nu am putut ajunge la tbi bank.";
const NU_LA_TIMP = "tbi bank nu a răspuns la timp.";

// ─── GetCalculations ─────────────────────────────────────────────────────────

export type RezultatProduse =
  | { fel: "ok"; produse: ProdusFinantareTbi[] }
  | { fel: "refuz"; mesaj: string; status: number }
  | { fel: "necunoscut"; mesaj: string; status: number };

function numarDin(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Produsele de finantare ale magazinului (perioade, dobanda, sume). Si dovada ca codul si cheia de reseller sunt bune. */
export async function produseleDeFinantare(cfg: Credentiale): Promise<RezultatProduse> {
  let r: Raspuns;
  try {
    r = await posteaza(cfg, "GetCalculations", {});
  } catch (e) {
    return { fel: "necunoscut", status: 0, mesaj: esteTimp(e) ? NU_LA_TIMP : NU_RASPUNDE };
  }
  if (r.status === 200 && Array.isArray(r.json)) {
    const produse = (r.json as Record<string, unknown>[])
      .filter((p) => p && typeof p === "object")
      .map((p) => ({
        id: numarDin(p.scheme_id),
        nume: typeof p.name === "string" ? p.name.trim().slice(0, 80) : "",
        luni: numarDin(p.period),
        dobanda: numarDin(p.nir),
        comision: numarDin(p.analysis_fee),
        sumaMin: numarDin(p.amount_min),
        sumaMax: numarDin(p.amount_max),
      }))
      .sort((a, b) => a.sumaMin - b.sumaMin || a.luni - b.luni);
    return { fel: "ok", produse };
  }
  if (r.status === 401 || codEroare(r) === 401) {
    return { fel: "refuz", status: 401, mesaj: "tbi bank nu recunoaște codul și cheia de reseller." };
  }
  if (r.status >= 400 && r.status < 500) {
    return { fel: "refuz", status: r.status, mesaj: mesajLor(r) || `tbi bank a refuzat cererea (HTTP ${r.status}).` };
  }
  return { fel: "necunoscut", status: r.status, mesaj: r.status >= 500 ? `tbi bank are o problemă temporară (HTTP ${r.status}).` : "tbi bank a răspuns într-o formă necunoscută." };
}

// ─── RegisterApplication ─────────────────────────────────────────────────────

export type MotivRefuz = "credentiale" | "cheie" | "suma" | "date" | "altul";

export type RezultatTrimitere =
  /** tbi a primit cererea: adresa paginii pe care o completeaza clientul, plus id-ul si jetonul lor. */
  | { fel: "trimisa"; adresa: string; idTbi: number; token: string }
  /** tbi a REFUZAT, dovedit. Nu s-a creat nimic; reincercarea are sens doar dupa o corectura. */
  | { fel: "refuz"; motiv: MotivRefuz; mesaj: string; status: number; detaliu: string }
  /** Nu stim: retea, timp depasit, 5xx, raspuns fara adresa. Cererea poate exista la ei. */
  | { fel: "necunoscut"; mesaj: string; status: number; detaliu: string };

/** Trimite cererea de finantare a unei comenzi. */
export async function trimiteCererea(cfg: CredentialeCuCheie, cerere: CerereTbi): Promise<RezultatTrimitere> {
  let r: Raspuns;
  try {
    r = await posteaza(cfg, "RegisterApplication", { data: cripteazaPentruTbi(JSON.stringify(cerere), cfg.cheie_criptare) });
  } catch (e) {
    return { fel: "necunoscut", status: 0, mesaj: esteTimp(e) ? NU_LA_TIMP : NU_RASPUNDE, detaliu: (e as Error).message?.slice(0, 300) ?? "" };
  }
  const o = obiect(r);
  const cod = codEroare(r);
  if (r.status >= 200 && r.status < 300 && cod === 0 && o) {
    const idTbi = numarDin(o.order_id);
    const token = typeof o.token === "string" ? o.token.trim() : "";
    let adresa: URL | null = null;
    try {
      adresa = typeof o.url === "string" ? new URL(o.url.trim()) : null;
    } catch {
      adresa = null;
    }
    if (adresa?.protocol === "https:" && idTbi > 0 && token) {
      return { fel: "trimisa", adresa: adresa.toString(), idTbi, token };
    }
    return { fel: "necunoscut", status: r.status, mesaj: "tbi bank a primit cererea, dar nu a întors o adresă sigură, un id sau un jeton.", detaliu: fragment(r.corp) };
  }

  const detaliu = fragment(r.corp);
  if (r.status === 401 || cod === 401) {
    return { fel: "refuz", motiv: "credentiale", status: 401, detaliu, mesaj: "tbi bank a respins codul și cheia de reseller." };
  }
  /* 204 fara corp: masurat, asa raspund la `data` care nu se poate descifra. Noi trimitem mereu
     `orderid` si `items`, deci la noi 204 inseamna cheia de criptare. */
  if (r.status === 204 || cod === 207) {
    return { fel: "refuz", motiv: "cheie", status: r.status, detaliu, mesaj: "tbi bank nu a putut descifra cererea: cheia de criptare nu se potrivește cu codul de reseller." };
  }
  if (cod === 210) {
    return { fel: "refuz", motiv: "suma", status: r.status, detaliu, mesaj: mesajLor(r) || "Suma comenzii e în afara limitelor de finanțare tbi bank." };
  }
  if (cod === 208 || cod === 209 || cod === 400) {
    return { fel: "refuz", motiv: "date", status: r.status, detaliu, mesaj: mesajLor(r) || "tbi bank a refuzat datele cererii." };
  }
  if (r.status >= 400 && r.status < 500) {
    return { fel: "refuz", motiv: "altul", status: r.status, detaliu, mesaj: mesajLor(r) || `tbi bank a refuzat cererea (HTTP ${r.status}).` };
  }
  return {
    fel: "necunoscut", status: r.status, detaliu,
    mesaj: r.status >= 500 ? `tbi bank are o problemă temporară (HTTP ${r.status}).` : "tbi bank nu a întors adresa paginii de cerere.",
  };
}

// ─── GetApplicationStatus ────────────────────────────────────────────────────

export type RezultatStare =
  | { fel: "ok"; stare: string; lant: { la: string; stare: string }[] }
  | { fel: "refuz"; mesaj: string; status: number }
  | { fel: "necunoscut"; mesaj: string; status: number };

/** Starea unei cereri, cum o scrie tbi („Plata TBI acceptata"). Vezi `stareaDinTextTbi`. */
export async function stareaCererii(cfg: Credentiale, idTbi: number, token: string): Promise<RezultatStare> {
  let r: Raspuns;
  try {
    r = await posteaza(cfg, "GetApplicationStatus", { order_id: idTbi, token });
  } catch (e) {
    return { fel: "necunoscut", status: 0, mesaj: esteTimp(e) ? NU_LA_TIMP : NU_RASPUNDE };
  }
  const o = obiect(r);
  if (r.status === 200 && codEroare(r) === 0 && o && typeof o.status === "string") {
    const lant = (Array.isArray(o.status_chain) ? (o.status_chain as Record<string, unknown>[]) : [])
      .filter((x) => x && typeof x === "object" && typeof x.status === "string")
      .map((x) => ({ la: typeof x.datetime === "string" ? x.datetime : "", stare: String(x.status).trim().slice(0, 80) }));
    return { fel: "ok", stare: o.status.trim().slice(0, 80), lant };
  }
  if (r.status >= 400 && r.status < 500) {
    return { fel: "refuz", status: r.status, mesaj: mesajLor(r) || `tbi bank a refuzat interogarea (HTTP ${r.status}).` };
  }
  return { fel: "necunoscut", status: r.status, mesaj: `tbi bank nu a întors starea cererii (HTTP ${r.status}).` };
}

// ─── loanCancellation / loanRefund ───────────────────────────────────────────

export type RezultatOperatie =
  | { fel: "facuta" }
  | { fel: "refuz"; mesaj: string; status: number; cod: number | null }
  | { fel: "necunoscut"; mesaj: string; status: number };

async function operatie(
  cfg: CredentialeCuCheie,
  metoda: "loanCancellation" | "loanRefund",
  continut: Record<string, unknown>,
  ce: string,
): Promise<RezultatOperatie> {
  let r: Raspuns;
  try {
    r = await posteaza(cfg, metoda, { data: cripteazaPentruTbi(JSON.stringify({ platform: "Api", ...continut }), cfg.cheie_criptare) });
  } catch (e) {
    return { fel: "necunoscut", status: 0, mesaj: esteTimp(e) ? NU_LA_TIMP : NU_RASPUNDE };
  }
  const cod = codEroare(r);
  if (r.status >= 200 && r.status < 300 && cod === 200) return { fel: "facuta" };
  const lor = mesajLor(r);
  if (r.status === 401 || cod === 401) return { fel: "refuz", status: 401, cod: 401, mesaj: `tbi bank a respins codul și cheia de reseller la ${ce}.` };
  if (r.status === 204 || cod === 207) {
    return { fel: "refuz", status: r.status, cod: 207, mesaj: `tbi bank nu a putut descifra cererea de ${ce}: cheia de criptare nu se potrivește.` };
  }
  if ((r.status >= 400 && r.status < 500) || (cod !== null && cod >= 400 && cod < 500)) {
    return { fel: "refuz", status: r.status, cod, mesaj: lor ? `tbi bank a refuzat ${ce}: ${lor}` : `tbi bank a refuzat ${ce} (HTTP ${r.status}).` };
  }
  return { fel: "necunoscut", status: r.status, mesaj: lor ? `tbi bank nu a confirmat ${ce}: ${lor}` : `tbi bank nu a confirmat ${ce} (HTTP ${r.status}).` };
}

/**
 * Anuleaza o cerere inca neaprobata. Dupa aprobare tbi raspunde 409 („Cannot cancel an approved
 * loan"): atunci banii se intorc prin `ramburseaza`.
 */
export function anuleazaCererea(cfg: CredentialeCuCheie, idTbi: number, token: string): Promise<RezultatOperatie> {
  return operatie(cfg, "loanCancellation", { orderId: String(idTbi), token, action: "cancel" }, "anularea");
}

/**
 * Rambursarea unui credit aprobat, integrala sau partiala. Suma nu poate trece de cea finantata.
 * Vestile despre ea (4 inregistrata, 5 in lucru, 6 terminata) vin la `refundLink`.
 */
export function ramburseaza(
  cfg: CredentialeCuCheie,
  idTbi: number,
  token: string,
  r: { tip: "integral" | "partial"; suma: number; adresaVesti: string },
): Promise<RezultatOperatie> {
  return operatie(cfg, "loanRefund", {
    orderId: String(idTbi), token, action: "refund", type: r.tip, amount: Math.round(r.suma * 100) / 100, refundLink: r.adresaVesti,
  }, "rambursarea");
}

// ─── Verificarea datelor de acces ────────────────────────────────────────────

export type RezultatVerificare =
  | { fel: "buna" }
  | { fel: "credentiale"; mesaj: string }
  | { fel: "cheie"; mesaj: string }
  | { fel: "necunoscut"; mesaj: string };

/**
 * Cele trei valori din emailul tbi, verificate FARA sa se atinga nimic la banca: o anulare pentru o
 * cerere care nu exista. Masurat pe serverul lor de test: 404 cu tot bun, 207 cu cheia de criptare
 * gresita, 401 cu codul sau cheia de reseller gresite.
 */
export async function verificaLegatura(cfg: CredentialeCuCheie): Promise<RezultatVerificare> {
  const r = await anuleazaCererea(cfg, 999_999_999, "0".repeat(64));
  if (r.fel === "refuz" && r.cod === 404) return { fel: "buna" };
  if (r.fel === "refuz" && r.cod === 401) return { fel: "credentiale", mesaj: "tbi bank nu recunoaște codul și cheia de reseller." };
  if (r.fel === "refuz" && r.cod === 207) return { fel: "cheie", mesaj: "Codul și cheia de reseller sunt bune, dar cheia de criptare nu se potrivește cu ele." };
  /* Un 200 aici ar insemna o cerere anulata pe care n-am trimis-o noi; nu se poate, dar nici nu e „buna". */
  return { fel: "necunoscut", mesaj: r.fel === "facuta" ? "tbi bank a răspuns neașteptat la verificare." : r.mesaj };
}
