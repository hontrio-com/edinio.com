import { normalizePhone } from "@/lib/utils/phone";

const BASE_URL = "https://api.fancourier.ro";

export type FanCourierConfig = {
  enabled: boolean;
  username: string;
  password: string;
  client_id: number;
  client_name: string;
};

export type FanCourierBranch = {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: {
    locality: string;
    county: string;
    street: string;
    streetNo: string;
  };
};

export type FanCourierAwbInput = {
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  recipientCounty: string;
  recipientLocality: string;
  recipientStreet: string;
  recipientStreetNo: string;
  recipientZipCode: string;
  parcels: number;
  weightKg: number;
  length?: number;
  width?: number;
  height?: number;
  cod: number;
  content: string;
  observation: string;
  fanboxId?: string;              // FANbox locker ID
  fanboxRoutingLocation?: string; // FANbox routing name (used in street + pickupLocation)
};

// ─── Token cache ──────────────────────────────────────────────────────────────

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenEntry>();
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23h (token valid 24h)

async function getFanCourierToken(username: string, password: string): Promise<string> {
  const key = `${username}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(
    `${BASE_URL}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
    { method: "POST" },
  );

  const text = await res.text();
  console.log("[fancourier] login response: status=%d, body=%s", res.status, text.slice(0, 500));
  if (!res.ok) throw new Error(`FAN Courier login error: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { throw new Error(`FAN Courier login: raspuns invalid — ${text.slice(0, 200)}`); }
  const nested = data.data as Record<string, unknown> | undefined;
  const token = (nested?.token ?? data.token ?? data.access_token) as string | undefined;
  if (!token || typeof token !== "string") throw new Error(`FAN Courier login: token absent din raspuns — ${text.slice(0, 200)}`);

  tokenCache.set(key, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function fanGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`FAN Courier GET ${path}: ${res.status} ${res.statusText}`);
  const data = await res.json() as { status: string; data?: T; message?: string };
  if (data.status !== "success") throw new Error(data.message ?? `FAN Courier GET ${path} failed`);
  return data.data as T;
}

/**
 * FAN Courier's intern-awb endpoint reports the real reason (bad locality,
 * missing zip, "Cont Colector" service not enabled, COD too high, …) inside
 * per-shipment `errors` arrays — NOT in a top-level `message`. Walk the response
 * and collect those human-readable messages so we surface them instead of a
 * useless generic "failed".
 */
function collectFanErrors(node: unknown, out: string[] = [], depth = 0): string[] {
  if (!node || depth > 6) return out;
  if (Array.isArray(node)) {
    for (const n of node) collectFanErrors(n, out, depth + 1);
    return out;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    const e = o.errors;
    if (typeof e === "string" && e.trim()) out.push(e.trim());
    else if (Array.isArray(e)) {
      for (const item of e) {
        if (typeof item === "string" && item.trim()) out.push(item.trim());
        else if (item && typeof item === "object") {
          const io = item as Record<string, unknown>;
          if (typeof io.message === "string" && io.message.trim()) out.push(io.message.trim());
          else collectFanErrors(item, out, depth + 1);
        }
      }
    }
    // Errors may be nested one level deeper (data / shipments).
    for (const key of ["data", "shipments", "shipment"]) {
      if (o[key]) collectFanErrors(o[key], out, depth + 1);
    }
  }
  return out;
}

/** Deduped, joined FAN Courier error detail (empty string if none found). */
function fanErrorDetail(parsed: unknown): string {
  return [...new Set(collectFanErrors(parsed))].join("; ");
}

async function fanPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`FAN Courier POST ${path}: ${res.status} — ${raw.slice(0, 300) || res.statusText}`);
  }
  let data: { status?: string; data?: T; message?: string };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error(`FAN Courier POST ${path}: raspuns invalid — ${raw.slice(0, 200)}`);
  }
  if (data.status !== "success") {
    const detail = fanErrorDetail(data);
    // Surface the real reason in server logs. Only dump the raw body (may echo
    // recipient data) when we couldn't extract a clean error message.
    if (detail) console.error("[fancourier] POST %s non-success: status=%s detail=%s", path, data.status, detail);
    else console.error("[fancourier] POST %s non-success (no parsable error): status=%s raw=%s", path, data.status, raw.slice(0, 600));
    // When FAN gives no parsable error, include the raw response (it's the
    // merchant's own order data) so the real shape/reason is visible directly.
    const message = detail || data.message?.trim() || `raspuns neasteptat — ${raw.slice(0, 400)}`;
    throw new Error(`FAN Courier: ${message}`);
  }
  return data.data as T;
}

async function fanDelete(path: string, token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FAN Courier DELETE ${path}: ${res.status} — ${text}`);
  }
}

