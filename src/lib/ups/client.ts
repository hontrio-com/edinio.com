import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import { normalizeLocalityName, stripDiacritics } from "@/lib/utils/ro-address";

/**
 * Clientul UPS.
 *
 * ═══ CE E ═══
 *
 * Al CINCISPREZECELEA transportator, si al doilea transportator global dupa FedEx.
 * Documentatia: specificatiile OpenAPI COMPLETE sunt publice pe GitHub, in
 * `github.com/UPS-API/api-documentation` (41 de fisiere .yaml, fara autentificare
 * si fara sa fie ascunse in HTML ca la FedEx). Cele care conteaza:
 * `OAuthClientCredentials`, `Rating` (240 KB), `Shipping` (595 KB), `Tracking`,
 * `Locator`, `UPSTrackAlert`.
 *
 * ⚠ Dar specificatiile TRIMIT LA UN APENDICE CARE NU E IN ELE. Codurile de ramburs,
 * codurile de serviciu pe tari, codurile de taxa si cele de eroare sunt toate
 * „refer to the Appendix", iar apendicele nu e pe GitHub si `developer.ups.com` nu
 * raspunde deloc din reteaua noastra. Sursa care le contine e ghidul lor vechi,
 * „Shipping Package Web Service Developer Guide" (480 de pagini, PDF public) — de
 * acolo vin tabelul de ramburs de mai jos si cele 927 de coduri de eroare cu
 * severitatea lor.
 *
 * ═══ ⚠ SASE LUCRURI CARE NU SEAMANA CU FEDEX ═══
 *
 * **1. ⚠ RAMBURSUL EXISTA — dar numai la NIVEL DE EXPEDIERE.**
 * `ShipmentServiceOptions.COD`, verbatim: „Shipment COD is only available for EU
 * origin countries or territories and for shippers account type Daily Pickup and
 * Drop Shipping." Iar `PackageServiceOptions.COD` — cel pe care il foloseste orice
 * exemplu american — e limitat la „US/PR to US/PR, CA to CA, and CA to US", si
 * ghidul lor o spune si mai apasat: „NOTE: No EU countries currently support
 * Package level COD." Pus in locul gresit, rambursul dispare TACUT.
 *
 * **2. ⚠ AUTENTIFICAREA E `Basic`, NU CORP.** La FedEx `client_id` si
 * `client_secret` pleaca in corpul cererii de token. La UPS pleaca in antetul
 * `Authorization: Basic`, iar corpul are UN SINGUR camp (`grant_type`). Si adresa
 * tokenului **nu are prefixul `/api`** pe care il au toate celelalte.
 *
 * **3. ⚠ `expires_in` E UN SIR.** Toate campurile raspunsului de token sunt
 * `type: string` in schema lor. `Date.now() + raspuns.expires_in * 1000` pare sa
 * meargă in JS, dar `"3600" * 1000` da 3600000 doar din noroc; `+ raspuns.expires_in`
 * ar concatena. Se trece prin `Number()`, o data, aici.
 *
 * **4. ⚠ CORPUL DE SUCCES E `PascalCase`, CORPUL DE EROARE E `lowercase`.**
 * Succes: `{ ShipmentResponse: { Response: { ResponseStatus: … } } }`.
 * Eroare: `{ response: { errors: [ { code, message } ] } }`. Doua gramatici in
 * acelasi API; un singur parser le rateaza pe rand.
 *
 * **5. ⚠ RASPUNSUL SE CITESTE DE PATRU ORI, si al treilea nivel e sub un 200:**
 *   a) statusul HTTP;
 *   b) `response.errors[]` — forma de eroare, minuscule;
 *   c) `Response.ResponseStatus.Code !== "1"` — „Identifies the success or failure
 *      of the transaction. 1 = Successful", pe un 200;
 *   d) `Response.Alert[]` — avertismente pe un succes (acolo spune UPS ca ti-a
 *      SCHIMBAT adresa, ca serviciul a fost coborat sau ca tarifele negociate
 *      nu s-au aplicat).
 * Iar la urmarire mai e un al cincilea: `shipment[].warnings[]`.
 *
 * **6. ⚠ SEVERITATEA E DOCUMENTATA DE EI, si se potriveste exact peste registru.**
 * Verbatim: „Transient error - Indicates an error that is temporary in nature. …
 * The request may be issued successfully at a later time." / „Hard error -
 * Indicates the request has a problem that the system is not able to resolve."
 * Adica `hard` = refuz DOVEDIT (`esuat`), `transient` = `necunoscut`. Niciun alt
 * curier din cei paisprezece nu ne da clasificarea asta de-a gata.
 *
 * ═══ CE AVEM ═══
 *
 * `GET /api/track/v1/reference/details/{ref}` cauta dupa REFERINTA NOASTRA, deci
 * fereastra „am trimis si n-am primit raspuns" se inchide cu o CITIRE — ca la FedEx,
 * SmartShip si Innoship. Vezi `cautaDupaReferinta()`.
 */

// ─── Gazdele ─────────────────────────────────────────────────────────────────

/**
 * ⚠ CIE („Customer Integration Environment") nu e o oglinda a productiei.
 *
 * Din ghidul lor: „Shipments created in CIE mode would have 'Sample' watermark
 * across the barcode in labels", iar despre tarife: „the negotiated rates returned
 * do not reflect the contractual rate … **Typically, they are 1% off the published
 * rate**" si „the shipper eligibility for negotiated rates is not fully verified".
 *
 * Deci pe CIE se poate proba FORMA cererii si a raspunsului, dar nu preturile reale
 * si nu eligibilitatea contului. Comerciantul trebuie sa stie — scrie in interfata.
 */
export const GAZDE = {
  test: "https://wwwcie.ups.com",
  productie: "https://onlinetools.ups.com",
} as const;

export type MediuUps = keyof typeof GAZDE;

/**
 * ⚠ Prefixul API-urilor de business. Tokenul NU il are.
 *
 * `servers` din specificatiile de Rating/Shipping/Tracking/Locator: `…ups.com/api`.
 * `servers` din `OAuthClientCredentials.yaml`, declarat INAUZTRUL operatiei:
 * `…ups.com/` — fara `/api`. Lipit gresit, cererea de token da 404, iar mesajul nu
 * spune nimic despre cauza.
 */
const PREFIX_API = "/api";
const CALE_TOKEN = "/security/v1/oauth/token";

/** Citirile din calea cumparatorului: cotare, urmarire, puncte. */
export const ASTEPTARE_MS = 20_000;
/** Emiterea si anularea: pornite de comerciant, isi permit mai mult. */
const ASTEPTARE_EMITERE_MS = 45_000;
/** Autentificarea: un singur pas, si sta in fata oricarei alte cereri. */
const ASTEPTARE_AUTH_MS = 15_000;

/**
 * Versiunile fixate in cale.
 *
 * ⚠ `v2409` NU e doar „cea mai noua". Ea schimba FORMA raspunsului: verbatim,
 * „For versions >= v2403, this element will always be returned as an array. For
 * requests using versions < v2403, this element will be returned as an array if
 * there is more than one object and a single object if there is only 1."
 * Fixata mai jos, `Alert`, `PackageResults`, `RatedShipment`, `PackageLevelResults`
 * si `ItemizedCharges` sunt MEREU tablouri — deci nu mai exista clasa de defecte
 * „un singur element vine ca obiect si `.map` crapa".
 *
 * `asTablou()` ramane totusi peste tot: reimprimarea de eticheta e pe `v1`, unde
 * regula NU se aplica.
 */
export const VERSIUNE_SHIP = "v2409";
export const VERSIUNE_RATE = "v2409";
/**
 * ⚠ SUBVERSIUNEA E ALTA LA COTARE DECAT LA EMITERE, SI ASTA NU SE VEDE DIN NUME.
 *
 * Ea deschide campuri in raspuns (taxele defalcate cer >= 1601, `Zone` cere >= 2409),
 * dar cele doua API-uri publica liste DIFERITE de valori acceptate:
 *
 *   `Rating.yaml`   „Supported values: 1601, 1607, 1701, 1707, 2108, 2205,**2407,2409**"
 *   `Shipping.yaml` „Supported values: 1601, 1607, 1701, 1707, 1801, 1807, 2108, **2205**"
 *
 * Adica `2409` — cea mai noua la cotare — **nu exista deloc** la emitere. Trimisa acolo,
 * ori cade fiecare emitere, ori (mai rau) e ignorata tacut si cererea e tratata ca fara
 * subversiune, deci raspunsul vine fara campurile pe care le asteptam.
 *
 * O singura constanta pentru amandoua ar fi fost gresita intr-un sens sau in celalalt.
 */
export const SUBVERSIUNE_RATE = "2409";
export const SUBVERSIUNE_SHIP = "2205";
/** ⚠ Locator are propria numerotare: singura valoare valida pe calea vie e `v3`. */
export const VERSIUNE_LOCATOR = "v3";
/** Reimprimarea a ramas pe `v1`; acolo tablourile NU sunt garantate. */
export const VERSIUNE_ETICHETA = "v1";

/**
 * ⚠ `transactionSrc` LIPSA NU E NEUTRU: schema lui declara `default: testing`.
 *
 * Netrimis, tot traficul nostru apare la UPS drept „testing" — adica, la primul
 * incident, nici ei nu pot spune de la cine a venit cererea.
 */
const SURSA_TRANZACTIE = "edinio";

// ─── Statusul HTTP si codul, pastrate PE eroare ───────────────────────────────

const CHEIE_STATUS = "statusHttp" as const;
/** Codul de business al UPS (`response.errors[].code`), pastrat tot pe eroare. */
const CHEIE_COD = "codUps" as const;

export function statusEroare(e: unknown): number | null {
  const v = (e as { [CHEIE_STATUS]?: unknown } | null)?.[CHEIE_STATUS];
  return typeof v === "number" ? v : null;
}

/**
 * Codul UPS al erorii, cand exista.
 *
 * ⚠ Se decide DUPA cod, niciodata dupa mesaj: mesajele lor contin sabloane
 * inlocuite la rulare (`{0}`, `{MonetaryAmount}`, `{CurrencyCode}`) si sunt
 * traduse dupa `locale` pe unele cai.
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

/**
 * Formatul etichetei CERUT LA EMITERE.
 *
 * ⚠ `PDF` NU E AICI, si nu e o scapare. Verbatim din `LabelImageFormat.Code` al
 * cererii de Ship: „For shipments without return service the valid value is GIF,
 * ZPL, EPL and SPL." PDF-ul apare NUMAI la reimprimare
 * (`POST /api/labels/v1/recovery`), unde enumerarea e alta.
 *
 * Consecinta pentru un magazin romanesc fara imprimanta termica: eticheta de la
 * emitere e un GIF. Se poate tipari, dar nu e un PDF de A4 ca la FedEx.
 */
export type FormatEticheta = "GIF" | "ZPL" | "EPL" | "SPL";

