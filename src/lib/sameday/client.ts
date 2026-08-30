import { normalizePhone } from "@/lib/utils/phone";
import { normalizeCountyName, localitateSameday } from "@/lib/utils/ro-address";
import { eroareCuStatus, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";

const PROD_URL = "https://api.sameday.ro";
const SANDBOX_URL = "https://sameday-api.demo.zitec.com";

export type SamedayConfig = {
  enabled: boolean;
  username: string;
  password: string;
  sandbox: boolean;
  pickup_point_id: number;
  contact_person_id: number;
  service_id: number;
  service_name: string;
};

export type SamedayPickupPoint = {
  id: number;
  alias: string;
  address: {
    name: string;
    street: string;
    city: { name: string };
    county: { name: string };
  };
  contactPersons: {
    id: number;
    name: string;
    isDefault: boolean;
  }[];
};

/**
 * O extraoptiune a unui serviciu, asa cum o intoarce contul.
 *
 * ═══ ⚠ ID-UL E AL CONTULUI, SI E ALTUL PE FIECARE SERVICIU SI TIP DE COLET ═══
 *
 * Masurat pe un cont real: „Predare personala in punct fix" are id 674262 pe serviciul 24H
 * cu tip de colet 0, dar 690892 pe Locker NextDay cu acelasi tip. Deci id-ul NU se poate
 * scrie in cod si nici macar tine minte pe cont — se cauta de fiecare data in serviciul
 * ALES, la tipul de colet din cerere.
 *
 * ⚠ Documentatia spune sa trimiti „PDO 123456", adica si codul si id-ul.
 */
export type SamedayExtraOptiune = {
  /** `PDO`, `SWAP`, `OPCG`, `RDOC`, `TBC`. */
  taxCode: string;
  name: string;
  /** ⚠ Unic pe (cont, serviciu, tip de colet). */
  id: number;
  tax: number;
  packageType: 0 | 1 | 2;
};

export type SamedayService = {
  id: number;
  name: string;
  code: string;
  /** `NextDay` s.a.m.d. */
  deliveryType: string;
  optiuni: SamedayExtraOptiune[];
};

/** Cine ridica coletul cand nu se ridica de la punctul nostru de lucru. */
export type SamedayTert = {
  name: string;
  phoneNumber: string;
  email?: string;
  /** 0 = persoana fizica, 1 = juridica. */
  personType?: 0 | 1;
  companyName?: string;
  county?: string;
  city?: string;
  address?: string;
  postalCode?: string;
};

export type SamedayAwbInput = {
  recipientName: string;
  recipientPhone: string;
  recipientCounty: string;    // string name — Sameday auto-mapeaza
  recipientCity: string;      // string name — Sameday auto-mapeaza
  recipientAddress: string;
  recipientPostalCode: string;
  /**
   * ⚠ La livrarea in easybox, aici omul isi primeste codul de deschidere.
   *
   * Nu e un camp de decor: la un colet lasat intr-un dulap nu vine niciun curier care sa
   * sune la usa. Ambele exemple de locker din documentatia lor il poarta.
   */
  recipientEmail?: string;
  /** 0 = persoana fizica (implicit), 1 = juridica; atunci `recipientCompany` e ceruta. */
  recipientPersonType?: 0 | 1;
  recipientCompany?: string;
  packageType: 0 | 1 | 2;    // 0=colet 1.01-38kg, 1=colet mic pana in 1kg, 2=peste 38kg
  packageNumber: number;
  weightKg: number;
  length?: number;
  width?: number;
  height?: number;
  cashOnDelivery: number;
  insuredValue: number;
  observation: string;
  /** Observatii care apar la pret, respectiv interne. Ambele sunt in exemplele lor. */
  priceObservation?: string;
  clientObservation?: string;
  clientInternalReference: string;
  /** Easybox-ul in care se LIVREAZA coletul (`lockerLastMile`). */
  lockerId?: number;
  /** Easybox-ul din care se RIDICA un retur (`lockerFirstMile`). */
  lockerRetur?: number;
  /**
   * Pana cand poate cumparatorul sa incarce returul in locker.
   *
   * ⚠ Trecuta data, ei ANULEAZA singuri comanda. Formatul lor: `2026-01-15 23:59:59`.
   */
  eligibilityDate?: string;
  /** Serviciul cerut anume, cand nu e cel implicit al magazinului. */
  serviceId?: number;
  /** Coduri de extraoptiuni cerute: `PDO`, `SWAP`, `OPCG`, `RDOC`, `TBC`. */
  extraOptiuni?: string[];
  /** Ridicare de la tert (retururi): cumparatorul preda, magazinul primeste. */
  tert?: SamedayTert;
  /** ⚠ Moneda TARII DE DESTINATIE la expedierile internationale. Implicit `RON`. */
  currency?: string;
};

/**
 * Ce ne intorc ei la emitere.
 *
 * ⚠ SE TIN TOATE, nu doar numarul. Prima forma citea `awbNumber` si arunca restul — iar
 * acolo era si `awbCost`, singurul loc din care aflam cat a costat CHIAR transportul, si
 * `returnAwbs`, adica AWB-ul de retur al unui colet la schimb, care altfel se pierdea cu totul.
 */
export type SamedayAwbCreat = {
  awbNumber: string;
  awbCost: number | null;
  pdfLink: string | null;
  /** Numarul fiecarui colet in parte, cand expeditia are mai multe. */
  coleteAwb: string[];
  /** AWB-urile intoarse la colet la schimb. */
  returAwb: string[];
  /** ⚠ Codul cu care cumparatorul deschide easybox-ul ca sa PREDEA un retur. */
  lockerReturnChargeCode: string | null;
  sortingHub: string | null;
  deliveryLogisticLocation: string | null;
  /** Raspunsul intreg, ca sa nu se piarda nimic ce n-am prevazut. */
  brut: Record<string, unknown>;
};

// ─── Token cache ──────────────────────────────────────────────────────────────

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenEntry>();

function baseUrl(sandbox: boolean) {
  return sandbox ? SANDBOX_URL : PROD_URL;
}

async function getSamedayToken(
  username: string,
  password: string,
  sandbox: boolean,
): Promise<string> {
  const key = `${username}::${sandbox}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(`${baseUrl(sandbox)}/api/authenticate`, {
    method: "POST",
    headers: {
      "X-AUTH-USERNAME": username,
      "X-AUTH-PASSWORD": password,
    },
  });

  if (!res.ok) throw eroareRefuz(`Sameday autentificare esuata: ${res.status} ${res.statusText}`);

  const data = await res.json() as { token?: string; expire_at?: string };
  if (!data.token) throw eroareRefuz("Token Sameday invalid in raspuns");

  // expire_at format: "2018-05-25 23:07" — cache with 1h buffer
  let expiresAt = Date.now() + 11 * 60 * 60 * 1000; // 11h default
  if (data.expire_at) {
    const parsed = new Date(data.expire_at.replace(" ", "T") + ":00").getTime();
    if (!isNaN(parsed)) expiresAt = parsed - 60 * 60 * 1000; // 1h before expiry
  }

  tokenCache.set(key, { token: data.token, expiresAt });
  return data.token;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function samedayGet<T>(
  path: string,
  token: string,
  sandbox: boolean,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${baseUrl(sandbox)}/${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { "X-AUTH-TOKEN": token },
  });
  // Citire pura — vezi nota din fancourier.ts.
  if (!res.ok) throw eroareRefuz(`Sameday GET ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function samedayPost<T>(
  path: string,
  token: string,
  sandbox: boolean,
  bodyParts: string[],
): Promise<T> {
  const res = await fetch(`${baseUrl(sandbox)}/${path}`, {
    method: "POST",
    headers: {
      "X-AUTH-TOKEN": token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParts.join("&"),
  });

  const text = await res.text();
  if (!res.ok) throw eroareCuStatus(`Sameday POST ${path}: ${res.status} — ${text}`, res.status);

  return JSON.parse(text) as T;
}

async function samedayDelete(
  path: string,
  token: string,
  sandbox: boolean,
): Promise<void> {
  const res = await fetch(`${baseUrl(sandbox)}/${path}`, {
    method: "DELETE",
    headers: { "X-AUTH-TOKEN": token },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw eroareCuStatus(`Sameday DELETE ${path}: ${res.status} — ${text}`, res.status);
  }
}

/**
 * Mesajul lor de eroare, din forma pe care o folosesc CHIAR EI.
 *
 * ⚠ Masurat pe contul de productie: un AWB inexistent intoarce
 * `{"error":{"code":404,"message":"Awb-ul nu a fost gasit!"}}` — imbricat, si in romana.
 * Codul dinainte cauta `data.error` ca sir, deci pe forma asta ramanea cu „undefined" si
 * comerciantul primea un mesaj gol exact cand avea nevoie de unul.
 */
export function mesajulLor(data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  if (typeof d.error === "string" && d.error) return d.error;
  const e = d.error as Record<string, unknown> | undefined;
  if (e && typeof e.message === "string" && e.message) return e.message;
  if (typeof d.message === "string" && d.message) return d.message;
  return null;
}

/**
 * Serviciile contului, cu extraoptiunile lor cu tot.
 *
 * ⚠ SE TIN MINTE PE TOT PROCESUL: lista se schimba de cateva ori pe an, iar cererea intra in
 * acelasi buget ca tot restul. Dar id-urile extraoptiunilor NU se pot scrie in cod — vezi
 * `idurileExtraOptiunilor`.
 */
const cacheServicii = new Map<string, SamedayService[]>();

export async function getSamedayServices(config: SamedayConfig): Promise<SamedayService[]> {
  const cheie = `${config.username}::${config.sandbox}`;
  const gata = cacheServicii.get(cheie);
  if (gata) return gata;

  const token = await getSamedayToken(config.username, config.password, config.sandbox);
  const r = await samedayGet<{ data?: Record<string, unknown>[] }>(
    "api/client/services", token, config.sandbox, { countPerPage: "100" },
  );
  const servicii = (r.data ?? []).map(hartaServiciu);
  cacheServicii.set(cheie, servicii);
  return servicii;
}

/** Un serviciu, din forma lor in a noastra. Un singur loc, ca sa nu se desparta. */
function hartaServiciu(s: Record<string, unknown>): SamedayService {
  const dt = s.deliveryType as Record<string, unknown> | undefined;
  return {
    id: Number(s.id),
    name: String(s.name ?? ""),
    code: String(s.serviceCode ?? s.code ?? ""),
    deliveryType: String(dt?.name ?? ""),
    optiuni: ((s.serviceOptionalTaxes ?? []) as Record<string, unknown>[]).map((o) => ({
      taxCode: String(o.taxCode ?? ""),
      name: String(o.name ?? ""),
      id: Number(o.id),
      tax: Number(o.tax ?? 0),
      packageType: (Number(o.packageType ?? 0) as 0 | 1 | 2),
    })).filter((o) => o.taxCode && Number.isFinite(o.id)),
  };
}

// ─── Account load (for config) ────────────────────────────────────────────────

export async function loadSamedayAccount(
  username: string,
  password: string,
  sandbox: boolean,
): Promise<{
  pickupPoints: SamedayPickupPoint[];
  services: SamedayService[];
} | { error: string }> {
  try {
    const token = await getSamedayToken(username, password, sandbox);

    const [ppRes, svcRes] = await Promise.all([
      samedayGet<{ data: Record<string, unknown>[] }>(
        "api/client/pickup-points", token, sandbox, { page: "1", countPerPage: "50" }
      ),
      samedayGet<{ data: Record<string, unknown>[] }>("api/client/services", token, sandbox),
    ]);

    // Normalize pickup points — map Sameday API fields to our types
    const pickupPoints: SamedayPickupPoint[] = (ppRes.data ?? []).map((pp: Record<string, unknown>) => {
      const rawCity = pp.city as Record<string, unknown> | undefined;
      const rawCounty = pp.county as Record<string, unknown> | undefined;
      const rawContacts = (pp.pickupPointContactPerson ?? pp.contactPersons ?? []) as Record<string, unknown>[];

      return {
        id: pp.id as number,
        alias: (pp.alias ?? pp.name ?? "") as string,
        address: {
          name: typeof pp.address === "string" ? pp.address : "",
          street: typeof pp.address === "string" ? pp.address : "",
          city: { name: (rawCity?.name ?? "") as string },
          county: { name: (rawCounty?.name ?? "") as string },
        },
        contactPersons: Array.isArray(rawContacts)
          ? rawContacts.map((cp: Record<string, unknown>) => ({
              id: cp.id as number,
              name: (cp.name ?? "") as string,
              isDefault: (cp.defaultContactPerson ?? cp.isDefault ?? false) as boolean,
            }))
          : [],
      };
    });

    /* ⚠ Aceeasi harta ca peste tot (`hartaServiciu`), ca sa vina si extraoptiunile.
       Scrisa a doua oara aici, panoul ar fi aratat servicii fara PDO si SWAP, iar emiterea
       le-ar fi avut — adica doua adevaruri diferite despre acelasi cont. */
    const services: SamedayService[] = (svcRes.data ?? []).map(hartaServiciu);

    return { pickupPoints, services };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Locker (LN) service resolution ──────────────────────────────────────────

// Locker deliveries must run on the LockerNextDay service (code "LN"), not on
// the merchant's default home-delivery service — same rule as Sameday's
// official module. Resolved from the account's service list and cached.
const lockerServiceCache = new Map<string, number | null>();

export async function getSamedayLockerServiceId(config: SamedayConfig): Promise<number | null> {
  const key = `${config.username}::${config.sandbox}`;
  const cached = lockerServiceCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const token = await getSamedayToken(config.username, config.password, config.sandbox);
    const res = await samedayGet<{ data?: Record<string, unknown>[] }>(
      "api/client/services", token, config.sandbox,
    );
    const ln = (res.data ?? []).find(
      (s) => String(s.serviceCode ?? s.code ?? "").toUpperCase() === "LN",
    );
    const id = typeof ln?.id === "number" ? ln.id : null;
    lockerServiceCache.set(key, id);
    return id;
  } catch {
    return null; // best-effort: caller falls back to the configured service
  }
}

// ─── AWB creation ─────────────────────────────────────────────────────────────

/**
 * Id-urile extraoptiunilor cerute, cautate in serviciul ALES si la tipul de colet din cerere.
 *
 * ⚠ NU SE SCRIU IN COD SI NU SE TIN MINTE PE CONT. Masurat pe un cont real: „Predare
 * personala in punct fix" are id 674262 pe serviciul 24H la tip de colet 0, dar 690892 pe
 * Locker NextDay la acelasi tip. Un id imprumutat de la alt serviciu e un id strain.
 *
 * ⚠ Un cod necunoscut se SARE, nu opreste emiterea: contul poate sa n-aiba extraoptiunea
 * activata, iar atunci coletul tot trebuie sa plece. Se intoarce si ce n-a fost gasit, ca
 * cel care cheama sa poata spune.
 */
export function idurileExtraOptiunilor(
  servicii: SamedayService[],
  serviceId: number,
  packageType: 0 | 1 | 2,
  coduri: string[],
): { ids: number[]; negasite: string[] } {
  const serviciu = servicii.find((s) => s.id === serviceId);
  const ids: number[] = [];
  const negasite: string[] = [];
  for (const cod of coduri) {
    const potrivit = (serviciu?.optiuni ?? []).find(
      (o) => o.taxCode.toUpperCase() === cod.toUpperCase() && o.packageType === packageType,
    );
    if (potrivit) ids.push(potrivit.id);
    else negasite.push(cod);
  }
  return { ids, negasite };
}

export async function createSamedayAwb(
  config: SamedayConfig,
  input: SamedayAwbInput,
): Promise<SamedayAwbCreat> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);

  /*
   * Serviciul, in ordinea in care se hotaraste:
   *   1. cerut anume (comerciantul a ales altul in fereastra de AWB);
   *   2. easybox — atunci serviciul de locker al contului, cautat dupa COD, nu dupa id;
   *   3. cel implicit al magazinului.
   *
   * ⚠ Id-ul 15 din documentatie nu e garantat pe orice cont, de-aia se cauta dupa `LN`.
   */
  let serviceId = input.serviceId ?? config.service_id;
  if (!input.serviceId && input.lockerId) {
    serviceId = (await getSamedayLockerServiceId(config)) ?? config.service_id;
  }

  const enc = encodeURIComponent;
  const perParcelWeight = (input.weightKg / Math.max(input.packageNumber, 1));

  const parts: string[] = [
    `pickupPoint=${config.pickup_point_id}`,
    `contactPerson=${config.contact_person_id}`,
    `packageType=${input.packageType}`,
    `packageNumber=${input.packageNumber}`,
    `packageWeight=${input.weightKg}`,
    `service=${serviceId}`,
    `awbPayment=1`,   // 1 = platit de expeditor (client)
    `cashOnDelivery=${input.cashOnDelivery}`,
    `insuredValue=${input.insuredValue}`,
    /* ⚠ Moneda TARII DE DESTINATIE la expedierile internationale — o cer explicit. Cu `RON`
       scris fix, serviciile crossborder (28-31, 38, 50, 58, 60, 62) erau de neatins. */
    `currency=${enc(input.currency ?? "RON")}`,
    `awbRecipient[name]=${enc(input.recipientName)}`,
    `awbRecipient[phoneNumber]=${enc(normalizePhone(input.recipientPhone))}`,
    `awbRecipient[personType]=${input.recipientPersonType ?? 0}`,
    /*
     * ⚠ Judetul si orasul se NORMALIZEAZA, nu se trimit cum le-a scris omul.
     *
     * Sameday valideaza ambele campuri si respinge tot AWB-ul daca nu recunoaste
     * unul. Selectorul nostru ofera „Municipiul Bucuresti", pe care ei nu-l stiu,
     * iar la oras primeam „Bucuresti", „București", „Sec 5" — din zece comenzi
     * bucurestene ADEVARATE, una singura era scrisa „Sector 1", singura forma
     * pe care o accepta.
     *
     * ⚠ `localitateSameday`, nu `normalizeLocalityName`: pentru Sameday
     * sectoarele SUNT orase, deci plierea lor in „Bucuresti" ar strica exact
     * ce reparam aici.
     */
    `awbRecipient[countyString]=${enc(normalizeCountyName(input.recipientCounty))}`,
    `awbRecipient[cityString]=${enc(localitateSameday(input.recipientCity, input.recipientCounty))}`,
    `awbRecipient[address]=${enc(input.recipientAddress)}`,
  ];

  /*
   * ⚠ E-MAILUL, LA LIVRAREA IN EASYBOX, NU E DECOR.
   *
   * La un colet lasat intr-un dulap nu vine niciun curier care sa sune la usa: codul de
   * deschidere ajunge la om pe e-mail sau SMS. Ambele exemple de locker din documentatia lor
   * poarta campul, iar noi nu-l trimiteam deloc.
   */
  if (input.recipientEmail) {
    parts.push(`awbRecipient[email]=${enc(input.recipientEmail)}`);
  }
  if (input.recipientPersonType === 1 && input.recipientCompany) {
    parts.push(`awbRecipient[companyName]=${enc(input.recipientCompany)}`);
  }
  if (input.recipientPostalCode) {
    parts.push(`awbRecipient[postalCode]=${enc(input.recipientPostalCode)}`);
  }
  if (input.observation) {
    parts.push(`observation=${enc(input.observation)}`);
  }
  if (input.priceObservation) parts.push(`priceObservation=${enc(input.priceObservation)}`);
  if (input.clientObservation) parts.push(`clientObservation=${enc(input.clientObservation)}`);
  if (input.clientInternalReference) {
    parts.push(`clientInternalReference=${enc(input.clientInternalReference)}`);
  }
  if (input.lockerId) {
    parts.push(`lockerLastMile=${input.lockerId}`);
  }

  /*
   * ═══ RIDICAREA DE LA TERT: fara ea, retururile erau de NEATINS ═══
   *
   * Ambele servicii de retur (Retur Standard si Locker Retur) cer ca ridicarea sa se faca de
   * la CUMPARATOR, iar destinatarul sa fie magazinul. Pana acum trimiteam `thirdPartyPickup=0`
   * scris fix, deci nu exista nicio cale de a le folosi.
   */
  if (input.tert) {
    const t = input.tert;
    parts.push(`thirdPartyPickup=1`);
    parts.push(`thirdParty[name]=${enc(t.name)}`);
    parts.push(`thirdParty[phoneNumber]=${enc(normalizePhone(t.phoneNumber))}`);
    parts.push(`thirdParty[personType]=${t.personType ?? 0}`);
    if (t.email) parts.push(`thirdParty[email]=${enc(t.email)}`);
    if (t.personType === 1 && t.companyName) parts.push(`thirdParty[companyName]=${enc(t.companyName)}`);
    if (t.county) parts.push(`thirdParty[countyString]=${enc(normalizeCountyName(t.county))}`);
    if (t.city) parts.push(`thirdParty[cityString]=${enc(localitateSameday(t.city, t.county ?? ""))}`);
    if (t.address) parts.push(`thirdParty[address]=${enc(t.address)}`);
    if (t.postalCode) parts.push(`thirdParty[postalCode]=${enc(t.postalCode)}`);
  } else {
    parts.push(`thirdPartyPickup=0`);
  }

  /* ⚠ Easybox-ul din care se RIDICA returul, plus data pana la care omul poate incarca.
     Trecuta data, ei anuleaza singuri comanda — deci nu e o formalitate. */
  if (input.lockerRetur) parts.push(`lockerFirstMile=${input.lockerRetur}`);
  if (input.eligibilityDate) {
    parts.push(`returnLockerParcel[eligibilityDate]=${enc(input.eligibilityDate)}`);
  }

  /*
   * ⚠ EXTRAOPTIUNILE PLEACA CA LISTA DE ID-URI, cum face SDK-ul lor.
   *
   * Documentatia arata doua forme care nu se potrivesc intre ele: `serviceTaxes: ["SWAP"]`
   * intr-un exemplu si `serviceTaxes: "PDO 123456"` in altul. SDK-ul lor oficial — cel care
   * chiar ruleaza in mii de magazine WooCommerce — trimite `serviceTaxes` ca sir de ID-URI.
   * Aia e forma dovedita, deci aia se foloseste.
   */
  if (input.extraOptiuni?.length) {
    const servicii = await getSamedayServices(config);
    const { ids } = idurileExtraOptiunilor(servicii, serviceId, input.packageType, input.extraOptiuni);
    ids.forEach((id, i) => parts.push(`serviceTaxes[${i}]=${id}`));
  }

  // Parcels details — distribui greutatea egal
  for (let i = 0; i < input.packageNumber; i++) {
    parts.push(`parcels[${i}][weight]=${perParcelWeight.toFixed(2)}`);
    if (input.length) parts.push(`parcels[${i}][length]=${input.length}`);
    if (input.width) parts.push(`parcels[${i}][width]=${input.width}`);
    if (input.height) parts.push(`parcels[${i}][height]=${input.height}`);
  }

  const data = await samedayPost<Record<string, unknown>>("api/awb", token, config.sandbox, parts);

  const awbNumber = typeof data.awbNumber === "string" ? data.awbNumber : "";
  if (!awbNumber) {
    throw eroareNesigura(mesajulLor(data) ?? "AWB Sameday nu a fost returnat in raspuns");
  }

  const colete = Array.isArray(data.parcels) ? data.parcels as Record<string, unknown>[] : [];
  const retur = Array.isArray(data.returnAwbs) ? data.returnAwbs as Record<string, unknown>[] : [];

  return {
    awbNumber,
    awbCost: typeof data.awbCost === "number" ? data.awbCost : null,
    pdfLink: typeof data.pdfLink === "string" ? data.pdfLink : null,
    coleteAwb: colete.map((c) => String(c.awbNumber ?? "")).filter(Boolean),
    returAwb: retur.map((r) => String(r.awbNumber ?? "")).filter(Boolean),
    lockerReturnChargeCode:
      typeof data.lockerReturnChargeCode === "string" ? data.lockerReturnChargeCode : null,
    sortingHub: typeof data.sortingHub === "string" ? data.sortingHub : null,
    deliveryLogisticLocation:
      typeof data.deliveryLogisticLocation === "string" ? data.deliveryLogisticLocation : null,
    brut: data,
  };
}

// ─── Cost estimation ─────────────────────────────────────────────────────────

export async function estimateSamedayCost(
  config: SamedayConfig,
  input: {
    recipientCounty: string;
    recipientCity: string;
    recipientAddress?: string;
    weightKg: number;
    packageType?: 0 | 1 | 2;
    packageNumber?: number;
    cashOnDelivery?: number;
    insuredValue?: number;
    lockerId?: number;
    /** Quote the easybox (LN) service instead of the configured home-delivery one. */
    useLockerService?: boolean;
  },
): Promise<{ amount: number; currency: string; time: number }> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);

  let serviceId = config.service_id;
  if (input.lockerId || input.useLockerService) {
    serviceId = (await getSamedayLockerServiceId(config)) ?? config.service_id;
  }

  const enc = encodeURIComponent;
  const pkgNum = input.packageNumber ?? 1;
  const perParcelWeight = input.weightKg / Math.max(pkgNum, 1);

  const parts: string[] = [
    `pickupPoint=${config.pickup_point_id}`,
    `contactPerson=${config.contact_person_id}`,
    `packageType=${input.packageType ?? 0}`,
    `packageNumber=${pkgNum}`,
    `packageWeight=${input.weightKg}`,
    `service=${serviceId}`,
    `awbPayment=1`,
    `cashOnDelivery=${input.cashOnDelivery ?? 0}`,
    `insuredValue=${input.insuredValue ?? 0}`,
    `thirdPartyPickup=0`,
    `currency=RON`,
    `awbRecipient[name]=${enc("Estimare")}`,
    `awbRecipient[phoneNumber]=${enc("0700000000")}`,
    `awbRecipient[personType]=0`,
    /* ⚠ Aceeasi normalizare ca la emitere — vezi nota din `createSamedayAwb`.
     * Daca cele doua s-ar despartii, pretul aratat la checkout ar fi calculat
     * pentru alta localitate decat cea de pe colet. */
    `awbRecipient[countyString]=${enc(normalizeCountyName(input.recipientCounty))}`,
    `awbRecipient[cityString]=${enc(localitateSameday(input.recipientCity, input.recipientCounty))}`,
    `awbRecipient[address]=${enc(input.recipientAddress ?? "Strada 1")}`,
  ];

  if (input.lockerId) {
    parts.push(`lockerLastMile=${input.lockerId}`);
  }

  for (let i = 0; i < pkgNum; i++) {
    parts.push(`parcels[${i}][weight]=${perParcelWeight.toFixed(2)}`);
  }

  const data = await samedayPost<{ amount?: number; currency?: string; time?: number }>(
    "api/awb/estimate-cost", token, config.sandbox, parts,
  );

  return {
    amount: data.amount ?? 0,
    currency: data.currency ?? "RON",
    time: data.time ?? 24,
  };
}

// ─── Lockers (EasyBox) ───────────────────────────────────────────────────────

export type SamedayLocker = {
  lockerId: number;
  name: string;
  address: string;
  city: string;
  county: string;
  postalCode: string;
  lat: number;
  lng: number;
};

export async function getSamedayLockers(
  config: SamedayConfig,
): Promise<SamedayLocker[]> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);

  const allLockers: SamedayLocker[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 100) {
    const res = await samedayGet<{ data: Record<string, unknown>[]; pages?: number; currentPage?: number }>(
      "api/client/lockers", token, config.sandbox,
      /* ⚠ 500, implicitul LOR, nu 100. Masurat pe contul de productie: 7.021 de lockere.
         Cu 100 pe pagina inseamna 71 de cereri una dupa alta inainte ca omul sa vada harta;
         cu 500, cincisprezece. */
      { page: String(page), countPerPage: "500" },
    );

    for (const l of res.data ?? []) {
      allLockers.push({
        lockerId: l.lockerId as number,
        name: (l.name ?? "") as string,
        address: (l.address ?? "") as string,
        city: (l.city ?? "") as string,
        county: (l.county ?? "") as string,
        postalCode: (l.postalCode ?? "") as string,
        lat: Number(l.lat ?? 0),
        lng: Number(l.lng ?? 0),
      });
    }

    hasMore = page < (res.pages ?? 1);
    page++;
  }

  return allLockers;
}

