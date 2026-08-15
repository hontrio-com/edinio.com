import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import { cerereXml, citesteXml, copii, gaseste, text, type ElementXml, type NodXml } from "./xml";

/**
 * Clientul Packeta.
 *
 * ═══ DOUA CREDENTIALE, DOUA PROTOCOALE, DOUA GAZDE ═══
 *
 * | | unde | pentru ce |
 * |---|---|---|
 * | `api_password` (32 hex) | PRIMUL argument al fiecarei metode, in corpul XML | creare, etichete, urmarire |
 * | `api_key` (16 caractere) | in CALEA adresei | fluxurile de puncte si de curieri |
 *
 * Sunt lucruri DIFERITE si nu se pot inlocui una pe alta. Configurarea are deci
 * doua campuri secrete, nu unul.
 *
 * ⚠ **`api_key` circula in URL, deci adresa fluxurilor NU se logheaza NICIODATA.**
 * Un `console.error` care tipareste calea scurge cheia in loguri, iar de acolo
 * oricine poate citi punctele de ridicare ale magazinului. Toate mesajele de
 * eroare din fisierul asta numesc fluxul („branch", „carrier"), nu adresa.
 *
 * ═══ ⚠ E XML, NU JSON ═══
 *
 * Singura integrare de transport din platforma care nu vorbeste JSON. Documentatia:
 * „Utilize the name of the desired API method as the root element's name and the
 * method's arguments as the subelements." Constructorul si cititorul stau in
 * `xml.ts`, probate separat — sunt cele mai importante probe ale integrarii,
 * fiindca n-avem cont pe care sa vedem un raspuns adevarat.
 *
 * ═══ ⚠ PROZA SI EXEMPLELE SE CONTRAZIC LA FORMA RASPUNSULUI ═══
 *
 * Proza: „the root element carries the name of the return type". Toate exemplele
 * concrete (sase fisiere) arata insa plicul `<response><status>ok</status>
 * <result>…</result></response>`, iar exemplul lor de cod citeste chiar
 * `responseBody.response.status === "ok"`.
 *
 * Mai mult, `createStorageFileResponse` din alt fisier n-are deloc `<status>`.
 *
 * Deci cititorul accepta AMANDOUA formele: daca exista `<status>`, el hotaraste;
 * daca nu, se ia continutul ca rezultat. Ce NU se face niciodata e sa se presupuna
 * reusita cand nu se intelege nimic — atunci verdictul e `necunoscut`.
 *
 * ═══ ⚠ NU EXISTA ANULARE ═══
 *
 * Lista lor de metode e completa si n-are nimic de tip cancel/delete/storno; pe
 * deasupra documentatia spune ca nici editarea comenzilor exportate nu se poate.
 * Un colet creat gresit se anuleaza doar din interfata lor, de mana. De aia
 * emiterea trece intai prin `packetAttributesValid()`.
 */

/** Adresa REST documentata. `zasilkovna.cz`, nu `packeta.com` — asa scrie peste tot in exemple. */
const BAZA_REST = "https://www.zasilkovna.cz/api/rest";
/** Fluxurile de puncte si curieri. ⚠ Contine cheia in cale: nu se logheaza. */
const BAZA_FLUXURI = "https://pickup-point.api.packeta.com/v5";

/** Citirile obisnuite. Emiterea isi permite mai mult: e pornita de comerciant. */
const ASTEPTARE_MS = 20_000;
const ASTEPTARE_EMITERE_MS = 45_000;
/** Fluxurile sunt fisiere mari (toate tarile), deci au nevoie de mai mult timp. */
const ASTEPTARE_FLUX_MS = 60_000;

export interface ConfigPacketa {
  api_password?: string | null;
  api_key?: string | null;
  /** Eticheta expeditorului din contul lor. ⚠ Un nume inexistent creeaza tacut unul nou. */
  eshop?: string | null;
  /** Suprascrie adresa REST, pentru un eventual mediu propriu. */
  bazaRest?: string | null;
}

