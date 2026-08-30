import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";

/**
 * Clientul SmartShip.ro.
 *
 * ═══ CE E ═══
 *
 * Un BROKER, ca Woot, Colete Online, eColet si Innoship: un singur cont, mai
 * multi curieri, un singur tarif negociat de ei. In plus fata de ceilalti are
 * doua lucruri pe care nu le mai are nimeni din platforma:
 *
 *   - **contract propriu (BYOC)**: comerciantul isi poate lega PROPRIILE conturi
 *     de curier si sa emita pe ele, prin acelasi API. Atunci acelasi curier apare
 *     de doua ori la cotare — o data pe contractul lui, o data pe al SmartShip —
 *     si se deosebesc dupa `own_contract: true`;
 *   - **oferte de transport pentru marfa grea**, cerute de la un OM si primite
 *     peste ore sau zile. Vezi `ofertaTransport` mai jos.
 *
 * ═══ ⚠ RASPUNSUL SE CITESTE DE DOUA ORI: HTTP, SI CAMPUL `status` DIN CORP ═══
 *
 * Documentatia lor nu pomeneste niciun cod HTTP. TOATE exemplele de raspuns au in
 * schimb `"status": 200` in CORP, iar erorile sunt numere care nu pot fi coduri
 * HTTP (999, 605, 6589, 9855) amestecate cu numere care seamana cu ele (403, 404,
 * 409, 410, 422). Deci nu se stie dinainte pe ce cale soseste refuzul.
 *
 * Un client care s-ar uita doar la `res.ok` ar citi drept SUCCES un „credit
 * insuficient" servit cu HTTP 200 — si ar scrie pe comanda un AWB inexistent.
 * Unul care s-ar uita doar la corp ar crapa pe un 502 al proxy-ului lor.
 *
 * Aici se citesc amandoua: HTTP intai (acolo unde chiar e o eroare de transport),
 * apoi `status` din corp. Vezi si nota din `fgo-test-conexiune` — „citeste
 * raspunsul PE DOS" e clasa de defecte care ne-a mai costat o zi.
 *
 * ═══ ⚠ `pdf_link` DIN RASPUNSUL DE EMITERE CONTINE CHEIA DE API ═══
 *
 * Exemplul lor e literal: `https://smartship.ro/api/CHEIA_TA_API/print/8741…`.
 * Adica un link care, pus intr-un `href` sau salvat pe comanda, publica
 * credentiala magazinului catre oricine deschide pagina sau se uita in baza.
 *
 * De aceea `pdf_link` NU se salveaza si NU se trimite niciodata catre browser.
 * Eticheta se ia cu `eticheta()` de mai jos, care trimite cheia in ANTET, iar
 * PDF-ul urca la comerciant prin serverul nostru.
 */

/** Singura gazda. Nu exista mediu de proba: orice emitere e reala si facturata. */
const BAZA = "https://api.smartship.ro";

/** Citirile din calea cumparatorului: cotare, nomenclatoare, lockere. */
const ASTEPTARE_MS = 20_000;
/** Emiterea, anularea si etichetele: pornite de comerciant, isi permit mai mult. */
const ASTEPTARE_EMITERE_MS = 45_000;

// ─── Statusul si codul, pastrate PE eroare ────────────────────────────────────

/**
 * Statusul HTTP, pastrat pe eroare — acelasi tipar ca la eColet, Pall-Ex, Posta si
 * Innoship: cine trateaza „nu exista acolo" altfel decat un refuz oarecare are
 * nevoie de numar, iar numarul nu trebuie cautat in textul erorii.
 */
const CHEIE_STATUS = "statusHttp" as const;
/**
 * Codul din CORPUL raspunsului (999, 605, 205…). Pastrat separat de cel HTTP,
 * fiindca sunt spatii de numere diferite care se pot ciocni: 403 al lor e „acces
 * BYOC respins", nu neaparat un 403 de HTTP.
 */
const CHEIE_COD = "codSmartship" as const;

export function statusEroare(e: unknown): number | null {
  const v = (e as { [CHEIE_STATUS]?: unknown } | null)?.[CHEIE_STATUS];
  return typeof v === "number" ? v : null;
}

export function codEroare(e: unknown): number | null {
  const v = (e as { [CHEIE_COD]?: unknown } | null)?.[CHEIE_COD];
  return typeof v === "number" ? v : null;
}

function insemneaza(e: Error, status: number | null, cod: number | null): Error {
  const cu = e as Error & { [CHEIE_STATUS]?: number; [CHEIE_COD]?: number };
  if (status !== null) cu[CHEIE_STATUS] = status;
  if (cod !== null) cu[CHEIE_COD] = cod;
  return e;
}

// ─── Codurile lor de eroare ───────────────────────────────────────────────────

/**
 * Tabelul de coduri, transcris din documentatie endpoint cu endpoint.
 *
 * ⚠ Textul e AL NOSTRU, si dinadins: al lor e o propozitie de referinta („Not
 * enough credits"), nu un indrumar. Comerciantul care vede mesajul trebuie sa
 * stie ce are de FACUT, nu doar ce s-a intamplat — vezi `mesajBlocat` din
 * registrul de operatii externe, unde lectia a fost aceeasi.
 *
 * ⚠ Un cod care e AICI inseamna ca SmartShip a primit cererea, a inteles-o si a
 * raspuns cu un motiv — deci e un refuz DOVEDIT si reincercarea e sigura. Un cod
 * necunoscut NU se presupune: iese `necunoscut`, blocheaza, si se lamureste cu
 * `cautaDupaComanda()`. Vezi `verdictCod`.
 */
