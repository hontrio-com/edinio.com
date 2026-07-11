// Brevo E-commerce sync (server-only). Pushes products + orders to the merchant's
// Brevo account so they get, inside Brevo: revenue attribution, purchase-based
// segmentation and product retargeting. Carts stay on Edinio's own abandoned-cart
// system (not mirrored). All calls are best-effort.
//
// Unlike Mailchimp there is NO "store" object to create — Brevo exposes account-level
// endpoints: POST /v3/orders/status (upsert by id) and POST /v3/products(/batch).
// `storeId` is an optional namespacing tag on orders.
import { brevoRequest, type BrevoConfig } from "@/lib/brevo";

export interface BrevoEcomProduct {
  id: string;
  name: string;
  url?: string;
  image_url?: string | null;
  price: number;
  sku?: string;
}

export interface BrevoEcomOrderInput {
  id: string;
  email: string;
  status: string;            // "pending" | "paid" | ...
  amount: number;
  created_at?: string;       // ISO 8601
  updated_at?: string;       // ISO 8601
  coupons?: string[];
  lines: Array<{ product: BrevoEcomProduct; quantity: number; price: number }>;
}

export function brevoStoreId(businessId: string): string {
  return `edinio_${businessId}`;
}

function productBody(p: BrevoEcomProduct): Record<string, unknown> {
  return {
    id: String(p.id),
    name: p.name || "Produs",
    ...(p.url ? { url: p.url } : {}),
    ...(p.image_url ? { imageUrl: p.image_url } : {}),
    ...(p.sku ? { sku: p.sku } : {}),
    price: p.price,
  };
}

/** Upsert a single product (POST /v3/products upserts by id). */
export async function upsertProduct(config: BrevoConfig, p: BrevoEcomProduct): Promise<{ ok: true } | { error: string }> {
  const res = await brevoRequest(config, "POST", "/products", productBody(p));
  if ("error" in res) return res;
  return { ok: true };
}

/** Upsert many products in one call (POST /v3/products/batch, chunked at 200). */
export async function batchProducts(config: BrevoConfig, products: BrevoEcomProduct[]): Promise<{ ok: true } | { error: string }> {
  const CHUNK = 200;
  for (let i = 0; i < products.length; i += CHUNK) {
    const res = await brevoRequest(config, "POST", "/products/batch", { products: products.slice(i, i + CHUNK).map(productBody) });
    if ("error" in res) return res;
  }
  return { ok: true };
}

export async function deleteProduct(config: BrevoConfig, productId: string): Promise<void> {
  await brevoRequest(config, "DELETE", `/products/${encodeURIComponent(String(productId))}`);
}

/**
 * Sync an order (POST /v3/orders/status — an upsert by id; re-posting with a new
 * status updates it). Line products are upserted first (best-effort) so the catalog
 * has the purchased items for retargeting. The order links to the contact via
 * identifiers.email_id — this does NOT subscribe them (consent is handled separately).
 */
export async function syncOrder(
  config: BrevoConfig,
  order: BrevoEcomOrderInput,
  storeId?: string,
): Promise<{ ok: true } | { error: string }> {
  for (const line of order.lines) {
    await upsertProduct(config, line.product); // best-effort; ignore per-product failure
  }

  const now = new Date().toISOString();
  const res = await brevoRequest(config, "POST", "/orders/status", {
    id: String(order.id),
    createdAt: order.created_at ?? now,
    updatedAt: order.updated_at ?? now,
    status: order.status,
    amount: order.amount,
    ...(storeId ? { storeId } : {}),
    identifiers: { email_id: order.email },
    products: order.lines.map((l) => ({
      productId: String(l.product.id),
      quantity: l.quantity,
      price: l.price,
    })),
    ...(order.coupons?.length ? { coupons: order.coupons } : {}),
  });
  if ("error" in res) return res;
  return { ok: true };
}
