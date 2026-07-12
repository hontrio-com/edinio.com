// Server-side dispatcher: sync one contact / order / product into the merchant's Klaviyo
// account when the integration is connected and the source is enabled. Always
// fire-and-forget — it must never break the order/popup/form flow it is called from.
//
// Klaviyo specifics vs Brevo: a subscriber needs TWO calls (upsert profile for
// properties + subscribe job for consent); e-commerce is a "Placed Order" event +
// catalog items (no order status / mark-paid); unsubscribes are enforced by Klaviyo
// server-side (no local suppression table).

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { upsertProfile, subscribeProfiles, splitName, type KlaviyoConfig } from "@/lib/klaviyo";
import { trackPlacedOrder, upsertCatalogItem, deleteCatalogItem } from "@/lib/klaviyo-ecommerce";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com";

export type KlaviyoSource = "checkout" | "popup" | "forms";

const SOURCE_LABEL: Record<KlaviyoSource, string> = {
  checkout: "Checkout",
  popup: "Popup",
  forms: "Formular",
};

/** Coarse order-value bucket used as the Klaviyo "Order Value" segmentation property. */
export function orderValueBucket(total: number): string {
  if (total < 100) return "Sub 100 lei";
  if (total < 250) return "100-250 lei";
  if (total < 500) return "250-500 lei";
  return "Peste 500 lei";
}

async function readConfig(businessId: string): Promise<KlaviyoConfig | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_settings").select("klaviyo_config").eq("business_id", businessId).single();
  return (data?.klaviyo_config as KlaviyoConfig | null) ?? null;
}

/**
 * Sync a contact into Klaviyo for a given source: upsert the profile (name + segmentation
 * properties) then subscribe it to the list with email-marketing consent. No-op unless the
 * store connected Klaviyo, chose a list, and left the source enabled. The caller is
 * responsible for consent (a checked opt-in box at checkout). The subscribe respects
 * Klaviyo's server-side suppression — unsubscribed contacts are never resurrected.
 */
export async function maybeSyncKlaviyoSubscriber(opts: {
  businessId: string;
  source: KlaviyoSource;
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

    const { fname, lname } = splitName(opts.name);
    const up = await upsertProfile(config, {
      email,
      fname,
      lname,
      phone: opts.phone ?? undefined,
      source: SOURCE_LABEL[opts.source],
      county: opts.county ?? undefined,
      order_value: opts.orderValue != null ? orderValueBucket(opts.orderValue) : undefined,
    });
    if ("error" in up) {
      await logError({ action: "klaviyo.sync.profile", message: up.error, businessId: opts.businessId, details: { source: opts.source }, severity: "warning" });
    }

    const sub = await subscribeProfiles(config, [email]);
    if ("error" in sub) {
      await logError({ action: "klaviyo.sync.subscribe", message: sub.error, businessId: opts.businessId, details: { source: opts.source }, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "klaviyo.sync", message: (e as Error)?.message ?? "Klaviyo sync failed", businessId: opts.businessId, details: { source: opts.source }, severity: "warning" });
  }
}

type OrderItem = { product_id: string; name: string; price: number; quantity: number; category?: string | null; slug?: string | null; image?: string | null };

/**
 * Send a "Placed Order" event to Klaviyo (revenue + purchase-based segmentation + flows).
 * No-op unless e-commerce sync is on. Fires at order creation (COD + online alike).
 */
export async function maybeTrackKlaviyoOrder(opts: {
  businessId: string;
  storeUrl?: string;
  order: {
    id: string;
    email: string | null | undefined;
    name?: string | null;
    total: number;
    createdAt?: string;
    items: OrderItem[];
  };
}): Promise<void> {
  try {
    const email = (opts.order.email ?? "").trim();
    if (!email || opts.order.items.length === 0) return;

    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;

    const { fname, lname } = splitName(opts.order.name);
    const res = await trackPlacedOrder(config, {
      id: opts.order.id,
      email,
      first_name: fname,
      last_name: lname,
      total: opts.order.total,
      time: opts.order.createdAt,
      items: opts.order.items
        .filter((i) => !String(i.product_id).startsWith("extra_"))
        .map((i) => ({
          product_id: i.product_id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          category: i.category ?? null,
          url: opts.storeUrl && i.slug ? `${opts.storeUrl}/product/${i.slug}` : undefined,
          image_url: i.image ?? null,
        })),
    });
    if ("error" in res) {
      await logError({ action: "klaviyo.ecommerce.order", message: res.error, businessId: opts.businessId, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "klaviyo.ecommerce.order", message: (e as Error)?.message ?? "order track failed", businessId: opts.businessId, severity: "warning" });
  }
}

async function storeBaseUrl(businessId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("slug").eq("id", businessId).single();
  return biz?.slug ? `${SITE_URL}/${biz.slug}` : null;
}

/** Sync a product create/update/delete to the Klaviyo catalog. No-op unless e-commerce sync is on. */
export async function maybeSyncKlaviyoProduct(opts: {
  businessId: string;
  action: "upsert" | "delete";
  product: { id: string; name: string; price: number; slug?: string | null; image?: string | null; description?: string | null };
}): Promise<void> {
  try {
    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;

    if (opts.action === "delete") {
      await deleteCatalogItem(config, opts.product.id);
      return;
    }
    const base = await storeBaseUrl(opts.businessId);
    const res = await upsertCatalogItem(config, {
      id: opts.product.id,
      title: opts.product.name,
      description: opts.product.description ?? null,
      price: opts.product.price,
      url: base && opts.product.slug ? `${base}/product/${opts.product.slug}` : "",
      image_url: opts.product.image ?? null,
    });
    if ("error" in res) {
      await logError({ action: "klaviyo.ecommerce.product", message: res.error, businessId: opts.businessId, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "klaviyo.ecommerce.product", message: (e as Error)?.message ?? "product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}

/** Bulk catalog sync (upsert or delete a set of ids). No-op unless e-commerce sync is on. */
export async function maybeSyncKlaviyoProductsBulk(opts: {
  businessId: string;
  ids: string[];
  action: "upsert" | "delete";
}): Promise<void> {
  try {
    if (opts.ids.length === 0) return;
    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;

    if (opts.action === "delete") {
      for (const id of opts.ids) await deleteCatalogItem(config, id);
      return;
    }

    const admin = createAdminClient();
    const base = await storeBaseUrl(opts.businessId);
    const { data: products } = await admin
      .from("products").select("id, name, price, images, slug, description").eq("business_id", opts.businessId).in("id", opts.ids);
    for (const p of products ?? []) {
      const img = Array.isArray(p.images) ? (p.images as unknown[])[0] : null;
      const res = await upsertCatalogItem(config, {
        id: p.id,
        title: p.name,
        description: p.description ?? null,
        price: Number(p.price) || 0,
        url: base && p.slug ? `${base}/product/${p.slug}` : "",
        image_url: typeof img === "string" ? img : null,
      });
      if ("error" in res) {
        await logError({ action: "klaviyo.ecommerce.product.bulk", message: res.error, businessId: opts.businessId, severity: "warning" });
        break; // usually a config/connection issue — stop hammering
      }
    }
  } catch (e) {
    await logError({ action: "klaviyo.ecommerce.product.bulk", message: (e as Error)?.message ?? "bulk product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}
