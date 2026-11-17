import "server-only";
import { eroareCuStatus, eroareDeTermen, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import { adresaApi, citesteCheia, type MediuFactureaza, type SerieFactura } from "./config";

export type { SerieFactura } from "./config";

/**
 * Clientul Factureaza.ro (API GraphQL, https://factureaza.ro/documentatie-api).
 *
 * ═══ FORMA API-ULUI, si de unde stim ═══
 *
 * Un SINGUR capat, `POST /graphql`, cu `{"query": ..., "variables": ...}`. Autentificarea: cheia API
 * ca NUME DE UTILIZATOR intr-un antet `Authorization: Basic`, parola ignorata (documentatia o
 * recomanda; cealalta forma, `?api_key=` in adresa, ar fi dus cheia in jurnalele oricarui proxy).
 *
 * Surse, in ordinea increderii: raspunsurile MASURATE pe sandbox-ul lor public (17.11.2026, cu
 * cheia de proba publicata in documentatie), schema citita prin introspectie, documentatia GraphQL
 * si documentatia REST veche (`/documentatie-api-v1`). Fisa: `docs/facturare/FACTUREAZA.md`.
 *
 * ═══ ⚠ RASPUNSURILE AU TREI FORME, toate masurate ═══
 *
 *   1. `401 text/plain` „401 not authorized - please provide a valid API key”: cheia lipsa sau gresita.
 *   2. `200` cu `{"data": ..., "errors": [...]}`: forma GraphQL. ⚠ Si refuzurile vin pe 200:
 *      validarea lor da `{"data":{"createInvoice":null},"errors":[{"message":"Validare nereuşită …",
 *      "path":["createInvoice"]}]}`; o cerere pe care schema n-o primeste da `errors` FARA `data`.
 *   3. `500` cu `{"error":{"message":"Mysql2::Error: …"},"data":{}}`: eroare interna, cu `error` LA
 *      SINGULAR. Fara ramura ei, mesajul ar fi fost „forma necunoscuta”.
 *
 * ⚠ NICIO VALOARE NU SE LIPESTE IN TEXTUL CERERII: totul pleaca in `variables`. Un nume de client cu
 * ghilimele ar fi rupt cererea, iar unul ales cu grija ar fi schimbat-o.
 */

/** Scrierile asteapta mai mult (un document cu sute de linii); citirile, mai putin. */
const TERMEN_SCRIERE_MS = 30_000;
const TERMEN_CITIRE_MS = 15_000;
/** PDF-ul se genereaza la cerere, la ei (masurat: ~1 s pentru o pagina). */
const TERMEN_PDF_MS = 20_000;
/** PDF-ul se da mai departe intreg; peste plafonul Vercel ar pleca taiat. */
export const MARIME_MAXIMA_PDF = 4_400_000;
/** PDF-ul vine base64 intr-un JSON: 4/3 din octeti, plus ambalajul. */
const MARIME_MAXIMA_RASPUNS_PDF = Math.ceil((MARIME_MAXIMA_PDF * 4) / 3) + 64_000;
/** Orice alt raspuns e mic; unul urias inseamna ca am primit altceva decat am cerut. */
const MARIME_MAXIMA_RASPUNS = 2_000_000;

export type AcreditariFactureaza = { api_key: string; mediu: MediuFactureaza };

/** Codul lor de limita depasita (documentat: `errors[0].extensions.code`). */
export const LIMITA_DEPASITA = "API_RATE_LIMIT_EXCEEDED";
/** Codul pe care il dam noi formei 3 (`error` la singular), ca s-o putem deosebi mai departe. */
export const EROARE_INTERNA = "eroare_interna";

/* ═══════════════════════════════════════════════════════════════════════════
   CEREREA SI RASPUNSUL: pure, ca sa se poata proba fara retea
   ═══════════════════════════════════════════════════════════════════════════ */

/** `Basic base64("<cheie>:x")`, ca in exemplele lor (`-u <cheie>:x`). */
export function antetAutentificare(cheie: string): string {
  return `Basic ${Buffer.from(`${cheie.trim()}:x`, "utf8").toString("base64")}`;
}

export function corpulCererii(document: string, variabile: Record<string, unknown>): string {
  return JSON.stringify({ query: document, variables: variabile });
}

export interface EroareFactureaza {
  mesaj: string;
  /** `extensions.code` (de pilda `API_RATE_LIMIT_EXCEEDED`), sau `null`. */
  cod: string | null;
  /** `path`: unde a cazut. `["createInvoice"]` = chiar mutatia; mai lung = un sub-camp al ei. */
  cale: (string | number)[];
}

export type RaspunsFactureaza = {
  /** `data`, sau `null` cand lipseste (eroare inainte de executie). */
  date: Record<string, unknown> | null;
  erori: EroareFactureaza[];
};

function eroareDin(e: unknown, codImplicit: string | null = null): EroareFactureaza {
  if (!e || typeof e !== "object" || Array.isArray(e)) {
    return { mesaj: typeof e === "string" ? e.trim() : "", cod: codImplicit, cale: [] };
  }
  const x = e as Record<string, unknown>;
  const ext = x.extensions && typeof x.extensions === "object" ? (x.extensions as Record<string, unknown>) : null;
  const cale = Array.isArray(x.path)
    ? x.path.filter((p): p is string | number => typeof p === "string" || typeof p === "number")
    : [];
  return {
    mesaj: typeof x.message === "string" ? x.message.trim() : "",
    cod: typeof ext?.code === "string" ? ext.code : codImplicit,
    cale,
  };
}

/**
 * Ce a raspuns Factureaza.ro, sau `null` daca raspunsul nu are nicio forma cunoscuta.
 *
 * ⚠ `null` NU e un refuz. Pe o scriere inseamna „nu stim daca s-a facut”: vezi `cere`.
 */
export function citesteRaspunsul(text: string): RaspunsFactureaza | null {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as Record<string, unknown>;
  const erori: EroareFactureaza[] = Array.isArray(o.errors) ? o.errors.map((e) => eroareDin(e)) : [];
  /* Forma 3, masurata: `{"error":{"message":"…"},"data":{}}`. */
  if (o.error && typeof o.error === "object" && !Array.isArray(o.error)) erori.push(eroareDin(o.error, EROARE_INTERNA));
  else if (typeof o.error === "string" && o.error.trim()) erori.push({ mesaj: o.error.trim(), cod: EROARE_INTERNA, cale: [] });
  const date = o.data && typeof o.data === "object" && !Array.isArray(o.data) ? (o.data as Record<string, unknown>) : null;
  if (!date && erori.length === 0) return null;
  return { date, erori };
}

/** Ce a facut o mutatie, citit din raspunsul ei. Pur. */
export type VerdictMutatie =
  | { fel: "facut"; rezultat: Record<string, unknown> }
  | { fel: "refuzat"; erori: EroareFactureaza[] }
  | { fel: "nestiut"; motiv: "fara_rezultat" | "subcamp" | "interna" };

/**
 * Verdictul unei mutatii.
 *
 * ⚠ REFUZ DOVEDIT e doar:
 *   - raspunsul FARA `data` deloc: eroarea a venit INAINTE de executie (sintaxa, schema), deci nu
 *     a rulat nimic. ⚠ Acolo `path` e calea din DOCUMENT (masurat: `["mutation","createInvoice",
 *     "campInventat"]`), nu din rezultat, deci lungimea ei nu spune nimic;
 *   - limita depasita (`API_RATE_LIMIT_EXCEEDED`): se verifica inainte de executie, prin definitie;
 *   - `data.<mutatie>: null` cu erori puse PE MUTATIE (calea `["createInvoice"]`): asa raspund ei la
 *     validare (masurat).
 *
 * ⚠ O eroare pe un SUB-CAMP al rezultatului (`["createInvoice", "total"]`, cu `data` prezent)
 * inseamna ca mutatia A RULAT si doar raspunsul s-a stricat: rezultatul nul urca in sus, dar
 * documentul poate exista. Luata drept refuz, ar fi deblocat exact reincercarea care emite a doua
 * factura fiscala. Tot „nu stim” e si eroarea interna (forma 3) si raspunsul fara rezultat si fara
 * erori.
 */
export function verdictMutatie(r: RaspunsFactureaza, radacina: string): VerdictMutatie {
  const v = r.date?.[radacina];
  if (v && typeof v === "object" && !Array.isArray(v)) return { fel: "facut", rezultat: v as Record<string, unknown> };
  if (r.erori.length === 0) return { fel: "nestiut", motiv: "fara_rezultat" };
  if (r.erori.some((e) => e.cod === EROARE_INTERNA)) return { fel: "nestiut", motiv: "interna" };
  if (r.date === null || r.erori.some((e) => e.cod === LIMITA_DEPASITA)) return { fel: "refuzat", erori: r.erori };
  if (r.erori.some((e) => e.cale.length > 1)) return { fel: "nestiut", motiv: "subcamp" };
  return { fel: "refuzat", erori: r.erori };
}

function faraDiacritice(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Mesajul pentru comerciant: ce a spus Factureaza.ro si ce are de facut.
 *
 * ⚠ SE CLASIFICA BRUTUL, se arata traducerea, iar brutul ramane citat: cine ne scrie la suport il
 * poate cauta la ei. Semnaturile sunt mesajele lor REALE, culese pe sandbox, nu inchipuite.
 */
/** „1 minut”, „2 minute”, „20 de minute”, „101 minute”: acordul numeralului, cum se spune. */
function cuNumar(n: number, unu: string, multe: string): string {
  if (n === 1) return unu;
  const r = n % 100;
  return `${n} ${n >= 20 && (r === 0 || r >= 20) ? "de " : ""}${multe}`;
}

export function mesajFactureaza(erori: EroareFactureaza[], secundeReluare?: number | null): string {
  if (erori.some((e) => e.cod === LIMITA_DEPASITA)) {
    const cand = secundeReluare && secundeReluare > 0
      ? ` Reia peste ${secundeReluare < 120 ? cuNumar(secundeReluare, "o secundă", "secunde") : cuNumar(Math.ceil(secundeReluare / 60), "un minut", "minute")}.`
      : " Reia mai târziu.";
    return `Ai atins limita de cereri API din abonamentul Factureaza.ro.${cand} Dacă se repetă, abonamentul are prea puține cereri incluse pentru câte comenzi facturezi.`;
  }
  const mesaje = [...new Set(erori.map((e) => e.mesaj).filter(Boolean))];
  const brut = mesaje.join(" ");
  const fara = brut.replace(/^Validare nereu[şșs]it[ăa]\s*/i, "").trim();
  const citat = brut ? ` („${brut}”)` : "";
  const are = (fraza: string) => frazeleLor(mesaje).some((p) => p === fraza || p.endsWith(` ${fraza}`));
  if (are(FRAZE.anulSeriei)) {
    return `Seria aleasă nu există pe anul documentului în Factureaza.ro${citat}. Creează în Factureaza.ro seria pentru anul curent, cu același prefix, apoi emite din nou.`;
  }
  if (are(FRAZE.numarObligatoriu)) {
    return `Factureaza.ro nu a putut da un număr documentului: seria nu mai există sau nu e pe anul curent${citat}. Verifică seriile în Factureaza.ro.`;
  }
  if (are(FRAZE.clientInexistent) || are(FRAZE.clientObligatoriu)) {
    return `Factureaza.ro nu găsește clientul documentului${citat}. Încearcă din nou; dacă se repetă, scrie-ne.`;
  }
  if (are(FRAZE.totalStornat)) {
    return `Factureaza.ro a refuzat stornarea${citat}. Stornează factura din contul Factureaza.ro.`;
  }
  /* Fara fraza cunoscuta, motivul lor se arata intreg: el spune ce e gresit (si drepturile cheii,
     a caror forma nu s-a putut masura). */
  return fara ? `Factureaza.ro a refuzat cererea: ${fara}` : "Factureaza.ro a refuzat cererea.";
}

/**
 * Frazele lor MASURATE, intregi (fara diacritice, litere mici), dupa care se alege sfatul.
 *
 * ⚠ FRAZE INTREGI, NU SUBSIRURI. Mesajele de validare pot purta si date (o denumire, o cota): un
 * subsir ca „permis” sau „drept” s-ar fi potrivit si pe „Cota TVA nu este permisă” sau pe un produs
 * „dreptunghi”, iar omul ar fi primit sfatul gresit. O fraza se recunoaste doar ca FINAL al unei
 * parti a mesajului (partile sunt despartite prin virgula; in fata sta numele campului, ca in
 * „Serie Anul seriei selectate nu coincide cu data documentului!”, masurat).
 */
const FRAZE = {
  anulSeriei: "anul seriei selectate nu coincide cu data documentului",
  numarObligatoriu: "numar camp obligatoriu",
  clientInexistent: "client nu este inclus in lista",
  clientObligatoriu: "client camp obligatoriu",
  totalStornat: "total stornat trebuie specificata si trebuie sa fie diferita de 0",
} as const;

/** Partile mesajelor, fara „Validare nereușită”, fara diacritice si fara punctuatia de la coada. */
function frazeleLor(mesaje: string[]): string[] {
  return mesaje.flatMap((m) => m.replace(/^Validare nereu[şșs]it[ăa]\s*/i, "").split(/,\s+/))
    .map((p) => faraDiacritice(p).replace(/[\s.!]+$/, "").trim())
    .filter(Boolean);
}

/** Mesajele pentru statusurile HTTP care nu poarta GraphQL. */
function mesajStatus(status: number, mediu: MediuFactureaza): string {
  if (status === 401) {
    return mediu === "test"
      ? "Sandbox-ul Factureaza.ro nu recunoaște cheia API. În modul de test se folosește cheia publică din documentația lor (secțiunea „Sistem sandbox”)."
      : "Factureaza.ro nu recunoaște cheia API. Copiaz-o din nou din contul Factureaza.ro (Contul meu, Cheie API) și verifică să nu fi rămas cheia de test.";
  }
  if (status === 403) {
    return "Contul Factureaza.ro nu are acces la API (abonamentul sau drepturile utilizatorului). Verifică abonamentul și drepturile utilizatorului care a generat cheia.";
  }
  if (status === 429) {
    return "Factureaza.ro a limitat cererile venite de la Edinio. Reîncearcă peste câteva minute.";
  }
  return `Factureaza.ro a răspuns ${status}.`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   APELUL
   ═══════════════════════════════════════════════════════════════════════════ */

type Optiuni = {
  /** Scrierea poate lasa un document in urma; citirea nu. De aici verdictele opuse. */
  scriere: boolean;
  /** Ce se face, pentru mesaje: „emiterea facturii”. */
  ce: string;
  termenMs?: number;
  semnal?: AbortSignal;
  plafon?: number;
};

/**
 * Eroarea „n-am primit un raspuns” (legatura, termen, 5xx, forma necunoscuta), deosebita de un NU
 * al lor. Doar proba de conexiune o intreaba: o pana la ei nu trebuie sa opreasca salvarea.
 */
const FARA_RASPUNS = "faraRaspunsFactureaza" as const;
function faraRaspuns(e: Error): Error {
  return Object.assign(e, { [FARA_RASPUNS]: true });
}
function eFaraRaspuns(e: unknown): boolean {
  return e instanceof Error && (e as Error & { [FARA_RASPUNS]?: boolean })[FARA_RASPUNS] === true;
}

/** Pentru mesajul de limita: cat cer sa asteptam (`Retry-After`, in secunde). */
function secundeDinAntet(res: Response): number | null {
  const n = Number(res.headers.get("retry-after") ?? "");
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
}

/**
 * Un apel GraphQL. Intoarce raspunsul citit (date si erori), ca apelantul sa judece mutatia dupa
 * `verdictMutatie`. Arunca la transport, la status si la o forma necunoscuta.
 *
 * ⚠ VERDICTELE, si de ce difera dupa `scriere`:
 *   - pe o SCRIERE, tot ce nu e un raspuns citit e „nu stim”: cererea poate sa fi ajuns si
 *     documentul sa existe. Un termen depasit clasificat refuz ar debloca exact reincercarea care
 *     emite a doua factura fiscala;
 *   - pe o CITIRE, orice cadere e refuz dovedit: o citire nu creeaza nimic.
 *   - 401, 403 si 429 sunt refuz si pe scriere: au respins cererea inainte s-o execute.
 */
async function cere(
  a: AcreditariFactureaza,
  document: string,
  variabile: Record<string, unknown>,
  o: Optiuni,
): Promise<{ raspuns: RaspunsFactureaza; secundeReluare: number | null }> {
  const cheie = (a.api_key ?? "").trim();
  if (!cheie) throw eroareRefuz("Lipsește cheia API Factureaza.ro.");

  let res: Response;
  try {
    res = await fetch(adresaApi(a.mediu), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: antetAutentificare(cheie),
      },
      body: corpulCererii(document, variabile),
      cache: "no-store",
      redirect: "error",
      signal: o.semnal ?? AbortSignal.timeout(o.termenMs ?? (o.scriere ? TERMEN_SCRIERE_MS : TERMEN_CITIRE_MS)),
    });
  } catch (e) {
    const termen = eroareDeTermen(e, o.scriere, o.ce, "Factureaza.ro");
    if (termen !== e) throw faraRaspuns(termen);
    throw faraRaspuns(o.scriere
      ? eroareNesigura(`Legătura cu Factureaza.ro s-a rupt (${o.ce}), deci nu știm dacă s-a făcut. Verifică în contul Factureaza.ro înainte de a reîncerca.`)
      : eroareRefuz(`Nu am putut contacta Factureaza.ro (${o.ce}). Încearcă din nou peste un minut.`));
  }

  const plafon = o.plafon ?? MARIME_MAXIMA_RASPUNS;
  const declarat = Number(res.headers.get("content-length") ?? "");
  let text = "";
  let citit = false;
  if (!(Number.isFinite(declarat) && declarat > plafon)) {
    try {
      text = await res.text();
      citit = true;
    } catch {
      throw faraRaspuns(o.scriere
        ? eroareNesigura(`Răspunsul Factureaza.ro s-a pierdut pe drum (${o.ce}), deci nu știm dacă s-a făcut. Verifică în contul Factureaza.ro înainte de a reîncerca.`)
        : eroareRefuz(`Răspunsul Factureaza.ro nu a putut fi citit (${o.ce}).`));
    }
  }
  if (!citit || text.length > plafon) {
    throw o.scriere
      ? faraRaspuns(eroareNesigura(`Răspunsul Factureaza.ro e neobișnuit de mare (${o.ce}), deci nu știm dacă s-a făcut. Verifică în contul Factureaza.ro înainte de a reîncerca.`))
      : eroareRefuz(`Răspunsul Factureaza.ro e prea mare ca să fie adus prin Edinio (${o.ce}).`);
  }

  /* Statusurile fara GraphQL in corp: cheia, abonamentul, protectia pe adresa. */
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    throw eroareRefuz(mesajStatus(res.status, a.mediu));
  }
  if (!res.ok) {
    /* 5xx si 408: au primit cererea si au cazut, poate DUPA ce au scris. Pe o scriere, „nu stim”. */
    if (o.scriere) {
      throw faraRaspuns(eroareCuStatus(
        `Factureaza.ro a răspuns cu o eroare (${res.status}) la ${o.ce}. Verifică în contul Factureaza.ro înainte de a reîncerca.`,
        res.status,
      ));
    }
    /* Pe o citire e refuz; dar un 5xx nu e un NU al lor, deci proba de conexiune trebuie sa-l stie. */
    const e = eroareRefuz(`Factureaza.ro a răspuns cu o eroare (${res.status}) la ${o.ce}. Încearcă din nou peste un minut.`);
    throw res.status >= 500 || res.status === 408 ? faraRaspuns(e) : e;
  }

  const raspuns = citesteRaspunsul(text);
  if (!raspuns) {
    throw faraRaspuns(o.scriere
      ? eroareNesigura(`Factureaza.ro a răspuns într-o formă necunoscută (${o.ce}), deci nu știm dacă s-a făcut. Verifică în contul Factureaza.ro înainte de a reîncerca.`)
      : eroareRefuz(`Factureaza.ro a răspuns într-o formă necunoscută (${o.ce}).`));
  }
  return { raspuns, secundeReluare: secundeDinAntet(res) };
}

