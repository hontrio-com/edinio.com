const CO_AUTH = "https://auth.colete-online.ro/token";
const CO_BASE_PROD = "https://api.colete-online.ro/v1";
const CO_BASE_STAGING = "https://api.colete-online.ro/v1/staging";

// ─── Types ────────────────────────────────────────────────────────────────────

export type COConfig = {
  enabled: boolean;
  sandbox: boolean;
  client_id: string;
  client_secret: string;
  sender: COSender;
};

export type COSender = {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  county: string;
  city: string;
  postal_code: string;
  street: string;
  street_number: string;
};

export type COService = {
  id: number;
  courierName: string;
  name: string;
};

export type COPriceResult = {
  price: { total: number; noVat: number };
  service: {
    id: number;
    courierName: string;
    name: string;
    activationId: string;
    displayName?: string;
  };
};

export type COReceiver = {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  county: string;
  city: string;
  postal_code: string;
  street: string;
  street_number: string;
};

export type COParcel = {
  type: "envelope" | "package";
  weight: number;
  length?: number;
  width?: number;
  height?: number;
  content: string;
};

// ─── Token cache ──────────────────────────────────────────────────────────────

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getCOToken(clientId: string, clientSecret: string): Promise<string> {
  const cacheKey = clientId;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(CO_AUTH, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Autentificare Colete Online esuata. Verifica credentialele API.");
  const data = await res.json() as { access_token?: string; token_type?: string; expires_in?: number; error?: string };
  if (!data.access_token) throw new Error(data.error ?? "Autentificare Colete Online esuata.");

  const expiresIn = data.expires_in ?? 7199;
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  });
  return data.access_token;
}

// ─── Generic request ──────────────────────────────────────────────────────────

function getBase(sandbox: boolean) {
  return sandbox ? CO_BASE_STAGING : CO_BASE_PROD;
}

async function coReq<T>(token: string, sandbox: boolean, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getBase(sandbox)}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; errors?: { message: string }[] };
    const msg = err.message ?? err.errors?.[0]?.message ?? `Eroare HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getBalance(token: string, sandbox: boolean): Promise<{ amount: number; bonus: number }> {
  return coReq(token, sandbox, "GET", "/user/balance");
}

export async function getServices(token: string, sandbox: boolean): Promise<COService[]> {
  return coReq(token, sandbox, "GET", "/service/list?type=domestic");
}

function buildOrderBody(
  sender: COSender,
  receiver: COReceiver,
  parcels: COParcel[],
  repayment: number,
  serviceIds: number[],
  selectionType: "bestPrice" | "directId" = "bestPrice",
) {
  const extraOptions: { id: number; amount?: number }[] = [];
  if (repayment > 0) extraOptions.push({ id: 6, amount: repayment });

  const pkg = parcels[0];
  const packagesList = parcels.map(p => ({
    weight: p.weight,
    ...(p.length ? { length: p.length } : {}),
    ...(p.width ? { width: p.width } : {}),
    ...(p.height ? { height: p.height } : {}),
  }));

  return {
    sender: {
      contact: {
        name: sender.name,
        phone: sender.phone,
        ...(sender.email ? { email: sender.email } : {}),
        ...(sender.company ? { company: sender.company } : {}),
      },
      address: {
        countryCode: "RO",
        city: sender.city,
        county: sender.county,
        postalCode: sender.postal_code,
        street: sender.street,
        number: sender.street_number,
      },
      validationStrategy: "minimal",
    },
    recipient: {
      contact: {
        name: receiver.name,
        phone: receiver.phone,
        ...(receiver.email ? { email: receiver.email } : {}),
        ...(receiver.company ? { company: receiver.company } : {}),
      },
      address: {
        countryCode: "RO",
        city: receiver.city,
        county: receiver.county,
        postalCode: receiver.postal_code,
        street: receiver.street,
        number: receiver.street_number,
      },
      validationStrategy: "minimal",
    },
    packages: {
      type: pkg?.type === "envelope" ? 1 : 2,
      content: pkg?.content ?? "Produse comerciale",
      list: packagesList.length > 0 ? packagesList : [{ weight: 1 }],
    },
    service: { selectionType, serviceIds },
    extraOptions,
  };
}

export async function getPrices(
  token: string,
  sandbox: boolean,
  sender: COSender,
  receiver: COReceiver,
  parcels: COParcel[],
  repayment: number,
): Promise<{ selected: COPriceResult; list: COPriceResult[] }> {
  // Use priceMinimal for recipient to allow price calc without full address
  const body = buildOrderBody(sender, receiver, parcels, repayment, [], "bestPrice");
  // Override recipient validationStrategy for price only
  (body.recipient as Record<string, unknown>).validationStrategy = "priceMinimal";

  return coReq(token, sandbox, "POST", "/order/price", body);
}

export async function createCOOrder(
  token: string,
  sandbox: boolean,
  sender: COSender,
  receiver: COReceiver,
  parcels: COParcel[],
  repayment: number,
  serviceId: number,
): Promise<{ service: COPriceResult; awb: string; uniqueId: string; estimatedPickUpDate?: string }> {
  const body = buildOrderBody(sender, receiver, parcels, repayment, [serviceId], "directId");
  return coReq(token, sandbox, "POST", "/order", body);
}

export async function getCOOrderAwb(
  token: string,
  sandbox: boolean,
  uniqueId: string,
  format: "A4" | "A6" = "A4",
): Promise<ArrayBuffer> {
  const res = await fetch(`${getBase(sandbox)}/order/awb/${encodeURIComponent(uniqueId)}?formatType=${format}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? `Eroare la descarcarea AWB (HTTP ${res.status})`);
  }
  return res.arrayBuffer();
}
