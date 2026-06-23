/**
 * Customers ("Clienti") — a CRM view derived from the orders table.
 *
 * Stores don't have a separate customers table: every order carries the buyer's
 * name/phone/email inline. We aggregate orders into unique customers so the same
 * person who ordered 5 times shows once, with their full history and stats.
 *
 * Matching key (dedup): the normalized phone number — it is required on every
 * order and is the most reliable identity in Romanian e-commerce. Email is a
 * fallback only when a phone is somehow missing. This means orders placed with
 * the same phone (even with a differently-typed name or email) merge into one
 * customer. Revenue/AOV exclude cancelled & refunded orders.
 */

/** Orders that don't represent real revenue (excluded from spend & AOV). */
const REVENUE_EXCLUDED = new Set(["cancelled", "refunded"]);

export interface CustomerOrderInput {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  shipping_address: unknown;
  total: number | string;
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  items: unknown;
}

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

export interface Customer {
  /** Stable dedup key (normalized phone, or email/id fallback). */
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
  orders: CustomerOrder[];
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

function countItems(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, it) => {
    const q = Number((it as { quantity?: unknown })?.quantity);
    return sum + (Number.isFinite(q) && q > 0 ? q : 1);
  }, 0);
}

function readAddress(shipping: unknown): { city: string | null; county: string | null; address: string | null } {
  const s = (shipping ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { city: str(s.city), county: str(s.county), address: str(s.address) };
}

/**
 * Aggregate a flat list of orders into deduplicated customers, each with their
 * order history and stats. Input order does not matter; output is sorted by most
 * recent order first.
 */
export function aggregateCustomers(orders: CustomerOrderInput[]): Customer[] {
  const map = new Map<string, Customer>();

  // Process oldest-first so "most recent value wins" for name/email/address.
  const sorted = orders
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (const o of sorted) {
    const phoneKey = normalizePhone(o.customer_phone);
    const emailKey = normalizeEmail(o.customer_email);
    const key = phoneKey || (emailKey ? `email:${emailKey}` : `order:${o.id}`);

    const total = Number(o.total) || 0;
    const isRevenue = !REVENUE_EXCLUDED.has(o.status);
    const addr = readAddress(o.shipping_address);
    const orderRow: CustomerOrder = {
      id: o.id,
      order_number: o.order_number,
      total,
      status: o.status,
      payment_method: o.payment_method,
      payment_status: o.payment_status,
      created_at: o.created_at,
      item_count: countItems(o.items),
    };

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        name: o.customer_name?.trim() || "Client",
        phone: o.customer_phone?.trim() || "",
        email: emailKey || null,
        city: addr.city,
        county: addr.county,
        address: addr.address,
        orderCount: 1,
        paidOrderCount: isRevenue ? 1 : 0,
        totalSpent: isRevenue ? total : 0,
        aov: 0,
        firstOrderAt: o.created_at,
        lastOrderAt: o.created_at,
        lastStatus: o.status,
        orders: [orderRow],
      });
    } else {
      // Latest order wins for contact/address (sorted oldest-first).
      if (o.customer_name?.trim()) existing.name = o.customer_name.trim();
      if (o.customer_phone?.trim()) existing.phone = o.customer_phone.trim();
      if (emailKey) existing.email = emailKey;
      if (addr.city) existing.city = addr.city;
      if (addr.county) existing.county = addr.county;
      if (addr.address) existing.address = addr.address;
      existing.orderCount += 1;
      if (isRevenue) {
        existing.paidOrderCount += 1;
        existing.totalSpent += total;
      }
      existing.lastOrderAt = o.created_at;
      existing.lastStatus = o.status;
      existing.orders.push(orderRow);
    }
  }

  const customers = [...map.values()];
  for (const c of customers) {
    c.aov = c.paidOrderCount > 0 ? c.totalSpent / c.paidOrderCount : 0;
    c.totalSpent = Math.round(c.totalSpent * 100) / 100;
    c.aov = Math.round(c.aov * 100) / 100;
    c.orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  customers.sort((a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime());
  return customers;
}

export function summarizeCustomers(customers: Customer[]): CustomersSummary {
  const totalCustomers = customers.length;
  const returningCustomers = customers.filter((c) => c.paidOrderCount > 1).length;
  const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
  const paidOrders = customers.reduce((s, c) => s + c.paidOrderCount, 0);
  return {
    totalCustomers,
    returningCustomers,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    averageOrderValue: paidOrders > 0 ? Math.round((totalRevenue / paidOrders) * 100) / 100 : 0,
  };
}