export const CODURI: Record<number, string> = {
  201: "IBAN-ul pentru ramburs nu e valid. Verifica-l in configurarea SmartShip — se valideaza la fiecare cerere, nu doar la salvare.",
  205: "AWB-ul era deja anulat.",
  206: "Expedierea nu mai poate fi anulata: coletul a fost deja ridicat sau livrat.",
  220: "Curierul asta nu permite anularea prin API. Anuleaza expedierea din contul SmartShip.",
  301: "SmartShip a respins cererea: cheia de API e gresita, sau AWB-ul nu exista in contul tau.",
  302: "AWB-ul nu e de la FedEx, iar programarea ridicarii se poate face doar la FedEx.",
  305: "Exista deja o ridicare programata pentru AWB-ul asta. SmartShip accepta una singura.",
  403: "Contractul propriu (BYOC) nu e disponibil pe contul tau.",
  404: "Solicitarea nu exista in contul tau.",
  409: "Oferta nu mai poate fi acceptata sau refuzata.",
  410: "Oferta a expirat.",
  422: "Greutatea e sub pragul minim pentru o oferta de transport. Sub prag se foloseste emiterea obisnuita.",
  601: "Curierul ales nu e in lista celor acceptate de SmartShip.",
  602: "Curierul ales nu e disponibil in acest moment. Alege altul sau reia mai tarziu.",
  603: "Niciun curier nu poate prelua expedierea cu datele astea.",
  605: "Credit insuficient in contul SmartShip. Alimenteaza contul si reia.",
  606: "Curierul ales nu accepta ramburs (de exemplu FedEx). Alege alt curier sau scoate rambursul.",
  608: "Curierul a refuzat anularea — cel mai probabil coletul e deja ridicat.",
  612: "Lockerul ales nu e valid. Alege alt locker; SmartShip nu coteaza livrarea la adresa in locul lui.",
  699: "Curierul ales nu accepta colet la schimb. Accepta doar PTT Express si SmartShip Delivery.",
  806: "Lipseste lockerul, sau id-ul lui nu e valid.",
  998: "FedEx n-a confirmat intervalul. Reia cu un interval din lista de disponibilitate.",
  999: "Datele trimise n-au trecut validarea SmartShip.",
  4004: "Pe contract propriu easybox nu e curier separat: se emite cu SameDay si lockerul ales.",
  4050: "Komy nu accepta expedieri cu ramburs.",
  6589: "Lockerul ales nu e disponibil momentan. Alege altul.",
  6590: "Lockerul ales nu accepta plata ramburs. Alege alt locker sau scoate rambursul.",
  9855: "SmartShip n-a putut calcula costul pentru curierul ales. Verifica datele si disponibilitatea rutei.",
};

/** Codul „a mers" din corpul lor. Orice altceva e un refuz sau o necunoscuta. */
const COD_OK = 200;

/**
 * Verdictul pentru un cod din CORPUL raspunsului.
 *
 * ⚠ Regula: un cod pe care il RECUNOASTEM e un refuz dovedit — ei au raspuns si
 * au numit motivul, deci nu s-a creat nimic. Un cod pe care NU-l recunoastem
 * ramane `necunoscut`, oricat de plauzibil ar arata: n-avem de unde sti daca
 * expedierea exista sau nu, iar la SmartShip diferenta costa un colet platit de
 * doua ori.
 *
 * Nu e o prudenta scumpa: `cautaDupaComanda()` lamureste cazul cu o CITIRE, deci
 * blocajul are iesire fara ca omul sa presupuna nimic.
 */
export function verdictCod(cod: number | null): "esuat" | "necunoscut" {
  if (cod === null) return "necunoscut";
  return CODURI[cod] !== undefined ? "esuat" : "necunoscut";
}

// ─── Configurarea ─────────────────────────────────────────────────────────────

/**
 * Expeditorul, asa cum il cere fiecare cerere.
 *
 * ⚠ `city` e un ID NUMERIC din nomenclatorul lor (`/geolocation/cities`), nu un
 * nume. Se completeaza cel mai bine cu butonul „Incarca expeditorii", care il
 * aduce gata din contul comerciantului (`/account/senders` intoarce chiar
 * `localitate_id`) — scris de mana, un id gresit trimite coletul in alt oras
 * fara nicio eroare.
 */
export type ExpeditorSmartship = {
  name: string;
  address: string;
  email?: string;
  /** Id-ul localitatii din `/geolocation/cities`. */
  city: number;
  phone: string;
  /** Cod de tara. Pentru livrari interne: `RO`. */
  country?: string;
  /** ⚠ Doar pentru Bucuresti: 1-6. In rest 0. Niciodata ghicit. */
  sector?: number;
};

export type SmartshipConfig = {
  enabled: boolean;
  /** Trimisa ca `X-API-KEY`. Criptata in repaus, mascata in formular. */
  api_key: string;
  /** Adresa de ridicare. Fara ea nu se poate nici cota, nici emite. */
  expeditor?: ExpeditorSmartship;
  /**
   * IBAN-ul pe care SmartShip vireaza rambursul.
   *
   * ⚠ NU e secret si NU se mascheaza: comerciantul trebuie sa-l poata reciti ca
   * sa verifice ca banii ajung unde trebuie. Acelasi rationament ca la
   * `posta_config.cod_trimitere`.
   *
   * ⚠ E OBLIGATORIU cand comanda are ramburs, si se valideaza la FIECARE cerere
   * — inclusiv la cotare. Fara el, o comanda cu plata la livrare nu poate primi
   * niciun pret real.
   */
  iban?: string;
  /**
   * Curierii pe care comerciantul ii lasa sa apara in checkout (`courier_id`).
   * Gol = toti cei pe care ii intoarce contul.
   */
  curieri_permisi?: number[];
  /** Emite pe contractele proprii de curierat legate in „Curieri Proprii". */
  contract_propriu?: boolean;
  /** Arata la cotare si liniile de pe contractul propriu. */
  arata_contract_propriu?: boolean;
  /** Lockere easybox (SameDay) oferite in checkout. */
  foloseste_easybox?: boolean;
  /**
   * Lockere FANbox (FAN Courier) oferite in checkout.
   *
   * ⚠ Merg NUMAI pe contract propriu: documentatia le leaga de `courier_id: 3`
   * (FanCourier) IMPREUNA cu `use_own_contract: 1`. Fara contract propriu,
   * comutatorul nu are ce oferi.
   */
  foloseste_fanbox?: boolean;
  /** Deschiderea coletului la livrare, unde curierul o suporta. */
  deschidere_la_livrare?: boolean;
  /** Asigura coletul la valoarea comenzii. Costa, deci e stins din oficiu. */
  asigura_coletul?: boolean;
  /**
   * NU comanda automat curierul pentru ridicare (`nocom`).
   * Util cand comerciantul are deja o ridicare zilnica programata.
   */
  fara_ridicare_automata?: boolean;
  /** Dimensiunile implicite ale coletului, in CENTIMETRI. */
  lungime_cm?: number;
  latime_cm?: number;
  inaltime_cm?: number;
  /** Textul de pe AWB cand comanda n-are altul. */
  continut_implicit?: string;
  /** Formatul etichetei descarcate din panou. */
  format_eticheta?: FormatEticheta;
};

