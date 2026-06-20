// Shared model for automatic invoicing across all invoicing providers
// (SmartBill, Oblio, fGO). Each provider stores its own `auto_invoice` +
// `auto_invoice_trigger` in its config; the dispatcher
// (src/lib/actions/invoice-auto.actions.ts) issues with at most one provider per
// order, in priority order, guaranteeing a single automatic invoice.

export type AutoInvoiceTrigger = "confirmed" | "processing" | "shipped" | "delivered" | "paid";

/** Trigger options shown in every provider's config UI. */
export const AUTO_INVOICE_TRIGGERS: { value: AutoInvoiceTrigger; label: string }[] = [
  { value: "confirmed", label: "Comanda Confirmata" },
  { value: "processing", label: "In procesare" },
  { value: "shipped", label: "Expediata" },
  { value: "delivered", label: "Livrata" },
  { value: "paid", label: "Platita (status plata)" },
];

/**
 * Does an order-update fire the auto-invoice trigger? "paid" watches the payment
 * status; every other trigger watches the order status. `newStatus` /
 * `newPaymentStatus` are the values from the current update (may be undefined when
 * that field isn't being changed).
 */
export function autoInvoiceTriggerMatches(
  trigger: AutoInvoiceTrigger | undefined,
  newStatus: string | undefined,
  newPaymentStatus: string | undefined,
): boolean {
  if (!trigger) return false;
  if (trigger === "paid") return newPaymentStatus === "paid";
  return newStatus === trigger;
}
