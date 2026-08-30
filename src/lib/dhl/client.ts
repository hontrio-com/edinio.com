import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import { COD_RAMBURS, numeProdus, numeServiciu } from "./servicii";

/**
 * Clientul DHL Express (MyDHL API 3.3.1).
 *
 * ═══ CE E ═══
 *
 * Al SAISPREZECELEA transportator, si al treilea global dupa FedEx si UPS.
 *
 * Spre deosebire de UPS (unde apendicele cu codurile nu e publicat nicaieri) si de
 * FedEx (unde schemele stau ascunse in atribute HTML), DHL publica trei surse care se
 * verifica una pe alta, toate fara autentificare: OpenAPI 3.0 oficial (`info.version:
 * 3.3.1`, `x-release-date: 2026-06-28`, 1,2 MB), nomenclatoarele
 * (`ExpressReferenceData_3.3.1.zip`, 19 foi, intre care `returnStatusMessage` cu 1830
 * de coduri de eroare SI severitatea lor) si „MyDHL API — SOAP Developer Guide v2.37"
 * (473 de pagini), singurul document in proza care descrie SEMANTICA campurilor.
 *
 * ⚠ Ghidul SOAP spune el insusi, la pagina 18: „visit developer.dhl.com/express for
 * the REST documentation and **discard this document including the endpoints**". Deci
 * endpointurile si numele lui de campuri NU se folosesc — dar explicatiile lui raman
 * singurele care exista.
 *
 * ═══ ⚠ CE E MAI SIMPLU DECAT LA UPS ═══
 *
 * **AUTENTIFICAREA E CEL MAI IEFTIN STRAT DIN TOATE CELE SAISPREZECE INTEGRARI.**
 * `Authorization: Basic base64(utilizator:parola)`, trimis PREEMPTIV. Fara OAuth, fara
 * token, fara expirare, fara cota separata de autentificare, fara reincercare pe 401 —
 * deci si fara cache de token si fara single-flight, care la UPS erau obligatorii.
 * Verbatim din portalul lor: „Please ensure that the Authorization header as part of
 * the request is set as **pre-emptively** and following the BasicAuth standards."
 *
 * ⚠ „pre-emptively" nu e o figura de stil: sonda lor de 401 NU intoarce niciun antet
 * `WWW-Authenticate`, deci un client care asteapta provocarea nu se autentifica
 * niciodata.
 *
 * ═══ ⚠⚠ CE E MAI PERICULOS DECAT LA TOTI CEILALTI CINCISPREZECE ═══
 *
 * **1. PRODUCTIA E PREFIXUL TESTULUI.**
 *   test      `https://express.api.dhl.com/mydhlapi/test`
 *   productie `https://express.api.dhl.com/mydhlapi`
 * La FedEx si UPS gazdele erau host-uri complet diferite (`apis-sandbox.fedex.com` fata
 * de `apis.fedex.com`). Aici lipseste UN SEGMENT DE CALE. Configurat gresit nu primesti
 * 404 — CREEZI O EXPEDIERE REALA, FACTURABILA, care NU SE POATE ANULA. De aia `gazda()`
 * are o garda explicita in amandoua sensurile.
 *
 * **2. NU EXISTA ANULARE DE EXPEDIERE.** `delete:` apare O SINGURA data in toata
 * specificatia lor, pe `/pickups/{dispatchConfirmationNumber}`. `DeleteShipment` e
 * enumerat de ei in lista de servicii a lui `/reference-data` dar nu are endpoint — a
 * ramas pe SOAP. Se anuleaza RIDICAREA, nu AWB-ul. DHL e al doilea curier fara anulare,
 * dupa Packeta.
 *
 * **3. NU EXISTA IDEMPOTENTA.** „idempot" = ZERO potriviri in OpenAPI (1,2 MB), in
 * ghidul SOAP (473 p.) si in ghidul de date de referinta. `Message-Reference` NU tine
 * loc: ghidul lor spune verbatim „not required to be unique between requests", iar cand
 * nu-l trimiti DHL il genereaza singur.
 *
 * ⚠⚠ Si nu e o lipsa ieftina. Conditiile lor legale, verbatim: „DHL Express may request
 * that You compensate it in the event that You do not subsequently tender a shipment for
 * the shipping orders at the expected pick-up time." Un AWB emis din greseala poate fi
 * FACTURAT, si nu se poate anula. De aceea clasificarea gresita a unui esec costa aici
 * mai mult decat la oricare dintre ceilalti cincisprezece.
 *
 * Singura cale inapoi dintr-un „nu stim": `cautaDupaReferinta()`.
 *
 * **4. NU EXISTA SEMNAL DE RETRIABILITATE.** La UPS, fiecare cod era declarat de ei
 * `Hard` sau `Transient` si clasificarea venea de-a gata. Aici: „transient" are ZERO
 * aparitii in toate cele trei surse. Toata clasificarea e a noastra, si se sprijina pe
 * statusul HTTP + prezenta AWB-ului, niciodata pe codul lor singur (vezi `998`).
 *
 * ═══ ⚠ RASPUNSUL SE CITESTE DE PATRU ORI ═══
 *
 *   a) statusul HTTP — si succesul lui `POST /shipments` e **201**, nu 200;
 *   b) corpul de eroare `{instance, detail, title, message, status, additionalDetails[]}`
 *      — dar exista SASE forme diferite de corp de eroare, vezi `erorileDin()`;
 *   c) `warnings[]` PE UN 200/201 — exista pe `/rates`, pe `/shipments` si pe `/get-image`;
 *   d) devizul: o expediere se poate crea CU SUCCES si FARA PRET (`7991`, `7995`), iar
 *      `7992` spune ca ti-au SCHIMBAT codul de judet.
 *
 * ⚠ Campul `status` din corpul de eroare e SUPRAINCARCAT: uneori e codul HTTP („400"),
 * uneori codul lor intern („998"), pe `/servicepoints` e un OBIECT, iar noua exemple
 * oficiale il scriu `code` in loc de `status`. Codul HTTP se citeste din raspunsul HTTP,
 * niciodata din corp.
 */

// ─── Gazdele ─────────────────────────────────────────────────────────────────

/**
 * ⚠⚠ PRODUCTIA E PREFIXUL TESTULUI. Citeste `gazda()` inainte de a atinge tabelul asta.
 *
 * Verbatim de pe pagina lor de referinta:
 *   „https://express.api.dhl.com/mydhlapi/test  Test environment to test your development
 *    against
 *    https://express.api.dhl.com/mydhlapi       Production environment to **create real
 *    transactions** with DHL Express"
 *
 * ⚠ Nu exista niciun camp in raspuns care sa spuna in ce mediu esti. Singura deosebire e
 * bucata de cale si perechea de credentiale — de aceea amandoua vin din ACELASI rand de
 * configurare (`dhl_config`), niciodata din doua surse independente.
 *
 * ⚠ Al treilea server declarat de ei, `https://api-mock.dhl.com/mydhlapi`, e NEFOLOSIBIL:
 * sondat pe 16.08.2026, raspunde HTTP 500 la orice cerere, inclusiv la propriile lor
 * exemple. Nu e aici dinadins.
 */
export const GAZDE = {
  test: "https://express.api.dhl.com/mydhlapi/test",
  productie: "https://express.api.dhl.com/mydhlapi",
} as const;

export type MediuDhl = keyof typeof GAZDE;

/** Citirile din calea cumparatorului: cotare, urmarire, imagini. */
export const ASTEPTARE_MS = 20_000;
/** Emiterea si anularea ridicarii: pornite de comerciant, isi permit mai mult. */
const ASTEPTARE_EMITERE_MS = 45_000;

/**
 * ⚠ ANTET OBLIGATORIU PE FIECARE OPERATIE, alaturi de `Authorization`.
 *
 * Verbatim: `name: x-version`, `in: header`, `required: true`, `default: 3.3.1`,
 * descrierea „Interface version - **do not change this field value**". Valoare gresita
 * sau antet lipsa = codul lor `9001 The x-version header value is invalid.`
 *
 * ⚠ `default: 3.3.1` e implicitul SCHEMEI, nu al serverului: un client generat care se
 * bazeaza pe el nu trimite antetul si cade cu 9001. Se trimite mereu, explicit.
 *
 * ⚠ Si „do not change this field value" se contrazice cu realitatea: valoarea a crescut
 * 2.9.0 → 3.3.1 in trei ani. Cand DHL publica 3.4.x, constanta asta si schemele citite
 * mai jos se schimba IMPREUNA.
 *
 * ⚠ Doua din cele 21 de operatii (`GET /servicepoints`, `POST /early-shipment-screening`)
 * nu-l declara. E o inconsistenta a specificatiei lor, nu o regula — se trimite peste tot.
 */
export const VERSIUNE_API = "3.3.1";

/**
 * ⚠ `GET /tracking` accepta pana la 200 de numere pe cerere.
 *
 * Verbatim: „DHL Express shipment identification number. **Supports up to 200 tracking
 * numbers.**", `maxItems: 200`. Fata de UPS (UN numar pe apel) si FedEx (30), asta
 * schimba economia cronului: 200 de comenzi = un singur apel.
 *
 * ⚠ Dar plafonul real nu e cel de aici, ci: „we allow up to **10 fetches per shipment per
 * day**. We also expect these calls to be done in an even way throughout the day." De
 * aceea cronul ruleaza la 3 ore (8 treceri/zi), nu la 2 ca la ceilalti.
 */
export const MAX_AWB_PE_CERERE = 200;

/**
 * ⚠ Identificarea noastra la DHL, si NU e decor.
 *
 * Antetele `Shipping-System-Platform-*` sunt declarate „(applicable to 3PV only)" — 3PV =
 * Third Party Vendor, adica exact ce e Edinio. Ghidul lor e mai apasat: „For Third party
 * vendors/ecommerce this is **mandatory** to provide continuous support."
 *
 * Optional pentru schema, de facto obligatoriu ca sa primesti suport de la DHL cand ceva
 * cade. `maxLength: 20` pe nume, `maxLength: 15` pe versiune.
 *
 * ⚠ Versiunea e a INTEGRARII, nu a aplicatiei, si se ridica de mana. Nu se citeste din
 * `process.env` — nimic din `src/lib/dhl/` nu are voie sa atinga mediul.
 */
const PLATFORMA = "Edinio";
const VERSIUNE_PLATFORMA = "1.0";

/**
 * ⚠ Limba raspunsurilor lor, ceruta explicit.
 *
 * `Accept-Language` are `default: eng` si formatul „{3-character language code}". Romana
 * NU e printre limbile pe care le confirma (lista lor pentru instiintari e `eng, zho,
 * chi, dan, ita`), deci nu se cere.
 *
 * Se fixeaza pe `eng` dinadins: descrierile evenimentelor de urmarire sunt TEXT TRADUS
 * dupa limba, iar noi decidem dupa `typeCode` (vezi `statusuri.ts`) si aratam traducerea
 * noastra. O limba variabila ar fi facut jurnalele necomparabile intre magazine.
 */
const LIMBA = "eng";

// ─── Statusul HTTP si codul, pastrate PE eroare ───────────────────────────────

const CHEIE_STATUS = "statusHttp" as const;
/** Codul de business al DHL, extras din textul lui `detail`. Vezi `erorileDin()`. */
const CHEIE_COD = "codDhl" as const;

export function statusEroare(e: unknown): number | null {
  const v = (e as { [CHEIE_STATUS]?: unknown } | null)?.[CHEIE_STATUS];
  return typeof v === "number" ? v : null;
}

/**
 * Codul DHL al erorii, cand exista.
 *
 * ⚠ Se decide DUPA cod, niciodata dupa mesaj: mesajele lor contin sabloane inlocuite la
 * rulare (`{0}`, `${GlobalProductCode}`, `<country specific post code format>`) si sunt
 * traduse dupa `Accept-Language`.
 *
 * ⚠ SI TOTUSI, `998` e exceptia care confirma regula si e singurul loc din integrare unde
 * se citeste si textul. Vezi `traduce()`.
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
 * Formatul etichetei cerut la emitere.
 *
 * ⚠ VESTEA BUNA, si difera de UPS: **PDF-ul EXISTA la emitere.** La UPS, `LabelImageFormat`
 * accepta doar GIF/ZPL/EPL/SPL, iar PDF-ul aparea NUMAI la reimprimare — deci un comerciant
 * fara imprimanta termica primea un GIF. Aici `outputImageProperties.encodingFormat` are
 * `default: pdf`.
 *
 * ⚠⚠ CAPCANA DE NUME: enumerarea CERERII lor e `pdf, zpl, lp2, **epl**` (minuscule, si
 * „epl" fara 2), in timp ce nomenclatorul lor de imagini scrie `PDF, ZPL, LP2, **EPL2**`.
 * Tipul de aici pastreaza forma din nomenclator (aceeasi cu cea din migratie si din
 * `dhl_etichete.format`), iar `formatCerut()` face conversia la trimitere. Trimis `EPL2`
 * ca atare, cade pe validare de schema.
 */
export type FormatEticheta = "PDF" | "ZPL" | "EPL2" | "LP2";

export type ExpeditorDhl = {
  nume: string;
  companie?: string;
  telefon: string;
  email?: string;
  /** Adresa pe linii; se imparte la trimitere in cel mult 3 linii de 45 de caractere. */
  strada: string;
  oras: string;
  judet?: string;
  cod_postal: string;
  /** Cod ISO de doua litere. Implicit `RO`. */
  tara?: string;
};

