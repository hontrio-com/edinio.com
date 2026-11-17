import "server-only";
import { eroareCuStatus, eroareDeTermen, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import type { FacturisConfig } from "./config";

/**
 * Clientul Facturis Online (API v2.0, https://facturis-online.ro/apidoc/).
 *
 * ═══ FORMA API-ULUI, si de unde stim ═══
 *
 * Un SINGUR capat, `POST https://api.facturis-online.ro/api/`, cu un singur camp de formular,
 * `json`, care poarta tot obiectul: acreditarile (`APIkey`, `u`, `p`, `c`), metoda (`met`),
 * actiunea (`act`) si parametrii. Raspunsul e `{"success": 2000, "result": ...}` la reusita si
 * `{"error": <cod>, "result": "<mesaj>"}` la refuz. Exceptie: `FacturiHtml` intoarce direct
 * octetii PDF-ului, nu JSON.
 *
 * Surse, in ordinea increderii: documentatia lor v2.0 (descarcata pe 17.11.2026), modulul lor
 * oficial de WordPress (`facturis-online-sync` 2.0.5, citit) si ghidul easySales de conectare
 * (mesajele de eroare reale). Ce NU spune nimeni e scris ca atare in `docs/facturare/FACTURIS.md`.
 *
 * ⚠ CAMPUL `json` SE CODEAZA. Exemplul lor PHP il lipeste necodat (`"json=" . json_encode(...)`),
 * iar modulul lor sterge din texte `%`, `&`, `'` si `"` tocmai ca sa nu-si rupa singur cererea. Noi
 * il codam ca exemplul lor `curl --data-urlencode`, deci textele pleaca intregi.
 *
 * ⚠ ACREDITARILE STAU IN CORP, nu in adresa: in `?json=` (forma din titlul documentatiei) ar fi
 * ajuns in jurnalele oricarui proxy dintre noi si ei.
 */

export const ADRESA_FACTURIS = "https://api.facturis-online.ro/api/";

/** Scrierile asteapta mai mult: un document cu sute de linii. Citirile, mai putin. */
const TERMEN_SCRIERE_MS = 30_000;
const TERMEN_CITIRE_MS = 15_000;
/** PDF-ul se cere o data si se da mai departe; peste plafonul Vercel ar pleca taiat. */
export const MARIME_MAXIMA_PDF = 4_400_000;

export type AcreditariFacturis = Pick<FacturisConfig, "api_key" | "username" | "password" | "cif">;

/** Codul lor pentru „nu exista rezultate" (documentat la `Fisa Produs`, intors si de `Get`). */
export const FARA_REZULTATE = "5005";

/* ═══════════════════════════════════════════════════════════════════════════
   CEREREA SI RASPUNSUL — pure, ca sa se poata proba fara retea
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Corpul cererii: `json=<obiectul codat>`.
 *
 * ⚠ Acreditarile se scriu DUPA parametri: un parametru cu acelasi nume nu le poate inlocui.
 */
export function corpulCererii(
  a: AcreditariFacturis,
  met: string,
  act: string,
  parametri: Record<string, unknown> = {},
): string {
  const obiect = {
    ...parametri,
    APIkey: a.api_key.trim(),
    u: a.username.trim(),
    p: a.password,
    c: a.cif.trim(),
    met,
    act,
  };
  return new URLSearchParams({ json: JSON.stringify(obiect) }).toString();
}

export type RaspunsFacturis =
  | { ok: true; rezultat: unknown }
  | { ok: false; cod: string | null; mesaj: string };

/**
 * Ce a raspuns Facturis, sau `null` daca raspunsul nu are niciuna din cele doua forme cunoscute.
 *
 * ⚠ `null` NU e un refuz. Pe o scriere inseamna „nu stim daca s-a facut" — vezi `cere`.
 * ⚠ `success` vine numar in documentatie si e comparat ca SIR in modulul lor (`== '2000'`): se
 * primesc amandoua.
 */
export function citesteRaspunsul(text: string): RaspunsFacturis | null {
  let date: unknown;
  try {
    date = JSON.parse(text);
  } catch {
    return null;
  }
  if (!date || typeof date !== "object" || Array.isArray(date)) return null;
  const d = date as Record<string, unknown>;
  if (d.error !== undefined && d.error !== null && d.error !== "" && d.error !== false) {
    return { ok: false, cod: String(d.error), mesaj: textulMesajului(d.result, d.msg) };
  }
  if (String(d.success ?? "") === "2000") return { ok: true, rezultat: d.result };
  return null;
}

/**
 * Campurile lor, pe intelesul comerciantului. Doar cele pe care le trimitem noi; restul raman cu
 * numele lor tehnic, care e tot mai bun decat un JSON.
 */
const CAMPURI: Record<string, string> = {
  APIkey: "cheia API", u: "utilizatorul", p: "parola", c: "codul fiscal al firmei",
  facturi_serie: "seria", facturi_data: "data facturii", facturi_nume_client: "numele clientului",
  facturi_codf_client: "codul fiscal al clientului", facturi_nrreg_client: "numărul de la Registrul Comerțului",
  facturi_sediu_client: "adresa clientului", facturi_judet_client: "județul clientului",
  facturi_prod_nume: "denumirea produsului", facturi_prod_pretftva: "prețul fără TVA",
  facturi_prod_cant: "cantitatea", facturi_prod_tva: "cota de TVA",
  fk_clienti_key: "clientul", incasari_data: "data încasării", incasari_suma: "suma încasată",
};

/**
 * Textul refuzului. ⚠ MASURAT PE FIR (17.11.2026): `result` vine SIR la refuzurile obisnuite
 * („Datele de autentificare sunt gresite", cod 1004) si OBIECT la validare, cu cate o intrare pe
 * camp, plus `msg` deasupra:
 *
 *   {"msg":"Campul este obligatoriu!","cod":1005,"error":"1005",
 *    "result":{"c":{"msg":"Campul este obligatoriu!","cod":1005}, ...}}
 *
 * Fara ramura de obiect, comerciantul ar fi primit JSON-ul brut drept mesaj.
 */
function textulMesajului(v: unknown, msgSus?: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.msg === "string" && o.msg.trim()) return o.msg.trim();
    /* Cate o intrare pe camp: „Campul este obligatoriu!: seria, cantitatea". */
    const peCamp = Object.entries(o).filter(([, x]) => x && typeof x === "object" && typeof (x as { msg?: unknown }).msg === "string");
    if (peCamp.length) {
      const mesaje = [...new Set(peCamp.map(([, x]) => String((x as { msg: string }).msg).trim()))];
      const campuri = peCamp.map(([k]) => CAMPURI[k] ?? k);
      return `${mesaje.join(" ")} (${campuri.join(", ")})`;
    }
    if (typeof msgSus === "string" && msgSus.trim()) return msgSus.trim();
    try {
      return JSON.stringify(v).slice(0, 300);
    } catch {
      return "";
    }
  }
  if (typeof msgSus === "string" && msgSus.trim()) return msgSus.trim();
  return v == null ? "" : String(v);
}

