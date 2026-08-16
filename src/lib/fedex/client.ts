import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";

/**
 * Clientul FedEx.
 *
 * ═══ CE E ═══
 *
 * Al PAISPREZECELEA transportator, si primul TRANSPORTATOR GLOBAL propriu-zis —
 * nu un broker romanesc. Documentatia e la developer.fedex.com; schemele OpenAPI
 * 3.0 complete sunt publice, fara autentificare, la
 * `developer.fedex.com/wirc/json/api_groups/<Grup>/<Resursa>.json` (paginile
 * `/docs.html` contin doar naratiunea; schema se incarca din `<input id="swaggerjson">`).
 * Nomenclatoarele — servicii pe regiuni, tipuri de ambalaj, valute, tari — stau
 * intr-un singur fisier, `API_Reference_Guide.json`.
 *
 * ═══ ⚠ CINCI LUCRURI CARE NU SEAMANA CU CEILALTI TREISPREZECE ═══
 *
 * **1. ⚠ NU EXISTA RAMBURS.** Anuntul lor oficial `COD_Retirement_Announcement`,
 * 31.07.2023: C.O.D. a fost retras peste tot in afara de FedEx Ground in/spre
 * Canada. Fisa comerciala romaneasca („Servicii cu valoare adaugata", preturi in
 * RON) nu are nicio linie de ramburs. Enumerarile `COD` inca exista in schema, dar
 * sunt cochilii pentru lane-ul canadian — `packageCODDetail` e explicit „For use
 * with FedEx Ground services only", iar FedEx Ground nu exista cu origine RO.
 *
 * Consecinta, si e mare pentru un magazin romanesc: FedEx se ofera in checkout
 * NUMAI la comenzile platite in avans. Vezi `RAMBURS_INDISPONIBIL`.
 *
 * **2. ⚠ PRAG DE RATA PE IP, DOAR PE `/oauth/token`.** Documentat de ei: peste 3
 * cereri/s timp de 5s (sau 1/s timp de 2 minute) → **403 timp de 10 minute, pe
 * IP-ul public**, cu prelungire la reincercare. Pe Vercel IP-urile sunt partajate
 * intre magazine, deci un client care ar cere token la fiecare apel ar bloca toate
 * magazinele deodata. Tokenul se pastreaza o ora, cu marja, si se reia O SINGURA
 * data pe 401. Vezi `token()`.
 *
 * **3. ⚠ RASPUNSUL SE CITESTE DE PATRU ORI.** Nu doua, ca la SmartShip:
 *   a) statusul HTTP;
 *   b) `errors[]` din corp — forma standard, cu `code` si `message`;
 *   c) `error_description` — forma NEDOCUMENTATA in nicio schema, pe care o
 *      raspunde gateway-ul lor la un token stricat (`{"error_description":"Invalid CXS JWT"}`),
 *      fara `transactionId` si fara `errors[]`;
 *   d) `output.alerts[]` cu `alertType: WARNING` — succes cu avertisment, pe 200.
 * Iar la urmarire mai e un al cincilea nivel: `trackResults[].error`, o eroare PE
 * NUMAR intr-un raspuns 200 care „a reusit" la nivel HTTP.
 *
 * Regula lor, scrisa in ghidul de bune practici si respectata aici: **„Code only to
 * error codes and not error messages"** — mesajele se schimba dinamic.
 *
 * **4. ⚠ `dimensions.units` LIPSA INSEAMNA INCH, NU EROARE.** Verbatim din schema:
 * „Any value other than CM including blank/null will default to IN." Un colet de
 * 30x20x10 cm trimis fara unitate devine 76x51x25 cm la ei — tarif si validari
 * complet gresite, fara nicio eroare. Unitatea pleaca INTOTDEAUNA explicit, si
 * cotele sunt intregi (`No implied decimal places`), rotunjite IN SUS.
 *
 * **5. ⚠ NU EXISTA IDEMPOTENTA SI NU EXISTA REIMPRIMARE.**
 * `idempot*` / `Idempotency-Key`: zero potriviri in ambele specificatii. Iar
 * `x-customer-transaction-id` e, prin propria lor descriere, doar corelare
 * cerere↔raspuns — NU dedupliceaza. O reincercare oarba emite al doilea AWB,
 * taxabil. De aia emiterea trece prin registrul de operatii externe.
 *
 * Reimprimare de eticheta: NU EXISTA ENDPOINT. Documentatia lor spune sa retrimiti
 * bufferul ORIGINAL la imprimanta, iar linkul din raspuns expira. Deci eticheta se
 * cere ca base64 si se pastreaza de noi, in `public.fedex_etichete`.
 *
 * ═══ CE AVEM, SPRE DEOSEBIRE DE SHIPO ═══
 *
 * `POST /track/v1/referencenumbers` cauta dupa REFERINTA NOASTRA. Deci fereastra
 * „am trimis si n-am primit raspuns" se poate inchide cu o CITIRE, ca la SmartShip
 * si Innoship — vezi `cautaDupaReferinta()`.
 */

// ─── Gazdele ─────────────────────────────────────────────────────────────────

/**
 * ⚠ Sandbox-ul lor e VIRTUALIZAT, nu o copie a productiei.
 *
 * Documentatia lor: „the API will return the same predefined rate reply regardless
 * of the address changes", iar la Rate „only country is validated". Raspunsurile
 * poarta `alerts: [{code: "VIRTUAL.RESPONSE", …}]`.
 *
 * Deci pe sandbox se poate proba FORMA cererii si a raspunsului, dar NU preturile
 * pe adrese romanesti. Comerciantul trebuie sa stie asta — scrie in interfata.
 */
export const GAZDE = {
  test: "https://apis-sandbox.fedex.com",
  productie: "https://apis.fedex.com",
} as const;

export type MediuFedex = keyof typeof GAZDE;

/** Citirile din calea cumparatorului: cotare, urmarire, locatii. */
export const ASTEPTARE_MS = 20_000;
/** Emiterea si anularea: pornite de comerciant, isi permit mai mult. */
const ASTEPTARE_EMITERE_MS = 45_000;
/** Autentificarea: un singur pas, si sta in fata oricarei alte cereri. */
const ASTEPTARE_AUTH_MS = 15_000;

/**
 * ⚠ RAMBURSUL NU E O OPTIUNE DE CONFIGURARE, E O IMPOSIBILITATE.
 *
 * Constanta exista ca sa nu apara niciodata un `if (config.ramburs)` la FedEx si ca
 * mesajul catre comerciant sa fie acelasi peste tot: checkout, panou, lot.
 */
export const RAMBURS_INDISPONIBIL =
  "FedEx nu ofera plata la livrare (ramburs). Serviciul a fost retras de ei in iulie 2023 "
  + "peste tot in afara de FedEx Ground in Canada. Comenzile cu ramburs trebuie expediate cu alt curier.";

// ─── Statusul HTTP, pastrat PE eroare ─────────────────────────────────────────

/**
 * Acelasi tipar ca la eColet, Pall-Ex, Posta, Innoship, SmartShip si Shipo: cine
 * trateaza „nu exista acolo" altfel decat un refuz oarecare are nevoie de numar,
 * iar numarul nu trebuie cautat in textul erorii.
 */
