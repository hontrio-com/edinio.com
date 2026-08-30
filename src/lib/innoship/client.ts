import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";

/**
 * Clientul Innoship.
 *
 * ═══ CE E ═══
 *
 * Un BROKER, ca Woot, Colete Online si eColet — dar de alt ordin de marime:
 * ~230 de curieri din 20+ tari, si ii cuprinde pe TOTI cei noua pe care ii avem
 * integrati direct, Posta Romana inclusiv.
 *
 * ⚠ De aceea panoul avertizeaza cand acelasi curier e activ si direct, si prin
 * Innoship (hotarat cu clientul, varianta B): sunt doua contracte adevarate, la
 * preturi diferite, si cumparatorul le-ar vedea pe amandoua fara sa inteleaga.
 *
 * ═══ DOUA GAZDE, SI UN CALENDAR ═══
 *
 *   api.innoship.com    SCRIERI: Order, Price, Label, Voucher, Manifest, Pickup
 *   query.innoship.com  CITIRI:  Track, Location, Courier/All, Order GET, Feedback
 *
 * Separarea e din 20.07.2026, iar endpointurile de citire se RETRAG de pe `api`
 * la 30.06.2027. Noi ne nastem migrati: citirile pleaca de la inceput catre
 * `query`, deci n-avem ce migra. Cele doua gazde stau in doua constante tocmai ca
 * sa nu se poata amesteca dintr-o scapare.
 *
 * ═══ ⚠ `api-version` SE TRIMITE DE DOUA ORI, SI NU E DIN PRUDENTA ═══
 *
 * Articolul lor de suport spune ca e un ANTET. Swagger-ul spune altceva, si mai
 * strict — pe fiecare operatie campul apare de doua ori:
 *
 *     { "name": "api-version", "in": "query",  "required": true, "default": "1.0" }
 *     { "name": "api-version", "in": "header",                   "default": "1.0" }
 *
 * Ca parametru de ADRESA e obligatoriu; ca antet, nu. Un client scris dupa articol
 * poate primi 400 pe absolut toate cererile, iar mesajul n-o sa spuna „lipseste
 * api-version din query". Se trimit amandoua: costa un parametru si inchide o
 * intrebare pe care n-o putem lamuri altfel.
 */

/** Gazda pentru tot ce CREEAZA sau schimba ceva. */
const BAZA_SCRIERE = "https://api.innoship.com";
/**
 * Gazda pentru citiri. ⚠ NU `api.innoship.com`: acolo aceleasi cai se retrag la
 * 30.06.2027. Vezi „Endpoint Migration Notice".
 */
const BAZA_CITIRE = "https://query.innoship.com";

const VERSIUNE_API = "1.0";

/** Citirile din calea cumparatorului: cotare, puncte de ridicare. */
const ASTEPTARE_MS = 20_000;
/** Emiterea si etichetele: pornite de comerciant, isi permit mai mult. */
const ASTEPTARE_EMITERE_MS = 45_000;

/**
 * Statusul HTTP, pastrat PE eroare. Acelasi tipar ca la eColet, Pall-Ex si Posta:
 * cine trateaza „nu exista acolo" (404) altfel decat un refuz oarecare are nevoie
 * de numar, iar statusul nu trebuie cautat in textul erorii.
 */
const CHEIE_STATUS = "statusHttp" as const;

export function statusEroare(e: unknown): number | null {
  const v = (e as { [CHEIE_STATUS]?: unknown } | null)?.[CHEIE_STATUS];
  return typeof v === "number" ? v : null;
}

/**
 * `correlationId`-ul lor, pastrat pe eroare.
 *
 * ⚠ E numarul pe care il cere suportul Innoship. Pierdut, o expediere care a picat
 * nu mai poate fi cautata la ei — iar noi n-avem cum sa refacem contextul. Se duce
 * pana in registrul de operatii externe.
 */
const CHEIE_CORELARE = "correlationIdFurnizor" as const;

export function corelareEroare(e: unknown): string | null {
  const v = (e as { [CHEIE_CORELARE]?: unknown } | null)?.[CHEIE_CORELARE];
  return typeof v === "string" && v ? v : null;
}

function insemneaza(e: Error, status: number, corelare: string | null): Error {
  const cu = e as Error & { [CHEIE_STATUS]?: number; [CHEIE_CORELARE]?: string };
  cu[CHEIE_STATUS] = status;
  if (corelare) cu[CHEIE_CORELARE] = corelare;
  return e;
}