function faraDiacritice(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Mesajul pentru comerciant: ce a spus Facturis, si ce are de facut.
 *
 * ⚠ SE CLASIFICA BRUTUL, se arata traducerea, iar brutul ramane in mesaj intre ghilimele: cine ne
 * scrie la suport il poate cauta in documentatia lor. Semnaturile sunt mesajele REALE culese de
 * ghidul easySales, nu inchipuite.
 */
export function mesajFacturis(cod: string | null, brut: string): string {
  const m = faraDiacritice(brut);
  const citat = brut ? ` („${brut}”)` : "";
  if (m.includes("autentificare")) {
    return `Facturis a respins utilizatorul, parola sau codul fiscal${citat}. Folosește utilizatorul care a generat cheia API, cu parola lui, și codul fiscal scris exact ca în Facturis.`;
  }
  if (m.includes("cheia api") || m.includes("apikey") || m.includes("api key")) {
    return `Facturis nu recunoaște cheia API${citat}. Generează una nouă din Facturis (Setări, Integrări, API), lasă câmpul „Ip Acces” gol și lipește cheia aici.`;
  }
  if (m.includes("pachet")) {
    return `Contul Facturis nu are acces la API${citat}. Activează din contul Facturis pachetul care include API-ul, apoi încearcă din nou.`;
  }
  if (m.includes("seria")) {
    return `Facturis nu găsește seria${citat}. Creează seria în Facturis sau scrie aici o serie care există deja în contul tău.`;
  }
  if (m.includes("permisiuni") || m.includes("permisiune")) {
    return `Utilizatorul Facturis nu are drepturi pentru operația asta${citat}. Folosește utilizatorul administrator al contului.`;
  }
  const codul = cod ? ` (cod ${cod})` : "";
  return brut
    ? `Facturis a refuzat cererea: ${brut}${codul}`
    : `Facturis a refuzat cererea${codul}.`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   APELUL
   ═══════════════════════════════════════════════════════════════════════════ */

type Optiuni = {
  /** Scrierea poate lasa un document in urma; citirea nu. De aici verdictele opuse. */
  scriere: boolean;
  /** Ce se face, pentru mesaje: „emiterea facturii". */
  ce: string;
};

/**
 * Un apel JSON. Arunca DOAR la transport si la un raspuns de forma necunoscuta; refuzul lor
 * (`error`) se intoarce, ca apelantul sa poata deosebi „nu exista" (5005) de un refuz adevarat.
 *
 * ⚠ VERDICTELE, si de ce difera dupa `scriere`:
 *   - pe o SCRIERE, tot ce nu e un raspuns citit e „nu stim": cererea poate sa fi ajuns si
 *     documentul sa existe. Un timeout clasificat refuz ar debloca exact reincercarea care emite a
 *     doua factura fiscala;
 *   - pe o CITIRE, orice cadere e refuz dovedit: o citire nu creeaza nimic.
 */
async function cere(
  a: AcreditariFacturis,
  met: string,
  act: string,
  parametri: Record<string, unknown>,
  o: Optiuni,
): Promise<RaspunsFacturis> {
  let res: Response;
  try {
    res = await fetch(ADRESA_FACTURIS, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
      },
      body: corpulCererii(a, met, act, parametri),
      cache: "no-store",
      signal: AbortSignal.timeout(o.scriere ? TERMEN_SCRIERE_MS : TERMEN_CITIRE_MS),
    });
  } catch (e) {
    const termen = eroareDeTermen(e, o.scriere, o.ce, "Facturis");
    if (termen !== e) throw termen;
    throw o.scriere
      ? eroareNesigura(`Legătura cu Facturis s-a rupt (${o.ce}), deci nu știm dacă s-a făcut. Verifică în contul Facturis înainte de a reîncerca.`)
      : eroareRefuz(`Nu am putut contacta Facturis (${o.ce}). Încearcă din nou peste un minut.`);
  }

  let text: string;
  try {
    text = await res.text();
  } catch {
    throw o.scriere
      ? eroareNesigura(`Răspunsul Facturis s-a pierdut pe drum (${o.ce}), deci nu știm dacă s-a făcut. Verifică în contul Facturis înainte de a reîncerca.`)
      : eroareRefuz(`Răspunsul Facturis s-a pierdut pe drum (${o.ce}).`);
  }

  const r = citesteRaspunsul(text);
  /* Un refuz al lor e refuz si pe un status HTTP de eroare: l-au citit si au raspuns. */
  if (r && !r.ok) return r;
  if (!res.ok) {
    throw o.scriere
      ? eroareCuStatus(`Facturis a răspuns ${res.status} (${o.ce}). Verifică în contul Facturis înainte de a reîncerca.`, res.status)
      : eroareRefuz(`Facturis a răspuns ${res.status} (${o.ce}).`);
  }
  if (!r) {
    throw o.scriere
      ? eroareNesigura(`Facturis a răspuns într-o formă necunoscută (${o.ce}), deci nu știm dacă s-a făcut. Verifică în contul Facturis înainte de a reîncerca.`)
      : eroareRefuz(`Facturis a răspuns într-o formă necunoscută (${o.ce}).`);
  }
  return r;
}