// ─── AWB deletion ─────────────────────────────────────────────────────────────

export async function deleteSamedayAwb(
  config: SamedayConfig,
  awbNumber: string,
): Promise<void> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);
  await samedayDelete(`api/awb/${encodeURIComponent(awbNumber)}`, token, config.sandbox);
}

// ─── AWB label PDF ────────────────────────────────────────────────────────────

// type: "A6" | "A4"
export async function getSamedayAwbLabel(
  config: SamedayConfig,
  awbNumber: string,
  labelType: "A6" | "A4" = "A6",
): Promise<Buffer> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);
  const url = `${baseUrl(config.sandbox)}/api/awb/download/${encodeURIComponent(awbNumber)}/${labelType}`;

  const res = await fetch(url, {
    headers: { "X-AUTH-TOKEN": token },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Sameday label error: ${res.status} — ${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/* ═══════════════════════════════════════════════════════════════════════════
   STATUSURI, NOMENCLATOARE SI PUNCTE — partea de API pe care n-o foloseam
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce s-a intamplat cu o expeditie.
 *
 * ═══ ⚠ SE HOTARASTE DUPA DOI BOOLEENI, NU DUPA UN ENUM GHICIT ═══
 *
 * Raspunsul poarta si `expeditionStatus.statusState`, un sir despre care nici documentatia,
 * nici SDK-ul lor nu spun ce valori poate lua — l-am cautat in amandoua. Un cod care ar
 * ramifica pe el ar fi o presupunere deghizata in logica.
 *
 * `expeditionSummary.delivered` si `.canceled` sunt insa booleeni, deci fara echivoc. Pe ei
 * se ia hotararea; `statusLabel` se pastreaza doar ca sa fie ARATAT omului, si `statusId` ca
 * sa se vada daca s-a schimbat ceva de la ultima intrebare.
 */
export type SamedayStareAwb = {
  livrat: boolean;
  anulat: boolean;
  livratLa: string | null;
  incercariDeLivrare: number;
  statusId: number | null;
  /** Textul lor, in romana, gata de aratat. */
  eticheta: string;
  /** Motivul, cand il dau (refuz, lipsa destinatar). */
  motiv: string | null;
  /** Unde se afla acum. */
  locatie: string | null;
  /** ⚠ Raspunsul intreg: vezi nota despre pastrarea raspunsului brut. */
  brut: Record<string, unknown>;
};

/** `null` cand ei nu cunosc AWB-ul (404), ceea ce NU e o eroare de retea. */
export async function statusAwbSameday(
  config: SamedayConfig,
  awbNumber: string,
): Promise<SamedayStareAwb | null> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);
  const url = `${baseUrl(config.sandbox)}/api/client/awb/${encodeURIComponent(awbNumber)}/status`;
  const res = await fetch(url, { headers: { "X-AUTH-TOKEN": token } });

  /* ⚠ 404 inseamna „nu-l am", nu „am cazut". Aruncat ca eroare, cronul l-ar fi reincercat
     la nesfarsit pentru un AWB sters din contul lor. */
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw eroareCuStatus(`Sameday status ${awbNumber}: ${res.status} — ${text}`, res.status);
  }

  const data = await res.json() as Record<string, unknown>;
  const sumar = (data.expeditionSummary ?? {}) as Record<string, unknown>;
  const stare = (data.expeditionStatus ?? {}) as Record<string, unknown>;

  return {
    livrat: sumar.delivered === true,
    anulat: sumar.canceled === true,
    livratLa: typeof sumar.deliveredAt === "string" ? sumar.deliveredAt : null,
    incercariDeLivrare: Number(sumar.deliveryAttempts ?? 0) || 0,
    statusId: typeof stare.statusId === "number" ? stare.statusId : null,
    eticheta: String(stare.statusLabel ?? stare.status ?? ""),
    motiv: stare.reason ? String(stare.reason) : null,
    locatie: stare.transitLocation ? String(stare.transitLocation) : null,
    brut: data,
  };
}

