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
  // "door" = home pickup; anything else (locker/point) = sender hands over at a
  // location, which requires sender.location_id at AWB creation.
  service_pickup?: string;
  service_delivery?: string;
  pickup_locations_count?: number | null;
  price: number;
  tax: number;
  total: number;
  final_price: number;
  final_tax: number;
  final_total: number;
  return_price: number | null;
  errors: string[];
};

// A Woot locker/point (from GET /general/locations). The `id` is what
// sender.location_id / receiver.location_id expect for locker/point services.
export type WootLocation = {
  id: number;
  name: string;
  type: string;
  courier_id: number;
  courier_name: string;
  county_id: number;
  county_name: string;
  city_id: number;
  city_name: string;
  address: string;
  zipcode: string;
  sender: number;   // 1 = supports pickup (sender drop-off)
  receiver: number; // 1 = supports delivery
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
    // Surface Woot's actual reason (it returns various shapes: { message }, { error },
    // or Laravel-style { errors: { field: [..] } }) instead of a bare status code.
    const raw = await res.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(raw) as { message?: string; error?: string; errors?: unknown };
      if (typeof parsed.message === "string") detail = parsed.message;
      else if (typeof parsed.error === "string") detail = parsed.error;
      if (parsed.errors) {
        const msgs: string[] = [];
        if (Array.isArray(parsed.errors)) {
          for (const e of parsed.errors) msgs.push(typeof e === "string" ? e : JSON.stringify(e));
        } else if (typeof parsed.errors === "object") {
          for (const v of Object.values(parsed.errors as Record<string, unknown>)) {
            if (Array.isArray(v)) msgs.push(...v.map(String));
            else if (v != null) msgs.push(String(v));
          }
        }
        if (msgs.length) detail = detail ? `${detail}: ${msgs.join("; ")}` : msgs.join("; ");
      }
    } catch {
      // Non-JSON body (e.g. HTML error page) — keep a short snippet, skip markup.
      if (raw && !raw.trimStart().startsWith("<")) detail = raw.slice(0, 300);
    }
    throw new Error(detail ? `Woot: ${detail}` : `Woot API error ${res.status}`);
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

// Lockers/points from GET /general/locations. For sender drop-off ("predare la
// locker"), filter to sender-capable locations of the chosen service's courier.
export async function getLocations(
  token: string,
  params: { sender?: boolean; receiver?: boolean; courier_id?: number; county_id?: number; city_id?: number }
): Promise<WootLocation[]> {
  const qs = new URLSearchParams({ country_id: "189" });
  if (params.sender) qs.set("sender", "true");
  if (params.receiver) qs.set("receiver", "true");
  if (params.courier_id) qs.set("courier_id", String(params.courier_id));
  if (params.county_id) qs.set("county_id", String(params.county_id));
  if (params.city_id) qs.set("city_id", String(params.city_id));
  const data = await wootReq<WootLocation[]>(token, "GET", `/general/locations?${qs.toString()}`);
  const list = Array.isArray(data) ? data : [];
  // Filter client-side too, so we only ever offer sender-capable locations
  // regardless of how the API treats the boolean query param.
  return params.sender ? list.filter((l) => Number(l.sender) === 1) : list;
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
