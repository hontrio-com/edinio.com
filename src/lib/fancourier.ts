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
  const token = (data.token ?? data.data ?? data.access_token) as string | undefined;
  if (!token) throw new Error(`FAN Courier login: token absent din raspuns — ${text.slice(0, 200)}`);

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

async function fanPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`FAN Courier POST ${path}: ${res.status} — ${text}`);
  }
  const data = await res.json() as { status: string; data?: T; message?: string };
  if (data.status !== "success") throw new Error(data.message ?? `FAN Courier POST ${path} failed`);
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

  // For COD orders, Fan Courier uses "Cont Colector" service
  const service = input.cod > 0 ? "Cont Colector" : "Standard";

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
          options: ["X"], // ePOD default
        },
        recipient: {
          name: input.recipientName,
          phone: input.recipientPhone,
          email: input.recipientEmail || undefined,
          address: {
            county: input.recipientCounty,
            locality: input.recipientLocality,
            street: input.recipientStreet || "Strada",
            streetNo: input.recipientStreetNo || "1",
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

  if (!awbNumber || awbNumber === "undefined" || awbNumber === "null") {
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
