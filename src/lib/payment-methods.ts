/**
 * "Metode de plata" — shared model.
 *
 * Stored on `store_settings.payment_methods` as an ordered array of entries.
 * One central resolver is used by BOTH the Settings management UI and the public
 * checkout (OrderModal + MiniStoreRenderer) so the order form stays consistent.
 *
 * - cash_on_delivery (Ramburs) is always present and enabled by default at store
 *   creation; it never depends on a processor being configured.
 * - netopia / stripe / ipay are "processor" methods: they auto-appear (enabled)
 *   the first time the processor becomes ready (configured in Integrari), and the
 *   merchant can then disable / reorder / rename them.
 */

export type PaymentMethodType = "cash_on_delivery" | "netopia" | "stripe" | "ipay" | "klarna" | "revolut";

export const PAYMENT_PROCESSOR_TYPES = ["netopia", "stripe", "ipay", "klarna", "revolut"] as const;
export type PaymentProcessorType = (typeof PAYMENT_PROCESSOR_TYPES)[number];

export type PaymentMethodEntry = {
  type: PaymentMethodType;
  enabled: boolean;
  label: string;
};

export const PAYMENT_METHOD_DEFAULT_LABELS: Record<PaymentMethodType, string> = {
  cash_on_delivery: "Ramburs la curier",
  netopia: "Card online (Netopia)",
  stripe: "Card online (Stripe)",
  ipay: "Card bancar (BT iPay)",
  klarna: "Klarna",
  revolut: "Card online (Revolut)",
};

const ALL_TYPES: PaymentMethodType[] = ["cash_on_delivery", ...PAYMENT_PROCESSOR_TYPES];

/** Default config assigned when a store is created: only Ramburs, enabled. */
export function defaultPaymentMethods(): PaymentMethodEntry[] {
  return [
    { type: "cash_on_delivery", enabled: true, label: PAYMENT_METHOD_DEFAULT_LABELS.cash_on_delivery },
  ];
}

export type ProcessorReadiness = Record<PaymentProcessorType, boolean>;

// Accept both the new object format and any legacy string codes (e.g. "cod").
const LEGACY_CODE_MAP: Record<string, PaymentMethodType> = {
  cod: "cash_on_delivery",
  ramburs: "cash_on_delivery",
  cash_on_delivery: "cash_on_delivery",
  netopia: "netopia",
  stripe: "stripe",
  ipay: "ipay",
  klarna: "klarna",
  revolut: "revolut",
};

function coerceEntry(x: unknown): PaymentMethodEntry | null {
  // Legacy format: a bare string code like "cod".
  if (typeof x === "string") {
    const t = LEGACY_CODE_MAP[x];
    return t ? { type: t, enabled: true, label: PAYMENT_METHOD_DEFAULT_LABELS[t] } : null;
  }
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  let type = typeof o.type === "string" ? o.type : "";
  if (LEGACY_CODE_MAP[type]) type = LEGACY_CODE_MAP[type];
  if (!ALL_TYPES.includes(type as PaymentMethodType)) return null;
  const t = type as PaymentMethodType;
  return {
    type: t,
    enabled: o.enabled !== false,
    label: typeof o.label === "string" && o.label.trim() ? o.label : PAYMENT_METHOD_DEFAULT_LABELS[t],
  };
}

/**
 * Management view (Settings). Merges the stored array with live processor readiness:
 * keeps stored order/label/enabled, guarantees COD, and appends any newly-ready
 * processor that is not listed yet (enabled => auto-activation). De-duplicates by type.
 */
export function resolvePaymentMethods(stored: unknown, ready: ProcessorReadiness): PaymentMethodEntry[] {
  const seen = new Set<PaymentMethodType>();
  const list: PaymentMethodEntry[] = [];
  if (Array.isArray(stored)) {
    for (const raw of stored) {
      const e = coerceEntry(raw);
      if (e && !seen.has(e.type)) { seen.add(e.type); list.push(e); }
    }
  }
  if (!seen.has("cash_on_delivery")) {
    seen.add("cash_on_delivery");
    list.unshift({ type: "cash_on_delivery", enabled: true, label: PAYMENT_METHOD_DEFAULT_LABELS.cash_on_delivery });
  }
  for (const type of PAYMENT_PROCESSOR_TYPES) {
    if (ready[type] && !seen.has(type)) {
      seen.add(type);
      list.push({ type, enabled: true, label: PAYMENT_METHOD_DEFAULT_LABELS[type] });
    }
  }
  return list;
}

