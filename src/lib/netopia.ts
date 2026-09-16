/**
 * Netopia Payments v2 — REST/JSON API
 * https://netopia-payments.com/
 *
 * v2 uses API keys (no more XML/certificate encryption).
 * Auth: Authorization header with the API key.
 */

export type NetopiaConfig = {
  enabled: boolean;
  sandbox: boolean;
  pos_signature: string;
  title: string;
  api_key: string;
  /**
   * Netopia "Identitate Vizuala" badge — the iframe embed code the merchant
   * copies from admin.netopia-payments.com. Shown in the storefront footer
   * (mandatory branding) when Netopia is enabled. Sanitized at save time.
   */
  badge_html?: string;
};

export const NETOPIA_SANDBOX_URL = "https://secure.sandbox.netopia-payments.com";
// v2 live API is served under /pay on secure.mobilpay.ro — without it every
// request 404s. (secure.netopia-payments.com just redirects to the marketing site.)
export const NETOPIA_PRODUCTION_URL = "https://secure.mobilpay.ro/pay";

function getBaseUrl(sandbox: boolean) {
  return sandbox ? NETOPIA_SANDBOX_URL : NETOPIA_PRODUCTION_URL;
}

export interface NetopiaStartParams {
  orderId: string;
  posSignature: string;
  amount: number;
  currency: string;
  description: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  county: string;
  postalCode?: string;
  notifyUrl: string;
  redirectUrl: string;
}

export interface NetopiaStartResponse {
  error?: { code: string; message: string };
  // Gateway-level errors (e.g. 401 Unauthorized) come flat, not under `error`.
  code?: string;
  message?: string;
  payment?: {
    paymentURL?: string;
    ntpID?: string;
    status?: number;
    token?: string;
  };
}

/**
 * Start a card payment via Netopia v2.
 * POST /payment/card/start
 */