// ─── Configurarea ─────────────────────────────────────────────────────────────

/** Formatele de eticheta din enum-ul lor (`LabelFormat`). */
export type FormatEticheta = "A4" | "A6" | "T_85x85" | "A6_300dpi" | "A4_4xA6" | "A6_10x9" | "A5";
/** Tipurile de fisier (`LabelType`). */
export type TipEticheta = "Pdf" | "Html" | "Zpl" | "Epl" | "Clp";

/**
 * Serviciile din tabelul lor.
 *
 * ⚠ NU e decor si nu e sinonim cu „pretul": schimba TIPUL livrarii. Trimis `1`
 * pentru o comanda in care cumparatorul a ales un locker, coletul pleaca spre
 * domiciliu.
 */
export const SERVICIU = {
  domiciliu: 1,
  cargo: 11,
  palet: 12,
  sameDay: 6,
  locker: 3,
  pudo: 4,
  internationalRutier: 5,
  internationalAerian: 51,
  internationalLocker: 53,
  internationalPudo: 54,
} as const;

export type ServiciiInnoship = {
  openPackage?: boolean;
  saturdayDelivery?: boolean;
  returnOfDocuments?: boolean;
  returnPackage?: boolean;
  returnVoucher?: boolean;
};

export type InnoshipConfig = {
  enabled: boolean;
  /** Cheia trimisa ca `X-Api-Key`. Criptata in repaus, mascata in formular. */
  api_key: string;
  /**
   * ⚠ OBLIGATORIU la fiecare comanda: depozitul care declanseaza expedierea,
   * configurat de comerciant in portalul Innoship („Locations"). Il stie doar el —
   * ca `cod_trimitere` la Posta Romana.
   */
  external_client_location: string;
  /**
   * Partea secreta din URL-ul de „Track push". ⚠ Criptata in repaus, dar NU
   * mascata: omul trebuie s-o poata copia in portalul lor. Vezi `secrete.ts`.
   */
  webhook_secret?: string;
  /**
   * Curierii pe care comerciantul ii lasa sa apara in checkout (`courierId`).
   * Gol = toti cei pe care ii da contul.
   *
   * ⚠ Cu ~230 de curieri, filtrul asta nu e o inlesnire, e o conditie de
   * lizibilitate: nefiltrat, cumparatorul poate primi zeci de oferte.
   */
  curieri_permisi?: number[];
  /** Serviciile folosite pe fiecare fel de livrare. Implicit 1 / 3 / 4. */
  serviciu_domiciliu?: number;
  serviciu_locker?: number;
  serviciu_pudo?: number;
  format_eticheta?: FormatEticheta;
  tip_eticheta?: TipEticheta;
  servicii?: ServiciiInnoship;
  /** Text pe eticheta (`observation`, max 500). */
  observatii?: string;
};

/** Aceeasi regula de „configurat" peste tot: panou, checkout, comanda, cron, lot. */
export function innoshipGata(c: InnoshipConfig | null | undefined): c is InnoshipConfig {
  return !!(c?.enabled && c.api_key && c.external_client_location);
}

// ─── Tipurile cererii ─────────────────────────────────────────────────────────

export type AdresaInnoship = {
  name?: string;
  contactPerson?: string;
  country?: string;
  countyName?: string;
  localityName?: string;
  addressText?: string;
  streetName?: string;
  streetNumber?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  /** Id-ul punctului din nomenclatorul LOR. Obligatoriu la locker si PUDO. */
  fixedLocationId?: string;
};

export type ContinutInnoship = {
  envelopeCount: number;
  parcelsCount: number;
  palettesCount: number;
  totalWeight: number;
  contents: string;
  package?: string;
  oversizedPackage?: boolean;
};

export type ExtraInnoship = {
  cashOnDeliveryAmount?: number;
  cashOnDeliveryAmountCurrency?: string;
  declaredValueAmount?: number;
  declaredValueAmountCurrency?: string;
  insuranceAmount?: number;
  insuranceAmountCurrency?: string;
  openPackage?: boolean;
  saturdayDelivery?: boolean;
  returnOfDocuments?: boolean;
  returnPackage?: boolean;
  returnVoucher?: boolean;
  reference1?: string;
  reference2?: string;
};

