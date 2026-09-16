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
  /**
   * Cat s-a intors, in subunitati, din `paymentAmountInfo.refundedAmount` (doc 6.7, pagina 44).
   *
   * ⚠ NU se foloseste `depositedAmount` ca sa se afle cat se incasase: in CHIAR exemplul lor
   * (pagina 50), dupa o rambursare totala `depositedAmount` ajunge **0** si numai `approvedAmount`
   * ramane 2600. Comparatia se face cu `amount`, suma comenzii, care nu se misca.
   */
  rambursat?: number;
  /** `chargeback` din raspunsul lor: tranzactia e marcata contestata. */
  contestat?: boolean;
  raw: IPayResponse;
};

/** Moneda lor e numerica (ISO 4217). Pentru mesajele catre oameni o vrem in litere. */
export function ipayMonedaInLitere(cod: string | undefined): string {
  for (const [nume, numar] of Object.entries(IPAY_CURRENCY)) {
    if (numar === String(cod ?? "")) return nume;
  }
  return "RON";
}

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
    rambursat: sumaRambursata(r),
    contestat: r.chargeback === true,
    raw: r,
  };
}

/**
 * Cat s-a intors, din `paymentAmountInfo.refundedAmount`.
 *
 * ⚠ Se citeste si lista `refunds[]` ca REZERVA, nu din belsug: `refundedAmount` e campul limpede,
 * dar daca lipseste dintr-un raspuns mai vechi, suma tot se poate aduna din rambursarile insirate.
 * Fara rezerva, o rambursare adevarata ar trece drept „zero intors", adica exact tacerea de care ne
 * ferim.
 */
