// Server-side dispatcher: sync one contact / order / product into the merchant's Brevo
// account when the integration is connected and the source is enabled. Always
// fire-and-forget — it must never break the order/popup/form flow it is called from.

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { upsertContact, splitName, type BrevoConfig } from "@/lib/brevo";
import { syncOrder, upsertProduct, deleteProduct, brevoStoreId, type BrevoEcomProduct } from "@/lib/brevo-ecommerce";

export type BrevoSource = "checkout" | "popup" | "forms";

const SOURCE_LABEL: Record<BrevoSource, string> = {
  checkout: "Checkout",
  popup: "Popup",
  forms: "Formular",
};

/** Coarse order-value bucket used as the Brevo ORDER_VALUE segmentation attribute. */
export function orderValueBucket(total: number): string {
  if (total < 100) return "Sub 100 lei";
  if (total < 250) return "100-250 lei";
  if (total < 500) return "250-500 lei";
  return "Peste 500 lei";
}

async function readConfig(businessId: string): Promise<BrevoConfig | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_settings").select("brevo_config").eq("business_id", businessId).single();
  return (data?.brevo_config as BrevoConfig | null) ?? null;
}

/**
 * Upsert a contact into Brevo for a given source. No-op (silent) unless the store
 * connected Brevo, selected a list, and left the source enabled. The caller is
 * responsible for consent (e.g. a checked opt-in box at checkout).
 */
export async function maybeSyncBrevoSubscriber(opts: {
  businessId: string;
  source: BrevoSource;
  email: string | null | undefined;
  name?: string | null;
  phone?: string | null;
  county?: string | null;
  orderValue?: number | null;
}): Promise<void> {
  try {
    const email = (opts.email ?? "").trim();
    if (!email) return;

    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.list_id) return;
    if (config.sources && config.sources[opts.source] === false) return;

    // Skip contacts who unsubscribed (belt-and-suspenders on never sending emailBlacklisted:false).
    const admin = createAdminClient();
    const { data: sup } = await admin
      .from("brevo_suppressions").select("id").eq("business_id", opts.businessId).eq("email", email.toLowerCase()).limit(1);
    if (sup && sup.length > 0) return;

    const { fname, lname } = splitName(opts.name);
    const res = await upsertContact(config, {
      email,
      fname,
      lname,
      phone: opts.phone ?? undefined,
      source: SOURCE_LABEL[opts.source],
      county: opts.county ?? undefined,
      order_value: opts.orderValue != null ? orderValueBucket(opts.orderValue) : undefined,
    });
    if ("error" in res) {
      await logError({ action: "brevo.sync", message: res.error, businessId: opts.businessId, details: { source: opts.source }, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "brevo.sync", message: (e as Error)?.message ?? "Brevo sync failed", businessId: opts.businessId, details: { source: opts.source }, severity: "warning" });
  }
}

type OrderItem = { product_id: string; name: string; price: number; quantity: number; slug?: string | null; image?: string | null };

function toLines(items: OrderItem[], storeUrl?: string) {
  return items
    .filter((i) => !String(i.product_id).startsWith("extra_"))
    .map((i) => ({
      product: {
        id: i.product_id,
        name: i.name,
        price: i.price,
        url: storeUrl && i.slug ? `${storeUrl}/product/${i.slug}` : undefined,
        image_url: i.image ?? null,
      } as BrevoEcomProduct,
      quantity: i.quantity,
      price: i.price,
    }));
}

/**
 * Sync a placed order to Brevo (revenue attribution + purchase-based segmentation +
 * product retargeting). No-op unless e-commerce sync is on. Fire-and-forget.
 */
