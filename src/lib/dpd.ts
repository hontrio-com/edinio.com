import { normalizePhone } from "@/lib/utils/phone";
import { stripDiacritics, normalizeCountyName, normalizeLocalityName } from "@/lib/utils/ro-address";

const BASE_URL = "https://api.dpd.ro/v1";

// Domestic service preference when services/destination returns several:
// 2505 (DPD STANDARD) is the current mainline service, the CLASIC ones are
// legacy contracts — pick in this order instead of blindly taking the first.
const DPD_PREFERRED_SERVICES = [2505, 2002, 2003];

export type DpdConfig = {
  enabled: boolean;
  username: string;
  password: string;
  client_id: number;
  /** Opt-in to international (EU) delivery — shows the country field at checkout. */
  international_enabled?: boolean;
  /** Opt-in: price international orders by the real product weight (else a 1kg estimate). */
  use_product_weight?: boolean;
  /** Sender IBAN — required by DPD to pay back COD (ramburs) collected from recipients. */
  iban?: string;
  /** Bank account holder (the merchant). Sent alongside the IBAN. */
  account_holder?: string;
  /** Opt-in: insure shipments for the order's product value (declaredValue). */
  declared_value_enabled?: boolean;
  /**
   * Opt-in "deschidere/testare la livrare" (OBPD). Only valid for services
   * 2505/2002/2113/2005 and home delivery (not pickup points) — same rules as
   * DPD's official module. Empty/undefined = off.
   */
  open_before_delivery?: "" | "OPEN" | "TEST";
  /** Who pays the return shipment if the recipient refuses after OBPD. */
  obpd_payer?: "SENDER" | "RECIPIENT";
};

export type DpdShipmentInput = {
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  recipientCity: string;
  /**
   * Recipient county — used to disambiguate the DPD site: Romania has many
   * same-named localities in different counties (e.g. "1 Decembrie" exists in
   * both Ilfov and Vaslui), and DPD's nomenclature carries the county as
   * `region`.
   */
  recipientCounty?: string;
  recipientStreet: string;
  recipientStreetNo: string;
  recipientAddressNote: string;
  weightKg: number;
  length?: number;
  width?: number;
  height?: number;
  cashOnDelivery: number;
  ref1: string;
  shipmentNote: string;
  /** Parcel content description (required by DPD, esp. for customs on international). */
  content?: string;
  /** DPD pickup point (office/locker) id — replaces the street address entirely. */
  pickupOfficeId?: number;
  /** Insured value (RON) — sent as additionalServices.declaredValue. */
  declaredValue?: number;
};

export type DpdShipmentResult = {
  shipmentId: number;
  barcode: string;
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function dpdPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // DPD returns a non-JSON body (e.g. "Cannot deserialize ...") when the request
  // is malformed; read as text first so we surface the real message instead of a
  // bare "Unexpected token ... is not valid JSON".
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`DPD ${path}: ${(text || res.statusText).slice(0, 250)}`);
  }
  if (!res.ok || data["error"]) {
    const errInfo = data["error"] as Record<string, unknown> | null | undefined;
    const msg = errInfo?.["message"] ?? data["message"] ?? res.statusText;
    throw new Error(`DPD ${path}: ${msg}`);
  }
  return data as T;
}

// ─── Account verification ─────────────────────────────────────────────────────

