import { normalizePhone } from "@/lib/utils/phone";
import { stripDiacritics, normalizeCountyName, normalizeLocalityName } from "@/lib/utils/ro-address";

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

// ─── Token cache ──────────────────────────────────────────────────────────────

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenEntry>();
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23h (token valid 24h, buffer 1h)

function cacheKey(username: string, subscriptionKey: string) {
  return `${username}::${subscriptionKey}`;
}

async function getCargusToken(
  username: string,
  password: string,
  subscriptionKey: string,
): Promise<string> {
  const key = cacheKey(username, subscriptionKey);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(`${BASE_URL}/LoginUser`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Ocp-Apim-Trace": "true",
    },
    body: JSON.stringify({ UserName: username, Password: password }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).trim();
    // The Azure gateway rejects a bad/inactive subscription key with 401 before
    // the request reaches Cargus. A 500 here comes from Cargus's own backend and
    // almost always means the WebExpress username/password are wrong (or that
    // account has no API access enabled) — Cargus returns 500 instead of 401.
    if (res.status === 500) {
      throw new Error(
        "Autentificare Cargus esuata: utilizatorul sau parola contului WebExpress sunt incorecte, " +
        "sau contul nu are acces API activat. Subscription Key-ul este corect (a trecut de gateway)." +
        (detail ? ` Raspuns Cargus: ${detail.slice(0, 200)}` : ""),
      );
    }
    throw new Error(`Cargus login error: ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }
  const token = (await res.json()) as string;
  if (!token || typeof token !== "string") throw new Error("Token Cargus invalid");

  tokenCache.set(key, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function cargusGet<T>(
  path: string,
  token: string,
  subscriptionKey: string,
): Promise<T> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Ocp-Apim-Trace": "true",
    },
  });
  if (!res.ok) throw new Error(`Cargus GET ${path}: ${res.status} ${res.statusText}`);
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
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Cargus: ${cargusErrorDetail(text).slice(0, 300) || `${res.status} ${res.statusText}`}`);
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
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Cargus: ${cargusErrorDetail(text).slice(0, 300) || `${res.status} ${res.statusText}`}`);
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
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Cargus DELETE ${path}: ${res.status} — ${text}`);
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

  const isEnvelope = (input.envelopes ?? 0) > 0;
  const envelopes = Math.min(input.envelopes ?? 0, 9); // docs: max 9 envelopes
  // Docs/official module: an envelope shipment weighs at most 1 kg.
  const totalWeight = isEnvelope ? Math.min(input.totalWeightKg, 1) : input.totalWeightKg;

  // Ship & Go delivery runs on its own service (38); otherwise pick by weight.
  const service = input.pudoPointId ? { id: 38, name: "Ship & Go" } : getCargusServiceId(totalWeight);

  // COD routing: the merchant chooses whether the money comes back as cash in
  // an envelope (default) or into the bank collector account.
  const codAmount = input.cashRepayment > 0 ? input.cashRepayment : 0;
  const bankRepayment = config.repayment_type === "bank" ? codAmount : 0;
  const cashRepayment = config.repayment_type === "bank" ? 0 : codAmount;

  const parcelType = isEnvelope ? 0 : 1; // ParcelCodes.Type: 0 = envelope, 1 = parcel
  const parcelCodes = input.parcelsDetails.map((p, i) => ({
    Code: String(i),
    Type: parcelType,
    Weight: isEnvelope ? Math.min(p.weight, 1) : p.weight,
    Length: p.length ?? 0,
    Width: p.width ?? 0,
    Height: p.height ?? 0,
    ParcelContent: input.packageContent || "",
  }));

  // If no parcel details provided, create one from totals
  if (parcelCodes.length === 0) {
    parcelCodes.push({
      Code: "0",
      Type: parcelType,
      Weight: totalWeight,
      Length: 0,
      Width: 0,
      Height: 0,
      ParcelContent: input.packageContent || "",
    });
  }

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
    Parcels: isEnvelope ? 0 : input.parcels,
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

  // The barcode may arrive as a JSON string or a bare number — coerce it.
  const barCode = await cargusPost<string | number>("Awbs", token, config.subscription_key, body);
  const code = String(barCode ?? "").trim();
  if (!code || code === "null") throw new Error("AWB Cargus nu a fost returnat");
  return code;
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
 * falls back to the flat zone price). Returns GrandTotal (VAT included).
 */
export async function calculateCargusPrice(
  config: CargusConfig,
  input: { county: string; city: string; weightKg: number; cod?: number },
): Promise<{ price: number; serviceId: number } | null> {
  const sender = await resolveCargusSenderLocation(config);
  if (!sender) return null;

  const token = await getCargusToken(config.username, config.password, config.subscription_key);
  const weight = Math.max(1, Math.ceil(input.weightKg));
  const service = getCargusServiceId(weight);
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

  const result = await cargusPost<{ GrandTotal?: number; Subtotal?: number }>(
    "ShippingCalculation",
    token,
    config.subscription_key,
    body,
  );
  const gross = result?.GrandTotal ?? null;
  if (typeof gross !== "number") return null;
  return { price: Math.round(gross * 100) / 100, serviceId: service.id };
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
