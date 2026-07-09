// Server-side dispatcher: sync one subscriber into the merchant's Mailchimp audience
// when the integration is connected and the source is enabled. Always fire-and-forget
// — it must never break the order/popup/form flow it is called from.

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { upsertMember, splitName, type MailchimpConfig } from "@/lib/mailchimp";
import { ensureStore, upsertProduct, deleteProduct, syncOrder, setOrderFinancialStatus, mailchimpStoreId, type EcomProduct } from "@/lib/mailchimp-ecommerce";

export type MailchimpSource = "checkout" | "popup" | "forms";

const SOURCE_TAG: Record<MailchimpSource, string> = {
  checkout: "Checkout",
  popup: "Popup",
  forms: "Formular",
};

/** Coarse order-value bucket used as a Mailchimp segmentation tag. */
export function orderValueTag(total: number): string {
  if (total < 100) return "Sub 100 lei";
  if (total < 250) return "100-250 lei";
  if (total < 500) return "250-500 lei";
  return "Peste 500 lei";
}

/**
 * Upsert a subscriber into Mailchimp for a given source. No-op (silent) unless the
 * store connected Mailchimp, selected an audience, and left the source enabled.
 * The caller is responsible for consent (e.g. a checked opt-in box at checkout).
 */
export async function maybeSyncMailchimpSubscriber(opts: {
  businessId: string;
  source: MailchimpSource;
  email: string | null | undefined;
  name?: string | null;
  phone?: string | null;
  tags?: string[];
  language?: string;
}): Promise<void> {
  try {
    const email = (opts.email ?? "").trim();
    if (!email) return;

    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("store_settings")
      .select("mailchimp_config")
      .eq("business_id", opts.businessId)
      .single();

    const config = settings?.mailchimp_config as MailchimpConfig | null;
    if (!config?.enabled || !config.api_key || !config.audience_id) return;
    // Per-source opt-out (undefined = enabled, for backward compatibility).
    if (config.sources && config.sources[opts.source] === false) return;

    // Skip contacts who unsubscribed / were cleaned (belt-and-suspenders on status_if_new).
    const { data: sup } = await admin
      .from("mailchimp_suppressions")
      .select("id")
      .eq("business_id", opts.businessId)
      .eq("email", email.toLowerCase())
      .limit(1);
    if (sup && sup.length > 0) return;

    const { fname, lname } = splitName(opts.name);
    const tags = [...(opts.tags ?? []), SOURCE_TAG[opts.source]].filter(Boolean);

    const res = await upsertMember(config, {
      email,
      fname,
      lname,
      phone: opts.phone ?? undefined,
      tags,
      language: opts.language,
    });
    if ("error" in res) {
      await logError({
        action: "mailchimp.sync",
        message: res.error,
        businessId: opts.businessId,
        details: { source: opts.source },
        severity: "warning",
      });
    }
  } catch (e) {
    await logError({
      action: "mailchimp.sync",
      message: (e as Error)?.message ?? "Mailchimp sync failed",
      businessId: opts.businessId,
      details: { source: opts.source },
      severity: "warning",
    });
  }
}

/**
 * Sync a placed order to the Mailchimp e-commerce store (revenue attribution +
 * purchase-based segmentation + product retargeting). No-op unless e-commerce sync
 * is on and a store exists. Fire-and-forget — never breaks the order flow.
 */
