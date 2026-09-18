// Brevo E-commerce sync (server-only). Pushes products + orders to the merchant's
// Brevo account so they get, inside Brevo: revenue attribution, purchase-based
// segmentation and product retargeting. Carts stay on Edinio's own abandoned-cart
// system (not mirrored). All calls are best-effort.
//
// Unlike Mailchimp there is NO "store" object to create — Brevo exposes account-level
// endpoints: POST /v3/orders/status (upsert by id) and POST /v3/products(/batch).
// `storeId` is an optional namespacing tag on orders.
//
// ⚠⚠ `POST /v3/products` NU E UPSERT DE LA SINE. Specul: „When `updateEnabled` is `false`
// (the default), the endpoint inserts a new product and returns `201`; if the product ID
// already exists, a `400` error is returned.” Pana pe 18.09.2026 nu trimiteam niciodata
// `updateEnabled`, deci dupa prima creare catalogul Brevo nu mai primea NICIO schimbare de
// nume, pret sau imagine, iar comentariul de aici spunea „upserts by id”.
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
  status: string;            // "pending" | "paid" | "cancelled" | "refunded"
  amount: number;
  created_at?: string;       // ISO 8601
  updated_at?: string;       // ISO 8601
  coupons?: string[];
  lines: Array<{ product: BrevoEcomProduct; quantity: number; price: number }>;
}

type Rezultat = { ok: true } | { error: string; status?: number };

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

/** Upsert a single product from the CATALOG (the source of truth): `updateEnabled: true`. */
export async function upsertProduct(config: BrevoConfig, p: BrevoEcomProduct): Promise<Rezultat> {
  const res = await brevoRequest(config, "POST", "/products", { ...productBody(p), updateEnabled: true });
  if ("error" in res) return res;
  return { ok: true };
}

/**
 * Creeaza produsul numai daca LIPSESTE (`updateEnabled: false`): un 400 aici inseamna, cel mai
 * des, „exista deja”, adica exact starea dorita.
 *
 * ⚠ Folosit pentru liniile COMENZII, nu pentru catalog. Linia poarta pretul platit (varianta,
 * treapta de cantitate, reducerea) si uneori numele variantei; masurat pe comenzile proprii,
 * pretul liniei difera de al produsului la 52% din linii. Un upsert de aici ar fi repretuit
 * produsul din Brevo cu pretul unei singure comenzi.
 */
export async function asiguraProdusul(config: BrevoConfig, p: BrevoEcomProduct): Promise<void> {
  await brevoRequest(config, "POST", "/products", { ...productBody(p), updateEnabled: false });
}

/**
 * Upsert many products (POST /v3/products/batch). Specul: „up to 100 product objects for
 * creation (or up to 1000 when `updateEnabled` is `true` and the account has an increased
 * limit)”. Deci 100, oricare ar fi contul. Pana pe 18.09.2026 functia trimitea cate 200, fara
 * `updateEnabled`, si nimeni n-o chema.
 */
export const PRODUSE_PE_LOT = 100;

export async function batchProducts(config: BrevoConfig, products: BrevoEcomProduct[]): Promise<Rezultat> {
  for (let i = 0; i < products.length; i += PRODUSE_PE_LOT) {
    const res = await brevoRequest(config, "POST", "/products/batch", {
      products: products.slice(i, i + PRODUSE_PE_LOT).map(productBody),
      updateEnabled: true,
    });
    if ("error" in res) return res;
  }
  return { ok: true };
}

export async function deleteProduct(config: BrevoConfig, productId: string): Promise<Rezultat> {
  const res = await brevoRequest(config, "DELETE", `/products/${encodeURIComponent(String(productId))}`);
  /* Sters deja = starea dorita. */
  if ("error" in res && res.status !== 404) return res;
  return { ok: true };
}

/**
 * Cantitatea: specul cere `quantity` INTREG, altfel `quantityFloat`. O cantitate cu zecimale
 * trimisa in `quantity` ar fi respins toata comanda.
 */
export function cantitateBrevo(q: number): { quantity: number } | { quantityFloat: number } {
  const n = Number(q) || 0;
  return Number.isInteger(n) ? { quantity: n } : { quantityFloat: n };
}

/** Corpul `POST /orders/status`, pur. Campuri cerute: id, createdAt, updatedAt, status, amount, products. */
export function corpComanda(order: BrevoEcomOrderInput, storeId: string | undefined, acum: string) {
  return {
    id: String(order.id),
    createdAt: order.created_at ?? acum,
    updatedAt: order.updated_at ?? acum,
    status: order.status,
    amount: order.amount,
    ...(storeId ? { storeId } : {}),
    identifiers: { email_id: order.email },
    products: order.lines.map((l) => ({
      productId: String(l.product.id),
      price: l.price,
      ...cantitateBrevo(l.quantity),
    })),
    ...(order.coupons?.length ? { coupons: order.coupons } : {}),
  };
}

/**
 * Sync an order (POST /v3/orders/status: an upsert by id; re-posting with a new
 * status updates it). Line products are ensured to exist first (best-effort, never
 * overwritten) so the catalog has the purchased items for retargeting. The order links
 * to the contact via identifiers.email_id; this does NOT subscribe them (consent is
 * handled separately).
 */
export async function syncOrder(
  config: BrevoConfig,
  order: BrevoEcomOrderInput,
  storeId?: string,
): Promise<Rezultat> {
  for (const line of order.lines) {
    await asiguraProdusul(config, line.product);
  }
  const res = await brevoRequest(config, "POST", "/orders/status", corpComanda(order, storeId, new Date().toISOString()));
  if ("error" in res) return res;
  return { ok: true };
}