/**
 * Configurarea magazinului.
 *
 * ⚠ STA AICI, NU IN `packeta.actions.ts`, si nu din gust: un fisier `"use server"`
 * expune FIECARE export ca endpoint HTTP global, iar Next cere ca toate sa fie
 * functii async. `packetaGata` e sincrona, deci acolo ar fi rupt build-ul — si
 * chiar a rupt-o, o data. Vezi memoria „use server expune fiecare export".
 */
export interface PacketaConfig extends ConfigPacketa {
  enabled?: boolean;
  /** Curierii de livrare la adresa pe care comerciantul ii ofera. Gol = niciunul. */
  curieri_permisi?: string[];
  foloseste_puncte?: boolean;
  foloseste_automate?: boolean;
  eticheta_format?: FormatEticheta;
  /**
   * Se cere eticheta CURIERULUI real in loc de cea Packeta.
   *
   * ⚠ Documentatia o cere insistent pentru coletele care pleaca la un curier
   * extern: eticheta Packeta pusa pe un astfel de colet inseamna reetichetare la
   * depozitul lor, facturata separat. Deci alegerea costa bani.
   */
  eticheta_curier?: boolean;
  /** Valoarea declarata cand comanda n-are una folositoare. `value` e obligatoriu la ei. */
  valoare_implicita?: number;
  /**
   * Dimensiunile implicite ale coletului, in MILIMETRI.
   *
   * ⚠ Unii curieri le CER (`requiresSize` in feed) si refuza coletul fara ele.
   * Comanda nu le are, deci vin din configurare. Milimetri, nu centimetri.
   */
  dimensiuni_implicite?: { lungime: number; latime: number; inaltime: number } | null;
}

/**
 * E gata de folosit?
 *
 * ⚠ `eshop` intra in conditie desi nu e credentiala: fara el nu pleaca niciun
 * colet, iar un nume gresit CREEAZA tacut un expeditor nou la ei si strica
 * facturarea. `api_key` NU intra: fara ea lipsesc doar punctele din checkout,
 * livrarea la adresa merge mai departe.
 */
export function packetaGata(c: PacketaConfig | null | undefined): c is PacketaConfig {
  return !!c && c.enabled === true && !!(c.api_password ?? "").trim() && !!(c.eshop ?? "").trim();
}

/* ── Erorile lor, si cum se citesc ────────────────────────────────────────── */

/**
 * Un camp respins, din `AttributeFault`.
 *
 * E singurul lucru din toata integrarea care ne spune EXACT ce e gresit, si vine
 * de la `packetAttributesValid()` inainte ca ceva sa se creeze. Se duce pana in
 * mesajul aratat comerciantului.
 */
export interface CampRespins {
  nume: string;
  motiv: string;
}

/** Cheia sub care se pastreaza campurile respinse pe eroare. */
const CHEIE_CAMPURI = "campuriPacketa" as const;

export function campuriRespinse(e: unknown): CampRespins[] {
  const v = (e as { [CHEIE_CAMPURI]?: unknown } | null)?.[CHEIE_CAMPURI];
  return Array.isArray(v) ? (v as CampRespins[]) : [];
}

function cuCampuri(e: Error, campuri: CampRespins[]): Error {
  if (campuri.length) (e as Error & { [CHEIE_CAMPURI]?: CampRespins[] })[CHEIE_CAMPURI] = campuri;
  return e;
}

/**
 * Scoate campurile respinse dintr-un raspuns de eroare.
 *
 * Structura documentata: `PacketAttributesFault` „Contains an array of type
 * AttributeFault", iar `AttributeFault` are `name` („Name of the invalid
 * attribute") si `fault` („Description of the error").
 *
 * ⚠ Forma EXACTA pe REST nu e documentata — documentatia arata doar tratarea prin
 * `SoapFault->detail` in PHP. De aia se cauta `<attribute>` oriunde in arbore, si
 * lipsa lor nu e o eroare: inseamna doar ca n-avem detalii, nu ca cererea a reusit.
 */