export type FormatEticheta = "A4" | "A6";

/**
 * Aceeasi regula de „configurat" peste tot: panou, checkout, comanda, cron, lot.
 *
 * ⚠ Expeditorul intra in ea, nu doar cheia. Fara `city` (id numeric) fiecare
 * cerere cade pe validare — iar in checkout asta inseamna ca toti cumparatorii
 * vad tariful fix in loc de cel real, fara niciun semn ca ceva lipseste.
 */
export function smartshipGata(c: SmartshipConfig | null | undefined): c is SmartshipConfig {
  return !!(
    c?.enabled
    && (c.api_key ?? "").trim()
    && (c.expeditor?.name ?? "").trim()
    && (c.expeditor?.address ?? "").trim()
    && (c.expeditor?.phone ?? "").trim()
    && Number(c.expeditor?.city) > 0
  );
}

// ─── Tipurile cererii ─────────────────────────────────────────────────────────

/** Destinatarul are exact forma expeditorului — documentatia le descrie impreuna. */
export type AdresaSmartship = ExpeditorSmartship;

/** Un colet dintr-o expediere cu dimensiuni diferite pe bucata. */
export type ColetSmartship = {
  weight: number;
  length: number;
  width: number;
  height: number;
};

export type ContinutSmartship = {
  package_content: string;
  parcels: number;
  weight: number;
  cash_on_delivery?: number;
  length: number;
  width: number;
  height: number;
  insurance?: number;
  iban?: string;
  open_package?: number;
  order_id?: string;
  /**
   * ⚠ NUMAI la `/cost`, si NUMAI aici, in `content`.
   *
   * Perechea lui de la emitere, `courier_id`, sta la nivelul PRINCIPAL al
   * cererii. Doua campuri care inseamna acelasi lucru si stau in locuri diferite
   * — de aia sunt pe tipuri diferite mai jos, ca `tsc` sa nu lase sa se
   * amestece.
   */
  curier_preferat?: number;
  parcels_multiple?: ColetSmartship[];
  /** Doar DPD: nota tiparita pe eticheta, cel mult 200 de caractere. */
  dpd_shipment_note?: string;
  /**
   * Lockerul ales de cumparator.
   *
   * ⚠ Trimis, schimba INTREBAREA: `/cost` intoarce DOAR varianta la locker si
   * trece peste `curier_preferat`. Ca sa se compare acasa cu locker trebuie DOUA
   * apeluri. Un `locker_id` nevalid cade cu 612 — nu se coteaza livrarea la
   * adresa in locul lui.
   */
  locker_id?: number;
  /** Doar la emitere: colet la schimb. Dubleaza costul (tur + retur). */
  swap?: number;
  /** Doar la emitere: nu comanda automat curierul pentru ridicare. */
  nocom?: number;
};

/** Corpul comun al celor doua apeluri. Vezi `expediere.ts` — un singur constructor. */
export type CorpComun = {
  sender: AdresaSmartship;
  recipient: AdresaSmartship;
  content: ContinutSmartship;
};

/** `POST /cost`. `show_byoc` la nivel PRINCIPAL, nu in `content`. */
export type CorpCost = CorpComun & { show_byoc?: number };

/** `POST /awb/new`. `courier_id` si `use_own_contract` la nivel PRINCIPAL. */
export type CorpAwb = CorpComun & { courier_id: number; use_own_contract?: number };

// ─── Tipurile raspunsurilor ───────────────────────────────────────────────────

/** O linie din `/cost`. */
export type OfertaSmartship = {
  courier_id?: number;
  courier_name?: string | null;
  courier_logo?: string | null;
  /** ⚠ CU TVA. `cost_fara_tva` e cel net. */
  cost?: number;
  cost_fara_tva?: number;
  /** Cat dureaza pana la virarea rambursului, din livrarile lor anterioare. */
  ramburs_delay?: { median?: number | null; p75?: number | null } | null;
  delivery_date?: string | null;
  pickup_date?: string | null;
  /** Doar pe liniile BYOC. */
  own_contract?: boolean;
  cucli_id?: number;
  cost_retur?: number;
  cost_retur_fara_tva?: number;
};

export type RaspunsCost = {
  costs: OfertaSmartship[];
  /** Greutatea pe care au taxat-o: maximul dintre cea fizica si cea volumetrica. */
  greutateCalculata: number | null;
};

export type RaspunsAwb = {
  awb: string;
  courier_id?: number | null;
  courier_name?: string | null;
  cost?: number | null;
  cost_fara_tva?: number | null;
  tracking_url?: string | null;
  own_contract?: boolean | null;
};

/** Un eveniment din istoricul de urmarire. */
export type EvenimentSmartship = {
  date?: string | null;
  /** ⚠ Nomenclatorul lui NU e documentat. Nu se traduce, doar se arata. */
  event_id?: string | number | null;
  description?: string | null;
  locality?: string | null;
};

export type UrmarireSmartship = {
  awb: string | null;
  /** Statusul expedierii (0/1/2/5/6/10). Vezi `statusuri.ts`. */
  status: number | null;
  descriere: string | null;
  curier: string | null;
  trackingUrl: string | null;
  evenimente: EvenimentSmartship[];
};

export type JudetSmartship = { id: number; county: string };
export type LocalitateSmartship = { id: number; city: string };

export type ExpeditorSalvat = {
  id?: number;
  nume?: string | null;
  telefon?: string | null;
  email?: string | null;
  judet?: string | null;
  localitate?: string | null;
  adresa?: string | null;
  localitate_id?: number | null;
  sector?: number | null;
};

export type SoldSmartship = {
  balance: number | null;
  credit_limit: number | null;
  payment_on_terms: boolean;
  available_for_shipping: number | null;
  currency: string | null;
};

/**
 * Un locker, asa cum vine de la ei.
 *
 * ⚠ FORMA NU E DOCUMENTATA. `/geolocation/easybox` si `/geolocation/fanbox` sunt
 * singurele doua endpointuri din tot API-ul fara exemplu de raspuns — exact
 * situatia de la `FixedLocations` al Innoship. Randul se citeste tolerant in
 * `lockere.ts`, iar butonul de diagnostic din panou arata cheile REALE, ca
 * presupunerile sa se poata scurta la adevar la prima cheie de cont.
 */