export type DhlConfig = {
  enabled: boolean;
  /**
   * Utilizatorul MyDHL API.
   *
   * ⚠ NU e criptat: pleaca drept prima jumatate a acreditarii `Authorization: Basic`,
   * deci singur nu deschide nimic, iar comerciantul trebuie sa-l poata reciti ca sa stie
   * CE CONT a legat. Acelasi rationament ca la `ups_config.client_id`,
   * `fedex_config.client_id`, `posta_config.username` si `pallex_config.username`.
   *
   * ⚠ Si e credentiala data de consultantul DHL Express, NU „API Key"/„API Secret" din
   * aplicatia de pe developer.dhl.com (acelea sunt pentru API-urile unified). Confuzia
   * asta e sursa clasica de 401 la integratori — formularul le numeste asa dinadins.
   */
  username: string;
  /**
   * Parola MyDHL API.
   *
   * ⚠ Numele campului trebuie sa ramana identic in TREI locuri: aici, in `CAMPURI_SECRETE`
   * (lib/integrari/secrete.ts) si in `privat.campuri_secrete` (migratia). Nimic nu verifica
   * potrivirea, iar o nepotrivire taie tot stratul de secrete in tacere. (Defectul
   * camelCase/snake_case de la Packeta, 15.08.2026.)
   */
  password: string;
  /**
   * Numarul de cont DHL Express.
   *
   * ⚠ `maxLength: 12` in schema lor, si pleaca in `accounts[]` cu `typeCode: shipper`.
   * Nu e credentiala: se tipareste pe fiecare factura DHL.
   *
   * ⚠ SI E OBLIGATORIU IN MAI MULTE LOCURI DECAT PARE. La cotare, fara el primesti
   * tarifele PUBLICATE, nu pe ale tale — adica pret GRESIT, nu eroare. La cautarea dupa
   * referinta si la dovada livrarii e obligatoriu prin descriere („Either one of shipper
   * or payer account number must be provided") desi schema il declara `required: false`.
   */
  account_number: string;
  /** `test` sau `productie`. ⚠ Vezi `GAZDE` si `gazda()` — implicitul e PRODUCTIA. */
  mediu?: MediuDhl;
  expeditor?: ExpeditorDhl;
  /**
   * Produsele pe care comerciantul le lasa sa apara in checkout, dupa codurile DHL.
   * Gol = toate cele pe care le intoarce cotarea.
   */
  produse_permise?: string[];
  format_eticheta?: FormatEticheta;
  sablon_eticheta?: string;
  /** Dimensiunile implicite ale coletului, in CENTIMETRI. */
  lungime_cm?: number;
  latime_cm?: number;
  inaltime_cm?: number;
  /**
   * Textul de pe documentele vamale cand comanda n-are altul.
   *
   * ⚠ Minimum TREI caractere reale, desi schema zice `minLength: 1`. Codul lor:
   * `7143 Shipment description must contain at least 3 characters.`
   */
  continut_implicit?: string;
  /** Declara valoarea comenzii la transport. Poate costa; stins din oficiu. */
  valoare_declarata?: boolean;
  /**
   * Cere asigurarea expedierii (`serviceCode: II`).
   *
   * Din catalogul lor romanesc: „Shipment Insurance … 55.00 LEI or 1% of insured value,
   * if higher". Costa la fiecare colet, deci stins din oficiu.
   */
  asigurare_activa?: boolean;
  /** Vezi `INCOTERMURI`. Implicit `DAP`. */
  incoterm?: string;
  /**
   * Cere si ridicarea de la curier odata cu emiterea (`pickup.isRequested`).
   *
   * ⚠ `default: false` la ei. Fara ea, DHL primeste manifestul si tipareste eticheta, dar
   * NU trimite nimeni dupa colet — iar documentatia lor **nu spune nicaieri** cum ajunge
   * atunci coletul la ei. Se poate cere si separat, mai tarziu, prin `POST /pickups`.
   */
  cere_ridicare?: boolean;
  /**
   * Trimite instiintare pe email destinatarului (`shipmentNotification[]`).
   *
   * ⚠ Limbile pe care ei le accepta pentru instiintare sunt `eng, zho, chi, dan, ita`.
   * Romana NU e pe lista, deci cumparatorul roman primeste un email in engleza. De aia e
   * o optiune, nu un implicit.
   */
  notifica_destinatarul?: boolean;
};

/**
 * Aceeasi regula de „configurat" peste tot: panou, checkout, comanda, cron, lot.
 *
 * ⚠ Expeditorul intra in ea, nu doar credentialele. Fara oras + cod postal de plecare,
 * cotarea nu poate fi nici macar formata — iar in checkout asta inseamna ca toti
 * cumparatorii vad tariful fix in loc de cel real, fara niciun semn ca lipseste ceva.
 * Aceeasi lectie ca la `fedexGata`, `upsGata` si `shipoGata`.
 */
export function dhlGata(c: DhlConfig | null | undefined): c is DhlConfig {
  return !!(
    c?.enabled
    && (c.username ?? "").trim()
    && (c.password ?? "").trim()
    && (c.account_number ?? "").trim()
    && (c.expeditor?.oras ?? "").trim()
    && (c.expeditor?.cod_postal ?? "").trim()
  );
}

/**
 * Gazda pentru configurarea data — si GARDA care sta intre „test" si o factura reala.
 *
 * ⚠⚠ DE CE EXISTA GARDA, cand tabelul de deasupra e o constanta:
 *
 * Fiindca productia e PREFIXUL testului. Orice viitoare modificare a lui `GAZDE` care
 * pierde bucata `/test` — o refactorizare, un „hai sa scoatem duplicarea", o litera
 * stearsa — nu produce un 404 si nu produce nicio eroare. Produce EXPEDIERI REALE,
 * FACTURABILE, care nu se pot anula, pe magazine care credeau ca fac probe.
 *
 * La FedEx si UPS gazdele erau host-uri complet diferite si greseala asta nu se putea
 * face. Aici se poate, si costa. Garda e ieftina si taie clasa intreaga.
 *
 * ⚠ Verifica in AMANDOUA sensurile: si „testul nu duce in test", si „productia duce in
 * test" — al doilea ar face ca fiecare AWB emis de un magazin viu sa fie o simulare pe
 * care n-o ridica nimeni.
 */
export function gazda(c: Pick<DhlConfig, "mediu">): string {
  const eTest = c.mediu === "test";
  /* Implicitul e PRODUCTIA: un cont real nu trebuie sa nimereasca in mediul de test, unde
     AWB-urile nu sunt urmaribile si nu intra in reteaua DHL. */
  const baza = GAZDE[eTest ? "test" : "productie"];

  if (eTest && !baza.endsWith("/mydhlapi/test")) {
    throw eroareRefuz(
      "Configurare DHL gresita: mediul e „test” dar adresa nu se termina cu „/mydhlapi/test”. "
      + "Nu trimit nimic — o adresa gresita aici creeaza expedieri REALE, facturabile, care nu se pot anula.",
    );
  }
  if (!eTest && baza.endsWith("/test")) {
    throw eroareRefuz(
      "Configurare DHL gresita: mediul e „productie” dar adresa duce in mediul de test. "
      + "Expedierile emise acolo nu intra in reteaua DHL si nu le ridica nimeni.",
    );
  }
  return baza;
}

/**
 * Raspunsul vine din mediul lor de test?
 *
 * ⚠ NU se vede din corp — nu exista niciun camp in niciun raspuns care sa spuna in ce
 * mediu esti. Se stie doar din configurare, si de aceea interfata trebuie s-o arate.
 *
 * ⚠ Si mediul de test nu e o oglinda: „when testing the Tracking service, **only the
 * waybill numbers below are loaded** and any production waybill numbers **or ones created
 * via shipment will not be trackable**". Adica un AWB creat de tine in test NU se poate
 * urmari in test — deci nici calea de recuperare din „nu stim" (`cautaDupaReferinta`) nu
 * se poate proba acolo. Ea se valideaza o singura data, controlat, in productie.
 */
export function eMediuDeTest(c: Pick<DhlConfig, "mediu">): boolean {
  return c.mediu === "test";
}

// ─── Nomenclatoare de configurare ────────────────────────────────────────────

/**
 * Formatul implicit al etichetei.
 *
 * PDF: singurul care se tipareste pe o imprimanta obisnuita, si e chiar implicitul lor
 * (`encodingFormat.default: pdf`). Comerciantul cu imprimanta termica alege ZPL/LP2/EPL2.
 */
export const FORMAT_IMPLICIT: FormatEticheta = "PDF";

/**
 * ⚠ Conversia catre enumerarea CERERII lor, si de ce nu se poate sari peste ea.
 *
 * `outputImageProperties.encodingFormat` are enum `pdf, zpl, lp2, **epl**` — minuscule, si
 * „epl" FARA 2 — in timp ce descrierea nomenclatorului lor de imagini, in acelasi fisier,
 * scrie `imageFormat|PDF,ZPL,LP2,**EPL2**`. Doua ortografii pentru acelasi format, la
 * cateva mii de linii distanta.
 *
 * Noi pastram peste tot forma din nomenclator (`EPL2`), fiindca aia e si forma pe care o
 * INTORC ei in `documents[].imageFormat` si aia se scrie in `dhl_etichete.format`. Aici,
 * si numai aici, se coboara la forma cererii.
 */
export function formatCerut(f: FormatEticheta): string {
  return f === "EPL2" ? "epl" : f.toLowerCase();
}

/**
 * Sabloanele de eticheta, transcrise din nomenclatorul lor (`outputImageTemplate`,
 * randurile cu `serviceName = CreateShipment` si `categoryGroup = transport label`).
 *
 * ⚠ CAPCANA: implicitul DECLARAT de ei e `ECOM26_84_001`, si nomenclatorul lor il da ca
 * fiind DOAR termic (`ZPL,LP2,EPL2`) — in timp ce `encodingFormat` are `default: pdf`.
 * Cele doua implicituri ale lor nu se potrivesc intre ele. Un comerciant fara imprimanta
 * termica ar putea primi un fisier pe care nu-l poate tipari, fara nicio eroare.
 *
 * De aceea implicitul NOSTRU e un sablon pe care chiar nomenclatorul lor il listeaza ca
 * PDF. Comerciantul cu imprimanta termica alege unul din cele termice.
 *
 * ⚠ `templateName` are `maxLength: 25`; toate valorile de mai jos incap.
 */
export const SABLOANE: { valoare: string; eticheta: string; formate: FormatEticheta[] }[] = [
  { valoare: "ECOM26_A4_001", eticheta: "A4, orientare peisaj (PDF)", formate: ["PDF"] },
  { valoare: "ECOM26_84_A4_001", eticheta: "A4 cu text propriu pe eticheta (PDF)", formate: ["PDF"] },
  { valoare: "ECOM_TC_A4", eticheta: "A4 cu termeni si conditii (PDF)", formate: ["PDF"] },
  { valoare: "ECOM26_84_001", eticheta: "Termica 8 x 4 inch", formate: ["ZPL", "LP2", "EPL2"] },
  { valoare: "ECOM26_64_001", eticheta: "Termica 6 x 4 inch", formate: ["ZPL", "LP2", "EPL2"] },
  { valoare: "ECOM26_A6_002", eticheta: "Termica A6", formate: ["ZPL", "LP2", "EPL2"] },
];

export const SABLON_IMPLICIT = "ECOM26_A4_001";

/**
 * Incotermurile, din enumerarea lui `content.incoterm`.
 *
 * ⚠ `incoterm` E OBLIGATORIU LA EMITERE, si nu doar la extern: e in lista `required` a lui
 * `content`, iar propriul lor exemplu de expediere INTERNA (GB→GB) trimite
 * `isCustomsDeclarable: false` impreuna cu `incoterm: DAP`. Deci si o comanda Bucuresti →
 * Cluj are nevoie de el.
 *
 * ⚠ Lista lor completa are saisprezece valori, dar opt dintre ele (`FAS`, `FOB`, `CFR`,
 * `CIF`, `DES`, `DEQ`, `DAF`, `DAT`) sunt termeni de transport MARITIM sau termeni retrasi
 * din Incoterms 2020. DHL Express e curier aerian si rutier — puse intr-o lista derulanta
 * de magazin online, ele nu sunt optiuni, sunt capcane. Raman valide daca cineva le scrie
 * de mana in configurare; nu le propunem.
 *
 * `DAP` implicit: „Delivered at Place" — vanzatorul plateste transportul, cumparatorul
 * plateste taxele vamale. E asezarea obisnuita a unui magazin online romanesc care trimite
 * in afara Uniunii. `DDP` muta si taxele pe vanzator, si atunci se cere si `serviceCode: DD`.
 */
export const INCOTERMURI: { cod: string; eticheta: string }[] = [
  { cod: "DAP", eticheta: "DAP — livrat la destinatie, taxele vamale le plateste cumparatorul" },
  { cod: "DDP", eticheta: "DDP — livrat cu taxele vamale platite de tine" },
  { cod: "DDU", eticheta: "DDU — livrat fara taxe vamale platite (termen vechi)" },
  { cod: "EXW", eticheta: "EXW — ridicat de la sediul tau, restul e al cumparatorului" },
  { cod: "FCA", eticheta: "FCA — predat curierului, transportul il plateste cumparatorul" },
  { cod: "CPT", eticheta: "CPT — transport platit pana la destinatie" },
  { cod: "CIP", eticheta: "CIP — transport si asigurare platite pana la destinatie" },
  { cod: "DPU", eticheta: "DPU — livrat si descarcat la destinatie" },
];

export const INCOTERM_IMPLICIT = "DAP";

// ─── Data si ora, in fusul Romaniei ──────────────────────────────────────────

const FUS = "Europe/Bucharest";

/**
 * ⚠ `hourCycle: "h23"`, nu `hour12: false`.
 *
 * Al doilea lasa ICU sa aleaga intre `h23` si `h24` dupa locale, iar pe `h24` miezul
 * noptii se formateaza „24" cu ziua CARE SE INCHEIE. Adica intre 00:00 si 00:59 data ar
 * fi cu o zi in urma — exact fereastra in care `dateRangeFrom` al cautarii dupa referinta
 * s-ar inchide inainte de ziua in care tocmai s-a emis AWB-ul. (Regresia gasita la FedEx.)
 */