/**
 * Statusurile schimbate intr-un interval, pentru tot contul.
 *
 * ⚠ O SINGURA CERERE PENTRU TOATE COLETELE, spre deosebire de `statusAwbSameday`, care cere
 * cate un apel de fiecare. La un magazin cu zeci de expeditii pe zi, deosebirea e intre o
 * cerere si cincizeci — si cele 12 autentificari pe minut ale contului sunt aceleasi.
 *
 * Marcajele se dau in secunde (epoch), cum cer ei.
 */
export async function statusuriPeIntervalSameday(
  config: SamedayConfig,
  deLa: Date,
  panaLa: Date,
  maxPagini = 20,
): Promise<{ awbNumber: string; statusId: number | null; eticheta: string; data: string | null }[]> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);
  const rezultat: { awbNumber: string; statusId: number | null; eticheta: string; data: string | null }[] = [];

  for (let pagina = 1; pagina <= maxPagini; pagina++) {
    const r = await samedayGet<{ data?: Record<string, unknown>[]; pages?: number }>(
      "api/client/status-sync", token, config.sandbox,
      {
        startTimestamp: String(Math.floor(deLa.getTime() / 1000)),
        endTimestamp: String(Math.floor(panaLa.getTime() / 1000)),
        page: String(pagina),
        countPerPage: "500",
      },
    );
    for (const x of r.data ?? []) {
      rezultat.push({
        awbNumber: String(x.awbNumber ?? x.parcelAwbNumber ?? ""),
        statusId: typeof x.statusId === "number" ? x.statusId : null,
        eticheta: String(x.statusLabel ?? x.status ?? ""),
        data: typeof x.statusDate === "string" ? x.statusDate : null,
      });
    }
    if (pagina >= (r.pages ?? 1)) break;
  }

  return rezultat.filter((x) => x.awbNumber);
}