/* ═══════════════════════════════════════════════════════════════════════════
   FACTURA
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Id-ul documentului din raspunsul la `Ins`.
 *
 * ⚠ Documentatia v2 da `result.id`; modulul lor oficial citeste `result.id_fact`. Se primesc
 * amandoua, plus `facturi_key` (numele campului la citire). Doar cifre: un id gol sau ciudat nu
 * se scrie pe comanda, fiindca de el atarna stornarea si PDF-ul.
 */
export function cheiaDinRaspuns(rezultat: unknown): string | null {
  if (!rezultat || typeof rezultat !== "object") return null;
  const r = rezultat as Record<string, unknown>;
  for (const camp of ["id", "id_fact", "facturi_key"]) {
    const v = r[camp];
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    if (/^\d+$/.test(s) && s !== "0") return s;
  }
  return null;
}

/**
 * Emite o factura (`Facturi` / `Ins`) si intoarce id-ul ei.
 *
 * ⚠ SUCCESUL FARA ID e „nu stim", nu reusita si nu refuz: documentul aproape sigur exista (au
 * raspuns 2000), dar fara id nu-l putem lega de comanda. Registrul blocheaza si omul verifica.
 */
export async function emiteFactura(
  a: AcreditariFacturis,
  dataFact: Record<string, unknown>,
  dataProd: Record<string, unknown>[],
  ce = "emiterea facturii",
): Promise<string> {
  const r = await cere(a, "Facturi", "Ins", { dataFact, dataProd }, { scriere: true, ce });
  if (!r.ok) throw eroareRefuz(mesajFacturis(r.cod, r.mesaj));
  const cheie = cheiaDinRaspuns(r.rezultat);
  if (!cheie) {
    throw eroareNesigura(
      "Facturis a confirmat salvarea, dar nu a trimis id-ul documentului. Verifică în contul Facturis: "
      + "dacă documentul există, îl găsești după numărul comenzii din observații.",
    );
  }
  return cheie;
}