function citesteCampuri(radacina: ElementXml): CampRespins[] {
  const gasite: CampRespins[] = [];
  const coada: ElementXml[] = [radacina];
  while (coada.length) {
    const el = coada.shift()!;
    /* `attribute` (SOAP) sau `fault` purtand un `name` — se accepta ambele forme. */
    if (el.nume === "attribute" || (el.nume === "fault" && el.copii.length)) {
      const nume = text(el, "name");
      const motiv = text(el, "fault") ?? text(el, "message");
      if (nume) gasite.push({ nume, motiv: motiv || "camp respins" });
    }
    coada.push(...el.copii);
  }
  return gasite;
}

/** Textul unei erori, cules din formele in care ei o pot scrie. */
function mesajEroare(radacina: ElementXml): string {
  const bucati = [
    text(radacina, "string"),        // `<fault><string>…</string></fault>` (SOAP)
    text(radacina, "faultstring"),
    text(radacina, "message"),
    text(radacina, "fault"),
  ].filter((x): x is string => !!x && x.length > 0);
  return bucati[0] ?? "";
}

/* ── Apelul ───────────────────────────────────────────────────────────────── */

export interface RezultatApel {
  /** Elementul `<result>`, sau radacina cand raspunsul n-are plic. */
  rezultat: ElementXml;
  radacina: ElementXml;
}

/**
 * Cheama o metoda si intoarce rezultatul.
 *
 * ⚠ `api_password` e MEREU primul argument, si se pune AICI — ca nimeni sa nu poata
 * uita sa-l trimita, si ca sa nu circule prin restul codului.
 */