/**
 * Checkout view. Only methods the customer can actually use: enabled AND (for
 * processors) ready. Always falls back to COD so a store can never end up with
 * zero payment methods. Returns just what the order form needs.
 */
export function checkoutPaymentMethods(
  stored: unknown,
  ready: ProcessorReadiness,
): { type: PaymentMethodType; label: string }[] {
  const resolved = resolvePaymentMethods(stored, ready);
  const usable = resolved.filter(
    (m) => m.enabled && (m.type === "cash_on_delivery" || ready[m.type as PaymentProcessorType]),
  );
  const final = usable.length
    ? usable
    : [{ type: "cash_on_delivery" as PaymentMethodType, enabled: true, label: PAYMENT_METHOD_DEFAULT_LABELS.cash_on_delivery }];
  return final.map((m) => ({ type: m.type, label: m.label || PAYMENT_METHOD_DEFAULT_LABELS[m.type] }));
}

/**
 * Validate/normalize a payment_methods array before persisting: drop invalid or
 * duplicate entries, guarantee COD is present, ensure at least one method stays
 * enabled, and clamp labels.
 */
export function sanitizePaymentMethods(input: unknown): PaymentMethodEntry[] {
  const seen = new Set<PaymentMethodType>();
  const out: PaymentMethodEntry[] = [];
  if (Array.isArray(input)) {
    for (const raw of input) {
      const e = coerceEntry(raw);
      if (e && !seen.has(e.type)) {
        seen.add(e.type);
        out.push({
          type: e.type,
          enabled: e.enabled,
          label: (e.label || PAYMENT_METHOD_DEFAULT_LABELS[e.type]).trim().slice(0, 40) || PAYMENT_METHOD_DEFAULT_LABELS[e.type],
        });
      }
    }
  }
  if (!seen.has("cash_on_delivery")) {
    out.unshift({ type: "cash_on_delivery", enabled: true, label: PAYMENT_METHOD_DEFAULT_LABELS.cash_on_delivery });
  }
  if (!out.some((m) => m.enabled)) {
    const cod = out.find((m) => m.type === "cash_on_delivery");
    if (cod) cod.enabled = true;
  }
  return out;
}

// ── Card-payment discount ────────────────────────────────────────────────────
// Optional incentive: a discount applied automatically when the customer pays
// with an online card method (netopia / stripe / ipay). It NEVER applies to
// ramburs (cash on delivery). The amount is computed server-side at order
// creation and baked into `orders.total`, so every processor charges (and iPay
// verifies) the discounted amount with no changes to the payment endpoints.

export type CardDiscountType = "percent" | "fixed";

export type CardDiscountConfig = {
  enabled: boolean;
  type: CardDiscountType;
  value: number; // percent => 0..100 ; fixed => RON off the goods value
};

export const DEFAULT_CARD_DISCOUNT: CardDiscountConfig = { enabled: false, type: "percent", value: 0 };

/**
 * Online prepaid methods eligible for the card-payment discount (excludes ramburs).
 * `isCardPaymentMethod` doubles as the "paid online ⇒ mark collected on the invoice"
 * signal (see smartbill.actions.ts), so Klarna belongs here — it is auto-captured at
 * checkout, i.e. paid upfront just like the card processors.
 */
const CARD_DISCOUNT_METHODS = new Set<PaymentMethodType>(["netopia", "stripe", "ipay", "klarna", "revolut"]);

export function isCardPaymentMethod(method: string | null | undefined): boolean {
  return !!method && CARD_DISCOUNT_METHODS.has(method as PaymentMethodType);
}

/** Parse/normalize the stored jsonb config. Unknown/invalid => disabled. */
export function parseCardDiscountConfig(raw: unknown): CardDiscountConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CARD_DISCOUNT };
  const o = raw as Record<string, unknown>;
  const type: CardDiscountType = o.type === "fixed" ? "fixed" : "percent";
  let value = Number(o.value);
  if (!Number.isFinite(value) || value < 0) value = 0;
  if (type === "percent") value = Math.min(value, 100);
  return { enabled: o.enabled === true, type, value: Math.round(value * 100) / 100 };
}

/** Validate before persisting: a zero/invalid value can't be a real discount. */
export function sanitizeCardDiscountConfig(raw: unknown): CardDiscountConfig {
  const c = parseCardDiscountConfig(raw);
  if (c.value <= 0) return { enabled: false, type: c.type, value: 0 };
  return c;
}