export type SamedayNomenclator = { id: number; name: string; code?: string };

/**
 * Judetele si localitatile din nomenclatorul lor.
 *
 * ⚠ LA CE FOLOSESC: trimitem astazi numele ca text (`countyString` / `cityString`), forma pe
 * care o accepta si SDK-ul lor. Dar cand un nume nu se potriveste in dictionarele lor,
 * expeditia intra intr-o revizuire facuta de MANA de operatorii Sameday — deci pleaca, dar
 * cu intarziere si fara ca noi sa aflam. Cu id-uri, intra direct in fluxul operational.
 */
export async function judeteSameday(config: SamedayConfig): Promise<SamedayNomenclator[]> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);
  const r = await samedayGet<{ data?: Record<string, unknown>[] }>(
    "api/geolocation/county", token, config.sandbox, { countPerPage: "100" },
  );
  return (r.data ?? []).map((x) => ({
    id: Number(x.id), name: String(x.name ?? ""), code: x.code ? String(x.code) : undefined,
  }));
}

export async function localitatiSameday(
  config: SamedayConfig,
  filtru: { name?: string; county?: string; postalCode?: string } = {},
  maxPagini = 40,
): Promise<SamedayNomenclator[]> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);
  const toate: SamedayNomenclator[] = [];
  for (let pagina = 1; pagina <= maxPagini; pagina++) {
    const r = await samedayGet<{ data?: Record<string, unknown>[]; pages?: number }>(
      "api/geolocation/city", token, config.sandbox,
      { page: String(pagina), countPerPage: "500", ...filtru },
    );
    for (const x of r.data ?? []) toate.push({ id: Number(x.id), name: String(x.name ?? "") });
    if (pagina >= (r.pages ?? 1)) break;
  }
  return toate;
}

