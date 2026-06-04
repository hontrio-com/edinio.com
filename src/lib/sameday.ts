const PROD_URL = "https://api.sameday.ro";
const SANDBOX_URL = "https://sameday-api.demo.zitec.com";

export type SamedayConfig = {
  enabled: boolean;
  username: string;
  password: string;
  sandbox: boolean;
  pickup_point_id: number;
  contact_person_id: number;
  service_id: number;
  service_name: string;
};

export type SamedayPickupPoint = {
  id: number;
  alias: string;
  address: {
    name: string;
    street: string;
    city: { name: string };
    county: { name: string };
  };
  contactPersons: {
    id: number;
    name: string;
    isDefault: boolean;
  }[];
};

export type SamedayService = {
  id: number;
  name: string;
  code: string;
};

export type SamedayAwbInput = {
  recipientName: string;
  recipientPhone: string;
  recipientCounty: string;    // string name — Sameday auto-mapeaza
  recipientCity: string;      // string name — Sameday auto-mapeaza
  recipientAddress: string;
  recipientPostalCode: string;
  packageType: 0 | 1 | 2;    // 0=colet, 1=plic, 2=colet mare
  packageNumber: number;
  weightKg: number;
  length?: number;
  width?: number;
  height?: number;
  cashOnDelivery: number;
  insuredValue: number;
  observation: string;
  clientInternalReference: string;
};

// ─── Token cache ──────────────────────────────────────────────────────────────

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenEntry>();

function baseUrl(sandbox: boolean) {
  return sandbox ? SANDBOX_URL : PROD_URL;
}

