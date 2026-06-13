/**
 * BT iPay (Banca Transilvania) — hosted payment page REST API.
 * Ref: "iPay - API Documentatie RO 2026-02-20".
 *
 * One endpoint family at /payment/rest/<method>.do, POST x-www-form-urlencoded,
 * JSON responses. Auth = HTTP Basic ("userName:password" base64). No HMAC/signature.
 *
 * IMPORTANT: iPay has NO server-to-server webhook. The payment result is read with
 * getOrderStatusExtended.do — on the browser return (finish route) AND by a
 * reconciliation cron, so a paid order is never lost if the customer closes the tab.
 *
 * We use 1-phase (register.do): success => orderStatus 2 (DEPOSITED), settled
 * automatically (T+1/T+2). refund.do is supported.
 */

export type IPayConfig = {
  enabled: boolean;
  sandbox: boolean;
  username: string;
  password: string;
  /** Label shown at checkout — managed via "Metode de plata". */
  title: string;
};

export const IPAY_SANDBOX_URL = "https://ecclients-sandbox.btrl.ro";
export const IPAY_PRODUCTION_URL = "https://ecclients.btrl.ro";

/** ISO 4217 numeric currency codes. */
export const IPAY_CURRENCY = { RON: "946", EUR: "978", USD: "840" } as const;
/** ISO 3166-1 numeric — Romania. */
export const IPAY_COUNTRY_RO = "642";

export function ipayBaseUrl(sandbox: boolean): string {
  return sandbox ? IPAY_SANDBOX_URL : IPAY_PRODUCTION_URL;
}

export function ipayReady(c: IPayConfig | null | undefined): boolean {
  return !!(c?.enabled && c.username && c.password);
}

function authHeader(c: IPayConfig): string {
  return "Basic " + Buffer.from(`${c.username}:${c.password}`).toString("base64");
}

/** amount -> bani (subunits). 12.00 RON => 1200. */
export function toBani(amount: number): number {
  return Math.round(Number(amount) * 100);
}

/**
 * description: ASCII 32..125 only, no diacritics, no '~'; only first 80 chars are
 * shown on the bank statement. We strip diacritics and clamp.
 */