const CEAS = new Intl.DateTimeFormat("en-US", {
  timeZone: FUS,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type PartiCeas = { an: string; luna: string; zi: string; ora: string; minut: string; secunda: string };

function partiLocale(d: Date): PartiCeas {
  const p: Record<string, string> = {};
  for (const x of CEAS.formatToParts(d)) if (x.type !== "literal") p[x.type] = x.value;
  return {
    an: p.year ?? "1970",
    luna: p.month ?? "01",
    zi: p.day ?? "01",
    ora: p.hour ?? "00",
    minut: p.minute ?? "00",
    secunda: p.second ?? "00",
  };
}

/**
 * Decalajul fusului romanesc, in minute, PENTRU MOMENTUL DAT.
 *
 * ⚠ NU se scrie in cod. Romania e GMT+02:00 iarna (EET) si GMT+03:00 vara (EEST). Un
 * decalaj fix ar fi gresit vreo sapte luni pe an si ar deplasa ora fata de pragul lor de
 * preluare cu 60 de minute — fara nicio eroare, doar cu alt set de produse si alta data
 * estimata de livrare.
 */
function decalajMinute(d: Date): number {
  const p = partiLocale(d);
  const caUtc = Date.UTC(Number(p.an), Number(p.luna) - 1, Number(p.zi), Number(p.ora), Number(p.minut), Number(p.secunda));
  /* Secundele lor n-au milisecunde; se compara pe aceeasi rezolutie. */
  const baza = Math.floor(d.getTime() / 1000) * 1000;
  return Math.round((caUtc - baza) / 60_000);
}

/**
 * Ziua calendaristica, in fusul Romaniei, `YYYY-MM-DD`.
 *
 * Formatul e cel cerut de `dateRangeFrom`/`dateRangeTo` (`example: '2020-05-01'`).
 *
 * ⚠ STA AICI, nu in `expediere.ts`, si nu din stil: o folosesc si cautarea dupa referinta,
 * si `lunaRidicare()`, si cronul. Doua definitii s-ar fi departat, iar `toISOString()` —
 * care da ziua UTC — ar fi mutat granita cu trei ore vara.
 */
export function ziuaDhl(acum: Date = new Date()): string {
  const p = partiLocale(acum);
  return `${p.an}-${p.luna}-${p.zi}`;
}

/**
 * ⚠ Cat impinge inainte `momentExpedierii()` momentul cerut.
 *
 * Verbatim din descrierea lor a lui `plannedShippingDateAndTime`: „**It is not recommended
 * to populate this field with current time, the time the request is sent to DHL Express as
 * it may be evaluated as being in the past the time it is received.**" Iar cand e evaluat
 * ca fiind in trecut, cererea cade cu `998 The shipment date cannot be in the past or more
 * than 10 days in future.`
 *
 * Zece minute acopera si latenta lor, si o mica desincronizare de ceas, si raman departe
 * de orice prag de preluare.
 */
const MARJA_MOMENT_MS = 10 * 60_000;

/**
 * `plannedShippingDateAndTime` — formatul EXACT, dupa ce documentatia lor s-a contrazis de
 * cinci ori pe el.
 *
 * Forma: `YYYY-MM-DDTHH:MM:SS GMT+HH:MM` — **CU SPATIU** inainte de `GMT`.
 *
 * ⚠ DHL scrie amandoua formele, in acelasi fisier:
 *   `example` al campului              `'2019-08-04T14:00:31GMT+01:00'`   (28, fara spatiu)
 *   textul descriptiv al campului      `2025-01-18T17:00:00 GMT+01:00`    (29, cu spatiu)
 *   mesajul lor de eroare 400          `Expected Sample Format : '2010-02-11T17:10:09 GMT+01:00'`
 *   cinci exemple de cerere            cu spatiu; alte cinci, fara
 *
 * ⚠ ARBITRUL E `maxLength: 29`. Forma cu spatiu are exact 29 de caractere; cea fara are 28.
 * Un plafon de 29 nu are alta explicatie. Plus mesajul de eroare, care e purtare de rulare,
 * nu documentatie. Deci: CU spatiu.
 *
 * ⚠ Si offsetul e literal `GMT+02:00` / `GMT+03:00`, nu `+02:00` si nu `Z`. Nu e ISO 8601.
 */
export function momentExpedierii(acum: Date = new Date()): string {
  /* Niciodata in trecut: daca cel cerut e acum sau mai devreme, se impinge cu marja. */
  const tinta = new Date(Math.max(acum.getTime(), Date.now() + MARJA_MOMENT_MS));
  const p = partiLocale(tinta);
  const min = decalajMinute(tinta);
  const semn = min < 0 ? "-" : "+";
  const abs = Math.abs(min);
  const oo = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${p.an}-${p.luna}-${p.zi}T${p.ora}:${p.minut}:${p.secunda} GMT${semn}${oo}:${mm}`;
}

/**
 * Luna ridicarii, `YYYY-MM` — cheia FARA de care nu se poate reimprima nimic.
 *
 * `pickupYearAndMonth` e `required: true` la `GET /shipments/{awb}/get-image`. Nu poti cere
 * un document stiind doar AWB-ul.
 *
 * ⚠ SI E O CHEIE PE CARE DHL N-O DEFINESTE. Campul se numeste „the **pickup's** date", in
 * timp ce singura data pe care o trimitem la creare e `plannedShippingDateAndTime`. O
 * expediere planificata pe 31 ianuarie si ridicata pe 1 februarie e cazul care rupe
 * reimprimarea, si documentatia lor nu spune care dintre cele doua e. De aceea se scrie in
 * `dhl_etichete.luna_ridicare` la emitere, din ce am trimis NOI, si nu se mai atinge.
 *
 * ⚠ Cand sirul nu se poate citi se intoarce GOL, nu luna curenta. O luna ghicita gresit
 * primeste `1504 No document images found for the provided search criteria` — adica un
 * raspuns care arata exact ca „DHL a pierdut documentul", cand de fapt am cerut alta luna.
 */
export function lunaRidicare(momentSauIso: string): string {
  const t = (momentSauIso ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}`;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return ziuaDhl(d).slice(0, 7);
  return "";
}

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
 * ⚠ Schemele DHL declara tablouri peste tot, dar exemplele lor proprii isi incalca schema
 * in cel putin trei locuri documentate (`documents[]`, `warnings[]`, corpul de 422). Un
 * singur ajutor, folosit peste tot, si clasa „un singur element vine ca obiect si `.map`
 * crapa" nu se mai poate deschide.
 */
export function asTablou<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === null || v === undefined) return [];
  return [v as T];
}

type EroareDhl = { code: string; message: string };

/** Codul lor numeric, cand e lipit in fata textului: `"7008: The requested…"`. */
function codDinText(t: string): string | null {
  const m = /^\s*(\d{3,6})\s*:/.exec(t);
  return m ? m[1] : null;
}

/**
 * Traducerea codurilor pe care le RECUNOASTEM.
 *
 * ⚠ Nu e o lista completa: `returnStatusMessage` din nomenclatorul lor are 1830 de randuri
 * (1731 `Error`, 98 `Warning`). Sunt aici doar cele care apar in fluxul nostru — cotare,
 * emitere, urmarire, imagine, dovada livrarii, anulare de ridicare — si pe care un
 * comerciant roman le poate chiar repara singur. Restul trec mai departe cu codul si textul
 * lor in engleza: un mesaj strain e mai bun decat unul romanesc inventat gresit.
 *
 * ⚠ `998` NU E AICI, si nu din uitare. Vezi `traduce()`.
 */
const CODURI: Record<string, string> = {
  // ─── Cont si autorizare ────────────────────────────────────────────────────
  "801": "DHL nu gaseste numarul de cont sau il considera invalid. Verifica numarul de cont DHL Express din configurare.",
  "8001": "DHL nu gaseste numarul de cont sau il considera invalid. Verifica numarul de cont DHL Express din configurare.",
  "8003": "Contul DHL nu are dreptul la serviciul asta. Ia legatura cu reprezentantul tau DHL Express.",
  "8007": "Contul de expeditor nu e valid pentru expedierea asta.",
  "8032": "Contul nu e autorizat sa foloseasca serviciul asta. Ia legatura cu reprezentantul tau DHL Express.",
  "5032": "DHL a refuzat accesul la serviciul asta pentru contul tau. Nu cheile sunt de vina — ia legatura cu reprezentantul tau DHL Express.",
  "1013": "Cererea are nevoie de numarul de cont DHL. Completeaza-l in configurare.",
  "1511": "Cererea are nevoie de numarul de cont DHL. Completeaza-l in configurare.",
  "7037": "Contul tau nu are voie sa ceara ridicare de la curier. Ia legatura cu reprezentantul tau DHL Express.",
  "202123": "Contul DHL are creditul oprit si nu poate plati expedierea.",
  "202131": "Contul DHL are creditul taiat si nu poate plati expedierea.",
  "202132": "Contul DHL e de tip numerar si nu poate plati expedierea prin cont.",

  // ─── Produs si serviciu ────────────────────────────────────────────────────
  "8035": "Codul de produs trimis nu se potriveste cu tipul de retea al contului DHL.",
  "8036": "Codul de produs nu e permis pentru tipul de retea al contului DHL.",
  "20001": "Nu s-a trimis niciun cod de produs DHL, nici local, nici global.",
  "340024": "Lipseste codul de produs DHL (global sau local).",
  "340027": "Combinatia de produs si serviciu nu e valida la DHL.",
  "202023": "Codul de produs local trimis nu e valid.",
  "996": "DHL nu are niciun produs pentru datele trimise.",
  "1001": "DHL nu are niciun produs pentru datele trimise.",
  "1004": "DHL nu ofera produsul asta intre cele doua adrese.",
  /*
   * ⚠ ASTA E CODUL RAMBURSULUI, si de aceea merita mesajul cel mai lung din tot fisierul.
   *
   * Verbatim: „The requested Special Service Code #/valueAddedServices/0/serviceCode 'xx'
   * is not available between this origin and destination." Nu cade la COTARE, cade la
   * EMITERE — adica dupa ce cumparatorul a comandat si a plecat din magazin.
   */
  "7008": "DHL nu ofera unul dintre serviciile cerute intre cele doua adrese. Daca comanda e cu plata la livrare: DHL Express NU vinde ramburs cu origine Romania.",
  "6019": "Nu se poate cere grupul de servicii cand cererea contine deja servicii obligatorii.",

  // ─── Adresa ────────────────────────────────────────────────────────────────
  "420501": "DHL nu recunoaste tara adresei de expeditie.",
  "420502": "DHL nu recunoaste tara adresei de livrare.",
  "420504": "DHL nu recunoaste localitatea de expeditie. Verifica orasul si codul postal ale magazinului.",
  "420505": "DHL nu recunoaste localitatea de livrare. Verifica orasul si codul postal ale destinatarului.",
  "420506": "Codul postal nu e recunoscut de DHL. Pentru Romania el are exact 6 cifre.",
  "3008": "Codul postal nu e recunoscut de DHL. Pentru Romania el are exact 6 cifre.",
  "3009": "DHL n-a putut valida adresa.",
  "3010": "Adresa are nevoie cel putin de oras sau de cod postal.",
  "3011": "DHL nu ofera serviciul pentru adresa de expeditie data.",
  "340004": "Lipsesc datele de localizare. DHL cere cel putin unul dintre: cod postal, oras sau cartier.",
  "202067": "DHL nu recunoaste orasul trimis.",
  "6020": "DHL a respins adresa la validarea stricta. Verifica strada, orasul si codul postal.",

  // ─── Colet: greutate, dimensiuni, unitati ──────────────────────────────────
  "7160": "Coletul are nevoie de dimensiuni (lungime, latime, inaltime) sau de un tip de ambalaj DHL.",
  "410101": "Greutatea expedierii depaseste maximul DHL.",
  "410106": "Greutatea coletului depaseste maximul DHL.",
  "410117": "Greutatea coletului e sub minimul DHL (0,1 kg).",
  "410122": "Greutatea expedierii e sub minimul DHL.",
  "410118": "Numarul de colete depaseste maximul DHL.",
  "410123": "Valoarea declarata depaseste maximul DHL pentru expedierea asta.",
  "340008": "Lipseste greutatea coletului.",
  "340017": "Lipseste unitatea de masura pentru greutate.",
  "340019": "DHL nu recunoaste unitatea de masura pentru greutate.",
  "340020": "DHL nu recunoaste unitatea de masura pentru dimensiuni.",
  "340026": "Combinatie invalida de unitati de greutate si de dimensiuni.",
  "340028": "Lipseste unitatea de masura.",
  "340029": "Toate dimensiunile trebuie sa fie in aceeasi unitate de masura.",
  "340031": "Formatul dimensiunilor nu e corect.",
  "340032": "Formatul greutatii nu e corect.",
  "340035": "Lipseste unitatea de masura pentru dimensiuni.",
  "340021": "Lipseste valuta.",
  "340023": "DHL nu recunoaste valuta trimisa.",

  // ─── Continutul expedierii ─────────────────────────────────────────────────
  "7143": "Descrierea continutului trebuie sa aiba cel putin 3 caractere.",
  "7144": "Descrierea unui articol din declaratia de export trebuie sa aiba cel putin 3 caractere.",
  "7139": "Expedierile vamale au nevoie si de valuta valorii declarate.",
  "7140": "Expedierile vamale au nevoie de incoterm.",
  "7145": "Valoarea declarata a fost trimisa fara valuta ei.",
  "7153": "Numarul de referinta al coletului trebuie trimis pentru TOATE coletele, nu doar pentru unul.",
  "7154": "Doua colete au acelasi numar de referinta.",

  // ─── Referinta si recuperare ───────────────────────────────────────────────
  "7099": "Lipseste referinta comenzii (tip „CU”) sau numarul de cont din cerere.",
  "7096": "Numarul de expediere trimis nu e valid.",
  "400104": "Numarul de expediere trimis nu e valid.",

  // ─── Imaginea documentelor (reimprimare) ───────────────────────────────────
  "1501": "Numarul de expediere DHL nu e valid.",
  "1502": "S-au cerut prea multe tipuri de document deodata.",
  "1504": "DHL nu mai are niciun document pentru cautarea asta. Foloseste copia pastrata de noi la emitere.",
  "1505": "DHL nu gaseste datele expedierii, deci nu poate da documentul.",
  "1506": "Formatul TIFF nu merge impreuna cu „toate intr-un singur PDF”.",
  "1509": "Contul tau nu are voie sa ceara tipul asta de document. Ia legatura cu reprezentantul tau DHL Express.",
  "1510": "Intervalul cerut e mai vechi decat data deschiderii contului DHL.",

  // ─── Ridicarea ─────────────────────────────────────────────────────────────
  "5001": "A trecut ora limita de programare a ridicarii pentru locatia asta.",
  "5002": "Fereastra de ridicare e prea scurta fata de ora de inchidere a locatiei.",
  "5022": "Data expedierii nu poate fi in trecut.",
  "5023": "Data expedierii nu poate fi mai departe de 10 zile in viitor.",

  // ─── Versiunea interfetei ──────────────────────────────────────────────────
  "9001": "Antetul x-version trimis catre DHL e invalid. Versiunea interfetei s-a schimbat — trebuie actualizata in cod.",

  // ─── Esecuri de proces si de infrastructura ────────────────────────────────
  "999": "DHL a picat in timpul prelucrarii. Nu se stie daca cererea a apucat sa se execute — NU o repeta pana nu verifici in MyDHL.",
  "90001": "DHL a raspuns cu o eroare neclasificata la generarea etichetei.",
  "90002": "DHL a respins mesajul ca fiind invalid la generarea etichetei.",
  "90003": "DHL n-a putut citi memoria lui interna la generarea etichetei.",
  "99999": "Serverele de etichete ale DHL nu raspund.",

  // ─── Avertismente (severitate `Warning` in nomenclatorul lor) ──────────────
  /*
   * ⚠ Cele doua de mai jos sunt cele mai scumpe avertismente ale integrarii: AWB emis cu
   * succes (201), FACTURABIL, dar FARA pret in raspuns. Cine ia tariful din raspunsul de
   * emitere si il trece in comanda incaseaza zero.
   */
  "7991": "DHL a creat expedierea dar n-a putut calcula tariful — raspunsul a venit fara niciun pret.",
  "7995": "DHL a creat expedierea dar n-a intors niciun pret.",
  "7992": "DHL a INLOCUIT codul de judet trimis cu unul din nomenclatorul lor. Verifica adresa de pe eticheta.",
  "7993": "DHL n-a intors nicio data estimata de livrare pentru expedierea asta.",
  "7994": "DHL nu transliterizeaza textele pentru tara expeditorului, deci raspunsul vine fara varianta transliterata.",
  "7990": "Factura comerciala randata de DHL poate tipari doar un numar limitat de adrese.",
  "7988": "Tipareste toate documentele expedierii si lipeste-le pe colet.",
  "6994": "DHL n-a putut aplica setarile contului tau — pretul intors poate fi cel de lista, nu cel din contract.",
  "6995": "DHL n-a putut aplica ora limita de ridicare a contului tau — pretul intors poate fi cel de lista.",
  "6996": "DHL n-a putut aplica ora limita de ridicare a contului tau — pretul intors poate fi cel de lista.",
  "6997": "DHL n-a gasit codurile de sortare pentru ruta asta.",
  "3998": "DHL a potrivit adresa doar PARTIAL.",
  "3999": "DHL a gasit mai multe adrese care se potrivesc.",
};