export type LockerBrut = Record<string, unknown>;

export type RidicareFedex = {
  pickup_date?: string | null;
  schedule_day?: string | null;
  available?: boolean | null;
  cutoff_time?: string | null;
  default_ready_time?: string | null;
  ready_time_options?: string[] | null;
  latest_time_options?: string[] | null;
};

export type OfertaTransport = {
  ref: string | null;
  client_reference?: string | null;
  request_status: string | null;
  resolution_message?: string | null;
  created_at?: string | null;
  offer?: {
    price?: number | null;
    carrier?: string | null;
    delivery_term?: string | null;
    valid_until?: string | null;
    message?: string | null;
    expired?: boolean | null;
    acceptable?: boolean | null;
  } | null;
  awb?: string | null;
};

// ─── Cererea ──────────────────────────────────────────────────────────────────

/**
 * Codul din corpul raspunsului, daca exista.
 *
 * ⚠ Se accepta si sirul: JSON-ul lor da `"status": 200` ca numar in exemple, dar
 * nimic nu ne garanteaza ca ramane asa pe toate caile — iar un `200` citit ca sir
 * si comparat cu numarul 200 ar face ca fiecare succes sa arate ca o eroare.
 */
export function codDinCorp(corp: unknown): number | null {
  if (!corp || typeof corp !== "object") return null;
  const v = (corp as { status?: unknown }).status;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

/**
 * Mesajul de eroare, compus din tot ce spun ei.
 *
 * Formele documentate:
 *   - `erori`: lista problemelor de validare (codul 999);
 *   - `err`: detaliile venite de la curier (codul 301 la emitere);
 *   - `cod`: motivul refuzului BYOC (NO_SUBSCRIPTION, EXPIRED…);
 *   - `min_weight`: pragul, la codul 422.
 *
 * ⚠ `erori` poate fi lista de siruri SAU obiect camp→motiv. La Woot exact forma
 * asta ne-a costat o zi: parserul verifica doar sirul, iar motivul REAL — pe care
 * API-ul il spunea de la inceput — se pierdea, si ramanea „400", sec. Vezi
 * [[praguri-api-curieri]].
 */
export function descrieEroarea(corp: unknown, brut: string): string {
  const bucati: string[] = [];

  if (corp && typeof corp === "object") {
    const o = corp as Record<string, unknown>;

    const cod = codDinCorp(corp);
    if (cod !== null && cod !== COD_OK && CODURI[cod]) bucati.push(CODURI[cod]);

    bucati.push(...listaErorilor(o.erori));
    bucati.push(...listaErorilor(o.errors));

    for (const cheie of ["err", "message", "mesaj", "error"] as const) {
      const v = o[cheie];
      const text = textDinCamp(v);
      if (text) { bucati.push(text); break; }
    }

    /* Motivul refuzului BYOC: fara el, „acces respins" nu spune ce lipseste. */
    const motivByoc = typeof o.cod === "string" ? o.cod.trim() : "";
    if (motivByoc) bucati.push(`Motiv: ${MOTIVE_BYOC[motivByoc] ?? motivByoc}`);

    const prag = Number(o.min_weight);
    if (Number.isFinite(prag) && prag > 0) bucati.push(`Pragul minim e ${prag} kg.`);

    /* Creditul lipsa, cu cifrele lor: „alimenteaza contul" fara sume nu ajuta. */
    const disponibil = Number(o.available_for_shipping ?? o.credit);
    const necesar = Number(o.cost ?? o.required);
    if (Number.isFinite(disponibil) && Number.isFinite(necesar) && necesar > 0) {
      bucati.push(`Disponibil ${disponibil} lei, necesar ${necesar} lei.`);
    }
  }

  const text = [...new Set(bucati.filter(Boolean))].join(" | ");
  if (text) return text.slice(0, 500);
  return brut.trim().slice(0, 300) || "raspuns gol";
}

const MOTIVE_BYOC: Record<string, string> = {
  NO_SUBSCRIPTION: "nu ai abonament BYOC activ",
  GRACE_PERIOD: "plata abonamentului BYOC a esuat, accesul e suspendat",
  NOT_STARTED: "abonamentul BYOC incepe la o data viitoare",
  EXPIRED: "abonamentul BYOC a expirat",
  LIMIT_REACHED: "ai atins limita lunara de expedieri din planul BYOC",
};

function textDinCamp(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    /* `err` poate fi si un obiect cu detaliile curierului. */
    try { return JSON.stringify(v).slice(0, 300); } catch { return ""; }
  }
  return "";
}

/** `erori` in oricare din formele in care poate veni. */
function listaErorilor(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x.trim() : textDinCamp(x))).filter(Boolean);
  }
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([camp, motiv]) => {
        const text = typeof motiv === "string" ? motiv.trim() : textDinCamp(motiv);
        return text ? `${camp}: ${text}` : "";
      })
      .filter(Boolean);
  }
  return typeof v === "string" ? [v.trim()].filter(Boolean) : [];
}

/**
 * Un apel catre SmartShip.
 *
 * ═══ VERDICTELE ═══
 *
 *   retea cazuta / timeout        -> NU STIM. Cererea poate sa fi ajuns.
 *   HTTP 4xx (fara 408)           -> refuz dovedit.
 *   HTTP 5xx / 408                -> NU STIM.
 *   HTTP 2xx + cod cunoscut       -> refuz dovedit, cu mesajul nostru.
 *   HTTP 2xx + cod NECUNOSCUT     -> NU STIM. Vezi `verdictCod`.
 *   HTTP 2xx + corp necitibil     -> NU STIM.
 */