/**
 * Card discount amount for a goods base (subtotal + extras, AFTER any promo
 * discount — never including shipping). Returns 0 when disabled or when the
 * method isn't an online card method. Capped at the base so total never goes
 * negative from this alone.
 */
export function computeCardDiscount(
  config: CardDiscountConfig,
  paymentMethod: string | null | undefined,
  goodsBase: number,
): number {
  if (!config.enabled || config.value <= 0) return 0;
  if (!isCardPaymentMethod(paymentMethod)) return 0;
  const base = Math.max(0, goodsBase);
  if (base <= 0) return 0;
  const raw = config.type === "percent" ? base * (config.value / 100) : config.value;
  return Math.round(Math.min(raw, base) * 100) / 100;
}

// ── Ramburs (cash-on-delivery) discount ──────────────────────────────────────
// Optional incentive mirroring the card discount, but applied ONLY when the
// customer pays cash on delivery (ramburs). Same jsonb shape (CardDiscountConfig),
// stored in store_settings.cod_discount_config. A given order has a single payment
// method, so the card and ramburs discounts are mutually exclusive — at most one is
// ever non-zero on the same order.

export function isCodPaymentMethod(method: string | null | undefined): boolean {
  return method === "cash_on_delivery";
}

/**
 * Metoda de plata primita de la client, adusa la una din valorile cunoscute.
 *
 * Serverul trebuie sa o citeasca O SINGURA DATA si sa foloseasca de acolo incolo
 * doar rezultatul. Pana la taxa de ramburs, calculele primeau valoarea bruta iar
 * coloana din baza primea `?? "cash_on_delivery"` — doua implicite diferite
 * pentru acelasi camp. Cat timp toate parghiile erau REDUCERI, nepotrivirea
 * costa clientul (isi pierdea reducerea) si nu se vedea. Taxa inverseaza semnul:
 * o cerere fara campul `payment_method` — actiunile de comanda sunt exporturi
 * `"use server"`, adica endpointuri publice — producea o comanda ramburs perfect
 * obisnuita, dar cu taxa zero. Comerciantul platea comisionul curierului si nu
 * incasa taxa, fara nimic vizibil in panou, pe AWB sau pe factura.
 *
 * Necunoscutul devine ramburs, nu o valoare inventata: e acelasi implicit pe care
 * il avea deja inserarea, deci nu schimba nimic pentru comenzile de azi.
 */
export function normalizePaymentMethod(raw: unknown): PaymentMethodType {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  // Se verifica APARTENENTA, nu adevarul valorii. Cu o simpla citire urmata de
  // `??`, doua siruri scapa: „constructor" si „__proto__" gasesc ceva pe lantul
  // de prototip al obiectului — functia `Object`, respectiv `Object.prototype` —
  // iar `??` prinde doar null si undefined, deci ar fi iesit din functie o
  // valoare care nu e nicio metoda de plata. Aceeasi paza o are deja `coerceEntry`
  // mai sus, prin `ALL_TYPES.includes`.
  const gasit = Object.prototype.hasOwnProperty.call(LEGACY_CODE_MAP, s)
    ? LEGACY_CODE_MAP[s]
    : undefined;
  return gasit ?? "cash_on_delivery";
}

/**
 * Ramburs (cash-on-delivery) discount amount for a goods base (subtotal + extras,
 * AFTER any promo discount — never including shipping). Returns 0 when disabled or
 * when the method isn't ramburs. Capped at the base so total never goes negative.
 */
export function computeCodDiscount(
  config: CardDiscountConfig,
  paymentMethod: string | null | undefined,
  goodsBase: number,
): number {
  if (!config.enabled || config.value <= 0) return 0;
  if (!isCodPaymentMethod(paymentMethod)) return 0;
  const base = Math.max(0, goodsBase);
  if (base <= 0) return 0;
  const raw = config.type === "percent" ? base * (config.value / 100) : config.value;
  return Math.round(Math.min(raw, base) * 100) / 100;
}

// ── Taxa la plata ramburs ────────────────────────────────────────────────────
// Oglinda reducerii de mai sus, cu semnul schimbat: rambursul costa comerciantul
// bani reali (comisionul curierului la incasare), iar taxa ii trece mai departe.
// Se aplica DOAR la ramburs, deci nu se poate intalni niciodata cu reducerea la
// plata online. Se poate insa intalni cu REDUCEREA la ramburs, daca cineva le
// porneste pe amandoua — se scad una din alta, si e o alegere a comerciantului,
// nu o eroare de care sa-l aparam.

