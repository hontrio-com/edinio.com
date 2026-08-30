import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";

/**
 * Clientul Shipo.ro.
 *
 * ═══ CE E ═══
 *
 * Un BROKER, ca Woot, Colete Online, eColet, Innoship si SmartShip: un singur
 * cont la ei, sapte curieri in spate (FAN Courier, Cargus, DPD, GLS, Sameday,
 * Posta Romana, FedEx), tarife negociate de ei, si o retea de lockere si puncte
 * PUDO comuna tuturor curierilor care le au.
 *
 * ═══ ⚠ PATRU LUCRURI CARE NU SEAMANA CU NIMIC DIN CE AVEM ═══
 *
 * **1. Autentificare in DOI PASI, cu token de o ora.** `POST /auth` cu cheia in
 * antetul `auth-key`, apoi `Authorization: Bearer` pe tot restul. Niciunul dintre
 * ceilalti doisprezece transportatori n-are token cu viata asa scurta, deci
 * tiparul „cheia in antet la fiecare cerere" nu se poate copia. Vezi `token()`.
 *
 * ⚠ Antetul e `auth-key`, CU CRATIMA. In changelog-ul lor, la 16.07.2026, scrie
 * ca a fost redenumit din `auth_key`. Scris cu underscore, `/auth` raspunde 401
 * si integrarea pare „cheie gresita" la un comerciant care are cheia corecta.
 *
 * **2. ⚠ COORDONATELE SUNT INVERSATE INTRE DOUA ENDPOINTURI ALE LOR.**
 * `/city` intoarce `coord: [longitudine, latitudine]` (documentat asa la
 * `/client`), iar `/points` cere `coord=latitudine,longitudine` (documentat asa,
 * cu exemplul `46.7712,23.6236` pentru Cluj). Trecute mai departe in ordinea in
 * care vin, cautarea de lockere pleaca in Oceanul Indian si intoarce zero
 * puncte — adica „nu sunt lockere in localitate", fara nicio eroare. Rasucirea
 * se face intr-un singur loc, `coordPentruPuncte()`, si are proba.
 *
 * **3. ⚠ ACELASI CAMP, DOUA FELURI DE ID.** `recipient_address_id` si
 * `sender_address_id` primesc id-ul unei adrese SALVATE la serviciile `address`,
 * si id-ul unui PUNCT din `/points` la serviciile `locker`/`pudo`. Documentatia
 * lor o spune apasat, cu titlu propriu („Atentie: doua tipuri diferite de ID"),
 * ceea ce inseamna ca e capcana lor cunoscuta. La noi cele doua stau in campuri
 * DIFERITE pe comanda (`shipo_point_id` separat de configurarea expeditorului) si
 * se unesc abia in `corpExpediere()`.
 *
 * **4. ⚠ BOOLEENELE NU AU VOIE SA PLECE CA TEXT.** Pana la 23.07.2026, `"false"`
 * era citit de ei ca ADEVARAT, deci se facturau asigurare si deschidere la
 * livrare nedorite, si se trimiteau SMS-uri catre destinatari. Acum accepta
 * `true|false|1|0|"1"|"0"|"true"|"false"` si RESPING orice altceva la validare —
 * deci nici `undefined` nu se strecoara. Se trimit booleene adevarate, si numai
 * cand sunt aprinse.
 *
 * ═══ ⚠ RASPUNSUL SE CITESTE DE DOUA ORI ═══
 *
 * Erorile lor vin pe HTTP 200 cu `success: false` — la creare, la validare, la
 * anulare, la tarife, la puncte. Documentatia le numeste chiar „Raspuns eroare
 * 200". Un client care s-ar opri la `res.ok` ar citi „No couriers deliver this
 * shipment" drept cotare reusita, si „Shipment could not be canceled" drept
 * anulare reusita.
 *
 * ═══ ⚠ NU EXISTA CAUTARE DUPA REFERINTA NOASTRA ═══
 *
 * Spre deosebire de SmartShip si Innoship, in corpul lui `POST /shipment` NU
 * exista niciun camp pentru numarul comenzii noastre: `order_id` din raspunsurile
 * lor e id-ul RIDICARII atribuit de curier, nu al nostru. Deci fereastra „am
 * trimis cererea si n-am primit raspuns — s-a creat sau nu?" nu se poate inchide
 * cu o citire, ca la SmartShip. Se inchide DOAR cu registrul de operatii externe,
 * ca la Woot si FAN Courier. De aia orice esec ambiguu la EMITERE iese
 * `necunoscut` si blocheaza — vezi `apel()`.
 */

/** Singura gazda. Nu exista mediu de proba: orice emitere e reala si facturata. */
const BAZA = "https://api.shipo.ro";

/** Citirile din calea cumparatorului: cotare, nomenclatoare, puncte. */
export const ASTEPTARE_MS = 20_000;
/** Emiterea, anularea si etichetele: pornite de comerciant, isi permit mai mult. */
const ASTEPTARE_EMITERE_MS = 45_000;
/** Autentificarea: un singur pas, si sta in fata oricarei alte cereri. */
const ASTEPTARE_AUTH_MS = 15_000;

// ─── Statusul HTTP, pastrat PE eroare ─────────────────────────────────────────

/**
 * Statusul HTTP, pastrat pe eroare — acelasi tipar ca la eColet, Pall-Ex, Posta,
 * Innoship si SmartShip: cine trateaza „nu exista acolo" altfel decat un refuz
 * oarecare are nevoie de numar, iar numarul nu trebuie cautat in textul erorii.
 */
const CHEIE_STATUS = "statusHttp" as const;

