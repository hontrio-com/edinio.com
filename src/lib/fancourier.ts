import { normalizePhone } from "@/lib/utils/phone";
import { normalizeCountyName, normalizeLocalityName } from "@/lib/utils/ro-address";

const BASE_URL = "https://api.fancourier.ro";

// FANbox hard limits (API docs, "FANbox particularities"): max 30 kg, exactly
// one parcel per AWB, parcel must fit the largest locker compartment (L).
const FANBOX_MAX_WEIGHT_KG = 30;
const FANBOX_COMPARTMENT_CM = [40.4, 44.3, 45] as const; // sorted min→max
// info.cod is capped at 10.000 by the API (schema: "cod: numeric – 10000 max").
const FAN_MAX_COD = 10000;

export type FanCourierConfig = {
  enabled: boolean;
  username: string;
  password: string;
  client_id: number;
  client_name: string;
  /**
   * ePOD (option X): the merchant prints their own label instead of FAN's A5
   * paper AWB. Opt-in, default OFF — same default as FAN's official module.
   */
  epod?: boolean;
  /** Last courier pickup order placed from the dashboard (duplicate-warning UI). */
  last_pickup_date?: string | null;
  last_pickup_id?: string | null;
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
  /**
   * FANbox locker ID (e.g. "F1011137"). Presence switches the AWB to the
   * FANbox service: the locker is looked up via reports/pickup-points?id= and
   * its own county/locality are sent (the API requires they match the locker),
   * with the ID in address.pickupLocationId per the FANbox request examples.
   */
  fanboxId?: string;
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
  // Never log the response body here — it contains the auth token.
  if (!res.ok) {
    console.error("[fancourier] login failed: status=%d", res.status);
    throw new Error(`FAN Courier login error: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  }
  let data: Record<string, unknown>;
  try { data = JSON.parse(text); } catch { throw new Error(`FAN Courier login: raspuns invalid — ${text.slice(0, 200)}`); }
  const nested = data.data as Record<string, unknown> | undefined;
  const token = (nested?.token ?? data.token ?? data.access_token) as string | undefined;
  if (!token || typeof token !== "string") throw new Error(`FAN Courier login: token absent din raspuns — ${text.slice(0, 200)}`);

  tokenCache.set(key, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

/**
 * Authorized fetch with one automatic re-login on 401: the cached token can be
 * invalidated server-side before our 23h TTL (password change, FAN revocation),
 * and merchants have no way to "restart" the app — so recover transparently.
 */
async function fanFetch(
  username: string,
  password: string,
  path: string,
  init?: RequestInit,
  _retried = false,
): Promise<Response> {
  const token = await getFanCourierToken(username, password);
  const res = await fetch(`${BASE_URL}/${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Authorization": `Bearer ${token}` },
  });
  if (res.status === 401 && !_retried) {
    tokenCache.delete(username);
    return fanFetch(username, password, path, init, true);
  }
  return res;
}

async function fanGet<T>(username: string, password: string, path: string): Promise<T> {
  const res = await fanFetch(username, password, path);
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
  if (branches.length === 0) {
    throw new Error("FAN Courier: contul nu are niciun branch expeditor. Reconecteaza contul in Setari.");
  }
  // clientId in the AWB payload MUST be the sender branch — never fall back
  // silently to another branch, that would ship from the wrong pickup point.
  const match = branches.find((b) => Number(b.id) === Number(config.client_id));
  if (!match) {
    throw new Error(
      `FAN Courier: branch-ul expeditor salvat (ID ${config.client_id}) nu mai exista pe cont. Reconecteaza contul in Setari > Integrari > FAN Courier si alege branch-ul corect.`,
    );
  }
  return match;
}

async function fanDelete(username: string, password: string, path: string): Promise<void> {
  const res = await fanFetch(username, password, path, { method: "DELETE" });
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
  return fanGet<FanCourierBranch[]>(username, password, "reports/branches");
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
  const isFanbox = !!input.fanboxId;

  // API hard limits — fail here with a clear message instead of a cryptic FAN error.
  if (input.cod > FAN_MAX_COD) {
    throw new Error(`FAN Courier: rambursul maxim acceptat este ${FAN_MAX_COD.toLocaleString("ro-RO")} lei. Imparte comanda sau incaseaza online.`);
  }
  if (isFanbox) {
    if (input.weightKg > FANBOX_MAX_WEIGHT_KG) {
      throw new Error(`FAN Courier: greutatea maxima pentru FANbox este ${FANBOX_MAX_WEIGHT_KG} kg.`);
    }
    if (input.parcels > 1) {
      throw new Error("FAN Courier: FANbox accepta un singur colet per AWB.");
    }
    if (!input.recipientEmail?.trim()) {
      throw new Error("FAN Courier: emailul destinatarului este obligatoriu pentru livrarea la FANbox.");
    }
    // Docs: "The package sizes ... are mandatory fields" for FANbox — the size
    // also decides the locker compartment, so refuse guessed dimensions.
    const dims = [input.length, input.width, input.height];
    if (!dims.every((d): d is number => typeof d === "number" && d > 0)) {
      throw new Error("FAN Courier: dimensiunile coletului (L x l x H) sunt obligatorii pentru livrarea la FANbox.");
    }
    const sorted = [...(dims as number[])].sort((a, b) => a - b);
    if (sorted.some((d, i) => d > FANBOX_COMPARTMENT_CM[i])) {
      throw new Error(`FAN Courier: coletul depaseste compartimentul FANbox (max ${FANBOX_COMPARTMENT_CM.join(" x ")} cm).`);
    }
  }

  const sender = await getSenderBranch(config);

  // FANbox: the API requires the request's county/locality to match the
  // locker's, so resolve the locker by ID and use FAN's own values verbatim.
  let fanboxPoint: FanCourierPickupPoint | null = null;
  if (isFanbox) {
    fanboxPoint = await getFanCourierPickupPointById(config.username, config.password, input.fanboxId!);
    if (!fanboxPoint) {
      throw new Error(`FAN Courier: lockerul ${input.fanboxId} nu a fost gasit in lista FANbox. Verifica selectia clientului.`);
    }
  }

  // Determine service: FANbox for locker, Cont Colector for COD, Standard otherwise
  const service = isFanbox
    ? (input.cod > 0 ? "FANbox Cont Colector" : "FANbox")
    : (input.cod > 0 ? "Cont Colector" : "Standard");

  // FANbox: option V (pickup from locker) is mandatory. For home delivery,
  // ePOD (X) only when the merchant opted in — with X active FAN no longer
  // brings the pre-printed A5 AWB, so it must be a conscious choice.
  const options = isFanbox ? ["V"] : (config.epod ? ["X"] : []);

  // Sender belongs INSIDE each shipment (verified against the live API — the
  // published PDF schema omits it entirely). Built from the account's branch.
  const senderInfo = {
    name: sender.name,
    phone: sender.phone,
    address: {
      county: sender.address.county,
      locality: sender.address.locality,
      street: sender.address.street,
      streetNo: sender.address.streetNo || undefined,
    },
  };

  const body = {
    clientId: config.client_id,
    shipments: [
      {
        sender: senderInfo,
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
          // FANbox: the locker's own county/locality/street (the API requires
          // county+locality to match the locker; the generic schema also lists
          // street as mandatory even though the FANbox examples omit it, so we
          // send the locker's street to satisfy both). The docs contradict
          // themselves on the field name (schema: pickupLocation, FANbox
          // examples: pickupLocationId) — send BOTH with the locker ID; the
          // API reads the one it knows and ignores the other. Home delivery
          // goes through the nomenclature normalizers (diacritics, "Sector X"
          // → Bucuresti).
          address: isFanbox
            ? {
                county: fanboxPoint!.address.county,
                locality: fanboxPoint!.address.locality,
                street: fanboxPoint!.address.street || fanboxPoint!.name,
                streetNo: fanboxPoint!.address.streetNo || undefined,
                zipCode: fanboxPoint!.address.zipCode || undefined,
                pickupLocationId: fanboxPoint!.id,
                pickupLocation: fanboxPoint!.id,
              }
            : {
                county: normalizeCountyName(input.recipientCounty),
                locality: normalizeLocalityName(input.recipientLocality, input.recipientCounty),
                street: input.recipientStreet || "Strada",
                streetNo: input.recipientStreetNo || undefined,
                zipCode: input.recipientZipCode || undefined,
              },
        },
      },
    ],
  };

  const res = await fanFetch(config.username, config.password, "intern-awb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  await fanDelete(
    config.username,
    config.password,
    `awb?clientId=${config.client_id}&awb=${encodeURIComponent(awbNumber)}`,
  );
}

