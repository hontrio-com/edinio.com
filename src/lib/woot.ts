const WOOT_BASE = "https://ws.woot.ro/latest";

// ─── Types ───────────────────────────────────────────────────────────────────

export type WootSender = {
  company: 0 | 1;
  company_name?: string;
  contact: string;
  phone: string;
  email: string;
  country_id: 189;
  county_id: number;
  city_id: number;
  address: string;
  zipcode?: string;
};

export type WootConfig = {
  enabled: boolean;
  public_key: string;
  secret_key: string;
  sender: WootSender;
};

export type WootParcel = {
  type: "envelope" | "package";
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  content: string;
};

export type WootPriceResult = {
  service_id: number;
  service_name: string;
  courier_id: number;
  courier_name: string;
  price: number;
  tax: number;
  total: number;
  final_price: number;
  final_tax: number;
  final_total: number;
  return_price: number | null;
  errors: string[];
};

export type WootCounty = {
  id: number;
  name: string;
  code: string;
  country_id: number;
};

export type WootCity = {
  id: number;
  name: string;
  county_id: number;
};

// ─── Token cache ──────────────────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getWootToken(public_key: string, secret_key: string): Promise<string> {
  const cached = tokenCache.get(public_key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch(`${WOOT_BASE}/account/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_key, secret_key }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Autentificare Woot esuata. Verifica cheile API.");
  const data = await res.json() as { success: boolean; token: string; expire: number };
  if (!data.success || !data.token) throw new Error("Autentificare Woot esuata.");

  tokenCache.set(public_key, { token: data.token, expiresAt: Date.now() + data.expire * 1000 });
  return data.token;
}

// ─── Generic request ─────────────────────────────────────────────────────────

async function wootReq<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${WOOT_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? `Woot API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Public endpoints (no auth) ───────────────────────────────────────────────

export async function fetchCounties(): Promise<WootCounty[]> {
  const res = await fetch(`${WOOT_BASE}/general/counties?country_id=189`, { cache: "force-cache" });
  if (!res.ok) throw new Error("Nu s-au putut incarca judetele");
  return res.json() as Promise<WootCounty[]>;
}

export async function fetchCities(county_id: number): Promise<WootCity[]> {
  const res = await fetch(`${WOOT_BASE}/general/cities?county_id=${county_id}&country_id=189`, { cache: "no-store" });
  if (!res.ok) throw new Error("Nu s-au putut incarca orasele");
  return res.json() as Promise<WootCity[]>;
}

// ─── Authenticated endpoints ──────────────────────────────────────────────────

export async function getAccountInfo(token: string) {
  return wootReq<{
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  }>(token, "GET", "/account/info");
}

export async function getCredit(token: string) {
  return wootReq<{ gross: number; tax: number; total: number }>(token, "GET", "/account/credit");
}

export async function getPrices(
  token: string,
  params: {
    sender: object;
    receiver: object;
    parcels: WootParcel[];
    repayment?: number;
  }
): Promise<WootPriceResult[]> {
  return wootReq<WootPriceResult[]>(token, "POST", "/orders/prices", params);
}

export async function createOrder(
  token: string,
  params: {
    service_id: number;
    sender: object;
    receiver: object;
    parcels: WootParcel[];
    repayment?: number;
    payment_method?: "credit" | "card" | "term";
    options?: { opd?: boolean; sat?: boolean; rdc?: boolean; pxc?: boolean };
  }
): Promise<{ success: boolean; order_id: number; awb_number: string | null }> {
  return wootReq(token, "POST", "/orders", { payment_method: "credit", ...params });
}

export async function getOrderAwb(
  token: string,
  wootOrderId: number,
  format: "A4" | "A6" = "A4"
): Promise<{ success: boolean; pdf: string }> {
  return wootReq(token, "GET", `/orders/${wootOrderId}/awb?format=${format}`);
}

export async function cancelWootOrder(
  token: string,
  wootOrderId: number
): Promise<{ success: boolean }> {
  return wootReq(token, "DELETE", `/orders/${wootOrderId}`, { reason_id: 1, refund_method: "credit" });
}