export function statusEroare(e: unknown): number | null {
  const v = (e as { [CHEIE_STATUS]?: unknown } | null)?.[CHEIE_STATUS];
  return typeof v === "number" ? v : null;
}

function insemneaza(e: Error, status: number | null): Error {
  const cu = e as Error & { [CHEIE_STATUS]?: number };
  if (status !== null) cu[CHEIE_STATUS] = status;
  return e;
}

// ─── Configurarea ─────────────────────────────────────────────────────────────

export type FormatEticheta = "A4" | "A6";

export type ShipoConfig = {
  enabled: boolean;
  /**
   * Cheia generata din Setari → API, in contul Shipo.
   *
   * ⚠ Numele campului trebuie sa ramana identic in TREI locuri: aici, in
   * `CAMPURI_SECRETE` (lib/integrari/secrete.ts) si in `privat.campuri_secrete`
   * (migratia). Nimic nu verifica potrivirea, iar o nepotrivire taie tot stratul
   * de secrete in tacere. Vezi antetul migratiei.
   */
  api_key: string;
  /**
   * ⚠ ADRESA DE RIDICARE, NU UN ORAS.
   *
   * E `id`-ul unei adrese din `GET /client/address_list`. Se trimite ca
   * `sender_address_id` la emitere SI — cu un nume derutant — ca `sender_city` la
   * `POST /rates`. Documentatia lor chiar asa il numeste, desi celalalt camp din
   * aceeasi cerere, `delivery_city`, e un NUME de oras. Se alege din lista, cu
   * butonul de proba: scris de mana, un id gresit coteaza si expediaza dintr-un
   * alt depozit, fara nicio eroare.
   */
  sender_address_id?: number;
  /** Eticheta adresei alese, doar ca sa se vada in panou ce s-a ales. */
  sender_address_label?: string;
  /**
   * Curierii pe care comerciantul ii lasa sa apara in checkout, dupa slug
   * (`fancourier`, `cargus`, `dpd`, `gls`, `sameday`, `posta`, `fedex`).
   * Gol = toti cei pe care ii intoarce contul.
   */
  curieri_permisi?: string[];
  /** Ofera in checkout si serviciile care livreaza in locker sau punct PUDO. */
  foloseste_lockere?: boolean;
  /** Deschiderea coletului la livrare, unde curierul o suporta. Costa. */
  deschidere_la_livrare?: boolean;
  /** Asigura coletul la valoarea comenzii. Costa, deci e stins din oficiu. */
  asigura_coletul?: boolean;
  /** SMS catre destinatar la generarea AWB-ului. Costa. */
  notifica_destinatarul?: boolean;
  /** Ramburs rapid (Turbo). Se aplica DOAR cand comanda are ramburs. */
  ramburs_turbo?: boolean;
  /** Dimensiunile implicite ale coletului, in CENTIMETRI. */
  lungime_cm?: number;
  latime_cm?: number;
  inaltime_cm?: number;
  /** Textul de pe AWB cand comanda n-are altul. */
  continut_implicit?: string;
  /** Formatul etichetei descarcate din panou. */
  format_eticheta?: FormatEticheta;
};

/**
 * Aceeasi regula de „configurat" peste tot: panou, checkout, comanda, cron, lot.
 *
 * ⚠ Adresa de ridicare intra in ea, nu doar cheia. Fara `sender_address_id`,
 * `POST /rates` nu poate fi nici macar format — iar in checkout asta inseamna ca
 * toti cumparatorii vad tariful fix in loc de cel real, fara niciun semn ca
 * lipseste ceva. Aceeasi lectie ca la `smartshipGata`.
 */
export function shipoGata(c: ShipoConfig | null | undefined): c is ShipoConfig {
  return !!(
    c?.enabled
    && (c.api_key ?? "").trim()
    && Number(c.sender_address_id) > 0
  );
}

// ─── Tipurile raspunsurilor ───────────────────────────────────────────────────

export type ContShipo = {
  id: number;
  billing_type: string;
  name: string;
  email: string;
  status: string;
  /** ⚠ `[longitudine, latitudine]`. Vezi `coordPentruPuncte`. */
  coord?: [number, number];
};

export type AdresaExpeditor = {
  id: number;
  alias: string;
  name: string;
  company_name: string;
  phone: string;
  address_city_id: number;
  address_street_id: number;
  address_street_no: string;
};

export type OrasShipo = {
  id: number;
  label: string;
  value: string;
  county: string;
  /** ⚠ `[longitudine, latitudine]`, ca la `/client`. */
  coord?: [number, number];
};

export type StradaShipo = { id: number; label: string; value: string };

/** Un serviciu de curierat. `id` e ce se trimite mai tarziu ca `rate_id`. */
export type ServiciuShipo = {
  id: number;
  courier_id: number;
  type: string;
  sender_address_type: TipAdresa;
  recipient_address_type: TipAdresa;
  description: string;
};

export type TipAdresa = "address" | "locker" | "pudo";

export type CurierShipo = {
  id: number;
  name: string;
  slug: string;
  enabled: boolean;
  logo?: string;
  services?: ServiciuShipo[];
};

/** O linie din raspunsul lui `POST /rates`. */
export type TarifShipo = {
  rate_id: number;
  courier_slug: string;
  courier_name: string;
  service_type: string;
  total_fee: number;
  is_cod_available: boolean;
};

export type PunctShipo = {
  id: number;
  name: string;
  county: string;
  city: string;
  street: string;
  street_no: string;
  postal_code: string;
  address: string;
  lat: number;
  lng: number;
  opening_hours: string;
  accepted_payment: string;
  distance_km: number | null;
};