export async function loadDpdAccount(
  username: string,
  password: string,
): Promise<{ clientId: number; name: string } | { error: string }> {
  try {
    const data = await dpdPost<{
      clientId: number;
      clientName: string;
    }>("client", { userName: username, password, language: "RO" });
    if (!data.clientId) throw new Error("clientId lipsa din raspuns");
    return { clientId: data.clientId, name: data.clientName ?? "" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Site (locality) resolution ───────────────────────────────────────────────

type DpdSite = {
  id?: number;
  name?: string;
  nameEn?: string;
  region?: string;   // DPD RO nomenclature: region = county (uppercase, no diacritics)
  regionEn?: string;
  postCode?: string;
};

/**
 * Resolve the DPD siteId for a Romanian locality. Sending only siteName is
 * ambiguous for same-named localities across counties, so search the DPD
 * nomenclature by name and pick the site whose region matches the order's
 * county. Returns null when nothing matches unambiguously — the caller then
 * falls back to siteName and lets DPD decide.
 */
export async function resolveDpdSiteId(
  config: DpdConfig,
  city: string,
  county?: string,
): Promise<number | null> {
  const name = normalizeLocalityName(city, county);
  if (!name) return null;
  try {
    const data = await dpdPost<{ sites?: DpdSite[] }>("location/site", {
      userName: config.username,
      password: config.password,
      language: "RO",
      countryId: 642,
      name,
    });
    const sites = data.sites ?? [];
    if (sites.length === 0) return null;

    const norm = (s: string | undefined) => stripDiacritics(String(s ?? "")).trim().toLowerCase();
    // Prefer exact locality-name matches over partial ones ("Deva" also matches "Vadu Devei").
    const exact = sites.filter((s) => norm(s.name) === norm(name) || norm(s.nameEn) === norm(name));
    const pool = exact.length > 0 ? exact : sites;

    if (!county) return pool.length === 1 ? (pool[0].id ?? null) : null;

    const wantedCounty = norm(normalizeCountyName(county));
    const byCounty = pool.filter((s) => norm(s.region) === wantedCounty || norm(s.regionEn) === wantedCounty);
    if (byCounty.length >= 1) return byCounty[0].id ?? null;
    return pool.length === 1 ? (pool[0].id ?? null) : null;
  } catch {
    return null; // resolution is best-effort; the shipment falls back to siteName
  }
}

/** Domestic service choice: prefer the mainline services over the first hit. */
function pickPreferredDpdService(ids: number[]): number | undefined {
  for (const preferred of DPD_PREFERRED_SERVICES) {
    if (ids.includes(preferred)) return preferred;
  }
  return ids[0];
}

// ─── Create shipment ──────────────────────────────────────────────────────────

// RO and BG are "local" (address type 1) in the Speedy engine; everything else
// is "foreign" (address type 2), which requires addressLine1 instead of
// streetName/streetNo.
const LOCAL_COUNTRY_IDS = new Set([642, 100]); // Romania, Bulgaria

// Builds the api.dpd.ro/v1 (Speedy) shipment body. Required top-level objects:
// sender, recipient, service, content, payment. The recipient address differs by
// type: type 1 (local) uses street fields / addressNote; type 2 (foreign) uses
// addressLine1 (+ addressLine2). Both use countryId + siteName + postCode to
// resolve the destination site.
function buildDpdShipmentBody(
  config: DpdConfig,
  input: DpdShipmentInput,
  opts: { countryId: number; postCode?: string; serviceId: number; siteId?: number },
) {
  const service: Record<string, unknown> = {
    autoAdjustPickupDate: true,
    serviceId: opts.serviceId,
  };
  const additionalServices: Record<string, unknown> = {};
  const hasCod = input.cashOnDelivery > 0;
  if (hasCod) {
    // currencyCode is sent by DPD's official module too; domestic COD is RON.
    additionalServices.cod = { amount: input.cashOnDelivery, processingType: "CASH", currencyCode: "RON" };
  }
  if (input.declaredValue && input.declaredValue > 0) {
    additionalServices.declaredValue = { amount: Math.round(input.declaredValue * 100) / 100 };
  }
  // OBPD (open/test at delivery): the official module applies it only for
  // services 2505/2002/2113/2005 and never for pickup-point deliveries.
  const obpdOption = config.open_before_delivery;
  if (
    (obpdOption === "OPEN" || obpdOption === "TEST") &&
    !input.pickupOfficeId &&
    opts.countryId === 642 &&
    [2505, 2002, 2113, 2005].includes(opts.serviceId)
  ) {
    additionalServices.obpd = {
      option: obpdOption,
      returnShipmentServiceId: opts.serviceId,
      returnShipmentPayer: config.obpd_payer ?? "SENDER",
    };
  }
  if (Object.keys(additionalServices).length > 0) {
    service.additionalServices = additionalServices;
  }

  // COD (ramburs): DPD pays the collected amount back to the sender, so a valid
  // sender IBAN is required.
  const payment: Record<string, unknown> = { courierServicePayer: "SENDER" };
  if (hasCod) {
    const iban = (config.iban ?? "").replace(/\s/g, "");
    if (!iban) {
      throw new Error("Pentru comenzi cu ramburs, adauga IBAN-ul in setarile DPD (necesar pentru returnarea banilor incasati).");
    }
    payment.senderBankAccount = {
      iban,
      accountHolder: (config.account_holder ?? "").trim() || "Expeditor",
    };
  }

  // We capture the street as a single free-text field, so join street + no,
  // then append the extra address details (bloc/ap/interfon) so they reach the
  // label. DPD's nomenclature is diacritics-free (the official module strips
  // them on every address field), so all address text goes through
  // stripDiacritics.
  const streetPart = [input.recipientStreet, input.recipientStreetNo]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const fullStreet = stripDiacritics(
    [streetPart || input.recipientCity, (input.recipientAddressNote ?? "").trim()]
      .filter(Boolean)
      .join(", "),
  );

  const address: Record<string, unknown> = {
    countryId: opts.countryId,
    // A resolved siteId pins the exact locality (county included); siteName is
    // the fallback and must be diacritics-free ("Sector X" folds to Bucuresti).
    ...(opts.siteId
      ? { siteId: opts.siteId }
      : { siteName: normalizeLocalityName(input.recipientCity, input.recipientCounty) }),
    ...(opts.postCode ? { postCode: opts.postCode } : {}),
  };
  if (LOCAL_COUNTRY_IDS.has(opts.countryId)) {
    // Type 1 (local): our single address line goes in addressNote — the spec's
    // "all components of the address stored in addressNote" path, which avoids
    // street-registry validation against a non-split address.
    address.addressNote = fullStreet.slice(0, 200);
  } else {
    // Type 2 (foreign): addressLine1 is REQUIRED, max 35; overflow to line 2.
    address.addressLine1 = fullStreet.slice(0, 35) || ".";
    if (fullStreet.length > 35) address.addressLine2 = fullStreet.slice(35, 70);
  }

  // Parcel dimensions (cm) feed the volumetric weight — sent per parcel, with
  // the module's mapping: depth = length.
  const hasDims = !!(input.length && input.width && input.height);
  const content: Record<string, unknown> = {
    parcelsCount: 1,
    totalWeight: input.weightKg,
    // `contents` is required by DPD (customs description on international).
    contents: (input.content ?? "").trim().slice(0, 50) || "Produse",
    package: "BOX",
  };
  if (hasDims) {
    content.parcels = [{
      seqNo: 1,
      weight: input.weightKg,
      size: { width: input.width, depth: input.length, height: input.height },
    }];
  }

  // Pickup-point delivery replaces the street address entirely: the official
  // module sends recipient.pickupOfficeId INSTEAD of an address block.
  const recipient: Record<string, unknown> = {
    phone1: { number: normalizePhone(input.recipientPhone) },
    privatePerson: true,
    clientName: input.recipientName,
    email: input.recipientEmail || undefined,
    ...(input.pickupOfficeId
      ? { pickupOfficeId: input.pickupOfficeId }
      : { address }),
  };

  return {
    userName: config.username,
    password: config.password,
    language: "RO",
    sender: { clientId: config.client_id },
    recipient,
    service,
    content,
    payment,
    ref1: input.ref1,
    shipmentNote: input.shipmentNote || undefined,
  };
}

// CreateShipmentResponse: { id, parcels: [{ id }], ... } — the parcel id IS the AWB barcode.
async function sendDpdShipment(body: unknown): Promise<DpdShipmentResult> {
  const res = await dpdPost<{ id?: string | number; parcels?: { id?: string | number }[] }>("shipment", body);
  const barcode = res.parcels?.[0]?.id != null ? String(res.parcels[0].id) : "";
  if (!barcode) throw new Error("AWB DPD nu a fost returnat");
  return { shipmentId: Number(res.id) || 0, barcode };
}

export async function createDpdShipment(
  config: DpdConfig,
  input: DpdShipmentInput,
): Promise<DpdShipmentResult> {
  // Pin the exact locality first: same-named localities exist across counties,
  // and only the siteId encodes the county.
  const siteId = await resolveDpdSiteId(config, input.recipientCity, input.recipientCounty);

  // Domestic RO: discover the permitted service for the destination —
  // a hardcoded serviceId is rejected with "Serviciul nu este permis".
  const ids = await getDpdDestinationServiceIds(
    config,
    siteId
      ? { countryId: 642, siteId }
      : { countryId: 642, siteName: normalizeLocalityName(input.recipientCity, input.recipientCounty) },
  );
  const serviceId = pickPreferredDpdService(ids);
  if (!serviceId) throw new Error("DPD nu a returnat niciun serviciu pentru aceasta destinatie. Verifica orasul/judetul destinatarului.");
  return sendDpdShipment(buildDpdShipmentBody(config, input, { countryId: 642, serviceId, siteId: siteId ?? undefined }));
}

// ─── Domestic tariff (checkout) ──────────────────────────────────────────────

/**
 * Live domestic price for a RO destination, COD premium included when the
 * order is ramburs. Resolves the site by county to quote the right locality.
 * null = destination not resolvable / no service (caller falls back to the
 * flat zone price).
 */
export async function calculateDpdDomesticPrice(
  config: DpdConfig,
  input: { city: string; county?: string; weightKg: number; cod?: number },
): Promise<{ serviceId: number; price: number } | null> {
  const siteId = await resolveDpdSiteId(config, input.city, input.county);
  const location: Record<string, unknown> = siteId
    ? { countryId: 642, siteId }
    : { countryId: 642, siteName: normalizeLocalityName(input.city, input.county) };

  const ids = await getDpdDestinationServiceIds(
    config,
    siteId ? { countryId: 642, siteId } : { countryId: 642, siteName: String(location.siteName) },
  );
  const serviceId = pickPreferredDpdService(ids);
  if (!serviceId) return null;

  const service: Record<string, unknown> = { autoAdjustPickupDate: true, serviceIds: [serviceId] };
  if (input.cod && input.cod > 0) {
    service.additionalServices = {
      cod: { amount: input.cod, processingType: "CASH", currencyCode: "RON" },
    };
  }

  const data = await dpdPost<{
    calculations?: { price?: { amount?: number; total?: number; currency?: string }; error?: { message?: string } }[];
  }>("calculate", {
    userName: config.username,
    password: config.password,
    language: "RO",
    sender: { clientId: config.client_id },
    recipient: { privatePerson: true, addressLocation: location },
    service,
    content: { parcelsCount: 1, totalWeight: Math.max(input.weightKg, 0.1) },
    payment: { courierServicePayer: "SENDER" },
  });

  const calc = data.calculations?.[0];
  // Customer-facing domestic price is the gross total (VAT + COD premium included).
  const gross = calc?.price?.total ?? calc?.price?.amount;
  if (typeof gross !== "number") return null;
  return { serviceId, price: Math.round(gross * 100) / 100 };
}

// ─── Pickup points (offices / lockers) ───────────────────────────────────────

export type DpdOffice = {
  id: number;
  name: string;
  siteId?: number;
  address: string; // fullAddressString
  city: string;    // address.siteName
};

/**
 * All DPD RO pickup points (offices + lockers). Mirrors the official module's
 * location/office call (credentials only — the account's country implied).
 */
export async function getDpdOffices(config: DpdConfig): Promise<DpdOffice[]> {
  const data = await dpdPost<{ offices?: Record<string, unknown>[] }>("location/office", {
    userName: config.username,
    password: config.password,
    language: "RO",
  });
  return (data.offices ?? [])
    .map((o) => {
      const addr = (o.address ?? {}) as Record<string, unknown>;
      return {
        id: Number(o.id ?? 0),
        name: String(o.name ?? ""),
        siteId: typeof o.siteId === "number" ? o.siteId : undefined,
        address: String(addr.fullAddressString ?? ""),
        city: String(addr.siteName ?? ""),
      };
    })
    .filter((o) => o.id > 0);
}

// ─── International (EU) ───────────────────────────────────────────────────────
// DPD Romania runs the Speedy engine: countryId is the ISO 3166-1 numeric code.
// Flow: services/destination (which service serves this country) -> calculate
// (live price) -> shipment (AWB). Domestic helpers above stay unchanged.

export type DpdIntlQuote = { serviceId: number; price: number; currency: string };

/**
 * DPD's engine wants postcodes without separators; Poland writes them "12-345"
 * (the official module strips the dash for PL) and some countries add spaces.
 */
function cleanIntlPostCode(countryId: number, postCode: string): string {
  const trimmed = postCode.trim().replace(/\s+/g, "");
  return countryId === 616 ? trimmed.replace(/-/g, "") : trimmed; // 616 = PL
}

/**
 * Valid DPD serviceId(s) for the sender -> destination route. The docs say the
 * serviceId MUST come from a Destination Services Request — hardcoding one is
 * rejected with "Serviciul nu este permis". Resolve the site by postCode and/or
 * siteName (city) alongside the countryId.
 */
export async function getDpdDestinationServiceIds(
  config: DpdConfig,
  location: { countryId: number; postCode?: string; siteName?: string; siteId?: number },
): Promise<number[]> {
  const addressLocation: Record<string, unknown> = { countryId: location.countryId };
  if (location.siteId) addressLocation.siteId = location.siteId;
  if (location.postCode) addressLocation.postCode = location.postCode;
  if (!location.siteId && location.siteName) addressLocation.siteName = location.siteName;

  const data = await dpdPost<{ services?: { serviceId?: number; id?: number }[] }>("services/destination", {
    userName: config.username,
    password: config.password,
    language: "RO",
    date: new Date().toISOString().slice(0, 10),
    sender: { clientId: config.client_id },
    recipient: { privatePerson: true, addressLocation },
  });
  return (data.services ?? [])
    .map((s) => s.serviceId ?? s.id)
    .filter((x): x is number => typeof x === "number");
}

/** Live international price for a destination + weight. null = no service / no price. */
export async function calculateDpdIntlPrice(
  config: DpdConfig,
  input: { countryId: number; postCode: string; weightKg: number; serviceId?: number },
): Promise<DpdIntlQuote | null> {
  const postCode = cleanIntlPostCode(input.countryId, input.postCode);
  let serviceId = input.serviceId;
  if (!serviceId) {
    const ids = await getDpdDestinationServiceIds(config, { countryId: input.countryId, postCode });
    serviceId = ids[0];
  }
  if (!serviceId) return null;

  const data = await dpdPost<{
    calculations?: { price?: { amount?: number; vat?: number; total?: number; currency?: string } }[];
    price?: { amount?: number; vat?: number; total?: number; currency?: string };
  }>("calculate", {
    userName: config.username,
    password: config.password,
    language: "RO",
    sender: { clientId: config.client_id },
    recipient: { privatePerson: true, addressLocation: { countryId: input.countryId, postCode } },
    service: { autoAdjustPickupDate: true, serviceIds: [serviceId] },
    content: { parcelsCount: 1, totalWeight: Math.max(input.weightKg, 0.1) },
    payment: { courierServicePayer: "SENDER" }, // merchant pays the courier
  });

  const price = data.calculations?.[0]?.price ?? data.price;
  // ShipmentPrice.amount = price BEFORE VAT (the contracted net rate); .total adds
  // VAT. We charge the net rate so it matches the merchant's DPD contract price.
  const net = price?.amount ?? price?.total;
  if (typeof net !== "number") return null;
  return { serviceId, price: Math.round(net * 100) / 100, currency: price?.currency ?? "RON" };
}

export type DpdIntlShipmentInput = DpdShipmentInput & {
  countryId: number;
  postCode: string;
  serviceId?: number;
};

/** Create an international (EU) AWB. Discovers the service if not supplied. */
export async function createDpdIntlShipment(
  config: DpdConfig,
  input: DpdIntlShipmentInput,
): Promise<DpdShipmentResult> {
  const postCode = cleanIntlPostCode(input.countryId, input.postCode);
  let serviceId = input.serviceId;
  if (!serviceId) {
    const ids = await getDpdDestinationServiceIds(config, { countryId: input.countryId, postCode });
    serviceId = ids[0];
  }
  if (!serviceId) throw new Error("DPD nu are serviciu international disponibil pentru aceasta destinatie.");

  // DPD international services do not support cash-on-delivery (ramburs), so it is
  // never sent for foreign shipments — international orders are paid online.
  return sendDpdShipment(
    buildDpdShipmentBody(config, { ...input, cashOnDelivery: 0 }, { countryId: input.countryId, postCode, serviceId }),
  );
}

// ─── Courier pickup request ───────────────────────────────────────────────────

/**
 * Requests a courier visit for already-created shipments. Mirrors the official
 * DPD RO module exactly: explicit shipment id list + visitEndTime 19:00, with
 * autoAdjustPickupDate letting DPD move the visit to the next working day when
 * the request comes in too late. Without a pickup request (or a daily pickup
 * contract), created shipments are never collected.
 */
export async function requestDpdCourierPickup(
  config: DpdConfig,
  shipmentIds: string[],
): Promise<void> {
  await dpdPost("pickup", {
    userName: config.username,
    password: config.password,
    language: "RO",
    explicitShipmentIdList: shipmentIds,
    visitEndTime: "19:00",
    autoAdjustPickupDate: true,
  });
}

// ─── Cancel shipment ──────────────────────────────────────────────────────────

export async function cancelDpdShipment(
  config: DpdConfig,
  shipmentId: number,
  comment = "Anulat",
): Promise<void> {
  await dpdPost("shipment/cancel", {
    userName: config.username,
    password: config.password,
    language: "RO",
    shipmentId: String(shipmentId), // spec: shipmentId is a String
    comment,
  });
}

// ─── Print AWB (base64 PDF) ───────────────────────────────────────────────────

// format: "A4" | "A6"
export async function getDpdAwbPdf(
  config: DpdConfig,
  barcode: string,
  format: "A4" | "A6" = "A6",
): Promise<Buffer> {
  // Extended Print: PrintRequest = { paperSize, parcels:[{ parcel:{ id } }] };
  // ExtendedPrintResponse returns { data: <base64 pdf> }.
  const res = await dpdPost<{ data?: string }>("print/extended", {
    userName: config.username,
    password: config.password,
    language: "RO",
    paperSize: format, // A4 | A6 | A4_4xA6
    parcels: [{ parcel: { id: barcode } }],
  });
  if (!res.data) throw new Error("PDF lipsa din raspuns DPD");
  return Buffer.from(res.data, "base64");
}