/**
 * ⚠⚠ `998` — codul care NU poate fi tradus dintr-o singura bucata.
 *
 * In documentatia lor, `998` inseamna PATRU lucruri diferite:
 *   „The account number is not found or invalid."               -> refuz dovedit
 *   „The account number is not allowed for PaperLessTrade."     -> refuz dovedit
 *   „The shipment date cannot be in the past or more than 10 days in future." -> refuz dovedit
 *   „Process failure occurred. Process ID associated for that transaction (…)" -> NU STIM
 *
 * Ultimul e emis de motorul lor DUPA validare, si mesajul insusi pomeneste un „Process ID
 * associated for that **transaction**" — deci a existat o tranzactie si nu stim daca AWB-ul
 * s-a emis. Un `if (cod === "998") return REFUZ` e chiar defectul care produce al doilea AWB.
 *
 * Si nu se opreste la 998: acelasi mesaj „Process failure occurred" apare in ghidul SOAP sub
 * `998` si in ghidul REST sub `999`. Acelasi furnizor, doua coduri, doua documente oficiale.
 *
 * De aceea `998` se citeste dupa TEXT, aici si numai aici, si de aceea `eEsecDeProces()`
 * cauta textul, nu codul.
 */
function traduce(cod: string, mesaj: string): string | null {
  if (cod === "998") {
    if (/process\s+failure/i.test(mesaj)) return CODURI["999"];
    if (/shipment\s+date/i.test(mesaj)) return "Data expedierii nu poate fi in trecut si nici mai departe de 10 zile in viitor.";
    if (/paperless/i.test(mesaj)) return "Contul DHL nu e activat pentru documente vamale electronice (Paperless Trade).";
    return "DHL nu gaseste numarul de cont sau il considera invalid. Verifica numarul de cont DHL Express din configurare.";
  }
  return CODURI[cod] ?? null;
}

/**
 * ⚠ „Process failure" = NU STIM, oricare ar fi codul.
 *
 * Se cauta TEXTUL, nu codul, tocmai fiindca acelasi mesaj circula sub `998` si sub `999`.
 * Un esec de proces se intampla DUPA validare, deci pe o emitere el inseamna „poate s-a
 * creat" — si atunci reincercarea trebuie BLOCATA, altfel al doilea AWB ramane emis si
 * poate fi facturat.
 */
function eEsecDeProces(corp: unknown): boolean {
  return erorileDin(corp).some((e) => /process\s+failure/i.test(e.message));
}

/**
 * Erorile din corp — si aici sunt SASE forme, nu una.
 *
 * ⚠⚠ CODUL DHL NU ARE CAMP PROPRIU. El e lipit in textul liber al lui `detail`, ca
 * `"7008: …"`, `"1504: …"`, `"999: …"` — si LIPSESTE cu totul in destule cazuri
 * documentate (`detail: 'The account number is not found or invalid…'`,
 * `detail: 'Missing mandatory parameters: shipperAccountNumber'`). Se extrage cu regex, si
 * absenta lui nu e un defect.
 *
 * Formele, toate reale:
 *   1. documentata: `{instance, detail, title, message, status, additionalDetails[]}`,
 *      cu `Content-Type: application/problem+json` (dar NU conform RFC 7807);
 *   2. `/servicepoints`: HTTP 200 cu `status: {statusCode, statusMessage}` — `statusCode: 1`
 *      inseamna succes, orice altceva e eroare, iar „Error: "/„Warning: " sunt prefixe DE
 *      TEXT, nu campuri. Noi nu chemam `/servicepoints`, dar citirea ramane ieftina;
 *   3. GATEWAY-UL, NEDOCUMENTAT NICAIERI: `{reasons: [{msg: "Invalid Credentials"}],
 *      details: {msgId: …}}`, cu `Content-Type: application/json`. ZERO campuri comune cu
 *      forma documentata — un parser care citeste `body.detail` primeste `undefined` si
 *      raporteaza „eroare necunoscuta" pentru un refuz perfect determinist;
 *   4. corp GOL, fara `Content-Type`, pe 404 la o cale gresita. `JSON.parse("")` arunca;
 *      se verifica lungimea INAINTE de parsare (vezi `apel()`);
 *   5. `ExceptionResponse` pe `/servicepoints`: `{message, status, exception}`;
 *   6. SOAP Fault, daca cineva atinge vreodata stiva veche — `faultstring` e GOL, informatia
 *      sta intr-un atribut XML.
 *
 * ⚠ `title` NU e discriminator: acelasi `title: Bad request` apare de nouasprezece ori, pe
 * cauze care n-au nicio legatura intre ele („data prost formatata" si „serviciu indisponibil
 * pe ruta asta"). Nu se clasifica niciodata dupa el.
 */
export function erorileDin(corp: unknown): EroareDhl[] {
  if (!corp || typeof corp !== "object") return [];
  const c = corp as Record<string, unknown>;
  const iesire: EroareDhl[] = [];

  const adauga = (brut: unknown) => {
    const t = text(brut);
    if (!t) return;
    const cod = codDinText(t);
    iesire.push(cod ? { code: cod, message: t.slice(t.indexOf(":") + 1).trim() } : { code: "", message: t });
  };

  /* 1. forma documentata */
  adauga(c.detail);
  for (const d of asTablou<unknown>(c.additionalDetails)) adauga(d);

  /* 3. forma gateway-ului */
  for (const r of asTablou<Record<string, unknown>>(c.reasons)) {
    if (r && typeof r === "object") adauga(r.msg);
  }

  /*
   * 2. `/servicepoints`. ⚠ `status` e un OBIECT doar acolo; in restul API-ului e un SIR cu
   * codul HTTP. Verificarea de tip e cea care le tine despartite.
   */
  const stare = c.status;
  if (stare && typeof stare === "object" && !Array.isArray(stare)) {
    const s = stare as Record<string, unknown>;
    const numeric = numarSauNull(s.statusCode);
    if (numeric !== null && numeric !== 1) adauga(s.statusMessage);
  }

  /* 5. `ExceptionResponse`, si orice corp care poarta doar `message`. */
  if (iesire.length === 0) adauga(c.message);

  return iesire.filter((e) => e.code || e.message);
}

/** Textul pentru comerciant, din oricare dintre formele lor. */
export function descrieEroarea(corp: unknown, brut: string): string {
  const erori = erorileDin(corp);
  if (erori.length > 0) {
    const bucati = erori.map((e) => {
      const tradus = traduce(e.code, e.message);
      if (tradus) return tradus;
      return e.message ? `${e.message}${e.code ? ` (${e.code})` : ""}` : e.code;
    });
    return [...new Set(bucati)].join(" | ").slice(0, 500);
  }

  const c = (corp && typeof corp === "object" ? corp : null) as Record<string, unknown> | null;
  const rezerva = text(c?.title);
  if (rezerva) return rezerva.slice(0, 300);

  return brut.trim().slice(0, 300) || "raspuns gol";
}

/**
 * Primul cod DHL din raspuns, pentru cine decide dupa cod.
 *
 * ⚠ NU e `status` si NU e `code` din corp. Alea doua poarta codul HTTP („400", „500") —
 * scris uneori ca sir, o data ca numar, si de noua ori sub numele `code` in exemple care isi
 * incalca propria schema. Codul HTTP se citeste din raspunsul HTTP.
 */
export function primulCod(corp: unknown): string | null {
  for (const e of erorileDin(corp)) if (e.code) return e.code;
  return null;
}

/**
 * ⚠ AVERTISMENTELE DE PE UN RASPUNS DE SUCCES. Al treilea nivel de citire.
 *
 * `warnings[]` e un tablou de SIRURI, si exista pe `/rates` (`example: "Price can't be
 * calculated"`), pe `/shipments` (`example: "can't return prices"`) si inca pe cinci scheme
 * de raspuns reusit. Elementele poarta acelasi prefix numeric ca erorile
 * (`'200203: #/items/number:1/ …'`), deci se traduc la fel.
 *
 * ⚠ Sunt cele care spun ca DHL ti-a SCHIMBAT codul de judet (`7992`), ca a creat expedierea
 * FARA pret (`7991`, `7995`), sau ca n-a putut aplica setarile contului tau si deci ti-a dat
 * tariful de LISTA in loc de cel din contract (`6994`-`6996`). Ignorate, cotarea „reuseste"
 * si factura vine alta.
 *
 * ⚠ `warnings` e la nivel de RASPUNS, nu de produs: un „Price can't be calculated" nu se
 * poate lega de un anume produs din `products[]`.
 */
export function avertismenteleDin(corp: unknown): string[] {
  if (!corp || typeof corp !== "object") return [];
  const brute = asTablou<unknown>((corp as { warnings?: unknown }).warnings);
  const iesire: string[] = [];
  for (const w of brute) {
    const t = typeof w === "string"
      ? w.trim()
      : text((w as Record<string, unknown> | null)?.message) || text((w as Record<string, unknown> | null)?.description);
    if (!t) continue;
    const cod = codDinText(t);
    const tradus = cod ? traduce(cod, t) : null;
    iesire.push(tradus ?? t);
  }
  return [...new Set(iesire)].slice(0, 20);
}

/**
 * Codurile care merita reincercate.
 *
 * ⚠ TOATE SUNT ALESE DE NOI. DHL nu declara nicaieri ce e tranzitoriu si ce nu — „transient"
 * are ZERO aparitii in OpenAPI, in ghidul SOAP si in ghidul de date de referinta. Spre
 * deosebire de UPS, care isi imparte singur cele 927 de coduri in `Hard` si `Transient`.
 *
 * ⚠⚠ `998` NU E AICI, dinadins. El inseamna si „cont invalid" (refuz dovedit) si „process
 * failure" (nu stim). Pus in lista, ar bloca la nesfarsit comenzi cu un numar de cont gresit;
 * scos cu totul, ar debloca reincercarea dupa un esec de proces si ar emite al doilea AWB.
 * Cazul „process failure" e prins de `eEsecDeProces()`, dupa TEXT.
 */
const COD_TRANZITORIU = new Set(["999", "90001", "90002", "90003", "99999"]);

// ─── Antetele ─────────────────────────────────────────────────────────────────

/**
 * `Message-Reference` — exact 32 de caractere alfanumerice.
 *
 * ⚠ De ce exact 32, si nu „un UUID". Documentatia lor da PATRU intervale incompatibile
 * pentru acelasi camp:
 *   schema REST                    `minLength: 1, maxLength: 36`
 *   ghidul SOAP, tabelul RateResponse   `AN 32`
 *   ghidul SOAP, proza TrackingRequest  „required to be between 28 and 32 characters"
 *   ghidul SOAP, tabelul TrackingRequest `M AN 32`, „between 28-32 characters"
 * si isi incalca singura regulile: `example`-ul REST are 32 de caractere si NU e un UUID
 * valid, iar exemplele SOAP au 29 si 31.
 *
 * 32 de caractere satisface SIMULTAN toate cele patru intervale. Un `crypto.randomUUID()`
 * cu cratime (36) trece azi pe REST si ar cadea daca DHL ar aplica vreodata regula SOAP.
 *
 * ⚠ SI NU E CHEIE DE IDEMPOTENTA. Verbatim: „not required to be unique between requests",
 * iar cand nu-l trimiti DHL il genereaza singur. Nu exista niciun endpoint care sa caute
 * dupa el. E pentru suportul uman, nu pentru deduplicare.
 */
export function referintaMesaj(): string {
  return crypto.randomUUID().replace(/-/g, "").toUpperCase();
}

/**
 * Referinta de mesaj cu samburele nostru in fata, tot 32 de caractere.
 *
 * Numarul comenzii ramane vizibil la inceput — asta e tot ce cere DHL cand deschizi un
 * tichet — iar restul e aleatoriu, ca doua cereri pentru aceeasi comanda sa nu para una.
 */
function referintaMesajDin(sursa: string | undefined): string {
  const curat = (sursa ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!curat) return referintaMesaj();
  return (curat + referintaMesaj()).slice(0, 32);
}

/**
 * Pentru probe: goleste antetele pastrate.
 *
 * ⚠ ASTAZI NU E NIMIC DE UITAT, si asta e chiar vestea buna a integrarii.
 *
 * La UPS, functia pereche (`uitaTokenurile`) golea doua harti: tokenurile vii, pe pereche
 * (gazda, client_id), si cererile de token in zbor. Erau obligatorii — `/security/v1/oauth/token`
 * avea cota lui separata, cu un 429 propriu, iar fara token nu mergea nimic.
 *
 * Aici autentificarea e `Authorization: Basic`, calculata la fiecare cerere din utilizator si
 * parola. Nu exista token, nu exista expirare, nu exista cota de autentificare, deci nu exista
 * nimic de pastrat — iar a tine parolele intr-o harta la nivel de modul, ca sa economisim un
 * `base64`, ar fi fost mai scump in risc decat in timp.
 *
 * Functia ramane fiindca stratul de probe si de teste o cheama la fel ca la ceilalti curieri.
 * ⚠ Daca cineva adauga vreodata un cache aici, TOT ce adauga se goleste din functia asta.
 */
export function uitaAntetele(): void {
  /* Nimic de golit — vezi comentariul de mai sus. */
}

function antete(
  utilizator: string,
  parola: string,
  referinta: string | undefined,
  cuCorp: boolean,
): Record<string, string> {
  /*
   * ⚠ PREEMPTIV, de la prima cerere. Sonda lor de 401 nu intoarce niciun antet
   * `WWW-Authenticate`, deci un client care asteapta provocarea nu se autentifica niciodata.
   */
  const acreditare = Buffer.from(`${utilizator}:${parola}`, "utf8").toString("base64");

  return {
    Authorization: `Basic ${acreditare}`,
    Accept: "application/json",
    "x-version": VERSIUNE_API,
    "Accept-Language": LIMBA,
    "Message-Reference": referintaMesajDin(referinta),
    /*
     * ⚠ Formatul cerut e HTTP-date (RFC 7231), nu ISO 8601 — iar schema lor nu-l valideaza
     * deloc (`type: string`, fara `pattern`), deci un ISO ar trece de schema si ar putea fi
     * respins de regulile de business. `toUTCString()` produce exact „Wed, 21 Oct 2015
     * 07:28:00 GMT".
     */
    "Message-Reference-Date": new Date().toUTCString(),
    "Shipping-System-Platform-Name": PLATFORMA.slice(0, 20),
    "Shipping-System-Platform-Version": VERSIUNE_PLATFORMA.slice(0, 15),
    ...(cuCorp ? { "Content-Type": "application/json" } : {}),
  };
}