function sumaRambursata(r: IPayResponse): number | undefined {
  const info = (r as { paymentAmountInfo?: { refundedAmount?: unknown } }).paymentAmountInfo;
  const direct = Number(info?.refundedAmount);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const lista = (r as { refunds?: { amount?: unknown }[] }).refunds;
  if (Array.isArray(lista) && lista.length > 0) {
    const suma = lista.reduce((a, x) => {
      const n = Number(x?.amount);
      return a + (Number.isFinite(n) ? n : 0);
    }, 0);
    if (suma > 0) return suma;
  }
  /* ⚠ `0` se intoarce doar cand ei CHIAR au spus zero; altfel `undefined` („nu stim"). */
  return Number.isFinite(direct) ? direct : undefined;
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

/**
 * Ce inseamna `orderStatus`, din TABELUL LOR (doc 6.7, pagina 46, citit 17.09.2026):
 *
 *   0  Order registered, but not paid off
 *   1  Pre-authorization amount was held (for two-phase payment)
 *   2  The amount was deposited successfully
 *   3  Authorization reversed
 *   4  Transaction was fully refunded
 *   5  Authorization through the issuer's ACS initiated
 *   6  Authorization declined
 *   7  Transaction was partially refunded
 *
 * ═══ ⚠⚠ CE ERA GRESIT AICI, SI DE CE NU SE VEDEA (17.09.2026) ═══
 *
 * Functia intorcea si `orderStatus: "cancelled"` / `paymentStatus`, campuri pe care **niciun apelant
 * nu le citea**: si `/api/ipay/return`, si cronul se uita DOAR la `paid`. Masurat, nu presupus.
 *
 * Deci nimic din ce urmeaza nu a pagubit pe cineva, fiindca integrarea n-a rulat niciodata pentru
 * nimeni (zero magazine configurate, zero comenzi). Dar erau patru capcane armate, care se descarcau
 * in ziua in care cineva lega campurile:
 *
 *   ⚠⚠ 6 (DECLINED) -> „cancelled". Exact defectul reparat la Netopia pe 16.09: un card refuzat
 *      (blocat, fonduri insuficiente, CVV gresit) ar fi ANULAT comanda, iar `/api/ipay/start` refuza
 *      comenzile anulate, deci cumparatorul nu mai putea reincerca NICIODATA.
 *   ⚠  1 (PRE-AUTHORIZATION HELD) -> „paid" + „confirmed". Banii sunt doar BLOCATI, nu incasati;
 *      incasarea cere `deposit.do`. Marcata platita, comanda ar fi declansat facturarea automata pe
 *      bani care nu sunt ai comerciantului. Chiar documentatia lor cere reversare in 24 de ore daca
 *      nu onorezi comanda.
 *   ⚠  7 (PARTIALLY REFUNDED) -> „refunded". Supra-declara: baza ingaduie doar `unpaid`/`paid`/
 *      `refunded` (`orders_payment_status_check`), deci un partial scris „rambursat" ar fi spus ca
 *      s-au intors TOTI banii si ar fi scos comanda din semnalul de marfa plecata fara bani.
 *   ⚠  3 (REVERSED) -> „cancelled", desi e o stare de 2-phase pe care noi n-o folosim.
 *
 * ⚠ NOI FOLOSIM DOAR 1-PHASE: nicaieri in `src/` nu se cheama `registerPreAuth.do`. Deci 1 si 3 nu
 * pot aparea pe drumul obisnuit. Se numesc totusi pe fata, ca jurnalul sa nu spuna „necunoscut"
 * despre ceva documentat, si ca ziua in care cineva porneste 2-phase sa nu le gaseasca mapate gresit.
 */
export type IPayResolved = {
  /** Deznodamant atins: nu mai are rost interogat. */
  final: boolean;
  /** Banii sunt INCASATI. Doar asta marcheaza o comanda platita. */
  paid: boolean;
  /** Banii s-au intors, integral sau in parte. */
  rambursat?: "integral" | "partial";
  /**
   * Plata a fost REFUZATA de banca. Comanda NU se misca: e un refuz, nu o hotarare a cumparatorului,
   * iar el trebuie sa poata reincerca. Aceeasi regula ca la Netopia.
   */
  refuzat?: true;
  /** Stare de 2-phase, pe care nu o folosim. Nu se misca nimic, dar se stie ce e. */
  doiPasi?: "blocat" | "anulat";
};

export function resolveIpayStatus(orderStatus: number | undefined): IPayResolved {
  switch (orderStatus) {
    case 2: // the amount was deposited successfully
      return { final: true, paid: true };
    case 4: // fully refunded
      return { final: true, paid: false, rambursat: "integral" };
    case 7: // partially refunded
      return { final: true, paid: false, rambursat: "partial" };
    case 6: // authorization declined
      return { final: true, paid: false, refuzat: true };
    case 1: // pre-authorization held (2-phase): bani BLOCATI, nu incasati
      return { final: false, paid: false, doiPasi: "blocat" };
    case 3: // authorization reversed (2-phase)
      return { final: true, paid: false, doiPasi: "anulat" };
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
 * `orderNumber`-ul iPay: DETERMINIST si ENUMERABIL.
 *
 * ═══ CE ERA GRESIT, SI DE CE CONTEAZA ═══
 *
 * Forma dinainte lipea `Date.now().toString(36) + Math.random()`, iar rezultatul
 * nu se salva nicaieri. Asta anula AMANDOUA jumatatile pe care BT le ofera gratis:
 *
 *   1. Banca DEDUPLICA dupa `orderNumber` — `register.do` raspunde errorCode 1,
 *      „Order with this number was already processed". Cu un sufix din ceas,
 *      fiecare apasare producea alt numar, deci alta plata.
 *   2. Banca permite INTEROGAREA dupa el — `getOrderStatusExtended.do` accepta
 *      `orderNumber` in locul lui `orderId`. Nesalvat, numarul trimis la banca
 *      disparea definitiv din univers: nici reconstruit, nici cautat.
 *
 * Consecinta exacta pentru clasa de defect: daca scrierea lui `ipay_order_id` pica
 * dupa `register.do`, plata exista la banca si NIMIC nu o mai poate gasi — cronul
 * `ipay-reconcile` filtreaza chiar pe `ipay_order_id` nenul.
 *
 * ═══ FORMA ═══
 *
 * `<numarComanda>-<incercare>`, exact ce recomanda documentatia BT (extras:
 * „nrFactură-0, nrFactură-1, nrFactură-2"). Enumerabila: reconcilierea poate cauta
 * orbeste `-0`, `-1`, `-2` fara sa fi salvat nimic dupa apel.
 *
 * ⚠ Incercarea TREBUIE sa creasca: iPay cere un numar NOU per tentativa, iar o
 * plata expirata sau abandonata ar bloca-o pe urmatoarea cu errorCode 1. De aceea
 * apelantul o citeste din `orders.ipay_order_number` si o incrementeaza.
 *
 * Caracterele nealfanumerice (inclusiv `%`, `+`, `\r`, `\n`, interzise de iPay)
 * se scot din baza; cratima dinaintea incercarii e sigura si e chiar cea din
 * exemplul bancii.
 */
export function ipayOrderNumber(base: string, incercare = 0, businessId = ""): string {
  const alnum = (base || "").replace(/[^A-Za-z0-9]/g, "") || "ORD";
  const n = Number.isFinite(incercare) && incercare > 0 ? Math.floor(incercare) : 0;

  /*
   * ⚠ `order_number` e unic doar PER MAGAZIN.
   *
   * `orders_order_number_business_unique UNIQUE (business_id, order_number)`, iar
   * contorul reporneste de la #0001 la fiecare magazin nou. Banca deduplica insa pe
   * CONTUL DE COMERCIANT — iar doi proprietari de magazine pot foarte bine sa fi
   * configurat acelasi cont iPay pe amandoua. Atunci comanda #0001 din magazinul A
   * si #0001 din B ar trimite acelasi `orderNumber`, iar a doua ar fi respinsa cu
   * errorCode 1: „Order with this number was already processed."
   *
   * Patru caractere din `businessId` (UUID) despart magazinele fara sa manance din
   * bugetul de mai jos.
   */
  const magazin = businessId.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();

  /*
   * ⚠ LIMITA BANCII E 32, nu 99.
   *
   * Documentatia BT da `orderNumber String(32)` (si la register.do, si la
   * getOrderStatusExtended.do). Forma dinainte taia la 99 — mergea in practica doar
   * fiindca numerele de comanda sunt scurte.
   *
   * Se taie BAZA, nu intregul: discriminantul de magazin si numarul incercarii
   * trebuie sa supravietuiasca, altfel doua tentative ar ajunge la acelasi numar
   * dupa taiere — exact ce trebuie sa nu se intample.
   */
  const coada = `${magazin ? `-${magazin}` : ""}-${n}`;
  return `${alnum.slice(0, Math.max(1, 32 - coada.length))}${coada}`;
}

/** Ce incercare urmeaza, citind numarul folosit ultima data. Prima e 0. */
export function urmatoareaIncercareIpay(ultimul: string | null | undefined): number {
  const m = /-(\d+)$/.exec(String(ultimul ?? ""));
  return m ? Number(m[1]) + 1 : 0;
}