// ─── Branches (clientId) ──────────────────────────────────────────────────────

export async function getFanCourierBranches(
  username: string,
  password: string,
): Promise<FanCourierBranch[]> {
  const token = await getFanCourierToken(username, password);
  return fanGet<FanCourierBranch[]>("reports/branches", token);
}

export async function loadFanCourierAccount(
  username: string,
  password: string,
): Promise<{ branches: FanCourierBranch[] } | { error: string }> {
  try {
    const branches = await getFanCourierBranches(username, password);
    return { branches };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── AWB Creation ─────────────────────────────────────────────────────────────

export async function createFanCourierAwb(
  config: FanCourierConfig,
  input: FanCourierAwbInput,
): Promise<string> {
  const token = await getFanCourierToken(config.username, config.password);

  // Determine service: FANbox for locker, Cont Colector for COD, Standard otherwise
  const isFanbox = !!input.fanboxRoutingLocation;
  const service = isFanbox
    ? (input.cod > 0 ? "FANbox Cont Colector" : "FANbox")
    : (input.cod > 0 ? "Cont Colector" : "Standard");

  // FANbox: option V = pickup from locker, ePOD (X) for non-locker
  const options = isFanbox ? ["V"] : ["X"];

  const body = {
    clientId: config.client_id,
    shipments: [
      {
        info: {
          service,
          bank: "",
          bankAccount: "",
          packages: {
            parcel: input.parcels,
            envelopes: 0,
          },
          weight: input.weightKg,
          cod: input.cod,
          declaredValue: 0,
          payment: "sender",
          refund: null,
          returnPayment: null,
          observation: input.observation || "",
          content: input.content || "",
          dimensions: {
            length: input.length ?? 1,
            height: input.height ?? 1,
            width: input.width ?? 1,
          },
          costCenter: "",
          options,
        },
        recipient: {
          name: input.recipientName,
          phone: normalizePhone(input.recipientPhone),
          email: input.recipientEmail || undefined,
          address: {
            county: input.recipientCounty,
            locality: input.recipientLocality,
            street: isFanbox ? input.fanboxRoutingLocation! : (input.recipientStreet || "Strada"),
            streetNo: isFanbox ? "1" : (input.recipientStreetNo || "1"),
            pickupLocation: isFanbox ? input.fanboxRoutingLocation : undefined,
            zipCode: input.recipientZipCode || undefined,
          },
        },
      },
    ],
  };

  // Response can be array or object; extract first AWB number
  const data = await fanPost<unknown>("intern-awb", token, body);

  let awbNumber: string | undefined;
  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown>;
    awbNumber = String(first["awbNumber"] ?? first["awb"] ?? "");
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    awbNumber = String(obj["awbNumber"] ?? obj["awb"] ?? "");
    if (!awbNumber || awbNumber === "undefined") {
      // Maybe nested
      const arr = obj["awbs"] ?? obj["shipments"];
      if (Array.isArray(arr) && arr.length > 0) {
        const first = arr[0] as Record<string, unknown>;
        awbNumber = String(first["awbNumber"] ?? first["awb"] ?? "");
      }
    }
  }

  if (!awbNumber || awbNumber === "undefined" || awbNumber === "null" || awbNumber === "0") {
    // Some rejections come back with status "success" but no AWB and the reason
    // buried in per-shipment errors — surface it instead of a generic message.
    const detail = fanErrorDetail(data);
    if (detail) {
      console.error("[fancourier] intern-awb no AWB, errors=%s", detail);
      throw new Error(`FAN Courier: ${detail}`);
    }
    throw new Error("AWB FAN Courier nu a fost returnat in raspuns");
  }

  return awbNumber;
}

// ─── AWB Deletion ─────────────────────────────────────────────────────────────

export async function deleteFanCourierAwb(
  config: FanCourierConfig,
  awbNumber: string,
): Promise<void> {
  const token = await getFanCourierToken(config.username, config.password);
  await fanDelete(
    `awb?clientId=${config.client_id}&awb=${encodeURIComponent(awbNumber)}`,
    token,
  );
}

// ─── Tariff estimation ───────────────────────────────────────────────────────

export async function estimateFanCourierCost(
  config: FanCourierConfig,
  input: {
    recipientCounty: string;
    recipientLocality: string;
    weightKg: number;
    parcels?: number;
    declaredValue?: number;
    service?: string;
  },
): Promise<{ total: number }> {
  const token = await getFanCourierToken(config.username, config.password);

  const service = input.service ?? "Standard";
  const params = new URLSearchParams({
    clientId: String(config.client_id),
    "info[service]": service,
    "info[payment]": "expeditor",
    "info[weight]": String(input.weightKg),
    "info[packages][parcel]": String(input.parcels ?? 1),
    "recipient[locality]": input.recipientLocality,
    "recipient[county]": input.recipientCounty,
  });

  if (input.declaredValue) {
    params.set("info[declaredValue]", String(input.declaredValue));
  }

  const res = await fetch(`${BASE_URL}/reports/awb/internal-tariff?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FAN Courier tariff: ${res.status} — ${text}`);
  }

  const json = (await res.json()) as { status: string; data?: { total?: number }; message?: string };
  if (json.status !== "success") throw new Error(json.message ?? "FAN Courier tariff failed");

  return { total: json.data?.total ?? 0 };
}