export type ExpeditorUps = {
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

export type UpsConfig = {
  enabled: boolean;
  /**
   * „Client ID" din portalul UPS pentru dezvoltatori.
   *
   * NU e criptat: pleaca drept NUME DE UTILIZATOR intr-un antet `Authorization:
   * Basic`, deci singur nu deschide nimic, iar comerciantul trebuie sa-l poata
   * reciti ca sa stie ce aplicatie a legat. Acelasi rationament ca la
   * `fedex_config.client_id`.
   */
  client_id: string;
  /**
   * „Client Secret" din aceeasi aplicatie.
   *
   * ⚠ Numele campului trebuie sa ramana identic in TREI locuri: aici, in
   * `CAMPURI_SECRETE` (lib/integrari/secrete.ts) si in `privat.campuri_secrete`
   * (migratia). Nimic nu verifica potrivirea, iar o nepotrivire taie tot stratul de
   * secrete in tacere.
   */
  client_secret: string;
  /**
   * „Shipper Number"-ul UPS.
   *
   * ⚠ EXACT 6 caractere ALFANUMERICE, verbatim: „Shipper's six digit alphanumeric
   * account number." Nu e numarul de 9 cifre al FedEx si nu e `client_id`. Iar
   * `PaymentInformation…BillShipper.AccountNumber` „must be the same UPS account
   * number as the one provided in Shipper/ShipperNumber" — deci pleaca de doua ori,
   * din acelasi camp.
   */
  account_number: string;
  /** `test` = CIE (etichete cu filigran „Sample"), `productie` = onlinetools. */
  mediu?: MediuUps;
  expeditor?: ExpeditorUps;
  /**
   * Serviciile pe care comerciantul le lasa sa apara in checkout, dupa codurile UPS.
   * Gol = toate cele pe care le intoarce cotarea.
   */
  servicii_permise?: string[];
  format_eticheta?: FormatEticheta;
  /** Dimensiunile implicite ale coletului, in CENTIMETRI. */
  lungime_cm?: number;
  latime_cm?: number;
  inaltime_cm?: number;
  /** Textul de pe documentele vamale cand comanda n-are altul. */
  continut_implicit?: string;
  /** Declara valoarea comenzii la transport. Poate costa; stins din oficiu. */
  valoare_declarata?: boolean;
  /**
   * Cere tarifele contractului (`NegotiatedRatesIndicator`).
   *
   * Pornit din oficiu: fara el UPS intoarce preturile de LISTA, care sunt cele mai
   * mari, iar comerciantul ar vinde transport in pierdere. Cand contul nu e
   * indreptatit, UPS raspunde totusi 200 si pune un avertisment (`120900`,
   * `128320`) — nu cade.
   */
  tarife_negociate?: boolean;
  /**
   * Ofera ramburs.
   *
   * ⚠ Nu e un moft: rambursul UPS cere un cont de tip „Daily Pickup" sau „Drop
   * Shipping" (verbatim din schema lor). Pe alt tip de cont, fiecare cotare cu
   * ramburs cade — si atunci TOATE comenzile cu plata la livrare primesc tariful
   * fix, tacut. Proba de conexiune coteaza SI cu ramburs tocmai ca sa se afle asta
   * inainte de prima comanda.
   */
  ramburs_activ?: boolean;
  /**
   * `CODFundsCode`. Vezi `FONDURI_RAMBURS`.
   *
   * Implicit `1` (numerar) — singura forma pe care o foloseste un cumparator roman.
   */
  cod_funds_code?: string;
  /** Ofera livrare in puncte UPS Access Point. */
  puncte_activate?: boolean;
};

/**
 * Aceeasi regula de „configurat" peste tot: panou, checkout, comanda, cron, lot.
 *
 * ⚠ Expeditorul intra in ea, nu doar credentialele. Fara oras + cod postal de
 * plecare, cotarea nu poate fi nici macar formata — iar in checkout asta inseamna
 * ca toti cumparatorii vad tariful fix in loc de cel real, fara niciun semn ca
 * lipseste ceva. Aceeasi lectie ca la `fedexGata` si `shipoGata`.
 */
export function upsGata(c: UpsConfig | null | undefined): c is UpsConfig {
  return !!(
    c?.enabled
    && (c.client_id ?? "").trim()
    && (c.client_secret ?? "").trim()
    && (c.account_number ?? "").trim()
    && (c.expeditor?.oras ?? "").trim()
    && (c.expeditor?.cod_postal ?? "").trim()
  );
}

/** Gazda pentru configurarea data. Implicitul e PRODUCTIA: un cont real nu trebuie sa nimereasca in CIE. */
export function gazda(c: Pick<UpsConfig, "mediu">): string {
  return GAZDE[c.mediu === "test" ? "test" : "productie"];
}

// ─── Nomenclatoare ───────────────────────────────────────────────────────────

/**
 * `CODFundsCode` — tabelul care NU e in OpenAPI.
 *
 * Schema spune doar „For valid values refer to: Rating and Shipping COD Supported
 * Countries or Territories in the Appendix", iar apendicele nu e publicat pe GitHub.
 * Tabelul de mai jos e transcris din ghidul lor oficial („Shipping Package Web
 * Service Developer Guide", capitolul „COD Supported Countries"), sectiunea
 * **Shipment Level**:
 *
 *     Country                                       | 1 Cash | 9 Check, Cashier's Check, Money Order
 *     All European Union (EU) Countries …           |  Yes   |  Yes
 *     Russia                                        |  Yes   |  No
 *     United Arab Emirates                          |  Yes   |  No
 *
 * ⚠⚠ ACELASI DIGIT INSEAMNA ALTCEVA LA NIVEL DE COLET. In tabelul **Package Level**
 * (care nu ne priveste — „No EU countries currently support Package level COD"),
 * `9` = „Personal Check" si `0` = „Check, Cash, Cashier's Check, Money Order".
 * Copiat dintr-un exemplu american, `0` ar fi un cod invalid la nivel de expediere
 * si ar cadea cu `120626 The COD Funds Code is invalid`.
 */
export const FONDURI_RAMBURS: { cod: string; eticheta: string }[] = [
  { cod: "1", eticheta: "Numerar (ce plateste un cumparator roman)" },
  { cod: "9", eticheta: "Cec, cec bancar sau mandat postal" },
];

export const FONDURI_RAMBURS_IMPLICIT = "1";

/** Formatul implicit al etichetei. GIF: singurul care se tipareste pe o imprimanta obisnuita. */
export const FORMAT_IMPLICIT: FormatEticheta = "GIF";

/**
 * Ziua calendaristica, in fusul Romaniei.
 *
 * ⚠ STA AICI, nu in `expediere.ts`, si nu din stil: o folosesc si emiterea
 * (`Shipment.ShipmentDate`) si cautarea dupa referinta (`fromPickUpDate`). Doua
 * definitii s-ar fi departat, iar `toISOString()` — care da ziua UTC — ar fi facut
 * ca intre miezul noptii si ora 3 fereastra de cautare sa se inchida INAINTE de
 * ziua in care tocmai s-a emis AWB-ul. (Exact regresia gasita la FedEx.)
 *
 * ⚠ Formatul e `YYYYMMDD`, FARA cratime — asa il cer si `ShipmentDate`
 * („Format: YYYYMMDD") si `fromPickUpDate`.
 */
export function ziuaUps(acum: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bucharest" })
    .format(acum).replace(/-/g, "");
}

// ─── Tipurile raspunsurilor ───────────────────────────────────────────────────

export type AlertaUps = { code: string; description: string };

/** O oferta de transport, dupa ce a fost curatata de invelisurile lor. */
export type OfertaUps = {
  /** `RatedShipment.Service.Code` — `11`, `07`, `65`… */
  serviceCode: string;
  serviceName: string;
  /** Suma pe care o plateste comerciantul. Vezi `preturi.ts` pentru care dintre ele. */
  pret: number;
  /** ⚠ Poate fi EUR sau USD: UPS nu are camp prin care sa ceri valuta. */
  valuta: string;
  /** Tariful vine din contract (`NegotiatedRateCharges`) sau e pretul de lista? */
  negociat: boolean;
  /** Totalul CU taxe, cand s-a cerut `TaxInformationIndicator` si UPS l-a dat. */
  cuTva: number | null;
  /** Suma taxelor raportate, cand exista. */
  tva: number | null;
  /** Zile lucratoare de tranzit, cand UPS le da. */
  tranzit: string | null;
  /** Data estimata de livrare (`YYYYMMDD`), cand exista. */
  livrareEstimata: string | null;
  /** Avertismentele PE OFERTA (`RatedShipmentAlert[]`). Se arata, nu se ascund. */
  alerte: AlertaUps[];
};

export type RaspunsExpediere = {
  /** `ShipmentIdentificationNumber`. Cel pe care se face si anularea. */
  awb: string;
  /** Numerele de urmarire pe colet. La un singur colet, egal cu cel de expediere. */
  awbColete: string[];
  /** Eticheta, base64, exact cum vine de la ei. */
  eticheta: string | null;
  /** Formatul REAL al etichetei intoarse — nu cel cerut. Vezi `ImageFormat.Code`. */
  formatEticheta: string | null;
  /** ⚠ Caseta de semnatura Varsovia. Se intoarce la expedierile din afara SUA, deci si la noi. */
  semnatura: string | null;
  /**
   * ⚠ „COD Turn In Page" — a treia hartie, si numai la comenzile cu ramburs.
   *
   * E documentul pe care soferul il ia odata cu banii, si vine tot in base64, dar in
   * HTML: enumerarea lor are o singura valoare, „Only HTML format is supported for COD
   * Turn In Page." Nu tine locul etichetei si nu se tipareste pe aceeasi hartie.
   *
   * ⚠ Documentatia NU spune cand se intoarce (descrierea containerului e „The container
   * of the COD Turn In Page." si atat), iar la REIMPRIMARE dispare tacut daca ceri
   * versiunea implicita `v1`: „v1 … **No support for CODTurn-inPage**". De aia se
   * pastreaza la emitere, langa eticheta.
   */
  documentRamburs: string | null;
  /** Costul, cand raspunsul de emitere il aduce. */
  cost: number | null;
  valuta: string | null;
  /** Tariful facturat vine din contract? */
  negociat: boolean;
  alerte: AlertaUps[];
};

export type UrmarireUps = {
  awb: string;
  /** `currentStatus.type` — D, I, M, MV, U, X. SINGURA enumerare publicata. */
  tip: string | null;
  /** `currentStatus.code` — SET DESCHIS. Vezi `statusuri.ts`. */
  cod: string | null;
  descriere: string | null;
  /** `deliveryDate[type=DEL]`, cand exista. Dovada tare a livrarii. */
  livratLa: string | null;
  /** `deliveryInformation` e prezent? „Populated only when the package is delivered." */
  areDovadaLivrarii: boolean;
  /** Avertismentele PE EXPEDIERE, dintr-un raspuns 200. */
  avertismente: AlertaUps[];
};

// ─── Citirea raspunsurilor lor ────────────────────────────────────────────────

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

export function numarSauNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Un camp care poate veni si ca obiect, si ca tablou.
 *
 * ⚠ Pe versiunile fixate de noi (`v2409`, Locator `v3`) UPS garanteaza tablou. Dar
 * reimprimarea de eticheta a ramas pe `v1`, unde garantia NU exista, iar exemplele
 * lor trimit `Package` si `ShipmentCharge` ca obiecte simple chiar si acolo unde
 * schema zice tablou. Un singur ajutor, folosit peste tot, si problema dispare.
 */
export function asTablou<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === null || v === undefined) return [];
  return [v as T];
}