const CHEIE_STATUS = "statusHttp" as const;
/** Codul de business al FedEx (`errors[].code`), pastrat tot pe eroare. */
const CHEIE_COD = "codFedex" as const;

export function statusEroare(e: unknown): number | null {
  const v = (e as { [CHEIE_STATUS]?: unknown } | null)?.[CHEIE_STATUS];
  return typeof v === "number" ? v : null;
}

/**
 * Codul FedEx al erorii, cand exista.
 *
 * ⚠ Se decide DUPA cod, niciodata dupa mesaj: ghidul lor de bune practici o spune
 * explicit, iar mesajele chiar contin sabloane inlocuite la rulare
 * (`{CURRENCY_CODE_LIST}`, `{PACKAGE_INDEX}`).
 */
export function codEroare(e: unknown): string | null {
  const v = (e as { [CHEIE_COD]?: unknown } | null)?.[CHEIE_COD];
  return typeof v === "string" && v ? v : null;
}

function insemneaza(e: Error, status: number | null, cod: string | null): Error {
  const cu = e as Error & { [CHEIE_STATUS]?: number; [CHEIE_COD]?: string };
  if (status !== null) cu[CHEIE_STATUS] = status;
  if (cod) cu[CHEIE_COD] = cod;
  return e;
}

// ─── Configurarea ─────────────────────────────────────────────────────────────

export type FormatEticheta = "PDF" | "PNG" | "ZPLII";

/**
 * Tipul de ridicare. Enum INLINE in schema lor de Ship, complet (trei valori) —
 * spre deosebire de tabelul „Pickup Types" din ghid, care mai listeaza `ON_CALL`,
 * `REGULAR_STOP` si `TAG`, dar le marcheaza ca fiind ale API-ului de Pickup.
 */
export type TipRidicare = "USE_SCHEDULED_PICKUP" | "CONTACT_FEDEX_TO_SCHEDULE" | "DROPOFF_AT_FEDEX_LOCATION";

export type ExpeditorFedex = {
  nume: string;
  companie?: string;
  telefon: string;
  email?: string;
  /** Adresa pe linii; se imparte la trimitere in cel mult 3 linii de 35 de caractere. */
  strada: string;
  oras: string;
  judet?: string;
  cod_postal: string;
  /** Cod ISO de doua litere. Implicit `RO`. */
  tara?: string;
};

export type FedexConfig = {
  enabled: boolean;
  /**
   * „API Key" din portalul FedEx. NU e criptat: singur nu deschide nimic (OAuth-ul
   * lor cere si secretul), iar comerciantul trebuie sa-l poata reciti ca sa stie ce
   * proiect a legat. Acelasi rationament ca la `oblio_config.client_id`.
   */
  client_id: string;
  /**
   * „Secret Key" din portalul FedEx.
   *
   * ⚠ Numele campului trebuie sa ramana identic in TREI locuri: aici, in
   * `CAMPURI_SECRETE` (lib/integrari/secrete.ts) si in `privat.campuri_secrete`
   * (migratia). Nimic nu verifica potrivirea, iar o nepotrivire taie tot stratul de
   * secrete in tacere. Vezi antetul migratiei.
   */
  client_secret: string;
  /** Numarul de cont FedEx, 9 cifre. `accountNumber.value`, max 9 caractere. */
  account_number: string;
  /** `test` = sandbox virtualizat, `productie` = apis.fedex.com. */
  mediu?: MediuFedex;
  expeditor?: ExpeditorFedex;
  /**
   * Serviciile pe care comerciantul le lasa sa apara in checkout, dupa enumerarea
   * FedEx. Gol = toate cele pe care le intoarce cotarea.
   */
  servicii_permise?: string[];
  pickup_type?: TipRidicare;
  format_eticheta?: FormatEticheta;
  /** `labelStockType`. Vezi `STOCURI_ETICHETA`. */
  stoc_eticheta?: string;
  /** Dimensiunile implicite ale coletului, in CENTIMETRI. */
  lungime_cm?: number;
  latime_cm?: number;
  inaltime_cm?: number;
  /** Textul de pe documentele vamale cand comanda n-are altul. */
  continut_implicit?: string;
  /** Declara valoarea comenzii la transport. Poate costa; stins din oficiu. */
  valoare_declarata?: boolean;
};

/**
 * Aceeasi regula de „configurat" peste tot: panou, checkout, comanda, cron, lot.
 *
 * ⚠ Expeditorul intra in ea, nu doar credentialele. Fara oras + cod postal de
 * plecare, `POST /rate/v1/rates/quotes` nu poate fi nici macar format — iar in
 * checkout asta inseamna ca toti cumparatorii vad tariful fix in loc de cel real,
 * fara niciun semn ca lipseste ceva. Aceeasi lectie ca la `smartshipGata` si
 * `shipoGata`.
 */
export function fedexGata(c: FedexConfig | null | undefined): c is FedexConfig {
  return !!(
    c?.enabled
    && (c.client_id ?? "").trim()
    && (c.client_secret ?? "").trim()
    && (c.account_number ?? "").trim()
    && (c.expeditor?.oras ?? "").trim()
    && (c.expeditor?.cod_postal ?? "").trim()
  );
}

/** Gazda pentru configurarea data. Implicitul e PRODUCTIA: un cont real nu trebuie sa nimereasca in sandbox. */
export function gazda(c: Pick<FedexConfig, "mediu">): string {
  return GAZDE[c.mediu === "test" ? "test" : "productie"];
}

// ─── Nomenclatoare ───────────────────────────────────────────────────────────

/**
 * `labelStockType` — enumerarea completa din schema lor (18 valori).
 *
 * Dimensiunile sunt in numele enumerarii, in INCH: `4X6` = 4x6", `85X11` =
 * 8,5x11" (jumatatea de sus sau de jos a unei coli A4-ish), `4X105` = 4x10,5".
 * `PAPER_*` = coala normala, `STOCK_*` = rola termica, `*_DOC_TAB` = cu banda de
 * documente. FedEx nu publica nicaieri echivalentul in milimetri.
 */
export const STOCURI_ETICHETA = [
  "PAPER_4X6", "PAPER_4X675", "PAPER_4X8", "PAPER_4X9", "PAPER_7X475",
  "PAPER_85X11_BOTTOM_HALF_LABEL", "PAPER_85X11_TOP_HALF_LABEL", "PAPER_LETTER",
  "STOCK_4X6", "STOCK_4X675", "STOCK_4X8", "STOCK_4X9",
  "STOCK_4X675_LEADING_DOC_TAB", "STOCK_4X675_TRAILING_DOC_TAB",
  "STOCK_4X9_LEADING_DOC_TAB", "STOCK_4X9_TRAILING_DOC_TAB",
  "STOCK_4X85_TRAILING_DOC_TAB", "STOCK_4X105_TRAILING_DOC_TAB",
] as const;

/**
 * Implicitele de eticheta: PDF pe coala, jumatatea de sus.
 *
 * `PAPER_85X11_TOP_HALF_LABEL` e cea mai folosita in propriile lor exemple (705 din
 * ~1335 de cereri publicate) si e singura care se tipareste pe o imprimanta
 * obisnuita de birou — ce are un magazin romanesc, nu o imprimanta termica.
 */
