const BASE_URL = "https://api.dpd.ro/v1";

export type DpdConfig = {
  enabled: boolean;
  username: string;
  password: string;
  client_id: number;
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
  const data = await res.json() as Record<string, unknown>;
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

export async function createDpdShipment(
  config: DpdConfig,
  input: DpdShipmentInput,
): Promise<DpdShipmentResult> {
  const today = new Date().toISOString().slice(0, 10);

  const hasCod = input.cashOnDelivery > 0;
  const serviceBlock: Record<string, unknown> = {
    pickupDate: today,
    serviceId: 1, // DPD Classic Romania
    autoAdjustPickupDate: true,
  };
  if (hasCod) {
    serviceBlock["additionalServices"] = {
      cod: {
        amount: input.cashOnDelivery,
        currencyCode: "RON",
        processingType: "CASH",
      },
    };
  }

  const body = {
    userName: config.username,
    password: config.password,
    language: "RO",
    clientSystemId: "edinio",
    sendingDate: today,
    shipmentType: 2,
    sender: { clientId: config.client_id },
    receiver: {
      privatePerson: true,
      name: input.recipientName,
      phone: input.recipientPhone,
      email: input.recipientEmail || undefined,
      address: {
        countryId: 642, // Romania
        siteName: input.recipientCity,
        streetName: input.recipientStreet || "Strada",
        streetNo: input.recipientStreetNo || "1",
        addressNote: input.recipientAddressNote || undefined,
      },
    },
    service: serviceBlock,
    primaryShipment: {
      weight: input.weightKg,
      size: {
        depth: input.length ?? 0,
        width: input.width ?? 0,
        height: input.height ?? 0,
      },
    },
    ref1: input.ref1,
    shipmentNote: input.shipmentNote || undefined,
  };

  const res = await dpdPost<{
    shipmentId: number;
    parcels: { seqNo: number; id: number; barcode: string }[];
  }>("shipment", body);

  if (!res.shipmentId) throw new Error("shipmentId lipsa din raspuns DPD");
  const barcode = res.parcels?.[0]?.barcode ?? String(res.parcels?.[0]?.id ?? "");
  if (!barcode) throw new Error("Barcod AWB DPD lipsa din raspuns");

  return { shipmentId: res.shipmentId, barcode };
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
    shipmentId,
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
  const data = await dpdPost<{ pdfAsBase64: string }>("print/extended", {
    userName: config.username,
    password: config.password,
    language: "RO",
    parcels: [{ id: barcode }],
    paperFormat: format,
    printer: "pdf",
  });
  if (!data.pdfAsBase64) throw new Error("PDF lipsa din raspuns DPD");
  return Buffer.from(data.pdfAsBase64, "base64");
}