export async function maybeSyncBrevoOrder(opts: {
  businessId: string;
  storeUrl?: string;
  order: {
    id: string;
    email: string | null | undefined;
    total: number;
    status?: string;      // "pending" | "paid"
    createdAt?: string;
    items: OrderItem[];
  };
}): Promise<void> {
  try {
    const email = (opts.order.email ?? "").trim();
    if (!email || opts.order.items.length === 0) return;

    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;

    const res = await syncOrder(config, {
      id: opts.order.id,
      email,
      status: opts.order.status ?? "pending",
      amount: opts.order.total,
      created_at: opts.order.createdAt,
      lines: toLines(opts.order.items, opts.storeUrl),
    }, brevoStoreId(opts.businessId));
    if ("error" in res) {
      await logError({ action: "brevo.ecommerce.order", message: res.error, businessId: opts.businessId, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "brevo.ecommerce.order", message: (e as Error)?.message ?? "order sync failed", businessId: opts.businessId, severity: "warning" });
  }
}

/** Sync a product create/update/delete to Brevo. No-op unless e-commerce sync is on. */
export async function maybeSyncBrevoProduct(opts: {
  businessId: string;
  action: "upsert" | "delete";
  product: { id: string; name: string; price: number; slug?: string | null; image?: string | null };
  storeUrl?: string;
}): Promise<void> {
  try {
    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;

    if (opts.action === "delete") {
      await deleteProduct(config, opts.product.id);
      return;
    }
    const res = await upsertProduct(config, {
      id: opts.product.id,
      name: opts.product.name,
      price: opts.product.price,
      url: opts.storeUrl && opts.product.slug ? `${opts.storeUrl}/product/${opts.product.slug}` : undefined,
      image_url: opts.product.image ?? null,
    });
    if ("error" in res) {
      await logError({ action: "brevo.ecommerce.product", message: res.error, businessId: opts.businessId, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "brevo.ecommerce.product", message: (e as Error)?.message ?? "product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}

/**
 * Mark a Brevo order as paid when an online payment confirms. Brevo has no order PATCH,
 * so we re-post the order (upsert by id) with status "paid" — rebuilt from the DB row.
 * Fetches its own business/config. Best-effort — never breaks the payment flow.
 */
export async function maybeMarkBrevoOrderPaid(orderId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: order } = await admin
      .from("orders").select("business_id, customer_email, total, items, created_at").eq("id", orderId).single();
    if (!order?.customer_email) return;

    const config = await readConfig(order.business_id);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;

    const items = (Array.isArray(order.items) ? order.items : []) as OrderItem[];
    if (items.length === 0) return;

    await syncOrder(config, {
      id: orderId,
      email: order.customer_email,
      status: "paid",
      amount: Number(order.total) || 0,
      created_at: order.created_at ?? undefined,
      lines: toLines(items),
    }, brevoStoreId(order.business_id));
  } catch {
    /* best-effort — never breaks the payment flow */
  }
}

/** Bulk product sync (upsert or delete a set of ids). No-op unless e-commerce sync is on. */
export async function maybeSyncBrevoProductsBulk(opts: {
  businessId: string;
  ids: string[];
  action: "upsert" | "delete";
}): Promise<void> {
  try {
    if (opts.ids.length === 0) return;
    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;

    if (opts.action === "delete") {
      for (const id of opts.ids) await deleteProduct(config, id);
      return;
    }

    const admin = createAdminClient();
    const { data: products } = await admin
      .from("products").select("id, name, price, images").eq("business_id", opts.businessId).in("id", opts.ids);
    for (const p of products ?? []) {
      const img = Array.isArray(p.images) ? (p.images as unknown[])[0] : null;
      const res = await upsertProduct(config, {
        id: p.id, name: p.name, price: Number(p.price) || 0,
        image_url: typeof img === "string" ? img : null,
      });
      if ("error" in res) {
        await logError({ action: "brevo.ecommerce.product.bulk", message: res.error, businessId: opts.businessId, severity: "warning" });
        break; // usually a config/connection issue — stop hammering
      }
    }
  } catch (e) {
    await logError({ action: "brevo.ecommerce.product.bulk", message: (e as Error)?.message ?? "bulk product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}
