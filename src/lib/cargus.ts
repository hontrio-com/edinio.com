import { normalizePhone } from "@/lib/utils/phone";
import { stripDiacritics, normalizeCountyName, normalizeLocalityName } from "@/lib/utils/ro-address";
import { eroareCuStatus, eroareDeTermen, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import { cheieToken } from "@/lib/integrari/cheie-token";
import { codulAwbCargus } from "@/lib/shipping/raspunsul-awb-cargus";
import { coleteleCargus } from "@/lib/shipping/coletele-cargus";
import { dataEvenimentelorCargus, dataRambursurilorCargus, ziuaLorCargus } from "@/lib/shipping/datele-cargus";

export type CargusConfig = {
  enabled: boolean;
  username: string;
  password: string;
  subscription_key: string;
  location_id: number;
  location_name: string;
  price_table_id: number;
  price_table_name: string;
  /** Sender pickup point county/locality — needed by ShippingCalculation (From*). */
  location_county?: string;
  location_locality?: string;
  /** Where the COD money comes back: envelope cash (default) or bank account. */
  repayment_type?: "cash" | "bank";
  /** Opt-in: insure shipments for the order's product value (DeclaredValue). */
  declared_value_enabled?: boolean;
};

export type CargusPickupLocation = {
  LocationId: number;
  Name: string;
  CountyName: string;
  LocalityName: string;
  AddressText: string;
};

export type CargusPriceTable = {
  PriceTableId: number;
  Name: string;
};

export type CargusAwbInput = {
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  recipientCounty: string;
  recipientCity: string;
  recipientAddress: string;
  recipientPostalCode: string;
  parcels: number;
  /** Number of envelopes (max 9). When > 0 the shipment is envelope-typed. */
  envelopes?: number;
  totalWeightKg: number;
  cashRepayment: number;
  openPackage: boolean;
  saturdayDelivery?: boolean;
  observations: string;
  packageContent: string;
  customString: string;
  parcelsDetails: { weight: number; length?: number; width?: number; height?: number }[];
  /** Cargus Ship & Go point id — delivery to a pickup point (ServiceId 38). */
  pudoPointId?: number;
  /** Insured value (RON) — sent as DeclaredValue. */
  declaredValue?: number;
};

const BASE_URL = "https://urgentcargus.azure-api.net/api";

/* ⚠ TERMEN PE CERERE. Fara el `fetch` asteapta la nesfarsit, iar cotatia din checkout
   cheama treisprezece curieri deodata (`Promise.all` in `shipping.actions.ts`): unul
   singur care nu raspunde tine cumparatorul pe ecranul de livrare pana renunta el.
   ⚠ Termenul depasit iese `necunoscut` din `verdictFurnizor`, fiindca eroarea nu trece
   prin niciun constructor din `eroare-furnizor.ts`. Adica exact ce trebuie: un AWB care
   POATE sa fi fost creat ramane blocat, nu se reincearca. */
const ASTEPTARE_MS = 20_000;

// ─── Token cache ──────────────────────────────────────────────────────────────

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenEntry>();
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23h (token valid 24h, buffer 1h)

/*
 * ⚠ SI PAROLA, hasuita. Cu cheia doar pe username plus cheia de abonament, o
 * parola WebExpress gresita primea tokenul valid din cache si trecea fara sa
 * atinga Cargus. Vezi `@/lib/integrari/cheie-token`.
 */
function cacheKey(username: string, password: string, subscriptionKey: string) {
  return cheieToken([username], [password, subscriptionKey]);
}

async function getCargusToken(
  username: string,
  password: string,
  subscriptionKey: string,
): Promise<string> {
  const key = cacheKey(username, password, subscriptionKey);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  /* ⚠ E POST, dar e CITIRE: autentificarea nu creeaza niciun colet. Vezi `eroareDeTermen`. */
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/LoginUser`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        "Ocp-Apim-Trace": "true",
      },
      body: JSON.stringify({ UserName: username, Password: password }),
      signal: AbortSignal.timeout(ASTEPTARE_MS),
    });
  } catch (e) {
    throw eroareDeTermen(e, false, "autentificarea", "Cargus");
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).trim();
    // The Azure gateway rejects a bad/inactive subscription key with 401 before
    // the request reaches Cargus. A 500 here comes from Cargus's own backend and
    // almost always means the WebExpress username/password are wrong (or that
    // account has no API access enabled) — Cargus returns 500 instead of 401.
    if (res.status === 500) {
      throw eroareRefuz(
        "Autentificare Cargus esuata: utilizatorul sau parola contului WebExpress sunt incorecte, " +
        "sau contul nu are acces API activat. Subscription Key-ul este corect (a trecut de gateway)." +
        (detail ? ` Raspuns Cargus: ${detail.slice(0, 200)}` : ""),
      );
    }
    throw eroareRefuz(`Cargus login error: ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }
  const token = (await res.json()) as string;
  if (!token || typeof token !== "string") throw eroareRefuz("Token Cargus invalid");

  tokenCache.set(key, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function cargusGet<T>(
  path: string,
  token: string,
  subscriptionKey: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${path}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        "Ocp-Apim-Trace": "true",
      },
      signal: AbortSignal.timeout(ASTEPTARE_MS),
    });
  } catch (e) {
    throw eroareDeTermen(e, false, `citirea ${path}`, "Cargus");
  }
  // Citire pura — vezi nota din fancourier.ts.
  if (!res.ok) throw eroareRefuz(`Cargus GET ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/**
 * Cargus errors come back as a JSON string, an array of message strings, or an
 * object with a message — flatten whatever arrived into a readable sentence.
 */
function cargusErrorDetail(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) {
      return parsed.filter((x) => typeof x === "string" && x.trim()).join("; ");
    }
    if (parsed && typeof parsed === "object") {
      const o = parsed as Record<string, unknown>;
      if (typeof o.message === "string") return o.message;
      if (typeof o.Error === "string") return o.Error;
    }
  } catch { /* not JSON — return as is */ }
  return raw;
}

async function cargusPost<T>(
  path: string,
  token: string,
  subscriptionKey: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Ocp-Apim-Trace": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ASTEPTARE_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw eroareCuStatus(`Cargus: ${cargusErrorDetail(text).slice(0, 300) || `${res.status} ${res.statusText}`}`, res.status);
  }
  return res.json() as Promise<T>;
}

async function cargusPut(
  path: string,
  token: string,
  subscriptionKey: string,
): Promise<string> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Ocp-Apim-Trace": "true",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(ASTEPTARE_MS),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw eroareCuStatus(`Cargus: ${cargusErrorDetail(text).slice(0, 300) || `${res.status} ${res.statusText}`}`, res.status);
  }
  // The response is the order number — as a bare number, a JSON string, or empty.
  try {
    const parsed = JSON.parse(text) as unknown;
    return String(parsed ?? "").trim();
  } catch {
    return text.trim();
  }
}

async function cargusDelete(
  path: string,
  token: string,
  subscriptionKey: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Ocp-Apim-Trace": "true",
    },
    signal: AbortSignal.timeout(ASTEPTARE_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw eroareCuStatus(`Cargus DELETE ${path}: ${res.status} — ${text}`, res.status);
  }
}

// ─── Geography helpers ────────────────────────────────────────────────────────

export async function getCargusCounties(
  token: string,
  subscriptionKey: string,
): Promise<{ CountyId: number; Name: string; Abbreviation: string }[]> {
  return cargusGet("Counties?countryId=1", token, subscriptionKey);
}

// ─── Pick up points ───────────────────────────────────────────────────────────

export async function getCargusPickupLocations(
  token: string,
  subscriptionKey: string,
): Promise<CargusPickupLocation[]> {
  return cargusGet("PickupLocations", token, subscriptionKey);
}

// ─── Price tables ─────────────────────────────────────────────────────────────

export async function getCargusPriceTables(
  token: string,
  subscriptionKey: string,
): Promise<CargusPriceTable[]> {
  return cargusGet("PriceTables", token, subscriptionKey);
}

// ─── ServiceId auto-selection ─────────────────────────────────────────────────

// Docs (§8.2/§9.2): ServiceId 34 for ≤31 kg, 35 for 31-50 kg, 50 for >50 kg.
// 36 is "Palet Standard" — a pallet service, NOT the >50 kg parcel tier.
export function getCargusServiceId(totalWeightKg: number): { id: number; name: string } {
  if (totalWeightKg <= 31) return { id: 34, name: "Economic Standard" };
  if (totalWeightKg <= 50) return { id: 35, name: "Standard Plus" };
  return { id: 50, name: "Standard (peste 50 kg)" };
}

// ─── AWB Creation ─────────────────────────────────────────────────────────────

export async function createCargusAwb(
  config: CargusConfig,
  input: CargusAwbInput,
): Promise<string> {
  const token = await getCargusToken(config.username, config.password, config.subscription_key);

  /*
   * ⚠ BUCATILE SE VERIFICA INAINTE DE ORICE APEL, si abia apoi se descriu.
   *
   * Pana azi fereastra trimitea `parcels: 3` cu o SINGURA fisa de colet, care cantarea tot.
   * Corpul spunea deodata doua lucruri care nu se potrivesc, iar o eticheta tiparita pentru
   * trei colete inseamna doua colete plecate fara eticheta. Vezi `shipping/coletele-cargus.ts`.
   */
  const verdictColete = coleteleCargus({
    parcels: input.parcels,
    envelopes: input.envelopes,
    totalWeightKg: input.totalWeightKg,
    parcelsDetails: input.parcelsDetails ?? [],
  });
  if (!verdictColete.ok) throw eroareRefuz(verdictColete.motiv);
  const colete = verdictColete.colete;

  const isEnvelope = (input.envelopes ?? 0) > 0;
  const envelopes = isEnvelope ? colete.bucati : 0;
  const totalWeight = colete.greutateTotala;

  // Ship & Go delivery runs on its own service (38); otherwise pick by weight.
  const service = input.pudoPointId ? { id: 38, name: "Ship & Go" } : getCargusServiceId(totalWeight);

  // COD routing: the merchant chooses whether the money comes back as cash in
  // an envelope (default) or into the bank collector account.
  const codAmount = input.cashRepayment > 0 ? input.cashRepayment : 0;
  const bankRepayment = config.repayment_type === "bank" ? codAmount : 0;
  const cashRepayment = config.repayment_type === "bank" ? 0 : codAmount;

  const parcelType = isEnvelope ? 0 : 1; // ParcelCodes.Type: 0 = envelope, 1 = parcel
  /* ⚠ Cate o fisa de FIECARE bucata, cu greutatile insumand exact totalul. Ramura de
     rezerva de dinainte („daca lista e goala, pune una") a disparut: `coleteleCargus` nu
     intoarce niciodata o lista goala, iar cand intorcea, tocmai aia era gaura. */
  const parcelCodes = colete.fise.map((p, i) => ({
    Code: String(i),
    Type: parcelType,
    Weight: p.weight,
    Length: p.length ?? 0,
    Width: p.width ?? 0,
    Height: p.height ?? 0,
    ParcelContent: input.packageContent || "",
  }));

  const body: Record<string, unknown> = {
    SenderClientId: null,
    TertiaryClientId: null,
    Sender: { LocationId: config.location_id },
    Recipient: {
      LocationId: 0,
      Name: input.recipientName,
      CountyId: 0,
      // Cargus nomenclature is diacritics-free; "Sector X" folds to Bucuresti.
      CountyName: normalizeCountyName(input.recipientCounty),
      LocalityId: 0,
      LocalityName: normalizeLocalityName(input.recipientCity, input.recipientCounty),
      StreetId: 0,
      StreetName: "",
      BuildingNumber: "",
      AddressText: stripDiacritics(input.recipientAddress),
      ContactPerson: input.recipientName,
      PhoneNumber: normalizePhone(input.recipientPhone),
      Email: input.recipientEmail,
      CodPostal: input.recipientPostalCode,
      CountryId: 0,
    },
    Parcels: isEnvelope ? 0 : colete.bucati,
    Envelopes: envelopes,
    TotalWeight: totalWeight,
    ServiceId: service.id,
    DeclaredValue: input.declaredValue && input.declaredValue > 0
      ? Math.round(input.declaredValue * 100) / 100
      : 0,
    CashRepayment: cashRepayment,
    BankRepayment: bankRepayment,
    OtherRepayment: "",
    BarCodeRepayment: "",
    PaymentInstrumentId: 0,
    PaymentInstrumentValue: 0,
    HasTertReimbursement: false,
    OpenPackage: input.openPackage,
    PriceTableId: config.price_table_id,
    ShipmentPayer: 1,
    ShippingRepayment: 0,
    SaturdayDelivery: input.saturdayDelivery ?? false,
    MorningDelivery: false,
    Observations: input.observations,
    PackageContent: input.packageContent,
    CustomString: input.customString,
    BarCode: "",
    ParcelCodes: parcelCodes,
  };

  // Ship & Go: delivery to a pickup point — the point id + service 38; the
  // official module also drops the street fields (contact data stays).
  if (input.pudoPointId) {
    body.DeliveryPudoPoint = input.pudoPointId;
  }

  /*
   * ⚠ RASPUNSUL SE CERCETEAZA, NU SE TOARNA IN `String()`.
   *
   * Asa era scris, cu paza doar pe sirul gol si pe „null". Dar `String({})` da
   * „[object Object]", care nu e niciuna din ele: trecea si se scria pe comanda ca numar de
   * expediere. Iar modulul lor oficial arata ca obiectul chiar vine, cu HTTP 200, si ca
   * inseamna EROARE. Vezi `shipping/raspunsul-awb-cargus.ts`.
   */
  const raspuns = await cargusPost<unknown>("Awbs", token, config.subscription_key, body);
  const verdict = codulAwbCargus(raspuns);

  /*
   * ⚠ „Eroare" si „necunoscut" NU se arunca la fel, si deosebirea costa bani.
   *
   * La eroare ei ne-au spus limpede ca expedierea nu s-a facut, deci slotul din registru se
   * poate elibera si omul poate incerca din nou. La necunoscut nu stim daca a plecat sau nu,
   * si atunci `eroareNesigura` tine slotul blocat: un colet care POATE a plecat nu are voie
   * sa fie reincercat de la sine.
   */
  if (verdict.fel === "eroare") throw eroareRefuz(`Cargus: ${verdict.mesaj}`);
  if (verdict.fel === "necunoscut") throw eroareNesigura(verdict.mesaj);
  return verdict.cod;
}

// ─── Shipping price calculation (checkout) ───────────────────────────────────

// PickupLocations lookup cache: old configs don't store the sender county/city,
// so resolve them once per process from the account's pickup points.
const senderLocationCache = new Map<string, { county: string; locality: string }>();

async function resolveCargusSenderLocation(
  config: CargusConfig,
): Promise<{ county: string; locality: string } | null> {
  if (config.location_county && config.location_locality) {
    return { county: config.location_county, locality: config.location_locality };
  }
  const key = `${config.username}::${config.location_id}`;
  const cached = senderLocationCache.get(key);
  if (cached) return cached;

  const token = await getCargusToken(config.username, config.password, config.subscription_key);
  const locations = await getCargusPickupLocations(token, config.subscription_key);
  const match = locations.find((l) => Number(l.LocationId) === Number(config.location_id));
  if (!match?.CountyName || !match?.LocalityName) return null;

  const resolved = { county: match.CountyName, locality: match.LocalityName };
  senderLocationCache.set(key, resolved);
  return resolved;
}

/**
 * Live price via ShippingCalculation. The endpoint accepts county/locality
 * NAMES directly (no nomenclature ids needed), so we quote sender pickup point
 * -> customer city with the COD fee included. null = not resolvable (caller
 * falls back to the flat zone price).
 *
 * ⚠ INTOARCE AMANDOUA NUMERELE, si alegerea o face APELANTUL (13.09.2026).
 *
 * `price` e `GrandTotal`, adica CU TVA; `priceNoVat` e `Subtotal`, documentat de ei
 * drept „total without VAT" (Cargus API v3, §8.2, pag. 27, unde apar impreuna cu `Tax`
 * si `Subtotal + Tax = GrandTotal`). Biblioteca NU stie regimul magazinului, deci nu
 * are cum sa aleaga: pe un magazin cu preturi fara TVA, `GrandTotal` ar primi cota a
 * doua oara in `computeVat`. Acelasi tipar ca la FAN (`total` plus `costNoVAT`).
 *
 * ⚠ `priceNoVat` poate fi `null`: `Subtotal` e optional in raspunsul lor. Apelantul
 * care are nevoie de net TREBUIE sa trateze lipsa, nu sa deduca netul impartind
 * brutul: cota magazinului nu e neaparat cota lui Cargus, iar comisionul de ramburs,
 * inclus in cotatie, poate avea alt regim.
 */
export async function calculateCargusPrice(
  config: CargusConfig,
  input: {
    county: string;
    city: string;
    weightKg: number;
    cod?: number;
    /**
     * Cotare pentru livrare in punct Ship & Go.
     *
     * ⚠ EXISTA FIINDCA ALTFEL COTA NU DESCRIA EXPEDIEREA. Livrarea in punct pleaca pe
     * serviciul 38 (PUDO Delivery), un serviciu cu tariful LUI. Pana azi checkoutul cerea un
     * singur pret, pe serviciul ales dupa greutate (34/35/50), si il punea pe amandoua
     * optiunile. Deci cumparatorul platea un transport, si comerciantului i se factura altul.
     */
    pudo?: boolean;
  },
): Promise<{ price: number; priceNoVat: number | null; serviceId: number } | null> {
  const sender = await resolveCargusSenderLocation(config);
  if (!sender) return null;

  const token = await getCargusToken(config.username, config.password, config.subscription_key);
  const weight = Math.max(1, Math.ceil(input.weightKg));
  /* Aceeasi alegere ca la emitere (`createCargusAwb`): punctul are serviciul lui. */
  const service = input.pudo
    ? { id: 38, name: "Ship & Go" }
    : getCargusServiceId(weight);
  const codAmount = input.cod && input.cod > 0 ? input.cod : 0;

  const body = {
    FromCountyName: normalizeCountyName(sender.county),
    FromLocalityName: normalizeLocalityName(sender.locality, sender.county),
    ToCountyName: normalizeCountyName(input.county),
    ToLocalityName: normalizeLocalityName(input.city, input.county),
    Parcels: 1,
    Envelopes: 0,
    TotalWeight: weight,
    ServiceId: service.id,
    DeclaredValue: 0,
    CashRepayment: config.repayment_type === "bank" ? 0 : codAmount,
    BankRepayment: config.repayment_type === "bank" ? codAmount : 0,
    OtherRepayment: "",
    OpenPackage: false,
    ShipmentPayer: 1,
    PriceTableId: config.price_table_id,
  };

  const result = await cargusPost<{ GrandTotal?: number; Subtotal?: number; Tax?: number }>(
    "ShippingCalculation",
    token,
    config.subscription_key,
    body,
  );
  const gross = result?.GrandTotal ?? null;
  if (typeof gross !== "number") return null;

  /*
   * ⚠ Netul se ia DOAR din `Subtotal`, niciodata dedus din brut. Iar cand si `Tax` vine,
   * se verifica: `Subtotal + Tax` trebuie sa dea `GrandTotal` (toleranta de un ban, pentru
   * rotunjiri). Daca nu da, nu stim ce inseamna numerele lor pe contul asta, si un net
   * nesigur e mai rau decat lipsa lui: apelantul cade pe tariful fix al zonei.
   */
  const net = typeof result?.Subtotal === "number" ? result.Subtotal : null;
  const tax = typeof result?.Tax === "number" ? result.Tax : null;
  const netCredibil =
    net !== null && net > 0 && net <= gross
    && (tax === null || Math.abs(net + tax - gross) <= 0.01);

  return {
    price: Math.round(gross * 100) / 100,
    priceNoVat: netCredibil ? Math.round(net * 100) / 100 : null,
    serviceId: service.id,
  };
}

// ─── Ship & Go pickup points ─────────────────────────────────────────────────

export type CargusPudoPoint = {
  id: number;
  name: string;
  city: string;
  county: string;
  address: string;
  postalCode: string;
  serviceCod: boolean; // whether the point accepts cash-on-delivery
  /**
   * Forma de plata acceptata la ghiseu: 1 nimic, 2 doar card, 3 numerar sau card, 4 doar
   * numerar. `null` cand contul lor nu-l trimite.
   *
   * ⚠ NU E ACELASI LUCRU CU `serviceCod`. Un punct poate primi ramburs si totusi sa nu
   * primeasca NUMERAR. Vezi `shipping/plata-in-punct-cargus.ts`.
   */
  paymentType: number | null;
  lat: number;
  lng: number;
};

/** All Cargus Ship & Go points (the official module calls PudoPoints). */
export async function getCargusPudoPoints(config: CargusConfig): Promise<CargusPudoPoint[]> {
  const token = await getCargusToken(config.username, config.password, config.subscription_key);
  const data = await cargusGet<Record<string, unknown>[]>("PudoPoints", token, config.subscription_key);
  return (Array.isArray(data) ? data : [])
    .map((p) => ({
      id: Number(p.Id ?? 0),
      name: String(p.Name ?? ""),
      city: String(p.City ?? ""),
      county: String(p.County ?? ""),
      address: [p.StreetName, p.StreetNo].filter(Boolean).join(" ") || String(p.AdditionalAddressInfo ?? ""),
      postalCode: String(p.PostalCode ?? ""),
      serviceCod: p.ServiceCOD === true,
      /* ⚠ SI FORMA DE PLATA, nu doar steagul de ramburs: un punct poate primi ramburs
         NUMAI PE CARD. Vezi `shipping/plata-in-punct-cargus.ts`. */
      paymentType: typeof p.PaymentType === "number" ? p.PaymentType : null,
      lat: Number(p.Latitude ?? 0),
      lng: Number(p.Longitude ?? 0),
    }))
    .filter((p) => p.id > 0);
}

// ─── Courier pickup order validation ─────────────────────────────────────────

/**
 * Validates (launches) the open order on the sender pickup point so the courier
 * actually comes. Cargus queues every created AWB into an open order on the
 * pickup point; it closes automatically at the point's AutomaticEOD hour or
 * explicitly via this call (action=1). Returns the order number.
 */
export async function validateCargusPickupOrder(
  config: CargusConfig,
  input: { pickupStart: string; pickupEnd: string }, // "YYYY-MM-DDTHH:mm"
): Promise<string> {
  const token = await getCargusToken(config.username, config.password, config.subscription_key);
  const params = new URLSearchParams({
    locationId: String(config.location_id),
    action: "1",
    PickupStartDate: input.pickupStart,
    PickupEndDate: input.pickupEnd,
  });
  return cargusPut(`Orders?${params.toString()}`, token, config.subscription_key);
}

// ─── AWB Deletion ─────────────────────────────────────────────────────────────

export async function deleteCargusAwb(
  config: CargusConfig,
  barCode: string,
): Promise<void> {
  const token = await getCargusToken(config.username, config.password, config.subscription_key);
  await cargusDelete(`Awbs?barCode=${encodeURIComponent(barCode)}`, token, config.subscription_key);
}

// ─── AWB PDF (base64) ─────────────────────────────────────────────────────────

// format: 0 = A4, 1 = Label 10x14
export async function getCargusAwbPdf(
  config: CargusConfig,
  barCode: string,
  format: 0 | 1,
): Promise<Buffer> {
  const token = await getCargusToken(config.username, config.password, config.subscription_key);
  const barCodes = JSON.stringify([barCode]);
  const base64 = await cargusGet<string>(
    `AwbDocuments?barCodes=${encodeURIComponent(barCodes)}&type=PDF&format=${format}&printMainOnce=1`,
    token,
    config.subscription_key,
  );
  return Buffer.from(base64, "base64");
}

// ─── Account load (for config UI) ────────────────────────────────────────────

export async function loadCargusAccount(
  username: string,
  password: string,
  subscriptionKey: string,
): Promise<{
  locations: CargusPickupLocation[];
  priceTables: CargusPriceTable[];
} | { error: string }> {
  try {
    const token = await getCargusToken(username, password, subscriptionKey);
    const [locations, priceTables] = await Promise.all([
      getCargusPickupLocations(token, subscriptionKey),
      getCargusPriceTables(token, subscriptionKey),
    ]);
    return { locations, priceTables };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Urmarirea coletului ──────────────────────────────────────────────────────

/**
 * Ce spun ei despre o expediere, adus in forma noastra.
 *
 * ⚠ `stare` e TEXT LIBER, nu un cod. Cargus nu publica nicio enumerare in toata documentatia
 * V3: singurul exemplu de status din ea e „Tiparit". De aceea campul se pastreaza ca sa fie
 * ARATAT si ca sa se adune vocabularul, si NU se compara in cod. Vezi migratia `2027-01-19`.
 */
export type StareCargus = {
  awb: string;
  /** Textul lor. Gol cand nu l-au dat. */
  stare: string;
  /** Data ultimului eveniment pe care ni l-au spus EI, nu cand am citit noi. */
  ultimulEvenimentLa: string | null;
  /** Ultima descriere de eveniment, cand exista. */
  ultimulEveniment: string | null;
  /** ⚠ Singurul semnal STRUCTURAT din raspunsul lor. */
  confirmatLa: string | null;
  confirmatDe: string | null;
  /** ⚠ Raspunsul intreg: vezi nota despre pastrarea raspunsului brut. */
  brut: Record<string, unknown>;
};

function sirSauNull(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

/** O expeditie din raspunsul lor, oricare din cele doua rute ar fi intors-o. */
function stareaDinRand(r: Record<string, unknown>): StareCargus | null {
  const awb = sirSauNull(r.BarCode) ?? sirSauNull(r.Barcode) ?? sirSauNull(r.Code);
  if (!awb) return null;

  /*
   * ⚠ Evenimentele stau pe COLET (`Packages[].Events[]`), nu pe expediere, iar o expediere
   * poate avea mai multe colete. Se ia cel mai NOU eveniment din toate, nu primul gasit:
   * ordinea in care ni le dau ei nu e promisa nicaieri.
   */
  const colete = Array.isArray(r.Packages) ? r.Packages as Record<string, unknown>[] : [];
  let ultimLa: string | null = null;
  let ultimText: string | null = null;
  for (const c of colete) {
    const ev = Array.isArray(c?.Events) ? c.Events as Record<string, unknown>[] : [];
    for (const e of ev) {
      const cand = sirSauNull(e.Date);
      if (!cand) continue;
      if (ultimLa === null || cand > ultimLa) {
        ultimLa = cand;
        ultimText = sirSauNull(e.Description);
      }
    }
  }

  return {
    awb,
    stare: sirSauNull(r.StatusExpression) ?? sirSauNull(r.Status) ?? "",
    ultimulEvenimentLa: ultimLa,
    ultimulEveniment: ultimText,
    confirmatLa: sirSauNull(r.ConfirmationDate),
    confirmatDe: sirSauNull(r.ConfirmationPersonaName) ?? sirSauNull(r.ConfirmationName),
    brut: r,
  };
}

/**
 * Tot ce s-a miscat in contul lor intre doua date, dintr-o singura cerere.
 *
 * ⚠ `AwbTrace/GetDeltaEvents` cere datele in `mm-dd-yyyy`, AMERICAN, spre deosebire de
 * `CashAccount/GetByDate`, care le cere ISO. Vezi `shipping/datele-cargus.ts`.
 */
export async function evenimenteCargus(
  config: CargusConfig,
  deLa: Date,
  panaLa: Date,
): Promise<StareCargus[]> {
  const token = await getCargusToken(config.username, config.password, config.subscription_key);
  const cale = `AwbTrace/GetDeltaEvents?FromDate=${dataEvenimentelorCargus(deLa)}`
    + `&ToDate=${dataEvenimentelorCargus(panaLa)}`;
  const data = await cargusGet<unknown>(cale, token, config.subscription_key);
  const randuri = Array.isArray(data) ? data as Record<string, unknown>[] : [];
  return randuri.map(stareaDinRand).filter((x): x is StareCargus => x !== null);
}

/**
 * Starea unor AWB-uri anume.
 *
 * ⚠ `barCode` e o LISTA JSON, nu un singur cod: asa o cere documentatia lor
 * (`$jsonAwb=json_encode($awbList)`), si asa se intreaba zece colete intr-o cerere.
 */
export async function urmarireCargus(
  config: CargusConfig,
  awburi: string[],
): Promise<StareCargus[]> {
  if (awburi.length === 0) return [];
  const token = await getCargusToken(config.username, config.password, config.subscription_key);
  const cale = `AwbTrace/WithRedirect?barCode=${encodeURIComponent(JSON.stringify(awburi))}`;
  const data = await cargusGet<unknown>(cale, token, config.subscription_key);
  const randuri = Array.isArray(data) ? data as Record<string, unknown>[] : [];
  return randuri.map(stareaDinRand).filter((x): x is StareCargus => x !== null);
}

// ─── Rambursul incasat ────────────────────────────────────────────────────────

/**
 * Un ramburs, asa cum il tin ei in contul colector.
 *
 * ⚠ DOUA DATE, SI NU INSEAMNA ACELASI LUCRU. `RepaymentDate` e cand s-a INCASAT banul de la
 * cumparator; `DeductionDate` e cand a plecat ordinul de plata catre comerciant. Un ramburs
 * incasat dar nevirat inca are prima si n-o are pe a doua.
 */
export type RambursCargus = {
  awb: string;
  /** Data emiterii expedierii. */
  ziuaAwb: string | null;
  /** Cand s-a incasat de la cumparator. */
  ziuaIncasarii: string | null;
  /** Cand a plecat ordinul de plata catre comerciant. `null` = inca nevirat. */
  ziuaVirarii: string | null;
  /** Numarul ordinului de plata. */
  ordinDePlata: string | null;
  suma: number;
  destinatar: string | null;
  localitate: string | null;
  referinta: string | null;
  brut: Record<string, unknown>;
};

/**
 * Rambursurile din contul colector, pe un interval.
 *
 * ⚠ `CashAccount/GetByDate` cere datele ISO (`yyyy-mm-dd`), spre deosebire de
 * `AwbTrace/GetDeltaEvents`, care le cere americane. Vezi `shipping/datele-cargus.ts`.
 */
export async function rambursuriCargus(
  config: CargusConfig,
  deLa: Date,
  panaLa: Date,
): Promise<RambursCargus[]> {
  const token = await getCargusToken(config.username, config.password, config.subscription_key);
  const cale = `CashAccount/GetByDate?FromDate=${dataRambursurilorCargus(deLa)}`
    + `&ToDate=${dataRambursurilorCargus(panaLa)}`;
  const data = await cargusGet<unknown>(cale, token, config.subscription_key);
  const randuri = Array.isArray(data) ? data as Record<string, unknown>[] : [];

  return randuri.flatMap((r) => {
    const awb = sirSauNull(r.BarCode) ?? sirSauNull(r.Barcode);
    if (!awb) return [];
    const suma = Number(r.RepaymentValue ?? 0);
    return [{
      awb,
      ziuaAwb: ziuaLorCargus(r.Date),
      ziuaIncasarii: ziuaLorCargus(r.RepaymentDate),
      ziuaVirarii: ziuaLorCargus(r.DeductionDate),
      ordinDePlata: sirSauNull(r.DeductionId) ?? (r.DeductionId != null ? String(r.DeductionId) : null),
      suma: Number.isFinite(suma) ? suma : 0,
      destinatar: sirSauNull(r.Receiver),
      localitate: sirSauNull(r.ToLocality),
      referinta: sirSauNull(r.CustomString),
      brut: r,
    }];
  });
}