export type CodFeeType = "percent" | "fixed";

export type CodFeeConfig = {
  enabled: boolean;
  type: CodFeeType;
  /** percent => 0..100 din valoarea marfii ; fixed => lei */
  value: number;
  /**
   * Doar pentru `fixed`: suma scrisa de comerciant contine deja TVA.
   *
   * Exista pentru ca „5 lei" nu spune si daca cei 5 lei sunt cu sau fara TVA, iar
   * diferenta ajunge direct in ce plateste clientul. La `percent` intrebarea nu se
   * pune: procentul se aplica peste o baza care e deja in regimul magazinului.
   */
  amount_includes_vat: boolean;
};

export const DEFAULT_COD_FEE: CodFeeConfig = {
  enabled: false,
  type: "fixed",
  value: 0,
  amount_includes_vat: true,
};

/** Parseaza/normalizeaza jsonb-ul stocat. Orice e necunoscut sau invalid => oprita. */
export function parseCodFeeConfig(raw: unknown): CodFeeConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COD_FEE };
  const o = raw as Record<string, unknown>;
  const type: CodFeeType = o.type === "percent" ? "percent" : "fixed";
  let value = Number(o.value);
  if (!Number.isFinite(value) || value < 0) value = 0;
  if (type === "percent") value = Math.min(value, 100);
  return {
    enabled: o.enabled === true,
    type,
    value: Math.round(value * 100) / 100,
    // Implicit „contine TVA": e felul in care se gandeste un comerciant la o suma
    // pe care o vede clientul. Ales explicit, nu lasat la voia lui `undefined`.
    amount_includes_vat: o.amount_includes_vat !== false,
  };
}

/** Verificare inainte de salvare: o taxa de zero nu e o taxa. */
export function sanitizeCodFeeConfig(raw: unknown): CodFeeConfig {
  const c = parseCodFeeConfig(raw);
  if (c.value <= 0) return { ...c, enabled: false, value: 0 };
  return c;
}

/**
 * Suma fixa a comerciantului, adusa in REGIMUL DE PRETURI AL MAGAZINULUI.
 *
 * Tot restul socotelii (preturi, extraoptiuni, `computeVat`) lucreaza intr-un
 * singur regim: ori totul cu TVA inclus, ori totul fara. Taxa trebuie adusa acolo
 * INAINTE de a intra in calcul, altfel ar fi singura suma din comanda care
 * inseamna altceva decat vecinele ei.
 *
 * Cand comerciantul si magazinul spun acelasi lucru, nu se converteste nimic.
 * Cand TVA-ul e oprit pe magazin, comutatorul n-are niciun inteles si suma trece
 * neatinsa.
 */
export function codFeeInStoreMode(
  value: number,
  amountIncludesVat: boolean,
  vat: { vat_enabled: boolean; vat_rate: number; prices_include_vat: boolean },
): number {
  if (!vat.vat_enabled) return value;
  if (amountIncludesVat === vat.prices_include_vat) return value;
  const rate = (Number(vat.vat_rate) || 0) / 100;
  return amountIncludesVat
    ? value / (1 + rate) // comerciantul a dat brut, magazinul lucreaza in net
    : value * (1 + rate); // comerciantul a dat net, magazinul lucreaza in brut
}

/**
 * Taxa de ramburs pentru o baza de marfa (subtotal + extraoptiuni, DUPA promotie
 * — niciodata transportul). Zero cand e oprita sau cand metoda nu e ramburs.
 *
 * Rezultatul e in regimul de preturi al magazinului, deci intra in baza de TVA
 * alaturi de marfa, exact ca extraoptiunile.
 *
 * Nu se plafoneaza la nimic: o taxa aduna, deci nu poate duce totalul sub zero —
 * spre deosebire de reduceri, care se plafoneaza tocmai ca sa nu-l duca.
 */
export function computeCodFee(
  config: CodFeeConfig,
  paymentMethod: string | null | undefined,
  goodsBase: number,
  vat: { vat_enabled: boolean; vat_rate: number; prices_include_vat: boolean },
): number {
  if (!config.enabled || config.value <= 0) return 0;
  if (!isCodPaymentMethod(paymentMethod)) return 0;
  if (config.type === "percent") {
    const base = Math.max(0, goodsBase);
    if (base <= 0) return 0;
    return Math.round(base * (config.value / 100) * 100) / 100;
  }
  return Math.round(codFeeInStoreMode(config.value, config.amount_includes_vat, vat) * 100) / 100;
}