async function apel<T>(
  config: Pick<SmartshipConfig, "api_key">,
  metoda: "GET" | "POST",
  cale: string,
  corp?: unknown,
  asteptareMs = ASTEPTARE_MS,
): Promise<T> {
  const cheie = (config.api_key ?? "").trim();
  if (!cheie) throw eroareRefuz("Lipseste cheia de API SmartShip din configurare.");

  let res: Response;
  try {
    res = await fetch(`${BAZA}${cale}`, {
      method: metoda,
      headers: {
        "X-API-KEY": cheie,
        Accept: "application/json",
        ...(corp !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: corp !== undefined ? JSON.stringify(corp) : undefined,
      signal: AbortSignal.timeout(asteptareMs),
      cache: "no-store",
      /* Un 3xx aici n-are ce cauta; urmat, ar putea aduce o pagina de login. */
      redirect: "manual",
    });
  } catch (e) {
    throw eroareNesigura(`SmartShip ${metoda} ${cale}: ${(e as Error).message}`);
  }

  const text = await res.text();
  let date: unknown = null;
  if (text.trim()) {
    try { date = JSON.parse(text); } catch { date = null; }
  }

  const cod = codDinCorp(date);

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw insemneaza(
        eroareRefuz("SmartShip a respins cheia de API. Verific-o in configurare."),
        res.status, cod,
      );
    }
    throw insemneaza(
      eroareCuStatus(`SmartShip ${metoda} ${cale}: ${res.status} — ${descrieEroarea(date, text)}`, res.status),
      res.status, cod,
    );
  }

  /*
   * ⚠ Un 2xx cu corp necitibil NU e succes: citit ca succes, am raporta o
   * expediere care poate nu exista; citit ca refuz, am debloca reincercarea.
   * Amandoua gresite — verdictul cinstit e „nu stim".
   */
  if (date === null) {
    throw eroareNesigura(
      `SmartShip ${metoda} ${cale}: raspuns necitibil (${res.status}) — ${text.slice(0, 200)}`,
    );
  }

  /*
   * ⚠ AICI SE CITESTE A DOUA OARA. Un „credit insuficient" servit cu HTTP 200 ar
   * fi trecut mai departe drept AWB creat, daca ne-am fi oprit la `res.ok`.
   */
  if (cod !== null && cod !== COD_OK) {
    const mesaj = `SmartShip ${metoda} ${cale}: ${descrieEroarea(date, text)}`;
    const e = verdictCod(cod) === "esuat" ? eroareRefuz(mesaj) : eroareNesigura(mesaj);
    throw insemneaza(e, res.status, cod);
  }

  return date as T;
}

/** Lista dintr-un raspuns, oricare i-ar fi invelisul. */
function lista(corp: unknown, ...chei: string[]): unknown[] {
  if (Array.isArray(corp)) return corp;
  if (corp && typeof corp === "object") {
    for (const cheie of chei) {
      const v = (corp as Record<string, unknown>)[cheie];
      if (Array.isArray(v)) return v;
    }
    /* Ultima incercare: unele endpointuri ar putea invali in `data`. */
    const d = (corp as { data?: unknown }).data;
    if (Array.isArray(d)) return d;
  }
  return [];
}

function obiecte<T>(v: unknown[]): T[] {
  return v.filter((x): x is T => !!x && typeof x === "object");
}

// ─── Nomenclatoare ────────────────────────────────────────────────────────────

/**
 * Judetele.
 *
 * ⚠ E si proba de conexiune ideala, si documentatia lor o foloseste chiar ca
 * exemplu de prima cerere: e o citire pura, nu creeaza nimic, si nu costa nimic.
 */
export async function judete(config: SmartshipConfig, tara = "RO"): Promise<JudetSmartship[]> {
  const r = await apel<unknown>(config, "GET", `/geolocation/counties?country=${encodeURIComponent(tara)}`);
  return obiecte<Record<string, unknown>>(lista(r, "counties"))
    .map((j) => ({ id: Number(j.id), county: String(j.county ?? j.name ?? "") }))
    .filter((j) => Number.isInteger(j.id) && j.id > 0 && j.county.length > 0);
}

/**
 * Localitatile unui judet.
 *
 * `loc_sel` e potrivirea LOR: cand numele e gasit, raspunsul aduce si
 * `city_selected` cu id-ul. Se foloseste intai al lor si abia apoi al nostru —
 * ei stiu cum isi scriu propriile localitati.
 */
export async function localitati(
  config: SmartshipConfig,
  judetId: number,
  numeCautat?: string,
): Promise<{ localitati: LocalitateSmartship[]; aleasa: number | null }> {
  const p = new URLSearchParams({ county: String(judetId) });
  if (numeCautat?.trim()) p.set("loc_sel", numeCautat.trim());

  const r = await apel<unknown>(config, "GET", `/geolocation/cities?${p.toString()}`);
  const brute = obiecte<Record<string, unknown>>(lista(r, "cities"))
    .map((l) => ({ id: Number(l.id), city: String(l.city ?? l.name ?? "") }))
    .filter((l) => Number.isInteger(l.id) && l.id > 0 && l.city.length > 0);

  const selectata = Number((r as { city_selected?: unknown } | null)?.city_selected);
  return {
    localitati: brute,
    aleasa: Number.isInteger(selectata) && selectata > 0 ? selectata : null,
  };
}

/** Lockerele easybox (SameDay). ⚠ Forma randului nu e documentata — vezi `LockerBrut`. */
export async function lockereEasybox(config: SmartshipConfig): Promise<LockerBrut[]> {
  const r = await apel<unknown>(config, "GET", "/geolocation/easybox");
  return obiecte<LockerBrut>(lista(r, "easybox", "lockers", "easyboxes"));
}

/** Lockerele FANbox (FAN Courier). ⚠ Merg numai pe contract propriu. */
export async function lockereFanbox(config: SmartshipConfig): Promise<LockerBrut[]> {
  const r = await apel<unknown>(config, "GET", "/geolocation/fanbox");
  return obiecte<LockerBrut>(lista(r, "fanbox", "lockers", "fanboxes"));
}

// ─── Contul ───────────────────────────────────────────────────────────────────

/** Expeditorii salvati in contul comerciantului (adresele de ridicare). */
export async function expeditoriSalvati(config: SmartshipConfig): Promise<ExpeditorSalvat[]> {
  const r = await apel<unknown>(config, "GET", "/account/senders");
  return obiecte<ExpeditorSalvat>(lista(r, "senders"));
}

/**
 * Soldul si creditul disponibil.
 *
 * ⚠ Se citeste INAINTE de emitere, ca sa se prinda codul 605 fara sa se atinga
 * emiterea. Nu e paza principala (creditul se poate consuma intre cele doua
 * apeluri), dar transforma un blocaj in registru intr-un mesaj limpede.
 */
