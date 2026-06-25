// Single source of truth for order-status presentation (label + badge styling).
// Previously this 7-status map was copy-pasted into dashboard/page.tsx,
// OrdersClient.tsx and OrderDetailClient.tsx. Order status is a domain scale
// that genuinely needs distinct hues for scannability, so we keep seven colors
// — but in ONE place, using the soft `/10` fill idiom and semantic tokens where
// they map cleanly (warning/info/success/destructive). Purple/indigo are the
// two intentional workflow exceptions (no semantic token fits "processing"/
// "shipped").

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export const ORDER_STATUS: Record<OrderStatus, { label: string; className: string }> = {
  pending:    { label: "In asteptare", className: "bg-warning/10 text-warning" },
  confirmed:  { label: "Confirmat",    className: "bg-info/10 text-info" },
  processing: { label: "In procesare", className: "bg-purple-500/10 text-purple-600" },
  shipped:    { label: "Expediat",     className: "bg-indigo-500/10 text-indigo-600" },
  delivered:  { label: "Livrat",       className: "bg-success/10 text-success" },
  cancelled:  { label: "Anulat",       className: "bg-destructive/10 text-destructive" },
  refunded:   { label: "Rambursat",    className: "bg-muted text-muted-foreground" },
};

export function orderStatus(status: string): { label: string; className: string } {
  return ORDER_STATUS[status as OrderStatus] ?? ORDER_STATUS.pending;
}