/** O linie de factura, asa cum o intoarce `Facturi` / `Get`. Toate valorile vin ca text. */
export interface LinieCitita {
  nume: string;
  pretFaraTva: string;
  pretCuTva: string;
  cantitate: string;
  valoare: string;
  valoareTva: string;
  valoareTotala: string;
  cota: string;
  moneda: string;
  codEan: string;
  codSku: string;
  codAlt: string;
  codCautare: string;
}

/** Factura, asa cum o stie Facturis. Doar ce folosim. */
export interface FacturaCitita {
  cheie: string;
  serie: string;
  numar: string;
  /** „DD-MM-YYYY HH:MM:SS", cum o scriu ei. */
  data: string;
  /** Totalul documentului, cu TVA. */
  total: number | null;
  status: string;
  statusEfactura: string;
  /** Clientul din nomenclatorul lor: de el atarna inregistrarea incasarii. */
  clientCheie: string;
  client: {
    nume: string;
    tipPersoana: string;
    codFiscal: string;
    nrReg: string;
    sediu: string;
    judet: string;
    oras: string;
    tara: string;
    cont: string;
    banca: string;
    telefon: string;
    adresaLivrare: string;
  };
  moneda: string;
  cotaDocument: string;
  linii: LinieCitita[];
}

const sir = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function numar(v: unknown): number | null {
  const s = sir(v).replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Citirea defensiva a unei facturi din raspunsul `Get`. Pura. */
export function facturaDinRand(rand: unknown): FacturaCitita | null {
  if (!rand || typeof rand !== "object" || Array.isArray(rand)) return null;
  const f = rand as Record<string, unknown>;
  const cheie = sir(f.facturi_key);
  if (!cheie) return null;
  const linii = Array.isArray(f.dataProd) ? f.dataProd : [];
  return {
    cheie,
    serie: sir(f.facturi_serie),
    numar: sir(f.facturi_serie_numar),
    data: sir(f.facturi_data),
    total: numar(f.facturi_prod_val_tot),
    status: sir(f.facturi_status),
    statusEfactura: sir(f.facturi_status_efactura),
    clientCheie: sir(f.fk_clienti_key),
    client: {
      nume: sir(f.facturi_nume_client),
      tipPersoana: sir(f.facturi_tip_persoana),
      codFiscal: sir(f.facturi_codf_client),
      nrReg: sir(f.facturi_nrreg_client),
      sediu: sir(f.facturi_sediu_client),
      judet: sir(f.facturi_judet_client),
      oras: sir(f.clienti_oras),
      tara: sir(f.clienti_country),
      cont: sir(f.facturi_cont_client),
      banca: sir(f.facturi_banca_client),
      telefon: sir(f.clienti_tel),
      adresaLivrare: sir(f.clienti_adresa_livrare),
    },
    moneda: sir(f.facturi_moneda),
    cotaDocument: sir(f.facturi_cota_tva),
    linii: linii.filter((l): l is Record<string, unknown> => !!l && typeof l === "object").map((l) => ({
      nume: sir(l.facturi_prod_nume),
      pretFaraTva: sir(l.facturi_prod_pretftva),
      pretCuTva: sir(l.facturi_prod_pretctva),
      cantitate: sir(l.facturi_prod_cant),
      valoare: sir(l.facturi_prod_val),
      valoareTva: sir(l.facturi_prod_val_tva),
      valoareTotala: sir(l.facturi_prod_val_tot),
      cota: sir(l.facturi_prod_tva),
      moneda: sir(l.facturi_prod_moneda),
      codEan: sir(l.prod_cod),
      codSku: sir(l.prod_sku),
      codAlt: sir(l.prod_cod1),
      codCautare: sir(l.prod_cod_cautare),
    })),
  };
}

/**
 * Citeste o factura dupa id (`Facturi` / `Get`, `facturi_key`). `null` = nu exista la ei.
 *
 * ⚠ Se alege din raspuns randul cu CHIAR acest id. Daca filtrul ar fi ignorat vreodata, raspunsul
 * ar fi o lista intreaga, iar primul rand ar fi fost factura altcuiva.
 */
export async function citesteFactura(a: AcreditariFacturis, cheie: string): Promise<FacturaCitita | null> {
  const r = await cere(a, "Facturi", "Get", { facturi_key: cheie }, { scriere: false, ce: "citirea facturii" });
  if (!r.ok) {
    if (r.cod === FARA_REZULTATE) return null;
    throw eroareRefuz(mesajFacturis(r.cod, r.mesaj));
  }
  const randuri = Array.isArray(r.rezultat) ? r.rezultat : r.rezultat ? [r.rezultat] : [];
  for (const rand of randuri) {
    const f = facturaDinRand(rand);
    if (f && f.cheie === cheie) return f;
  }
  return null;
}

/**
 * PDF-ul unei facturi (`FacturiHtml` / `Facturi`, dupa `id_fact`). Stornarea e tot o factura.
 *
 * ⚠ SE VERIFICA CE A VENIT, nu de unde: un PDF incepe cu `%PDF-`. Altfel, un raspuns de eroare
 * (JSON) sau o pagina HTML ar pleca mai departe drept document fiscal — la cumparator sau la eMAG.
 * Vezi `esteChiarPdf` din `billing/factura-comenzii.ts`, aceeasi regula.
 */
export async function pdfFactura(
  a: AcreditariFacturis,
  cheie: string,
  semnal?: AbortSignal,
): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(ADRESA_FACTURIS, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/pdf, application/json",
      },
      body: corpulCererii(a, "FacturiHtml", "Facturi", {
        id_fact: cheie,
        /* Romana, lei, A4: exact ce trimite si modulul lor oficial. */
        select_language: "1",
        select_currency: "RON",
        select_format: "1",
      }),
      cache: "no-store",
      signal: semnal ?? AbortSignal.timeout(TERMEN_CITIRE_MS),
    });
  } catch {
    throw eroareRefuz("Nu am putut aduce PDF-ul de la Facturis. Încearcă din nou peste un minut.");
  }
  const declarat = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declarat) && declarat > MARIME_MAXIMA_PDF) {
    throw eroareRefuz("PDF-ul facturii e prea mare ca să fie adus prin Edinio. Descarcă-l din contul Facturis.");
  }
  let octeti: ArrayBuffer;
  try {
    octeti = await res.arrayBuffer();
  } catch {
    throw eroareRefuz("PDF-ul de la Facturis s-a pierdut pe drum. Încearcă din nou.");
  }
  if (octeti.byteLength > MARIME_MAXIMA_PDF) {
    throw eroareRefuz("PDF-ul facturii e prea mare ca să fie adus prin Edinio. Descarcă-l din contul Facturis.");
  }
  if (!incepeCuPdf(octeti)) {
    const r = citesteRaspunsul(new TextDecoder().decode(octeti.slice(0, 4000)));
    if (r && !r.ok) throw eroareRefuz(mesajFacturis(r.cod, r.mesaj));
    throw eroareRefuz(`Facturis nu a trimis un PDF (răspuns ${res.status}). Încearcă din nou sau descarcă factura din contul Facturis.`);
  }
  return octeti;
}