export async function sold(config: SmartshipConfig): Promise<SoldSmartship> {
  const r = await apel<Record<string, unknown>>(config, "GET", "/account/balance");
  const numar = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    balance: numar(r?.balance),
    credit_limit: numar(r?.credit_limit),
    payment_on_terms: Number(r?.payment_on_terms) === 1 || r?.payment_on_terms === true,
    available_for_shipping: numar(r?.available_for_shipping),
    currency: typeof r?.currency === "string" ? r.currency : null,
  };
}

export type RezultatProba =
  | { ok: true; expeditori: ExpeditorSalvat[]; sold: SoldSmartship | null }
  | { ok: false; eroare: string };

/**
 * Proba de conexiune.
 *
 * ⚠ Doua citiri pure, si amandoua aduc ceva de care configurarea are nevoie:
 * expeditorii (din care se completeaza id-ul localitatii, cel mai usor de gresit)
 * si soldul. O proba care doar spune „merge" il lasa pe om sa completeze restul
 * de mana — si tocmai acolo se greseste.
 *
 * ⚠ Soldul NU face proba sa cada: cheia e deja dovedita de prima citire, iar un
 * endpoint de contabilitate picat n-are de ce sa opreasca configurarea.
 */
export async function probaConexiune(config: SmartshipConfig): Promise<RezultatProba> {
  try {
    const expeditori = await expeditoriSalvati(config);
    let soldul: SoldSmartship | null = null;
    try { soldul = await sold(config); } catch { soldul = null; }
    return { ok: true, expeditori, sold: soldul };
  } catch (e) {
    return { ok: false, eroare: (e as Error).message };
  }
}

// ─── Cotare ───────────────────────────────────────────────────────────────────

/**
 * Preturile la toti curierii disponibili.
 *
 * ⚠ Nu creeaza nimic, oricat de des ar fi chemata — de aia poate sta in calea
 * cumparatorului. Curierii care nu pot onora cererea (greutate, ramburs, ruta)
 * sunt OMISI din raspuns, deci o lista scurta nu e un defect.
 */
export async function coteaza(config: SmartshipConfig, corp: CorpCost): Promise<RaspunsCost> {
  const r = await apel<Record<string, unknown>>(config, "POST", "/cost", corp);
  const greutate = Number(r?.total_weight_calculated);
  return {
    costs: obiecte<OfertaSmartship>(lista(r, "costs")),
    greutateCalculata: Number.isFinite(greutate) && greutate > 0 ? greutate : null,
  };
}

// ─── Emitere ──────────────────────────────────────────────────────────────────

/**
 * Creeaza AWB-ul.
 *
 * ⚠ CREEAZA UN TRANSPORT REAL, facturat, si scade din creditul contului. Nu se
 * cheama de doua ori pentru aceeasi comanda fara sa treaca prin registrul de
 * operatii externe.
 *
 * ⚠ `pdf_link` din raspuns NU se intoarce mai departe: contine cheia de API in
 * cale. Vezi antetul fisierului.
 */
export async function creeazaAwb(config: SmartshipConfig, corp: CorpAwb): Promise<RaspunsAwb> {
  const r = await apel<Record<string, unknown>>(config, "POST", "/awb/new", corp, ASTEPTARE_EMITERE_MS);

  const awb = String(r?.awb ?? "").trim();
  if (!awb) {
    /*
     * Corp valid, cod 200, dar fara numar. Nu stim ce s-a creat acolo — si aici
     * exista iesire: `cautaDupaComanda()` intreaba dupa id-ul NOSTRU de comanda.
     */
    throw eroareNesigura(
      "SmartShip a raspuns la emitere fara numar AWB. Apasa „Verifica la SmartShip”: "
      + "expedierea poate exista deja acolo.",
    );
  }

  const numar = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    awb,
    courier_id: numar(r?.courier_id),
    courier_name: typeof r?.courier_name === "string" ? r.courier_name : null,
    cost: numar(r?.cost),
    cost_fara_tva: numar(r?.cost_fara_tva),
    tracking_url: typeof r?.tracking_url === "string" ? r.tracking_url : null,
    own_contract: typeof r?.own_contract === "boolean" ? r.own_contract : null,
  };
}

// ─── Urmarire ─────────────────────────────────────────────────────────────────

function citesteUrmarirea(r: Record<string, unknown> | null): UrmarireSmartship {
  const numar = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isInteger(n) ? n : null;
  };
  return {
    awb: typeof r?.awb === "string" ? r.awb.trim() || null : null,
    /* `awb_status` la /awb/status; `status` e deja folosit de codul de raspuns. */
    status: numar(r?.awb_status),
    descriere: typeof r?.awb_status_desc === "string" ? r.awb_status_desc : null,
    curier: typeof r?.carrier === "string" ? r.carrier : null,
    trackingUrl:
      typeof r?.tracking_link === "string" ? r.tracking_link
      : typeof r?.tracking_url === "string" ? r.tracking_url
      : null,
    evenimente: obiecte<EvenimentSmartship>(lista(r, "tracking", "events", "history")),
  };
}

/** Statusul si istoricul unui AWB. */
export async function urmareste(config: SmartshipConfig, awb: string, asteptareMs?: number): Promise<UrmarireSmartship> {
  const r = await apel<Record<string, unknown>>(
    config, "GET", `/awb/status/${encodeURIComponent(awb)}`, undefined, asteptareMs,
  );
  return citesteUrmarirea(r);
}

/**
 * Cautarea dupa ID-UL NOSTRU de comanda.
 *
 * ═══ ⚠ ASTA INCHIDE FEREASTRA „NU STIU DACA S-A CREAT" ═══
 *
 * Ca la Innoship (`by-external-order-id`) si spre deosebire de GLS, Packeta sau
 * Posta: cand o emitere pica nesigur, raspunsul se afla dintr-o CITIRE, nu dintr-o
 * presupunere a comerciantului care se uita in panoul furnizorului.
 *
 * ⚠ `null` inseamna „nu exista acolo" si e o DOVADA — dar numai fiindca vine dupa
 * un raspuns citit cu succes. O cadere de retea ARUNCA, si atunci nu se atinge
 * nimic: cel mai grav lucru pe care il putem face aici e sa luam o eroare de
 * transport drept dovada ca expedierea nu exista.
 */