// ─── Tipurile raspunsurilor ───────────────────────────────────────────────────

export type AlertaDhl = { code: string; description: string };

/** Un serviciu cu valoare adaugata, asa cum apare in devizul unei oferte. */
export type ServiciuOferta = {
  /** `serviceCode` — `II`, `IB`, `SF`, `KB`… Codul care se trimite inapoi la emitere. */
  cod: string;
  nume: string;
  /** `serviceTypeCode`: `XCH` extra charge, `FEE` taxa, `SCH` suprataxa, `NRI`. */
  tip: string;
  /** `isCustomerAgreement` — „serviciul CERE un acord prealabil", nu „contul tau il are". */
  cereContract: boolean;
};

/** O oferta de transport, dupa ce a fost curatata de invelisurile lor. Vezi `preturi.ts`. */
export type OfertaDhl = {
  productCode: string;
  localProductCode: string | null;
  productName: string;
  pret: number;
  valuta: string;
  cuTva: number | null;
  tva: number | null;
  tranzit: number | null;
  livrareEstimata: string | null;
  tipEstimare: string | null;
  document: boolean;
  cereContract: boolean;
  servicii: ServiciuOferta[];
};

export type RaspunsExpediere = {
  /** `shipmentTrackingNumber`. Numarul de EXPEDIERE, cel din toate celelalte apeluri. */
  awb: string;
  /** `packages[].trackingNumber` — per COLET. La un singur colet coincid; la mai multe NU. */
  awbColete: string[];
  /** Eticheta, base64, exact cum vine de la ei. */
  eticheta: string | null;
  /** Formatul REAL intors (`documents[].imageFormat`), nu cel cerut. */
  formatEticheta: string | null;
  /** Factura comerciala randata de ei, la expedierile vamale. */
  factura: string | null;
  /** `waybillDoc` — documentul de transport, arhiva expeditorului. */
  documentTransport: string | null;
  /** `dispatchConfirmationNumber`. ⚠ SINGURUL lucru care se poate anula la DHL. */
  numarRidicare: string | null;
  /** `cancelPickupUrl`, pastrat pentru om. ⚠ Nu se cheama — vezi `anuleazaRidicarea()`. */
  urlAnulareRidicare: string | null;
  livrareEstimata: string | null;
  /** ⚠ `warnings[]` de pe un 201. Vezi `avertismenteleDin()`. */
  avertismente: string[];
};

export type UrmarireDhl = {
  awb: string;
  /** `events[].typeCode` al celui mai RECENT eveniment. Vezi `statusuri.ts`. */
  cod: string | null;
  /** Textul LOR, tradus dupa `Accept-Language`. Se arata, nu se compara niciodata. */
  descriere: string | null;
  /** Data si ora evenimentului `OK`, cand exista. */
  livratLa: string | null;
  /** A semnat cineva? Vine din `events[].signedBy`. */
  areDovadaLivrarii: boolean;
  /**
   * ⚠ `signedBy` e gol fiindca DHL l-a MASCAT din GDPR, nu fiindca n-a semnat nimeni.
   *
   * Verbatim: „Note: This field may be intentionally left empty in accordance with the
   * General Data Protection Regulation (GDPR) requirements." Ghidul SOAP spune ca se descuie
   * cu `<RequestControlledAccessData>` — parametru care NU exista in REST. Ce exista in REST
   * e `requestControlledAccessDataCodes`, care intoarce LISTA campurilor mascate (`SIGN_NM`
   * pentru numele semnatarului), nu valorile.
   *
   * Deci steagul asta e singura cale de a deosebi „gol fiindca e ascuns" de „gol fiindca nu
   * s-a semnat" — si fara el am raporta livrari nesemnate care de fapt sunt semnate.
   */
  semnaturaMascata: boolean;
  livrareEstimata: string | null;
  avertismente: string[];
};

export type EtichetaReimprimata = { continut: string; format: string };
export type DovadaLivrare = { continut: string; format: string };
export type RezultatAnulareRidicare = { anulat: boolean; mesaj: string };

export type ProbaDhl = {
  mediu: MediuDhl;
  cotare: {
    ok: boolean;
    mesaj: string;
    produse: { cod: string; nume: string }[];
    valuta: string | null;
    alerte: string[];
    /** Produsele pe care DHL le marcheaza `isCustomerAgreement: true`. */
    cerContract: string[];
  };
  /**
   * ⚠⚠ RAMBURSUL, si de ce merita un apel de fiecare data.
   *
   * `KB` („Cash On Delivery") exista in nomenclatorul lor GLOBAL, dar nu apare in catalogul
   * comercial DHL Express Romania (24 de servicii enumerate, „cash"/„ramburs" = 0 aparitii),
   * nici in ghidul de tarife 2026 RO/EN, nici in sonda lor de capabilitate pe sase rute cu
   * origine RO, nici pe paginile a 40 de tari. Trimis totusi, cade la EMITERE cu `7008` —
   * adica dupa ce cumparatorul a comandat.
   *
   * Dovada e NEGATIVA, si o dovada negativa nu se poate inchide definitiv: DHL isi rezerva
   * dreptul la exceptii contractuale („Not all Optional Services are available for every
   * shipment or in every country"). De aceea proba se uita daca `KB` apare pentru CONTUL
   * acela — si daca apare vreodata, i se spune comerciantului.
   */
  ramburs: { ok: boolean; mesaj: string };
};

// ─── Apelul ───────────────────────────────────────────────────────────────────

/**
 * Ce face cererea la ei — si de asta depinde cum se citeste un esec.
 *
 * `citire`  o cerere care NU creeaza nimic (cotare, urmarire, imagine, dovada livrarii).
 *           Orice esec al ei e refuz DOVEDIT: n-a ramas nimic in urma.
 * `scriere` o cerere care poate lasa ceva in urma (emitere, anulare de ridicare).
 *           Un esec ambiguu iese `necunoscut` si BLOCHEAZA reincercarea.
 *
 * ⚠ Nu se poate deduce din metoda HTTP: `POST /rates` e o citire, iar
 * `DELETE /pickups/{n}` e o scriere. De aia campul e OBLIGATORIU in semnatura — asa `tsc`
 * enumera apelantii si nimeni nu poate uita sa se gandeasca la el.
 */
type Efect = "citire" | "scriere";

type OptiuniApel = {
  efect: Efect;
  corp?: unknown;
  asteptareMs?: number;
  /** Samburele lui `Message-Reference`, pentru suportul DHL. Nu deduplica nimic. */
  referinta?: string;
  /** ⚠ `DELETE /pickups/{n}` raspunde `200 Pickup cancelled` FARA corp. */
  acceptaGol?: boolean;
};

/**
 * Un apel catre DHL.
 *
 * ═══ VERDICTELE ═══
 *
 *   retea cazuta / timeout             -> citire: refuz. scriere: NU STIM.
 *   HTTP 401 / 403 / 429               -> refuz DOVEDIT, chiar si pe o scriere.
 *   HTTP 404                           -> refuz DOVEDIT.
 *   „process failure" in corp          -> citire: refuz. scriere: NU STIM.
 *   HTTP 5xx / 408                     -> citire: refuz. scriere: NU STIM.
 *   HTTP 4xx cu corp CITIBIL           -> refuz DOVEDIT.
 *   HTTP 4xx cu corp NECITIBIL         -> citire: refuz. scriere: NU STIM.
 *   HTTP 2xx cu corp necitibil         -> citire: refuz. scriere: NU STIM.
 *
 * ⚠ DE CE 401/403/429 SUNT REFUZ DOVEDIT SI PE O SCRIERE — la DHL asta se poate demonstra,
 * si nu e o presupunere de prudenta inversa. Sonda din 16.08.2026 arata ca gateway-ul lor
 * respinge INAINTE de aplicatie: exact acelasi corp de 147 de octeti, cu aceeasi forma
 * nedocumentata `{reasons:[{msg:"Invalid Credentials"}]}`, pentru `GET /rates`,
 * `POST /shipments`, `GET /tracking` si chiar pentru o metoda gresita. Cererea nu atinge
 * MyDHL. 429 vine de la acelasi strat („spike arrest"). Deci nu s-a creat nimic, si
 * reincercarea e libera — pe 429 chiar recomandata, pe 401/403 doar dupa ce omul schimba
 * cheile sau vorbeste cu DHL.
 *
 * ⚠ DE CE UN 4xx NECITIBIL E ALTCEVA DECAT UNUL CITIBIL. Un corp de eroare pe care il putem
 * citi dovedeste ca validarea lor a rulat si a respins. Un 4xx fara corp inteligibil poate fi
 * orice — inclusiv un intermediar care a taiat raspunsul unei cereri care ajunsese. Exceptia
 * e 404-ul: o resursa inexistenta nu poate fi creata de cererea care a cautat-o.
 */
async function apel<T>(
  config: Pick<DhlConfig, "username" | "password" | "mediu">,
  metoda: "GET" | "POST" | "DELETE",
  cale: string,
  optiuni: OptiuniApel,
): Promise<T> {
  const baza = gazda(config);
  const { efect, corp } = optiuni;
  const asteptareMs = optiuni.asteptareMs ?? (efect === "scriere" ? ASTEPTARE_EMITERE_MS : ASTEPTARE_MS);
  const ambiguu = (mesaj: string) => (efect === "citire" ? eroareRefuz(mesaj) : eroareNesigura(mesaj));

  const utilizator = (config.username ?? "").trim();
  const parola = config.password ?? "";
  if (!utilizator || !parola) {
    throw eroareRefuz("Lipsesc utilizatorul si parola MyDHL API din configurarea DHL.");
  }

  let res: Response;
  try {
    res = await fetch(`${baza}${cale}`, {
      method: metoda,
      headers: antete(utilizator, parola, optiuni.referinta, corp !== undefined),
      body: corp !== undefined ? JSON.stringify(corp) : undefined,
      signal: AbortSignal.timeout(asteptareMs),
      cache: "no-store",
      /* Un 3xx aici n-are ce cauta; urmat, ar putea aduce o pagina de autentificare. */
      redirect: "manual",
    });
  } catch (e) {
    throw ambiguu(`DHL ${metoda} ${cale}: ${(e as Error).message}`);
  }

  let brut: string;
  try {
    brut = await res.text();
  } catch (e) {
    /* Conexiunea a cazut DUPA antete. Pe o scriere, cererea poate sa fi ajuns. */
    throw ambiguu(`DHL ${metoda} ${cale}: raspunsul s-a intrerupt (${res.status}) — ${(e as Error).message}`);
  }

  /*
   * ⚠ SE VERIFICA LUNGIMEA INAINTE DE PARSARE. `GET /mydhlapi/test/o-cale-gresita` intoarce
   * `404` cu `Content-Length: 0` si FARA `Content-Type`. Un `res.json()` neconditionat ar
   * arunca acolo o exceptie de parsare, care ar fi clasificata „necunoscut" si ar bloca
   * reincercarea pe veci — pentru o greseala de cale banala si perfect determinista a NOASTRA.
   */
  const areCorp = brut.trim().length > 0;
  let date: unknown = null;
  if (areCorp) {
    try { date = JSON.parse(brut); } catch { date = null; }
  }

  const cod = primulCod(date);

  if (!res.ok) {
    const mesaj = `DHL ${metoda} ${cale}: ${descrieEroarea(date, brut)}`;

    if (res.status === 401) {
      throw insemneaza(
        eroareRefuz(
          "DHL a respins credentialele. Verifica utilizatorul si parola MyDHL API primite de la consultantul "
          + "DHL Express — nu „API Key” si „API Secret” din portalul pentru dezvoltatori — si mediul ales (test sau productie).",
        ),
        401, cod,
      );
    }
    if (res.status === 403) {
      throw insemneaza(
        eroareRefuz(
          `DHL a refuzat accesul la serviciul asta pentru contul tau. Cheile nu sunt de vina — ${descrieEroarea(date, brut)}`,
        ),
        403, cod,
      );
    }
    /*
     * ⚠ 429 E REAL SI NU E IN SPECIFICATIA LOR. Zero aparitii in cele 1,2 MB de OpenAPI si
     * absent din lista lor oficiala de coduri HTTP (200, 201, 400, 401, 403, 404, 422, 500).
     * Dar articolul lor de suport il descrie: „a 429 error message stating that you are making
     * too many requests", cu cota zilnica resetata la 24:00 GMT si cu un „spike arrest"
     * impartit pe ferestre de milisecunde — doua cereri in aceeasi fereastra cad chiar daca
     * media pe secunda e respectata.
     */
    if (res.status === 429) {
      throw insemneaza(
        eroareRefuz(
          "DHL a respins cererea fiindca s-au trimis prea multe intr-un interval scurt. "
          + "Nu s-a creat nimic — reincearca peste cateva minute.",
        ),
        429, cod,
      );
    }

    /* ⚠ Text, nu cod: acelasi „Process failure" circula sub `998` si sub `999`. */
    if (eEsecDeProces(date) || (cod && COD_TRANZITORIU.has(cod))) {
      throw insemneaza(ambiguu(mesaj), res.status, cod);
    }

    if (res.status >= 500 || res.status === 408) {
      throw insemneaza(ambiguu(mesaj), res.status, cod);
    }

    if (res.status === 404) {
      const spune = areCorp
        ? mesaj
        : `DHL n-a recunoscut adresa ceruta (${metoda} ${cale}). E o greseala de cale la noi, nu la ei.`;
      throw insemneaza(eroareRefuz(spune), 404, cod);
    }

    if (date === null) {
      throw insemneaza(
        ambiguu(`DHL ${metoda} ${cale}: raspuns de eroare necitibil (${res.status}) — ${brut.slice(0, 200)}`),
        res.status, cod,
      );
    }

    throw insemneaza(eroareCuStatus(mesaj, res.status), res.status, cod);
  }

  if (!areCorp) {
    if (optiuni.acceptaGol) return {} as T;
    throw insemneaza(
      ambiguu(`DHL ${metoda} ${cale}: raspuns ${res.status} fara corp.`),
      res.status, null,
    );
  }

  /*
   * ⚠ Un 2xx cu corp necitibil NU e succes: citit ca succes, am raporta o expediere care
   * poate nu exista; citit ca refuz pe o scriere, am debloca reincercarea.
   */
  if (date === null) {
    throw insemneaza(
      ambiguu(`DHL ${metoda} ${cale}: raspuns necitibil (${res.status}) — ${brut.slice(0, 200)}`),
      res.status, null,
    );
  }

  return date as T;
}

// ─── Cotarea ─────────────────────────────────────────────────────────────────

