import { normalizePhone } from "@/lib/utils/phone";
import { normalizeLocalityName } from "@/lib/utils/ro-address";
import { eroareCuStatus, eroareDeTermen, eroareRefuz } from "@/lib/operatii/eroare-furnizor";
import { cheieToken } from "@/lib/integrari/cheie-token";

const CO_AUTH = "https://auth.colete-online.ro/token";
const CO_BASE_PROD = "https://api.colete-online.ro/v1";
const CO_BASE_STAGING = "https://api.colete-online.ro/v1/staging";

/* ⚠ TERMEN PE CERERE. Fara el `fetch` asteapta la nesfarsit, iar cotatia din checkout
   cheama treisprezece curieri deodata (`Promise.all` in `shipping.actions.ts`): unul
   singur care nu raspunde tine cumparatorul pe ecranul de livrare pana renunta el.
   ⚠ Termenul depasit iese `necunoscut` din `verdictFurnizor`, fiindca eroarea nu trece
   prin niciun constructor din `eroare-furnizor.ts`. Adica exact ce trebuie: un AWB care
   POATE sa fi fost creat ramane blocat, nu se reincearca. */
const ASTEPTARE_MS = 20_000;

/* ⚠ Eticheta e un FISIER, nu un raspuns JSON, deci i se da mai mult. Dar tot i se da:
   fara termen, o descarcare care nu mai vine tine ruta de eticheta ocupata pana cand
   platforma taie functia, iar comerciantul vede o fila care nu se deschide niciodata. */
const ASTEPTARE_ETICHETA_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type COConfig = {
  enabled: boolean;
  sandbox: boolean;
  client_id: string;
  client_secret: string;
  sender: COSender;
  /** Opt-in: insure shipments for the order's product value (extraOption 4). */
  insurance_enabled?: boolean;
  /** Where the COD money comes back: cash (extraOption 6) or bank account (extraOption 5). */
  repayment_type?: "cash" | "bank";
  repayment_iban?: string;
  repayment_holder?: string;
};

/** Extra options attached to an order/quote (see ApiExtraOptionType in the official module). */
export type COOrderExtras = {
  insurance?: number;
  openAtDelivery?: boolean;
  saturday?: boolean;
  clientReference?: string;
  repaymentType?: "cash" | "bank";
  repaymentIban?: string;
  repaymentHolder?: string;
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
  /*
   * ⚠ SI SECRETUL, hasuit. Cheiat doar pe `client_id`, cache-ul intorcea tokenul
   * valid si pentru un Client Secret GRESIT, deci „testeaza conexiunea" raspundea
   * verde peste o credentiala invalida. Vezi `@/lib/integrari/cheie-token`.
   */
  const cacheKey = cheieToken([clientId], [clientSecret]);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  /* ⚠ E POST, dar e CITIRE: tokenul nu creeaza niciun colet. Vezi `eroareDeTermen`. */
  let res: Response;
  try {
    res = await fetch(CO_AUTH, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
      signal: AbortSignal.timeout(ASTEPTARE_MS),
    });
  } catch (e) {
    throw eroareDeTermen(e, false, "autentificarea", "Colete Online");
  }

  if (!res.ok) throw eroareRefuz("Autentificare Colete Online esuata. Verifica credentialele API.");
  const data = await res.json() as { access_token?: string; token_type?: string; expires_in?: number; error?: string };
  if (!data.access_token) throw eroareRefuz(data.error ?? "Autentificare Colete Online esuata.");

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
  /* ⚠ Verdictul se alege pe METODA: un GET expirat n-a creat nimic (refuz dovedit), un
     POST expirat poate sa fi creat coletul inainte sa renuntam noi sa asteptam. */
  let res: Response;
  try {
    res = await fetch(`${getBase(sandbox)}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(ASTEPTARE_MS),
    });
  } catch (e) {
    throw eroareDeTermen(e, method.toUpperCase() !== "GET", `cererea ${path}`, "Colete Online");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string; errors?: { message: string }[] };
    const msg = err.message ?? err.errors?.[0]?.message ?? `Eroare HTTP ${res.status}`;
    throw eroareCuStatus(msg, res.status);
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
  extras: COOrderExtras = {},
) {
  // extraOption ids per the official module's ApiExtraOptionType enum.
  const extraOptions: Record<string, unknown>[] = [];
  if (repayment > 0) {
    if (extras.repaymentType === "bank" && extras.repaymentIban) {
      extraOptions.push({
        id: 5, // ACCOUNT_REPAYMENT — COD paid out to a bank account
        amount: repayment,
        accountRepaymentBankAccount: extras.repaymentIban,
        ...(extras.repaymentHolder ? { accountRepaymentHolderName: extras.repaymentHolder } : {}),
      });
    } else {
      extraOptions.push({ id: 6, amount: repayment }); // CASH_REPAYMENT
    }
  }
  if (extras.insurance && extras.insurance > 0) extraOptions.push({ id: 4, amount: extras.insurance });
  if (extras.openAtDelivery) extraOptions.push({ id: 2 });
  if (extras.saturday) extraOptions.push({ id: 3 });
  if (extras.clientReference) extraOptions.push({ id: 9, clientReference: extras.clientReference });

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
        phone: normalizePhone(sender.phone),
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
        phone: normalizePhone(receiver.phone),
        ...(receiver.email ? { email: receiver.email } : {}),
        ...(receiver.company ? { company: receiver.company } : {}),
      },
      address: {
        countryCode: "RO",
        /* ⚠ Bucurestiul se plieaza la „Bucuresti”: checkout-ul cere acum sectorul.
           Vezi nota din `ro-address.ts`. */
        city: normalizeLocalityName(receiver.city, receiver.county),
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
  extras: COOrderExtras = {},
): Promise<{ selected: COPriceResult; list: COPriceResult[] }> {
  // Use priceMinimal for recipient to allow price calc without full address
  const body = buildOrderBody(sender, receiver, parcels, repayment, [], "bestPrice", extras);
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
  extras: COOrderExtras = {},
): Promise<{ service: COPriceResult; awb: string; uniqueId: string; estimatedPickUpDate?: string }> {
  const body = buildOrderBody(sender, receiver, parcels, repayment, [serviceId], "directId", extras);
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
    signal: AbortSignal.timeout(ASTEPTARE_ETICHETA_MS),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? `Eroare la descarcarea AWB (HTTP ${res.status})`);
  }
  return res.arrayBuffer();
}
