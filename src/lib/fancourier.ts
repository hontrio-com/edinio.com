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

/** Push FAN error value(s) (string | string[] | Laravel field→messages map) into out. */
function pushFanErrors(e: unknown, out: string[]): void {
  if (!e) return;
  if (typeof e === "string") { if (e.trim()) out.push(e.trim()); return; }
  if (Array.isArray(e)) {
    for (const item of e) {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
      else if (item && typeof item === "object") {
        const io = item as Record<string, unknown>;
        if (typeof io.message === "string" && io.message.trim()) out.push(io.message.trim());
      }
    }
    return;
  }
  if (typeof e === "object") {
    // Laravel-style validation map: { "field.name": ["msg", …], … }
    for (const v of Object.values(e as Record<string, unknown>)) pushFanErrors(v, out);
  }
}

/**
 * intern-awb reports the real reason (bad locality, missing zip/sender, service
 * not enabled, COD too high, …) inside per-shipment `errors` — which may be a
 * string, an array, or a Laravel field→messages object — under `response`/`data`.
 * Walk the body and collect those human-readable messages.
 */
function collectFanErrors(node: unknown, out: string[] = [], depth = 0): string[] {
  if (!node || depth > 6) return out;
  if (Array.isArray(node)) {
    for (const n of node) collectFanErrors(n, out, depth + 1);
    return out;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    pushFanErrors(o.errors, out);
    for (const key of ["response", "data", "shipments", "shipment"]) {
      if (o[key]) collectFanErrors(o[key], out, depth + 1);
    }
  }
  return out;
}

/** Deduped, joined FAN Courier error detail (empty string if none found). */
function fanErrorDetail(parsed: unknown): string {
  return [...new Set(collectFanErrors(parsed))].join("; ");
}

/**
 * The sender is NOT part of the intern-awb payload's `shipments`; FAN derives it
 * from `clientId` (the sender branch) but the live API also validates a
 * root-level `sender` object, so we fetch the branch matching client_id and send
 * it explicitly. `reports/branches` returns the branch id (== clientId) plus the
 * name/phone/address FAN requires for the sender.
 */
async function getSenderBranch(config: FanCourierConfig): Promise<FanCourierBranch> {
  const branches = await getFanCourierBranches(config.username, config.password);
  const match = branches.find((b) => b.id === config.client_id) ?? branches[0];
  if (!match) throw new Error("FAN Courier: contul nu are niciun branch expeditor. Reconecteaza contul in Setari.");
  return match;
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
  const sender = await getSenderBranch(config);

  // Determine service: FANbox for locker, Cont Colector for COD, Standard otherwise
  const isFanbox = !!input.fanboxRoutingLocation;
  const service = isFanbox
    ? (input.cod > 0 ? "FANbox Cont Colector" : "FANbox")
    : (input.cod > 0 ? "Cont Colector" : "Standard");

  // FANbox: option V = pickup from locker, ePOD (X) for non-locker
  const options = isFanbox ? ["V"] : ["X"];

  const body = {
    clientId: config.client_id,
    // Sender lives at the request ROOT (not inside shipments) and is validated
    // by the live API — build it from the account's sender branch.
    sender: {
      name: sender.name,
      phone: sender.phone,
      address: {
        county: sender.address.county,
        locality: sender.address.locality,
        street: sender.address.street,
        streetNo: sender.address.streetNo || undefined,
      },
    },
    shipments: [
      {
        info: {
          service,
          bank: "",
          bankAccount: "",
          packages: {
            parcel: input.parcels,
            envelope: 0, // FAN's field is "envelope" (singular) — see API changelog
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
          contactPerson: input.recipientName, // schema lists contactPerson as mandatory
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

  const res = await fetch(`${BASE_URL}/intern-awb`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text().catch(() => "");

  if (!res.ok) {
    let detail = "";
    try { detail = fanErrorDetail(JSON.parse(raw)); } catch { /* not JSON */ }
    throw new Error(`FAN Courier: ${detail || `${res.status} — ${raw.slice(0, 300) || res.statusText}`}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`FAN Courier: raspuns invalid — ${raw.slice(0, 200)}`);
  }

  // Documented shape: { "response": [ { "awbNumber": 2228…, "errors": null } ] }.
  const container = (parsed as Record<string, unknown>)?.response ?? (parsed as Record<string, unknown>)?.data;
  const first = (Array.isArray(container) ? container[0] : container) as Record<string, unknown> | undefined;
  const awbNumber = first ? String(first.awbNumber ?? first.awb ?? "") : "";

  const failed = !awbNumber || awbNumber === "0" || awbNumber === "null" || awbNumber === "undefined" || first?.success === false;
  if (failed) {
    const detail = fanErrorDetail(parsed);
    console.error("[fancourier] intern-awb failed: %s", detail || raw.slice(0, 400));
    throw new Error(detail ? `FAN Courier: ${detail}` : `FAN Courier: AWB nu a fost creat — ${raw.slice(0, 200)}`);
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