/**
 * ⚠ CERE MEREU SERVICIILE CU VALOARE ADAUGATA, oricine ar fi compus corpul.
 *
 * Fara `getAdditionalInformation: [{typeCode: "allValueAddedServices", isRequested: true}]`,
 * raspunsul vine fara `detailedPriceBreakdown[].breakdown[]` — adica fara niciun `serviceCode`.
 * Si atunci:
 *   - devizul din panou nu are din ce se compune pretul;
 *   - iar proba de conexiune raspunde „DHL nu vinde ramburs" pentru ORICE cont, fiindca
 *     n-are unde sa caute `KB`. Un fals negativ pe cea mai importanta intrebare comerciala
 *     a integrarii, si unul care arata exact ca un raspuns adevarat.
 *
 * De aia intarirea sta AICI, in singurul loc prin care trec toate cotarile, si nu la cel care
 * compune corpul.
 *
 * ⚠ `requestAllValueAddedServices` NU se foloseste: e declarat de ei „**Legacy field and
 * replaced by newer field getAdditionalInformation**".
 *
 * ⚠ Corpul primit NU se modifica pe loc — se face o copie. Apelantul il poate refolosi
 * (proba de conexiune chiar o face), iar o mutatie tacuta ar face al doilea apel altfel decat
 * primul.
 *
 * ⚠ `maxItems: 3` pe tablou, iar enumerarea are exact 3 valori — de aia al nostru se pune
 * PRIMUL, sa nu fie el cel taiat.
 */
function cuServiciiCerute(corp: unknown): unknown {
  if (!corp || typeof corp !== "object" || Array.isArray(corp)) return corp;
  const c = corp as Record<string, unknown>;

  const aleLor = asTablou<Record<string, unknown>>(c.getAdditionalInformation)
    .filter((x) => !!x && typeof x === "object");
  const areDeja = aleLor.some((x) => {
    const t = text(x.typeCode);
    return t === "allValueAddedServices" || t === "allValueAddedServicesAndRuleGroups";
  });
  if (areDeja) return corp;

  return {
    ...c,
    getAdditionalInformation: [{ typeCode: "allValueAddedServices", isRequested: true }, ...aleLor].slice(0, 3),
  };
}

/**
 * `POST /rates`.
 *
 * ⚠ POST, nu GET, si nu din obisnuinta. `GET /rates` are aceeasi descriere cuvant cu cuvant,
 * dar nu poate exprima nici ora de ridicare (deci nu discrimineaza dupa pragul de preluare),
 * nici valoarea declarata, nici mai mult de un colet — `plannedShippingDate` al lui e doar
 * `YYYY-MM-DD`, iar ora o alege DHL. Doua cereri identice trimise la 08:00 si la 22:00 pot da
 * produse diferite fara sa fi cerut nimeni asta.
 *
 * ⚠ FARA `strictValidation` AICI, si e o alegere, nu o scapare. La emitere il trimitem `true`
 * (vezi `creeazaExpediere`); la cotare NU. Motivul: DHL are reguli proprii de „fallback" pe
 * localitate (`410501`-`410515`, „Pickup/Delivery PL fallback rule applied") prin care alege
 * singur o locatie cand datele sunt ambigue si CONTINUA, cu 200. Pe validare stricta, o
 * localitate romaneasca pe care ei o rezolva de obicei ar face DHL sa dispara din checkout —
 * o vanzare pierduta pentru fiecare sat. Pe validare slaba, cotarea trece si esecul apare la
 * emitere, unde comerciantul il vede si il poate repara.
 *
 * ⚠ Pretul deci nu e o garantie, iar dovada ca DHL a ales alta locatie e in `warnings[]` — de
 * aia se intorc si se arata, nu se ascund.
 */
export async function tarife(
  config: DhlConfig,
  corp: unknown,
): Promise<{ oferte: unknown[]; avertismente: string[] }> {
  const r = await apel<Record<string, unknown>>(
    config, "POST", "/rates", { efect: "citire", corp: cuServiciiCerute(corp) },
  );
  /*
   * ⚠ `products: []` pe un 200 NU e o eroare — e „nicio optiune". Codurile lor
   * `996`/`1001 The requested product(s) not available based on your search criteria` si
   * `1004 Product not available between this origin and destination` arata ca lipsa de
   * produse e un rezultat normal. Cine il trateaza ca succes cu pret zero vinde transport
   * gratuit.
   */
  return { oferte: asTablou(r.products), avertismente: avertismenteleDin(r) };
}

// ─── Emiterea ────────────────────────────────────────────────────────────────

/** Tipurile de document care sigur NU sunt eticheta de transport. */
const TIPURI_FARA_ETICHETA = new Set(["invoice", "proforma", "receipt", "shipmentreceipt", "qr-code", "qrcode"]);

function documenteleDin(r: Record<string, unknown>): Record<string, unknown>[] {
  return asTablou<Record<string, unknown>>(r.documents)
    .filter((d) => !!d && typeof d === "object" && !!text(d.content));
}

/**
 * `POST /shipments?strictValidation=true`.
 *
 * ⚠⚠ SE CHEAMA DOAR DIN INTERIORUL REGISTRULUI DE OPERATII EXTERNE, si aici motivul e mai
 * apasat decat la UPS si FedEx. Acolo lipsa idempotentei era compensata de existenta
 * anularii: un al doilea AWB emis din greseala se putea sterge. Aici NU se poate. Iar
 * conditiile lor legale spun ca DHL „may request that You compensate it in the event that You
 * do not subsequently tender a shipment" — deci al doilea AWB nu e nici macar gratuit.
 *
 * ⚠ `strictValidation=true`, EXPLICIT. Implicitul lui e `false`, si atunci — verbatim — nu se
 * face „strict DCT validation of address details, and validation of product and service(s)
 * combination". O adresa gresita trece la creare si cade la LIVRARE, adica intr-un retur
 * taxat. Si mai e o capcana: exista DOI parametri de interogare cu acelasi nume,
 * `strictValidation`, cu implicituri OPUSE — `default: true` pe `/address-validate`,
 * `default: false` pe `/rates` si `/shipments`.
 *
 * ⚠ SUCCESUL E 201, NU 200. Un `if (res.status === 200)` ar clasifica drept esec o expediere
 * creata si facturabila, registrul ar trece pe „esuat", reincercarea s-ar debloca si ar iesi
 * al doilea AWB. `res.ok` acopera ambele.
 */
export async function creeazaExpediere(
  config: DhlConfig,
  corp: unknown,
  referinta: string,
): Promise<RaspunsExpediere> {
  const r = await apel<Record<string, unknown>>(
    config, "POST", "/shipments?strictValidation=true",
    { efect: "scriere", corp, referinta },
  );

  const colete = asTablou<Record<string, unknown>>(r.packages).filter((p) => !!p && typeof p === "object");
  const awbColete = colete.map((p) => text(p.trackingNumber)).filter(Boolean);
  const awb = text(r.shipmentTrackingNumber);

  /*
   * ⚠⚠ UN 201 FARA NUMAR DE EXPEDIERE NU E SUCCES — SI NICI REFUZ.
   *
   * Schema `CreateShipmentResponse` nu are NICIO lista `required`, deci
   * `shipmentTrackingNumber` e optional din punctul ei de vedere. Mai rau: DHL publica sub
   * `'201': description: Shipment Created` un exemplu al carui corp e
   * `{instance, detail, title: Bad request, status: '400', additionalDetails[]}` — un corp de
   * EROARE, validat contra unei scheme care are `additionalProperties: false` si nu contine
   * niciunul dintre acele campuri. Cele doua nu pot fi amandoua adevarate.
   *
   * `eroareNesigura` tine randul blocat si scoate cazul la om, in loc sa lase urmatoarea
   * apasare sa emita al doilea AWB, care nu se mai poate anula.
   */
  if (!awb) {
    throw eroareNesigura(
      "DHL a raspuns fara numar de expediere. NU emite din nou — cauta intai comanda in MyDHL dupa referinta ei, "
      + "fiindca DHL nu are anulare de expediere si un al doilea AWB ramane emis.",
    );
  }

  const documente = documenteleDin(r);
  const dupaTip = (tip: string) => documente.find((d) => text(d.typeCode).toLowerCase() === tip);

  /*
   * ⚠⚠ `documents[].typeCode` NU DEOSEBESTE ETICHETA DE DOCUMENTUL DE TRANSPORT.
   *
   * In DOUA din cele trei exemple oficiale de raspuns, DHL intoarce si `waybillDoc` etichetat
   * `label`: cererea `domesticDocShipmentRequest` cere explicit `typeCode: waybillDoc` si
   * `typeCode: label`, iar raspunsul lor da doua intrari, amandoua `typeCode: label`. Campul
   * e `type: string` fara `enum` in raspuns — nimic nu-l constrange.
   *
   * Consecinta: un `documents.find(d => d.typeCode === 'label')` ia PRIMUL PDF, care poate fi
   * documentul de transport, nu eticheta care se lipeste pe colet.
   *
   * ⚠ De aceea `expediere.ts` cere UN SINGUR tip de document (`label`). Cat timp face asta,
   * potrivirea de mai jos e sigura. Cine adauga vreodata `waybillDoc` la cerere trebuie sa
   * treaca pe `linkLabelsByPieces` + `packageReferenceNumber`, singura cale care le distinge
   * in exemplele lor.
   */
  const eticheta = dupaTip("label")
    ?? documente.find((d) => !TIPURI_FARA_ETICHETA.has(text(d.typeCode).toLowerCase()))
    ?? null;

  const factura = dupaTip("invoice") ?? dupaTip("proforma") ?? null;
  const documentTransport = dupaTip("waybilldoc") ?? null;

  const numarRidicare = text(r.dispatchConfirmationNumber) || null;
  const avertismente = avertismenteleDin(r);

  /*
   * ⚠ AWB EMIS + RIDICARE NEPROGRAMATA e un caz REAL si tacut.
   *
   * Erorile lor de ridicare din interiorul crearii (toate sub `410928`, cu sub-coduri `PU003`,
   * `PU007a`, `PU011b`…) se termina fiecare cu „**No pickup scheduled**", nu cu „no shipment
   * created". Iar `dispatchConfirmationNumber` e descris „**If you asked for pickup service**
   * here you will find…" — deci lipseste si cand n-ai cerut, si cand ai cerut si n-a mers.
   *
   * Singura deosebire e ce am cerut NOI. Fara semnalul asta, comerciantul are eticheta
   * tiparita si asteapta un curier care nu vine.
   */
  const cerutaRidicare = (corp as { pickup?: { isRequested?: unknown } } | null)?.pickup?.isRequested === true;
  if (cerutaRidicare && !numarRidicare) {
    avertismente.push(
      "AWB-ul s-a emis, dar DHL nu a confirmat ridicarea. Programeaza ridicarea separat sau du coletul la un punct DHL.",
    );
  }

  /*
   * ⚠ Doua formate pentru acelasi camp: schema il declara obiect
   * (`{estimatedDeliveryDate, estimatedDeliveryType}`), iar exemplele lor de raspuns il scriu
   * si ca sir (`'2022-12-28T23:59:00Z'`). Se citesc amandoua.
   */
  const edd = r.estimatedDeliveryDate;
  const livrareEstimata = typeof edd === "string"
    ? (edd.trim() || null)
    : (text((edd as Record<string, unknown> | null)?.estimatedDeliveryDate) || null);

  return {
    awb,
    awbColete: awbColete.length > 0 ? awbColete : [awb],
    eticheta: eticheta ? text(eticheta.content) || null : null,
    /* ⚠ Formatul REAL intors, nu cel cerut. Factura si chitanta vin MEREU PDF, chiar daca
       s-a cerut ZPL — deci un raspuns poate amesteca doua formate in acelasi tablou. */
    formatEticheta: eticheta ? (text(eticheta.imageFormat).toUpperCase() || null) : null,
    factura: factura ? text(factura.content) || null : null,
    documentTransport: documentTransport ? text(documentTransport.content) || null : null,
    numarRidicare,
    /*
     * ⚠ Se PASTREAZA, dar nu se cheama niciodata. Exemplul lor pentru `cancelPickupUrl` e
     * `https://express.api.dhl.com/mydhlapi/shipment-pickups/PRG200227000256`, iar calea
     * `shipment-pickups` NU EXISTA in specificatie. Endpointul real e
     * `/pickups/{dispatchConfirmationNumber}` si il compunem noi — vezi `anuleazaRidicarea()`.
     */
    urlAnulareRidicare: text(r.cancelPickupUrl) || null,
    livrareEstimata,
    avertismente,
  };
}

// ─── Urmarirea ───────────────────────────────────────────────────────────────

type EvenimentDhl = {
  cod: string;
  descriere: string;
  /** `YYYY-MM-DDTHH:MM:SS` plus decalajul, cand DHL il da. */
  moment: string;
  /** Momentul in milisecunde, pentru ordonare. `NaN` cand nu se poate citi. */
  cheie: number;
  semnatar: string;
};

/**
 * ⚠ ORDINEA EVENIMENTELOR NU E GARANTATA DE NICAIERI.
 *
 * In exemplele lor evenimentele vin crescator in timp, dar niciun rand din documentatie nu o
 * promite. Cine ia `events[0]` sau `events[events.length - 1]` fara sa se uite la ceas
 * construieste pe un obicei, nu pe un contract — si scrie in baza un status vechi ca fiind
 * cel curent.
 *
 * ⚠ SI DECALAJUL LIPSESTE PE CALEA PE CARE O FOLOSIM. `requestGMTOffsetPerEvent` exista NUMAI
 * pe `/shipments/{n}/tracking` (un singur AWB); `/tracking` (pana la 200) NU-l are. Deci
 * `GMTOffset` poate lipsi de pe fiecare eveniment, si atunci ora e cea LOCALA a fiecarui
 * centru DHL. Cand lipseste, o citim ca UTC — nu ca sa fie exacta, ci ca sa fie COMPARABILA
 * cu ea insasi. Doua evenimente din fusuri diferite se pot inversa intre ele cu cateva ore;
 * pentru intrebarea la care raspundem („care e statusul de acum") asta nu schimba nimic,
 * fiindca evenimentele care conteaza sunt la zile distanta.
 */
function cheiaEvenimentului(data: string, ora: string, decalaj: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return Number.NaN;
  const ceas = /^\d{2}:\d{2}(:\d{2})?$/.test(ora) ? (ora.length === 5 ? `${ora}:00` : ora) : "00:00:00";
  const zona = /^[+-]\d{2}:\d{2}$/.test(decalaj) ? decalaj : "Z";
  const t = Date.parse(`${data}T${ceas}${zona}`);
  return Number.isFinite(t) ? t : Number.NaN;
}

function evenimenteleDin(brute: unknown): EvenimentDhl[] {
  const iesire: EvenimentDhl[] = [];
  for (const e of asTablou<Record<string, unknown>>(brute)) {
    if (!e || typeof e !== "object") continue;
    const cod = text(e.typeCode).toUpperCase();
    const data = text(e.date);
    const ora = text(e.time);
    const decalaj = text(e.GMTOffset);
    if (!cod && !data) continue;
    iesire.push({
      cod,
      descriere: text(e.description),
      moment: data ? `${data}${ora ? `T${ora}` : ""}${/^[+-]\d{2}:\d{2}$/.test(decalaj) ? decalaj : ""}` : "",
      cheie: cheiaEvenimentului(data, ora, decalaj),
      semnatar: text(e.signedBy),
    });
  }
  return iesire;
}