export function sanitizeIpayDescription(input: string, max = 80): string {
  const noDiacritics = (input ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  let out = "";
  for (const ch of noDiacritics) {
    const code = ch.charCodeAt(0);
    out += code >= 32 && code <= 125 && ch !== "~" ? ch : " ";
  }
  return out.replace(/\s+/g, " ").trim().slice(0, max);
}

type IPayResponse = Record<string, unknown> & {
  errorCode?: string | number;
  errorMessage?: string;
};

async function ipayCall(
  c: IPayConfig,
  method: string,
  params: Record<string, string>,
): Promise<IPayResponse> {
  const url = `${ipayBaseUrl(c.sandbox)}/payment/rest/${method}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader(c),
      },
      body: new URLSearchParams(params).toString(),
    });
  } catch {
    return { errorCode: "network", errorMessage: "Eroare la comunicarea cu iPay." };
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as IPayResponse;
  } catch {
    return { errorCode: "parse", errorMessage: `Raspuns invalid de la iPay (HTTP ${res.status}).` };
  }
}

export type IPayOrderBundle = {
  email: string;
  /** digits only, international (e.g. 40740123456) */
  phone: string;
  city: string;
  address: string;
  postalCode?: string;
};

/** phone must contain only digits, international format. */
export function normalizeIpayPhone(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("40")) return digits;
  if (digits.startsWith("0")) return "4" + digits; // 07.. -> 407..
  return digits;
}

export function buildOrderBundle(b: IPayOrderBundle): string {
  const info: Record<string, string> = {
    country: IPAY_COUNTRY_RO,
    city: b.city,
    postAddress: b.address,
  };
  if (b.postalCode) info.postalCode = b.postalCode;
  return JSON.stringify({
    orderCreationDate: new Date().toISOString().slice(0, 10), // yyyy-MM-dd
    customerDetails: {
      email: b.email,
      phone: normalizeIpayPhone(b.phone),
      deliveryInfo: { deliveryType: "comanda", ...info },
      billingInfo: { ...info },
    },
  });
}

export type IPayRegisterResult = {
  orderId?: string;
  formUrl?: string;
  errorCode: string;
  errorMessage?: string;
};

/** register.do (1-phase). Returns hosted-page formUrl + iPay orderId (UUID). */
export async function ipayRegister(
  c: IPayConfig,
  p: {
    orderNumber: string;
    amountBani: number;
    returnUrl: string;
    currency?: string;
    description?: string;
    email?: string;
    orderBundle?: string;
    language?: string;
  },
): Promise<IPayRegisterResult> {
  const params: Record<string, string> = {
    orderNumber: p.orderNumber,
    amount: String(p.amountBani),
    currency: p.currency ?? IPAY_CURRENCY.RON,
    returnUrl: p.returnUrl,
  };
  if (p.description) params.description = sanitizeIpayDescription(p.description);
  if (p.email) params.email = p.email;
  if (p.orderBundle) params.orderBundle = p.orderBundle;
  if (p.language) params.language = p.language;

  const r = await ipayCall(c, "register.do", params);
  return {
    orderId: typeof r.orderId === "string" ? r.orderId : undefined,
    formUrl: typeof r.formUrl === "string" ? r.formUrl : undefined,
    errorCode: String(r.errorCode ?? ""),
    errorMessage: typeof r.errorMessage === "string" ? r.errorMessage : undefined,
  };
}

export type IPayStatus = {
  errorCode: string;
  errorMessage?: string;
  orderStatus?: number;
  actionCode?: number;
  actionCodeDescription?: string;
  amount?: number;
  currency?: string;
  raw: IPayResponse;
};

/** getOrderStatusExtended.do — authoritative transaction result. */
export async function ipayGetOrderStatus(
  c: IPayConfig,
  by: { orderId?: string; orderNumber?: string },
): Promise<IPayStatus> {
  const params: Record<string, string> = {};
  if (by.orderId) params.orderId = by.orderId;
  else if (by.orderNumber) params.orderNumber = by.orderNumber;

  const r = await ipayCall(c, "getOrderStatusExtended.do", params);
  return {
    errorCode: String(r.errorCode ?? ""),
    errorMessage: typeof r.errorMessage === "string" ? r.errorMessage : undefined,
    orderStatus: r.orderStatus != null ? Number(r.orderStatus) : undefined,
    actionCode: r.actionCode != null ? Number(r.actionCode) : undefined,
    actionCodeDescription:
      typeof r.actionCodeDescription === "string" ? r.actionCodeDescription : undefined,
    amount: r.amount != null ? Number(r.amount) : undefined,
    currency: r.currency != null ? String(r.currency) : undefined,
    raw: r,
  };
}

export type IPayMutationResult = {
  ok: boolean;
  errorCode: string;
  errorMessage?: string;
  actionCode?: number;
};

/** refund.do — partial or full. amount in bani. Order must be DEPOSITED/PARTIALLY REFUNDED. */
export async function ipayRefund(
  c: IPayConfig,
  orderId: string,
  amountBani: number,
): Promise<IPayMutationResult> {
  const r = await ipayCall(c, "refund.do", { orderId, amount: String(amountBani) });
  const errorCode = String(r.errorCode ?? "");
  return {
    ok: errorCode === "0",
    errorCode,
    errorMessage: typeof r.errorMessage === "string" ? r.errorMessage : undefined,
    actionCode: r.actionCode != null ? Number(r.actionCode) : undefined,
  };
}

/** orderStatus enum (doc 6.7): 0 not paid, 1 preauth held, 2 deposited, 3 reversed,
 *  4 refunded, 5 3DS in progress, 6 declined, 7 partially refunded. */
export type IPayResolved = {
  /** terminal result reached (stop polling) */
  final: boolean;
  paid: boolean;
  paymentStatus?: "paid" | "refunded";
  orderStatus?: "confirmed" | "cancelled";
};

export function resolveIpayStatus(orderStatus: number | undefined): IPayResolved {
  switch (orderStatus) {
    case 2: // deposited (1-phase success)
    case 1: // preauth held (2-phase; treated as success if ever enabled)
      return { final: true, paid: true, paymentStatus: "paid", orderStatus: "confirmed" };
    case 4: // fully refunded
    case 7: // partially refunded
      return { final: true, paid: false, paymentStatus: "refunded" };
    case 3: // reversed
    case 6: // declined
      return { final: true, paid: false, orderStatus: "cancelled" };
    case 5: // 3DS in progress
    case 0: // registered, not paid yet
    default:
      return { final: false, paid: false };
  }
}

/**
 * Friendly RO messages for the most common actionCodes ("returnUrl si cele 22 erori").
 * Anything else => generic message.
 */
export const IPAY_ACTION_MESSAGES: Record<number, string> = {
  104: "Card restrictionat. Contacteaza banca emitenta sau foloseste alt card.",
  124: "Tranzactia nu poate fi autorizata din motive legale/de reglementare.",
  320: "Card inactiv. Te rugam sa activezi cardul.",
  801: "Emitentul cardului este momentan indisponibil. Reincearca mai tarziu.",
  803: "Card blocat. Contacteaza banca emitenta sau foloseste alt card.",
  804: "Tranzactie nepermisa. Contacteaza banca emitenta sau foloseste alt card.",
  805: "Tranzactie respinsa.",
  861: "Data de expirare a cardului este gresita.",
  871: "Cod CVV gresit.",
  905: "Card invalid.",
  906: "Card expirat.",
  913: "Tranzactie invalida. Contacteaza banca emitenta sau foloseste alt card.",
  914: "Cont invalid. Contacteaza banca emitenta.",
  915: "Fonduri insuficiente.",
  917: "Limita de tranzactionare depasita.",
  952: "Tranzactie suspectata de frauda.",
  998: "Plata in rate nu este permisa cu acest card.",
  341016: "Autentificarea 3D Secure a fost respinsa. Reincearca sau foloseste alt card.",
  341017: "Autentificarea 3D Secure are status necunoscut. Reincearca sau foloseste alt card.",
  341018: "Autentificarea 3D Secure a fost anulata.",
  341019: "Autentificarea 3D Secure a esuat. Reincearca sau foloseste alt card.",
  341020: "Autentificarea 3D Secure are status necunoscut. Reincearca sau foloseste alt card.",
};

/** Cards must NOT be retried for these codes — advise the customer to use another card. */
export const IPAY_RETRY_FORBIDDEN_ACTION_CODES = new Set([803, 804, 913]);

export function ipayActionMessage(actionCode: number | undefined): string {
  if (actionCode == null) return "Tranzactie refuzata, te rugam reincearca.";
  return IPAY_ACTION_MESSAGES[actionCode] ?? "Tranzactie refuzata, te rugam reincearca.";
}

/**
 * Build a unique, iPay-safe orderNumber from the Edinio order number.
 * iPay requires a NEW orderNumber per attempt; non-alphanumerics (incl. the
 * forbidden % + \r \n) are stripped, then a short unique suffix is appended.
 */
export function ipayOrderNumber(base: string): string {
  const alnum = (base || "").replace(/[^A-Za-z0-9]/g, "") || "ORD";
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  return `${alnum}x${suffix}`.slice(0, 99);
}