export const FORMAT_IMPLICIT: FormatEticheta = "PDF";
export const STOC_IMPLICIT = "PAPER_85X11_TOP_HALF_LABEL";

/**
 * ⚠ `resolution: 300` merge NUMAI cu `ZPLII`.
 *
 * Verbatim: „300 DPI resolution is only allowed for ZPLII image type." Pentru orice
 * altceva sistemul lor cade inapoi pe 203 — deci nu-l trimitem deloc.
 */
export function specificatieEticheta(c: Pick<FedexConfig, "format_eticheta" | "stoc_eticheta">) {
  const imageType = c.format_eticheta ?? FORMAT_IMPLICIT;
  const stoc = (c.stoc_eticheta ?? "").trim();
  const labelStockType = (STOCURI_ETICHETA as readonly string[]).includes(stoc) ? stoc : STOC_IMPLICIT;
  return { imageType, labelStockType };
}

/**
 * Ziua calendaristica, in fusul Romaniei.
 *
 * ⚠ STA AICI, nu in `expediere.ts`, si nu din stil: e folosita si de emitere
 * (`shipDatestamp`) si de cautarea dupa referinta (`shipDateBegin`/`shipDateEnd`).
 * Doua definitii s-ar fi departat, iar `toISOString()` — care da ziua UTC — ar fi
 * facut ca intre miezul noptii si ora 3 fereastra de cautare sa se inchida INAINTE
 * de ziua in care tocmai s-a emis AWB-ul: „nu exista nicio expediere cu referinta
 * comenzii" pentru un colet creat cu doua minute in urma.
 *
 * `sv-SE` da chiar `YYYY-MM-DD`, si e cel mai scurt drum fara o biblioteca.
 */
export function ziuaAzi(acum: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bucharest" }).format(acum);
}

/** Extensia de fisier pentru un format de eticheta. `ZPLII` e text, nu imagine. */
export function extensiaEtichetei(format: string): string {
  if (format === "PNG") return "png";
  if (format === "ZPLII") return "zpl";
  return "pdf";
}

// ─── Tipurile raspunsurilor ───────────────────────────────────────────────────

export type AlertaFedex = { code: string; alertType: string; message: string };

/** O oferta de transport, dupa ce a fost curatata de invelisurile lor. */
export type OfertaFedex = {
  serviceType: string;
  serviceName: string;
  /** `ratedShipmentDetails[].totalNetCharge` de pe intrarea aleasa. */
  pret: number;
  /** `shipmentRateDetail.currency`. ⚠ Poate fi EUR sau USD. Vezi `preturi.ts`. */
  valuta: string;
  /** `rateType` de pe intrarea aleasa: `ACCOUNT`, `LIST`, `PREFERRED_CURRENCY`… */
  tipTarif: string;
  /** Textul de tranzit, cand FedEx il da („2-7 Business Days", `TWO_DAYS`). */
  tranzit: string | null;
  /** Data estimata de livrare, cand exista. */
  livrareEstimata: string | null;
};

export type RaspunsExpediere = {
  /** `masterTrackingNumber`. Cel pe care se face si anularea. */
  awb: string;
  /** AWB-urile pe colet. La un singur colet, unul singur si egal cu masterul. */
  awbColete: string[];
  serviceType: string | null;
  serviceName: string | null;
  /** Eticheta, base64, exact cum vine de la ei. */
  eticheta: string | null;
  /** Costul, cand raspunsul de emitere il aduce (`pieceResponses[].netChargeAmount`). */
  cost: number | null;
  valuta: string | null;
  alerte: AlertaFedex[];
};

export type UrmarireFedex = {
  awb: string;
  /** `latestStatusDetail.derivedCode`. ⚠ SET DESCHIS. Vezi `statusuri.ts`. */
  cod: string | null;
  descriere: string | null;
  /** `dateAndTimes[type=ACTUAL_DELIVERY]`, cand exista. Cel mai curat semnal de livrare. */
  livratLa: string | null;
  /** Eroarea PE NUMAR, dintr-un raspuns 200 care a reusit la nivel HTTP. */
  eroare: string | null;
  /**
   * Codul acelei erori, neatins.
   *
   * ⚠ Exista separat de text fiindca deciziile se iau dupa COD, niciodata dupa
   * mesaj — regula lor, scrisa in ghidul de bune practici. Si aici e chiar
   * deosebirea dintre „nu exista nicio expediere" (`…NOTFOUND`, un raspuns bun) si
   * „nu ti-am putut spune" (orice altceva), de care depinde daca deblocam sau nu
   * emiterea. Vezi `cautaDupaReferinta`.
   */
  codEroare: string | null;
};

// ─── Citirea erorilor lor ─────────────────────────────────────────────────────

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

function numarSauNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Traducerea codurilor pe care le RECUNOASTEM.
 *
 * ⚠ Nu e o lista completa — FedEx publica 1.724 de coduri distincte (926 doar la
 * Ship). Sunt aici doar cele pe care un comerciant roman le poate chiar intalni si
 * repara singur. Restul trec mai departe cu codul si mesajul lor, in engleza:
 * un mesaj strain e mai bun decat unul romanesc inventat gresit.
 */