/** Cel mai RECENT eveniment. La chei egale sau necitibile castiga ultimul din tablou. */
function evenimentulCurent(evenimente: EvenimentDhl[]): EvenimentDhl | null {
  let curent: EvenimentDhl | null = null;
  for (const ev of evenimente) {
    if (!curent) { curent = ev; continue; }
    if (Number.isNaN(curent.cheie)) { curent = ev; continue; }
    if (Number.isNaN(ev.cheie)) continue;
    if (ev.cheie >= curent.cheie) curent = ev;
  }
  return curent;
}

function citesteExpedierea(expediere: Record<string, unknown>): UrmarireDhl | null {
  const awb = text(expediere.shipmentTrackingNumber);
  if (!awb) return null;

  const evenimente = evenimenteleDin(expediere.events);
  const curent = evenimentulCurent(evenimente);

  /*
   * ⚠ Data livrarii vine DOAR de la evenimentul `OK`, si numai de la el.
   *
   * `OK` e „Delivery" si e singurul cod de dispozitie finala (ghidul lor, la campul
   * `Signatory`: „only occurs for **final disposition events (such as OK event)**"). `WC`
   * („With delivering courier") inseamna iesit la livrare — e echivalentul lui `type: "D"` de
   * la UPS, cel care a costat acolo. `PD` (livrare partiala) si `DD` (livrat avariat) sunt
   * livrari care CER om; ele nu ajung aici fiindca nu sunt `OK`, iar `eLivrat()` din
   * `statusuri.ts` le respinge oricum explicit.
   */
  const livrari = evenimente.filter((e) => e.cod === "OK");
  const livrat = evenimentulCurent(livrari);

  const coduriAscunse = asTablou<unknown>(expediere.controlledAccessDataCodes)
    .map((x) => text(x).toUpperCase());

  const avertismente = avertismenteleDin(expediere);

  /*
   * ⚠⚠ `shipments[].status` E STATUSUL CERERII, NU AL COLETULUI.
   *
   * Ghidul lor, verbatim: „The Status element consists of a summary ActionStatus field, which
   * describes the success of the service. Expected values for this element are **„Success"**
   * and **„No Shipments Found"**." Iar exemplul din specificatia REST arata chiar
   * `status: Success`.
   *
   * Cine il mapeaza la statusul comenzii scrie „Success" in baza pentru fiecare colet. Statusul
   * real e NUMAI in `events[].typeCode`.
   */
  const stareaCererii = text(expediere.status);
  if (/no\s+shipments?\s+found/i.test(stareaCererii)) return null;
  if (stareaCererii && !/^success$/i.test(stareaCererii)) {
    avertismente.push(`DHL a raspuns cu starea cererii „${stareaCererii}” pentru AWB-ul ${awb}.`);
  }
  if (evenimente.length === 0) {
    avertismente.push(`DHL cunoaste AWB-ul ${awb} dar n-a inregistrat inca niciun eveniment pe el.`);
  }

  return {
    awb,
    cod: curent?.cod || null,
    descriere: curent?.descriere || null,
    livratLa: livrat?.moment || null,
    /*
     * ⚠ SEMNATURA SE CITESTE DOAR DE PE EVENIMENTELE DE LIVRARE, nu de pe toate.
     *
     * Prima varianta scria `evenimente.some((e) => e.semnatar.length > 0)`, adica „a semnat
     * cineva, undeva, candva". Dar semnatura apare — prin chiar documentatia lor — la fiecare
     * „final disposition event", iar predarea coletului INAPOI la expeditor (`RT`) e si ea o
     * dispozitie finala si e si ea semnata. Steagul iesea `true` pe un colet returnat, si de
     * acolo `eLivrat()` trecea comanda pe „Livrata".
     *
     * `eLivrat` are acum si el o garda proprie (nu mai lasa dovada sa rastoarne un cod
     * cunoscut), dar CAMPUL trebuie sa fie adevarat prin el insusi: numele lui spune „dovada
     * LIVRARII", si asa il va citi si urmatorul care se uita aici.
     */
    areDovadaLivrarii: livrari.some((e) => e.semnatar.length > 0),
    semnaturaMascata: coduriAscunse.includes("SIGN_NM"),
    livrareEstimata: text(expediere.estimatedDeliveryDate) || null,
    avertismente,
  };
}

/**
 * Parametrii comuni ai celor doua cautari de urmarire.
 *
 * ⚠ TOATE TREI SUNT OBLIGATORII DIN PARTEA NOASTRA, si niciunul nu e obligatoriu la ei:
 *
 *   `levelOfDetail=all` — implicitul lor e `shipment`, si atunci `pieces[]` LIPSESTE TACIT,
 *      cu 200 OK. Pe expedieri cu mai multe colete nu vezi niciodata evenimentele per colet.
 *   `trackingView=all-checkpoints-with-remarks` — implicitul `all-checkpoints` NU aduce
 *      remarcile, adica exact textul care explica omului ce s-a intamplat.
 *   `requestControlledAccessDataCodes=true` — fara el nu poti deosebi „semnatura ascunsa din
 *      GDPR" de „nu s-a semnat". Vezi `UrmarireDhl.semnaturaMascata`.
 */
function parametriiUrmaririi(cerere: URLSearchParams): void {
  cerere.set("levelOfDetail", "all");
  cerere.set("trackingView", "all-checkpoints-with-remarks");
  cerere.set("requestControlledAccessDataCodes", "true");
}

/**
 * `GET /tracking?shipmentTrackingNumber=…` — pana la 200 pe cerere.
 *
 * ⚠ `404` inseamna „nu exista date", nu exceptie: se intoarce lista goala si apelantul
 * decide. Un AWB proaspat poate lipsi cateva ore, iar in mediul de test AWB-urile create de
 * noi nu sunt urmaribile DELOC.
 */
export async function urmareste(config: DhlConfig, awburi: string[]): Promise<UrmarireDhl[]> {
  const numere = [...new Set((awburi ?? []).map((a) => (a ?? "").trim()).filter(Boolean))];
  if (numere.length === 0) return [];

  const iesire: UrmarireDhl[] = [];

  /*
   * ⚠ Se imparte in transe si aici, nu doar in cron. Cronul foloseste `MAX_AWB_PE_CERERE`
   * pentru contabilitatea lui de plafon, dar un apelant care ar trimite 500 de numere n-ar
   * primi o eroare de la DHL — ar primi tacut doar primele 200, si restul comenzilor ar parea
   * nemiscate la nesfarsit.
   */
  for (let i = 0; i < numere.length; i += MAX_AWB_PE_CERERE) {
    const transa = numere.slice(i, i + MAX_AWB_PE_CERERE);
    const cerere = new URLSearchParams();
    /* ⚠ `explode: true` in schema lor: parametrul se REPETA, nu se leaga cu virgule. */
    for (const n of transa) cerere.append("shipmentTrackingNumber", n);
    parametriiUrmaririi(cerere);

    let r: Record<string, unknown>;
    try {
      r = await apel<Record<string, unknown>>(
        config, "GET", `/tracking?${cerere.toString()}`, { efect: "citire" },
      );
    } catch (e) {
      if (statusEroare(e) === 404) continue;
      throw e;
    }

    for (const expediere of asTablou<Record<string, unknown>>(r.shipments)) {
      if (!expediere || typeof expediere !== "object") continue;
      const citit = citesteExpedierea(expediere);
      /* ⚠ Un rezultat fara numar n-are ce scrie pe nicio comanda. Nu intra in lista. */
      if (citit) iesire.push(citit);
    }
  }

  return iesire;
}

/**
 * „Am trimis si n-am primit raspuns — s-a creat sau nu?"
 *
 * ⚠⚠ E SINGURA CALE INAPOI. DHL nu are idempotenta, nu are anulare si nu are niciun cod de
 * „duplicate shipment" (cautat exhaustiv: `duplicate`, `already exist`, `already been created`,
 * `idempot` — toate cele 17 potriviri se refera la campuri duplicate INAUNTRUL cererii). Fara
 * cautarea asta, orice 500 lasa comanda blocata definitiv.
 *
 * ⚠ FEREASTRA DE TIMP E OBLIGATORIE, desi schema o declara `required: false`. Verbatim:
 * „**When tracking by Shipment reference you need to restrict the search by timeframe.**"
 *
 * ⚠ CONTUL E OBLIGATORIU, tot desi schema il declara `required: false`. Dovada e propriul lor
 * exemplu de 400: `detail: 'Missing mandatory parameters: shipperAccountNumber'`. Se valideaza
 * in cod, ca sa nu plece o cerere care sigur cade.
 *
 * ⚠⚠ `negasit: true` NUMAI PE 404 DOVEDIT — si asta e cea mai importanta linie din functie.
 * O lista goala pe un 200 poate fi o expediere reala care inca n-a fost scanata de nimeni;
 * citita ca „nu exista", ea deblocheaza exact reincercarea care emite al doilea AWB. Nici
 * macar `status: "No Shipments Found"` din corp nu urca la `negasit` — 404-ul e singurul lucru
 * pe care ei il documenteaza ca raspuns de „nu am gasit"
 * (`detail: 'No Shipments Found for ReferenceID | …'`, `status: '404'`).
 */
export async function cautaDupaReferinta(
  config: DhlConfig,
  referinta: string,
  deLa: Date,
  panaLa: Date,
): Promise<{ gasite: UrmarireDhl[]; negasit: boolean }> {
  const ref = (referinta ?? "").trim();
  if (!ref) throw eroareRefuz("Nu pot cauta expedierea la DHL fara referinta comenzii.");

  const cont = (config.account_number ?? "").trim();
  if (!cont) {
    throw eroareRefuz(
      "Cautarea dupa referinta cere numarul de cont DHL Express. Completeaza-l in configurare inainte de a incerca din nou.",
    );
  }

  const cerere = new URLSearchParams({
    shipmentReference: ref,
    /* `CU` = „Consignor reference number", exact tipul cu care am trimis-o la emitere. */
    shipmentReferenceType: "CU",
    shipperAccountNumber: cont,
    dateRangeFrom: ziuaDhl(deLa),
    /* ⚠ O zi de rezerva: momentul expedierii poate fi in viitor (DHL accepta 10 zile). */
    dateRangeTo: ziuaDhl(new Date(panaLa.getTime() + 24 * 3600 * 1000)),
  });
  parametriiUrmaririi(cerere);

  try {
    const r = await apel<Record<string, unknown>>(
      config, "GET", `/tracking?${cerere.toString()}`, { efect: "citire" },
    );
    const gasite: UrmarireDhl[] = [];
    for (const expediere of asTablou<Record<string, unknown>>(r.shipments)) {
      if (!expediere || typeof expediere !== "object") continue;
      const citit = citesteExpedierea(expediere);
      if (citit) gasite.push(citit);
    }
    return { gasite, negasit: false };
  } catch (e) {
    if (statusEroare(e) === 404) return { gasite: [], negasit: true };
    throw e;
  }
}

// ─── Reimprimarea documentelor ───────────────────────────────────────────────

/**
 * Tipurile de document pe care le da `get-image`.
 *
 * ⚠⚠ `label` NU E IN LISTA, si asta schimba arhitectura.
 *
 * Enumerarea lor e exact asta, iar descrierea endpointului o confirma: „retrieve customer's
 * own uploaded or DHL generated **Commercial Invoice, Waybill Document or other supporting
 * documents**". `waybill` inseamna documentul de INSOTIRE (waybillDoc), NU eticheta lipita pe
 * colet.
 *
 * Deci: eticheta de transport a unui AWB deja emis NU SE POATE RECUPERA de la DHL. Base64-ul
 * din `documents[]` al raspunsului de la `POST /shipments` e singura ocazie de a-l avea — de
 * aceea exista `public.dhl_etichete`, si de aceea o eticheta pierduta de noi nu se mai poate
 * reface fara sa se emita (si sa se poata plati) o a doua expediere.
 */
const TIPURI_IMAGINE = new Set([
  "waybill",
  "commercial-invoice",
  "customs-entry",
  "transport-accompanying-document",
  "generic-entry-summary",
  "dhl-issued-proforma-invoice",
]);

/**
 * `GET /shipments/{awb}/get-image`.
 *
 * ⚠ Implicitul e `waybill` fiindca `label` nu exista in enumerarea lor (vezi `TIPURI_IMAGINE`).
 *
 * ⚠ `pickupYearAndMonth` e OBLIGATORIU si nu se poate ghici — vezi `lunaRidicare()`.
 *
 * ⚠ `encodingFormat` de AICI e `pdf|tiff`, NU `pdf|zpl|lp2|epl`. Nu exista iesire termica din
 * `get-image`: un ZPL emis la creare nu se mai poate obtine niciodata, nici macar pentru
 * documentul de transport.
 */
export async function reimprimaEticheta(
  config: DhlConfig,
  awb: string,
  lunaRidicare: string,
  tip: string = "waybill",
): Promise<EtichetaReimprimata> {
  const numar = (awb ?? "").trim();
  if (!numar) throw eroareRefuz("Nu pot cere documentul de la DHL fara numarul de expediere.");

  const luna = (lunaRidicare ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(luna)) {
    throw eroareRefuz(
      "DHL cere luna ridicarii (AAAA-LL) ca sa gaseasca documentul, si noi n-o avem pentru expedierea asta. "
      + "Foloseste copia pastrata la emitere.",
    );
  }

  const tipCerut = (tip ?? "").trim().toLowerCase();
  if (!TIPURI_IMAGINE.has(tipCerut)) {
    throw eroareRefuz(
      `DHL nu are tipul de document „${tip}”. Eticheta de transport NU se poate recupera de la ei — `
      + "foloseste copia pastrata la emitere.",
    );
  }

  const cerere = new URLSearchParams({
    typeCode: tipCerut,
    pickupYearAndMonth: luna,
    encodingFormat: "pdf",
  });
  /* ⚠ „Either one of shipper or payer account number is required." */
  const cont = (config.account_number ?? "").trim();
  if (cont) cerere.set("shipperAccountNumber", cont);

  let r: Record<string, unknown>;
  try {
    r = await apel<Record<string, unknown>>(
      config, "GET",
      `/shipments/${encodeURIComponent(numar)}/get-image?${cerere.toString()}`,
      { efect: "citire" },
    );
  } catch (e) {
    /*
     * ⚠ `1504` nu e un defect tehnic, e un raspuns: „No document images found for the provided
     * search criteria." Omul trebuie sa afle ce sa faca, nu sa citeasca un cod.
     */
    if (codEroare(e) === "1504" || statusEroare(e) === 404) {
      throw eroareRefuz(
        "DHL nu mai are documentul cerut pentru expedierea asta. Foloseste copia pastrata la emitere.",
      );
    }
    throw e;
  }

  for (const d of asTablou<Record<string, unknown>>(r.documents)) {
    if (!d || typeof d !== "object") continue;
    const continut = text(d.content);
    if (!continut) continue;
    /* ⚠ „PDF, TIFF, **or ZIP**" — se scrie ce au intors, nu ce s-a cerut. */
    return { continut, format: text(d.encodingFormat).toUpperCase() || "PDF" };
  }

  throw eroareRefuz(
    "DHL a raspuns fara niciun document pentru expedierea asta. Foloseste copia pastrata la emitere.",
  );
}