function incepeCuPdf(octeti: ArrayBuffer): boolean {
  if (octeti.byteLength < 5) return false;
  const c = new Uint8Array(octeti.slice(0, 5));
  return c[0] === 0x25 && c[1] === 0x50 && c[2] === 0x44 && c[3] === 0x46 && c[4] === 0x2d;
}

/* ═══════════════════════════════════════════════════════════════════════════
   INCASAREA
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Incasare {
  /** Clientul din nomenclatorul lor (`fk_clienti_key` de pe factura). */
  clientCheie: string;
  /** „DD-MM-YYYY HH:MM:SS": formatul cerut de `RegistruIncasari`, ALTUL decat la facturi. */
  data: string;
  suma: number;
  /** Banca · Card · Cash · Trezorerie · Altceva. */
  tip: "Card" | "Banca" | "Cash" | "Altceva";
  observatii: string;
  /** Factura cu care se imperecheaza plata. */
  facturaCheie: string;
}

/**
 * Inregistreaza incasarea unei facturi (`RegistruIncasari` / `Ins`, cu `idFacturi`).
 *
 * ⚠ Succesul fara id e tot succes aici: spre deosebire de factura, nimic de pe comanda nu atarna
 * de id-ul incasarii, iar registrul tine oricum cheia ei.
 */