/**
 * Traducerea codurilor pe care le RECUNOASTEM.
 *
 * ⚠ Nu e o lista completa — ghidul lor publica 927 de coduri distincte. Sunt aici
 * doar cele pe care un comerciant roman le poate chiar intalni si repara singur.
 * Restul trec mai departe cu codul si mesajul lor, in engleza: un mesaj strain e
 * mai bun decat unul romanesc inventat gresit.
 */
const CODURI: Record<string, string> = {
  // Autentificare si acces
  "UJ0001": "UPS a respins tokenul. Verifica Client ID si Client Secret din portalul UPS si mediul ales (test sau productie).",
  "250002": "UPS a respins credentialele. Verifica Client ID si Client Secret din aplicatia ta din portalul UPS.",
  "251004": "Tokenul UPS expirase. Reincearca — daca se repeta, reconecteaza integrarea.",
  "250003": "Licenta de acces UPS e invalida.",
  "10007": "UPS n-a acceptat tipul de continut al cererii.",
  // Cont si expeditor
  "120120": "Tara contului UPS nu se potriveste cu tara adresei de expeditie.",
  "120412": "Numarul de cont UPS pus ca metoda de plata lipseste sau e invalid.",
  "120415": "Contul care plateste transportul trebuie sa fie chiar contul expeditorului.",
  "128320": "Contul UPS nu e indreptatit la tarife negociate — pretul intors e cel de lista.",
  "120900": "Combinatia de utilizator si numar de cont nu e indreptatita la tarife negociate.",
  "126098": "Contul UPS trebuie autentificat in portalul lor ca sa primesti tarife negociate.",
  // Adresa
  "120105": "Lipseste sau e gresit orasul expeditorului.",
  "120107": "Lipseste sau e gresit codul postal al expeditorului.",
  "120108": "Lipseste sau e gresita tara expeditorului.",
  "120205": "Lipseste sau e gresit orasul destinatarului.",
  "120207": "Lipseste sau e gresit codul postal al destinatarului.",
  "120208": "Lipseste sau e gresita tara destinatarului.",
  "120305": "Lipseste sau e gresit orasul adresei de plecare.",
  "120307": "Lipseste sau e gresit codul postal al adresei de plecare.",
  "120308": "Lipseste sau e gresita tara adresei de plecare.",
  "123020": "Codul postal de plecare nu e recunoscut de UPS.",
  "123021": "Codul postal al destinatarului nu e recunoscut de UPS.",
  // Serviciu
  "120500": "Lipseste sau e gresit codul serviciului UPS.",
  "120124": "UPS nu ofera serviciul cerut intre cele doua adrese.",
  "121063": "Optiunea ceruta nu merge cu serviciul ales.",
  // Colet
  "120600": "Lipseste tipul de ambalaj al coletului.",
  "120601": "Lipseste sau e gresita greutatea coletului.",
  "120602": "Combinatia de lungime, latime si inaltime nu e valida.",
  "120608": "Greutatea coletului e obligatorie.",
  "120609": "Toate cele trei dimensiuni sunt obligatorii si fiecare trebuie sa fie mai mare ca zero.",
  "120605": "Dimensiunile nu se potrivesc cu tipul de ambalaj ales.",
  "120621": "Valoarea declarata depaseste plafonul UPS pentru coletul asta.",
  "120624": "Pentru miscarea asta UPS accepta un singur colet.",
  // Ramburs
  "120626": "Codul de ramburs (CODFundsCode) e invalid. In Uniunea Europeana UPS accepta doar 1 (numerar) si 9 (cec).",
  "120610": "Suma rambursului nu e valida.",
  "120597": "Valuta rambursului trebuie sa fie cea a tarii de destinatie — pentru Romania, RON.",
  "120568": "Rambursul la punct UPS Access Point nu e disponibil cu serviciul ales.",
  "120569": "Rambursul pe colet nu e valid pentru originea sau destinatia asta. La noi rambursul se pune pe EXPEDIERE.",
  // Puncte UPS Access Point
  "120556": "Lipseste sau e gresita suma rambursului la punctul UPS Access Point.",
  "120557": "Lipseste sau e gresita valuta rambursului la punctul UPS Access Point.",
  "120560": "Livrarea in punct UPS cere si o instiintare cu adresa de email sau telefonul cumparatorului.",
  "120576": "Serviciul UPS Access Point Economy cere livrare cu ridicare din punct.",
  "120578": "Codul de ridicare trebuie sa aiba intre 4 si 6 cifre.",
  "120585": "Contul UPS nu e autorizat pentru serviciul UPS Access Point Economy.",
  "120586": "Contul UPS nu e autorizat pentru serviciul UPS Access Point Economy.",
  // Referinta
  "120501": "Valoarea referintei de expediere nu e valida.",
  "120506": "Codul referintei de expediere nu e valid.",
  // Anulare
  "190101": "A trecut termenul in care UPS mai accepta anularea expedierii.",
  "190102": "UPS nu gaseste nicio expediere anulabila cu numarul asta — cel mai des inseamna ca a trecut termenul lor de anulare.",
  "190100": "Numarul de expediere UPS e invalid.",
  "190109": "Numarul de urmarire e invalid.",
  "190117": "Expedierea era deja anulata la UPS.",
  "190121": "UPS n-a anulat niciunul dintre coletele trimise.",
  // Reimprimare
  "9800020": "UPS nu mai are eticheta: a expirat la ei. Foloseste copia pastrata de noi.",
  "9801028": "UPS nu mai da eticheta: coletul a plecat deja spre destinatie.",
  "9801040": "Expedierea pentru care ceri eticheta a fost anulata.",
  "9801041": "UPS n-a prelucrat inca expedierea, deci nu poate da eticheta.",
  "9801042": "UPS n-a prelucrat inca expedierea, deci nu poate da eticheta.",
  "9801030": "Reimprimarea cere fie numarul de urmarire, fie referinta impreuna cu numarul de cont.",
  "9801031": "UPS nu gaseste expedierea dupa numarul sau referinta trimisa.",
  // Generice
  "10004": "UPS a raspuns cu o eroare interna. Reincearca peste cateva minute.",
  "20001": "UPS a raspuns cu o eroare generala de prelucrare.",
};

/**
 * Codurile pe care UPS le declara `Transient`.
 *
 * ⚠ Verbatim din documentatia lor: „Transient error - Indicates an error that is
 * temporary in nature. … The request may be issued successfully at a later time."
 * Adica exact `necunoscut` din registru: cererea POATE sa fi ajuns.
 *
 * Lista e scurta dinadins — sunt singurele marcate asa in cele 927 de randuri ale
 * ghidului lor plus in tabelul comun din `UPSTrackAlert.yaml`. Orice alt cod e
 * `Hard`, adica refuz DOVEDIT.
 */
const COD_TRANZITORIU = new Set([
  "10004", "20001", "250050",
  "VSS100",
  "9800000", "9800001", "9801027",
  "190001", "190002",
  "110001",
]);

/** Codurile care inseamna „tokenul a expirat", nu „credentiale gresite". */
const COD_TOKEN_EXPIRAT = new Set(["251004"]);

/** Codurile de credentiale, care NU trebuie sa treaca drept eroare de date. */
const COD_AUTORIZARE = new Set(["UJ0001", "250002", "250003", "250004", "250005"]);

type EroareUps = { code: string; message: string };

/**
 * Erorile din corp.
 *
 * ⚠ MINUSCULE, si imbricate sub `response`. Corpul de succes al aceluiasi API e
 * `PascalCase` (`Response`, `ShipmentResults`). Cine cauta `Errors` sau `errors` la
 * radacina nu gaseste nimic si raporteaza „raspuns gol".
 */
export function erorileDin(corp: unknown): EroareUps[] {
  const raspuns = (corp as { response?: unknown } | null)?.response;
  const brute = (raspuns as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(brute)) return [];
  return brute
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .map((e) => ({ code: text(e.code), message: text(e.message) }))
    .filter((e) => e.code || e.message);
}

/** Textul pentru comerciant, din oricare dintre formele lor. */
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

  /*
   * ⚠ A doua forma: un 200 in care `ResponseStatus.Code` nu e `1`. UPS o descrie
   * verbatim „Identifies the success or failure of the transaction. 1 = Successful",
   * si nu publica nicio alta valoare — deci orice altceva e esec fara text propriu.
   */
  const stare = stareaRaspunsului(corp);
  if (stare && stare.cod !== "1") {
    return `UPS a raspuns cu starea ${stare.cod}${stare.descriere ? ` (${stare.descriere})` : ""}.`;
  }

  return brut.trim().slice(0, 300) || "raspuns gol";
}

/** Primul cod de eroare din raspuns, pentru cine decide dupa cod. */
export function primulCod(corp: unknown): string | null {
  return erorileDin(corp)[0]?.code ?? null;
}

/**
 * `Response.ResponseStatus`, oriunde ar sta invelisul.
 *
 * ⚠ Fiecare API isi pune raspunsul sub alt nume de radacina (`ShipmentResponse`,
 * `RateResponse`, `VoidShipmentResponse`, `LabelRecoveryResponse`, `LocatorResponse`).
 * Un `corp.ShipmentResponse.Response` scris pe fiecare cale ar fi insemnat cinci
 * copii ale aceleiasi verificari — si patru sanse sa fie uitata.
 */
function stareaRaspunsului(corp: unknown): { cod: string; descriere: string } | null {
  if (!corp || typeof corp !== "object") return null;
  for (const invelis of Object.values(corp as Record<string, unknown>)) {
    if (!invelis || typeof invelis !== "object") continue;
    const r = (invelis as { Response?: unknown }).Response;
    if (!r || typeof r !== "object") continue;
    /* ⚠ Locator il scrie ALTFEL: `ResponseStatusCode` la radacina lui `Response`. */
    const plat = text((r as Record<string, unknown>).ResponseStatusCode);
    if (plat) return { cod: plat, descriere: text((r as Record<string, unknown>).ResponseStatusDescription) };

    const s = (r as { ResponseStatus?: unknown }).ResponseStatus;
    if (!s || typeof s !== "object") continue;
    const cod = text((s as Record<string, unknown>).Code);
    if (cod) return { cod, descriere: text((s as Record<string, unknown>).Description) };
  }
  return null;
}

