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

// Builds the api.dpd.ro/v1 (Speedy) shipment body. The spec requires the top
// level objects: sender, recipient, service, content, payment. (The earlier
// receiver/primaryShipment shape was the Interconnector API and is rejected with
// a "Cannot deserialize" error.) `siteName`+`postCode`+`countryId` resolve the
// destination for any address type (local RO or foreign EU).
function buildDpdShipmentBody(
  config: DpdConfig,
  input: DpdShipmentInput,
  opts: { countryId: number; postCode?: string; serviceId: number },
) {
  const service: Record<string, unknown> = {
    autoAdjustPickupDate: true,
    serviceId: opts.serviceId,
  };
  if (input.cashOnDelivery > 0) {
    service.additionalServices = {
      cod: { amount: input.cashOnDelivery, processingType: "CASH" },
    };
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
      address: {
        countryId: opts.countryId,
        siteName: input.recipientCity,
        ...(opts.postCode ? { postCode: opts.postCode } : {}),
        streetName: input.recipientStreet || "Strada",
        streetNo: input.recipientStreetNo || "1",
      },
    },
    service,
    content: { parcelsCount: 1, totalWeight: input.weightKg },
    payment: { courierServicePayer: "SENDER" }, // merchant pays the courier
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

  return sendDpdShipment(
    buildDpdShipmentBody(config, input, { countryId: input.countryId, postCode: input.postCode, serviceId }),
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
