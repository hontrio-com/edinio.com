/**
 * Customers ("Clienti") — a CRM view derived from the orders table.
 *
 * Stores don't have a separate customers table: every order carries the buyer's
 * name/phone/email inline, and unique customers are AGGREGATED IN POSTGRES so
 * the numbers stay correct at any order volume — PostgREST silently caps every
 * response at 1000 rows, so aggregating fetched orders in JS breaks past that.
 * See the SQL functions `customers_aggregate`, `customers_summary` and
 * `customer_orders` (migration `orders_scale_rpcs`); this module keeps only the
 * shared types and the phone/email normalizers.
 *
 * Matching key (dedup): the normalized phone number — it is required on every
 * order and is the most reliable identity in Romanian e-commerce. Email is a
 * fallback only when a phone is somehow missing. Revenue/AOV exclude
 * cancelled & refunded orders.
 */

/** One order row in a customer's history (modal), computed by `customer_orders`. */
export interface CustomerOrder {
  id: string;
  order_number: string;
  total: number;
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  item_count: number;
}

/** One aggregated customer, computed by `customers_aggregate`. */
export interface Customer {
  /** Stable dedup key (normalized phone, or email/order fallback). */
  key: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  county: string | null;
  address: string | null;
  /** All orders, incl. cancelled/refunded. */
  orderCount: number;
  /** Orders that count as revenue (excl. cancelled/refunded). */
  paidOrderCount: number;
  /** Sum of totals over revenue orders. */
  totalSpent: number;
  /** totalSpent / paidOrderCount (0 if none). */
  aov: number;
  firstOrderAt: string;
  lastOrderAt: string;
  lastStatus: string;
}

export interface CustomersSummary {
  totalCustomers: number;
  returningCustomers: number;
  totalRevenue: number;
  averageOrderValue: number;
}

/**
 * Normalize a Romanian phone number to its core digits so equivalent formats
 * (+40 7xx, 0040 7xx, 07xx, with spaces/dashes) collapse to the same key.
 * MUST stay in sync with the SQL mirror `public.normalize_phone` — the dedup
 * key and the phone search in `customers_aggregate` are computed there.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/\D/g, ""); // digits only
  if (d.startsWith("0040")) d = d.slice(4);
  else if (d.startsWith("40") && d.length > 9) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}