/**
 * Punctele PUDO (`ooh` = out of home).
 *
 * ⚠ NU E ACELASI LUCRU CU `api/client/lockers`, desi se suprapun: masurat pe un cont real,
 * 7.021 lockere fata de 6.706 puncte ooh, iar acestea din urma poarta `oohType`, adica si
 * puncte care nu sunt dulapuri. Contul are servicii separate pentru ele — `Pudo Nextday`,
 * `PUDO Home Delivery`, `Home to Pudo` — deci lista lor e cea potrivita acolo.
 */
export async function puncteOohSameday(
  config: SamedayConfig,
  maxPagini = 30,
): Promise<SamedayLocker[]> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);
  const toate: SamedayLocker[] = [];
  for (let pagina = 1; pagina <= maxPagini; pagina++) {
    const r = await samedayGet<{ data?: Record<string, unknown>[]; pages?: number }>(
      "api/client/ooh-locations", token, config.sandbox,
      { page: String(pagina), countPerPage: "500" },
    );
    for (const l of r.data ?? []) {
      toate.push({
        lockerId: Number(l.lockerId ?? l.id ?? 0),
        name: String(l.name ?? ""),
        address: String(l.address ?? ""),
        city: String(l.city ?? ""),
        county: String(l.county ?? ""),
        postalCode: String(l.postalCode ?? ""),
        lat: Number(l.lat ?? 0),
        lng: Number(l.lng ?? 0),
      });
    }
    if (pagina >= (r.pages ?? 1)) break;
  }
  return toate.filter((x) => x.lockerId > 0);
}

