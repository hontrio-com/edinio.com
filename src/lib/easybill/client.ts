import "server-only";
import { cheieToken } from "@/lib/integrari/cheie-token";
import {
  cuReferintaRamasa, eroareCuStatus, eroareDeTermen, eroareNesigura, eroareRefuz, verdictFurnizor,
} from "@/lib/operatii/eroare-furnizor";
import { legaturaAnafValida, type EasybillConfig } from "./config";
import { ZILE_CAUTARE_ORFANA, cuiCurat, type ClientDeFacturat, type FacturaCompusa, type LiniePlan } from "./document";

/**
 * Clientul easybill.ro (https://easybill.ro/ajutor/api-easybill-integrare-rapida-cu-aplicatiile-tale).
 *
 * ═══ FORMA API-ULUI, si de unde stim ═══
 *
 * Un SINGUR capat, `https://apps.easybill.ro/cgi-bin/index.cgi?action=plugin`; metoda se alege cu
 * `sec=…_fct`, plus `mode=api`. Autentificarea e pe SESIUNE: `authenticateUser_fct` primeste
 * utilizatorul si parola contului de tip API si intoarce `SessionId`, `AppUnique` (tenantul) si
 * `UserId`, care insotesc apoi fiecare cerere. Documentatia nu spune cat traieste sesiunea.
 *
 * Surse: pagina lor de API (citita integral pe 17.11.2026), articolele de ajutor despre stornare,
 * anulare, ciorne si numerotare, si raspunsurile REALE culese pe fir cu date INVENTATE (in
 * `client.test.ts`, brute). Colectia Postman de pe pagina cere acces pe Google Drive: n-am vazut-o.
 *
 * ═══ MASURAT PE FIR, 17.11.2026 ═══
 *
 *   - utilizator sau parola gresite: `200`, `Content-Type: application/json`, iar CORPUL e textul unui
 *     antet de redirectionare („Status: 302 Found … sec=friendlyerrormessage_frm”), nu JSON;
 *   - autentificare fara utilizator: `200`, `{"status": -2, "StatusMessage": "Error"}`;
 *   - ORICE metoda cu sesiune gresita, si cele care scriu: `403`,
 *     `{"error": -1, "errorMessage": "User not authenticated!"}`. Garda de sesiune vine inaintea
 *     oricarei lucrari, deci raspunsul asta dovedeste ca nu s-a facut nimic;
 *   - metoda necunoscuta sau fara `mode=api`: `302` catre `friendlyerrormessage_frm`, corp gol;
 *   - GET-ul din documentatie, fara sesiune buna: `302` catre `www.easybill.ro/pagina-de-eroare`.
 *
 * ⚠ TOTUL PLEACA PRIN POST, si citirile. Documentatia arata citirile ca GET, cu `SessionId` in
 * ADRESA: acolo ar fi ajuns in jurnalele oricarui proxy. Pe fir, POST-ul ajunge la aceleasi metode
 * (garda lor de sesiune raspunde). Adresa e mereu aceeasi si nu poarta nimic secret.
 *
 * ⚠ `status` NU SPUNE NIMIC SINGUR: 1 la reusita la autentificare, la client si la factura, dar 0
 * la reusita la linie, la plata si la actualizarea clientului (exemplele lor). Reusita se judeca
 * dupa ce trebuia sa vina (`SessionId`, `clientId`, `ebInvoiceNo`, `prodId`), nu dupa `status`.
 */

export const ADRESA_EASYBILL = "https://apps.easybill.ro/cgi-bin/index.cgi?action=plugin";

/** Scrierile asteapta mai mult decat citirile. */
const TERMEN_SCRIERE_MS = 30_000;
const TERMEN_CITIRE_MS = 15_000;
/** PDF-ul se cere o data si se da mai departe; peste plafonul Vercel ar pleca taiat. */
export const MARIME_MAXIMA_PDF = 4_400_000;
/**
 * Cat tinem o sesiune fara s-o folosim din nou. Documentatia nu spune cat traieste; daca moare mai
 * devreme, raspunsul „User not authenticated!” o reface, o data (vezi `cere`).
 */
export const DURATA_SESIUNII_MS = 20 * 60_000;

export type AcreditariEasybill = Pick<EasybillConfig, "username" | "password">;