export async function cautaDupaComanda(config: SmartshipConfig, orderId: string): Promise<UrmarireSmartship | null> {
  try {
    const r = await apel<Record<string, unknown>>(
      config, "GET", `/awb/order_id/${encodeURIComponent(orderId)}`, undefined, ASTEPTARE_EMITERE_MS,
    );
    const u = citesteUrmarirea(r);
    return u.awb ? u : null;
  } catch (e) {
    /*
     * ⚠ 301 e chiar raspunsul lor pentru „AWB-ul nu exista sau nu apartine
     * contului tau". Deci e o DOVADA ca nu s-a creat nimic, nu un esec.
     * Orice alta eroare se propaga: acolo chiar nu stim.
     */
    if (codEroare(e) === 301 || statusEroare(e) === 404) return null;
    throw e;
  }
}

// ─── Anulare ──────────────────────────────────────────────────────────────────

export type RezultatAnulare =
  | { anulat: true; eraDejaAnulat: boolean }
  | { anulat: false; motiv: string; definitiv: boolean };

/**
 * Anuleaza AWB-ul.
 *
 * ⚠ E un GET care SCHIMBA ceva. Asa il documenteaza ei; nu se cheama „ca sa
 * vedem", si nu se pune niciodata intr-un `prefetch` sau intr-un link.
 *
 * ⚠ Codul 205 („era deja anulat") e SUCCES, nu esec: efectul dorit exista deja.
 * Tratat ca esec, slotul din registru ar ramane ocupat de un AWB mort si comanda
 * n-ar mai putea primi altul niciodata — exact regresia gasita la Packeta.
 *
 * `definitiv` deosebeste „nu se mai poate anula, oricat ai incerca" (206, 220) de
 * „a picat acum" — panoul spune atunci omului sa intre in contul SmartShip, in loc
 * sa-l invite sa reincerce la nesfarsit.
 */
export async function anuleaza(config: SmartshipConfig, awb: string): Promise<RezultatAnulare> {
  try {
    await apel<unknown>(
      config, "GET", `/awb/cancel/${encodeURIComponent(awb)}`, undefined, ASTEPTARE_EMITERE_MS,
    );
    return { anulat: true, eraDejaAnulat: false };
  } catch (e) {
    const cod = codEroare(e);
    if (cod === 205) return { anulat: true, eraDejaAnulat: true };
    return {
      anulat: false,
      motiv: (e as Error).message,
      definitiv: cod === 206 || cod === 220,
    };
  }
}

// ─── Eticheta ─────────────────────────────────────────────────────────────────

/**
 * Eticheta, ca PDF.
 *
 * ⚠ Raspunsul e FISIERUL, nu JSON — deci nu poate trece prin `apel()`. Si tocmai
 * de aia are nevoie de un drum propriu de erori: un PDF gol sau o pagina HTML de
 * eroare servita cu 200 ar ajunge la imprimanta ca foaie alba.
 *
 * ⚠ Cheia pleaca in ANTET. Exista si un link gata facut in raspunsul de emitere
 * (`pdf_link`), dar acela poarta cheia in CALE — vezi antetul fisierului.
 */