async function getSamedayToken(
  username: string,
  password: string,
  sandbox: boolean,
): Promise<string> {
  const key = `${username}::${sandbox}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(`${baseUrl(sandbox)}/api/authenticate`, {
    method: "POST",
    headers: {
      "X-AUTH-USERNAME": username,
      "X-AUTH-PASSWORD": password,
    },
  });

  if (!res.ok) throw new Error(`Sameday autentificare esuata: ${res.status} ${res.statusText}`);

  const data = await res.json() as { token?: string; expire_at?: string };
  if (!data.token) throw new Error("Token Sameday invalid in raspuns");

  // expire_at format: "2018-05-25 23:07" — cache with 1h buffer
  let expiresAt = Date.now() + 11 * 60 * 60 * 1000; // 11h default
  if (data.expire_at) {
    const parsed = new Date(data.expire_at.replace(" ", "T") + ":00").getTime();
    if (!isNaN(parsed)) expiresAt = parsed - 60 * 60 * 1000; // 1h before expiry
  }

  tokenCache.set(key, { token: data.token, expiresAt });
  return data.token;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

async function samedayGet<T>(
  path: string,
  token: string,
  sandbox: boolean,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${baseUrl(sandbox)}/${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { "X-AUTH-TOKEN": token },
  });
  if (!res.ok) throw new Error(`Sameday GET ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function samedayPost<T>(
  path: string,
  token: string,
  sandbox: boolean,
  bodyParts: string[],
): Promise<T> {
  const res = await fetch(`${baseUrl(sandbox)}/${path}`, {
    method: "POST",
    headers: {
      "X-AUTH-TOKEN": token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParts.join("&"),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Sameday POST ${path}: ${res.status} — ${text}`);

  return JSON.parse(text) as T;
}

async function samedayDelete(
  path: string,
  token: string,
  sandbox: boolean,
): Promise<void> {
  const res = await fetch(`${baseUrl(sandbox)}/${path}`, {
    method: "DELETE",
    headers: { "X-AUTH-TOKEN": token },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Sameday DELETE ${path}: ${res.status} — ${text}`);
  }
}

// ─── Account load (for config) ────────────────────────────────────────────────

export async function loadSamedayAccount(
  username: string,
  password: string,
  sandbox: boolean,
): Promise<{
  pickupPoints: SamedayPickupPoint[];
  services: SamedayService[];
} | { error: string }> {
  try {
    const token = await getSamedayToken(username, password, sandbox);

    const [ppRes, svcRes] = await Promise.all([
      samedayGet<{ data: SamedayPickupPoint[] }>(
        "api/client/pickup-points", token, sandbox, { page: "1", countPerPage: "50" }
      ),
      samedayGet<{ data: SamedayService[] }>("api/client/services", token, sandbox),
    ]);

    return {
      pickupPoints: ppRes.data ?? [],
      services: svcRes.data ?? [],
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── AWB creation ─────────────────────────────────────────────────────────────

export async function createSamedayAwb(
  config: SamedayConfig,
  input: SamedayAwbInput,
): Promise<string> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);

  const enc = encodeURIComponent;
  const perParcelWeight = (input.weightKg / Math.max(input.packageNumber, 1));

  const parts: string[] = [
    `pickupPoint=${config.pickup_point_id}`,
    `contactPerson=${config.contact_person_id}`,
    `packageType=${input.packageType}`,
    `packageNumber=${input.packageNumber}`,
    `packageWeight=${input.weightKg}`,
    `service=${config.service_id}`,
    `awbPayment=1`,   // 1 = platit de expeditor (client)
    `cashOnDelivery=${input.cashOnDelivery}`,
    `insuredValue=${input.insuredValue}`,
    `thirdPartyPickup=0`,
    `awbRecipient[name]=${enc(input.recipientName)}`,
    `awbRecipient[phoneNumber]=${enc(input.recipientPhone)}`,
    `awbRecipient[personType]=0`,
    `awbRecipient[countyString]=${enc(input.recipientCounty)}`,
    `awbRecipient[cityString]=${enc(input.recipientCity)}`,
    `awbRecipient[address]=${enc(input.recipientAddress)}`,
  ];

  if (input.recipientPostalCode) {
    parts.push(`awbRecipient[postalCode]=${enc(input.recipientPostalCode)}`);
  }
  if (input.observation) {
    parts.push(`observation=${enc(input.observation)}`);
  }
  if (input.clientInternalReference) {
    parts.push(`clientInternalReference=${enc(input.clientInternalReference)}`);
  }

  // Parcels details — distribui greutatea egal
  for (let i = 0; i < input.packageNumber; i++) {
    parts.push(`parcels[${i}][weight]=${perParcelWeight.toFixed(2)}`);
    if (input.length) parts.push(`parcels[${i}][length]=${input.length}`);
    if (input.width) parts.push(`parcels[${i}][width]=${input.width}`);
    if (input.height) parts.push(`parcels[${i}][height]=${input.height}`);
  }

  const data = await samedayPost<{
    awbNumber?: string;
    error?: string;
  }>("api/awb", token, config.sandbox, parts);

  if (!data.awbNumber) {
    throw new Error(data.error ?? "AWB Sameday nu a fost returnat in raspuns");
  }

  return data.awbNumber;
}

// ─── AWB deletion ─────────────────────────────────────────────────────────────

export async function deleteSamedayAwb(
  config: SamedayConfig,
  awbNumber: string,
): Promise<void> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);
  await samedayDelete(`api/awb/${encodeURIComponent(awbNumber)}`, token, config.sandbox);
}

// ─── AWB label PDF ────────────────────────────────────────────────────────────

// type: "A6" | "A4"
export async function getSamedayAwbLabel(
  config: SamedayConfig,
  awbNumber: string,
  labelType: "A6" | "A4" = "A6",
): Promise<Buffer> {
  const token = await getSamedayToken(config.username, config.password, config.sandbox);
  const url = `${baseUrl(config.sandbox)}/api/awb/download/${encodeURIComponent(awbNumber)}/${labelType}`;

  const res = await fetch(url, {
    headers: { "X-AUTH-TOKEN": token },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Sameday label error: ${res.status} — ${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