export interface Sesiune {
  SessionId: string;
  AppUnique: string;
  UserId: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CEREREA SI RASPUNSUL: pure, ca sa se poata proba fara retea
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Corpul cererii, codat ca formular.
 *
 * ⚠ Metoda, `mode` si sesiunea se scriu DUPA parametri, intr-un obiect: o cheie apare o singura
 * data, deci un parametru cu acelasi nume nu le poate inlocui (intr-un formular cu chei dublate,
 * multe servere CGI o iau pe PRIMA).
 */
export function corpulCererii(
  sec: string,
  parametri: Record<string, string> = {},
  sesiune?: Sesiune | null,
): string {
  const obiect: Record<string, string> = {};
  for (const [k, v] of Object.entries(parametri)) obiect[k] = String(v ?? "");
  obiect.mode = "api";
  obiect.sec = sec;
  if (sesiune) {
    obiect.SessionId = sesiune.SessionId;
    obiect.AppUnique = sesiune.AppUnique;
    obiect.UserId = sesiune.UserId;
  }
  return new URLSearchParams(obiect).toString();
}

export type RaspunsEasybill =
  | { fel: "date"; date: unknown }
  | { fel: "refuz"; cod: string | null; mesaj: string }
  /** Sesiunea lipseste sau a expirat. Dovedit inaintea oricarei lucrari. */
  | { fel: "neautentificat" }
  /** Pagina lor de eroare (o redirectionare, reala sau scrisa in corp). Nu spune ce s-a facut. */
  | { fel: "pagina_de_eroare" };

const sir = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function obiect(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Un numar din raspunsul lor, numai in forme fara ambiguitate: „1234.56”, „-1234.56”, „1234,56”.
 *
 * ⚠ CU SEPARATOR DE MII („1.234,56”, „1,234.56”) E NECITIBIL, nu ghicit: un numar citit gresit ar fi
 * trecut drept potrivire la verificarea liniilor, iar o valoare lipsa ar fi sarit verificarea in tacere.
 */
export function numar(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = sir(v);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(",", "."));
  return null;
}

/** Un id de-al lor: doar cifre, nu zero. Un id gol sau ciudat nu se scrie pe comanda. */
function idNumeric(v: unknown): string | null {
  const s = sir(v);
  return /^\d+$/.test(s) && !/^0+$/.test(s) ? s : null;
}

function statusul(d: Record<string, unknown>): number | null {
  if (d.status === undefined || d.status === null || d.status === "") return null;
  const n = Number(d.status);
  return Number.isFinite(n) ? n : null;
}

function mesajul(d: Record<string, unknown>): string {
  for (const camp of ["errorMessage", "StatusMessage", "statusMessage", "message", "msg"]) {
    const v = sir(d[camp]);
    if (v) return v.slice(0, 300);
  }
  return "";
}

/**
 * Ce a raspuns easybill, sau `null` daca raspunsul nu are nicio forma cunoscuta.
 *
 * ⚠ `null` NU e un refuz. Pe o scriere inseamna „nu stim daca s-a facut”, vezi `trimite`.
 */
export function citesteRaspunsul(status: number, text: string, location?: string | null): RaspunsEasybill | null {
  if (status >= 300 && status < 400 && /friendlyerrormessage|pagina-de-eroare/i.test(location ?? "")) {
    return { fel: "pagina_de_eroare" };
  }
  /* Masurat: la autentificarea gresita, redirectionarea vine SCRISA IN CORP, sub un 200. */
  if (/^\s*Status:\s*30\d/i.test(text) && /friendlyerrormessage|pagina-de-eroare/i.test(text)) {
    return { fel: "pagina_de_eroare" };
  }
  let date: unknown;
  try {
    date = JSON.parse(text);
  } catch {
    return null;
  }
  const d = obiect(date);
  if (d) {
    if (/not\s+authenticated/i.test(sir(d.errorMessage)) || (status === 403 && Number(d.error) === -1)) {
      return { fel: "neautentificat" };
    }
    const e = d.error;
    if (e !== undefined && e !== null && e !== "" && e !== false && e !== 0 && e !== "0") {
      return { fel: "refuz", cod: sir(e) || null, mesaj: mesajul(d) };
    }
  }
  return { fel: "date", date };
}

function faraDiacritice(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const PASUL_ACREDITARI =
  "Verifică în easybill, la Setări, Automatizări, API Management, numele și parola utilizatorului de tip API.";

/** Ce i se spune omului cand autentificarea e respinsa. */
export const MESAJ_ACREDITARI_RESPINSE = `easybill a respins utilizatorul sau parola API. ${PASUL_ACREDITARI}`;

/**
 * Mesajul pentru comerciant: ce a spus easybill si ce are de facut.
 *
 * ⚠ SE CLASIFICA BRUTUL, se arata traducerea, iar brutul ramane in mesaj intre ghilimele: cine ne
 * scrie la suport il poate cauta.
 */
export function mesajEasybill(cod: string | null, brut: string): string {
  const m = faraDiacritice(brut);
  const citat = brut ? ` („${brut}”)` : "";
  if (/not\s+authenticated/.test(m)) {
    return `easybill a închis sesiunea de lucru${citat}. Încearcă din nou; dacă se repetă, verifică utilizatorul API.`;
  }
  if (/password|parola|username|utilizator|credential|autentific|login/.test(m)) {
    return `easybill a respins utilizatorul sau parola API${citat}. ${PASUL_ACREDITARI}`;
  }
  const codul = cod ? ` (cod ${cod})` : "";
  return brut ? `easybill a refuzat cererea: ${brut}${codul}` : `easybill a refuzat cererea${codul}.`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   „EASYBILL A SPUS NU”: refuzul care opreste salvarea
   ═══════════════════════════════════════════════════════════════════════════ */

const RESPINS = "respinsDeEasybill" as const;

/** Un refuz al LOR (acreditari, drepturi), nu o legatura cazuta. Verdictul ramane `esuat`. */
function respingere(mesaj: string): Error {
  const e = eroareRefuz(mesaj) as Error & { [RESPINS]?: boolean };
  e[RESPINS] = true;
  return e;
}

/** A spus easybill NU, sau doar n-am ajuns la ei? Deosebirea opreste salvarea sau o lasa cu avertisment. */
export function eRespingere(e: unknown): boolean {
  return e instanceof Error && (e as Error & { [RESPINS]?: boolean })[RESPINS] === true;
}

function mesajDin(e: unknown, implicit: string): string {
  return e instanceof Error && e.message ? e.message : implicit;
}

/* ═══════════════════════════════════════════════════════════════════════════
   FIRUL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * O cerere POST catre capatul lor.
 *
 * ⚠ `redirect: "manual"`: pagina lor de eroare vine ca redirectionare. Urmata, ar fi devenit o
 * pagina HTML oarecare (si o cerere GET dupa un POST), iar semnul „eroare” s-ar fi pierdut.
 */
function posteaza(corp: string, o: { termenMs: number; semnal?: AbortSignal; accept?: string }): Promise<Response> {
  return fetch(ADRESA_EASYBILL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: o.accept ?? "application/json",
    },
    body: corp,
    cache: "no-store",
    redirect: "manual",
    signal: o.semnal ?? AbortSignal.timeout(o.termenMs),
  });
}

type Optiuni = {
  /** Scrierea poate lasa un document in urma; citirea nu. De aici verdictele opuse. */
  scriere: boolean;
  /** Ce se face, pentru mesaje: „crearea facturii”. */
  ce: string;
};

/**
 * Un apel cu sesiunea data. Arunca DOAR la transport si la un raspuns de forma necunoscuta; refuzul
 * lor, sesiunea expirata si pagina de eroare se intorc, ca apelantul sa hotarasca.
 *
 * ⚠ VERDICTELE, si de ce difera dupa `scriere`:
 *   - pe o SCRIERE, tot ce nu e un raspuns citit e „nu stim”: cererea poate sa fi ajuns si documentul
 *     sa existe. Un timeout clasificat refuz ar debloca exact reincercarea care emite a doua factura;
 *   - pe o CITIRE, orice cadere e refuz dovedit: o citire nu creeaza nimic.
 */
async function trimite(corp: string, o: Optiuni): Promise<RaspunsEasybill> {
  let res: Response;
  try {
    res = await posteaza(corp, { termenMs: o.scriere ? TERMEN_SCRIERE_MS : TERMEN_CITIRE_MS });
  } catch (e) {
    const termen = eroareDeTermen(e, o.scriere, o.ce, "easybill");
    if (termen !== e) throw termen;
    throw o.scriere
      ? eroareNesigura(`Legătura cu easybill s-a rupt (${o.ce}), deci nu știm dacă s-a făcut. Verifică în contul easybill înainte de a reîncerca.`)
      : eroareRefuz(`Nu am putut contacta easybill (${o.ce}). Încearcă din nou peste un minut.`);
  }

  let text: string;
  try {
    text = await res.text();
  } catch {
    throw o.scriere
      ? eroareNesigura(`Răspunsul easybill s-a pierdut pe drum (${o.ce}), deci nu știm dacă s-a făcut. Verifică în contul easybill înainte de a reîncerca.`)
      : eroareRefuz(`Răspunsul easybill s-a pierdut pe drum (${o.ce}).`);
  }

  const r = citesteRaspunsul(res.status, text, res.headers.get("location"));
  /* Refuzul lor si sesiunea expirata sunt raspunsuri citite, pe orice status HTTP. */
  if (r && r.fel !== "date") return r;
  if (!res.ok) {
    throw o.scriere
      ? eroareCuStatus(`easybill a răspuns ${res.status} (${o.ce}). Verifică în contul easybill înainte de a reîncerca.`, res.status)
      : eroareRefuz(`easybill a răspuns ${res.status} (${o.ce}).`);
  }
  if (!r) {
    throw o.scriere
      ? eroareNesigura(`easybill a răspuns într-o formă necunoscută (${o.ce}), deci nu știm dacă s-a făcut. Verifică în contul easybill înainte de a reîncerca.`)
      : eroareRefuz(`easybill a răspuns într-o formă necunoscută (${o.ce}).`);
  }
  return r;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SESIUNEA, tinuta in memorie
   ═══════════════════════════════════════════════════════════════════════════ */

/** Sesiunea din raspunsul la `authenticateUser_fct`, sau `null`. */
export function sesiuneDinRaspuns(v: unknown): Sesiune | null {
  const d = obiect(v);
  if (!d) return null;
  const s = { SessionId: sir(d.SessionId), AppUnique: sir(d.AppUnique), UserId: sir(d.UserId) };
  const bun = (x: string) => x.length > 0 && x.length <= 200 && !/\s/.test(x);
  return bun(s.SessionId) && bun(s.AppUnique) && bun(s.UserId) ? s : null;
}

async function autentifica(a: AcreditariEasybill): Promise<Sesiune> {
  const username = (a.username ?? "").trim();
  if (!username || !a.password) throw respingere("Completează utilizatorul și parola API easybill.");
  let res: Response;
  try {
    res = await posteaza(
      corpulCererii("authenticateUser_fct", { Username: username, Password: a.password }),
      { termenMs: TERMEN_CITIRE_MS },
    );
  } catch (e) {
    const termen = eroareDeTermen(e, false, "autentificarea", "easybill");
    throw termen !== e ? termen : eroareRefuz("Nu am putut contacta easybill (autentificarea). Încearcă din nou peste un minut.");
  }
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw eroareRefuz("Răspunsul easybill s-a pierdut pe drum (autentificarea). Încearcă din nou.");
  }
  const r = citesteRaspunsul(res.status, text, res.headers.get("location"));
  if (r?.fel === "date") {
    const s = sesiuneDinRaspuns(r.date);
    if (s) return s;
    const d = obiect(r.date);
    const st = d ? statusul(d) : null;
    if (d && st !== null && st <= 0) {
      throw respingere(`easybill a respins autentificarea (${mesajul(d) || "fără mesaj"}, status ${st}). ${PASUL_ACREDITARI}`);
    }
  }
  /* Masurat: utilizator sau parola gresite = pagina lor de eroare, scrisa in corp. */
  if (r?.fel === "pagina_de_eroare" || r?.fel === "neautentificat") throw respingere(MESAJ_ACREDITARI_RESPINSE);
  if (r?.fel === "refuz") throw respingere(mesajEasybill(r.cod, r.mesaj));
  if (!res.ok) throw eroareRefuz(`easybill a răspuns ${res.status} la autentificare. Încearcă din nou peste un minut.`);
  throw eroareRefuz("easybill a răspuns într-o formă necunoscută la autentificare. Încearcă din nou peste un minut.");
}

type IntrareSesiune = { promisiune: Promise<Sesiune>; expira: number };

/**
 * Sesiunile, pe cont. Harta e a MODULULUI, deci comuna tuturor magazinelor din proces.
 *
 * ⚠ CHEIA CONTINE PAROLA, HASUITA (`cheieToken`), niciodata in clar. Cheiata doar dupa utilizator,
 * o cerere cu utilizatorul bun si o parola GRESITA ar fi primit sesiunea altcuiva din memorie, fara
 * sa atinga easybill: „Testează conexiunea” ar fi raspuns verde peste o parola gresita, iar cine stia
 * doar numele utilizatorului ar fi lucrat pe contul altui magazin. Vezi `cheie-token.ts`.
 */
const SESIUNI = new Map<string, IntrareSesiune>();
/** Plafon de intrari: un proces lung nu strange sesiuni la nesfarsit. */
const MAX_SESIUNI = 500;

function cheieSesiune(a: AcreditariEasybill): string {
  return cheieToken(["easybill", (a.username ?? "").trim()], [a.password ?? ""]);
}

/** Pentru probe: uita toate sesiunile tinute in memorie. */
export function uitaSesiunileEasybill(): void {
  SESIUNI.clear();
}

/**
 * Sesiunea contului: cea tinuta, sau una noua. Doua cereri simultane pe acelasi cont asteapta
 * ACEEASI autentificare (promisiunea sta in harta), nu deschid doua.
 */
async function sesiune(a: AcreditariEasybill): Promise<Sesiune> {
  const k = cheieSesiune(a);
  const acum = Date.now();
  const e = SESIUNI.get(k);
  if (e && e.expira > acum) return e.promisiune;
  const intrare: IntrareSesiune = { promisiune: autentifica(a), expira: acum + DURATA_SESIUNII_MS };
  SESIUNI.set(k, intrare);
  if (SESIUNI.size > MAX_SESIUNI) {
    const ceaMaiVeche = SESIUNI.keys().next().value;
    if (ceaMaiVeche !== undefined && ceaMaiVeche !== k) SESIUNI.delete(ceaMaiVeche);
  }
  try {
    return await intrare.promisiune;
  } catch (err) {
    /* O autentificare picata nu se tine minte: urmatoarea cerere incearca din nou. */
    if (SESIUNI.get(k) === intrare) SESIUNI.delete(k);
    throw err;
  }
}

/**
 * O sesiune NOUA, dupa ce `veche` a fost refuzata. Daca alta cerere a refacut-o intre timp, se ia
 * aceea: altfel cereri simultane s-ar fi autentificat fiecare, iar daca easybill tine o singura
 * sesiune pe utilizator, s-ar fi dat afara una pe alta.
 */
async function sesiuneNoua(a: AcreditariEasybill, veche: Sesiune): Promise<Sesiune> {
  const k = cheieSesiune(a);
  const e = SESIUNI.get(k);
  if (e) {
    const actuala = await e.promisiune.catch(() => null);
    if (actuala && actuala.SessionId !== veche.SessionId && e.expira > Date.now() && SESIUNI.get(k) === e) {
      return actuala;
    }
    if (SESIUNI.get(k) === e) SESIUNI.delete(k);
  }
  return sesiune(a);
}

/**
 * Un apel autentificat. Sesiunea expirata se reface O DATA.
 *
 * ⚠ REFACEREA E SIGURA SI PE SCRIERI: „User not authenticated!” vine inaintea oricarei lucrari
 * (masurat pe toate metodele, si pe `createInvoice_fct`), deci cererea refuzata n-a creat nimic.
 */
async function cere(a: AcreditariEasybill, sec: string, parametri: Record<string, string>, o: Optiuni): Promise<RaspunsEasybill> {
  const s = await sesiune(a);
  const r = await trimite(corpulCererii(sec, parametri, s), o);
  if (r.fel !== "neautentificat") return r;
  const s2 = await sesiuneNoua(a, s);
  const r2 = await trimite(corpulCererii(sec, parametri, s2), o);
  if (r2.fel === "neautentificat") {
    throw respingere(`easybill a refuzat sesiunea chiar după o autentificare reușită (${o.ce}). Verifică în easybill drepturile utilizatorului API.`);
  }
  return r2;
}

/** O scriere al carei raspuns nu poarta rodul asteptat: refuz dovedit sau „nu stim”. */
function scriereNelamurita(r: RaspunsEasybill, ce: string): Error {
  if (r.fel === "refuz") return eroareRefuz(mesajEasybill(r.cod, r.mesaj));
  if (r.fel === "date") {
    const d = obiect(r.date);
    const st = d ? statusul(d) : null;
    /* Un status negativ e un NU spus de ei (masurat: -2 la autentificarea fara date). */
    if (d && st !== null && st < 0) return eroareRefuz(mesajEasybill(String(st), mesajul(d)));
  }
  if (r.fel === "pagina_de_eroare") {
    return eroareNesigura(`easybill a răspuns cu pagina lor de eroare (${ce}), deci nu știm dacă s-a făcut. Verifică în contul easybill înainte de a reîncerca.`);
  }
  return eroareNesigura(`easybill a răspuns fără rezultatul așteptat (${ce}), deci nu știm dacă s-a făcut. Verifică în contul easybill înainte de a reîncerca.`);
}

/** O citire care n-a adus ce trebuia. O citire nu creeaza nimic: e refuz. */
function citireNelamurita(r: RaspunsEasybill, ce: string): Error {
  if (r.fel === "refuz") return eroareRefuz(mesajEasybill(r.cod, r.mesaj));
  if (r.fel === "pagina_de_eroare") return eroareRefuz(`easybill a răspuns cu pagina lor de eroare (${ce}).`);
  return eroareRefuz(`easybill a răspuns într-o formă neașteptată (${ce}).`);
}

/** O lista: tabloul lor, iar un obiect gol inseamna „nimic”. Altceva = `null`. */
function lista(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  const d = obiect(v);
  return d && Object.keys(d).length === 0 ? [] : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   FIRMA SI PROBA DE CONEXIUNE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface InfoFirma {
  nume: string;
  cui: string;
  /** `anafConnectionURL`, doar daca e o adresa https a easybill. */
  anafUrl: string | null;
  /** Contul easybill e marcat neplatitor de TVA. */
  faraTva: boolean;
}

/** Datele firmei din `getCompanyInfo_fct`. Pura. */
export function firmaDinRaspuns(v: unknown): InfoFirma | null {
  const d = obiect(v);
  if (!d) return null;
  const nume = sir(d.companyName);
  const cui = sir(d.companyUniqueRegistrationNumber);
  if (!nume && !cui) return null;
  const url = sir(d.anafConnectionURL);
  return { nume, cui, anafUrl: legaturaAnafValida(url) ? url : null, faraTva: sir(d.companyIsWithoutVAT) === "1" };
}

/** Datele firmei legate (o citire autentificata). */
export async function citesteFirma(a: AcreditariEasybill): Promise<InfoFirma> {
  const ce = "citirea datelor firmei";
  const r = await cere(a, "getCompanyInfo_fct", {}, { scriere: false, ce });
  /* Un refuz aici, dupa o autentificare reusita, e tot un NU al lor (drepturi). */
  if (r.fel === "refuz") throw respingere(mesajEasybill(r.cod, r.mesaj));
  if (r.fel === "date") {
    const f = firmaDinRaspuns(r.date);
    if (f) return f;
    /* Un `status` negativ e tot un NU al lor, nu o forma necunoscuta: salvarea trebuie oprita. */
    const d = obiect(r.date);
    const st = d ? statusul(d) : null;
    if (d && st !== null && st < 0) throw respingere(mesajEasybill(String(st), mesajul(d)));
  }
  throw citireNelamurita(r, ce);
}

/**
 * Proba de conexiune: autentificarea si o CITIRE AUTENTIFICATA (datele firmei).
 *
 * ⚠ Autentificata, nu pe un capat public: o proba care nu cere acreditari ar raspunde „reusit”
 * pentru orice parola (defectul fGO din 15.08.2026). Si nu scrie nimic.
 *
 * `refuz` deosebeste „easybill a raspuns NU” (utilizator sau parola gresite, drepturi lipsa) de
 * „n-am ajuns la easybill”: salvarea il opreste pe primul si il lasa sa treaca, cu avertisment, pe
 * al doilea. O pana a lor nu are de ce sa-l impiedice pe comerciant sa-si salveze setarile.
 */
export async function testeazaConexiunea(
  a: AcreditariEasybill,
): Promise<{ ok: true; firma: InfoFirma } | { ok: false; error: string; refuz: boolean }> {
  try {
    return { ok: true, firma: await citesteFirma(a) };
  } catch (e) {
    return { ok: false, refuz: eRespingere(e), error: mesajDin(e, "Nu am putut contacta easybill.") };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLIENTUL FACTURII
   ═══════════════════════════════════════════════════════════════════════════ */

/** Clientul existent cu acest CUI (`searchClient_fct`), sau `null`. */
export async function gasesteClientul(a: AcreditariEasybill, cui: string): Promise<string | null> {
  const ce = "căutarea clientului";
  const r = await cere(a, "searchClient_fct", { query: cui, limit: "50" }, { scriere: false, ce });
  const randuri = r.fel === "date" ? lista(r.date) : null;
  if (!randuri) throw citireNelamurita(r, ce);
  /* ⚠ Cautarea lor e pe tot textul: se cere EGALITATE pe CUI, altfel „123” ar gasi si „51234”. */
  for (const rand of randuri) {
    const d = obiect(rand);
    if (!d || cuiCurat(sir(d.clientCIF)) !== cui) continue;
    const id = idNumeric(d.clientId);
    if (id) return id;
  }
  return null;
}

/** Un client nou (`addClient_fct`). */
export async function creeazaClientul(a: AcreditariEasybill, campuri: Record<string, string>): Promise<string> {
  const ce = "crearea clientului";
  const r = await cere(a, "addClient_fct", { ...campuri, json: "1" }, { scriere: true, ce });
  if (r.fel === "date") {
    const d = obiect(r.date);
    const id = d ? idNumeric(d.clientId) : null;
    if (id) return id;
  }
  throw scriereNelamurita(r, ce);
}

/**
 * Clientul facturii: firma se cauta intai dupa CUI, persoana fizica se creeaza.
 *
 * ⚠ ORICE CADERE AICI E REFUZ PENTRU REGISTRU, si pe scriere: pasul vine INAINTEA facturii, deci nu
 * exista inca niciun document fiscal. Cel mult ramane un client in plus in lista lor, ceea ce nu
 * dubleaza nimic fiscal; blocarea comenzii pentru atat ar fi cerut un om degeaba.
 */
async function clientul(a: AcreditariEasybill, c: ClientDeFacturat): Promise<string> {
  try {
    if (c.cuiDeCautat) {
      const gasit = await gasesteClientul(a, c.cuiDeCautat);
      if (gasit) return gasit;
    }
    return await creeazaClientul(a, c.campuri);
  } catch (e) {
    throw eroareRefuz(`${mesajDin(e, "Clientul nu s-a putut pregăti în easybill.")} Nu s-a emis nicio factură.`);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * O factura GOALA (`createInvoice_fct`). Intoarce id-ul intern (`ebInvoiceNo`, desi numele spune
 * „numar”: numarul fiscal vine abia la citire, ca `invoiceNumber`).
 *
 * ⚠ SUCCESUL FARA ID e „nu stim”, nu reusita si nu refuz: documentul poate exista, dar fara id nu-l
 * putem completa si nici lega de comanda.
 */
export async function creeazaFactura(a: AcreditariEasybill, antet: Record<string, string>, clientId: string): Promise<string> {
  const ce = "crearea facturii";
  const r = await cere(a, "createInvoice_fct", { ...antet, clientId, json: "1" }, { scriere: true, ce });
  if (r.fel === "date") {
    const d = obiect(r.date);
    const id = d ? idNumeric(d.ebInvoiceNo) : null;
    if (id) return id;
  }
  throw scriereNelamurita(r, ce);
}

export interface LinieAdaugata {
  /** Id-ul liniei (`prodId`). */
  id: string;
  /** Ce a socotit easybill pentru linie: `valueWithoutVat`, `null` daca lipseste sau nu se poate citi. */
  valoare: number | null;
  /** Ce a socotit easybill pentru linie: `vatValue`, `null` daca lipseste sau nu se poate citi. */
  tva: number | null;
}

/** O linie pe factura (`addProductToInvoice_fct`, produs simplu, fara gestiune). */
export async function adaugaLinia(a: AcreditariEasybill, idFactura: string, linie: LiniePlan): Promise<LinieAdaugata> {
  const ce = `adăugarea liniei „${linie.campuri.productName ?? ""}”`;
  const r = await cere(a, "addProductToInvoice_fct", {
    ...linie.campuri,
    invoiceId: idFactura,
    invoiceIdType: "id",
    json: "1",
  }, { scriere: true, ce });
  if (r.fel === "date") {
    const d = obiect(r.date);
    const id = d ? idNumeric(d.prodId) : null;
    if (d && id) return { id, valoare: numar(d.valueWithoutVat), tva: numar(d.vatValue) };
  }
  const e = scriereNelamurita(r, ce);
  /* Un NU al lor pentru CONTINUTUL liniei (nu o sesiune cazuta, nu o legatura rupta): reluarea ar
     lovi acelasi refuz, deci factura se anuleaza, nu se completeaza. Vezi `indemnPentru`. */
  if (verdictFurnizor(e) === "esuat") (e as Error & { [LINIE_REFUZATA]?: boolean })[LINIE_REFUZATA] = true;
  throw e;
}

const LINIE_REFUZATA = "liniaRefuzataDeEasybill" as const;

/** Linia a fost refuzata de easybill pentru continutul ei (nu de o sesiune sau de o legatura)? */
export function eLiniaRefuzata(e: unknown): boolean {
  return e instanceof Error && (e as Error & { [LINIE_REFUZATA]?: boolean })[LINIE_REFUZATA] === true;
}

/** O linie de pe factura, cum o intoarce `getInvoiceProducts_fct`. */
export interface LinieCitita {
  id: string;
  nume: string;
  cantitate: number | null;
  /** Pretul unitar FARA TVA (`productPrice`; in exemplul lor, 200 net la o linie de 200 x 3 cu 19%). */
  pret: number | null;
  /** TVA-ul pe bucata (`productVATValue`; in acelasi exemplu, 38). */
  tvaUnitar: number | null;
  cota: number | null;
  anulata: boolean;
}

/** Liniile din raspunsul `getInvoiceProducts_fct`. Pura. `null` = forma necunoscuta. */
export function liniiDinRaspuns(v: unknown): LinieCitita[] | null {
  const randuri = lista(v);
  if (!randuri) return null;
  return randuri
    .map(obiect)
    .filter((d): d is Record<string, unknown> => !!d)
    .map((d) => ({
      id: sir(d.productId),
      nume: sir(d.productName),
      cantitate: numar(d.productQuantity),
      pret: numar(d.productPrice),
      tvaUnitar: numar(d.productVATValue),
      cota: numar(d.productVAT),
      anulata: sir(d.isCancelled) === "1",
    }));
}

/** Toleranta la compararea unei sume de pe linie: rotunjirea pretului unitar, inmultita cu bucatile. */
function toleranta(cantitate: number): number {
  return 0.02 + 0.007 * Math.abs(cantitate);
}

/** Liniile facturii (o citire). */
export async function citesteLiniile(a: AcreditariEasybill, idFactura: string): Promise<LinieCitita[]> {
  const ce = "citirea liniilor facturii";
  const r = await cere(a, "getInvoiceProducts_fct", { invoiceId: idFactura }, { scriere: false, ce });
  if (r.fel === "date") {
    const l = liniiDinRaspuns(r.date);
    if (l) return l;
  }
  throw citireNelamurita(r, ce);
}

function cheieNume(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Cate din liniile planului sunt DEJA pe factura, in ordine, sau `null` daca ce e acolo nu e
 * inceputul planului: alte nume, alte cantitati, alta valoare sau alt TVA, mai multe linii.
 *
 * ⚠ SE ORDONEAZA DUPA ID: exemplul lor intoarce liniile de la cea mai noua la cea mai veche (id-ul
 * liniei 2981338 inaintea lui 2981336). Comparate in ordinea primita, o factura buna ar fi parut
 * straina. Liniile anulate nu se numara.
 *
 * ⚠ NUMELE SI CANTITATEA NU AJUNG: o linie cu pretul socotit gresit (TVA pus de doua ori) are acelasi
 * nume si aceeasi cantitate. Se compara si valoarea fara TVA (pret x cantitate) si TVA-ul (TVA pe bucata
 * x cantitate). O valoare LIPSA sau NECITIBILA e nepotrivire, nu un pas sarit.
 */
export function liniiDejaPuse(existente: LinieCitita[], plan: LiniePlan[]): number | null {
  const vii = existente
    .filter((l) => !l.anulata)
    .sort((x, y) => (Number(x.id) || 0) - (Number(y.id) || 0));
  if (vii.length > plan.length) return null;
  for (let i = 0; i < vii.length; i++) {
    const l = vii[i];
    const p = plan[i];
    if (cheieNume(l.nume) !== cheieNume(p.campuri.productName ?? "")) return null;
    const q = Number(p.campuri.productQuantity);
    if (l.cantitate === null || Math.abs(l.cantitate - q) > 0.0005) return null;
    if (l.pret === null || l.tvaUnitar === null) return null;
    if (Math.abs(Math.abs(l.pret * l.cantitate) - Math.abs(p.valoare)) > toleranta(q)) return null;
    if (Math.abs(Math.abs(l.tvaUnitar * l.cantitate) - Math.abs(p.tva)) > toleranta(q)) return null;
  }
  return vii.length;
}

/** Factura, cum o stie easybill (`searchInvoices_fct`). Doar ce folosim. */
export interface FacturaCitita {
  cheie: string;
  serie: string;
  numar: string;
  /** „YYYY-MM-DD”, data emiterii. */
  data: string;
  /** Totalul documentului, cu TVA. */
  total: number | null;
  /** Ce mai e de incasat. */
  rest: number | null;
  /** „fiscal” sau „draft” (ciorna). */
  stare: string;
  anulata: boolean;
  moneda: string;
  comentarii: string;
  clientId: string;
  clientNume: string;
  /** Starea in e-Factura, cum o scriu ei. */
  anaf: string;
}

/** Citirea defensiva a unui rand din `searchInvoices_fct`. Pura. */
export function facturaDinRand(rand: unknown): FacturaCitita | null {
  const f = obiect(rand);
  if (!f) return null;
  const cheie = idNumeric(f.invoiceId);
  if (!cheie) return null;
  return {
    cheie,
    serie: sir(f.invoiceSerie),
    numar: sir(f.invoiceNumber),
    data: sir(f.invoiceIssueDate),
    total: numar(f.invoiceTotalAmount),
    rest: numar(f.invoiceOutstandingBalance),
    stare: sir(f.invoiceStatus),
    anulata: sir(f.invoiceIsCancelled) === "1",
    moneda: sir(f.invoiceCurrency),
    comentarii: sir(f.invoiceComments),
    clientId: sir(f.clientId),
    clientNume: sir(f.clientName),
    anaf: sir(f.anafStatus),
  };
}

/**
 * Citeste o factura dupa id. `null` = nu exista la ei.
 *
 * ⚠ Se alege din raspuns randul cu CHIAR acest id. Daca filtrul ar fi ignorat vreodata, raspunsul
 * ar fi o lista intreaga, iar primul rand ar fi fost factura altcuiva.
 */
export async function citesteFactura(a: AcreditariEasybill, cheie: string): Promise<FacturaCitita | null> {
  const ce = "citirea facturii";
  const r = await cere(a, "searchInvoices_fct", { invoiceId: cheie }, { scriere: false, ce });
  const randuri = r.fel === "date" ? (lista(r.date) ?? (obiect(r.date) ? [r.date] : null)) : null;
  if (!randuri) throw citireNelamurita(r, ce);
  for (const rand of randuri) {
    const f = facturaDinRand(rand);
    if (f && f.cheie === cheie) return f;
  }
  return null;
}

/** „EBF 955”, sau id-ul cat timp numarul nu se stie. */
function eticheta(f: Pick<FacturaCitita, "serie" | "numar" | "cheie">): string {
  const n = [f.serie, f.numar].filter(Boolean).join(" ");
  return n || `id ${f.cheie}`;
}

/**
 * Ce e documentul, pentru ce se scrie pe comanda: viu (fiscal, neanulat), ciorna, sau anulat.
 * Ciorna si anulata NU se scriu ca facturi complete: contul cumparatorului si urcarea la marketplace
 * le-ar fi luat drept document fiscal.
 */
export function stareaFacturii(f: Pick<FacturaCitita, "stare" | "anulata">): "vie" | "ciorna" | "anulata" {
  if (f.anulata) return "anulata";
  return f.stare.toLowerCase() === "fiscal" ? "vie" : "ciorna";
}

/**
 * Citirea de dupa emitere: seria, numarul, totalul si starea documentului abia completat.
 *
 * ⚠ NU ARUNCA, NICIODATA. Documentul fiscal EXISTA deja cand se ajunge aici; o eroare de citire nu
 * are voie sa transforme o emitere reusita intr-un esec. Fara raspuns, `null`.
 *
 * ⚠ CIORNA SE INTOARCE PE LOC, si fara numar: easybill o numeroteaza abia la finalizare. Asteptata
 * „pana vine numarul”, ar fi iesit „numarul nu s-a putut citi”, iar avertismentul de ciorna n-ar mai
 * fi ajuns niciodata la om. Factura fiscala fara numar inca se mai citeste, de doua ori, cu pauze.
 */
export async function citesteDupaEmitere(
  a: AcreditariEasybill,
  cheie: string,
  pauze: readonly number[] = [0, 500, 1500],
): Promise<FacturaCitita | null> {
  for (const pauza of pauze) {
    if (pauza) await new Promise((r) => setTimeout(r, pauza));
    try {
      const f = await citesteFactura(a, cheie);
      if (f && (f.numar || stareaFacturii(f) !== "vie")) return f;
    } catch {
      /* se mai incearca */
    }
  }
  return null;
}

/**
 * Cate randuri cerem, explicit, din lista lor de facturi (`limit`, ca la `searchClient_fct`).
 *
 * ⚠ UN RASPUNS CU ATATEA RANDURI (SAU MAI MULTE) POATE FI TAIAT: lista n-are paginare documentata, deci
 * nu stim ce a ramas pe dinafara. O cautare care trebuie sa dovedeasca o LIPSA (nu exista factura
 * ramasa, nu exista stornarea) nu are voie sa se sprijine pe o lista poate incompleta: refuz.
 */
export const LIMITA_LISTA = 500;

/** Un interval din lista lor, ca facturi, si daca lista a venit plina. Forma necunoscuta = refuz. */
async function listaPeInterval(a: AcreditariEasybill, start: string, end: string, ce: string): Promise<{ facturi: FacturaCitita[]; plina: boolean }> {
  const r = await cere(a, "searchInvoices_fct", { startDate: start, endDate: end, limit: String(LIMITA_LISTA) }, { scriere: false, ce });
  const randuri = r.fel === "date" ? lista(r.date) : null;
  if (!randuri) throw citireNelamurita(r, ce);
  return {
    facturi: randuri.map(facturaDinRand).filter((f): f is FacturaCitita => !!f),
    plina: randuri.length >= LIMITA_LISTA,
  };
}

function prePlina(zi: string, ce: string): Error {
  return eroareRefuz(`Lista de facturi easybill din ${zi} are cel puțin ${LIMITA_LISTA} de documente, deci poate fi incompletă și nu putem dovedi ${ce}. Verifică direct în easybill.`);
}

/**
 * Factura ramasa de la o incercare de dinainte, dupa marcajul din observatii; `null` daca nu e.
 *
 * ⚠ E DOAR PLASA. Drumul obisnuit e id-ul de pe randul registrului (`OptiuniEmitere.ramasa`); marcajul
 * prinde numai procesul TAIAT inainte de orice `catch`, care n-a apucat sa scrie id-ul.
 *
 * Se cauta zi cu zi, de la azi inapoi, si se opreste la prima gasita. Facturile anulate nu conteaza.
 * O zi cu lista plina (poate taiata) e refuz: o lipsa nedovedita ar fi deschis drumul catre a doua
 * factura.
 */
export async function cautaFacturaRamasa(a: AcreditariEasybill, semn: string, zile: string[]): Promise<FacturaCitita | null> {
  const ce = "căutarea unei facturi începute la o încercare anterioară";
  const cautat = semn.toUpperCase();
  for (const zi of zile) {
    const { facturi, plina } = await listaPeInterval(a, zi, zi, ce);
    const gasite = facturi.filter((f) => !f.anulata && f.comentarii.toUpperCase().includes(cautat));
    if (gasite.length > 1) {
      throw eroareRefuz(`Am găsit în easybill ${gasite.length} facturi neanulate pentru aceeași comandă (${gasite.map(eticheta).join(", ")}). Anulează-le în easybill pe cele în plus, apoi încearcă din nou.`);
    }
    if (gasite.length === 1) return gasite[0];
    if (plina) throw prePlina(zi, "că nu există deja o factură pentru comanda asta");
  }
  return null;
}

/**
 * Cauta in lista lor de facturi, interval cu interval (cele mai noi intai), si se opreste la primul
 * interval in care `alege` gaseste ceva. O citire: o cadere e refuz.
 *
 * ⚠ „PAGINAREA” E PE TIMP: lista n-are paginare documentata. Un interval de mai multe zile care vine
 * plin se reia zi cu zi. O zi care vine plina, fara potrivire, nu opreste cautarea: seria si numarul
 * sunt unice, deci documentul gasit in alta zi e chiar el. Dar daca nu se gaseste NICAIERI, iar o zi a
 * venit plina, „negasit” nu se poate dovedi: refuz.
 */
export async function cautaFacturi(
  a: AcreditariEasybill,
  intervale: { start: string; end: string }[],
  alege: (randuri: FacturaCitita[]) => FacturaCitita[],
  ce = "căutarea documentului",
): Promise<FacturaCitita[]> {
  let plina: string | null = null;
  for (const iv of intervale) {
    const r = await cautaInInterval(a, iv, alege, ce);
    if (r.gasite.length) return r.gasite;
    plina = plina ?? r.plina;
  }
  if (plina) throw prePlina(plina, "că documentul nu e acolo");
  return [];
}

/** Un interval: potrivirile, sau prima zi venita plina fara ele (`null` = lista intreaga). */
async function cautaInInterval(
  a: AcreditariEasybill,
  iv: { start: string; end: string },
  alege: (randuri: FacturaCitita[]) => FacturaCitita[],
  ce: string,
): Promise<{ gasite: FacturaCitita[]; plina: string | null }> {
  const { facturi, plina } = await listaPeInterval(a, iv.start, iv.end, ce);
  const gasite = alege(facturi);
  if (gasite.length || !plina) return { gasite, plina: null };
  if (iv.start === iv.end) return { gasite: [], plina: iv.start };
  let primaPlina: string | null = null;
  for (const z of cuZile(iv.start, iv.end)) {
    const r = await cautaInInterval(a, { start: z, end: z }, alege, ce);
    if (r.gasite.length) return r;
    primaPlina = primaPlina ?? r.plina;
  }
  return { gasite: [], plina: primaPlina };
}

/** Zilele unui interval, de la cea mai noua la cea mai veche. */
function cuZile(start: string, end: string): string[] {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  const zile: string[] = [];
  for (let t = b; t >= a && zile.length < 400; t -= 86_400_000) zile.push(new Date(t).toISOString().slice(0, 10));
  return zile;
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMITEREA, IN PASI
   ═══════════════════════════════════════════════════════════════════════════ */

const lei = (n: number) => `${n.toFixed(2).replace(".", ",")} lei`;

/**
 * Cat socotim, PRUDENT, un pas pe fir (o cerere si raspunsul ei). Masurat pe erori: ~0,5 s; de patru
 * ori atat, ca o zi lenta la ei sa nu ne prinda cu factura pe jumatate.
 */
export const MS_PE_PAS = 2_000;

/** Ce i se cere omului cand factura a ramas: s-o ANULEZE (e gresita) sau sa DEBLOCHEZE (o completam). */
type Indemn = "anuleaza" | "reia";

/**
 * Ce i se spune omului cand factura EXISTA dar n-a putut fi completata. Id-ul e in mesaj, ca s-o
 * poata gasi; mesajul ajunge si in registru (`ultima_eroare`), iar id-ul, pe randul lui.
 *
 * ⚠ DOUA INDEMNURI, NU UNUL. O factura cu o linie GRESITA (refuzata de ei, socotita altfel, straina de
 * comanda) se ANULEAZA: completata, ar ramane gresita. Doar una oprita de o legatura cazuta sau de timp
 * se reia: Edinio o citeste dupa id si ii adauga ce lipseste.
 */
function ramasa(id: string, puse: number | null, n: number, motiv: string, indemn: Indemn): string {
  const cate = puse === null ? "" : `, cu ${puse} din ${n} linii`;
  const cap = `Factura easybill cu id-ul ${id} s-a creat, dar a rămas neterminată${cate}: ${motiv}. Nu emitem alta peste ea.`;
  return indemn === "anuleaza"
    ? `${cap} Anuleaz-o în easybill (din pagina facturii: Acțiuni factură, Anulare): Edinio n-o mai completează și nu emite alta în locul ei pentru comanda asta. Factura comenzii o emiți apoi din easybill.`
    : `${cap} Deblochează operația din pagina comenzii: la următoarea apăsare, Edinio o citește după id și îi adaugă liniile care lipsesc.`;
}

/**
 * Ce a socotit easybill pentru linie se potriveste cu planul? Valoarea fara TVA SI TVA-ul, pe MARIME
 * (semnul unei linii negative il prinde totalul de la final). Toleranta acopera rotunjirea pretului
 * unitar, nu un TVA pus de doua ori.
 *
 * ⚠ O valoare LIPSA sau NECITIBILA e nepotrivire: o verificare sarita in tacere ar fi lasat sa treaca
 * exact linia gresita pe care o cautam.
 */
export function liniaSePotriveste(rod: Pick<LinieAdaugata, "valoare" | "tva">, linie: LiniePlan): boolean {
  if (rod.valoare === null || rod.tva === null) return false;
  const q = Number(linie.campuri.productQuantity) || 0;
  return Math.abs(Math.abs(rod.valoare) - Math.abs(linie.valoare)) <= toleranta(q)
    && Math.abs(Math.abs(rod.tva) - Math.abs(linie.tva)) <= toleranta(q);
}

/** Cate linii ale planului sunt pe factura dupa o cadere; `null` = altceva decat ne asteptam. */
async function liniileDupaCadere(a: AcreditariEasybill, id: string, linii: LiniePlan[]): Promise<number | null> {
  try {
    return liniiDejaPuse(await citesteLiniile(a, id), linii);
  } catch {
    return null;
  }
}

/** Indemnul pentru o linie care n-a ajuns: refuzata de EI pentru continut = anulare; altfel = reluare. */
function indemnPentru(e: unknown): Indemn {
  return eLiniaRefuzata(e) ? "anuleaza" : "reia";
}

/**
 * Linia `i`, adaugata o singura data.
 *
 * ⚠ AICI FACTURA EXISTA DEJA, deci orice esec iese „nu stim” (registrul blocheaza si omul vede
 * id-ul), chiar si un refuz dovedit al liniei: documentul fiscal ramane pe jumatate oricum.
 *
 * Un esec NESIGUR (legatura rupta, raspuns ciudat) se lamureste citind liniile facturii: daca linia
 * a ajuns, se merge mai departe; daca nu, se mai trimite O DATA. Asa o pana de o secunda nu cere un
 * om, iar o linie nu ajunge niciodata de doua ori.
 */
async function adaugaLiniaSigur(a: AcreditariEasybill, id: string, linii: LiniePlan[], i: number): Promise<void> {
  const n = linii.length;
  const linie = linii[i];
  const nume = linie.campuri.productName ?? "";
  let rod: LinieAdaugata;
  try {
    rod = await adaugaLinia(a, id, linie);
  } catch (e) {
    if (verdictFurnizor(e) === "esuat") {
      throw eroareNesigura(ramasa(id, i, n, `linia „${nume}” nu s-a putut adăuga (${mesajDin(e, "refuz")})`, indemnPentru(e)));
    }
    const k = await liniileDupaCadere(a, id, linii);
    if (k === i + 1) return;
    if (k !== i) {
      throw eroareNesigura(ramasa(id, null, n, `după o legătură căzută la linia „${nume}”, liniile facturii nu s-au putut lămuri`, "reia"));
    }
    try {
      rod = await adaugaLinia(a, id, linie);
    } catch (e2) {
      throw eroareNesigura(ramasa(id, i, n, `nu știm dacă linia „${nume}” a ajuns (${mesajDin(e2, "fără răspuns")})`, indemnPentru(e2)));
    }
  }
  if (!liniaSePotriveste(rod, linie)) {
    /* ⚠ Se opreste la PRIMA linie socotita altfel: un TVA inteles gresit s-ar repeta pe toate. */
    const socotit = rod.valoare !== null && rod.tva !== null
      ? `${lei(Math.abs(rod.valoare) + Math.abs(rod.tva))} (din care TVA ${lei(Math.abs(rod.tva))})`
      : "fără valoare și TVA citibile în răspunsul lor";
    throw eroareNesigura(ramasa(id, i + 1, n,
      `easybill a socotit linia „${nume}” la ${socotit}, iar comanda are ${lei(Math.abs(linie.total))} (din care TVA ${lei(Math.abs(linie.tva))})`,
      "anuleaza"));
  }
}

/**
 * Pune pe factura liniile care lipsesc. Intoarce cate a adaugat.
 *
 * `citesteIntai`: factura poate avea deja linii (una ramasa de la o incercare de dinainte, sau una
 * intoarsa de easybill pentru acelasi `invoiceExternalId`); se citesc si se continua de unde a ramas.
 * `creataAcum`: documentul l-a creat chiar incercarea asta, deci o citire picata e „nu stim”.
 * `totalCitit`: totalul facturii ramase, citit la ei; trebuie sa fie chiar suma liniilor ei din plan.
 */
async function completeazaLiniile(
  a: AcreditariEasybill,
  id: string,
  linii: LiniePlan[],
  o: { citesteIntai: boolean; creataAcum: boolean; totalCitit?: number | null; termen: number; ceas: () => number },
): Promise<number> {
  const n = linii.length;
  let start = 0;
  if (o.citesteIntai) {
    let existente: LinieCitita[];
    try {
      existente = await citesteLiniile(a, id);
    } catch (e) {
      throw o.creataAcum
        ? eroareNesigura(ramasa(id, null, n, `liniile ei nu s-au putut citi (${mesajDin(e, "fără răspuns")})`, "reia"))
        : eroareRefuz(`Am găsit factura easybill cu id-ul ${id}, începută la o încercare anterioară, dar liniile ei nu s-au putut citi: ${mesajDin(e, "fără răspuns")} Încearcă din nou peste un minut.`);
    }
    const k = liniiDejaPuse(existente, linii);
    if (k === null) {
      const vii = existente.filter((l) => !l.anulata).length;
      /* Ramasa de la o incercare de dinainte: incercarea asta n-a creat nimic, deci e refuz; fiecare
         reincercare o va gasi din nou, pana o anuleaza omul. Creata acum: „nu stim”. */
      throw o.creataAcum
        ? eroareNesigura(ramasa(id, vii, n, "are alte linii decât comanda", "anuleaza"))
        : eroareRefuz(`În easybill există factura cu id-ul ${id}, începută la o încercare anterioară, dar liniile ei (${vii}) nu se potrivesc cu comanda. N-o completăm: anuleaz-o în easybill (din pagina facturii: Acțiuni factură, Anulare); factura comenzii o emiți apoi din easybill.`);
    }
    if (o.totalCitit !== undefined) {
      /* ⚠ Liniile se potrivesc una cate una, dar documentul poate avea mai mult decat ele (o linie
         anulata altfel, o ajustare de-a lor). Totalul lui trebuie sa fie chiar suma lor. */
      const asteptat = Math.round(linii.slice(0, k).reduce((s, l) => s + l.total, 0) * 100) / 100;
      if (o.totalCitit === null || Math.abs(o.totalCitit - asteptat) >= 0.01) {
        const citit = o.totalCitit === null ? "un total necitibil" : `totalul ${lei(o.totalCitit)}`;
        throw eroareRefuz(`Factura easybill cu id-ul ${id}, începută la o încercare anterioară, are ${citit}, iar liniile ei puse de Edinio fac ${lei(asteptat)}. N-o completăm: anuleaz-o în easybill (din pagina facturii: Acțiuni factură, Anulare); factura comenzii o emiți apoi din easybill.`);
      }
    }
    start = k;
    if (!o.creataAcum && o.ceas() + (n - start + 2) * MS_PE_PAS > o.termen) {
      throw eroareRefuz(`Factura easybill cu id-ul ${id}, începută la o încercare anterioară, mai are ${n - start} linii de pus, iar cererea asta nu mai are timp să le pună în siguranță. N-am adăugat nimic: încearcă din nou din pagina comenzii.`);
    }
  }
  for (let i = start; i < n; i++) {
    /* ⚠ TIMPUL SE INTREABA INAINTEA FIECAREI LINII: o functie taiata la mijlocul unei scrieri n-ar mai
       apuca sa spuna nimic. Oprita aici, factura ramane neterminata, dar cu id-ul pe registru. */
    if (o.ceas() + MS_PE_PAS > o.termen) {
      throw eroareNesigura(ramasa(id, i, n, "s-a terminat timpul acestei cereri", "reia"));
    }
    await adaugaLiniaSigur(a, id, linii, i);
  }
  return n - start;
}

export interface OptiuniEmitere {
  /** A mai fost o incercare sub aceeasi cheie de registru. */
  reluare: boolean;
  /**
   * Id-ul facturii ramase, de pe cel mai nou rand al registrului cu referinta (`cuReferintaRamasa`).
   * Drumul obisnuit al reluarii: factura se citeste DUPA ID, nu se cauta.
   */
  ramasa: string | null;
  /** Zilele pentru plasa (cautarea dupa marcaj, `zileDeCautat`). `null` = prima incercare e prea veche. */
  zile: string[] | null;
  /** Clipa (ms de la epoca) pana la care trebuie terminat tot sirul. */
  termen: number;
  /** Ceasul; il schimba doar probele. */
  ceas?: () => number;
}

export interface FacturaEmisa {
  cheie: string;
  /** Factura era inceputa de o incercare de dinainte si a fost completata acum. */
  reluata: boolean;
  /** Cate linii s-au adaugat acum. */
  liniiAdaugate: number;
  /** Data scrisa pe document (`YYYY-MM-DD`): a facturii noi, sau a celei ramase. Gol = necunoscuta. */
  data: string;
}

/** Orice eroare din `fn` pleaca purtand id-ul facturii ramase (registrul il pastreaza pe rand). */
async function cuRamasa<T>(id: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw cuReferintaRamasa(e instanceof Error ? e : eroareNesigura(String(e)), id);
  }
}

async function completeazaRamasa(
  a: AcreditariEasybill,
  gasita: FacturaCitita,
  f: FacturaCompusa,
  t: { termen: number; ceas: () => number },
): Promise<FacturaEmisa> {
  const puse = await completeazaLiniile(a, gasita.cheie, f.linii, {
    citesteIntai: true, creataAcum: false, totalCitit: gasita.total, termen: t.termen, ceas: t.ceas,
  });
  return { cheie: gasita.cheie, reluata: true, liniiAdaugate: puse, data: gasita.data };
}

/**
 * Emiterea completa: clientul, factura goala, liniile una cate una.
 *
 * ═══ VERDICTUL FIECARUI PAS ═══
 *
 *   0. Reluarea: factura ramasa se citeste DUPA ID (randul registrului); fara id, dupa marcaj (plasa,
 *      cu fereastra intreaga sau deloc). Citiri, inaintea oricarei scrieri: o cadere e REFUZ.
 *   1. Clientul (cautare dupa CUI, apoi creare): orice cadere e REFUZ. Nu exista inca document fiscal.
 *   2. Timpul: daca nu ajunge pentru toate liniile, REFUZ, inainte de orice document.
 *   3. Factura goala: refuzul lor e REFUZ; legatura rupta, pagina de eroare, succesul fara id sunt
 *      „NU STIM”. De aici incolo documentul poate exista.
 *   4. Liniile: documentul EXISTA, deci orice esec e „NU STIM”, cu id-ul in mesaj SI pe eroare
 *      (`cuReferintaRamasa`): reluarea il citeste dupa el, oricat de tarziu ar veni.
 *
 * ⚠ O FACTURA RAMASA SE COMPLETEAZA SAU SE REFUZA, NU SE INLOCUIESTE. Anulata, disparuta, cu alte linii
 * sau alt total: refuz, si nicio factura noua peste ea pentru aceeasi cheie.
 */
export async function emiteFactura(a: AcreditariEasybill, f: FacturaCompusa, o: OptiuniEmitere): Promise<FacturaEmisa> {
  const ceas = o.ceas ?? Date.now;
  const t = { termen: o.termen, ceas };
  const n = f.linii.length;

  if (o.ramasa) {
    const id = o.ramasa;
    return cuRamasa(id, async () => {
      const gasita = await citesteFactura(a, id);
      if (!gasita) {
        throw eroareRefuz(`Factura easybill cu id-ul ${id}, începută la o încercare anterioară, nu mai apare în easybill. Nu emitem alta în locul ei fără să știm ce s-a întâmplat cu ea: verifică în easybill și emite factura comenzii de acolo.`);
      }
      if (gasita.anulata) {
        throw eroareRefuz(`Factura easybill ${eticheta(gasita)}, începută la o încercare anterioară, e anulată în easybill. Edinio nu emite alta în locul ei pentru comanda asta: factura comenzii o emiți din easybill.`);
      }
      return completeazaRamasa(a, gasita, f, t);
    });
  }

  if (o.reluare) {
    if (!o.zile) {
      throw eroareRefuz(`Prima încercare de emitere a facturii acestei comenzi e mai veche de ${ZILE_CAUTARE_ORFANA} de zile, iar o factură rămasă de atunci nu se mai poate căuta în siguranță. Edinio nu emite alta: caută în easybill o factură cu „ref. ${f.marcaj}” în observații și emite factura comenzii de acolo.`);
    }
    const gasita = await cautaFacturaRamasa(a, f.marcaj, o.zile);
    if (gasita) return cuRamasa(gasita.cheie, () => completeazaRamasa(a, gasita, f, t));
  }

  const clientId = await clientul(a, f.client);

  const necesar = (n + 3) * MS_PE_PAS;
  if (ceas() + necesar > o.termen) {
    throw eroareRefuz(`Factura are ${n} linii, iar pentru ele, puse una câte una, trebuie cam ${Math.ceil(necesar / 1000)} de secunde; cererea asta nu mai are atât. N-am creat nicio factură: emite-o din pagina comenzii, iar dacă nici acolo nu ajunge timpul, din easybill.`);
  }

  const cheie = await creeazaFactura(a, f.antet, clientId);

  return cuRamasa(cheie, async () => {
    const puse = await completeazaLiniile(a, cheie, f.linii, { citesteIntai: o.reluare, creataAcum: true, ...t });
    return { cheie, reluata: false, liniiAdaugate: puse, data: f.antet.invoiceDate ?? "" };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   PDF-UL
   ═══════════════════════════════════════════════════════════════════════════ */

function incepeCuPdf(octeti: ArrayBuffer): boolean {
  if (octeti.byteLength < 5) return false;
  const c = new Uint8Array(octeti.slice(0, 5));
  return c[0] === 0x25 && c[1] === 0x50 && c[2] === 0x44 && c[3] === 0x46 && c[4] === 0x2d;
}

/**
 * PDF-ul unei facturi (`downloadInvoice_fct`, `fact` = id-ul intern).
 *
 * ⚠ SE VERIFICA CE A VENIT, nu de unde: un PDF incepe cu `%PDF-`. Altfel, un raspuns de eroare
 * (JSON) sau o pagina HTML ar pleca mai departe drept document fiscal, la cumparator sau la eMAG.
 * Aceeasi regula ca `esteChiarPdf` din `billing/factura-comenzii.ts`.
 */
export async function pdfFactura(a: AcreditariEasybill, cheie: string, semnal?: AbortSignal): Promise<ArrayBuffer> {
  let s = await sesiune(a);
  for (let incercare = 0; incercare < 2; incercare++) {
    let res: Response;
    try {
      res = await posteaza(corpulCererii("downloadInvoice_fct", { fact: cheie }, s), {
        termenMs: TERMEN_CITIRE_MS, semnal, accept: "application/pdf, application/json",
      });
    } catch {
      throw eroareRefuz("Nu am putut aduce PDF-ul de la easybill. Încearcă din nou peste un minut.");
    }
    const declarat = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declarat) && declarat > MARIME_MAXIMA_PDF) {
      throw eroareRefuz("PDF-ul facturii e prea mare ca să fie adus prin Edinio. Descarcă-l din contul easybill.");
    }
    let octeti: ArrayBuffer;
    try {
      octeti = await res.arrayBuffer();
    } catch {
      throw eroareRefuz("PDF-ul de la easybill s-a pierdut pe drum. Încearcă din nou.");
    }
    if (octeti.byteLength > MARIME_MAXIMA_PDF) {
      throw eroareRefuz("PDF-ul facturii e prea mare ca să fie adus prin Edinio. Descarcă-l din contul easybill.");
    }
    if (incepeCuPdf(octeti)) return octeti;

    const r = citesteRaspunsul(res.status, new TextDecoder().decode(octeti.slice(0, 4000)), res.headers.get("location"));
    if (r?.fel === "neautentificat" && incercare === 0) {
      s = await sesiuneNoua(a, s);
      continue;
    }
    if (r?.fel === "refuz") throw eroareRefuz(mesajEasybill(r.cod, r.mesaj));
    if (r?.fel === "pagina_de_eroare") {
      throw eroareRefuz("easybill nu a dat PDF-ul (a răspuns cu pagina lor de eroare). Verifică factura în contul easybill.");
    }
    throw eroareRefuz(`easybill nu a trimis un PDF (răspuns ${res.status}). Încearcă din nou sau descarcă factura din contul easybill.`);
  }
  throw respingere("easybill a refuzat sesiunea la descărcarea PDF-ului, chiar după o autentificare reușită. Verifică în easybill drepturile utilizatorului API.");
}

/* ═══════════════════════════════════════════════════════════════════════════
   INCASAREA
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Incasare {
  /** Id-ul intern al facturii. */
  idFactura: string;
  suma: number;
  /** „YYYY-MM-DD”. */
  data: string;
  /** Numarul documentului de plata (aici: numarul comenzii). */
  numar: string;
  detalii: string;
  /** Cine a platit. */
  platitor: string;
}

/**
 * Inregistreaza plata cu cardul pe factura (`addPayment_fct`, `type=card`).
 *
 * ⚠ REUSITA E `status` 0 (exemplul lor: `{"status": "0"}`, ca TEXT), fiindca raspunsul n-are niciun
 * id. Orice alt `status` nenegativ e „nu stim”: o plata inregistrata de doua ori ar dubla incasarea
 * in evidenta comerciantului, deci nu se ghiceste.
 */
export async function inregistreazaIncasarea(a: AcreditariEasybill, i: Incasare): Promise<void> {
  const ce = "înregistrarea încasării";
  const r = await cere(a, "addPayment_fct", {
    invoiceId: i.idFactura,
    type: "card",
    number: i.numar,
    date: i.data,
    details: i.detalii,
    company: i.platitor,
    amount: i.suma.toFixed(2),
    currency: "RON",
    json: "1",
  }, { scriere: true, ce });
  if (r.fel === "date") {
    const d = obiect(r.date);
    if (d && statusul(d) === 0) return;
  }
  throw scriereNelamurita(r, ce);
}