export type ColetShipo = {
  length: number;
  width: number;
  height: number;
  weight: number;
};

export type RaspunsExpediere = {
  expedition: number | null;
  awb: string | null;
  label_a4: string | null;
  label_a6: string | null;
};

export type UrmarireShipo = {
  awb: string | null;
  /** `status_delivery`-ul lor, ca SIR. Vezi `lib/shipo/statusuri.ts`. */
  status: string | null;
  descriere: string | null;
};

// ─── Citirea erorilor lor ─────────────────────────────────────────────────────

function textDinCamp(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    try { return JSON.stringify(v).slice(0, 300); } catch { return ""; }
  }
  return "";
}

/**
 * `errors` in forma pe care o folosesc ei: `{camp: ["mesaj", ...]}`.
 *
 * ⚠ Mesajele lor de validare sunt in ROMANA („Campul rate_id este obligatoriu.")
 * si sunt exact ce trebuie sa vada comerciantul, deci se trec mai departe cum
 * sunt — spre deosebire de codurile SmartShip, unde textul lor era o propozitie
 * de referinta si a trebuit rescris.
 */
function listaErorilor(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(textDinCamp).filter(Boolean);
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([camp, motiv]) => {
        const text = Array.isArray(motiv) ? motiv.map(textDinCamp).filter(Boolean).join(" ") : textDinCamp(motiv);
        return text ? `${camp}: ${text}` : "";
      })
      .filter(Boolean);
  }
  return typeof v === "string" ? [v.trim()].filter(Boolean) : [];
}

export function descrieEroarea(corp: unknown, brut: string): string {
  const bucati: string[] = [];
  if (corp && typeof corp === "object") {
    const o = corp as Record<string, unknown>;
    bucati.push(textDinCamp(o.message));
    /* `/auth` raspunde `{ "error": "Invalid auth-key" }`, fara `message`. */
    bucati.push(textDinCamp(o.error));
    bucati.push(...listaErorilor(o.errors));
  }
  const text = [...new Set(bucati.filter(Boolean))].join(" | ");
  if (text) return text.slice(0, 500);
  return brut.trim().slice(0, 300) || "raspuns gol";
}

/**
 * Raspunsul lor spune „am refuzat"?
 *
 * ⚠ Se verifica `success === false`, NU `!success`: majoritatea citirilor
 * (`/client`, `/city`, `/couriers`, `/rates/services`, si chiar `/rates` la
 * succes) nu au deloc campul, iar `!undefined` ar fi facut din fiecare raspuns
 * bun un refuz.
 */
function esteRefuz(corp: unknown): boolean {
  return !!corp && typeof corp === "object" && (corp as { success?: unknown }).success === false;
}

// ─── Tokenul, cu viata lui de o ora ───────────────────────────────────────────

/**
 * Tokenurile vii, pe cheie de API.
 *
 * ⚠ Cheia hartii e cheia de API, deci doua magazine cu conturi diferite nu se
 * pot amesteca niciodata. Harta traieste cat instanta serverless — la o instanta
 * noua se ia un token nou, ceea ce e corect si ieftin (un singur apel).
 *
 * `expiresIn` al lor e 3600 de secunde. Se scade o MARJA de 60 de secunde: un
 * token care expira intre verificare si folosire ar produce un 401 exact in
 * mijlocul unei emiteri, adica exact acolo unde nu vrem sa nu stim.
 */
const MARJA_TOKEN_MS = 60_000;
const tokenuri = new Map<string, { token: string; expiraLa: number }>();

/** Pentru probe: goleste tokenurile pastrate. */
export function uitaTokenurile(): void {
  tokenuri.clear();
}