const CODURI: Record<string, string> = {
  // Autorizare
  "NOT.AUTHORIZED.ERROR": "FedEx a respins credentialele. Verifica API Key si Secret Key din portalul FedEx, si daca proiectul e pe mediul ales (test sau productie).",
  "FORBIDDEN.ERROR": "FedEx a refuzat accesul. Cel mai des inseamna ca proiectul din portalul lor n-are activat API-ul cerut, sau ca prea multe cereri de token au venit de pe acelasi IP.",
  // Cont
  "ACCOUNT.NUMBER.INVALID": "Numarul de cont FedEx e invalid. Are 9 cifre si se vede pe factura FedEx.",
  "ACCOUNT.NUMBERORKEY.INVALID": "Numarul de cont nu se potriveste cu cheia de API. Amandoua trebuie sa fie din acelasi cont FedEx.",
  "ACCOUNT.NUMBER.MISMATCH": "Cand transportul se plateste de expeditor, contul platitor trebuie sa fie chiar contul expeditorului.",
  "RATING.QUOTE.NOTAVAILABLE": "FedEx nu are tarife pentru contul asta pe ruta ceruta. Contul poate fi nou sau fara serviciile astea activate.",
  // Adresa
  "POSTALCODE.ZIPCODE.REQUIRED": "Lipseste codul postal. Romania e tara „postal-aware” la FedEx: fara cod postal de 6 cifre nu se poate nici cota, nici expedia.",
  "COUNTRY.POSTALCODEORZIP.INVALID": "Codul postal nu se potriveste cu tara. In Romania are 6 cifre.",
  "COUNTRY.POSTALCODE.INVALID": "Codul postal al expeditorului lipseste sau e gresit. Completeaza-l in configurarea FedEx.",
  "DESTINATION.POSTALCODE.MISSING.ORINVALID": "Codul postal al destinatarului lipseste sau e gresit.",
  "ORIGINZIPCODE.SERVICE.ERROR": "FedEx nu deserveste codul postal de plecare.",
  "ENTERED.ZIPCODE.NOTFOUND": "Combinatia de oras si cod postal nu a fost gasita la FedEx.",
  "CITY.REQUIRED": "Lipseste orasul.",
  // Serviciu
  "FEDEXSERVICE.NOT.AVAILABLE": "FedEx nu ofera servicii pe ruta asta.",
  "SERVICE.LOCATION.UNAVAILABLE": "FedEx nu deserveste combinatia asta de plecare si destinatie.",
  "SERVICETYPE.NOT.ALLOWED": "Serviciul ales nu e permis intre cele doua adrese. In Romania merg FedEx First, FedEx Priority Express si FedEx Priority.",
  "SERVICE.TYPE.NOTAVAILABLE": "Serviciul cerut nu e suportat.",
  "SERVICE.PACKAGECOMBINATION.INVALID": "Combinatia de serviciu si tip de ambalaj nu e valida.",
  "PACKAGINGTYPE.MISSING.OR.INVALID": "Tipul de ambalaj lipseste sau e invalid.",
  "PICKUPTYPE.REQUIRED": "Lipseste tipul de ridicare din cerere.",
  "PICKUPTYPE.NOT.AVAILABLE": "Ridicarea nu e disponibila. Alege alt tip de ridicare sau alta data de expediere.",
  // Greutate si dimensiuni
  "PACKAGE.WEIGHT.INVALID": "Greutatea coletului lipseste sau e invalida.",
  "MAXIMUMWEIGHT.TYPE.ERROR": "Greutatea depaseste 68 kg pe colet, limita serviciilor FedEx Express.",
  "MAXIMUM.WEIGHT.EXCEEDED": "Greutatea depaseste limita FedEx.",
  "PACKAGEDIMENSION.TYPE.ERROR": "Fiecare dimensiune trebuie sa fie de cel putin 1 cm.",
  "DIMENSIONS.EXCEEDS.LIMITS": "Dimensiunile coletului depasesc limitele FedEx.",
  // Valuta
  "CURRENCY.TYPE.INVALID": "Valuta nu e acceptata de contul FedEx.",
  "SHIPMENT.CURRENCYCODE.INVALID": "Valuta nu e acceptata de contul FedEx. Lista valutelor permise depinde de cont si de tara.",
  // Anulare
  "CANCELSHIPMENT.TRACKINGNUMBER.DELETED": "Expedierea era deja anulata la FedEx.",
  "TRACKINGIDS.TRACKINGNUMBER.CLOSED": "Coletul nu mai poate fi anulat: ziua de expeditie a fost inchisa la FedEx.",
  // Urmarire
  "TRACKING.TRACKINGNUMBER.NOTFOUND": "FedEx nu gaseste numarul AWB. Poate dura pana la 24 de ore pana apare in sistemul lor.",
  "TRACKING.REFERENCENUMBER.NOTFOUND": "FedEx nu gaseste nicio expediere cu referinta asta.",
  "TRACKING.DATA.NOTUNIQUE": "Referinta se potriveste cu mai multe expedieri la FedEx. Cauta dupa numarul AWB.",
  // Cote
  "SERVICE.UNAVAILABLE.ERROR": "Serviciul FedEx e temporar indisponibil.",
  "INTERNAL.SERVER.ERROR": "FedEx a raspuns cu o eroare interna.",
};

/** Codurile de gateway pe care le stim ca nu au legatura cu datele expedierii. */
const COD_AUTORIZARE = new Set(["NOT.AUTHORIZED.ERROR", "FORBIDDEN.ERROR"]);

type EroareFedex = { code: string; message: string };

function erorileDin(corp: unknown): EroareFedex[] {
  if (!corp || typeof corp !== "object") return [];
  const brute = (corp as { errors?: unknown }).errors;
  if (!Array.isArray(brute)) return [];
  return brute
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({ code: text(e.code), message: text(e.message) }))
    .filter((e) => e.code || e.message);
}

/**
 * Textul pentru comerciant.
 *
 * Ordinea de cautare acopera toate cele trei forme pe care le raspund ei:
 * `errors[]` (standard), `error_description` (gateway, nedocumentata) si
 * `output.message` (anulare).
 */
export function descrieEroarea(corp: unknown, brut: string): string {
  const erori = erorileDin(corp);
  if (erori.length > 0) {
    const bucati = erori.map((e) => {
      const tradus = CODURI[e.code];
      if (tradus) return tradus;
      return e.message ? `${e.message}${e.code ? ` (${e.code})` : ""}` : e.code;
    });
    return [...new Set(bucati)].join(" | ").slice(0, 500);
  }

  if (corp && typeof corp === "object") {
    const o = corp as Record<string, unknown>;
    /*
     * ⚠ Forma NEDOCUMENTATA. Un token stricat intoarce `401 {"error_description":
     * "Invalid CXS JWT"}` — fara `transactionId`, fara `errors[]`. Un parser care
     * s-ar uita doar la `errors[]` ar spune „raspuns gol" si ar ascunde cauza.
     */
    const desc = text(o.error_description) || text(o.error);
    if (desc) return desc.slice(0, 500);
    const iesire = o.output;
    if (iesire && typeof iesire === "object") {
      const m = text((iesire as Record<string, unknown>).message);
      if (m) return m.slice(0, 500);
    }
  }

  return brut.trim().slice(0, 300) || "raspuns gol";
}

/** Primul cod de eroare din raspuns, pentru cine decide dupa cod. */
export function primulCod(corp: unknown): string | null {
  return erorileDin(corp)[0]?.code ?? null;
}

/**
 * Avertismentele dintr-un raspuns de SUCCES.
 *
 * ⚠ Nu sunt decor. `alertType: WARNING` acopera si „Shipper Postal-City Mismatch"
 * si `ORIGIN.STATEORPROVINCECODE.CHANGED` — adica FedEx ti-a SCHIMBAT adresa si te
 * anunta doar aici. Si `VIRTUAL.RESPONSE`, care spune ca raspunsul e din sandbox.
 */
export function alerteleDin(corp: unknown): AlertaFedex[] {
  const iesire = (corp as { output?: unknown } | null)?.output;
  const brute = (iesire as { alerts?: unknown } | null)?.alerts;
  if (!Array.isArray(brute)) return [];
  return brute
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({ code: text(a.code), alertType: text(a.alertType), message: text(a.message) }))
    .filter((a) => a.code || a.message);
}

/** Raspunsul vine din sandbox-ul lor virtualizat? */
export function eRaspunsVirtual(alerte: AlertaFedex[]): boolean {
  return alerte.some((a) => a.code === "VIRTUAL.RESPONSE");
}

// ─── Tokenul ─────────────────────────────────────────────────────────────────