export async function apel(
  cfg: ConfigPacketa,
  metoda: string,
  argumente: NodXml,
  optiuni?: { asteptareMs?: number },
): Promise<RezultatApel> {
  const parola = (cfg.api_password ?? "").trim();
  if (!parola) throw eroareRefuz("Lipseste parola API Packeta (api_password) din configurare.");

  const corp = cerereXml(metoda, { api_password: parola, ...argumente });
  const baza = (cfg.bazaRest ?? "").trim() || BAZA_REST;

  const ctrl = new AbortController();
  const timp = setTimeout(() => ctrl.abort(), optiuni?.asteptareMs ?? ASTEPTARE_MS);
  let r: Response;
  try {
    r = await fetch(baza, {
      method: "POST",
      /*
       * Exemplul lor de cod (Node.js) nu trimite NICIUN antet — nici Content-Type.
       * Il punem totusi: e corect, si un intermediar care se uita la tipul
       * continutului n-are cum sa ne respinga documentul XML drept altceva.
       */
      headers: { "content-type": "text/xml; charset=utf-8", accept: "text/xml, application/xml" },
      body: corp,
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    /* Retea cazuta sau termen depasit: NU stim daca au primit cererea. */
    throw eroareNesigura(
      e instanceof Error && e.name === "AbortError"
        ? `Packeta nu a raspuns in timp la ${metoda}.`
        : `Nu am putut ajunge la Packeta (${metoda}).`,
    );
  } finally {
    clearTimeout(timp);
  }

  const brut = await r.text().catch(() => "");

  if (!r.ok) {
    /*
     * Statusul hotaraste verdictul (4xx refuz, 5xx si 408 nesigur), iar textul se
     * cauta in corp doar ca sa fie de folos omului. Corpul poate fi si HTML de la
     * un intermediar — atunci `citesteXml` arunca si ramanem cu statusul.
     */
    let detaliu = "";
    let campuri: CampRespins[] = [];
    try {
      const rad = citesteXml(brut);
      detaliu = mesajEroare(rad);
      campuri = citesteCampuri(rad);
    } catch { /* corp necitibil: ramane statusul */ }
    throw cuCampuri(
      eroareCuStatus(`Packeta a raspuns ${r.status} la ${metoda}${detaliu ? `: ${detaliu}` : "."}`, r.status),
      campuri,
    );
  }

  let radacina: ElementXml;
  try {
    radacina = citesteXml(brut);
  } catch {
    /*
     * ⚠ Raspuns 200 dar necitibil. NU e refuz: cererea a ajuns si poate a lucrat.
     * Verdictul `necunoscut` blocheaza in registru si scoate cazul la om, in loc sa
     * ingaduie o reincercare care ar crea al doilea colet — pe care, la Packeta, nu
     * l-am mai putea nici anula.
     */
    throw eroareNesigura(`Packeta a raspuns la ${metoda} ceva ce nu am putut citi.`);
  }

  /*
   * Plicul, cand exista. `<status>` nu e „ok" inseamna refuz DOVEDIT: au inteles
   * cererea si au respins-o.
   */
  const stare = text(radacina, "status");
  if (stare !== undefined && stare.toLowerCase() !== "ok") {
    throw cuCampuri(
      eroareRefuz(`Packeta a refuzat ${metoda}${mesajEroare(radacina) ? `: ${mesajEroare(radacina)}` : "."}`),
      citesteCampuri(radacina),
    );
  }

  /*
   * Un `<fault>` poate veni si pe 200, ca la DPD. Se verifica inainte de a lua
   * continutul drept rezultat.
   */
  const fault = gaseste(radacina, "fault") ?? gaseste(radacina, "faultstring");
  if (fault && !gaseste(radacina, "result")) {
    throw cuCampuri(
      eroareRefuz(`Packeta a refuzat ${metoda}${mesajEroare(radacina) ? `: ${mesajEroare(radacina)}` : "."}`),
      citesteCampuri(radacina),
    );
  }

  return { rezultat: gaseste(radacina, "result") ?? radacina, radacina };
}

/* ── Metodele folosite ────────────────────────────────────────────────────── */

export interface ColetCreat {
  /** ⚠ TEXT, nu numar: `unsignedLong` de zece cifre. Documentatia o cere anume. */
  id: string;
  barcode: string;
  barcodeText: string;
}

/**
 * Valideaza atributele FARA sa creeze nimic.
 *
 * „On success (the attributes are valid) does not return anything."
 *
 * ⚠ Deci absenta unui rezultat NU inseamna esec — esecul e refuzul. Un cod care ar
 * cere un `<result>` aici ar respinge exact cazul bun.
 */
export async function valideazaAtribute(cfg: ConfigPacketa, atribute: NodXml): Promise<void> {
  await apel(cfg, "packetAttributesValid", { packetAttributes: atribute }, { asteptareMs: ASTEPTARE_MS });
}

export async function creeazaColet(cfg: ConfigPacketa, atribute: NodXml): Promise<ColetCreat> {
  const { rezultat } = await apel(cfg, "createPacket", { packetAttributes: atribute }, { asteptareMs: ASTEPTARE_EMITERE_MS });
  const id = text(rezultat, "id");
  /*
   * ⚠ Fara id, nu stim daca s-a creat ceva. `necunoscut`, nu refuz: un refuz ar
   * dezlega reincercarea, iar reincercarea ar putea crea al doilea colet — pe care
   * nu-l putem anula prin API.
   */
  if (!id) throw eroareNesigura("Packeta a raspuns la createPacket fara id de colet.");
  return {
    id,
    barcode: text(rezultat, "barcode") || `Z${id}`,
    barcodeText: text(rezultat, "barcodeText") || "",
  };
}

/** Starea curenta a unui colet. */
export async function stareColet(cfg: ConfigPacketa, packetId: string): Promise<{ cod: number | null; nume: string; codExtern: string | null }> {
  const { rezultat } = await apel(cfg, "packetStatus", { packetId });
  const codBrut = text(rezultat, "statusCode");
  const cod = codBrut && /^\d+$/.test(codBrut) ? Number(codBrut) : null;
  return {
    cod,
    nume: text(rezultat, "statusText") || text(rezultat, "codeText") || "",
    codExtern: text(rezultat, "externalTrackingCode") || null,
  };
}

/** Istoricul intern. Fiecare inregistrare are cod, text si data. */
export async function istoricColet(cfg: ConfigPacketa, packetId: string): Promise<{ cod: number | null; nume: string; cand: string | null; codExtern?: string | null }[]> {
  const { rezultat } = await apel(cfg, "packetTracking", { packetId });
  /* Numele elementului de inregistrare nu e documentat pe REST; se accepta cele
     doua forme plauzibile, si se cade pe orice copil care are un `statusCode`. */
  const inregistrari = [
    ...copii(rezultat, "record"),
    ...copii(rezultat, "packetStatusRecord"),
  ];
  const lista = inregistrari.length ? inregistrari : rezultat.copii.filter((c) => text(c, "statusCode") !== undefined);
  return lista.map((el) => {
    const codBrut = text(el, "statusCode");
    return {
      cod: codBrut && /^\d+$/.test(codBrut) ? Number(codBrut) : null,
      nume: text(el, "statusText") || text(el, "codeText") || "",
      cand: text(el, "dateTime") || text(el, "date") || null,
      codExtern: text(el, "externalTrackingCode") || null,
    };
  });
}

/**
 * Numarul coletului la curierul real.
 *
 * ⚠ OBLIGATORIU inainte de eticheta de curier: „To print carrier labels, you first
 * have to obtain the courier number."
 */
export async function numarCurier(cfg: ConfigPacketa, packetId: string): Promise<string | null> {
  const { rezultat } = await apel(cfg, "packetCourierNumberV2", { packetId });
  return text(rezultat, "courierNumber") || text(rezultat) || null;
}

export type FormatEticheta = "A6 on A6" | "A7 on A7" | "A6 on A4" | "A7 on A4";

/**
 * Eticheta Packeta, ca PDF.
 *
 * ⚠ Pentru coletele care pleaca la un curier extern, documentatia cere ANUME
 * eticheta curierului (`packetCourierLabelPdf`): „If you send a packet to a carrier
 * that supports carrier (direct) label printing, but you choose to print a Packeta
 * label instead, your packet is subject to extra charges, since your packet will
 * have to be re-labeled at our depot." Deci alegerea etichetei costa bani.
 */
export async function etichetaColet(cfg: ConfigPacketa, packetId: string, format: FormatEticheta, offset = 0): Promise<Buffer> {
  const { rezultat } = await apel(cfg, "packetLabelPdf", { packetId, format, offset: String(offset) }, { asteptareMs: ASTEPTARE_EMITERE_MS });
  return laPdf(rezultat, "packetLabelPdf");
}

/** Eticheta CURIERULUI real. Cere intai `numarCurier`. */
export async function etichetaCurier(cfg: ConfigPacketa, packetId: string, courierNumber: string): Promise<Buffer> {
  const { rezultat } = await apel(cfg, "packetCourierLabelPdf", { packetId, courierNumber }, { asteptareMs: ASTEPTARE_EMITERE_MS });
  return laPdf(rezultat, "packetCourierLabelPdf");
}

/**
 * Continutul base64 → PDF.
 *
 * ⚠ Se verifica antetul `%PDF`. Un raspuns care nu e PDF (o pagina de eroare
 * codificata, un continut gol) ar fi ajuns altfel ca fisier stricat in mana
 * comerciantului, care ar fi crezut ca eticheta e emisa.
 */
function laPdf(rezultat: ElementXml, metoda: string): Buffer {
  const b64 = (rezultat.text || "").replace(/\s+/g, "");
  if (!b64) throw eroareNesigura(`Packeta a raspuns la ${metoda} fara continut.`);
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 5 || buf.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw eroareNesigura(`Packeta a raspuns la ${metoda} cu ceva ce nu e PDF.`);
  }
  return buf;
}

/* ── Fluxurile (JSON, si cu cheia in adresa) ──────────────────────────────── */

export type FelFlux = "branch" | "box" | "carrier";

/**
 * Cere un flux si intoarce JSON-ul brut.
 *
 * ⚠ ADRESA NU SE LOGHEAZA NICIODATA: contine `api_key` in cale. Toate mesajele de
 * mai jos numesc fluxul, nu adresa.
 */
export async function flux(cfg: ConfigPacketa, fel: FelFlux, limba = "ro"): Promise<unknown> {
  const cheie = (cfg.api_key ?? "").trim();
  if (!cheie) throw eroareRefuz("Lipseste cheia API Packeta (api_key) din configurare.");
  /* O cheie cu caractere neasteptate ar putea iesi din cale („../”). */
  if (!/^[A-Za-z0-9_-]+$/.test(cheie)) throw eroareRefuz("Cheia API Packeta are caractere nepermise.");
  const lg = /^[a-z]{2}$/.test(limba) ? limba : "ro";

  const ctrl = new AbortController();
  const timp = setTimeout(() => ctrl.abort(), ASTEPTARE_FLUX_MS);
  let r: Response;
  try {
    r = await fetch(`${BAZA_FLUXURI}/${encodeURIComponent(cheie)}/${fel}.json?lang=${lg}`, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
  } catch (e) {
    throw eroareNesigura(
      e instanceof Error && e.name === "AbortError"
        ? `Fluxul Packeta „${fel}” nu a raspuns in timp.`
        : `Nu am putut ajunge la fluxul Packeta „${fel}”.`,
    );
  } finally {
    clearTimeout(timp);
  }

  if (!r.ok) throw eroareCuStatus(`Fluxul Packeta „${fel}” a raspuns ${r.status}.`, r.status);
  try {
    return await r.json();
  } catch {
    throw eroareNesigura(`Fluxul Packeta „${fel}” a raspuns ceva ce nu e JSON.`);
  }
}

/**
 * Proba de conexiune.
 *
 * ⚠ Se probeaza AMBELE credentiale, fiindca sunt lucruri diferite si o
 * configurare pe jumatate e cel mai usor de gresit: `carrier.json` cere `api_key`,
 * iar `packetAttributesValid` cere `api_password`.
 *
 * Pentru parola se foloseste validarea cu atribute goale: nu creeaza nimic. Un
 * refuz pe CAMPURI inseamna ca parola e buna (au ajuns sa se uite la date); doar
 * un refuz care numeste parola inseamna credentiale gresite.
 */
export async function probaConexiune(cfg: ConfigPacketa): Promise<{ api_key: boolean; api_password: boolean; detaliu: string }> {
  let cheieOk = false;
  let parolaOk = false;
  const note: string[] = [];

  try {
    await flux(cfg, "carrier");
    cheieOk = true;
  } catch (e) {
    note.push(`Cheia API (fluxuri): ${e instanceof Error ? e.message : "esec"}`);
  }

  try {
    await valideazaAtribute(cfg, {});
    parolaOk = true;
  } catch (e) {
    const campuri = campuriRespinse(e);
    const mesaj = e instanceof Error ? e.message : "esec";
    /*
     * Un refuz care numeste campuri dovedeste ca parola a trecut: n-ar fi ajuns
     * sa se uite la date daca n-ar fi recunoscut contul.
     */
    if (campuri.length > 0) parolaOk = true;
    else note.push(`Parola API: ${mesaj}`);
  }

  return { api_key: cheieOk, api_password: parolaOk, detaliu: note.join(" · ") };
}