export async function maybeSyncMailchimpOrder(opts: {
  businessId: string;
  storeName: string;
  storeUrl?: string;
  storeDomain?: string;
  storeEmail?: string;
  order: {
    id: string;
    email: string | null | undefined;
    name?: string | null;
    currency: string;
    total: number;
    financial_status?: string;
    items: Array<{ product_id: string; name: string; price: number; quantity: number; slug?: string | null; image?: string | null }>;
  };
}): Promise<void> {
  try {
    const email = (opts.order.email ?? "").trim();
    if (!email || opts.order.items.length === 0) return;

    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("store_settings").select("mailchimp_config").eq("business_id", opts.businessId).single();
    const config = settings?.mailchimp_config as MailchimpConfig | null;
    if (!config?.enabled || !config.api_key || !config.audience_id || !config.ecommerce_sync) return;

    const storeId = config.ecommerce_store_id ?? mailchimpStoreId(opts.businessId);
    if (!config.ecommerce_store_id) {
      // Store not created yet (sync enabled without a save) — create it defensively.
      const s = await ensureStore(config, opts.businessId, { name: opts.storeName, currency: opts.order.currency, domain: opts.storeDomain, email: opts.storeEmail });
      if ("error" in s) return;
    }

    const { fname, lname } = splitName(opts.order.name);
    const res = await syncOrder(config, storeId, {
      id: opts.order.id,
      email,
      first_name: fname,
      last_name: lname,
      currency_code: opts.order.currency,
      total: opts.order.total,
      financial_status: opts.order.financial_status,
      processed_at: new Date().toISOString(),
      lines: opts.order.items.map((it) => ({
        product: {
          id: it.product_id,
          title: it.name,
          url: opts.storeUrl && it.slug ? `${opts.storeUrl}/product/${it.slug}` : undefined,
          image_url: it.image ?? null,
          price: it.price,
        } as EcomProduct,
        quantity: it.quantity,
        price: it.price,
      })),
    });
    if ("error" in res) {
      await logError({ action: "mailchimp.ecommerce.order", message: res.error, businessId: opts.businessId, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "mailchimp.ecommerce.order", message: (e as Error)?.message ?? "order sync failed", businessId: opts.businessId, severity: "warning" });
  }
}

/** Sync a product create/update/delete to the Mailchimp store. No-op unless e-commerce sync is on. */
export async function maybeSyncMailchimpProduct(opts: {
  businessId: string;
  action: "upsert" | "delete";
  product: { id: string; name: string; price: number; slug?: string | null; image?: string | null };
  storeUrl?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("store_settings").select("mailchimp_config").eq("business_id", opts.businessId).single();
    const config = settings?.mailchimp_config as MailchimpConfig | null;
    if (!config?.enabled || !config.api_key || !config.audience_id || !config.ecommerce_sync || !config.ecommerce_store_id) return;
    const storeId = config.ecommerce_store_id;

    if (opts.action === "delete") {
      await deleteProduct(config, storeId, opts.product.id);
      return;
    }
    const res = await upsertProduct(config, storeId, {
      id: opts.product.id,
      title: opts.product.name,
      url: opts.storeUrl && opts.product.slug ? `${opts.storeUrl}/product/${opts.product.slug}` : undefined,
      image_url: opts.product.image ?? null,
      price: opts.product.price,
    });
    if ("error" in res) {
      await logError({ action: "mailchimp.ecommerce.product", message: res.error, businessId: opts.businessId, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "mailchimp.ecommerce.product", message: (e as Error)?.message ?? "product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}

/** Mark a Mailchimp e-commerce order as paid (called when online payment confirms). Fetches its own business/config. */
export async function maybeMarkMailchimpOrderPaid(orderId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: order } = await admin.from("orders").select("business_id").eq("id", orderId).single();
    if (!order) return;
    const { data: settings } = await admin
      .from("store_settings").select("mailchimp_config").eq("business_id", order.business_id).single();
    const config = settings?.mailchimp_config as MailchimpConfig | null;
    if (!config?.enabled || !config.api_key || !config.audience_id || !config.ecommerce_sync || !config.ecommerce_store_id) return;
    await setOrderFinancialStatus(config, config.ecommerce_store_id, orderId, "paid");
  } catch {
    /* best-effort — never breaks the payment flow */
  }
}

/** Bulk product sync (upsert or delete a set of ids). No-op unless e-commerce sync is on. */
export async function maybeSyncMailchimpProductsBulk(opts: {
  businessId: string;
  ids: string[];
  action: "upsert" | "delete";
}): Promise<void> {
  try {
    if (opts.ids.length === 0) return;
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("store_settings").select("mailchimp_config").eq("business_id", opts.businessId).single();
    const config = settings?.mailchimp_config as MailchimpConfig | null;
    if (!config?.enabled || !config.api_key || !config.audience_id || !config.ecommerce_sync || !config.ecommerce_store_id) return;
    const storeId = config.ecommerce_store_id;

    if (opts.action === "delete") {
      for (const id of opts.ids) await deleteProduct(config, storeId, id);
      return;
    }

    // Upsert: pull current product data for the affected ids.
    const { data: products } = await admin
      .from("products").select("id, name, price, images").eq("business_id", opts.businessId).in("id", opts.ids);
    for (const p of products ?? []) {
      const img = Array.isArray(p.images) ? (p.images as unknown[])[0] : null;
      const res = await upsertProduct(config, storeId, {
        id: p.id, title: p.name, price: Number(p.price) || 0,
        image_url: typeof img === "string" ? img : null,
      });
      if ("error" in res) {
        await logError({ action: "mailchimp.ecommerce.product.bulk", message: res.error, businessId: opts.businessId, severity: "warning" });
        break; // an error here is usually a config/connection issue — stop hammering
      }
    }
  } catch (e) {
    await logError({ action: "mailchimp.ecommerce.product.bulk", message: (e as Error)?.message ?? "bulk product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}