/**
 * Tokenurile vii, pe pereche (gazda, client_id).
 *
 * ⚠ CHEIA CUPRINDE SI GAZDA. Acelasi `client_id` poate fi folosit si pe sandbox si
 * pe productie, iar tokenul de sandbox trimis la `apis.fedex.com` da 401 — adica
 * exact un esec care arata a „credentiale gresite" pe niste credentiale bune.
 *
 * ⚠ SI E ESENTIAL SA EXISTE. `/oauth/token` are prag de rata PE IP: 3 cereri/s timp
 * de 5s, sau 1/s timp de 2 minute, si raspunde 403 timp de 10 minute, prelungibil.
 * Pe Vercel IP-urile sunt partajate — un client fara cache ar bloca cotarea pe toate
 * magazinele deodata, si nu doar pe FedEx.
 *
 * `expires_in` al lor e 3600 de secunde (schema si docs; `-Introduction.json` zice
 * „milliseconds", dar e invechit). Se scade o MARJA de 60 de secunde: un token care
 * expira intre verificare si folosire ar produce un 401 exact in mijlocul unei
 * emiteri, adica exact acolo unde nu vrem sa nu stim.
 */
const MARJA_TOKEN_MS = 60_000;
const tokenuri = new Map<string, { token: string; expiraLa: number }>();

/** Pentru probe: goleste tokenurile pastrate. */
export function uitaTokenurile(): void {
  tokenuri.clear();
}

function cheieToken(baza: string, clientId: string): string {
  return `${baza}|${clientId}`;
}

async function token(config: Pick<FedexConfig, "client_id" | "client_secret" | "mediu">, forteaza = false): Promise<string> {
  const baza = gazda(config);
  const id = (config.client_id ?? "").trim();
  const secret = (config.client_secret ?? "").trim();
  if (!id || !secret) throw eroareRefuz("Lipsesc API Key si Secret Key din configurarea FedEx.");

  const cheie = cheieToken(baza, id);
  const viu = tokenuri.get(cheie);
  if (!forteaza && viu && viu.expiraLa > Date.now()) return viu.token;

  /*
   * ⚠ `application/x-www-form-urlencoded`, NU JSON. Sonda din 16.08.2026: acelasi
   * corp trimis ca JSON primeste 400 „Missing or duplicate parameters".
   */
  const corp = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: id,
    client_secret: secret,
  });

  let res: Response;
  try {
    res = await fetch(`${baza}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: corp.toString(),
      signal: AbortSignal.timeout(ASTEPTARE_AUTH_MS),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    throw eroareNesigura(`FedEx POST /oauth/token: ${(e as Error).message}`);
  }

  const brut = await res.text();
  let date: unknown = null;
  if (brut.trim()) { try { date = JSON.parse(brut); } catch { date = null; } }

  if (!res.ok) {
    if (res.status === 401) {
      throw insemneaza(
        eroareRefuz(
          "FedEx a respins credentialele. Verifica API Key si Secret Key din portalul FedEx si asigura-te "
          + "ca proiectul e pe mediul ales (cheile de test NU merg in productie si invers).",
        ),
        res.status, primulCod(date),
      );
    }
    /*
     * ⚠ 403 pe `/oauth/token` inseamna aproape sigur pragul de rata pe IP, nu
     * credentiale gresite — si dureaza 10 minute. Spus altfel, comerciantul ar
     * schimba cheile bune degeaba.
     */
    if (res.status === 403) {
      throw insemneaza(
        eroareRefuz(
          "FedEx a blocat temporar cererile de autentificare venite de la noi (limita lor pe adresa IP, "
          + "in jur de 10 minute). Nu schimba cheile — incearca din nou peste cateva minute.",
        ),
        res.status, primulCod(date),
      );
    }
    throw insemneaza(
      eroareCuStatus(`FedEx POST /oauth/token: ${res.status} — ${descrieEroarea(date, brut)}`, res.status),
      res.status, primulCod(date),
    );
  }

  const acces = (date as { access_token?: unknown } | null)?.access_token;
  if (typeof acces !== "string" || !acces.trim()) {
    throw eroareNesigura(`FedEx POST /oauth/token: raspuns fara access_token — ${brut.slice(0, 200)}`);
  }

  const secunde = Number((date as { expires_in?: unknown }).expires_in);
  const viata = Number.isFinite(secunde) && secunde > 0 ? secunde * 1000 : 3_600_000;
  tokenuri.set(cheie, { token: acces, expiraLa: Date.now() + Math.max(0, viata - MARJA_TOKEN_MS) });
  return acces;
}

// ─── Apelul ───────────────────────────────────────────────────────────────────

/**
 * Ce face cererea la ei — si de asta depinde cum se citeste un esec.
 *
 * `citire`  o cerere care NU creeaza nimic (cotare, urmarire, locatii).
 *           Orice esec al ei e refuz DOVEDIT: n-a ramas nimic in urma.
 * `scriere` o cerere care poate lasa ceva in urma (emitere, anulare).
 *           Un esec ambiguu iese `necunoscut` si BLOCHEAZA.
 *
 * ⚠ Nu se poate deduce din metoda HTTP: `POST /rate/v1/rates/quotes` si
 * `POST /track/v1/trackingnumbers` sunt citiri, iar `PUT /ship/v1/shipments/cancel`
 * e o scriere. De aia campul e OBLIGATORIU in semnatura — asa `tsc` enumera
 * apelantii si nimeni nu poate uita sa se gandeasca la el.
 */
type Efect = "citire" | "scriere";

/**
 * Un apel catre FedEx.
 *
 * ═══ VERDICTELE ═══
 *
 *   retea cazuta / timeout          -> citire: refuz. scriere: NU STIM.
 *   HTTP 4xx (fara 408 si 429*)     -> refuz dovedit.
 *   HTTP 5xx / 408                  -> citire: refuz. scriere: NU STIM.
 *   HTTP 2xx + corp necitibil       -> NU STIM.
 *   HTTP 2xx + `errors[]`           -> refuz dovedit (au citit cererea si au respins-o).
 *
 * (*) 429 ramane refuz, ca peste tot in proiect: inseamna „nu am procesat,
 * incetineste". Mesajul lor trebuie citit ca sa se stie daca e cota pe 10 secunde
 * sau cota zilnica — de aia trece mai departe intreg.
 */
async function apel<T>(
  config: Pick<FedexConfig, "client_id" | "client_secret" | "mediu">,
  metoda: "GET" | "POST" | "PUT",
  cale: string,
  optiuni: { efect: Efect; corp?: unknown; asteptareMs?: number; referinta?: string },
): Promise<T> {
  const baza = gazda(config);
  const { efect, corp } = optiuni;
  const asteptareMs = optiuni.asteptareMs ?? (efect === "scriere" ? ASTEPTARE_EMITERE_MS : ASTEPTARE_MS);
  const ambiguu = (mesaj: string) => (efect === "citire" ? eroareRefuz(mesaj) : eroareNesigura(mesaj));

  const trimite = async (acces: string): Promise<Response> => fetch(`${baza}${cale}`, {
    method: metoda,
    headers: {
      Authorization: `Bearer ${acces}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      /*
       * ⚠ NU e cheie de idempotenta. Descrierea lor: „helps you match the request
       * to the reply". Nimic nu spune ca un al doilea POST cu acelasi id ar fi
       * respins. E aici doar ca sa se poata cauta in jurnalele LOR cand ceva iese
       * prost. Protectia contra duplicatelor sta in registrul de operatii externe.
       */
      ...(optiuni.referinta ? { "x-customer-transaction-id": optiuni.referinta.slice(0, 40) } : {}),
    },
    body: corp !== undefined ? JSON.stringify(corp) : undefined,
    signal: AbortSignal.timeout(asteptareMs),
    cache: "no-store",
    /* Un 3xx aici n-are ce cauta; urmat, ar putea aduce o pagina de login. */
    redirect: "manual",
  });

  let res: Response;
  try {
    res = await trimite(await token(config));
    /*
     * ⚠ O SINGURA reincercare, si numai pe 401.
     *
     * Tokenul lor traieste o ora, iar noi il pastram intr-o harta care poate
     * supravietui expirarii daca ceasul instantei si al lor nu bat exact. Un 401 pe
     * o cerere obisnuita inseamna aproape sigur „token expirat", nu „chei gresite" —
     * cheile gresite cad mai devreme, chiar la `/oauth/token`.
     *
     * Reincercarea e sigura si pentru scrieri: un 401 inseamna ca cererea NU a fost
     * autorizata, deci nu s-a creat nimic. Mai mult de o data insa nu se reincearca
     * — pe `/oauth/token` exista prag de rata pe IP, si o bucla l-ar atinge.
     */
    if (res.status === 401) res = await trimite(await token(config, true));
  } catch (e) {
    throw ambiguu(`FedEx ${metoda} ${cale}: ${(e as Error).message}`);
  }

  const brut = await res.text();
  let date: unknown = null;
  if (brut.trim()) { try { date = JSON.parse(brut); } catch { date = null; } }

  if (!res.ok) {
    const cod = primulCod(date);
    const mesaj = `FedEx ${metoda} ${cale}: ${descrieEroarea(date, brut)}`;
    if (res.status === 401 || (res.status === 403 && cod && COD_AUTORIZARE.has(cod))) {
      throw insemneaza(eroareRefuz(descrieEroarea(date, brut)), res.status, cod);
    }
    const e = res.status >= 500 || res.status === 408 ? ambiguu(mesaj) : eroareCuStatus(mesaj, res.status);
    throw insemneaza(e, res.status, cod);
  }

  /*
   * ⚠ Un 2xx cu corp necitibil NU e succes: citit ca succes, am raporta o expediere
   * care poate nu exista; citit ca refuz, am debloca reincercarea.
   */
  if (date === null) {
    throw ambiguu(`FedEx ${metoda} ${cale}: raspuns necitibil (${res.status}) — ${brut.slice(0, 200)}`);
  }

  /*
   * ⚠ AICI SE CITESTE A DOUA OARA. Un 200 poate purta `errors[]` — si atunci
   * cererea a fost citita si respinsa, deci n-a ramas nimic in urma: refuz dovedit,
   * indiferent de efect.
   */
  const erori = erorileDin(date);
  if (erori.length > 0) {
    throw insemneaza(eroareRefuz(descrieEroarea(date, brut)), res.status, erori[0].code);
  }

  return date as T;
}