export type CorpComanda = {
  serviceId: number;
  /** Forteaza un curier anume. Gol la cotare: atunci raspund cu toti. */
  courierId?: number;
  shipmentDate: string;
  addressFrom?: AdresaInnoship;
  addressTo: AdresaInnoship;
  payment: "Sender" | "Recipient" | "ThirdParty";
  content: ContinutInnoship;
  extra?: ExtraInnoship;
  externalClientLocation: string;
  externalOrderId?: string;
  observation?: string;
  parameters?: {
    async?: boolean;
    getParcelsBarcodes?: boolean;
    includeCourierResponse?: boolean;
    includePriceBreakdown?: boolean;
  };
  clientSettings?: {
    clientPreferences?: { preferredLabel?: FormatEticheta };
  };
};

// ─── Tipurile raspunsurilor ───────────────────────────────────────────────────

/** O oferta din `POST /api/Price`. */
export type OfertaInnoship = {
  carrierId?: number;
  carrier?: string | null;
  rateAmount?: number;
  rateVatAmount?: number;
  rateTotalAmount?: number;
  rateCurrency?: string | null;
  score?: number;
  performance?: number;
  calculatedBusinessDays?: number | null;
  deliveryDays?: number;
  serviceId?: number;
  service?: string | null;
  optionId?: string | null;
  optionName?: string | null;
  priority?: number;
};

export type RaspunsComanda = {
  clientOrderId?: number | null;
  /** ⚠ AWB-ul. Numele campului nu seamana cu ce poarta. */
  courierShipmentId?: string | null;
  courierShipmentVoucher?: string | null;
  externalOrderId?: string | null;
  courier?: number;
  courierServiceName?: string | null;
  price?: { amount?: number; vat?: number; totalAmount?: number; currency?: string | null } | null;
  calculatedDeliveryDate?: string | null;
  trackPageUrl?: string | null;
  trackingNumber?: string | null;
  courierTrackPageUrl?: string | null;
};

/** O stare din istoric. Aceeasi forma si in Track, si in webhookul „Track push". */
export type StareInnoship = {
  clientStatusId?: number | null;
  clientStatusDescription?: string | null;
  eventDate?: string | null;
  isFinalStatus?: boolean | null;
  localityName?: string | null;
};

export type UrmarireInnoship = {
  orderId?: number | null;
  externalOrderId?: string | null;
  correlationId?: string | null;
  courier?: number | null;
  shipmentAwb?: string | null;
  trackingNumber?: string | null;
  trackUrl?: string | null;
  currentStatus?: string | null;
  currentStatusId?: number | null;
  history?: StareInnoship[] | null;
  /** ⚠ Statusul BANILOR, separat de al coletului. Niciun alt curier nu ni-l da. */
  cashOnDeliveryHistory?: StareInnoship[] | null;
  returnAwb?: string | null;
  returnAwbHistory?: StareInnoship[] | null;
};

export type CurierInnoship = {
  courierId?: number;
  courier?: string | null;
  courierDisplayName?: string | null;
};

/** Un punct de ridicare. ⚠ Forma NU e documentata in spec — vezi `puncte.ts`. */
export type PunctFix = Record<string, unknown>;

// ─── Cererea ──────────────────────────────────────────────────────────────────

/**
 * Un apel catre Innoship.
 *
 * ═══ VERDICTELE ═══
 *
 *   400  refuz DOVEDIT de validare. Forma e documentata (`ErrorResponse`), deci
 *        mesajul care ajunge la comerciant e chiar al lor.
 *   401  cheie respinsa. Tot refuz dovedit.
 *   5xx, timeout, corp necitibil -> NU STIM. Registrul blocheaza si scoate la om.
 */