/**
 * `GET /shipments/{awb}/proof-of-delivery` — dovada electronica a livrarii, PDF in base64.
 *
 * ⚠ CONTUL E OBLIGATORIU PENTRU VARIANTELE „detail", si regula NU e in OpenAPI. Ea sta doar in
 * ghidul lor, cu majuscule in original: „PLEASE NOTE THAT ACCOUNT NUMBER MUST BE PROVIDED TO
 * REQUEST FOR DETAIL EPOD". Cu implicitul `epod-summary` nu e nevoie de cont; cerut
 * `epod-detail` fara el, cade.
 *
 * ⚠ `404` IN PRIMELE 24 DE ORE E NORMAL, nu defect: „The digital signature is available **the
 * next day after delivery**." De aceea se intoarce `null`, nu o eroare — altfel fiecare comanda
 * livrata azi ar aparea ca esec.
 *
 * ⚠ Sufixul `-esig` NU garanteaza semnatura: „All the output types above will return ePOD with
 * eSIG (**if the eSIG is available**), else ePOD without eSIG will be returned." Adica primesti
 * 200 cu acelasi PDF, fara ea. Nu se poate deduce din codul HTTP daca ai semnatura.
 */
export async function dovadaLivrarii(config: DhlConfig, awb: string): Promise<DovadaLivrare | null> {
  const numar = (awb ?? "").trim();
  if (!numar) return null;

  const cont = (config.account_number ?? "").trim();
  if (!cont) {
    throw eroareRefuz(
      "Dovada livrarii cere numarul de cont DHL Express. Completeaza-l in configurare.",
    );
  }

  const cerere = new URLSearchParams({ shipperAccountNumber: cont, content: "epod-detail" });

  let r: Record<string, unknown>;
  try {
    r = await apel<Record<string, unknown>>(
      config, "GET",
      `/shipments/${encodeURIComponent(numar)}/proof-of-delivery?${cerere.toString()}`,
      { efect: "citire" },
    );
  } catch (e) {
    if (statusEroare(e) === 404) return null;
    throw e;
  }

  for (const d of asTablou<Record<string, unknown>>(r.documents)) {
    if (!d || typeof d !== "object") continue;
    const continut = text(d.content);
    if (!continut) continue;
    return { continut, format: text(d.encodingFormat).toUpperCase() || "PDF" };
  }
  return null;
}

// ─── Anularea RIDICARII (singura anulare care exista) ────────────────────────

/**
 * `DELETE /pickups/{dispatchConfirmationNumber}`.
 *
 * ⚠⚠ ASTA NU ANULEAZA EXPEDIEREA. `delete:` apare O SINGURA data in toata specificatia lor, si
 * aceea aici. Se anuleaza ridicarea programata; AWB-ul ramane emis. Ghidul SOAP e limpede
 * despre ce se intampla cu el: „Any shipment manifest data which was included in the original
 * ShipmentRequest will not be deleted as part of this operation but **will not become an active
 * shipment if the shipment label does not enter the DHL Network**." Adica expedierea nu se
 * anuleaza — pur si simplu nu devine activa.
 *
 * ⚠ AMANDOI parametrii sunt `required: true`, si amandoi in interogare. Iar cheia din OpenAPI e
 * `pickupReason` in timp ce numele parametrului e `reason` — in adresa pleaca `reason=`.
 *
 * ⚠⚠ `400` ACOPERA DOUA CAZURI SEMANTIC OPUSE: „Pickup already cancelled or completed" si
 * „Wrong input parameters". Distinctia se face DOAR citind `detail` — exact lectia din
 * registrul de operatii externe („esuat" ≠ „necunoscut").
 */
export async function anuleazaRidicarea(
  config: DhlConfig,
  numarRidicare: string,
  motiv: string,
  cerutDe: string,
): Promise<RezultatAnulareRidicare> {
  const numar = (numarRidicare ?? "").trim();
  if (!numar) return { anulat: false, mesaj: "Comanda n-are numar de ridicare DHL, deci n-are ce anula." };

  /*
   * ⚠ Amandoua sunt text liber la ei, folosit doar in propriul lor jurnal de audit. Trimise
   * goale, dau un 400 („Missing mandatory parameters: requestorName") a carui unica reparatie
   * e o valoare pe care o putem pune noi. Rezervele de aici nu ascund nimic — spun cine si de ce.
   */
  const cerere = new URLSearchParams({
    requestorName: (cerutDe ?? "").trim() || PLATFORMA,
    reason: (motiv ?? "").trim() || "Anulare ceruta de comerciant",
  });

  try {
    await apel<Record<string, unknown>>(
      config, "DELETE", `/pickups/${encodeURIComponent(numar)}?${cerere.toString()}`,
      /* ⚠ `200 Pickup cancelled` vine FARA corp. Fara steagul asta, succesul ar iesi „nu stim". */
      { efect: "scriere", acceptaGol: true },
    );
    return { anulat: true, mesaj: "Ridicarea a fost anulata la DHL." };
  } catch (e) {
    const status = statusEroare(e);
    const mesaj = (e as Error).message;

    /*
     * ⚠ SE CITESTE DOAR PARTEA DE DUPA ADRESA, si asta a fost o regresie proprie prinsa la a
     * doua trecere. Mesajul are forma `DHL DELETE /pickups/…?requestorName=…&reason=…: <textul
     * lor>`, iar MOTIVUL e scris de comerciant si calatoreste in interogare. Un motiv de forma
     * „already cancelled by customer" ar fi facut ca un 400 de parametri gresiti — un defect
     * real, care trebuie sa iasa la om — sa fie raportat drept „ridicarea era deja anulata".
     * Interogarea e codificata (spatiul devine `+`, doua puncte devin `%3A`), deci primul
     * `": "` din mesaj e chiar granita dintre adresa noastra si textul lor.
     */
    const granita = mesaj.indexOf(": ");
    const detaliu = granita >= 0 ? mesaj.slice(granita + 2) : mesaj;

    /*
     * ⚠ „Deja anulata SAU deja efectuata" — si nu se pot deosebi din raspunsul lor: acelasi
     * `400` acopera amandoua, plus „Wrong input parameters". Nu spunem „anulat" pentru ceva ce
     * nu putem dovedi: daca soferul a venit deja, coletul e la DHL.
     * Omul primeste amandoua posibilitatile si se uita in MyDHL.
     */
    if (status === 400 && /already|complet/i.test(detaliu)) {
      return {
        anulat: false,
        mesaj: "DHL spune ca ridicarea e deja anulata SAU deja efectuata — cele doua nu se pot deosebi din raspunsul lor. Verifica in MyDHL.",
      };
    }
    if (status === 404) {
      return {
        anulat: false,
        mesaj: "DHL nu gaseste ridicarea cu numarul asta. Verifica in MyDHL daca mai e programata.",
      };
    }
    throw e;
  }
}

// ─── Pagina publica de urmarire ──────────────────────────────────────────────

/**
 * Pagina pe care o deschide cumparatorul.
 *
 * ⚠ SE COMPUNE, NU SE CITESTE DIN RASPUNS. `trackingUrl` exista in raspunsul lor de emitere,
 * dar exemplele lui sunt `https://expressapi.dhl.com/mydhlapi/shipments/1103733901/tracking` —
 * adica CHIAR ENDPOINTUL DE API, care cere `Authorization: Basic`. Trimis unui cumparator, el
 * primeste un 401. (Si gazda din exemple, `expressapi.dhl.com`, nu se potriveste nici macar cu
 * cea din schema lor, `express.api.dhl.com`.)
 *
 * ⚠ Regula generala confirmata pe trei campuri: `cancelPickupUrl` trimite la o cale
 * `/shipment-pickups/` care nu exista, iar `trackingUrl` pe colet foloseste un parametru
 * (`PieceID`) care in specificatie se numeste altfel (`pieceTrackingNumber`). Adresele din
 * raspunsurile lor nu se urmeaza.
 */
export function linkUrmarire(awb: string): string {
  return `https://www.dhl.com/ro-ro/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(awb)}`;
}

// ─── Proba de conexiune ───────────────────────────────────────────────────────

/** Serviciile cu valoare adaugata din devizul unei oferte brute. */
export function serviciileDin(produsBrut: unknown): ServiciuOferta[] {
  if (!produsBrut || typeof produsBrut !== "object") return [];
  const p = produsBrut as Record<string, unknown>;
  const iesire: ServiciuOferta[] = [];
  const vazute = new Set<string>();

  for (const bloc of asTablou<Record<string, unknown>>(p.detailedPriceBreakdown)) {
    if (!bloc || typeof bloc !== "object") continue;
    for (const linie of asTablou<Record<string, unknown>>(bloc.breakdown)) {
      if (!linie || typeof linie !== "object") continue;
      const cod = text(linie.serviceCode).toUpperCase();
      if (!cod || vazute.has(cod)) continue;
      vazute.add(cod);
      iesire.push({
        cod,
        nume: numeServiciu(cod, text(linie.name)),
        tip: text(linie.serviceTypeCode).toUpperCase(),
        /* ⚠ „serviciul CERE un acord prealabil", NU „contul tau il are". */
        cereContract: linie.isCustomerAgreement === true,
      });
    }
  }
  return iesire;
}

/**
 * Proba de conexiune.
 *
 * ⚠ NU se opreste la „am primit un raspuns", si nu cheama niciun nomenclator public.
 *
 * `GET /reference-data` ar fi fost tentant: intoarce codurile de produs si de eveniment, e in
 * acelasi API si raspunde repede. Dar el accepta si `X-API-KEY` pe langa `basicAuth` si nu
 * atinge deloc contul comerciantului — o proba pe el ar fi raspuns „conexiune reusita" unui
 * magazin al carui cont nu poate cota nimic. Exact defectul fGO din 15.08.2026, unde „Testeaza
 * conexiunea" chema un nomenclator PUBLIC si trecea cu credentiale inventate.
 *
 * Deci: o cotare REALA, de la expeditorul lui catre el insusi, cu contul lui. Nu creeaza nimic
 * si nu costa nimic, dar poate ESUA — cu credentiale gresite da 401, cu un cont care nu e al
 * lor da `998`/`8003`.
 */
export async function probaConexiune(config: DhlConfig, corpCotare: unknown): Promise<ProbaDhl> {
  const mediu: MediuDhl = config.mediu === "test" ? "test" : "productie";

  let oferte: unknown[];
  let avertismente: string[];
  try {
    ({ oferte, avertismente } = await tarife(config, corpCotare));
  } catch (e) {
    return {
      mediu,
      cotare: { ok: false, mesaj: (e as Error).message, produse: [], valuta: null, alerte: [], cerContract: [] },
      ramburs: {
        ok: false,
        mesaj: "Nu s-a putut verifica rambursul: nici cotarea n-a mers. Repara intai conexiunea.",
      },
    };
  }

  const produse: { cod: string; nume: string }[] = [];
  const valute = new Set<string>();
  const cerContract: string[] = [];
  const coduriServicii = new Set<string>();

  for (const brut of oferte) {
    if (!brut || typeof brut !== "object") continue;
    const o = brut as Record<string, unknown>;

    const cod = text(o.productCode).toUpperCase();
    const nume = numeProdus(cod, text(o.productName));
    if (cod && !produse.some((x) => x.cod === cod)) produse.push({ cod, nume });
    if (o.isCustomerAgreement === true && !cerContract.includes(nume)) cerContract.push(nume);

    /*
     * ⚠ VALUTA SE IA DIN `BILLC`, si numai din ea. `totalPrice[]` e un TABLOU cu ACELASI
     * transport exprimat in mai multe valute deodata: `BILLC` = valuta de facturare a contului,
     * `PULCL` = tariful PUBLIC al tarii (adica pretul de lista, nu contractul tau), `BASEC` =
     * valuta de baza, care e „either USD or EUR" si deci nu va fi niciodata RON.
     * Citit primul element la intamplare, acelasi transport iese cand 250 RON, cand 50 EUR.
     */
    for (const p of asTablou<Record<string, unknown>>(o.totalPrice)) {
      if (!p || typeof p !== "object") continue;
      if (text(p.currencyType).toUpperCase() !== "BILLC") continue;
      const v = text(p.priceCurrency).toUpperCase();
      if (v) valute.add(v);
    }

    for (const s of serviciileDin(o)) coduriServicii.add(s.cod);
  }

  const cotare: ProbaDhl["cotare"] = {
    ok: produse.length > 0,
    mesaj: produse.length > 0
      ? `DHL a raspuns cu ${produse.length} ${produse.length === 1 ? "produs" : "produse"} pentru adresa configurata.`
      : "DHL a raspuns, dar n-a intors niciun produs pentru adresa de expeditie configurata. Verifica orasul si codul postal (in Romania are 6 cifre).",
    produse,
    valuta: valute.size > 0 ? [...valute].join(", ") : null,
    alerte: avertismente,
    cerContract,
  };

  /*
   * ⚠⚠ RAMBURSUL. Vezi nota lunga de pe `ProbaDhl.ramburs`.
   *
   * Cand `KB` NU apare, mesajul trebuie sa-i spuna omului DE CE, nu doar „nu" — altfel el va
   * cauta luni de zile un buton care nu exista, sau va crede ca integrarea e stricata.
   * Cand APARE, mesajul e o ALERTA: contrazice patru dovezi independente si merita verificat
   * cu DHL inainte de a se baza cineva pe el.
   */
  const areRamburs = coduriServicii.has(COD_RAMBURS);
  const ramburs: ProbaDhl["ramburs"] = areRamburs
    ? {
      ok: true,
      mesaj:
        `⚠ DHL a intors serviciul de plata la livrare (${COD_RAMBURS}) pentru contul tau. E neasteptat: `
        + "DHL Express nu vinde ramburs cu origine Romania in niciuna dintre sursele lor comerciale. "
        + "Confirma cu reprezentantul tau DHL inainte de a te baza pe el.",
    }
    : {
      ok: false,
      mesaj:
        "DHL Express nu vinde plata la livrare (ramburs) cu origine Romania — serviciul nu apare in catalogul lor "
        + "romanesc, nici pentru contul tau. De aceea DHL nu va aparea in checkout pe comenzile cu plata la livrare. "
        + "Nu e o defectiune si nu se poate porni din configurare.",
    };

  return { mediu, cotare, ramburs };
}