// ─── Courier order (pickup request) ──────────────────────────────────────────

export type FanCourierPickupInput = {
  pickupDate: string;   // YYYY-MM-DD
  firstHour: string;    // "HH:MM" — minimum pickup time
  secondHour: string;   // "HH:MM" — maximum pickup time (interval >= 2h)
  parcels: number;
  envelopes?: number;
  weightKg: number;     // total weight of all AWBs
  length?: number;      // dimensions of the biggest parcel
  width?: number;
  height?: number;
  observations?: string;
};

/**
 * Places a courier order (pickup request) on the sender branch. The API docs
 * warn explicitly that generating the AWB is NOT enough — without a courier
 * order the shipment is never picked up. One order per branch per day covers
 * all the AWBs on that branch.
 */
export async function createFanCourierPickupOrder(
  config: FanCourierConfig,
  input: FanCourierPickupInput,
): Promise<string> {
  const toMinutes = (h: string) => {
    const [hh, mm] = h.split(":").map(Number);
    return (hh || 0) * 60 + (mm || 0);
  };
  // Documented constraints: interval of at least 2 hours, no Sunday pickups.
  if (toMinutes(input.secondHour) - toMinutes(input.firstHour) < 120) {
    throw new Error("FAN Courier: intervalul de ridicare trebuie sa fie de minim 2 ore.");
  }
  const day = new Date(`${input.pickupDate}T12:00:00`);
  if (Number.isNaN(day.getTime())) {
    throw new Error("FAN Courier: data de ridicare este invalida.");
  }
  if (day.getDay() === 0) {
    throw new Error("FAN Courier: nu se fac ridicari duminica. Alege alta zi.");
  }

  const body = {
    clientId: config.client_id,
    info: {
      packages: { parcel: input.parcels, envelope: input.envelopes ?? 0 },
      weight: input.weightKg,
      dimensions: {
        length: input.length ?? 10,
        width: input.width ?? 10,
        height: input.height ?? 10,
      },
      orderType: "Standard",
      pickupDate: input.pickupDate,
      pickupHours: { first: input.firstHour, second: input.secondHour },
      observations: input.observations || "",
    },
  };

  const res = await fanFetch(config.username, config.password, "order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text().catch(() => "");

  let parsed: unknown = null;
  try { parsed = JSON.parse(raw); } catch { /* not JSON */ }

  if (!res.ok) {
    const detail = parsed ? fanErrorDetail(parsed) : "";
    throw new Error(`FAN Courier: ${detail || `${res.status} — ${raw.slice(0, 300) || res.statusText}`}`);
  }

  const rec = (parsed ?? {}) as Record<string, unknown>;
  if (typeof rec.status === "string" && rec.status !== "success") {
    const detail = fanErrorDetail(parsed) || (typeof rec.message === "string" ? rec.message : "");
    throw new Error(`FAN Courier: ${detail || `comanda de ridicare a fost refuzata — ${raw.slice(0, 200)}`}`);
  }
  const inlineErrors = fanErrorDetail(parsed);
  if (inlineErrors) throw new Error(`FAN Courier: ${inlineErrors}`);

  // The success payload shape is not documented — look for an order id in the
  // usual places; an error-free 2xx counts as accepted even without one.
  const container = (rec.data ?? rec.response ?? rec) as Record<string, unknown> | unknown[];
  const first = (Array.isArray(container) ? container[0] : container) as Record<string, unknown> | undefined;
  const id = first ? (first.id ?? first.orderId ?? first.number ?? "") : "";
  return String(id ?? "").trim();
}

/** Cancels a courier order (DELETE /order?clientId=&id=). */
export async function deleteFanCourierPickupOrder(
  config: FanCourierConfig,
  orderId: string,
): Promise<void> {
  await fanDelete(
    config.username,
    config.password,
    `order?clientId=${config.client_id}&id=${encodeURIComponent(orderId)}`,
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
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
  },
): Promise<{ total: number }> {
  const service = input.service ?? "Standard";
  const params = new URLSearchParams({
    clientId: String(config.client_id),
    "info[service]": service,
    "info[payment]": "expeditor",
    "info[weight]": String(input.weightKg),
    "info[packages][parcel]": String(input.parcels ?? 1),
    "info[packages][envelope]": "0",
    "recipient[locality]": normalizeLocalityName(input.recipientLocality, input.recipientCounty),
    "recipient[county]": normalizeCountyName(input.recipientCounty),
  });

  if (input.declaredValue) {
    params.set("info[declaredValue]", String(input.declaredValue));
  }
  // Dimensions feed the volumetric weight — send them whenever the caller has them.
  if (input.lengthCm && input.widthCm && input.heightCm) {
    params.set("info[dimensions][length]", String(input.lengthCm));
    params.set("info[dimensions][width]", String(input.widthCm));
    params.set("info[dimensions][height]", String(input.heightCm));
  }

  const res = await fanFetch(config.username, config.password, `reports/awb/internal-tariff?${params.toString()}`);

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

function mapPickupPoint(p: Record<string, unknown>, type: "fanbox" | "paypoint" | "office"): FanCourierPickupPoint {
  return {
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
  };
}

export async function getFanCourierPickupPoints(
  username: string,
  password: string,
  type: "fanbox" | "paypoint" | "office",
): Promise<FanCourierPickupPoint[]> {
  const data = await fanGet<Record<string, unknown>[]>(username, password, `reports/pickup-points?type=${type}`);
  return (data ?? []).map((p) => mapPickupPoint(p, type));
}

/**
 * Single pickup point by ID (reports/pickup-points?id=). Used at AWB time as
 * the authoritative source for the locker's county/locality, which the API
 * requires to match the FANbox.
 */
export async function getFanCourierPickupPointById(
  username: string,
  password: string,
  id: string,
): Promise<FanCourierPickupPoint | null> {
  const data = await fanGet<Record<string, unknown>[]>(username, password, `reports/pickup-points?id=${encodeURIComponent(id)}`);
  const first = Array.isArray(data) ? data[0] : undefined;
  return first ? mapPickupPoint(first, "fanbox") : null;
}

// ─── AWB Label (PDF) ──────────────────────────────────────────────────────────

export async function getFanCourierAwbLabel(
  config: FanCourierConfig,
  awbNumber: string,
): Promise<Buffer> {
  const res = await fanFetch(
    config.username,
    config.password,
    `awb/label?clientId=${config.client_id}&awbs[]=${encodeURIComponent(awbNumber)}&pdf=1&language=ro`,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FAN Courier label error: ${res.status} — ${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
