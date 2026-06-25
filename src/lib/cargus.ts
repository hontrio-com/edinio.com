import { normalizePhone } from "@/lib/utils/phone";

export type CargusConfig = {
  enabled: boolean;
  username: string;
  password: string;
  subscription_key: string;
  location_id: number;
  location_name: string;
  price_table_id: number;
  price_table_name: string;
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
  totalWeightKg: number;
  cashRepayment: number;
  openPackage: boolean;
  observations: string;
  packageContent: string;
  customString: string;
  parcelsDetails: { weight: number; length?: number; width?: number; height?: number }[];
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
    throw new Error(`Cargus POST ${path}: ${res.status} — ${text}`);
  }
  return res.json() as Promise<T>;
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

export function getCargusServiceId(totalWeightKg: number): { id: number; name: string } {
  if (totalWeightKg <= 31) return { id: 34, name: "Economic Standard" };
  if (totalWeightKg <= 50) return { id: 35, name: "Standard Plus" };
  return { id: 36, name: "Palet Standard" };
}

// ─── AWB Creation ─────────────────────────────────────────────────────────────

export async function createCargusAwb(
  config: CargusConfig,
  input: CargusAwbInput,
): Promise<string> {
  const token = await getCargusToken(config.username, config.password, config.subscription_key);
  const service = getCargusServiceId(input.totalWeightKg);

  const parcelCodes = input.parcelsDetails.map((p, i) => ({
    Code: String(i),
    Type: 1,
    Weight: p.weight,
    Length: p.length ?? 0,
    Width: p.width ?? 0,
    Height: p.height ?? 0,
    ParcelContent: input.packageContent || "",
  }));

  // If no parcel details provided, create one from totals
  if (parcelCodes.length === 0) {
    parcelCodes.push({
      Code: "0",
      Type: 1,
      Weight: input.totalWeightKg,
      Length: 0,
      Width: 0,
      Height: 0,
      ParcelContent: input.packageContent || "",
    });
  }

  const body = {
    SenderClientId: null,
    TertiaryClientId: null,
    Sender: { LocationId: config.location_id },
    Recipient: {
      LocationId: 0,
      Name: input.recipientName,
      CountyId: 0,
      CountyName: input.recipientCounty,
      LocalityId: 0,
      LocalityName: input.recipientCity,
      StreetId: 0,
      StreetName: "",
      BuildingNumber: "",
      AddressText: input.recipientAddress,
      ContactPerson: input.recipientName,
      PhoneNumber: normalizePhone(input.recipientPhone),
      Email: input.recipientEmail,
      CodPostal: input.recipientPostalCode,
      CountryId: 0,
    },
    Parcels: input.parcels,
    Envelopes: 0,
    TotalWeight: input.totalWeightKg,
    ServiceId: service.id,
    DeclaredValue: 0,
    CashRepayment: input.cashRepayment,
    BankRepayment: 0,
    OtherRepayment: "",
    BarCodeRepayment: "",
    PaymentInstrumentId: 0,
    PaymentInstrumentValue: 0,
    HasTertReimbursement: false,
    OpenPackage: input.openPackage,
    PriceTableId: config.price_table_id,
    ShipmentPayer: 1,
    ShippingRepayment: 0,
    SaturdayDelivery: false,
    MorningDelivery: false,
    Observations: input.observations,
    PackageContent: input.packageContent,
    CustomString: input.customString,
    BarCode: "",
    ParcelCodes: parcelCodes,
  };

  const barCode = await cargusPost<string>("Awbs", token, config.subscription_key, body);
  if (!barCode) throw new Error("AWB Cargus nu a fost returnat");
  return barCode;
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