// ─── Proba de conexiune ───────────────────────────────────────────────────────

export type ProbaFedex = {
  mediu: MediuFedex;
  /** Cotarea a mers? Daca da, si ce a intors. */
  cotare: { ok: boolean; mesaj: string; servicii: string[]; valuta: string | null; virtual: boolean };
};

/**
 * Proba de conexiune.
 *
 * ⚠ NU se opreste la „am luat un token".
 *
 * Un token se ia cu orice pereche de chei valide, chiar daca proiectul din portalul
 * FedEx n-are activat niciun API si chiar daca numarul de cont e al altcuiva. O
 * proba care s-ar opri acolo ar raspunde „conexiune reusita" unui comerciant a carui
 * integrare nu poate cota nimic — exact defectul fGO din 2026-08-15, unde „Testeaza
 * conexiunea" chema un nomenclator PUBLIC si trecea cu credentiale inventate.
 *
 * Deci se cere o COTARE reala, de la expeditorul lui catre el insusi: foloseste
 * tokenul, foloseste numarul de cont, si cere API-ul de Rate sa fie activat.
 * Nu creeaza nimic si nu costa nimic.
 */
export async function probaConexiune(
  config: FedexConfig,
  construiesteCerereTarif: () => unknown,
): Promise<ProbaFedex> {
  const mediu: MediuFedex = config.mediu === "test" ? "test" : "productie";

  try {
    const r = await apel<Record<string, unknown>>(config, "POST", "/rate/v1/rates/quotes", {
      efect: "citire",
      corp: construiesteCerereTarif(),
    });
    const alerte = alerteleDin(r);
    const iesire = (r.output ?? {}) as Record<string, unknown>;
    const detalii = Array.isArray(iesire.rateReplyDetails) ? iesire.rateReplyDetails : [];
    const servicii = detalii
      .map((d) => text((d as Record<string, unknown>).serviceType))
      .filter(Boolean);

    const valute = new Set<string>();
    for (const d of detalii) {
      const rate = (d as { ratedShipmentDetails?: unknown }).ratedShipmentDetails;
      if (!Array.isArray(rate)) continue;
      for (const r2 of rate) {
        const c = text(((r2 as Record<string, unknown>).shipmentRateDetail as Record<string, unknown> | undefined)?.currency);
        if (c) valute.add(c);
      }
    }

    return {
      mediu,
      cotare: {
        ok: servicii.length > 0,
        mesaj: servicii.length > 0
          ? `FedEx a raspuns cu ${servicii.length} ${servicii.length === 1 ? "serviciu" : "servicii"}.`
          : "FedEx a raspuns, dar n-a intors niciun serviciu pentru adresa de expeditie configurata. Verifica orasul si codul postal.",
        servicii: [...new Set(servicii)],
        valuta: valute.size > 0 ? [...valute].join(", ") : null,
        virtual: eRaspunsVirtual(alerte),
      },
    };
  } catch (e) {
    return {
      mediu,
      cotare: { ok: false, mesaj: (e as Error).message, servicii: [], valuta: null, virtual: false },
    };
  }
}

// ─── Cotarea ─────────────────────────────────────────────────────────────────

/** Raspunsul brut de la `POST /rate/v1/rates/quotes`, pentru `preturi.ts`. */
export async function tarife(config: FedexConfig, corp: unknown): Promise<{ detalii: unknown[]; alerte: AlertaFedex[] }> {
  const r = await apel<Record<string, unknown>>(config, "POST", "/rate/v1/rates/quotes", {
    efect: "citire",
    corp,
  });
  const iesire = (r.output ?? {}) as Record<string, unknown>;
  return {
    detalii: Array.isArray(iesire.rateReplyDetails) ? iesire.rateReplyDetails : [],
    alerte: alerteleDin(r),
  };
}

// ─── Emiterea ────────────────────────────────────────────────────────────────

/** Prima eticheta dintr-un raspuns de emitere, oriunde ar sta ea. */
function etichetaDin(tranzactie: Record<string, unknown>): string | null {
  const dinLista = (v: unknown): string | null => {
    if (!Array.isArray(v)) return null;
    for (const d of v) {
      const codata = text((d as Record<string, unknown> | null)?.encodedLabel);
      if (codata) return codata;
    }
    return null;
  };

  /* Documentele de EXPEDIERE intai: acolo sta eticheta la un singur colet. */
  const laExpediere = dinLista(tranzactie.shipmentDocuments);
  if (laExpediere) return laExpediere;

  const piese = tranzactie.pieceResponses;
  if (Array.isArray(piese)) {
    for (const p of piese) {
      const laColet = dinLista((p as Record<string, unknown>).packageDocuments);
      if (laColet) return laColet;
    }
  }
  return null;
}

