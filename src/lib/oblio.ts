const OBLIO_BASE = "https://www.oblio.eu";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OblioConfig = {
  enabled: boolean;
  client_id: string;       // email cont Oblio
  client_secret: string;   // token din Setari > Date Cont
  cif: string;             // CIF-ul firmei selectate
  company_name: string;    // Numele firmei (display)
  series_invoice: string;  // ex: "FCT"
  series_proforma: string; // ex: "PR"
  vat_name: string;        // ex: "Normala"
  vat_percentage: number;  // ex: 19
  auto_invoice?: boolean;  // auto-issue an invoice when the trigger fires
  auto_invoice_trigger?: "confirmed" | "processing" | "shipped" | "delivered" | "paid";
};

export type OblioCompany = {
  cif: string;
  company: string;
  userTypeAccess: string;
};

export type OblioSeries = {
  type: string;
  name: string;
  start: string;
  next: string;
  default: boolean;
};

export type OblioVatRate = {
  name: string;
  percent: number;
  default: boolean;
};

export type OblioDocResult = {
  seriesName: string;
  number: string;
  link: string;
};

export type OblioProduct = {
  name: string;
  price?: number;
  measuringUnit?: string;
  vatName?: string;
  vatPercentage?: number;
  vatIncluded?: 0 | 1;
  quantity?: number;
  productType?: string;
  save?: 0 | 1;
  // Discount fields
  discount?: number;
  discountType?: "procentual" | "valoric";
  discountAllAbove?: 0 | 1;
};

export type OblioInvoiceData = {
  cif: string;
  client: {
    name: string;
    cif?: string;
    address?: string;
    state?: string;
    city?: string;
    email?: string;
    phone?: string;
    vatPayer?: boolean;
    save?: 0 | 1;
  };
  issueDate?: string;
  dueDate?: string;
  seriesName: string;
  language?: string;
  precision?: number;
  currency?: string;
  products: OblioProduct[];
  collect?: {
    type: string;
    value?: number;
    documentNumber?: string;
    issueDate?: string;
  };
  referenceDocument?: {
    type: "Factura" | "Proforma" | "Aviz";
    seriesName: string;
    number: string | number;
    refund?: 0 | 1;
  };
  mentions?: string;
  internalNote?: string;
  idempotencyKey?: string;
};

// ─── Token cache ──────────────────────────────────────────────────────────────
// Key = client_id; value = { access_token, expiresAt (unix seconds) }

const tokenCache = new Map<string, { access_token: string; expiresAt: number }>();

export async function getOblioToken(clientId: string, clientSecret: string): Promise<string> {
  const cached = tokenCache.get(clientId);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > nowSeconds + 60) return cached.access_token;

  const res = await fetch(`${OBLIO_BASE}/api/authorize/token`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { statusMessage?: string };
    throw new Error(err.statusMessage ?? `Autentificare Oblio esuata (HTTP ${res.status})`);
  }

  const data = await res.json() as {
    access_token: string;
    expires_in: string | number;
    token_type: string;
    request_time: string | number;
  };

  if (!data.access_token) throw new Error("Autentificare Oblio esuata: token lipsa");

  const expiresAt = Number(data.request_time) + Number(data.expires_in);
  tokenCache.set(clientId, { access_token: data.access_token, expiresAt });
  return data.access_token;
}

// ─── Generic request ──────────────────────────────────────────────────────────

async function oblioReq<T>(
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<T> {
  let url = `${OBLIO_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const json = await res.json() as { status: number; statusMessage: string; data: T };

  if (json.status < 200 || json.status >= 300) {
    throw new Error(json.statusMessage ?? `Eroare Oblio (status ${json.status})`);
  }

  return json.data;
}

// ─── Nomenclatoare ────────────────────────────────────────────────────────────

export async function getCompanies(token: string): Promise<OblioCompany[]> {
  return oblioReq<OblioCompany[]>(token, "GET", "/api/nomenclature/companies");
}

export async function getSeries(token: string, cif: string): Promise<OblioSeries[]> {
  return oblioReq<OblioSeries[]>(token, "GET", "/api/nomenclature/series", undefined, { cif });
}

export async function getVatRates(token: string, cif: string): Promise<OblioVatRate[]> {
  return oblioReq<OblioVatRate[]>(token, "GET", "/api/nomenclature/vat_rates", undefined, { cif });
}

// ─── Documente ────────────────────────────────────────────────────────────────

export async function createOblioDoc(
  token: string,
  type: "invoice" | "proforma",
  data: OblioInvoiceData,
): Promise<OblioDocResult> {
  return oblioReq<OblioDocResult>(token, "POST", `/api/docs/${type}`, data);
}

export async function cancelOblioDoc(
  token: string,
  type: "invoice" | "proforma",
  cif: string,
  seriesName: string,
  number: string,
): Promise<void> {
  await oblioReq(token, "PUT", `/api/docs/${type}/cancel`, { cif, seriesName, number });
}