async function token(cheieApi: string, forteaza = false): Promise<string> {
  const viu = tokenuri.get(cheieApi);
  if (!forteaza && viu && viu.expiraLa > Date.now()) return viu.token;

  let res: Response;
  try {
    res = await fetch(`${BAZA}/auth`, {
      method: "POST",
      /* ⚠ `auth-key`, cu CRATIMA. Redenumit de ei la 16.07.2026 din `auth_key`. */
      headers: { "auth-key": cheieApi, Accept: "application/json" },
      signal: AbortSignal.timeout(ASTEPTARE_AUTH_MS),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    throw eroareNesigura(`Shipo POST /auth: ${(e as Error).message}`);
  }

  const text = await res.text();
  let date: unknown = null;
  if (text.trim()) { try { date = JSON.parse(text); } catch { date = null; } }

  if (!res.ok) {
    /*
     * 401 si 403 sunt raspunsurile lor documentate pentru cheie lipsa sau
     * gresita. Amandoua sunt refuzuri DOVEDITE: n-au creat nimic, si reincercarea
     * cu aceeasi cheie va da la fel.
     */
    if (res.status === 401 || res.status === 403) {
      throw insemneaza(
        eroareRefuz("Shipo a respins cheia de API. Genereaza una noua din Setari → API, in contul Shipo, si pune-o aici."),
        res.status,
      );
    }
    throw insemneaza(
      eroareCuStatus(`Shipo POST /auth: ${res.status} — ${descrieEroarea(date, text)}`, res.status),
      res.status,
    );
  }

  const acces = (date as { access_token?: unknown } | null)?.access_token;
  if (typeof acces !== "string" || !acces.trim()) {
    throw eroareNesigura(`Shipo POST /auth: raspuns fara access_token — ${text.slice(0, 200)}`);
  }

  const secunde = Number((date as { expires_in?: unknown }).expires_in);
  const viata = Number.isFinite(secunde) && secunde > 0 ? secunde * 1000 : 3_600_000;
  tokenuri.set(cheieApi, { token: acces, expiraLa: Date.now() + Math.max(0, viata - MARJA_TOKEN_MS) });
  return acces;
}

// ─── Apelul ───────────────────────────────────────────────────────────────────

/**
 * Ce face cererea la ei — si de asta depinde cum se citeste un esec.
 *
 * `citire`  o cerere care NU creeaza nimic (cotare, nomenclatoare, urmarire).
 *           Orice esec al ei e refuz DOVEDIT: n-a ramas nimic in urma.
 * `scriere` o cerere care poate lasa ceva in urma (emitere, anulare).
 *           Un esec ambiguu iese `necunoscut` si BLOCHEAZA.
 *
 * ⚠ Nu se poate deduce din metoda HTTP: `POST /rates` si `POST /couriers` sunt
 * citiri, iar `GET /shipment/cancel/{awb}` e o scriere. De aia campul e
 * OBLIGATORIU in semnatura — asa `tsc` enumera apelantii si nimeni nu poate uita
 * sa se gandeasca la el. Acelasi rationament ca la `clasifica` din `cuRegistru`.
 *
 * Lectia vine din registrul de operatii externe: „Citirile pure ieseau «nu stim»
 * pe 5xx… Un GET nu creeaza nimic — orice esec al lui e refuz dovedit."
 */
type Efect = "citire" | "scriere";

/**
 * Un apel catre Shipo.
 *
 * ═══ VERDICTELE ═══
 *
 *   retea cazuta / timeout                -> citire: refuz. scriere: NU STIM.
 *   HTTP 4xx (fara 408)                   -> refuz dovedit.
 *   HTTP 5xx / 408                        -> citire: refuz. scriere: NU STIM.
 *   HTTP 2xx + `success:false` + `errors` -> refuz dovedit (validare: n-au creat nimic).
 *   HTTP 2xx + `success:false` fara erori -> citire: refuz. scriere: NU STIM.
 *   HTTP 2xx + corp necitibil             -> NU STIM.
 */
async function apel<T>(
  config: Pick<ShipoConfig, "api_key">,
  metoda: "GET" | "POST",
  cale: string,
  optiuni: { efect: Efect; corp?: unknown; asteptareMs?: number },
): Promise<T> {
  const cheie = (config.api_key ?? "").trim();
  if (!cheie) throw eroareRefuz("Lipseste cheia de API Shipo din configurare.");

  const { efect, corp } = optiuni;
  const asteptareMs = optiuni.asteptareMs ?? (efect === "scriere" ? ASTEPTARE_EMITERE_MS : ASTEPTARE_MS);
  /* Un esec ambiguu la o citire e refuz dovedit; la o scriere, nu stim. */
  const ambiguu = (mesaj: string) => (efect === "citire" ? eroareRefuz(mesaj) : eroareNesigura(mesaj));

  const trimite = async (acces: string): Promise<Response> => fetch(`${BAZA}${cale}`, {
    method: metoda,
    headers: {
      Authorization: `Bearer ${acces}`,
      Accept: "application/json",
      ...(corp !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: corp !== undefined ? JSON.stringify(corp) : undefined,
    signal: AbortSignal.timeout(asteptareMs),
    cache: "no-store",
    /* Un 3xx aici n-are ce cauta; urmat, ar putea aduce o pagina de login. */
    redirect: "manual",
  });

  let res: Response;
  try {
    res = await trimite(await token(cheie));
    /*
     * ⚠ O SINGURA reincercare, si numai pe 401.
     *
     * Tokenul lor traieste o ora, iar noi il pastram intr-o harta care poate
     * supravietui expirarii daca ceasul instantei si al lor nu bat exact. Un 401
     * pe o cerere obisnuita inseamna aproape sigur „token expirat", nu „cheie
     * gresita" — cheia gresita cade mai devreme, chiar la `/auth`.
     *
     * Reincercarea e sigura si pentru scrieri: un 401 inseamna ca cererea NU a
     * fost autorizata, deci nu s-a creat nimic. Mai mult de o data insa nu se
     * reincearca — o bucla pe un cont suspendat ar consuma bugetul cronului.
     */
    if (res.status === 401) res = await trimite(await token(cheie, true));
  } catch (e) {
    throw ambiguu(`Shipo ${metoda} ${cale}: ${(e as Error).message}`);
  }

  const text = await res.text();
  let date: unknown = null;
  if (text.trim()) { try { date = JSON.parse(text); } catch { date = null; } }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw insemneaza(
        eroareRefuz("Shipo a respins cheia de API. Verific-o in configurare."),
        res.status,
      );
    }
    /* 5xx si 408: serverul lor a cazut DUPA ce a primit cererea. */
    const mesaj = `Shipo ${metoda} ${cale}: ${res.status} — ${descrieEroarea(date, text)}`;
    const e = res.status >= 500 || res.status === 408
      ? ambiguu(mesaj)
      : eroareCuStatus(mesaj, res.status);
    throw insemneaza(e, res.status);
  }

  /*
   * ⚠ Un 2xx cu corp necitibil NU e succes: citit ca succes, am raporta o
   * expediere care poate nu exista; citit ca refuz, am debloca reincercarea.
   */
  if (date === null) {
    throw ambiguu(`Shipo ${metoda} ${cale}: raspuns necitibil (${res.status}) — ${text.slice(0, 200)}`);
  }

  /*
   * ⚠ AICI SE CITESTE A DOUA OARA. „No couriers deliver this shipment" si
   * „Shipment could not be canceled" sosesc amandoua cu HTTP 200.
   */
  if (esteRefuz(date)) {
    const mesaj = `Shipo ${metoda} ${cale}: ${descrieEroarea(date, text)}`;
    /*
     * `errors` prezent inseamna VALIDARE picata: cererea a fost citita, campurile
     * n-au trecut, si nu s-a creat nimic. Aia e dovada. Un `success:false` fara
     * `errors` la o SCRIERE („Shipment could not be sent to courier.") nu spune
     * daca expedierea exista sau nu la ei — si cum Shipo n-are cautare dupa
     * referinta noastra, singurul raspuns cinstit e „nu stim".
     */
    const areDetalii = listaErorilor((date as { errors?: unknown }).errors).length > 0;
    throw insemneaza(areDetalii ? eroareRefuz(mesaj) : ambiguu(mesaj), res.status);
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
    const d = (corp as { data?: unknown }).data;
    if (Array.isArray(d)) return d;
  }
  return [];
}

function obiecte<T>(v: unknown[]): T[] {
  return v.filter((x): x is T => !!x && typeof x === "object");
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

function numar(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ─── Coordonatele, si rasucirea lor ───────────────────────────────────────────

/**
 * ⚠ RASUCIREA. Singurul loc din aplicatie care o face.
 *
 * `/city` si `/client` intorc `coord: [longitudine, latitudine]` — documentat
 * chiar asa la `/client`, si verificabil: pentru Bucuresti dau `[26.10, 44.43]`,
 * iar 26.10 e longitudinea, 44.43 latitudinea.
 *
 * `/points` cere `coord=latitudine,longitudine` — documentat asa, cu exemplul
 * `46.7712,23.6236` pentru Cluj-Napoca, unde 46.77 e latitudinea.
 *
 * Trecut mai departe in ordinea in care vine, `[26.10, 44.43]` ar fi cerut puncte
 * langa latitudinea 26 si longitudinea 44 — adica in Marea Arabiei. Raspunsul ar
 * fi fost o lista GOALA, cu HTTP 200, iar cumparatorul ar fi citit „nu sunt
 * lockere in localitatea ta" intr-un oras plin de lockere.
 *
 * `null` cand perechea nu arata a coordonate pamantesti: mai bine o cautare dupa
 * nume de oras decat una dupa un punct inventat.
 */
export function coordPentruPuncte(coord: unknown): string | null {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const lng = Number(coord[0]);
  const lat = Number(coord[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  /* Amandoua zero inseamna „nu stiu", nu „Golful Guineei". */
  if (lat === 0 && lng === 0) return null;
  return `${lat},${lng}`;
}

// ─── Citiri ───────────────────────────────────────────────────────────────────

/**
 * Datele contului.
 *
 * E si proba de conexiune ideala: o citire pura, care nu creeaza nimic si nu
 * costa nimic, dar CERE tokenul — deci nu poate raspunde „bine" fara o cheie
 * valida. (Spre deosebire de fGO, unde „testeaza conexiunea" chema un
 * nomenclator public si trecea si cu credentiale inventate.)
 */
export async function cont(config: ShipoConfig): Promise<ContShipo> {
  const r = await apel<Record<string, unknown>>(config, "GET", "/client", { efect: "citire" });
  return {
    id: numar(r.id),
    billing_type: text(r.billing_type),
    name: text(r.name),
    email: text(r.email),
    status: text(r.status),
    coord: Array.isArray(r.coord) ? [numar(r.coord[0]), numar(r.coord[1])] : undefined,
  };
}

/**
 * Adresele de ridicare ale contului.
 *
 * ⚠ Din lista asta iese `sender_address_id` din configurare. Formatul s-a
 * schimbat la 23.07.2026: inainte, cand existau adrese, raspunsul era un OBIECT
 * indexat dupa id (`{"7": {...}}`) in loc de tablou. `lista()` acopera si forma
 * veche, fiindca nu stim ce versiune ruleaza contul fiecarui comerciant.
 */
export async function adreseExpeditor(config: ShipoConfig): Promise<AdresaExpeditor[]> {
  const r = await apel<unknown>(config, "GET", "/client/address_list", { efect: "citire" });
  const brute = Array.isArray(r)
    ? r
    : r && typeof r === "object"
      ? Object.values(r as Record<string, unknown>)
      : [];
  return obiecte<Record<string, unknown>>(brute)
    .map((a) => ({
      id: numar(a.id),
      alias: text(a.alias),
      name: text(a.name),
      company_name: text(a.company_name),
      phone: text(a.phone),
      address_city_id: numar(a.address_city_id),
      address_street_id: numar(a.address_street_id),
      address_street_no: text(a.address_street_no),
    }))
    .filter((a) => a.id > 0);
}

/** Cauta orase dupa nume. Minim 2 caractere, cere ei. */
export async function cautaOrase(config: ShipoConfig, termen: string): Promise<OrasShipo[]> {
  const t = termen.trim().slice(0, 100);
  if (t.length < 2) return [];
  const r = await apel<unknown>(config, "GET", `/city?term=${encodeURIComponent(t)}`, { efect: "citire" });
  return obiecte<Record<string, unknown>>(lista(r))
    .map((o) => ({
      id: numar(o.id),
      label: text(o.label),
      value: text(o.value),
      county: text(o.county),
      coord: Array.isArray(o.coord) ? [numar(o.coord[0]), numar(o.coord[1])] as [number, number] : undefined,
    }))
    .filter((o) => o.id > 0);
}

/** Cauta strazi intr-un oras. Rezultatul poate deveni `recipient_address_street_id`. */
export async function cautaStrazi(config: ShipoConfig, termen: string, oras: string): Promise<StradaShipo[]> {
  const t = termen.trim().slice(0, 100);
  const o = oras.trim();
  if (t.length < 2 || !o) return [];
  const cale = `/address?term=${encodeURIComponent(t)}&city=${encodeURIComponent(o)}`;
  const r = await apel<unknown>(config, "GET", cale, { efect: "citire" });
  return obiecte<Record<string, unknown>>(lista(r))
    .map((s) => ({ id: numar(s.id), label: text(s.label), value: text(s.value) }))
    .filter((s) => s.id > 0);
}

function citesteServiciu(s: Record<string, unknown>): ServiciuShipo {
  const tip = (v: unknown): TipAdresa => {
    const t = text(v);
    return t === "locker" || t === "pudo" ? t : "address";
  };
  return {
    id: numar(s.id),
    courier_id: numar(s.courier_id),
    type: text(s.type),
    sender_address_type: tip(s.sender_address_type),
    recipient_address_type: tip(s.recipient_address_type),
    description: text(s.description),
  };
}

/** Curierii activi ai contului, cu serviciile lor. */
export async function curieri(config: ShipoConfig): Promise<CurierShipo[]> {
  const r = await apel<unknown>(config, "POST", "/couriers", { efect: "citire", corp: {} });
  return obiecte<Record<string, unknown>>(lista(r, "couriers"))
    .map((c) => ({
      id: numar(c.id),
      name: text(c.name),
      slug: text(c.slug),
      enabled: c.enabled !== false,
      logo: text(c.logo) || undefined,
      services: obiecte<Record<string, unknown>>(Array.isArray(c.services) ? c.services : []).map(citesteServiciu),
    }))
    .filter((c) => c.slug.length > 0);
}

/**
 * TOATE serviciile contului.
 *
 * ⚠ Se citesc separat de tarife, si nu din lene: raspunsul lui `POST /rates` NU
 * spune daca un serviciu livreaza la adresa sau in locker — are doar
 * `service_type` („standard"). Tipul adreselor sta DOAR aici, iar fara el n-am
 * sti nici ce oferte sa aratam ca „livrare in locker", nici cand
 * `recipient_address_id` inseamna punct si cand adresa salvata.
 */
export async function servicii(config: ShipoConfig): Promise<ServiciuShipo[]> {
  const r = await apel<unknown>(config, "GET", "/rates/services", { efect: "citire" });
  return obiecte<Record<string, unknown>>(lista(r, "services")).map(citesteServiciu).filter((s) => s.id > 0);
}

export type CorpTarife = {
  /** ⚠ ID-ul ADRESEI de ridicare, nu al orasului. Vezi `ShipoConfig.sender_address_id`. */
  sender_city: number;
  /** Numele orasului de livrare. Aici chiar e un nume. */
  delivery_city: string;
  cod?: number;
  parcels?: ColetShipo[];
  courier?: string[];
};

/**
 * Tarifele pentru o ruta.
 *
 * ⚠ Raspunsul lor la SUCCES e un OBIECT indexat dupa `rate_id`
 * (`{"10": {...}, "15": {...}}`), nu un tablou — iar la esec tot un obiect,
 * `{success:false, message}`. Al doilea e prins deja de `apel()`; primul se
 * desface aici, cu `Object.values`.
 */
export async function tarife(config: ShipoConfig, corp: CorpTarife): Promise<TarifShipo[]> {
  const r = await apel<unknown>(config, "POST", "/rates", { efect: "citire", corp });
  if (!r || typeof r !== "object") return [];
  const valori = Array.isArray(r) ? r : Object.values(r as Record<string, unknown>);
  return obiecte<Record<string, unknown>>(valori)
    .map((t) => ({
      rate_id: numar(t.rate_id),
      courier_slug: text(t.courier_slug),
      courier_name: text(t.courier_name),
      service_type: text(t.service_type),
      total_fee: numar(t.total_fee),
      is_cod_available: t.is_cod_available !== false,
    }))
    .filter((t) => t.rate_id > 0);
}

export type FiltruPuncte = {
  rate_id: number;
  party?: "sender" | "recipient";
  city?: string;
  county?: string;
  term?: string;
  /** ⚠ Deja rasucit, in forma `lat,lng`. Vezi `coordPentruPuncte`. */
  coord?: string;
  radius?: number;
  max_results?: number;
};

/**
 * Lockerele si punctele PUDO valabile pentru un tarif.
 *
 * ⚠ Curierul si tipul punctului sunt DEDUSE de ei din `rate_id`, deci nu se
 * trimit — si nici nu se pot trimite.
 *
 * ⚠ Campurile pot fi goale, si documentatia lor spune care: Posta Romana si
 * Sameday nu trimit numarul stradal separat, `accepted_payment` lipseste la FAN
 * si la Posta, iar `opening_hours` e completat doar la punctele PUDO ale DPD si
 * Posta. Garantate la toti: `id`, `name`, `city`, `county`, `postal_code`,
 * `address`, `lat`, `lng`. Citirea de aici e tolerantă la restul.
 */
export async function puncte(config: ShipoConfig, filtru: FiltruPuncte): Promise<PunctShipo[]> {
  const q = new URLSearchParams({ rate_id: String(filtru.rate_id) });
  if (filtru.party) q.set("party", filtru.party);
  if (filtru.city?.trim()) q.set("city", filtru.city.trim());
  if (filtru.county?.trim()) q.set("county", filtru.county.trim());
  if (filtru.term?.trim()) q.set("term", filtru.term.trim());
  if (filtru.coord) q.set("coord", filtru.coord);
  /*
   * ⚠ `radius=0` NU inseamna „fara limita": documentatia lor spune ca valorile in
   * afara intervalului sunt aduse la limita, deci zero devine 0.1 km — 100 de
   * metri. Un zero scapat aici ar goli lista fara nicio eroare.
   */
  if (filtru.radius !== undefined && filtru.radius > 0) q.set("radius", String(filtru.radius));
  if (filtru.max_results !== undefined && filtru.max_results > 0) q.set("max_results", String(filtru.max_results));

  const r = await apel<unknown>(config, "GET", `/points?${q.toString()}`, { efect: "citire" });
  return obiecte<Record<string, unknown>>(lista(r, "points"))
    .map((p) => ({
      id: numar(p.id),
      name: text(p.name),
      county: text(p.county),
      city: text(p.city),
      street: text(p.street),
      street_no: text(p.street_no),
      postal_code: text(p.postal_code),
      address: text(p.address),
      lat: numar(p.lat),
      lng: numar(p.lng),
      opening_hours: text(p.opening_hours),
      accepted_payment: text(p.accepted_payment),
      distance_km: p.distance_km === undefined || p.distance_km === null ? null : numar(p.distance_km),
    }))
    .filter((p) => p.id > 0 && p.name.length > 0);
}

// ─── Scrieri ──────────────────────────────────────────────────────────────────

function citesteExpedierea(r: Record<string, unknown>): RaspunsExpediere {
  return {
    expedition: numar(r.expedition) > 0 ? numar(r.expedition) : null,
    awb: text(r.awb) || null,
    label_a4: text(r.label_a4) || null,
    label_a6: text(r.label_a6) || null,
  };
}

/**
 * Valideaza o expediere FARA sa o creeze.
 *
 * Aceiasi parametri ca la creare. Se foloseste in „Testeaza conexiunea" si
 * inainte de emiterile in lot: e singura cale de a afla ca o adresa e gresita
 * fara sa platesti un transport.
 */
export async function validesteExpediere(config: ShipoConfig, corp: Record<string, unknown>): Promise<true> {
  await apel<unknown>(config, "POST", "/shipment/validate", { efect: "citire", corp });
  return true;
}

/**
 * Creeaza expedierea si intoarce AWB-ul.
 *
 * ⚠ AICI E SINGURA AMBIGUITATE PE CARE DOCUMENTATIA LOR N-O LAMURESTE.
 *
 * `POST /shipment` intoarce deja `awb` si etichetele — deci pare ca expedierea
 * pleaca la curier pe loc. Dar exista si `POST /shipment/send/{id}`, „trimite o
 * expediere existenta catre curier", care intoarce si el `awb`. Documentatia nu
 * spune cand e nevoie de al doilea; cel mai probabil difera dupa `billing_type`
 * (prepaid contra postpaid), dar nicaieri nu scrie.
 *
 * Nu se ghiceste: se cheama crearea, si DACA raspunsul aduce un AWB, s-a
 * terminat. Daca aduce doar `expedition`, se cheama `/send/{expedition}` si
 * AWB-ul se ia de acolo. Acopera amandoua lumile fara sa presupunem niciuna, si
 * fara sa trimitem de doua ori la curier o expediere care plecase deja.
 */
export async function creeazaExpediere(config: ShipoConfig, corp: Record<string, unknown>): Promise<RaspunsExpediere> {
  const r = await apel<Record<string, unknown>>(config, "POST", "/shipment", { efect: "scriere", corp });
  const creata = citesteExpedierea(r);
  if (creata.awb) return creata;

  if (creata.expedition === null) {
    /*
     * Nici AWB, nici id de expediere, dar `success` n-a fost `false`. Nu stim ce
     * s-a intamplat la ei, si NU putem cauta dupa numarul comenzii noastre —
     * campul nu exista in API-ul lor. Blocheaza; registrul e singura plasa.
     */
    throw eroareNesigura("Shipo POST /shipment: raspuns fara AWB si fara id de expediere.");
  }

  const trimisa = await trimiteExpediere(config, creata.expedition);
  return {
    expedition: creata.expedition,
    awb: trimisa.awb,
    label_a4: trimisa.label_a4 ?? creata.label_a4,
    label_a6: trimisa.label_a6 ?? creata.label_a6,
  };
}

/** Trimite la curier o expediere deja creata. */
export async function trimiteExpediere(config: ShipoConfig, expeditie: number): Promise<RaspunsExpediere> {
  const r = await apel<Record<string, unknown>>(
    config, "POST", `/shipment/send/${encodeURIComponent(String(expeditie))}`, { efect: "scriere" },
  );
  const t = citesteExpedierea(r);
  if (!t.awb) {
    throw eroareNesigura(`Shipo POST /shipment/send/${expeditie}: raspuns fara AWB.`);
  }
  return t;
}

export type RezultatAnulare =
  | { anulat: true; eraDejaAnulat: boolean }
  | { anulat: false; motiv: string };

/**
 * Anuleaza o expediere dupa AWB.
 *
 * ⚠ E un GET care SCRIE. Asa e documentat (`GET /shipment/cancel/{awb}`), deci
 * `efect: "scriere"` se pune de mana — metoda HTTP minte aici.
 *
 * „Shipment not found" se citeste ca ANULAT, nu ca esec: la a doua apasare pe
 * acelasi buton, sau dupa o anulare facuta din contul Shipo, expedierea chiar nu
 * mai e acolo. Tratat ca esec, comerciantul ar ramane cu un AWB mort pe comanda
 * si fara niciun buton care sa-l scoata. (Defectul a fost trait la Packeta.)
 */
export async function anuleaza(config: ShipoConfig, awb: string): Promise<RezultatAnulare> {
  try {
    await apel<unknown>(config, "GET", `/shipment/cancel/${encodeURIComponent(awb)}`, { efect: "scriere" });
    return { anulat: true, eraDejaAnulat: false };
  } catch (e) {
    const mesaj = (e as Error).message ?? "";
    if (/not found|nu exista|already cancel|deja anulat/i.test(mesaj)) {
      return { anulat: true, eraDejaAnulat: true };
    }
    throw e;
  }
}

/**
 * Statusul curent al unei expedieri.
 *
 * ⚠ Se citeste `status`, care e STAREA EXPEDIERII, nu ultimul eveniment din
 * `statusLog`. Intre doua treceri ale cronului pot intra mai multe evenimente, si
 * ultimul poate fi unul administrativ — asa s-a pierdut o livrare la GLS.
 *
 * ⚠ Al treilea parametru NU e ornament: cronul il trimite ca sa nu cada pe
 * asteptarea implicita. La GLS implicitul era 60s, adica exact cat toata rularea,
 * si un singur colet care atarna consuma tura intreaga — iar cum el ramane primul
 * in coada, ar fi taiat FIECARE rulare, la nesfarsit.
 */
export async function urmareste(config: ShipoConfig, awb: string, asteptareMs?: number): Promise<UrmarireShipo> {
  const r = await apel<Record<string, unknown>>(
    config, "GET", `/tracking?awb=${encodeURIComponent(awb)}`, { efect: "citire", asteptareMs },
  );
  const d = (r.data && typeof r.data === "object" ? r.data : r) as Record<string, unknown>;
  return {
    awb: text(d.awb) || null,
    status: text(d.status) || null,
    descriere: text(d.statusName) || null,
  };
}

// ─── Eticheta ─────────────────────────────────────────────────────────────────

/**
 * Eticheta AWB, ca base64, adusa PRIN SERVERUL NOSTRU.
 *
 * ⚠ DE CE NU SE DA LINKUL LOR DIRECT IN BROWSER.
 *
 * Raspunsul de creare aduce `label_a4` si `label_a6`, adrese pe
 * `shipo.ro/downloader/awb/label_a4_12345.pdf`. Documentatia lor NU spune daca
 * sunt semnate, daca expira, sau daca cer sesiune — iar id-ul din nume e
 * secvential, deci daca sunt publice, oricine poate numara pana la etichetele
 * altor comercianti. O eticheta AWB poarta numele, telefonul si adresa
 * cumparatorului.
 *
 * Pana la o dovada, se trateaza ca resursa privata: se cere de pe server, cu
 * tokenul in antet (nevatamator daca nu e nevoie de el), si se verifica ca ce a
 * venit chiar e un PDF. Acelasi rationament care la SmartShip a fost obligatoriu,
 * fiindca acolo linkul continea chiar cheia de API in cale.
 */
export async function eticheta(config: ShipoConfig, url: string): Promise<{ base64: string; nume: string }> {
  const adresa = url.trim();
  /* Numai de la ei, si numai peste https: un link din raspuns nu e de incredere. */
  if (!/^https:\/\/([a-z0-9-]+\.)*shipo\.ro\//i.test(adresa)) {
    throw eroareRefuz("Adresa etichetei nu e de pe shipo.ro. Reemite AWB-ul.");
  }

  let res: Response;
  try {
    res = await fetch(adresa, {
      headers: { Authorization: `Bearer ${await token((config.api_key ?? "").trim())}`, Accept: "application/pdf" },
      signal: AbortSignal.timeout(ASTEPTARE_EMITERE_MS),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (e) {
    throw eroareNesigura(`Shipo eticheta: ${(e as Error).message}`);
  }

  if (!res.ok) {
    throw insemneaza(eroareCuStatus(`Shipo eticheta: ${res.status}`, res.status), res.status);
  }

  const octeti = Buffer.from(await res.arrayBuffer());
  /*
   * ⚠ Un 200 poate purta o pagina de login sau JSON-ul lor de eroare. Semnatura
   * `%PDF` e singura dovada ca avem chiar eticheta — la SmartShip, fara
   * verificarea asta, comerciantul ar fi descarcat un fisier care nu se deschide.
   */
  if (octeti.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw eroareRefuz("Shipo n-a intors un PDF pentru eticheta. Incearca din nou sau descarc-o din contul Shipo.");
  }

  const nume = adresa.split("/").pop()?.split("?")[0] || "eticheta.pdf";
  return { base64: octeti.toString("base64"), nume: nume.endsWith(".pdf") ? nume : `${nume}.pdf` };
}

// ─── Proba de conexiune ───────────────────────────────────────────────────────

export type RezultatProba =
  | { ok: true; cont: ContShipo; adrese: AdresaExpeditor[] }
  | { ok: false; eroare: string };

/**
 * Proba de conexiune, care si ADUCE date.
 *
 * Cere doua resurse care AMANDOUA au nevoie de token valid: datele contului si
 * lista adreselor de ridicare. A doua nu e decorativa — din ea se alege
 * `sender_address_id`, iar fara el nici cotarea, nici emiterea nu pot fi formate.
 * Un buton care ar raspunde doar „conexiune reusita" ar lasa comerciantul cu o
 * configurare care trece proba si cade la prima comanda.
 */
export async function probaConexiune(config: ShipoConfig): Promise<RezultatProba> {
  try {
    const [c, adrese] = await Promise.all([cont(config), adreseExpeditor(config)]);
    return { ok: true, cont: c, adrese };
  } catch (e) {
    return { ok: false, eroare: (e as Error).message || "Cerere esuata" };
  }
}