/**
 * Adauga un punct de ridicare in contul comerciantului.
 *
 * ⚠ Pana acum se putea doar CITI, iar un magazin care isi deschidea un depozit nou trebuia
 * sa sune la suportul lor. Ei au ruta.
 */
export async function adaugaPunctDeRidicareSameday(
  config: SamedayConfig,
  p: {
    alias: string; county: string; city: string; address: string; postalCode?: string;
    contactName: string; contactPhone: string; contactEmail?: string;
  },
): Promise<{ id: number }> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);
  const enc = encodeURIComponent;
  const parts = [
    `alias=${enc(p.alias)}`,
    `countyString=${enc(normalizeCountyName(p.county))}`,
    `cityString=${enc(localitateSameday(p.city, p.county))}`,
    `address=${enc(p.address)}`,
    `defaultPickupPoint=0`,
    `pickupPointContactPerson[0][name]=${enc(p.contactName)}`,
    `pickupPointContactPerson[0][phoneNumber]=${enc(normalizePhone(p.contactPhone))}`,
    `pickupPointContactPerson[0][defaultContactPerson]=1`,
  ];
  if (p.postalCode) parts.push(`postalCode=${enc(p.postalCode)}`);
  if (p.contactEmail) parts.push(`pickupPointContactPerson[0][email]=${enc(p.contactEmail)}`);

  const data = await samedayPost<Record<string, unknown>>(
    "api/client/pickup-points", token, config.sandbox, parts,
  );
  const id = Number(data.id ?? 0);
  if (!id) throw eroareNesigura(mesajulLor(data) ?? "Punctul de ridicare nu a fost creat");
  return { id };
}