/**
 * O citire: datele, sau refuz cu mesajul lor. ⚠ Orice eroare intr-o citire e refuz: nu s-a creat
 * nimic. Chiar si o citire „pe jumatate” (date plus erori) se refuza intreaga: o lista partiala de
 * clienti ar fi creat un client in plus, iar una de serii ar fi ales alta serie.
 */
async function citeste(
  a: AcreditariFactureaza,
  document: string,
  variabile: Record<string, unknown>,
  ce: string,
  extra?: Pick<Optiuni, "termenMs" | "semnal" | "plafon">,
): Promise<Record<string, unknown>> {
  const { raspuns, secundeReluare } = await cere(a, document, variabile, { scriere: false, ce, ...extra });
  if (raspuns.erori.length) throw eroareRefuz(mesajFactureaza(raspuns.erori, secundeReluare));
  if (!raspuns.date) throw eroareRefuz(`Factureaza.ro a răspuns fără date (${ce}).`);
  return raspuns.date;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CITIREA DEFENSIVA A RANDURILOR
   ═══════════════════════════════════════════════════════════════════════════ */

const sir = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

function numar(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = sir(v).replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** `isCompany` vine si boolean, si text („false”), dupa cum a fost scris (masurat). */
function boolean(v: unknown): boolean {
  return v === true || (typeof v === "string" && v.trim().toLowerCase() === "true");
}

const idValid = (v: unknown): string | null => {
  const s = sir(v);
  return /^\d{1,20}$/.test(s) ? s : null;
};

export function serieDin(rand: unknown): SerieFactura | null {
  if (!rand || typeof rand !== "object") return null;
  const s = rand as Record<string, unknown>;
  const id = idValid(s.id);
  if (!id) return null;
  return {
    id,
    prefix: sir(s.prefix),
    an: sir(s.year),
    separator: typeof s.sepparator === "string" ? s.sepparator : "",
    sufix: typeof s.suffix === "string" ? s.suffix : "",
    ultimulNumar: numar(s.counterCurrent),
  };
}

export interface ClientCitit {
  id: string;
  nume: string;
  cif: string;
  esteFirma: boolean;
  adresa: string;
  oras: string;
  judet: string;
  tara: string;
  regCom: string;
  codTva: string;
}

export function clientDin(rand: unknown): ClientCitit | null {
  if (!rand || typeof rand !== "object") return null;
  const c = rand as Record<string, unknown>;
  const id = idValid(c.id);
  if (!id) return null;
  return {
    id,
    nume: sir(c.name),
    cif: sir(c.uid),
    esteFirma: boolean(c.isCompany),
    adresa: sir(c.address),
    oras: sir(c.city),
    judet: sir(c.state),
    tara: sir(c.countryIso),
    regCom: sir(c.registrationId),
    codTva: sir(c.taxId),
  };
}

export interface PozitieCitita {
  descriere: string;
  unitate: string;
  cantitate: number | null;
  /** Pretul unitar FARA TVA, cum l-au socotit ei. */
  pret: number | null;
  /** Totalul liniei CU TVA. ⚠ La ei, totalul e autoritar (masurat): pretul se scoate din el. */
  total: number | null;
  cota: number | null;
  cod: string;
  /** `InvoicePosition` la liniile obisnuite. */
  tip: string;
  /** Reducerea procentuala a liniei, daca cineva a pus una din contul lor. */
  reducere: number | null;
}

/** Un document (factura sau stornare), asa cum il stie Factureaza.ro. Doar ce folosim. */
export interface DocumentCitit {
  id: string;
  /** „SRV-1027”: seria si numarul, intr-un singur text, exact cum apar pe PDF. */
  eticheta: string;
  /** 1027: numarul din serie. */
  contor: number | null;
  /** `draft` · `open` · `closed` · `cancelled`. */
  stare: string;
  /** AAAA-LL-ZZ. */
  data: string;
  total: number | null;
  /** Restul de plata. */
  dePlata: number | null;
  clientId: string;
  /** La o stornare: factura stornata. */
  stornataId: string | null;
  /** La o stornare: cat se storneaza din ea. */
  valoareStornata: number | null;
  nota: string;
  pozitii: PozitieCitita[];
}

/** Citirea defensiva a unui document. Pura. `null` = fara id valid. */
export function documentDin(rand: unknown): DocumentCitit | null {
  if (!rand || typeof rand !== "object" || Array.isArray(rand)) return null;
  const f = rand as Record<string, unknown>;
  const id = idValid(f.id);
  if (!id) return null;
  const pozitii = Array.isArray(f.documentPositions) ? f.documentPositions : [];
  const contor = numar(f.documentSeriesCounter);
  return {
    id,
    eticheta: sir(f.series),
    contor: contor !== null && Number.isInteger(contor) ? contor : null,
    stare: sir(f.documentState),
    data: sir(f.documentDate),
    total: numar(f.total),
    dePlata: numar(f.totalDue),
    clientId: sir(f.clientId),
    stornataId: idValid(f.reversedDocumentId),
    valoareStornata: numar(f.inputCurrencyReversing),
    nota: sir(f.note),
    pozitii: pozitii.filter((p): p is Record<string, unknown> => !!p && typeof p === "object").map((p) => ({
      descriere: sir(p.description),
      unitate: sir(p.unit),
      cantitate: numar(p.unitCount),
      pret: numar(p.price),
      total: numar(p.total),
      cota: numar(p.vat),
      cod: sir(p.productCode),
      tip: sir(p.type),
      reducere: numar(p.discountRate),
    })),
  };
}

/**
 * Seria si numarul pentru coloanele comenzii, din eticheta lor („SRV-1027”) si din contor (1027).
 *
 * Seria e ce sta inaintea numarului, fara separatorul de la coada; numarul e scris EXACT ca pe
 * document (cu zerourile din fata si cu sufixul, daca seria le are). Cand eticheta nu se lasa
 * despartita, numarul primeste eticheta INTREAGA: mai bine un numar lung decat unul pierdut.
 */
export function serieSiNumar(eticheta: string, contor: number | null): { serie: string; numar: string } {
  const e = (eticheta ?? "").trim();
  if (contor !== null && Number.isInteger(contor) && contor >= 0) {
    const m = new RegExp(`^(.*?)(0*${contor})(\\D*)$`).exec(e);
    if (m && m[1].trim()) return { serie: m[1].replace(/[\s\-_./]+$/, "").trim(), numar: `${m[2]}${m[3]}` };
    if (!e) return { serie: "", numar: String(contor) };
  }
  return { serie: "", numar: e };
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOCUMENTELE GRAPHQL (constante: valorile pleaca toate in `variables`)
   ═══════════════════════════════════════════════════════════════════════════ */

const CAMPURI_DOCUMENT = "id series documentSeriesCounter documentState documentDate total totalDue clientId reversedDocumentId inputCurrencyReversing note";
const CAMPURI_POZITII = "documentPositions { description unit unitCount price total vat productCode type discountRate }";
const CAMPURI_SERIE = "id prefix year sepparator suffix counterCurrent";
const CAMPURI_CLIENT = "id name uid isCompany address city state countryIso registrationId taxId";

export const DOC_PROBA = `query Proba {
  account { name companyName companyUid companyTaxId }
  invoiceSeries(limit: 200) { ${CAMPURI_SERIE} }
}`;

export const DOC_PREGATIRE = `query Pregatire($nume: String!, $prefix: String!, $an: String!, $marcaj: String!) {
  clienti: clients(name: $nume, limit: 50) { ${CAMPURI_CLIENT} }
  serii: invoiceSeries(prefix: $prefix, year: $an, limit: 20) { ${CAMPURI_SERIE} }
  existente: invoices(where: $marcaj, limit: 5) { ${CAMPURI_DOCUMENT} }
}`;

export const DOC_DE_STORNAT = `query DeStornat($id: String!, $stornari: String!, $prefix: String!, $an: String!) {
  original: invoices(id: $id) { ${CAMPURI_DOCUMENT} ${CAMPURI_POZITII} }
  stornari: invoices(where: $stornari, limit: 5) { ${CAMPURI_DOCUMENT} }
  serii: invoiceSeries(prefix: $prefix, year: $an, limit: 20) { ${CAMPURI_SERIE} }
}`;

export const DOC_CITIRE = `query Citire($ids: [String!]) {
  invoices(ids: $ids) { ${CAMPURI_DOCUMENT} }
}`;

export const DOC_PDF = `query Pdf($id: String!) {
  invoices(id: $id) { id pdfContent }
}`;

export const DOC_CLIENT_NOU = `mutation ClientNou($nume: String!, $adresa: String!, $oras: String!, $tara: String!, $judet: String, $cif: String, $esteFirma: String, $regCom: String, $codTva: String, $platitorTva: String) {
  createClient(name: $nume, address: $adresa, city: $oras, country: $tara, state: $judet, uid: $cif, isCompany: $esteFirma, registrationId: $regCom, taxId: $codTva, vatPayerState: $platitorTva) { id name }
}`;

/*
 * ⚠ `documentState: "open"` SCRIS ANUME. Fara el, documentul se naste CIORNA (masurat: „draft”, cu
 * numar luat din serie, dar fara rest de plata), iar o ciorna nu e o factura emisa.
 * ⚠ Factura si stornarea au DOUA documente separate, nu unul cu argumente nule: `reversedDocumentId:
 * null` pe o factura obisnuita n-are de ce sa ajunga la ei.
 */
export const DOC_FACTURA = `mutation Factura($serie: String!, $data: String!, $client: String!, $scadenta: String!, $mentiune: String, $nota: String!, $pozitii: [DocumentPositionAttributes!]!) {
  createInvoice(currency: "RON", documentState: "open", documentSeriesId: $serie, documentDate: $data, clientId: $client, dueDays: $scadenta, lowerAnnotation: $mentiune, note: $nota, documentPositions: $pozitii) { ${CAMPURI_DOCUMENT} }
}`;

export const DOC_STORNARE = `mutation Stornare($serie: String!, $data: String!, $client: String!, $mentiune: String, $nota: String!, $stornata: String!, $valoare: String!, $pozitii: [DocumentPositionAttributes!]!) {
  createInvoice(currency: "RON", documentState: "open", documentSeriesId: $serie, documentDate: $data, clientId: $client, dueDays: "0", lowerAnnotation: $mentiune, note: $nota, reversedDocumentId: $stornata, inputCurrencyReversing: $valoare, documentPositions: $pozitii) { ${CAMPURI_DOCUMENT} }
}`;

export const DOC_INCASARE = `mutation Incasare($factura: String!, $suma: String!, $data: String!, $descriere: String) {
  createPayment(invoiceId: $factura, amount: $suma, paymentDate: $data, currency: "RON", description: $descriere) { id amount invoiceId }
}`;

/** Filtrul `where` al lor e un TEXT cu JSON (masurat: `{"_eq": {"reversedDocumentId": "…"}}`). */
export function filtruEgal(camp: string, valoare: string): string {
  return JSON.stringify({ _eq: { [camp]: valoare } });
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROBA DE CONEXIUNE SI SERIILE
   ═══════════════════════════════════════════════════════════════════════════ */

export type ProbaReusita = { ok: true; serii: SerieFactura[]; firma: { nume: string; cif: string } | null };

/**
 * Proba de conexiune: firma contului si seriile de facturi, intr-o singura citire.
 *
 * ⚠ AUTENTIFICATA, pe gazda mediului ales: o proba pe un capat public ar fi raspuns „reusit” pentru
 * orice cheie (defectul fGO din 15.08.2026). Nu scrie nimic.
 *
 * ⚠ Seriile fac parte din proba, nu sunt un bonus: fara drept de citire a seriilor, nicio emitere nu
 * poate afla seria anului, deci o cheie care nu le poate citi e refuzata aici, nu la prima comanda.
 * Firma, in schimb, e doar pentru ecran: daca nu se poate citi, proba trece fara ea.
 *
 * `refuz` deosebeste „Factureaza.ro a raspuns NU” (cheie gresita, abonament fara API) de „n-am ajuns
 * la ei": salvarea il opreste pe primul si il lasa pe al doilea sa treaca, cu avertisment.
 */
export async function testeazaConexiunea(
  a: AcreditariFactureaza,
): Promise<ProbaReusita | { ok: false; error: string; refuz: boolean }> {
  let r: Awaited<ReturnType<typeof cere>>;
  try {
    r = await cere(a, DOC_PROBA, {}, { scriere: false, ce: "verificarea conexiunii" });
  } catch (e) {
    return {
      ok: false,
      refuz: !eFaraRaspuns(e),
      error: e instanceof Error ? e.message : "Nu am putut contacta Factureaza.ro.",
    };
  }
  const { raspuns, secundeReluare } = r;
  /* Limita depasita: cheia e buna (au recunoscut-o), doar ca acum nu mai primesc cereri. */
  if (raspuns.erori.some((e) => e.cod === LIMITA_DEPASITA)) {
    return { ok: false, refuz: false, error: mesajFactureaza(raspuns.erori, secundeReluare) };
  }
  const serii = raspuns.date?.invoiceSeries;
  if (!Array.isArray(serii)) {
    return {
      ok: false,
      refuz: true,
      error: raspuns.erori.length
        ? `Factureaza.ro nu a dat seriile de facturi: ${mesajFactureaza(raspuns.erori)}`
        : "Factureaza.ro nu a dat seriile de facturi, deci facturile nu s-ar putea emite.",
    };
  }
  const conturi = raspuns.date?.account;
  const cont = Array.isArray(conturi) && conturi[0] && typeof conturi[0] === "object" ? (conturi[0] as Record<string, unknown>) : null;
  const nume = sir(cont?.companyName) || sir(cont?.name);
  const cif = [sir(cont?.companyTaxId), sir(cont?.companyUid)].filter(Boolean).join("");
  return {
    ok: true,
    serii: serii.map(serieDin).filter((s): s is SerieFactura => !!s),
    firma: nume || cif ? { nume, cif } : null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMITEREA
   ═══════════════════════════════════════════════════════════════════════════ */

/** Clientul de pe document, inainte de a exista in nomenclatorul lor. */
export interface ClientNou {
  nume: string;
  adresa: string;
  oras: string;
  judet: string;
  /** Codul ISO-2 („RO”). */
  tara: string;
  /** CIF-ul fara „RO” (firma) sau CNP-ul necunoscut, 13 zerouri (persoana fizica). */
  cif: string;
  esteFirma: boolean;
  regCom: string;
  /** „RO” la platitorii de TVA, gol altfel: ei tiparesc „RO” + CIF din cele doua. */
  codTva: string;
  platitorTva: "vat_payer" | "no_vat_payer" | null;
}

/** O linie, in forma lor (`DocumentPositionAttributes`). Toate valorile sunt TEXT, ca in schema. */
export interface PozitieNoua {
  description: string;
  unit: string;
  unitCount: string;
  /** Totalul liniei CU TVA. ⚠ Autoritar la ei (masurat), deci documentul iese pe suma lor. */
  total: string;
  vat: string;
  productCode?: string;
  position?: string;
}

export interface Pregatire {
  clienti: ClientCitit[];
  serii: SerieFactura[];
  /** Documentele care poarta deja marcajul acestei emiteri (vezi `marcajEmitere`). */
  existente: DocumentCitit[];
}

/**
 * Tot ce trebuie aflat inainte de emitere, intr-o SINGURA cerere: clientii cu acelasi nume, seria
 * anului si documentele care poarta deja marcajul emiterii.
 *
 * ⚠ O cerere, nu trei: abonamentele lor au cereri API numarate pe ora, pe zi si pe luna (Basic: 500
 * pe luna), iar o factura costa deja doua-trei.
 */
export async function pregatesteEmiterea(
  a: AcreditariFactureaza,
  p: { nume: string; prefix: string; an: string; marcaj: string },
): Promise<Pregatire> {
  const d = await citeste(a, DOC_PREGATIRE, {
    nume: p.nume, prefix: p.prefix, an: p.an, marcaj: filtruEgal("note", p.marcaj),
  }, "pregătirea facturii");
  const lista = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    clienti: lista(d.clienti).map(clientDin).filter((c): c is ClientCitit => !!c),
    serii: lista(d.serii).map(serieDin).filter((s): s is SerieFactura => !!s),
    existente: lista(d.existente).map(documentDin).filter((x): x is DocumentCitit => !!x),
  };
}

/**
 * Creeaza clientul in nomenclatorul lor si intoarce id-ul.
 *
 * ⚠ ORICE ESEC E REFUZ, chiar si un termen depasit: clientul vine INAINTEA facturii, deci nu exista
 * inca niciun document fiscal de dublat. Cel mult ramane un client in plus in nomenclator, ceea ce
 * nu strica nimic; registrul trebuie lasat liber, nu blocat pentru atat.
 */
export async function creeazaClientul(a: AcreditariFactureaza, c: ClientNou): Promise<string> {
  let r: Awaited<ReturnType<typeof cere>>;
  try {
    r = await cere(a, DOC_CLIENT_NOU, {
      nume: c.nume,
      adresa: c.adresa,
      oras: c.oras,
      tara: c.tara,
      ...(c.judet ? { judet: c.judet } : {}),
      ...(c.cif ? { cif: c.cif } : {}),
      esteFirma: c.esteFirma ? "true" : "false",
      ...(c.regCom ? { regCom: c.regCom } : {}),
      ...(c.codTva ? { codTva: c.codTva } : {}),
      ...(c.platitorTva ? { platitorTva: c.platitorTva } : {}),
    }, { scriere: true, ce: "crearea clientului" });
  } catch (e) {
    throw eroareRefuz(e instanceof Error ? e.message : "Clientul nu s-a putut crea în Factureaza.ro.");
  }
  const v = verdictMutatie(r.raspuns, "createClient");
  if (v.fel === "facut") {
    const id = idValid(v.rezultat.id);
    if (id) return id;
  }
  if (v.fel === "refuzat") throw eroareRefuz(`Clientul nu s-a putut crea: ${mesajFactureaza(v.erori, r.secundeReluare)}`);
  throw eroareRefuz("Factureaza.ro nu a confirmat crearea clientului. Încearcă din nou.");
}

export interface DocumentNou {
  serieId: string;
  /** AAAA-LL-ZZ, in ora Romaniei. */
  data: string;
  clientId: string;
  /** Doar la factura; stornarea e scadenta in ziua ei. */
  scadentaZile?: number;
  /** Observatiile tiparite sub tabel. ⚠ Ajung si in e-Factura, ca nota (masurat in XML-ul lor). */
  mentiune: string;
  /** Nota interna, nevazuta pe document: marcajul emiterii (vezi `marcajEmitere`). */
  nota: string;
  pozitii: PozitieNoua[];
  /** Doar la stornare: factura stornata si cat se storneaza din ea (pozitiv). */
  stornata?: { id: string; valoare: string };
}

/**
 * Emite un document (factura sau stornarea ei) si il intoarce asa cum l-au scris ei.
 *
 * ⚠ RASPUNSUL MUTATIEI E SI CITIREA: seria, numarul, starea si totalul vin in el. Nu mai e nevoie de
 * o citire dupa emitere, deci nici de fereastra in care documentul exista dar comanda nu-i stie
 * numarul.
 *
 * ⚠ SUCCESUL FARA ID e „nu stim”, nu reusita si nu refuz: documentul aproape sigur exista, dar fara
 * id nu-l putem lega de comanda. Registrul blocheaza si omul verifica.
 */
export async function emiteDocumentul(
  a: AcreditariFactureaza,
  d: DocumentNou,
  ce = "emiterea facturii",
): Promise<DocumentCitit> {
  const comune = {
    serie: d.serieId,
    data: d.data,
    client: d.clientId,
    mentiune: d.mentiune,
    nota: d.nota,
    pozitii: d.pozitii,
  };
  const { raspuns, secundeReluare } = d.stornata
    ? await cere(a, DOC_STORNARE, { ...comune, stornata: d.stornata.id, valoare: d.stornata.valoare }, { scriere: true, ce })
    : await cere(a, DOC_FACTURA, { ...comune, scadenta: String(Math.max(0, Math.floor(d.scadentaZile ?? 0))) }, { scriere: true, ce });
  const v = verdictMutatie(raspuns, "createInvoice");
  if (v.fel === "refuzat") throw eroareRefuz(mesajFactureaza(v.erori, secundeReluare));
  if (v.fel === "nestiut") {
    throw eroareNesigura(`Factureaza.ro nu a confirmat limpede ${ce}, deci nu știm dacă documentul s-a creat. Verifică în contul Factureaza.ro înainte de a reîncerca.`);
  }
  const doc = documentDin(v.rezultat);
  if (!doc) {
    throw eroareNesigura("Factureaza.ro a confirmat documentul, dar fără id. Verifică în contul Factureaza.ro: îl găsești după numărul comenzii din observații.");
  }
  return doc;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CITIRILE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Citeste documente dupa id. Cele care nu exista lipsesc din raspuns (masurat: un id inexistent da
 * lista goala, fara eroare).
 *
 * ⚠ Se intorc doar randurile cu CHIAR id-urile cerute: daca filtrul ar fi ignorat vreodata, raspunsul
 * ar fi o lista intreaga, iar primul rand ar fi fost documentul altcuiva.
 */
export async function citesteDocumentele(a: AcreditariFactureaza, ids: string[]): Promise<DocumentCitit[]> {
  const cerute = [...new Set(ids.filter((x) => /^\d{1,20}$/.test(x)))];
  if (cerute.length === 0) return [];
  const d = await citeste(a, DOC_CITIRE, { ids: cerute }, "citirea documentului");
  const lista = Array.isArray(d.invoices) ? d.invoices : [];
  return lista.map(documentDin).filter((x): x is DocumentCitit => !!x && cerute.includes(x.id));
}

export interface DeStornat {
  original: DocumentCitit | null;
  /** Stornarile deja emise pentru ea (din contul lor sau de o incercare al carei raspuns s-a pierdut). */
  stornari: DocumentCitit[];
  serii: SerieFactura[];
}

/** Factura de stornat, cu liniile ei, stornarile ei si seria anului, intr-o singura cerere. */
export async function citesteDeStornat(
  a: AcreditariFactureaza,
  p: { id: string; prefix: string; an: string },
): Promise<DeStornat> {
  const d = await citeste(a, DOC_DE_STORNAT, {
    id: p.id, stornari: filtruEgal("reversedDocumentId", p.id), prefix: p.prefix, an: p.an,
  }, "citirea facturii de stornat");
  const lista = (v: unknown) => (Array.isArray(v) ? v : []);
  const original = lista(d.original).map(documentDin).find((x) => x?.id === p.id) ?? null;
  return {
    original,
    stornari: lista(d.stornari).map(documentDin).filter((x): x is DocumentCitit => !!x && x.stornataId === p.id),
    serii: lista(d.serii).map(serieDin).filter((s): s is SerieFactura => !!s),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PDF-UL
   ═══════════════════════════════════════════════════════════════════════════ */

function incepeCuPdf(octeti: Uint8Array): boolean {
  return octeti.byteLength >= 5
    && octeti[0] === 0x25 && octeti[1] === 0x50 && octeti[2] === 0x44 && octeti[3] === 0x46 && octeti[4] === 0x2d;
}

/**
 * PDF-ul unui document (factura sau stornare: amandoua sunt `Invoice` la ei), dupa cheia de pe
 * comanda. Vine base64 in campul `pdfContent`, rupt pe randuri (masurat).
 *
 * ⚠ CHEIA SPUNE GAZDA. Un document de test exista doar in sandbox, unul real doar in productie: cu
 * cheia celuilalt mediu, acelasi id ar fi putut fi documentul altui cont. Se refuza, nu se ghiceste.
 *
 * ⚠ SE VERIFICA CE A VENIT, nu de unde: un PDF incepe cu `%PDF-`. Altfel o eroare sau o pagina HTML
 * ar pleca mai departe drept document fiscal, la cumparator sau la eMAG (vezi `esteChiarPdf`).
 */
export async function pdfFactura(
  a: AcreditariFactureaza,
  cheie: string,
  semnal?: AbortSignal,
): Promise<ArrayBuffer> {
  const c = citesteCheia(cheie);
  if (!c) throw eroareRefuz("Documentul nu are un id Factureaza.ro valid.");
  if (c.mediu !== a.mediu) {
    throw eroareRefuz(c.mediu === "test"
      ? "Documentul a fost emis în modul de test (sandbox-ul Factureaza.ro), iar acum e legat contul real. Nu e un document fiscal și nu se mai poate aduce de aici."
      : "Documentul e din contul real Factureaza.ro, iar integrarea e acum în modul de test. Treci pe Real ca să-l aduci.");
  }
  const d = await citeste(a, DOC_PDF, { id: c.id }, "aducerea PDF-ului", {
    semnal: semnal ?? AbortSignal.timeout(TERMEN_PDF_MS),
    plafon: MARIME_MAXIMA_RASPUNS_PDF,
  });
  const lista = Array.isArray(d.invoices) ? d.invoices : [];
  const rand = lista.find((x) => x && typeof x === "object" && sir((x as Record<string, unknown>).id) === c.id) as Record<string, unknown> | undefined;
  if (!rand) throw eroareRefuz("Factureaza.ro nu mai găsește documentul. Verifică în contul Factureaza.ro dacă a fost șters.");
  const b64 = typeof rand.pdfContent === "string" ? rand.pdfContent.replace(/\s+/g, "") : "";
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    throw eroareRefuz("Factureaza.ro nu a trimis un PDF. Încearcă din nou sau descarcă documentul din contul Factureaza.ro.");
  }
  if (Math.floor((b64.length * 3) / 4) > MARIME_MAXIMA_PDF) {
    throw eroareRefuz("PDF-ul documentului e prea mare ca să fie adus prin Edinio. Descarcă-l din contul Factureaza.ro.");
  }
  const brut = Buffer.from(b64, "base64");
  const octeti = new Uint8Array(brut.byteLength);
  octeti.set(brut);
  if (!incepeCuPdf(octeti)) {
    throw eroareRefuz("Ce a trimis Factureaza.ro nu e un PDF. Descarcă documentul din contul Factureaza.ro.");
  }
  return octeti.buffer;
}

/* ═══════════════════════════════════════════════════════════════════════════
   INCASAREA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Inregistreaza plata unei facturi (`createPayment`, legata de factura prin `invoiceId`). Masurat:
 * restul de plata al facturii scade la zero.
 *
 * ⚠ FARA `paymentType`: e text liber la ei (masurat: primeste si „xyz”, fara validare), iar valorile
 * din meniul lor nu sunt publicate. Felul platii merge in descriere, unde omul il citeste.
 */
export async function inregistreazaIncasarea(
  a: AcreditariFactureaza,
  p: { facturaId: string; suma: number; data: string; descriere: string },
): Promise<string | null> {
  const { raspuns, secundeReluare } = await cere(a, DOC_INCASARE, {
    factura: p.facturaId,
    suma: p.suma.toFixed(2),
    data: p.data,
    descriere: p.descriere,
  }, { scriere: true, ce: "înregistrarea încasării" });
  const v = verdictMutatie(raspuns, "createPayment");
  if (v.fel === "refuzat") throw eroareRefuz(mesajFactureaza(v.erori, secundeReluare));
  if (v.fel === "nestiut") {
    throw eroareNesigura("Factureaza.ro nu a confirmat limpede încasarea, deci nu știm dacă s-a înregistrat. Verifică factura în contul Factureaza.ro.");
  }
  return idValid(v.rezultat.id);
}