/**
 * `POST /ship/v1/shipments`.
 *
 * ⚠ Se cheama DOAR din interiorul registrului de operatii externe. FedEx n-are
 * idempotenta, deci o a doua trimitere creeaza al doilea AWB, taxabil.
 */
export async function creeazaExpediere(
  config: FedexConfig,
  corp: unknown,
  referinta: string,
): Promise<RaspunsExpediere> {
  const r = await apel<Record<string, unknown>>(config, "POST", "/ship/v1/shipments", {
    efect: "scriere",
    corp,
    referinta,
  });

  const iesire = (r.output ?? {}) as Record<string, unknown>;
  const tranzactii = Array.isArray(iesire.transactionShipments) ? iesire.transactionShipments : [];
  const t = (tranzactii[0] ?? {}) as Record<string, unknown>;

  const piese = Array.isArray(t.pieceResponses) ? t.pieceResponses : [];
  const awbColete = piese
    .map((p) => text((p as Record<string, unknown>).trackingNumber))
    .filter(Boolean);

  const master = text(t.masterTrackingNumber) || awbColete[0] || "";

  /*
   * ⚠ Fara AWB nu exista expediere de raportat — dar poate exista una la ei.
   *
   * Un 200 cu `transactionShipments` gol inseamna ca n-am inteles raspunsul, nu ca
   * n-au creat nimic. `eroareNesigura` tine randul blocat si scoate cazul la om, in
   * loc sa lase urmatoarea apasare sa emita al doilea AWB.
   *
   * `output.jobId` inseamna altceva: expediere ASINCRONA (peste 40 de colete). Noi
   * trimitem mereu un singur colet, deci daca apare, ceva e in neregula cu cererea —
   * si tot „nu stim" e raspunsul cinstit, fiindca jobul poate produce AWB-uri.
   */
  if (!master) {
    const jobId = text(iesire.jobId);
    throw eroareNesigura(
      jobId
        ? `FedEx a preluat expedierea ca lucrare asincrona (jobId ${jobId}) in loc sa intoarca AWB-ul. Verifica in contul FedEx daca s-a creat.`
        : "FedEx a raspuns fara numar AWB. Verifica in contul FedEx daca expedierea s-a creat, inainte de a incerca din nou.",
    );
  }

  const primaPiesa = (piese[0] ?? {}) as Record<string, unknown>;

  return {
    awb: master,
    awbColete: awbColete.length > 0 ? awbColete : [master],
    serviceType: text(t.serviceType) || null,
    serviceName: text(t.serviceName) || null,
    eticheta: etichetaDin(t),
    cost: numarSauNull(primaPiesa.netChargeAmount),
    valuta: text(primaPiesa.currency) || null,
    alerte: alerteleDin(r),
  };
}

// ─── Anularea ────────────────────────────────────────────────────────────────

export type RezultatAnulare = { anulat: boolean; mesaj: string; eraDejaAnulat: boolean };

/**
 * `PUT /ship/v1/shipments/cancel` — atentie, **PUT**, nu DELETE.
 *
 * ⚠ „Deja anulat" NU e un esec. `CANCELSHIPMENT.TRACKINGNUMBER.DELETED` inseamna ca
 * starea dorita exista deja, iar apelantul trebuie sa poata elibera slotul din
 * registru — altfel comanda ramane blocata pe un AWB care nu mai exista la ei.
 */
export async function anuleaza(config: FedexConfig, awb: string): Promise<RezultatAnulare> {
  const corp = {
    accountNumber: { value: (config.account_number ?? "").trim() },
    trackingNumber: awb,
    /* Enum cu o singura valoare. La MPS sterge toate coletele deodata — si tot
       documentatia lor spune ca stergerea unui singur colet strica secventa de
       etichete si poate produce probleme la vama. */
    deletionControl: "DELETE_ALL_PACKAGES",
  };

  try {
    const r = await apel<Record<string, unknown>>(config, "PUT", "/ship/v1/shipments/cancel", {
      efect: "scriere",
      corp,
    });
    const iesire = (r.output ?? {}) as Record<string, unknown>;
    const anulat = iesire.cancelledShipment === true;
    const mesaj = text(iesire.message) || (anulat ? "Expedierea a fost anulata la FedEx." : "FedEx nu a confirmat anularea.");
    if (!anulat) throw eroareRefuz(mesaj);
    return { anulat: true, mesaj, eraDejaAnulat: false };
  } catch (e) {
    const cod = codEroare(e);
    if (cod === "CANCELSHIPMENT.TRACKINGNUMBER.DELETED") {
      return { anulat: true, mesaj: "Expedierea era deja anulata la FedEx.", eraDejaAnulat: true };
    }
    throw e;
  }
}

// ─── Urmarirea ───────────────────────────────────────────────────────────────

/** Cate numere accepta ei intr-o singura cerere. Peste, raspund `TRACKING.TRACKINGNUMBERS.LIMITEXCEEDED`. */
export const MAX_AWB_PE_CERERE = 30;

function citesteUrmarire(rezultat: Record<string, unknown>, awbCerut: string): UrmarireFedex {
  const info = (rezultat.trackingNumberInfo ?? {}) as Record<string, unknown>;
  const stare = (rezultat.latestStatusDetail ?? {}) as Record<string, unknown>;

  /* Eroarea PE NUMAR, dintr-un 200 care a reusit la nivel de cerere. */
  const er = rezultat.error && typeof rezultat.error === "object"
    ? (rezultat.error as Record<string, unknown>)
    : null;
  const codEroare = er ? (text(er.code) || null) : null;
  const eroare = er
    ? (codEroare ? CODURI[codEroare] : undefined) ?? (text(er.message) || codEroare || "eroare fara descriere")
    : null;

  let livratLa: string | null = null;
  const date = rezultat.dateAndTimes;
  if (Array.isArray(date)) {
    for (const d of date) {
      const o = d as Record<string, unknown>;
      if (text(o.type) === "ACTUAL_DELIVERY") { livratLa = text(o.dateTime) || null; break; }
    }
  }

  return {
    awb: text(info.trackingNumber) || awbCerut,
    /*
     * `derivedCode` intai, `code` pe urma: descrierile lor sunt identice („Example:
     * PU,DE,DP,HL,OC"), dar `derivedCode` e cel pe care ei il numesc „latest status
     * detail code of the package".
     */
    cod: text(stare.derivedCode) || text(stare.code) || null,
    /* ⚠ `statusByLocale` e TEXT TRADUS dupa `x-locale`, nu enumerare. Se arata, nu se compara. */
    descriere: text(stare.statusByLocale) || text(stare.description) || null,
    livratLa,
    eroare,
    codEroare,
  };
}

/**
 * `POST /track/v1/trackingnumbers` — pana la 30 de numere odata.
 *
 * ⚠ Un AWB poate intoarce MAI MULTE `trackResults`: FedEx recicleaza numerele, si
 * atunci discriminatorul e `trackingNumberUniqueId`. Se ia primul rezultat FARA
 * eroare; daca toate au eroare, se ia primul, ca sa se vada motivul.
 */
