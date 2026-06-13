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

export type PaymentMethodType = "cash_on_delivery" | "netopia" | "stripe" | "ipay";

export const PAYMENT_PROCESSOR_TYPES = ["netopia", "stripe", "ipay"] as const;
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