async function apel<T>(
  config: Pick<InnoshipConfig, "api_key">,
  metoda: "GET" | "POST" | "DELETE",
  baza: string,
  cale: string,
  corp?: unknown,
  asteptareMs = ASTEPTARE_MS,
): Promise<T> {
  /* ⚠ `api-version` si in adresa, si in antet. Vezi antetul fisierului. */
  const separator = cale.includes("?") ? "&" : "?";
  const url = `${baza}${cale}${separator}api-version=${VERSIUNE_API}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: metoda,
      headers: {
        "X-Api-Key": config.api_key,
        "api-version": VERSIUNE_API,
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
    /* Retea cazuta sau timeout: nu stim daca cererea a ajuns. */
    throw eroareNesigura(`Innoship ${metoda} ${cale}: ${(e as Error).message}`);
  }

  const text = await res.text();
  let date: unknown = null;
  if (text.trim()) {
    try { date = JSON.parse(text); } catch { date = null; }
  }

  if (!res.ok) {
    const corelare = citesteCorelarea(date);
    if (res.status === 401 || res.status === 403) {
      throw insemneaza(
        eroareRefuz("Innoship a respins cheia de API. Verific-o in configurare."),
        res.status, corelare,
      );
    }
    throw insemneaza(
      eroareCuStatus(`Innoship ${metoda} ${cale}: ${res.status} — ${descrieEroarea(date, text)}`, res.status),
      res.status, corelare,
    );
  }

  /*
   * ⚠ Un 2xx cu corp necitibil NU e succes: citit ca succes, am raporta o
   * expediere care poate nu exista; citit ca refuz, am debloca reincercarea.
   * Amandoua gresite — verdictul cinstit e „nu stim".
   */
  if (text.trim() && date === null) {
    throw eroareNesigura(
      `Innoship ${metoda} ${cale}: raspuns necitibil (${res.status}) — ${text.slice(0, 200)}`,
    );
  }

  return date as T;
}

export function citesteCorelarea(corp: unknown): string | null {
  if (corp && typeof corp === "object") {
    const v = (corp as { correlationId?: unknown }).correlationId;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Mesajul de eroare, din forma lor documentata.
 *
 * `ErrorResponse { errors: [{ message, details }], correlationId }`.
 * ⚠ Se pastreaza si `correlationId` in text: e numarul pe care il cere suportul
 * lor, iar comerciantul il are atunci la indemana fara sa scormone in loguri.
 */
export function descrieEroarea(corp: unknown, brut: string): string {
  if (corp && typeof corp === "object") {
    const o = corp as { errors?: unknown; correlationId?: unknown; message?: unknown; title?: unknown };
    const bucati: string[] = [];

    if (Array.isArray(o.errors)) {
      for (const it of o.errors) {
        if (!it || typeof it !== "object") continue;
        const e = it as { message?: unknown; details?: unknown };
        const m = typeof e.message === "string" ? e.message.trim() : "";
        const d = typeof e.details === "string" ? e.details.trim() : "";
        const text = [m, d].filter(Boolean).join(": ");
        if (text) bucati.push(text);
      }
    }

    /* Formele de rezerva: 401 si erorile de infrastructura pot veni altfel. */
    if (bucati.length === 0) {
      for (const cheie of ["message", "title", "error"] as const) {
        const v = (o as Record<string, unknown>)[cheie];
        if (typeof v === "string" && v.trim()) { bucati.push(v.trim()); break; }
      }
    }

    const corelare = citesteCorelarea(corp);
    if (bucati.length) {
      return (bucati.join(" | ") + (corelare ? ` (referinta Innoship: ${corelare})` : "")).slice(0, 500);
    }
  }
  return brut.trim().slice(0, 300) || "raspuns gol";
}

// ─── Nomenclatoare (CITIRI, pe `query`) ───────────────────────────────────────

/**
 * Catalogul de curieri al contului.
 *
 * ⚠ E si proba de conexiune, dinadins: e o citire pura — nu creeaza nimic, deci
 * butonul se poate apasa de zece ori — si aduce exact lista de care are nevoie
 * configurarea ca sa poata filtra curierii.
 */
export async function catalogCurieri(config: InnoshipConfig): Promise<CurierInnoship[]> {
  const r = await apel<unknown>(config, "GET", BAZA_CITIRE, "/api/Courier/All");
  const lista = Array.isArray(r) ? r : Array.isArray((r as { data?: unknown })?.data) ? (r as { data: unknown[] }).data : [];
  return lista.filter((x): x is CurierInnoship => !!x && typeof x === "object");
}

export type RezultatProba =
  | { ok: true; curieri: CurierInnoship[] }
  | { ok: false; eroare: string };

export async function probaConexiune(config: InnoshipConfig): Promise<RezultatProba> {
  try {
    return { ok: true, curieri: await catalogCurieri(config) };
  } catch (e) {
    return { ok: false, eroare: (e as Error).message };
  }
}

/**
 * Punctele de ridicare (lockere si PUDO).
 *
 * ⚠ Singurul contract important pe care specificatia NU il descrie: raspunsul lui
 * `GET /api/Location/FixedLocations` n-are schema. Filtrele SUNT documentate, si
 * sunt bogate — inclusiv `Latitude`/`Longitude`/`Radius`, pe care niciun alt
 * curier nu ni le da. Forma randului se afla pe fir, la prima cheie de test; pana
 * atunci `puncte.ts` o cauta prin numele cu putinta.
 */
export async function puncteFixe(
  config: InnoshipConfig,
  filtre: { courier?: number; countryCode?: string; countyName?: string; localityName?: string; postalCode?: string },
): Promise<PunctFix[]> {
  const p = new URLSearchParams();
  if (filtre.courier !== undefined) p.set("Courier", String(filtre.courier));
  if (filtre.countryCode) p.set("CountryCode", filtre.countryCode);
  if (filtre.countyName) p.set("CountyName", filtre.countyName);
  if (filtre.localityName) p.set("LocalityName", filtre.localityName);
  if (filtre.postalCode) p.set("PostalCode", filtre.postalCode);

  const r = await apel<unknown>(config, "GET", BAZA_CITIRE, `/api/Location/FixedLocations?${p.toString()}`);
  const lista = Array.isArray(r) ? r : Array.isArray((r as { data?: unknown })?.data) ? (r as { data: unknown[] }).data : [];
  return lista.filter((x): x is PunctFix => !!x && typeof x === "object");
}

// ─── Cotare (CITIRE la efect, dar POST) ───────────────────────────────────────

/**
 * Preturile pentru o expediere, pe toti curierii deodata.
 *
 * ⚠ Nu creeaza nimic, oricat de des ar fi chemata — de aia poate sta in calea
 * cumparatorului. Dar E un apel platit catre contul comerciantului, deci trece
 * prin aceleasi plafoane ca ceilalti brokeri.
 *
 * ⚠ Primeste EXACT acelasi corp ca emiterea. Vezi `expediere.ts`: un singur
 * constructor pentru amandoua, altfel comanda pleaca pe alt pret decat cel cotat.
 */
export async function coteaza(config: InnoshipConfig, corp: CorpComanda): Promise<OfertaInnoship[]> {
  const r = await apel<{ rates?: unknown }>(config, "POST", BAZA_SCRIERE, "/api/Price", corp);
  const rates = Array.isArray(r?.rates) ? r.rates : [];
  return rates.filter((x): x is OfertaInnoship => !!x && typeof x === "object");
}

// ─── Emitere ──────────────────────────────────────────────────────────────────

/**
 * Valideaza o comanda FARA sa creeze nimic.
 *
 * ⚠ Innoship are ceva ce nu are niciun alt transportator din platforma: doua
 * endpointuri de proba (`/validate` si `/simulate`). Se pot chema oricat. De aia
 * integrarea asta se poate verifica pe fir, cap-coada, inainte de prima expediere
 * reala — spre deosebire de Posta Romana, unde singurul lucru probabil era
 * constructorul pur.
 */
export async function valideaza(config: InnoshipConfig, corp: CorpComanda): Promise<RaspunsComanda> {
  return apel<RaspunsComanda>(config, "POST", BAZA_SCRIERE, "/api/Order/validate", corp, ASTEPTARE_EMITERE_MS);
}

/**
 * Creeaza expedierea.
 *
 * ⚠ CREEAZA UN TRANSPORT REAL, facturat. Nu se cheama de doua ori pentru aceeasi
 * comanda fara sa treaca prin registrul de operatii externe.
 *
 * ⚠ `parameters.async` ramane FALS. Pornit, emiterea ne-ar aduce inapoi fereastra
 * oarba de la eColet — expediere creata, AWB inca necunoscut — pe care contractul
 * asta ne-o scuteste: raspunsul sincron contine chiar `courierShipmentId`.
 */
export async function creeazaComanda(config: InnoshipConfig, corp: CorpComanda): Promise<RaspunsComanda> {
  const r = await apel<RaspunsComanda>(
    config, "POST", BAZA_SCRIERE, "/api/Order",
    { ...corp, parameters: { ...corp.parameters, async: false } },
    ASTEPTARE_EMITERE_MS,
  );
  if (!r || typeof r !== "object") {
    throw eroareNesigura("Innoship a raspuns la emitere cu un corp pe care nu l-am putut citi.");
  }
  return r;
}

/**
 * Anuleaza expedierea.
 *
 * `sters` in loc de exceptie la 404, ca la eColet si Pall-Ex: o anulare intrata in
 * timeout DUPA ce Innoship apucase sa stearga ar lasa comanda cu un AWB pe care
 * nimeni nu-l mai poate scoate — nici anulat (nu mai exista), nici reemis
 * (registrul il tine ocupat). Hotararea se ia pe STATUSUL HTTP, nu pe text.
 */
export async function anuleaza(
  config: InnoshipConfig,
  courierId: number,
  awb: string,
): Promise<{ sters: true } | { sters: false; motiv: string }> {
  try {
    await apel<unknown>(
      config, "DELETE", BAZA_SCRIERE,
      `/api/Order/${courierId}/awb/${encodeURIComponent(awb)}`,
      undefined, ASTEPTARE_EMITERE_MS,
    );
    return { sters: true };
  } catch (e) {
    if (statusEroare(e) === 404) return { sters: true };
    return { sters: false, motiv: (e as Error).message };
  }
}

// ─── Eticheta ─────────────────────────────────────────────────────────────────

/**
 * Eticheta unei expedieri.
 *
 * ⚠ `labels` e o LISTA, nu un sir: o expediere cu mai multe colete are mai multe
 * etichete. Cine o serveste mai departe trebuie sa stie asta din prima.
 *
 * ⚠ Citire pura: se poate cere de cate ori e nevoie, spre deosebire de GLS unde a
 * doua chemare a metodei de emitere ar fi creat un al doilea colet.
 */
export async function eticheta(
  config: InnoshipConfig,
  courierId: number,
  awb: string,
): Promise<{ etichete: string[]; tip: string | null }> {
  const r = await apel<{ labels?: unknown; contents?: unknown }>(
    config, "GET", BAZA_SCRIERE,
    `/api/Label/by-courier/${courierId}/awb/${encodeURIComponent(awb)}`,
    undefined, ASTEPTARE_EMITERE_MS,
  );
  const etichete = Array.isArray(r?.labels)
    ? r.labels.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  return { etichete, tip: typeof r?.contents === "string" ? r.contents : null };
}

// ─── Urmarire (CITIRI, pe `query`) ────────────────────────────────────────────

/**
 * Urmarirea mai multor expedieri, dupa ID-UL NOSTRU de comanda.
 *
 * ⚠ ASTA E CEL MAI BUN CONTRACT DE URMARIRE DIN TOATA PLATFORMA, si merita spus
 * de ce: nu avem nevoie de AWB-ul lor ca sa intrebam. Deci
 *   - cronul poate cere zeci de comenzi intr-un apel (ca la eColet, spre deosebire
 *     de GLS, Pall-Ex si Posta, unde e un apel pe colet);
 *   - iar dupa o emitere al carei raspuns s-a pierdut, putem AFLA daca expedierea
 *     exista — cu o citire, nu cu o presupunere. Nicio alta integrare nu poate.
 *
 * ⚠ Raspunsul poate sa NU contina toate comenzile cerute. Apelantul TREBUIE sa
 * marcheze ca verificate toate cele CERUTE, nu doar cele intoarse — altfel cele
 * necunoscute raman cu marcaj gol si blocheaza pentru totdeauna capul cozii.
 */
export async function urmarestePeComenzi(
  config: InnoshipConfig,
  externalOrderIds: string[],
  asteptareMs?: number,
): Promise<UrmarireInnoship[]> {
  const curate = [...new Set(externalOrderIds.map((x) => (x ?? "").trim()).filter(Boolean))];
  if (curate.length === 0) return [];

  const r = await apel<unknown>(
    config, "POST", BAZA_CITIRE, "/api/Track/by-external-order-id",
    { externalOrderId: curate }, asteptareMs,
  );
  const lista = Array.isArray(r) ? r : Array.isArray((r as { data?: unknown })?.data) ? (r as { data: unknown[] }).data : [];
  return lista.filter((x): x is UrmarireInnoship => !!x && typeof x === "object");
}

/**
 * ⚠ Cate comenzi intr-o cerere.
 *
 * Specificatia nu publica nicio limita, deci numarul e ales de noi, prudent: daca
 * Innoship respinge vreodata loturile mari, esecul se vede pe o singura felie, nu
 * pe toata rularea.
 */
export const MAX_COMENZI_PE_CERERE = 50;