export async function inregistreazaIncasarea(a: AcreditariFacturis, i: Incasare): Promise<string | null> {
  const r = await cere(a, "RegistruIncasari", "Ins", {
    fk_clienti_key: i.clientCheie,
    incasari_data: i.data,
    incasari_suma: i.suma.toFixed(2),
    incasari_moneda: "RON",
    incasari_tip: i.tip,
    incasari_obs: i.observatii,
    /* Numere, ca in exemplul lor (`[10, 25]`). */
    idFacturi: [Number(i.facturaCheie)],
  }, { scriere: true, ce: "înregistrarea încasării" });
  if (!r.ok) throw eroareRefuz(mesajFacturis(r.cod, r.mesaj));
  return cheiaDinRaspuns(r.rezultat);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROBA DE CONEXIUNE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Proba de conexiune: o citire de facturi pe o zi in care nu poate exista nimic (01.01.2000).
 *
 * ⚠ AUTENTIFICATA, si pe chiar metoda cu care se emite. O proba pe un capat public ar fi raspuns
 * „reusit" pentru orice chei — defectul fGO din 15.08.2026.
 *
 * ⚠ FARA `facturi_key: "0"`: in PHP `empty("0")` e adevarat, deci un filtru pe „0" s-ar fi putut
 * sari, iar proba ar fi adus TOATE facturile contului, cu toate liniile lor.
 *
 * Raspunsul „nu exista rezultate" (5005) e REUSITA: au trecut de autentificare si au cautat.
 *
 * `refuz` deosebeste „Facturis a raspuns NU" (cheile sunt gresite, contul n-are API) de „n-am
 * ajuns la Facturis": salvarea il opreste pe primul si il lasa sa treaca, cu avertisment, pe al
 * doilea. O pana de cinci minute la ei nu are de ce sa-l impiedice pe comerciant sa-si salveze
 * setarile.
 */
export async function testeazaConexiunea(
  a: AcreditariFacturis,
): Promise<{ ok: true } | { ok: false; error: string; refuz: boolean }> {
  let r: RaspunsFacturis;
  try {
    r = await cere(a, "Facturi", "Get", {
      date_start: "01-01-2000",
      date_stop: "01-01-2000",
    }, { scriere: false, ce: "verificarea conexiunii" });
  } catch (e) {
    return { ok: false, refuz: false, error: e instanceof Error ? e.message : "Nu am putut contacta Facturis." };
  }
  if (r.ok || r.cod === FARA_REZULTATE) return { ok: true };
  return { ok: false, refuz: true, error: mesajFacturis(r.cod, r.mesaj) };
}