export async function eticheta(
  config: SmartshipConfig,
  awb: string,
  format: FormatEticheta = "A4",
): Promise<{ pdfBase64: string; octeti: number }> {
  const cheie = (config.api_key ?? "").trim();
  if (!cheie) throw eroareRefuz("Lipseste cheia de API SmartShip din configurare.");

  const cale = `/awb/print/${encodeURIComponent(awb)}/${encodeURIComponent(format)}`;

  let res: Response;
  try {
    res = await fetch(`${BAZA}${cale}`, {
      method: "GET",
      headers: { "X-API-KEY": cheie, Accept: "application/pdf" },
      signal: AbortSignal.timeout(ASTEPTARE_EMITERE_MS),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    throw eroareNesigura(`SmartShip eticheta: ${(e as Error).message}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());

  if (!res.ok) {
    const text = buf.toString("utf8").slice(0, 400);
    let date: unknown = null;
    try { date = JSON.parse(text); } catch { date = null; }
    throw insemneaza(
      eroareCuStatus(`SmartShip eticheta: ${res.status} — ${descrieEroarea(date, text)}`, res.status),
      res.status, codDinCorp(date),
    );
  }

  /*
   * ⚠ Un 200 poate purta si JSON-ul lor de eroare in loc de PDF (codurile din
   * corp merg si aici). Semnatura `%PDF` e singura dovada ca avem un fisier.
   */
  if (buf.length < 5 || buf.subarray(0, 4).toString("latin1") !== "%PDF") {
    const text = buf.toString("utf8").slice(0, 400);
    let date: unknown = null;
    try { date = JSON.parse(text); } catch { date = null; }
    throw eroareRefuz(`SmartShip n-a intors eticheta: ${descrieEroarea(date, text)}`);
  }

  return { pdfBase64: buf.toString("base64"), octeti: buf.length };
}

// ─── Ridicarea FedEx ──────────────────────────────────────────────────────────

/**
 * Intervalele in care FedEx poate ridica coletul.
 *
 * ⚠ Numai la FedEx (`courier_id: 19`). La ceilalti, ridicarea se comanda automat
 * la emitere — de aia exista `nocom`, nu invers.
 */
export async function disponibilitateRidicare(config: SmartshipConfig, awb: string): Promise<RidicareFedex[]> {
  const r = await apel<unknown>(
    config, "GET", `/pickup/availability/${encodeURIComponent(awb)}`, undefined, ASTEPTARE_EMITERE_MS,
  );
  return obiecte<RidicareFedex>(lista(r, "options"));
}

/**
 * Programeaza ridicarea.
 *
 * ⚠ UNA SINGURA PE AWB (codul 305). Trece prin registrul de operatii externe cu
 * `fel: "ridicare"`, ca la DPD si FAN.
 */
export async function programeazaRidicare(
  config: SmartshipConfig,
  awb: string,
  cerere: { pickup_date: string; ready_time: string; latest_time: string },
): Promise<{ cod: string | null; locatie: string | null }> {
  const r = await apel<Record<string, unknown>>(
    config, "POST", `/pickup/${encodeURIComponent(awb)}`, cerere, ASTEPTARE_EMITERE_MS,
  );
  return {
    cod: typeof r?.pickup_confirmation_code === "string" ? r.pickup_confirmation_code : null,
    locatie: typeof r?.location === "string" ? r.location : null,
  };
}

// ─── Oferte de transport (marfa grea) ─────────────────────────────────────────

/**
 * Cere o oferta de transport pentru marfa grea.
 *
 * ⚠ NU e o cotare: raspunsul vine de la un OM, peste ore sau zile. De aia fluxul
 * are patru pasi (cere, verifica, accepta sau refuza) si de aia referinta se
 * pastreaza pe comanda — altfel solicitarea s-ar pierde in momentul in care
 * comerciantul inchide pagina.
 */
export async function cereOfertaTransport(
  config: SmartshipConfig,
  corp: CorpComun & { content: ContinutSmartship & Record<string, unknown> },
): Promise<{ ref: string; stare: string | null }> {
  const r = await apel<Record<string, unknown>>(config, "POST", "/transport-offer", corp, ASTEPTARE_EMITERE_MS);
  const ref = String(r?.ref ?? "").trim();
  if (!ref) throw eroareNesigura("SmartShip a inregistrat solicitarea, dar n-a intors referinta ei.");
  return { ref, stare: typeof r?.request_status === "string" ? r.request_status : null };
}

export async function ofertaTransport(config: SmartshipConfig, ref: string): Promise<OfertaTransport> {
  const r = await apel<Record<string, unknown>>(
    config, "GET", `/transport-offer/${encodeURIComponent(ref)}`,
  );
  return {
    ref: typeof r?.ref === "string" ? r.ref : ref,
    client_reference: typeof r?.client_reference === "string" ? r.client_reference : null,
    request_status: typeof r?.request_status === "string" ? r.request_status : null,
    resolution_message: typeof r?.resolution_message === "string" ? r.resolution_message : null,
    created_at: typeof r?.created_at === "string" ? r.created_at : null,
    offer: (r?.offer ?? null) as OfertaTransport["offer"],
    awb: typeof r?.awb === "string" ? r.awb : null,
  };
}

/**
 * Accepta oferta.
 *
 * ⚠ CREEAZA UN AWB REAL si scade pretul din credit. Documentatia lor spune ca e
 * IDEMPOTENT („re-apelarea intoarce acelasi AWB") — singurul apel din tot API-ul
 * care o spune. Trece totusi prin registru, cu ACEEASI cheie ca emiterea
 * obisnuita: o comanda are un singur transport, indiferent pe ce drum a venit.
 */
export async function acceptaOfertaTransport(
  config: SmartshipConfig,
  ref: string,
): Promise<{ awb: string; trackingUrl: string | null; cost: number | null }> {
  const r = await apel<Record<string, unknown>>(
    config, "POST", `/transport-offer/${encodeURIComponent(ref)}/accept`, {}, ASTEPTARE_EMITERE_MS,
  );
  const awb = String(r?.awb ?? "").trim();
  if (!awb) throw eroareNesigura("SmartShip a acceptat oferta, dar n-a intors numarul AWB.");
  const cost = Number(r?.cost);
  return {
    awb,
    trackingUrl: typeof r?.tracking_url === "string" ? r.tracking_url : null,
    cost: Number.isFinite(cost) ? cost : null,
  };
}

export async function refuzaOfertaTransport(
  config: SmartshipConfig,
  ref: string,
  motiv?: string,
): Promise<void> {
  await apel<unknown>(
    config, "POST", `/transport-offer/${encodeURIComponent(ref)}/reject`,
    motiv?.trim() ? { reason: motiv.trim() } : {},
    ASTEPTARE_EMITERE_MS,
  );
}

// ─── Contabilitate ────────────────────────────────────────────────────────────

export type FacturaSmartship = {
  number?: string | null;
  date?: string | null;
  due_date?: string | null;
  total?: number | null;
  currency?: string | null;
  pdf_link?: string | null;
};

export type DecontSmartship = {
  number?: string | null;
  date?: string | null;
  client?: string | null;
  valoare?: number | null;
  iban?: string | null;
  awb_count?: number | null;
};

export type LinieDecont = {
  date?: string | null;
  number?: string | null;
  value?: number | null;
  recipient?: string | null;
  awb?: string | null;
};

/** ⚠ Plafonul lor: cel mult 100 pe pagina. Peste, raspund ce vor ei. */
export const MAX_PE_PAGINA = 100;

export async function facturi(
  config: SmartshipConfig,
  pagina = 1,
  pePagina = 50,
): Promise<{ facturi: FacturaSmartship[]; pagini: number }> {
  const p = new URLSearchParams({ page: String(pagina), per_page: String(Math.min(pePagina, MAX_PE_PAGINA)) });
  const r = await apel<Record<string, unknown>>(config, "GET", `/invoices?${p.toString()}`);
  const pagini = Number(r?.total_pages);
  return {
    facturi: obiecte<FacturaSmartship>(lista(r, "invoices")),
    pagini: Number.isInteger(pagini) && pagini > 0 ? pagini : 1,
  };
}

export async function deconturi(
  config: SmartshipConfig,
  pagina = 1,
  pePagina = 50,
): Promise<{ deconturi: DecontSmartship[]; pagini: number }> {
  const p = new URLSearchParams({ page: String(pagina), per_page: String(Math.min(pePagina, MAX_PE_PAGINA)) });
  const r = await apel<Record<string, unknown>>(config, "GET", `/payouts?${p.toString()}`);
  const pagini = Number(r?.total_pages);
  return {
    deconturi: obiecte<DecontSmartship>(lista(r, "payouts")),
    pagini: Number.isInteger(pagini) && pagini > 0 ? pagini : 1,
  };
}

export async function detaliiDecont(
  config: SmartshipConfig,
  numar: string,
): Promise<{ numar: string | null; data: string | null; valoare: number | null; linii: LinieDecont[] }> {
  const r = await apel<Record<string, unknown>>(config, "GET", `/payouts/${encodeURIComponent(numar)}`);
  const d = (r?.payout ?? null) as Record<string, unknown> | null;
  const valoare = Number(d?.value);
  return {
    numar: typeof d?.number === "string" ? d.number : numar,
    data: typeof d?.date === "string" ? d.date : null,
    valoare: Number.isFinite(valoare) ? valoare : null,
    linii: obiecte<LinieDecont>(lista(d, "lines")),
  };
}
