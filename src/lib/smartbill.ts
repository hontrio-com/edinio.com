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
  vatCode?: string;
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
  error?: never;
}

export interface SmartbillInvoiceError {
  error: string;
  series?: never;
  number?: never;
}

export async function createSmartbillInvoice(
  client: SmartbillClient,
  product: SmartbillProduct
): Promise<SmartbillInvoiceResult | SmartbillInvoiceError> {
  if (!isSmartbillConfigured()) {
    return { error: "Smartbill not configured (missing env vars)" };
  }

  const body = {
    companyVatCode: process.env.SMARTBILL_CIF,
    client: {
      name: client.name,
      vatCode: client.vatCode || undefined,
      country: "Romania",
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
    sendEmail: false,
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
      const errMsg = data.errorText || `HTTP ${res.status}`;
      console.error("[smartbill] Invoice creation failed:", errMsg);
      return { error: errMsg };
    }

    if (!data.series || !data.number) {
      const errMsg = `Missing series/number in response: ${JSON.stringify(data)}`;
      console.error("[smartbill]", errMsg);
      return { error: errMsg };
    }

    console.log("[smartbill] Invoice created:", data.series, data.number);
    return { series: data.series, number: data.number };
  } catch (err) {
    const errMsg = String(err);
    console.error("[smartbill] Fetch error:", errMsg);
    return { error: errMsg };
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

// ─── Per-merchant SmartBill integration ────────────────────────────────────

export interface SmartbillConfig {
  enabled: boolean;
  email: string;
  token: string;
  company_vat_code: string;
  series_name: string;
  estimate_series_name: string;
  tax_name: string;
  send_email: boolean;
  auto_invoice: boolean;
  auto_invoice_trigger: "confirmed" | "processing" | "shipped" | "delivered" | "paid";
}

export interface SmartbillSeriesItem {
  name: string;
  type: string;
}

export interface SmartbillTaxItem {
  name: string;
  percentage: number;
}

function merchantAuth(email: string, token: string): string {
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

function merchantHeaders(email: string, token: string) {
  return {
    Authorization: merchantAuth(email, token),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function getMerchantSeries(
  config: Pick<SmartbillConfig, "email" | "token" | "company_vat_code">
): Promise<SmartbillSeriesItem[] | { error: string }> {
  try {
    const res = await fetch(
      `${SMARTBILL_BASE}/series?cif=${encodeURIComponent(config.company_vat_code)}`,
      { headers: merchantHeaders(config.email, config.token), cache: "no-store" }
    );
    if (res.status === 401) return { error: "Credentiale invalide. Verifica email-ul si tokenul API." };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { error: `Eroare SmartBill (${res.status})${body ? `: ${body}` : ""}` };
    }
    const data = await res.json() as { list?: Array<{ name: string; type: string }> };
    return (data.list ?? []).map(s => ({ name: s.name, type: s.type }));
  } catch {
    return { error: "Eroare de retea. Verifica conexiunea." };
  }
}

export async function getMerchantTaxes(
  config: Pick<SmartbillConfig, "email" | "token" | "company_vat_code">
): Promise<SmartbillTaxItem[] | { error: string }> {
  try {
    const res = await fetch(
      `${SMARTBILL_BASE}/tax?cif=${encodeURIComponent(config.company_vat_code)}`,
      { headers: merchantHeaders(config.email, config.token), cache: "no-store" }
    );
    if (res.status === 401) return { error: "Credentiale invalide." };
    if (!res.ok) return { error: `Eroare SmartBill (${res.status})` };
    const data = await res.json() as { taxes?: Array<{ name: string; percentage: number }> };
    return (data.taxes ?? []).map(t => ({ name: t.name, percentage: t.percentage }));
  } catch {
    return { error: "Eroare de retea." };
  }
}

export interface MerchantInvoiceProduct {
  name: string;
  measuringUnitName: string;
  currency: string;
  quantity: number;
  price: number;
  isTaxIncluded?: boolean;
  taxName?: string;
  taxPercentage?: number;
  isService?: boolean;
  isDiscount?: boolean;
  numberOfItems?: number;
  discountType?: number;
  discountValue?: number;
}

export interface MerchantInvoiceParams {
  companyVatCode: string;
  client: {
    name: string;
    address?: string;
    city?: string;
    county?: string;
    email?: string;
    isTaxPayer?: boolean;
    saveToDb?: boolean;
  };
  issueDate: string;
  seriesName: string;
  currency: string;
  products: MerchantInvoiceProduct[];
  sendEmail?: boolean;
  email?: { to: string };
  isDraft?: boolean;
  useEstimateDetails?: boolean;
  estimate?: {
    seriesName: string;
    number: string;
    useStock?: boolean;
  };
}

export async function createMerchantInvoice(
  config: Pick<SmartbillConfig, "email" | "token">,
  params: MerchantInvoiceParams
): Promise<{ number: string; series: string } | { error: string }> {
  try {
    const res = await fetch(`${SMARTBILL_BASE}/invoice`, {
      method: "POST",
      headers: merchantHeaders(config.email, config.token),
      body: JSON.stringify(params),
      cache: "no-store",
    });
    const data = await res.json() as {
      errorText?: string;
      message?: string;
      number?: string;
      series?: string;
    };
    if (!res.ok || data.errorText) {
      return { error: data.errorText || data.message || `Eroare SmartBill (${res.status})` };
    }
    return { number: data.number ?? "", series: data.series ?? "" };
  } catch {
    return { error: "Eroare de retea la crearea facturii." };
  }
}

export function getMerchantInvoicePdfUrl(
  cif: string,
  series: string,
  number: string
): string {
  return `${SMARTBILL_BASE}/invoice/pdf?cif=${encodeURIComponent(cif)}&seriesname=${encodeURIComponent(series)}&number=${encodeURIComponent(number)}`;
}

export function getMerchantEstimatePdfUrl(
  cif: string,
  series: string,
  number: string
): string {
  return `${SMARTBILL_BASE}/estimate/pdf?cif=${encodeURIComponent(cif)}&seriesname=${encodeURIComponent(series)}&number=${encodeURIComponent(number)}`;
}

export async function createMerchantEstimate(
  config: Pick<SmartbillConfig, "email" | "token">,
  params: MerchantInvoiceParams
): Promise<{ number: string; series: string } | { error: string }> {
  try {
    const res = await fetch(`${SMARTBILL_BASE}/estimate`, {
      method: "POST",
      headers: merchantHeaders(config.email, config.token),
      body: JSON.stringify(params),
      cache: "no-store",
    });
    const data = await res.json() as {
      errorText?: string;
      message?: string;
      number?: string;
      series?: string;
    };
    if (!res.ok || data.errorText) {
      return { error: data.errorText || data.message || `Eroare SmartBill (${res.status})` };
    }
    return { number: data.number ?? "", series: data.series ?? "" };
  } catch {
    return { error: "Eroare de retea la crearea proformei." };
  }
}

export async function cancelMerchantInvoice(
  config: Pick<SmartbillConfig, "email" | "token">,
  params: { cif: string; seriesName: string; number: string }
): Promise<{ stornoNumber?: string; stornoSeries?: string } | { error: string }> {
  try {
    const qs = new URLSearchParams({
      cif: params.cif,
      seriesName: params.seriesName,
      number: params.number,
    });
    const res = await fetch(`${SMARTBILL_BASE}/invoice/cancel?${qs}`, {
      method: "POST",
      headers: merchantHeaders(config.email, config.token),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { errorText?: string; message?: string };
      return { error: body.errorText || body.message || `Eroare SmartBill (${res.status})` };
    }
    const data = await res.json().catch(() => ({})) as { number?: string; series?: string; errorText?: string };
    if (data.errorText) return { error: data.errorText };
    return { stornoNumber: data.number, stornoSeries: data.series };
  } catch {
    return { error: "Eroare de retea la stornarea facturii." };
  }
}

export async function sendMerchantDocumentEmail(
  config: Pick<SmartbillConfig, "email" | "token">,
  params: {
    companyVatCode: string;
    type: "invoice" | "estimate";
    seriesName: string;
    number: string;
    to: string;
    subject?: string;
  }
): Promise<{ success: true } | { error: string }> {
  try {
    const body = {
      companyVatCode: params.companyVatCode,
      document: {
        type: params.type,
        seriesName: params.seriesName,
        number: params.number,
      },
      email: {
        to: params.to,
        ...(params.subject ? { subject: params.subject } : {}),
      },
    };
    const res = await fetch(`${SMARTBILL_BASE}/document/send`, {
      method: "POST",
      headers: merchantHeaders(config.email, config.token),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { errorText?: string; message?: string };
      return { error: data.errorText || data.message || `Eroare SmartBill (${res.status})` };
    }
    return { success: true };
  } catch {
    return { error: "Eroare de retea la trimiterea emailului." };
  }
}

export async function fetchMerchantPdf(
  config: Pick<SmartbillConfig, "email" | "token">,
  url: string
): Promise<ArrayBuffer | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: merchantAuth(config.email, config.token),
        Accept: "application/octet-stream",
      },
      cache: "no-store",
    });
    if (!res.ok) return { error: `Eroare SmartBill (${res.status})` };
    return await res.arrayBuffer();
  } catch {
    return { error: "Eroare de retea la descarcarea PDF-ului." };
  }
}
