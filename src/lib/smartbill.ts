const SMARTBILL_BASE = "https://ws.smartbill.ro/SBORO/api";

function getSmartbillAuth(): string {
  const email = process.env.SMARTBILL_EMAIL ?? "";
  const token = process.env.SMARTBILL_TOKEN ?? "";
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

export function isSmartbillConfigured(): boolean {
  return !!(
    process.env.SMARTBILL_EMAIL &&
    process.env.SMARTBILL_TOKEN &&
    process.env.SMARTBILL_CIF &&
    process.env.SMARTBILL_SERIES
  );
}

// Nu esti platitor de TVA — facturile se emit fara TVA.

export interface SmartbillClient {
  name: string;
  email: string;
  address?: string;
  city?: string;
  county?: string;
}

export interface SmartbillProduct {
  name: string;
  price: number;
  quantity: number;
}

export interface SmartbillInvoiceResult {
  series: string;
  number: string;
}

export async function createSmartbillInvoice(
  client: SmartbillClient,
  product: SmartbillProduct
): Promise<SmartbillInvoiceResult | null> {
  if (!isSmartbillConfigured()) {
    console.warn("[smartbill] Not configured — skipping invoice creation.");
    return null;
  }

  const body = {
    companyVatCode: process.env.SMARTBILL_CIF,
    client: {
      name: client.name,
      email: client.email || undefined,
      address: client.address || undefined,
      city: client.city || undefined,
      county: client.county || undefined,
      isTaxPayer: false,
      saveToDb: true,
    },
    isDraft: false,
    issueDate: new Date().toISOString().split("T")[0],
    seriesName: process.env.SMARTBILL_SERIES,
    currency: "RON",
    language: "RO",
    precision: 2,
    sendEmail: !!(client.email),
    products: [
      {
        name: product.name,
        measuringUnitName: "luna",
        currency: "RON",
        quantity: product.quantity,
        price: product.price,
        // Neplatitor de TVA — nu se adauga TVA pe factura
        isService: true,
        saveToDb: false,
      },
    ],
  };

  try {
    const res = await fetch(`${SMARTBILL_BASE}/invoice`, {
      method: "POST",
      headers: {
        Authorization: getSmartbillAuth(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as {
      series?: string;
      number?: string;
      errorText?: string;
      message?: string;
    };

    if (!res.ok || data.errorText) {
      console.error("[smartbill] Invoice creation failed:", data.errorText ?? res.status, data.message ?? "");
      return null;
    }

    if (!data.series || !data.number) {
      console.error("[smartbill] Missing series/number in response:", data);
      return null;
    }

    console.log("[smartbill] Invoice created:", data.series, data.number);
    return { series: data.series, number: data.number };
  } catch (err) {
    console.error("[smartbill] Fetch error:", err);
    return null;
  }
}

export function getInvoicePdfUrl(series: string, number: string): string {
  const cif = encodeURIComponent(process.env.SMARTBILL_CIF ?? "");
  const s = encodeURIComponent(series);
  const n = encodeURIComponent(number);
  return `${SMARTBILL_BASE}/invoice/pdf?cif=${cif}&seriesname=${s}&number=${n}`;
}

export function getSmartbillAuthHeader(): string {
  return getSmartbillAuth();
}
