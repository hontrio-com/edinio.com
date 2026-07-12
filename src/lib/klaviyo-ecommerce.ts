// Klaviyo E-commerce sync (server-only). Klaviyo's e-commerce model is event-based:
// a "Placed Order" event drives revenue attribution + purchase-based segmentation +
// post-purchase flows. Products are pushed to the Klaviyo Catalog (for product
// recommendations / retargeting). Carts stay on Edinio's abandoned-cart system.
// All calls best-effort. Docs: https://developers.klaviyo.com
import { klaviyoRequest, type KlaviyoConfig } from "@/lib/klaviyo";

export interface KlaviyoOrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  category?: string | null;
  url?: string;
  image_url?: string | null;
}

export interface KlaviyoOrderInput {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  total: number;
  time?: string;            // ISO 8601
  items: KlaviyoOrderItem[];
}

export interface KlaviyoCatalogProduct {
  id: string;
  title: string;
  description?: string | null;
  url: string;              // REQUIRED by Klaviyo
  image_url?: string | null;
  price: number;
}

/** Klaviyo composite catalog-item id used in GET/PATCH/DELETE. */
export function catalogItemId(externalId: string): string {
  return `$custom:::$default:::${externalId}`;
}

/**
 * Send a "Placed Order" event (POST /events, 202). Idempotent via `unique_id` = order id
 * (Klaviyo dedupes on profile+metric+unique_id). The `value` attribute becomes $value
 * (revenue). Creates/updates the profile from the event's profile object.
 */
export async function trackPlacedOrder(
  config: KlaviyoConfig,
  order: KlaviyoOrderInput,
): Promise<{ ok: true } | { error: string }> {
  const items = order.items;
  const properties: Record<string, unknown> = {
    OrderId: order.id,
    ItemNames: items.map((i) => i.name),
    Categories: Array.from(new Set(items.map((i) => i.category).filter((c): c is string => !!c))),
    Items: items.map((i) => ({
      ProductID: i.product_id,
      ProductName: i.name,
      Quantity: i.quantity,
      ItemPrice: i.price,
      RowTotal: Math.round(i.price * i.quantity * 100) / 100,
      ...(i.url ? { ProductURL: i.url } : {}),
      ...(i.image_url ? { ImageURL: i.image_url } : {}),
    })),
  };

  const profileAttrs: Record<string, unknown> = { email: order.email };
  if (order.first_name) profileAttrs.first_name = order.first_name;
  if (order.last_name) profileAttrs.last_name = order.last_name;

  const body = {
    data: {
      type: "event",
      attributes: {
        metric: { data: { type: "metric", attributes: { name: "Placed Order" } } },
        profile: { data: { type: "profile", attributes: profileAttrs } },
        properties,
        value: order.total,
        unique_id: String(order.id),
        time: order.time ?? new Date().toISOString(),
      },
    },
  };
  const res = await klaviyoRequest(config, "POST", "/events/", body);
  if ("error" in res) return res;
  return { ok: true };
}

function updatableAttributes(p: KlaviyoCatalogProduct): Record<string, unknown> {
  return {
    title: p.title || "Produs",
    // description + url are REQUIRED by Klaviyo — default description to the title.
    description: (p.description && p.description.trim()) || p.title || "Produs",
    url: p.url,
    ...(p.image_url ? { image_full_url: p.image_url } : {}),
    price: p.price,
    published: true,
  };
}

/**
 * Upsert a catalog item: POST to create; on 409 (already exists) PATCH by composite id.
 * Skips silently if we have no url (Klaviyo requires one).
 */
export async function upsertCatalogItem(
  config: KlaviyoConfig,
  p: KlaviyoCatalogProduct,
): Promise<{ ok: true } | { error: string }> {
  if (!p.url) return { ok: true };

  const create = await klaviyoRequest(config, "POST", "/catalog-items/", {
    data: {
      type: "catalog-item",
      attributes: {
        external_id: String(p.id),
        integration_type: "$custom",
        catalog_type: "$default",
        ...updatableAttributes(p),
      },
    },
  });
  if (!("error" in create)) return { ok: true };

  const id = catalogItemId(String(p.id));
  const patch = await klaviyoRequest(config, "PATCH", `/catalog-items/${encodeURIComponent(id)}`, {
    data: { type: "catalog-item", id, attributes: updatableAttributes(p) },
  });
  if ("error" in patch) return create; // report the original create error
  return { ok: true };
}

export async function deleteCatalogItem(config: KlaviyoConfig, externalId: string): Promise<void> {
  await klaviyoRequest(config, "DELETE", `/catalog-items/${encodeURIComponent(catalogItemId(String(externalId)))}`);
}