export async function startNetopiaPayment(
  params: NetopiaStartParams,
  apiKey: string,
  sandbox: boolean
): Promise<{ redirectUrl?: string; ntpID?: string; error?: string }> {
  const baseUrl = getBaseUrl(sandbox);

  const body = {
    config: {
      emailTemplate: "",
      notifyUrl: params.notifyUrl,
      redirectUrl: params.redirectUrl,
      language: "ro",
    },
    payment: {
      options: {
        installments: 0,
        bonus: 0,
      },
      instrument: {
        type: "card",
      },
      data: {},
    },
    order: {
      ntpID: "",
      posSignature: params.posSignature,
      dateTime: new Date().toISOString(),
      description: params.description,
      orderID: params.orderId,
      amount: params.amount,
      currency: params.currency,
      billing: {
        email: params.email,
        phone: params.phone,
        firstName: params.firstName,
        lastName: params.lastName,
        city: params.city,
        country: 642, // Romania ISO 3166-1 numeric
        countryName: "Romania",
        state: params.county,
        postalCode: params.postalCode || "000000",
        details: params.address,
      },
      shipping: {
        email: params.email,
        phone: params.phone,
        firstName: params.firstName,
        lastName: params.lastName,
        city: params.city,
        country: 642,
        countryName: "Romania",
        state: params.county,
        postalCode: params.postalCode || "000000",
        details: params.address,
      },
      products: [
        {
          name: params.description,
          code: params.orderId,
          category: "order",
          price: params.amount,
          vat: 0,
        },
      ],
      installments: {
        selected: 0,
        available: [0],
      },
      data: {},
    },
  };

  try {
    const res = await fetch(`${baseUrl}/payment/card/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey.trim(),
      },
      body: JSON.stringify(body),
    });

    // Read as text first: on a wrong endpoint, invalid API key or upstream error
    // Netopia can return a non-JSON page, and res.json() would throw and hide the
    // real status/body. Parse manually and always log enough to debug.
    const rawBody = await res.text();
    let data: NetopiaStartResponse;
    try {
      data = JSON.parse(rawBody) as NetopiaStartResponse;
    } catch {
      console.error(
        `[netopia] non-JSON response (HTTP ${res.status}) from ${baseUrl}/payment/card/start:`,
        rawBody.slice(0, 800)
      );
      return {
        error: `Netopia a raspuns neasteptat (HTTP ${res.status}). Verifica API Key-ul si modul (Sandbox/Live).`,
      };
    }

    if (!res.ok) {
      console.error(`[netopia] HTTP ${res.status}:`, JSON.stringify(data).slice(0, 800));
    }

    // In Netopia v2 `error.code` is a STATUS, not necessarily a failure:
    //   "00"  = completed
    //   "101" = redirect the customer to the hosted payment page (normal path
    //           for a fresh card payment — 3DS / card entry)
    // The real signal is paymentURL: if Netopia hands us a URL, send the customer
    // there regardless of the (non-fatal) status code. Only a missing URL is an error.
    if (data.payment?.paymentURL) {
      return { redirectUrl: data.payment.paymentURL, ntpID: data.payment.ntpID };
    }

    if (res.status === 401) {
      return { error: "Netopia a refuzat autentificarea: API Key invalid sau nepotrivit cu modul selectat (Sandbox/Live)." };
    }

    const errCode = data.error?.code ?? data.code;
    const errMessage = data.error?.message ?? data.message;
    if (errCode && errCode !== "00") {
      console.error(`[netopia] error code ${errCode}: ${errMessage ?? ""}`);
      return { error: errMessage || `Netopia error: ${errCode}` };
    }

    console.error("[netopia] no paymentURL in response:", JSON.stringify(data).slice(0, 800));
    return { error: "Nu s-a primit URL-ul de plata de la Netopia." };
  } catch (err) {
    console.error("[netopia] startPayment failed:", err);
    return { error: "Eroare la comunicarea cu Netopia." };
  }
}

/**
 * Netopia v2 IPN notification payload.
 */
export interface NetopiaIpnPayload {
  payment?: {
    ntpID?: string;
    status?: number;
    token?: string;
    amount?: number;
    currency?: string;
    data?: Record<string, unknown>;
    /*
     * ⚠ `code` si `message` sunt in schema lor `PaymentNotify` si lipseau de aici, deci motivul
     * REAL al unui refuz nu se putea citi. Masurat pe sandbox: la un CVV gresit vine
     * `code: "21", message: "Invalid CVV"`, la un numar inexistent `"17" / "Invalid card number"`.
     * Fara ele, un status necunoscut ar fi ajuns in jurnal ca o cifra goala.
     */
    code?: string;
    message?: string;
    error?: { code: string; message: string };
  };
  order?: {
    orderID?: string;
    ntpID?: string;
    posSignature?: string;
    amount?: number;
  };
}

/**
 * Statusurile de plata Netopia v2, din specificatia lor OFICIALA.
 *
 * ═══ ⚠⚠ 12 NU INSEAMNA „ANULAT" (16.09.2026) ═══
 *
 * Aici scria `12 = cancelled`, iar codul anula comanda. Afirmatia venea din migrarea v1 to v2 si
 * NU e sustinuta de nimic din v2. Specificatia lor OpenAPI 3.0
 * (`https://secure.sandbox.netopia-payments.com/spec`, citita pe 16.09.2026) o spune de DOUA ori,
 * in doua scheme diferite:
 *
 *   * `NotifyRequest.payment.status` si `PaymentNotify.status`: „12 = **invalid account**";
 *   * `Payment.status` (raspunsul de pornire): „12 - **rejected**".
 *
 * Adica plata a fost REFUZATA: card gresit, cont invalid, fonduri insuficiente. Nu e o hotarare a
 * cumparatorului, e un refuz al bancii.
 *
 * ⚠⚠ SI CE COSTA ANULAREA: `/api/netopia/start` refuza sa porneasca o plata pe o comanda cu
 * `status === "cancelled"`. Deci un card refuzat OMORA comanda: cumparatorul nu mai poate reincerca
 * niciodata, iar stocul si cuponul se elibereaza. O vanzare pierduta tacut, dintr-o cifra.
 *
 * ⚠ Purtarea corecta e deja SCRISA in platforma, pentru exact aceeasi situatie. Cronul
 * `discount-release`, despre plata online neterminata: „Ce NU face: nu anuleaza si nu atinge in
 * niciun fel comanda. Comanda neplatita ramane a comerciantului, cu totul." Cine abandoneaza pe
 * pagina bancii ramane cu comanda in asteptare; cine are cardul refuzat trebuie tratat la fel.
 *
 * Deci 12 nu misca nimic. Se intoarce `refuzat`, ca ruta sa lase o urma pentru comerciant.
 *
 * ⚠ 15 (rambursare) NU apare in specificatia v2. E cunostinta mostenita din v1, pastrata fiindca
 * maparea ei e in directia sigura (o comanda marcata gresit „rambursata" nu trimite marfa si nu
 * incaseaza nimic in plus) si fiindca alternativa ar fi sa nu recunoastem deloc o rambursare.
 *
 * ⚠ Orice alt cod NU misca nimic, si asta ramane: tacerea pe necunoscut e purtarea corecta cand
 * de partea cealalta sunt bani.
 *
 * ═══ ✅ DOVEDIT PE SANDBOX-UL LOR, 16.09.2026 ═══
 *
 * Nu mai e o citire de specificatie. Cu cardurile de test din chiar specificatia lor, pe contul de
 * sandbox al magazinului `itp-blk`, `POST /payment/card/start` a raspuns:
 *
 *   | card               | status | mesajul lor            |
 *   |--------------------|--------|------------------------|
 *   | valid, fara 3-D-S  |   3    | `00 Approved`          |
 *   | CVV gresit         | **12** | `21 Invalid CVV`       |
 *   | numar inexistent   | **12** | `17 Invalid card number` |
 *   | card expirat       |   1    | `19 Expired card`      |
 *
 * ⚠⚠ Deci 12 e REFUZ DE CARD, confirmat de doua ori, si nu e un cod rar: e chiar ce produce un
 * CVV tastat gresit, cea mai obisnuita greseala a unui cumparator. Pana la reparatia de azi, cine
 * gresea codul de pe card ramanea cu comanda ANULATA si nu o mai putea plati niciodata.
 *
 * ⚠ SI S-A VAZUT UN COD NOU: `1`, la cardul expirat. Nu se mapeaza, si nu din lene: nu stim daca
 * `1` inseamna intotdeauna un refuz sau e o stare intermediara (raspunsul purta si o pagina de
 * plata, deci cumparatorul poate relua acolo). Tacerea pe necunoscut ramane, iar ruta scrie de
 * acum codurile nerecunoscute in jurnal, ca harta sa creasca din TRAFIC, nu din presupuneri
 * (acelasi drum ca la Woot si Cargus).
 */
export function resolveNetopiaStatus(status: number): {
  orderStatus?: string;
  paymentStatus?: string;
  /** Plata a fost refuzata de ei. Comanda NU se misca; se scrie doar o urma pentru comerciant. */
  refuzat?: true;
} {
  switch (status) {
    case 3: // paid
    case 5: // confirmed
      return { orderStatus: "confirmed", paymentStatus: "paid" };
    case 12: // invalid account / rejected: plata REFUZATA, nu anulata
      return { refuzat: true };
    case 15: // credit/refund (din v1; nedocumentat in v2)
      return { paymentStatus: "refunded" };
    default:
      return {};
  }
}