/**
 * Avertismentele dintr-un raspuns de SUCCES.
 *
 * ⚠ Nu sunt decor. Acolo spune UPS ca a MODIFICAT adresa, ca a clasificat-o
 * rezidentiala (alt tarif), ca serviciul a fost coborat sau ca tarifele negociate
 * nu s-au aplicat (`120900`, `128320`) — iar in ultimul caz pretul intors e cel de
 * lista, adica mai mare decat cel real, si nimic altceva nu o spune.
 */
export function alerteleDin(corp: unknown): AlertaUps[] {
  if (!corp || typeof corp !== "object") return [];
  const iesire: AlertaUps[] = [];
  for (const invelis of Object.values(corp as Record<string, unknown>)) {
    if (!invelis || typeof invelis !== "object") continue;
    const r = (invelis as { Response?: unknown }).Response;
    if (!r || typeof r !== "object") continue;
    for (const a of asTablou<Record<string, unknown>>((r as Record<string, unknown>).Alert)) {
      if (!a || typeof a !== "object") continue;
      const cod = text(a.Code);
      const descriere = text(a.Description);
      if (cod || descriere) iesire.push({ code: cod, description: descriere });
    }
  }
  return iesire;
}

/** Raspunsul vine din mediul lor de test? La UPS nu se vede din corp — se stie din configurare. */
export function eMediuDeTest(c: Pick<UpsConfig, "mediu">): boolean {
  return c.mediu === "test";
}

// ─── Tokenul ─────────────────────────────────────────────────────────────────

/**
 * Tokenurile vii, pe pereche (gazda, client_id).
 *
 * ⚠ CHEIA CUPRINDE SI GAZDA. Aceeasi aplicatie UPS merge pe amandoua mediile —
 * asa o foloseste chiar serverul MCP oficial al lor (`UPS-API/ups-mcp`: un singur
 * `CLIENT_ID`, iar `ENVIRONMENT` schimba doar `base_url`) — iar un token luat de pe
 * `wwwcie` si trimis la `onlinetools` da 401, adica exact un esec care arata a
 * „credentiale gresite" pe niste credentiale bune.
 *
 * ⚠ SI E ESENTIAL SA EXISTE. `/security/v1/oauth/token` are propria cota, cu un 429
 * scris altfel decat la restul API-urilor: „**Quota** Limit Exceeded", nu „Rate
 * Limit Exceeded". Iar fara token nu merge NIMIC — deci un client care ar cere unul
 * la fiecare apel ar bloca UPS pe toate magazinele deodata.
 *
 * ⚠ DURATA NU SE PRESUPUNE. Pana la 01.04.2026 `expires_in` era `"14399"` (aproape
 * patru ore); de atunci UPS l-a scurtat la o ora. Se citeste ce raspund ei, cu o
 * marja de 60 de secunde — o valoare fixa in cod ar fi imbatranit tacut.
 */
const MARJA_TOKEN_MS = 60_000;
const tokenuri = new Map<string, { token: string; expiraLa: number }>();

/**
 * Cererile de token IN ZBOR, pe aceeasi cheie.
 *
 * ⚠ Fara asta, doua cotari pornite in aceeasi milisecunda cer doua tokenuri; zece
 * cer zece. Cota de pe `/security/v1/oauth/token` e a lor si e separata, iar un 429
 * acolo opreste TOT — nu doar cotarea care a declansat ploaia.
 */
const tokenuriInZbor = new Map<string, Promise<string>>();

/** Pentru probe: goleste tokenurile pastrate. */
export function uitaTokenurile(): void {
  tokenuri.clear();
  tokenuriInZbor.clear();
}

function cheieToken(baza: string, clientId: string): string {
  return `${baza}|${clientId}`;
}