export async function urmareste(config: FedexConfig, awburi: string[]): Promise<UrmarireFedex[]> {
  const curate = [...new Set(awburi.map((a) => a.trim()).filter(Boolean))].slice(0, MAX_AWB_PE_CERERE);
  if (curate.length === 0) return [];

  const r = await apel<Record<string, unknown>>(config, "POST", "/track/v1/trackingnumbers", {
    efect: "citire",
    corp: {
      /* ⚠ `false` inseamna „fara `scanEvents`". Cerem mereu `true`. */
      includeDetailedScans: true,
      trackingInfo: curate.map((a) => ({ trackingNumberInfo: { trackingNumber: a } })),
    },
  });

  const iesire = (r.output ?? {}) as Record<string, unknown>;
  const complete = Array.isArray(iesire.completeTrackResults) ? iesire.completeTrackResults : [];

  const iesiri: UrmarireFedex[] = [];
  for (const c of complete) {
    const o = c as Record<string, unknown>;
    const awbCerut = text(o.trackingNumber);
    const rezultate = Array.isArray(o.trackResults) ? o.trackResults : [];
    if (rezultate.length === 0) continue;

    const citite = rezultate.map((x) => citesteUrmarire(x as Record<string, unknown>, awbCerut));
    iesiri.push(citite.find((x) => !x.eroare) ?? citite[0]);
  }
  return iesiri;
}

/**
 * `POST /track/v1/referencenumbers` — cautarea dupa REFERINTA NOASTRA.
 *
 * ⚠ ASTA INCHIDE FEREASTRA „am trimis si n-am primit raspuns". Spre deosebire de
 * Shipo (unde nu exista niciun camp de referinta), aici se poate afla printr-o
 * CITIRE daca expedierea chiar s-a creat, fara riscul de a emite al doilea AWB.
 *
 * ⚠ TREI capcane, toate documentate de ei:
 *
 * 1. **Intervalul de date e obligatoriu in practica** si nu poate depasi 30 de zile
 *    (`TRACKING.SHIPDATERANGE.ERROR`). Lipsa lui e tratata de ei ca „ultimele 30 de
 *    zile", dar schema il marcheaza `required`, deci il trimitem.
 * 2. **Numele campului de sfarsit e in conflict cu propria lor schema**: proprietatea
 *    se numeste `shipDateEndDate` in `required`, dar toate exemplele lor si toate
 *    cererile din colectia lor Postman trimit `shipDateEnd`. Trimitem AMANDOUA — un
 *    camp in plus e ignorat, unul lipsa cade.
 * 3. **`CUSTOMER_REFERENCE` la cautare NU e acelasi vocabular cu cel de la emitere.**
 *    Din fericire valoarea asta exista in ambele liste; alte tipuri (`INVOICE_NUMBER`,
 *    `P_O_NUMBER`) exista doar la Ship si ar da „nu gaseste nimic".
 *
 * ⚠ INTOARCE SI CODURILE DE EROARE PE REZULTAT, si asta e partea care conteaza.
 *
 * Al cincilea nivel de citire a raspunsului lor (`trackResults[].error` intr-un 200)
 * inseamna lucruri foarte diferite: `TRACKING.REFERENCENUMBER.NOTFOUND` chiar spune
 * „nu exista nimic", dar `TRACKING.DATA.NOTUNIQUE` spune „sunt MAI MULTE expedieri
 * cu referinta asta" — iar apelantul deblocheaza emiterea cand lista e goala. Topite
 * amandoua in „lista goala", a doua ar fi dus la al doilea AWB, taxabil, exact peste
 * unul care exista deja.
 */
export type RezultatCautare = {
  gasite: UrmarireFedex[];
  /** Codurile erorilor pe rezultat. Gol cand n-a fost niciuna. */
  coduriEroare: string[];
};

/** Codurile care chiar inseamna „nu exista nimic acolo". Restul sunt „nu stiu". */
const COD_NEGASIT = new Set([
  "TRACKING.REFERENCENUMBER.NOTFOUND",
  "TRACKING.TRACKINGNUMBER.NOTFOUND",
  "TRACKING.DATA.NOTFOUND",
]);

/** Toate erorile intalnite chiar inseamna „nu exista"? Lista goala inseamna DA. */
export function chiarNuExista(coduriEroare: readonly string[]): boolean {
  return coduriEroare.every((c) => COD_NEGASIT.has(c));
}

export async function cautaDupaReferinta(
  config: FedexConfig,
  referinta: string,
  deLa: Date,
  panaLa: Date,
): Promise<RezultatCautare> {
  /*
   * ⚠ ZIUA ROMANEASCA, nu cea UTC.
   *
   * `shipDatestamp` de la emitere se scrie cu `ziuaAzi()`, in fusul Romaniei.
   * Compus aici cu `toISOString()`, capatul de sus al ferestrei ar fi fost ziua
   * PRECEDENTA intre miezul noptii si ora 3 — iar cautarea n-ar fi gasit un AWB
   * emis cu doua minute inainte.
   *
   * ⚠ Si o zi de rezerva pe capatul de sus: `shipDatestamp` poate fi o data
   * VIITOARE (FedEx accepta pana la 10 zile inainte), caz in care ar fi cazut peste
   * `shipDateEnd` la orice ora. 15 zile raman mult sub plafonul lor de 30.
   */
  const inceput = ziuaAzi(deLa);
  const sfarsit = ziuaAzi(new Date(panaLa.getTime() + 24 * 3600 * 1000));

  const r = await apel<Record<string, unknown>>(config, "POST", "/track/v1/referencenumbers", {
    efect: "citire",
    corp: {
      includeDetailedScans: false,
      referencesInformation: {
        type: "CUSTOMER_REFERENCE",
        value: referinta,
        accountNumber: (config.account_number ?? "").trim(),
        shipDateBegin: inceput,
        shipDateEnd: sfarsit,
        shipDateEndDate: sfarsit,
      },
    },
  });

  const iesire = (r.output ?? {}) as Record<string, unknown>;
  const complete = Array.isArray(iesire.completeTrackResults) ? iesire.completeTrackResults : [];

  const gasite: UrmarireFedex[] = [];
  const coduriEroare = new Set<string>();
  for (const c of complete) {
    const o = c as Record<string, unknown>;
    const rezultate = Array.isArray(o.trackResults) ? o.trackResults : [];
    for (const x of rezultate) {
      const citit = citesteUrmarire(x as Record<string, unknown>, text(o.trackingNumber));
      if (citit.eroare) {
        /* Fara cod nu putem sti daca e „nu exista" sau „nu stiu" — deci „nu stiu". */
        coduriEroare.add(citit.codEroare ?? "NECUNOSCUT");
        continue;
      }
      if (citit.awb) gasite.push(citit);
    }
  }
  return { gasite, coduriEroare: [...coduriEroare] };
}

/**
 * Pagina publica de urmarire.
 *
 * Nu e un endpoint de API — e adresa pe care o deschide cumparatorul. Se compune,
 * nu se citeste din raspuns: FedEx nu intoarce niciun link de urmarire.
 */
export function linkUrmarire(awb: string): string {
  return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(awb)}`;
}
