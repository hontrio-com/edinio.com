const BASE_URL = "https://api.dpd.ro/v1";

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
};

export type DpdShipmentInput = {
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  recipientCity: string;
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
  opts: { countryId: number; postCode?: string; serviceId: number },
) {
  const service: Record<string, unknown> = {
    autoAdjustPickupDate: true,
    serviceId: opts.serviceId,
  };
  const hasCod = input.cashOnDelivery > 0;
  if (hasCod) {
    service.additionalServices = {
      cod: { amount: input.cashOnDelivery, processingType: "CASH" },
    };
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

  // We capture the street as a single free-text field, so join street + no.
  const fullStreet = [input.recipientStreet, input.recipientStreetNo]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim() || input.recipientCity;

  const address: Record<string, unknown> = {
    countryId: opts.countryId,
    siteName: input.recipientCity,
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

  return {
    userName: config.username,
    password: config.password,
    language: "RO",
    sender: { clientId: config.client_id },
    recipient: {
      phone1: { number: input.recipientPhone },
      privatePerson: true,
      clientName: input.recipientName,
      email: input.recipientEmail || undefined,
      address,
    },
    service,
    content: { parcelsCount: 1, totalWeight: input.weightKg },
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
  // Domestic RO (countryId 642), DPD Classic (serviceId 1).
  return sendDpdShipment(buildDpdShipmentBody(config, input, { countryId: 642, serviceId: 1 }));
}

// ─── International (EU) ───────────────────────────────────────────────────────
// DPD Romania runs the Speedy engine: countryId is the ISO 3166-1 numeric code.
// Flow: services/destination (which service serves this country) -> calculate
// (live price) -> shipment (AWB). Domestic helpers above stay unchanged.

export type DpdIntlQuote = { serviceId: number; price: number; currency: string };

/** Valid DPD serviceId(s) for the sender -> destination route. */
export async function getDpdDestinationServiceIds(
  config: DpdConfig,
  countryId: number,
  postCode: string,
): Promise<number[]> {
  const data = await dpdPost<{ services?: { serviceId?: number; id?: number }[] }>("services/destination", {
    userName: config.username,
    password: config.password,
    language: "RO",
    date: new Date().toISOString().slice(0, 10),
    sender: { clientId: config.client_id },
    recipient: { privatePerson: true, addressLocation: { countryId, postCode } },
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
  let serviceId = input.serviceId;
  if (!serviceId) {
    const ids = await getDpdDestinationServiceIds(config, input.countryId, input.postCode);
    serviceId = ids[0];
  }
  if (!serviceId) return null;

  const data = await dpdPost<{
    calculations?: { price?: { total?: number; amount?: number; currency?: string } }[];
    price?: { total?: number; amount?: number; currency?: string };
  }>("calculate", {
    userName: config.username,
    password: config.password,
    language: "RO",
    sender: { clientId: config.client_id },
    recipient: { privatePerson: true, addressLocation: { countryId: input.countryId, postCode: input.postCode } },
    service: { autoAdjustPickupDate: true, serviceIds: [serviceId] },
    content: { parcelsCount: 1, totalWeight: Math.max(input.weightKg, 0.1) },
    payment: { courierServicePayer: "SENDER" }, // merchant pays the courier
  });

  const price = data.calculations?.[0]?.price ?? data.price;
  const total = price?.total ?? price?.amount;
  if (typeof total !== "number") return null;
  return { serviceId, price: Math.round(total * 100) / 100, currency: price?.currency ?? "RON" };
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
  let serviceId = input.serviceId;
  if (!serviceId) {
    const ids = await getDpdDestinationServiceIds(config, input.countryId, input.postCode);
    serviceId = ids[0];
  }
  if (!serviceId) throw new Error("DPD nu are serviciu international disponibil pentru aceasta destinatie.");

  // DPD international services do not support cash-on-delivery (ramburs), so it is
  // never sent for foreign shipments — international orders are paid online.
  return sendDpdShipment(
    buildDpdShipmentBody(config, { ...input, cashOnDelivery: 0 }, { countryId: input.countryId, postCode: input.postCode, serviceId }),
  );
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