// ─── Pickup points (FANbox / CollectPoint / Office) ─────────────────────────

export type FanCourierPickupPoint = {
  id: string;
  name: string;
  routingLocation: string;
  address: {
    locality: string;
    county: string;
    street: string;
    streetNo: string;
    zipCode: string;
  };
  latitude: string;
  longitude: string;
  type: "fanbox" | "paypoint" | "office";
};

export async function getFanCourierPickupPoints(
  username: string,
  password: string,
  type: "fanbox" | "paypoint" | "office",
): Promise<FanCourierPickupPoint[]> {
  const token = await getFanCourierToken(username, password);
  const data = await fanGet<Record<string, unknown>[]>(`reports/pickup-points?type=${type}`, token);
  return (data ?? []).map((p) => ({
    id: (p.id ?? "") as string,
    name: (p.name ?? "") as string,
    routingLocation: (p.routingLocation ?? p.name ?? "") as string,
    address: {
      locality: ((p.address as Record<string, unknown> | undefined)?.locality ?? "") as string,
      county: ((p.address as Record<string, unknown> | undefined)?.county ?? "") as string,
      street: ((p.address as Record<string, unknown> | undefined)?.street ?? "") as string,
      streetNo: ((p.address as Record<string, unknown> | undefined)?.streetNo ?? "") as string,
      zipCode: ((p.address as Record<string, unknown> | undefined)?.zipCode ?? "") as string,
    },
    latitude: (p.latitude ?? "0") as string,
    longitude: (p.longitude ?? "0") as string,
    type,
  }));
}

// ─── AWB Label (PDF) ──────────────────────────────────────────────────────────

export async function getFanCourierAwbLabel(
  config: FanCourierConfig,
  awbNumber: string,
): Promise<Buffer> {
  const token = await getFanCourierToken(config.username, config.password);
  const url =
    `${BASE_URL}/awb/label?clientId=${config.client_id}&awbs[]=${encodeURIComponent(awbNumber)}&pdf=1&language=ro`;

  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FAN Courier label error: ${res.status} — ${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