async function ceriToken(
  config: Pick<UpsConfig, "client_id" | "client_secret" | "mediu" | "account_number">,
): Promise<{ token: string; expiraLa: number }> {
  const baza = gazda(config);
  const id = (config.client_id ?? "").trim();
  const secret = (config.client_secret ?? "").trim();

  /*
   * ⚠ `Authorization: Basic`, NU corp. Schema lor: `security: - BasicAuth: []`, iar
   * descrierea spune „enter your Client ID as the Username and your Secret as the
   * Password". Corpul are UN SINGUR camp. Trimise in corp, ca la FedEx, cererea
   * primeste 400.
   */
  const acreditare = Buffer.from(`${id}:${secret}`, "utf8").toString("base64");
  const cont = (config.account_number ?? "").trim();

  let res: Response;
  try {
    res = await fetch(`${baza}${CALE_TOKEN}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${acreditare}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        /* Optional in schema, dar el e cel care leaga tokenul de cont. */
        ...(cont ? { "x-merchant-id": cont } : {}),
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
      signal: AbortSignal.timeout(ASTEPTARE_AUTH_MS),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    throw eroareNesigura(`UPS POST ${CALE_TOKEN}: ${(e as Error).message}`);
  }

  const brut = await res.text();
  let date: unknown = null;
  if (brut.trim()) { try { date = JSON.parse(brut); } catch { date = null; } }

  if (!res.ok) {
    const cod = primulCod(date);
    if (res.status === 401 || res.status === 400) {
      throw insemneaza(
        eroareRefuz(
          "UPS a respins credentialele. Verifica Client ID si Client Secret din aplicatia ta din portalul UPS "
          + "si asigura-te ca aplicatia are acces la mediul ales (test sau productie).",
        ),
        res.status, cod,
      );
    }
    /*
     * ⚠ 403 aici e „Blocked Merchant", nu „chei gresite" — asa il numeste schema
     * lor. Un comerciant care si-ar roti cheile n-ar repara nimic.
     */
    if (res.status === 403) {
      throw insemneaza(
        eroareRefuz(
          "UPS a blocat contul pentru accesul prin API („Blocked Merchant”). Cheile nu sunt de vina — "
          + "ia legatura cu reprezentantul tau UPS.",
        ),
        res.status, cod,
      );
    }
    if (res.status === 429) {
      throw insemneaza(
        eroareRefuz(
          "UPS a depasit cota de cereri de autentificare („Quota Limit Exceeded”). Nu schimba cheile — "
          + "incearca din nou peste cateva minute.",
        ),
        res.status, cod,
      );
    }
    throw insemneaza(
      eroareCuStatus(`UPS POST ${CALE_TOKEN}: ${res.status} — ${descrieEroarea(date, brut)}`, res.status),
      res.status, cod,
    );
  }

  const acces = (date as { access_token?: unknown } | null)?.access_token;
  if (typeof acces !== "string" || !acces.trim()) {
    throw eroareNesigura(`UPS POST ${CALE_TOKEN}: raspuns fara access_token — ${brut.slice(0, 200)}`);
  }

  /*
   * ⚠ `expires_in` E UN SIR in schema lor („type: string"), si asta nu e o subtilitate
   * de stil: fara `Number()`, orice aritmetica pe el ar aluneca in concatenare.
   * Implicitul de rezerva e o ora — durata lor de dupa 01.04.2026 — nu cele patru
   * ore de dinainte.
   */
  const secunde = Number(text((date as Record<string, unknown>).expires_in));
  const viata = Number.isFinite(secunde) && secunde > 0 ? secunde * 1000 : 3_600_000;
  return { token: acces, expiraLa: Date.now() + Math.max(0, viata - MARJA_TOKEN_MS) };
}

async function token(
  config: Pick<UpsConfig, "client_id" | "client_secret" | "mediu" | "account_number">,
  forteaza = false,
): Promise<string> {
  const id = (config.client_id ?? "").trim();
  const secret = (config.client_secret ?? "").trim();
  if (!id || !secret) throw eroareRefuz("Lipsesc Client ID si Client Secret din configurarea UPS.");

  const cheie = cheieToken(gazda(config), id);
  if (!forteaza) {
    const viu = tokenuri.get(cheie);
    if (viu && viu.expiraLa > Date.now()) return viu.token;
    const inZbor = tokenuriInZbor.get(cheie);
    if (inZbor) return inZbor;
  }

  const promisiune = ceriToken(config)
    .then((t) => { tokenuri.set(cheie, t); return t.token; })
    .finally(() => { tokenuriInZbor.delete(cheie); });

  tokenuriInZbor.set(cheie, promisiune);
  return promisiune;
}

// ─── Apelul ───────────────────────────────────────────────────────────────────

/**
 * Ce face cererea la ei — si de asta depinde cum se citeste un esec.
 *
 * `citire`  o cerere care NU creeaza nimic (cotare, urmarire, puncte, reimprimare).
 *           Orice esec al ei e refuz DOVEDIT: n-a ramas nimic in urma.
 * `scriere` o cerere care poate lasa ceva in urma (emitere, anulare).
 *           Un esec ambiguu iese `necunoscut` si BLOCHEAZA.
 *
 * ⚠ Nu se poate deduce din metoda HTTP: `POST /api/rating/…` si
 * `POST /api/labels/v1/recovery` sunt citiri, iar `DELETE /api/shipments/…/void/…`
 * e o scriere. De aia campul e OBLIGATORIU in semnatura — asa `tsc` enumera
 * apelantii si nimeni nu poate uita sa se gandeasca la el.
 */
type Efect = "citire" | "scriere";

/**
 * Un apel catre UPS.
 *
 * ═══ VERDICTELE ═══
 *
 *   retea cazuta / timeout          -> citire: refuz. scriere: NU STIM.
 *   HTTP 4xx (fara 408)             -> refuz dovedit.
 *   HTTP 5xx / 408 / 503            -> citire: refuz. scriere: NU STIM.
 *   HTTP 2xx + corp necitibil       -> NU STIM.
 *   HTTP 2xx + `response.errors[]`  -> dupa SEVERITATEA LOR (vezi mai jos).
 *   HTTP 2xx + ResponseStatus != 1  -> refuz dovedit.
 *
 * ⚠ AICI E DEOSEBIREA FATA DE CEILALTI PAISPREZECE: UPS isi clasifica singur
 * erorile in `Hard` si `Transient`, si spune ce inseamna fiecare. Un cod
 * `Transient` intr-un raspuns altfel bun NU e refuz dovedit — „the request may be
 * issued successfully at a later time" inseamna chiar ca s-ar putea sa fi ajuns.
 */
async function apel<T>(
  config: Pick<UpsConfig, "client_id" | "client_secret" | "mediu" | "account_number">,
  metoda: "GET" | "POST" | "DELETE",
  cale: string,
  optiuni: { efect: Efect; corp?: unknown; asteptareMs?: number; referinta?: string },
): Promise<T> {
  const baza = gazda(config) + PREFIX_API;
  const { efect, corp } = optiuni;
  const asteptareMs = optiuni.asteptareMs ?? (efect === "scriere" ? ASTEPTARE_EMITERE_MS : ASTEPTARE_MS);
  const ambiguu = (mesaj: string) => (efect === "citire" ? eroareRefuz(mesaj) : eroareNesigura(mesaj));

  /*
   * ⚠ `transId` si `transactionSrc` sunt `required: true` pe TOATE cele trei cai de
   * urmarire (si optionale in rest). Trimise mereu, nu mai exista cale pe care sa
   * fie uitate. `transId` are „Length 32", deci se taie.
   *
   * ⚠ Si nu, `transId` NU e cheie de idempotenta: descrierea lui e „An identifier
   * unique to the request", si atat. Nicaieri nu scrie ca un al doilea POST cu
   * acelasi id ar fi respins. Protectia contra duplicatelor sta in registrul de
   * operatii externe.
   */
  const idTranzactie = (optiuni.referinta ?? crypto.randomUUID()).replace(/[^0-9A-Za-z-]/g, "").slice(0, 32);

  const trimite = async (acces: string): Promise<Response> => fetch(`${baza}${cale}`, {
    method: metoda,
    headers: {
      Authorization: `Bearer ${acces}`,
      Accept: "application/json",
      transId: idTranzactie,
      transactionSrc: SURSA_TRANZACTIE,
      ...(corp !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: corp !== undefined ? JSON.stringify(corp) : undefined,
    signal: AbortSignal.timeout(asteptareMs),
    cache: "no-store",
    /* Un 3xx aici n-are ce cauta; urmat, ar putea aduce o pagina de login. */
    redirect: "manual",
  });

  let res: Response;
  let brut: string;
  let date: unknown = null;

  const citeste = async (r: Response) => {
    const t = await r.text();
    let d: unknown = null;
    if (t.trim()) { try { d = JSON.parse(t); } catch { d = null; } }
    return { t, d };
  };

  try {
    res = await trimite(await token(config));
    ({ t: brut, d: date } = await citeste(res));

    /*
     * ⚠ O SINGURA reincercare, si numai cand UPS SPUNE ca tokenul a expirat.
     *
     * `251004` („Bearer Token expired (oauth)") vine ca HTTP 401 — la fel ca
     * `UJ0001` („Invalid token or token is not present") si `250002` („Invalid
     * authentication information"). Un client care ar reincerca la orice 401 ar
     * bate cota de token cu niste chei care oricum nu merg; unul care n-ar reincerca
     * deloc ar raporta „credentiale gresite" pentru un token imbatranit cu o
     * secunda, chiar in mijlocul unei emiteri.
     *
     * Reincercarea e sigura si pentru scrieri: un 401 inseamna ca cererea NU a fost
     * autorizata, deci nu s-a creat nimic.
     */
    if (res.status === 401) {
      const cod = primulCod(date);
      if (!cod || COD_TOKEN_EXPIRAT.has(cod)) {
        res = await trimite(await token(config, true));
        ({ t: brut, d: date } = await citeste(res));
      }
    }
  } catch (e) {
    throw ambiguu(`UPS ${metoda} ${cale}: ${(e as Error).message}`);
  }

  const cod = primulCod(date);

  if (!res.ok) {
    const mesaj = `UPS ${metoda} ${cale}: ${descrieEroarea(date, brut)}`;
    if (res.status === 401 || (res.status === 403 && cod && COD_AUTORIZARE.has(cod))) {
      throw insemneaza(eroareRefuz(descrieEroarea(date, brut)), res.status, cod);
    }
    /*
     * ⚠ Severitatea LOR bate statusul HTTP, si numai intr-un sens: un cod
     * `Transient` (`10004` pe 500, `VSS100` pe 500) inseamna „poate reusi mai
     * tarziu", deci pe o scriere raspunsul cinstit e „nu stim".
     */
    const tranzitoriu = (cod && COD_TRANZITORIU.has(cod)) || res.status >= 500 || res.status === 408;
    const e = tranzitoriu ? ambiguu(mesaj) : eroareCuStatus(mesaj, res.status);
    throw insemneaza(e, res.status, cod);
  }

  /*
   * ⚠ Un 2xx cu corp necitibil NU e succes: citit ca succes, am raporta o expediere
   * care poate nu exista; citit ca refuz, am debloca reincercarea.
   */
  if (date === null) {
    throw ambiguu(`UPS ${metoda} ${cale}: raspuns necitibil (${res.status}) — ${brut.slice(0, 200)}`);
  }

  /*
   * ⚠ AL DOILEA NIVEL. Un 200 poate purta `response.errors[]`. Daca UPS il
   * marcheaza `Transient`, ramane ambiguu; altfel au citit cererea si au respins-o.
   */
  if (cod || erorileDin(date).length > 0) {
    const mesaj = descrieEroarea(date, brut);
    const e = cod && COD_TRANZITORIU.has(cod) ? ambiguu(mesaj) : eroareRefuz(mesaj);
    throw insemneaza(e, res.status, cod);
  }

  /*
   * ⚠ AL TREILEA NIVEL, si e cel pe care il rateaza toata lumea. `ResponseStatus.Code`
   * e documentat „1 = Successful" si nu are alta valoare publicata — deci orice
   * altceva e un esec ascuns intr-un 200 fara `errors[]`.
   */
  const stare = stareaRaspunsului(date);
  if (stare && stare.cod !== "1") {
    throw insemneaza(eroareRefuz(descrieEroarea(date, brut)), res.status, null);
  }

  return date as T;
}

// ─── Cotarea ─────────────────────────────────────────────────────────────────

/**
 * `POST /api/rating/{version}/{requestoption}`.
 *
 * ⚠ `Shoptimeintransit` si nu `Shop`: primul intoarce SI timpii de tranzit, iar
 * fara ei checkout-ul n-ar putea spune cumparatorului cand ii vine coletul. Costul
 * e ca raspunsul cere si `Shipment.DeliveryTimeInformation` in corp — vezi
 * `corpTarife`.
 *
 * ⚠ Iar `{requestoption}` are `maxLength: 10` in schema, in timp ce valoarea are 17
 * caractere. E un defect al schemei lor; validarea pe lungime ar respinge chiar
 * valoarea pe care o cer.
 */
export async function tarife(
  config: UpsConfig,
  corp: unknown,
  optiune: "Shop" | "Shoptimeintransit" = "Shoptimeintransit",
): Promise<{ oferte: unknown[]; alerte: AlertaUps[] }> {
  const r = await apel<Record<string, unknown>>(
    config, "POST", `/rating/${VERSIUNE_RATE}/${optiune}`, { efect: "citire", corp },
  );
  const raspuns = (r.RateResponse ?? {}) as Record<string, unknown>;
  return { oferte: asTablou(raspuns.RatedShipment), alerte: alerteleDin(r) };
}

// ─── Emiterea ────────────────────────────────────────────────────────────────

/**
 * `POST /api/shipments/{version}/ship`.
 *
 * ⚠ Se cheama DOAR din interiorul registrului de operatii externe. Cautarea
 * `idempot*` in `Shipping.yaml` da ZERO potriviri, deci o a doua trimitere creeaza
 * al doilea AWB, taxabil.
 */
export async function creeazaExpediere(
  config: UpsConfig,
  corp: unknown,
  referinta: string,
): Promise<RaspunsExpediere> {
  const r = await apel<Record<string, unknown>>(
    config, "POST", `/shipments/${VERSIUNE_SHIP}/ship`,
    { efect: "scriere", corp, referinta },
  );

  const raspuns = (r.ShipmentResponse ?? {}) as Record<string, unknown>;
  const rezultate = (raspuns.ShipmentResults ?? {}) as Record<string, unknown>;

  const colete = asTablou<Record<string, unknown>>(rezultate.PackageResults);
  const awbColete = colete.map((p) => text(p.TrackingNumber)).filter(Boolean);
  const awb = text(rezultate.ShipmentIdentificationNumber) || awbColete[0] || "";

  /*
   * ⚠ Fara AWB nu exista expediere de raportat — dar poate exista una la ei.
   *
   * Un 200 fara numar inseamna ca n-am inteles raspunsul, nu ca n-au creat nimic.
   * `eroareNesigura` tine randul blocat si scoate cazul la om, in loc sa lase
   * urmatoarea apasare sa emita al doilea AWB.
   */
  if (!awb) {
    throw eroareNesigura(
      "UPS a raspuns fara numar de expediere. Verifica in contul UPS daca expedierea s-a creat, "
      + "inainte de a incerca din nou.",
    );
  }

  const primul = (colete[0] ?? {}) as Record<string, unknown>;
  const eticheta = (primul.ShippingLabel ?? {}) as Record<string, unknown>;
  const formatEticheta = (eticheta.ImageFormat ?? {}) as Record<string, unknown>;
  const paginaRamburs = (rezultate.CODTurnInPage ?? null) as Record<string, unknown> | null;
  const imagineRamburs = (paginaRamburs?.Image ?? null) as Record<string, unknown> | null;

  /*
   * Tariful: cel NEGOCIAT bate pe cel de lista, fiindca el se factureaza.
   * ⚠ `NegotiatedRateCharges` poate LIPSI cu totul, si atunci nu e un defect —
   * verbatim: „if a particular shipment … doesn't qualify for the existing discount
   * then no negotiated rates container will be returned. Published rates will be
   * the applicable rate."
   */
  const negociate = (rezultate.NegotiatedRateCharges ?? null) as Record<string, unknown> | null;
  const totalNegociat = negociate ? (negociate.TotalCharge ?? null) as Record<string, unknown> | null : null;
  const taxe = (rezultate.ShipmentCharges ?? {}) as Record<string, unknown>;
  const totalLista = (taxe.TotalCharges ?? null) as Record<string, unknown> | null;
  const total = totalNegociat ?? totalLista;

  return {
    awb,
    awbColete: awbColete.length > 0 ? awbColete : [awb],
    eticheta: text(eticheta.GraphicImage) || null,
    /*
     * ⚠ Se citeste formatul REAL intors, nu cel cerut: „For multi piece **COD**
     * shipments, the label image format for the first package will always be a GIF
     * **for any form of label requested**." Noi trimitem un singur colet, dar regula
     * arata ca cererea nu e o garantie.
     */
    formatEticheta: text(formatEticheta.Code) || null,
    documentRamburs: imagineRamburs ? (text(imagineRamburs.GraphicImage) || null) : null,
    /*
     * ⚠ A DOUA imagine, si numai in afara Statelor Unite. „Base 64 encoded graphic
     * image of the Warsaw text and signature box … The image will be returned for
     * non-US based shipments. One image will be given per shipment and it will be
     * in the FIRST PackageResults container." Romania e non-US.
     */
    semnatura: text(eticheta.InternationalSignatureGraphicImage) || null,
    cost: total ? numarSauNull(total.MonetaryValue) : null,
    valuta: total ? (text(total.CurrencyCode) || null) : null,
    negociat: !!totalNegociat,
    alerte: alerteleDin(r),
  };
}

// ─── Anularea ────────────────────────────────────────────────────────────────

export type RezultatAnulare = { anulat: boolean; mesaj: string; eraDejaAnulat: boolean };

/**
 * `DELETE /api/shipments/{version}/void/cancel/{shipmentidentificationnumber}`.
 *
 * ⚠ FARA CORP. Schema declara un `VoidShipmentRequest`, dar el e mostenirea XML si
 * nu e legat de operatia REST — care e un DELETE cu totul in cale si in interogare.
 *
 * ⚠ „Deja anulat" NU e un esec, si UPS il face indistinguibil dinadins:
 * `PackageLevelResults.Status.Code` e documentat „**1 = Voided or Already Voided**;
 * 0 = Not Voided". Deci o reincercare e sigura, si apelantul trebuie sa poata
 * elibera slotul din registru — altfel comanda ramane blocata pe un AWB care nu mai
 * exista la ei.
 *
 * ⚠ Termenul de anulare NU se codifica aici. Ghidul lor spune 28 de zile pentru
 * expedieri normale, pagina lor de suport spune altceva, iar OpenAPI-ul tace. Se
 * lasa UPS sa raspunda `190101` / `190102` si se spune omului ce a spus el.
 */
export async function anuleaza(config: UpsConfig, awb: string): Promise<RezultatAnulare> {
  const numar = (awb ?? "").trim().toUpperCase();
  try {
    const r = await apel<Record<string, unknown>>(
      config, "DELETE",
      `/shipments/${VERSIUNE_SHIP}/void/cancel/${encodeURIComponent(numar)}`,
      { efect: "scriere" },
    );

    const raspuns = (r.VoidShipmentResponse ?? {}) as Record<string, unknown>;
    const peColet = asTablou<Record<string, unknown>>(raspuns.PackageLevelResults);

    /*
     * ⚠ Se citeste rezultatul PE COLET cand exista, si abia apoi cel de sinteza:
     * `SummaryResult.Status.Code` NU are nicio valoare documentata (cautat in toata
     * schema), pe cand cel pe colet are enumerarea de mai sus. Un cod nedocumentat
     * luat drept succes ar sterge AWB-ul de pe comanda fara sa-l fi anulat la ei.
     */
    if (peColet.length > 0) {
      const nereusite = peColet.filter((p) => {
        const s = (p.Status ?? {}) as Record<string, unknown>;
        return text(s.Code) !== "1";
      });
      if (nereusite.length > 0) {
        throw eroareRefuz("UPS n-a anulat expedierea: cel putin un colet a ramas activ.");
      }
      return { anulat: true, mesaj: "Expedierea a fost anulata la UPS.", eraDejaAnulat: false };
    }

    /*
     * Fara rezultat pe colet ne ramane doar `ResponseStatus.Code`, pe care `apel()`
     * l-a verificat deja ca fiind `1`. Mai departe nu se poate afla nimic.
     */
    return { anulat: true, mesaj: "Expedierea a fost anulata la UPS.", eraDejaAnulat: false };
  } catch (e) {
    const cod = codEroare(e);
    if (cod === "190117") {
      return { anulat: true, mesaj: "Expedierea era deja anulata la UPS.", eraDejaAnulat: true };
    }
    throw e;
  }
}

// ─── Reimprimarea ─────────────────────────────────────────────────────────────

export type EtichetaReimprimata = { continut: string; format: string };

/**
 * `POST /api/labels/{version}/recovery`.
 *
 * ⚠ E O PLASA, NU SURSA DE ADEVAR. Documentatia lor se contrazice pe fata:
 * OpenAPI-ul de azi spune „retrieve forward and return labels", iar ghidul lor
 * spune, in capitolul dedicat, „**ONLY Return Shipments support Label Recovery**".
 * Codurile lor de eroare confirma ca poate sa nu mearga: `9800020` („the label is
 * expired"), `9801028` („the package has been sent to the destination address"),
 * `9801041` („the shipment has not been processed").
 *
 * Deci eticheta se pastreaza la emitere, in `public.ups_etichete`, iar functia asta
 * exista pentru doua lucruri reale: cand copia noastra lipseste, si cand
 * comerciantul vrea un **PDF** — singurul loc din tot API-ul in care PDF-ul exista.
 *
 * ⚠ `LabelImageFormat` LIPSA nu da PDF: „Defaults to HTML format if this node does
 * not exist." Se trimite mereu.
 *
 * ⚠ Si `LabelStockSize` NU se trimite pentru GIF/PDF: „Applicable if Label Image
 * Code is ZPL, EPL and SPL. Ignored for other Label Image Code types."
 */
function corpReimprimare(
  identificator: { TrackingNumber: string } | { ReferenceValues: unknown },
  format: "GIF" | "PDF" | "ZPL" | "EPL" | "SPL",
): Record<string, unknown> {
  return {
    LabelRecoveryRequest: {
      /*
       * ⚠ FARA `SubVersion` „2409". Reimprimarea are ALT AX de versiuni: „Supported
       * values: 1701, 1707, 1903, 2603". Cea de la emitere n-are ce cauta aici, si
       * purtarea ei e nedefinita.
       *
       * ⚠ Si fara `TransactionReference.CustomerContext`: campul are `minLength: 5`,
       * iar propriul lor exemplu trimite sirul gol. Mai bine lipsa decat gresit.
       */
      LabelSpecification: {
        LabelImageFormat: { Code: format },
        /* „Applicable if Label Image Code is ZPL, EPL and SPL. Ignored for other …" */
        ...(format === "ZPL" || format === "EPL" || format === "SPL"
          ? { LabelStockSize: { Height: "6", Width: "4" } }
          : {}),
        ...(format === "GIF" ? { HTTPUserAgent: "Mozilla/4.5" } : {}),
      },
      ...identificator,
    },
  };
}

function citesteReimprimarea(r: Record<string, unknown>, formatCerut: string) {
  const raspuns = (r.LabelRecoveryResponse ?? {}) as Record<string, unknown>;
  /* ⚠ `v1` NU garanteaza tablourile — de aia `asTablou`. */
  for (const rezultat of asTablou<Record<string, unknown>>(raspuns.LabelResults)) {
    const imagine = (rezultat.LabelImage ?? {}) as Record<string, unknown>;
    const continut = text(imagine.GraphicImage);
    if (!continut) continue;
    const f = (imagine.LabelImageFormat ?? {}) as Record<string, unknown>;
    return {
      continut,
      /* ⚠ Nu se valideaza pe lungime: campul e declarat `minLength: 4, maxLength: 4`,
         iar valorile documentate (`GIF`, `PDF`) au trei caractere. */
      format: text(f.Code) || formatCerut,
      awb: text(rezultat.TrackingNumber) || text(raspuns.ShipmentIdentificationNumber) || null,
    };
  }
  return null;
}

export async function reimprimaEticheta(
  config: UpsConfig,
  awb: string,
  format: "GIF" | "PDF" | "ZPL" | "EPL" | "SPL" = "PDF",
): Promise<EtichetaReimprimata> {
  const r = await apel<Record<string, unknown>>(
    config, "POST", `/labels/${VERSIUNE_ETICHETA}/recovery`,
    { efect: "citire", corp: corpReimprimare({ TrackingNumber: (awb ?? "").trim().toUpperCase() }, format) },
  );

  const gasit = citesteReimprimarea(r, format);
  if (gasit) return { continut: gasit.continut, format: gasit.format };

  throw eroareRefuz(
    "UPS a raspuns fara eticheta. Cel mai des inseamna ca reimprimarea nu e disponibila pentru "
    + "expedierea asta — foloseste copia pastrata la emitere.",
  );
}

/**
 * „Am trimis si n-am primit raspuns — s-a creat sau nu?", PRIMA incercare.
 *
 * ⚠ DE CE NU CAUTAREA DUPA REFERINTA, CARE PARE FACUTA PENTRU ASTA.
 *
 * `GET /track/v1/reference/details/{ref}` isi cheama parametrii `fromPickUpDate` si
 * `toPickUpDate` — indexul lui e pe data RIDICARII. Iar fereastra care ne intereseaza
 * e de cateva minute dupa creare, cand coletul e inca pe masa comerciantului si nimeni
 * nu l-a scanat. **Daca o expediere creata acum doua minute se gaseste sau nu acolo NU
 * E DOCUMENTAT nicaieri** — si un „nu exista" gresit deblocheaza exact reincercarea
 * care produce al doilea AWB, taxabil.
 *
 * Reimprimarea nu are problema asta: ea cauta ETICHETA, iar eticheta exista din chiar
 * clipa in care expedierea a fost creata. Iar documentatia lor spune verbatim ca
 * merge si dupa referinta: `LabelResults.TrackingNumber` — „Returned only if
 * TrackingNumber or **Combination of Reference Number and Shipper Number** present in
 * request."
 *
 * ⚠ `ReferenceValues` are propria lui lista de obligatorii: `[ReferenceNumber,
 * ShipperNumber]`. Trimis fara numarul de cont, cade.
 *
 * Intoarce numarul de urmarire SI eticheta — deci, cand gaseste, comanda se poate
 * repara complet fara sa se mai atinga nimic la UPS.
 */
export async function cautaEtichetaDupaReferinta(
  config: UpsConfig,
  referinta: string,
  format: "GIF" | "PDF" | "ZPL" | "EPL" | "SPL" = "GIF",
): Promise<{ awb: string; eticheta: string; format: string } | null> {
  const corp = corpReimprimare({
    ReferenceValues: {
      ReferenceNumber: { Value: (referinta ?? "").trim() },
      ShipperNumber: (config.account_number ?? "").trim(),
    },
  }, format);

  let r: Record<string, unknown>;
  try {
    r = await apel<Record<string, unknown>>(
      config, "POST", `/labels/${VERSIUNE_ETICHETA}/recovery`, { efect: "citire", corp },
    );
  } catch (e) {
    /*
     * ⚠ „Nu gasesc nimic" e un raspuns bun; orice altceva NU e.
     *
     * `9801031` = „The shipment for the requested tracking number or the combination of
     * reference number plus shipper number could not be found." Doar el (si un 404)
     * inseamna „nu exista". `9800020` („the label is expired") sau `9801028` („the
     * package has been sent to the destination address") inseamna exact pe DOS: exista,
     * doar ca nu ne mai da eticheta.
     */
    const cod = codEroare(e);
    if (cod === "9801031" || statusEroare(e) === 404) return null;
    /*
     * ⚠ „A FOST ANULATA" NU intra aici, si asta a fost o regresie proprie.
     *
     * `9801040` = „The shipment for which you are trying to recover a label or Receipt
     * **has been voided**." Tratat ca „exista, deci nu emite", el bloca definitiv o
     * comanda careia comerciantul tocmai ii anulase expedierea la UPS ca sa nu plateasca
     * de doua ori — adica exact cazul in care un AWB nou E ce trebuie. Se lasa sa cada
     * pe `null`, iar urmarirea (care vede `MV`) duce mai departe la deblocare.
     */
    if (cod === "9801040") return null;
    if (cod && COD_EXISTA_DAR_FARA_ETICHETA.has(cod)) {
      throw eroareRefuz(
        "UPS spune ca expedierea EXISTA, dar nu mai poate da eticheta pentru ea. "
        + "NU emite din nou — cauta numarul de urmarire in contul UPS dupa referinta comenzii.",
      );
    }
    throw e;
  }

  const gasit = citesteReimprimarea(r, format);
  if (!gasit) return null;

  /*
   * ⚠ ETICHETA GASITA FARA NUMAR NU E „NU EXISTA" — E OPUSUL.
   *
   * `LabelResults.TrackingNumber` e documentat „Returned only if TrackingNumber or
   * Combination of Reference Number and Shipper Number present in request" — iar noi
   * chiar trimitem combinatia, deci ar trebui sa vina. Daca totusi lipseste, faptul ca
   * ei ne-au dat o ETICHETA dovedeste ca expedierea EXISTA.
   *
   * Intors ca `null`, apelantul ar fi citit asta drept „nu s-a creat nimic" si ar fi
   * deblocat emiterea — adica al doilea AWB, taxabil, peste unul care exista deja.
   */
  if (!gasit.awb) {
    throw eroareNesigura(
      "UPS a intors o eticheta pentru referinta comenzii, dar fara numar de urmarire. Expedierea EXISTA — "
      + "NU emite din nou; cauta numarul in contul UPS dupa referinta.",
    );
  }

  return { awb: gasit.awb, eticheta: gasit.continut, format: gasit.format };
}

/**
 * Codurile care spun „expedierea EXISTA, dar eticheta nu mai e disponibila".
 *
 * ⚠ `9801040` („has been voided") NU e aici: acolo expedierea a existat si NU mai
 * exista, deci comanda are nevoie de un AWB nou. Vezi nota din `cautaEtichetaDupaReferinta`.
 */
const COD_EXISTA_DAR_FARA_ETICHETA = new Set(["9800020", "9801028", "9801039", "9801041", "9801042"]);

// ─── Urmarirea ───────────────────────────────────────────────────────────────

/**
 * ⚠ UN SINGUR NUMAR PE APEL.
 *
 * Spre deosebire de FedEx (30 de numere intr-o cerere), urmarirea UPS e un `GET` cu
 * numarul in cale. Nu exista varianta de lot: `/track/v1/shipment/details/` pagineaza
 * COLETELE unei singure expedieri, nu expedieri diferite. Asta schimba economia
 * cronului — 120 de comenzi inseamna 120 de apeluri, ca la Shipo si Packeta.
 */
export const MAX_AWB_PE_CERERE = 1;

function citesteColet(colet: Record<string, unknown>, awbCerut: string): UrmarireUps {
  const stare = (colet.currentStatus ?? {}) as Record<string, unknown>;

  /*
   * ⚠ `deliveryDate` e TABLOU si e discriminat de `type`:
   * `SDD` = data programata, `RDD` = reprogramata, **`DEL` = livrat**. Luat orbeste
   * `[0]`, un `SDD` din viitor ar fi citit ca livrare petrecuta.
   */
  let livratLa: string | null = null;
  for (const d of asTablou<Record<string, unknown>>(colet.deliveryDate)) {
    if (!d || typeof d !== "object") continue;
    if (text(d.type).toUpperCase() === "DEL") { livratLa = text(d.date) || null; break; }
  }

  /*
   * „Populated only when the package is delivered." — a doua dovada, independenta.
   *
   * ⚠ SE CERE O VALOARE, nu doar containerul. Prima varianta accepta orice obiect cu
   * macar o cheie — dar un `deliveryInformation: { location: "", receivedBy: "" }` sau
   * un container care poarta doar `deliveryPhoto: { … }` ar fi trecut drept livrare
   * dovedita pe un colet aflat inca in masina (`type: "D"` acopera si „loaded on
   * delivery vehicle"). Iar de aici comanda trece pe „Livrata" SI se emite factura.
   */
  const info = (colet.deliveryInformation ?? null) as Record<string, unknown> | null;
  const areDovadaLivrarii = !!info && typeof info === "object"
    && [info.location, info.receivedBy, (info.signature as Record<string, unknown> | undefined)?.image]
      .some((v) => typeof v === "string" && v.trim().length > 0);

  return {
    awb: text(colet.trackingNumber) || awbCerut,
    tip: text(stare.type).toUpperCase() || null,
    cod: text(stare.code).toUpperCase() || null,
    /* ⚠ TEXT TRADUS dupa `locale`. Se arata, nu se compara niciodata. */
    descriere: text(stare.description) || text(stare.simplifiedTextDescription) || null,
    livratLa,
    areDovadaLivrarii,
    avertismente: [],
  };
}

function citesteRaspunsulDeUrmarire(r: Record<string, unknown>, awbCerut: string): UrmarireUps[] {
  const raspuns = (r.trackResponse ?? {}) as Record<string, unknown>;
  const iesiri: UrmarireUps[] = [];

  for (const expediere of asTablou<Record<string, unknown>>(raspuns.shipment)) {
    if (!expediere || typeof expediere !== "object") continue;

    /*
     * ⚠ AL PATRULEA NIVEL DE CITIRE: avertismente PE EXPEDIERE, intr-un 200.
     * Verbatim din regula lor generala: „With warnings - Indicates the request has
     * been processed with potentially unanticipated results."
     */
    const avertismente: AlertaUps[] = asTablou<Record<string, unknown>>(expediere.warnings)
      .filter((w) => !!w && typeof w === "object")
      .map((w) => ({ code: text(w.code), description: text(w.message) }))
      .filter((w) => w.code || w.description);

    for (const colet of asTablou<Record<string, unknown>>(expediere.package)) {
      if (!colet || typeof colet !== "object") continue;
      const citit = citesteColet(colet, awbCerut);
      /*
       * ⚠ UN REZULTAT FARA NUMAR NU INTRA IN LISTA, ca la FedEx.
       *
       * La cautarea dupa referinta nu avem un `awbCerut` cu care sa completam, iar in
       * `Tracking.yaml` niciun camp al raspunsului nu e obligatoriu — deci un `package`
       * ciot (sau un raspuns care poarta doar `warnings[]`) ar fi intrat aici cu `awb`
       * gol. Apelantul l-ar fi numarat drept „expediere gasita" fara sa aiba ce scrie pe
       * comanda, si de acolo pana la o hotarare gresita despre a doua emitere e un pas.
       * Se opreste la sursa, nu doar in stratul de actiuni.
       */
      if (!citit.awb) continue;
      iesiri.push({ ...citit, avertismente });
    }
  }
  return iesiri;
}

/**
 * `GET /api/track/v1/details/{inquiryNumber}`.
 *
 * ⚠ `404` inseamna „nu stiu de numarul asta", si nu e neaparat un defect: la ei
 * „data is rolled off after the **120 day** retention period", iar un AWB proaspat
 * poate lipsi cateva ore. De aia se intoarce lista goala, nu o eroare — apelantul
 * decide ce inseamna.
 */
export async function urmareste(config: UpsConfig, awb: string): Promise<UrmarireUps[]> {
  const numar = (awb ?? "").trim();
  if (!numar) return [];

  try {
    const r = await apel<Record<string, unknown>>(
      config, "GET",
      `/track/v1/details/${encodeURIComponent(numar)}?locale=en_US&returnSignature=false&returnMilestones=false&returnPOD=false`,
      { efect: "citire" },
    );
    return citesteRaspunsulDeUrmarire(r, numar);
  } catch (e) {
    if (statusEroare(e) === 404) return [];
    throw e;
  }
}

/**
 * `GET /api/track/v1/reference/details/{referenceNumber}` — cautarea dupa REFERINTA NOASTRA.
 *
 * ⚠ E A DOUA CALE DE RECUPERARE, NU PRIMA. Prima e `cautaEtichetaDupaReferinta` —
 * vezi antetul ei pentru de ce: parametrii de aici se cheama `fromPickUpDate` /
 * `toPickUpDate`, deci indexul e pe data RIDICARII, iar despre o expediere creata acum
 * doua minute si neridicata inca documentatia lor **nu spune nimic**.
 *
 * Ramane utila pentru comenzi mai vechi si pentru starea reala a coletului.
 *
 * ⚠ TREI capcane, toate documentate de ei:
 *
 * 1. **`fromPickUpDate` LIPSA inseamna „ultimele 14 zile"**, nu „dintotdeauna":
 *    `default: currentDate-14`. Orice expediere mai veche ar iesi „negasita" fara
 *    nicio eroare — adica exact raspunsul care deblocheaza a doua emitere.
 * 2. **`shipperNum` nu e optional in fapt.** Referintele NU sunt unice intre
 *    conturile UPS; fara numarul nostru de cont, o referinta scurta se poate potrivi
 *    cu coletul altcuiva.
 * 3. **`refNumType` are ca `default` o PROPOZITIE**, nu o valoare:
 *    `'SmallPackage. Valid values: SmallPackage, fgv'`. Trimisa asa cum e scrisa,
 *    cade. Se trimite `SmallPackage`.
 *
 * ⚠ Si raspunsul poate contine MAI MULTE expedieri: `shipment` e tablou si nimic
 * nu-l limiteaza la unul. Se intorc toate; apelantul alege.
 */
export async function cautaDupaReferinta(
  config: UpsConfig,
  referinta: string,
  deLa: Date,
  panaLa: Date,
): Promise<{ gasite: UrmarireUps[]; negasit: boolean }> {
  const cerere = new URLSearchParams({
    locale: "en_US",
    fromPickUpDate: ziuaUps(deLa),
    /* ⚠ O zi de rezerva: `ShipmentDate` poate fi in viitor (UPS accepta 7 zile). */
    toPickUpDate: ziuaUps(new Date(panaLa.getTime() + 24 * 3600 * 1000)),
    refNumType: "SmallPackage",
    shipperNum: (config.account_number ?? "").trim(),
  });

  try {
    const r = await apel<Record<string, unknown>>(
      config, "GET",
      `/track/v1/reference/details/${encodeURIComponent(referinta)}?${cerere.toString()}`,
      { efect: "citire" },
    );
    return { gasite: citesteRaspunsulDeUrmarire(r, ""), negasit: false };
  } catch (e) {
    /*
     * ⚠ `404` E RASPUNSUL BUN AICI, si e singurul care deblocheaza emiterea:
     * „Tracking number information not found". Orice alt esec inseamna „n-am putut
     * afla", iar acolo deblocarea ar duce la al doilea AWB, taxabil.
     */
    if (statusEroare(e) === 404) return { gasite: [], negasit: true };
    throw e;
  }
}

/**
 * Pagina publica de urmarire.
 *
 * Nu e un endpoint de API — e adresa pe care o deschide cumparatorul. Se compune,
 * nu se citeste din raspuns: UPS nu intoarce niciun link de urmarire (`LabelURL` din
 * raspunsul de emitere e link de ETICHETA, si numai daca s-a cerut `LabelLinksIndicator`).
 */
export function linkUrmarire(awb: string): string {
  return `https://www.ups.com/track?loc=ro_RO&tracknum=${encodeURIComponent(awb)}&requester=ST`;
}

// ─── Puncte UPS Access Point ──────────────────────────────────────────────────

export type PunctUps = {
  /** `AccessPointInformation.PublicAccessPointID` — id-ul care pleaca la emitere. */
  id: string;
  nume: string;
  adresa: string;
  oras: string;
  judet: string;
  codPostal: string;
  lat: number;
  lng: number;
  program: string;
  distantaKm: number | null;
};

/**
 * `POST /api/locations/{version}/search/availabilities/{reqOption}` cu `reqOption = 64`.
 *
 * ⚠ `64` e „Search for UPS Access Point Locations". Celelalte optiuni (1, 8, 16,
 * 24, 32, 40, 48, 56) intorc birouri UPS, servicii aditionale sau tipuri de program —
 * nu punctele in care isi ridica un cumparator coletul.
 *
 * ⚠ ADRESA ARE ALTA GRAMATICA DECAT IN RESTUL API-ULUI, si e mostenire XML:
 * `PoliticalDivision2` = ORASUL, `PoliticalDivision1` = judetul,
 * `PostcodePrimaryLow` = codul postal. In Rating si Shipping aceleasi lucruri se
 * numesc `City`, `StateProvinceCode`, `PostalCode`. Doua forme de adresa in acelasi
 * flux — chiar clasa de defecte care a lovit deja proiectul.
 *
 * ⚠ `UnitOfMeasurement` e documentat obligatoriu numai pentru `reqOption 1`, iar
 * `SearchRadius` isi declara implicitul in MILE. Netrimisa, raza „100" ar fi 160 km.
 * Se trimite mereu `KM`.
 */
export async function puncte(
  config: UpsConfig,
  cautare: { oras: string; judet?: string; codPostal?: string; tara?: string; razaKm?: number; maxim?: number },
): Promise<PunctUps[]> {
  const tara = (cautare.tara || "RO").toUpperCase().slice(0, 2);

  /*
   * ⚠ ORASUL SE NORMALIZEAZA AICI, IN SINGURUL LOC PRIN CARE TREC AMANDOUA CAILE.
   *
   * Din 15.08.2026 checkout-ul cere „Sector 1"…„Sector 6" in Bucuresti, iar comanda
   * pastreaza forma aia — deci si cautarea din checkout, si butonul „Cauta puncte" din
   * pagina comenzii ar fi trimis-o mai departe. UPS nu stie ce e un sector: cautat
   * `sector` in toate cele cincisprezece fisiere OpenAPI ale lor, ZERO potriviri. Adica
   * in cel mai mare oras al tarii n-ar fi gasit niciodata niciun punct.
   *
   * Normalizarea sta AICI, nu la apelanti, tocmai fiindca apelantii sunt doi si al
   * treilea se va uita.
   */
  const oras = tara === "RO"
    ? normalizeLocalityName(cautare.oras ?? "", cautare.judet ?? undefined)
    : stripDiacritics(cautare.oras ?? "").trim();
  const judet = stripDiacritics(cautare.judet ?? "").trim();

  const corp = {
    LocatorRequest: {
      Request: { RequestAction: "Locator" },
      OriginAddress: {
        AddressKeyFormat: {
          /* ⚠ Judetul si strada sunt in `required` la ei, dar continutul lor nu se
             valideaza; orasul si tara sunt cele care chiar cauta. */
          AddressLine: oras,
          PoliticalDivision2: oras,
          PoliticalDivision1: judet,
          PostcodePrimaryLow: cautare.codPostal ?? "",
          CountryCode: tara,
        },
      },
      Translate: { Locale: "en_US" },
      UnitOfMeasurement: { Code: "KM" },
      LocationSearchCriteria: {
        /* „ranges from 1 to 50 with a default value of 5" — implicitul lor e prea mic. */
        MaximumListSize: String(Math.min(50, Math.max(1, cautare.maxim ?? 50))),
        /* „5-150 for UnitOfMesaure KM". */
        SearchRadius: String(Math.min(150, Math.max(5, Math.round(cautare.razaKm ?? 25)))),
        AccessPointSearch: {
          /* „01-Active-available" — un punct suspendat sau inchis n-are ce cauta in checkout. */
          AccessPointStatus: "01",
        },
      },
    },
  };

  const r = await apel<Record<string, unknown>>(
    config, "POST",
    `/locations/${VERSIUNE_LOCATOR}/search/availabilities/64`,
    { efect: "citire", corp },
  );

  const raspuns = (r.LocatorResponse ?? {}) as Record<string, unknown>;
  const rezultate = (raspuns.SearchResults ?? {}) as Record<string, unknown>;

  const iesire: PunctUps[] = [];
  const vazute = new Set<string>();

  for (const loc of asTablou<Record<string, unknown>>(rezultate.DropLocation)) {
    if (!loc || typeof loc !== "object") continue;

    const info = (loc.AccessPointInformation ?? {}) as Record<string, unknown>;
    /*
     * ⚠ `PublicAccessPointID`, NU `LocationID`. Documentatia lor spune verbatim
     * despre al doilea: „**Do not expose the Location ID**". Iar la emitere
     * `AlternateDeliveryAddress.UPSAccessPointID` e chiar cel public.
     */
    const id = text(info.PublicAccessPointID);
    if (!id || vazute.has(id)) continue;

    const adr = (loc.AddressKeyFormat ?? {}) as Record<string, unknown>;
    const linii = asTablou<string>(adr.AddressLine).map((x) => text(x)).filter(Boolean);
    const geo = (loc.Geocode ?? {}) as Record<string, unknown>;

    const distanta = (loc.Distance ?? {}) as Record<string, unknown>;

    vazute.add(id);
    iesire.push({
      id,
      nume: text(adr.ConsigneeName) || linii[0] || `Punct UPS ${id}`,
      adresa: linii.join(", "),
      oras: text(adr.PoliticalDivision2),
      judet: text(adr.PoliticalDivision1),
      codPostal: text(adr.PostcodePrimaryLow),
      lat: numarSauNull(geo.Latitude) ?? 0,
      lng: numarSauNull(geo.Longitude) ?? 0,
      /* Sir simplu la ei („The standard hours of operation … will be returned when available"). */
      program: text(loc.StandardHoursOfOperation),
      distantaKm: numarSauNull(distanta.Value),
    });
  }

  return iesire;
}

// ─── Proba de conexiune ───────────────────────────────────────────────────────

export type ProbaUps = {
  mediu: MediuUps;
  cotare: {
    ok: boolean;
    mesaj: string;
    /** Codurile de serviciu pe care le-a intors contul. */
    servicii: { cod: string; nume: string }[];
    valuta: string | null;
    /** Contul a primit tarife de CONTRACT, sau doar preturi de lista? */
    negociat: boolean;
    alerte: string[];
  };
  /**
   * ⚠ RAMBURSUL SE PROBEAZA SEPARAT, si asta e partea care merita drumul.
   *
   * Rambursul UPS cere un cont „Daily Pickup" sau „Drop Shipping". Nu exista niciun
   * camp prin care sa afli ce tip de cont ai — dar o cotare CU ramburs raspunde
   * altfel decat una fara. Se afla o data, la conectare, in loc sa fie descoperit
   * de comerciant dupa ce toate comenzile cu plata la livrare au primit tacut
   * tariful fix.
   */
  ramburs: { ok: boolean; mesaj: string };
};

/**
 * Proba de conexiune.
 *
 * ⚠ NU se opreste la „am luat un token".
 *
 * Un token se ia cu orice pereche de chei valide, chiar daca aplicatia din portalul
 * UPS n-are acces la Rating si chiar daca numarul de cont e al altcuiva. O proba
 * care s-ar opri acolo ar raspunde „conexiune reusita" unui comerciant a carui
 * integrare nu poate cota nimic — exact defectul fGO din 2026-08-15, unde „Testeaza
 * conexiunea" chema un nomenclator PUBLIC si trecea cu credentiale inventate.
 *
 * Deci se cer DOUA cotari reale, de la expeditorul lui catre el insusi: una simpla
 * si una cu ramburs. Nu creeaza nimic si nu costa nimic.
 */
export async function probaConexiune(
  config: UpsConfig,
  construiesteCerere: (cuRamburs: boolean) => unknown,
): Promise<ProbaUps> {
  const mediu: MediuUps = config.mediu === "test" ? "test" : "productie";

  let cotare: ProbaUps["cotare"];
  try {
    const { oferte, alerte } = await tarife(config, construiesteCerere(false), "Shop");

    const servicii: { cod: string; nume: string }[] = [];
    const valute = new Set<string>();
    let negociat = false;

    for (const brut of oferte) {
      if (!brut || typeof brut !== "object") continue;
      const o = brut as Record<string, unknown>;
      const s = (o.Service ?? {}) as Record<string, unknown>;
      const cod = text(s.Code);
      if (cod && !servicii.some((x) => x.cod === cod)) {
        servicii.push({ cod, nume: text(s.Description) });
      }
      const negociate = (o.NegotiatedRateCharges ?? null) as Record<string, unknown> | null;
      const total = (negociate?.TotalCharge ?? o.TotalCharges ?? null) as Record<string, unknown> | null;
      if (negociate?.TotalCharge) negociat = true;
      const v = total ? text(total.CurrencyCode) : "";
      if (v) valute.add(v.toUpperCase());
    }

    cotare = {
      ok: servicii.length > 0,
      mesaj: servicii.length > 0
        ? `UPS a raspuns cu ${servicii.length} ${servicii.length === 1 ? "serviciu" : "servicii"}.`
        : "UPS a raspuns, dar n-a intors niciun serviciu pentru adresa de expeditie configurata. Verifica orasul si codul postal.",
      servicii,
      valuta: valute.size > 0 ? [...valute].join(", ") : null,
      negociat,
      alerte: [...new Set(alerte.map((a) => a.description || a.code).filter(Boolean))],
    };
  } catch (e) {
    return {
      mediu,
      cotare: { ok: false, mesaj: (e as Error).message, servicii: [], valuta: null, negociat: false, alerte: [] },
      ramburs: { ok: false, mesaj: "Nu s-a putut proba rambursul: nici cotarea simpla n-a mers." },
    };
  }

  let ramburs: ProbaUps["ramburs"];
  try {
    const { oferte } = await tarife(config, construiesteCerere(true), "Shop");
    ramburs = oferte.length > 0
      ? { ok: true, mesaj: "Contul UPS accepta ramburs (plata la livrare)." }
      : {
        ok: false,
        mesaj:
          "UPS n-a intors niciun serviciu pentru o comanda cu ramburs. Rambursul lor cere un cont de tip "
          + "„Daily Pickup” sau „Drop Shipping” — intreaba reprezentantul UPS ce tip de cont ai.",
      };
  } catch (e) {
    ramburs = {
      ok: false,
      mesaj:
        `UPS a refuzat cotarea cu ramburs: ${(e as Error).message} `
        + "Rambursul lor cere un cont de tip „Daily Pickup” sau „Drop Shipping”.",
    };
  }

  return { mediu, cotare, ramburs };
}
