// Mailchimp E-commerce sync (server-only). Pushes products + orders to a per-store
// Mailchimp e-commerce store so the merchant gets, inside Mailchimp: revenue
// attribution, purchase-based segmentation and product retargeting. Carts stay on
// Edinio's own abandoned-cart system (not mirrored). All calls are best-effort.
//
// Each Edinio product maps to a Mailchimp product with a single default variant
// (variant id = product id) — enough for revenue/segmentation/retargeting.
import { mcRequest, subscriberHash, type MailchimpConfig } from "@/lib/mailchimp";

export interface EcomProduct {
  id: string;
  title: string;
  url?: string;
  image_url?: string | null;
  price: number;
  sku?: string;
}

export interface EcomOrderInput {
  id: string;                // order id (stable, unique per store)
  email: string;
  first_name?: string;
  last_name?: string;
  currency_code: string;     // e.g. "RON"
  total: number;
  processed_at?: string;     // ISO 8601
  financial_status?: string; // "paid" | "pending"
  lines: Array<{ product: EcomProduct; quantity: number; price: number }>;
}

/**
 * Id-ul magazinului de comert din Mailchimp, LEGAT DE AUDIENTA.
 *
 * ⚠ Specul lor: „The `list_id` for a specific store cannot change.” Pana pe 18.09.2026 id-ul era
 * doar `edinio_<magazin>`, deci dupa ce comerciantul alegea alta audienta, comenzile intrau mai
 * departe in magazinul legat de CEA VECHE: venitul si cumparatorii ajungeau in lista gresita.
 */
export function mailchimpStoreId(businessId: string, audienceId?: string): string {
  return audienceId ? `edinio_${businessId}_${audienceId}` : `edinio_${businessId}`;
}

/** Create the Mailchimp e-commerce store if missing (tied to the audience). */
export async function ensureStore(
  config: MailchimpConfig,
  businessId: string,
  opts: { name: string; currency: string; domain?: string; email?: string },
): Promise<{ storeId: string } | { error: string; status?: number }> {
  if (!config.audience_id) return { error: "Nicio audienta selectata." };
  const id = config.ecommerce_store_id || mailchimpStoreId(businessId, config.audience_id);

  const existing = await mcRequest<{ id?: string; list_id?: string }>(config, "GET", `/ecommerce/stores/${id}`);
  if (!("error" in existing) && existing.data?.id) {
    if (existing.data.list_id && existing.data.list_id !== config.audience_id) {
      return { error: "Magazinul de comert din Mailchimp e legat de alta audienta. Salveaza din nou setarile ca sa se faca unul pentru audienta aleasa." };
    }
    return { storeId: id };
  }

  const res = await mcRequest(config, "POST", "/ecommerce/stores", {
    id,
    list_id: config.audience_id,
    name: opts.name || "Magazin",
    currency_code: opts.currency || "RON",
    platform: "Edinio",
    ...(opts.domain ? { domain: opts.domain } : {}),
    ...(opts.email ? { email_address: opts.email } : {}),
  });
  if ("error" in res) return res;
  return { storeId: id };
}

function defaultVariant(p: EcomProduct) {
  return { id: p.id, title: p.title || "Produs", price: p.price, ...(p.sku ? { sku: p.sku } : {}) };
}

/** Upsert a product: GET → PATCH if it exists, else POST. Keeps the default variant priced. */
export async function upsertProduct(
  config: MailchimpConfig,
  storeId: string,
  p: EcomProduct,
): Promise<{ ok: true } | { error: string }> {
  const pid = encodeURIComponent(p.id);
  const existing = await mcRequest<{ id?: string }>(config, "GET", `/ecommerce/stores/${storeId}/products/${pid}`);

  if (!("error" in existing) && existing.data?.id) {
    const res = await mcRequest(config, "PATCH", `/ecommerce/stores/${storeId}/products/${pid}`, {
      title: p.title || "Produs",
      ...(p.url ? { url: p.url } : {}),
      ...(p.image_url ? { image_url: p.image_url } : {}),
    });
    if ("error" in res) return res;
    // Keep the default variant (price) in sync — PUT is an upsert for variants.
    await mcRequest(config, "PUT", `/ecommerce/stores/${storeId}/products/${pid}/variants/${pid}`, defaultVariant(p));
    return { ok: true };
  }

  const res = await mcRequest(config, "POST", `/ecommerce/stores/${storeId}/products`, {
    id: p.id,
    title: p.title || "Produs",
    ...(p.url ? { url: p.url } : {}),
    ...(p.image_url ? { image_url: p.image_url } : {}),
    variants: [defaultVariant(p)],
  });
  if ("error" in res) return res;
  return { ok: true };
}

export async function deleteProduct(config: MailchimpConfig, storeId: string, productId: string): Promise<void> {
  await mcRequest(config, "DELETE", `/ecommerce/stores/${storeId}/products/${encodeURIComponent(productId)}`);
}

/**
 * Creeaza produsul NUMAI daca lipseste; unul existent ramane neatins.
 *
 * ⚠ Pentru liniile COMENZII. Pana pe 18.09.2026 fiecare linie trecea prin `upsertProduct`, deci
 * rescria produsul din Mailchimp cu datele LINIEI: pretul platit (varianta, treapta, reducerea)
 * si uneori numele variantei. Masurat pe comenzile proprii, pretul liniei difera de al
 * produsului la 52% din linii: fiecare comanda repretuia catalogul din recomandarile de email.
 */
export async function ensureProduct(
  config: MailchimpConfig,
  storeId: string,
  p: EcomProduct,
): Promise<{ ok: true } | { error: string; status?: number }> {
  const pid = encodeURIComponent(p.id);
  const existing = await mcRequest<{ id?: string }>(config, "GET", `/ecommerce/stores/${storeId}/products/${pid}`);
  if (!("error" in existing) && existing.data?.id) return { ok: true };
  if ("error" in existing && existing.status !== 404) return existing;
  const res = await mcRequest(config, "POST", `/ecommerce/stores/${storeId}/products`, {
    id: p.id,
    title: p.title || "Produs",
    ...(p.url ? { url: p.url } : {}),
    ...(p.image_url ? { image_url: p.image_url } : {}),
    variants: [defaultVariant(p)],
  });
  if ("error" in res) return res;
  return { ok: true };
}

/**
 * Sync an order: ensure its line products exist first (Mailchimp rejects lines that
 * reference unknown products), then create the order. The customer is added with
 * opt_in_status=false so a purchase never silently adds someone to the marketing
 * audience — consent-based subscription is handled separately by the subscriber sync.
 */
export async function syncOrder(
  config: MailchimpConfig,
  storeId: string,
  order: EcomOrderInput,
): Promise<{ ok: true } | { error: string; status?: number }> {
  for (const line of order.lines) {
    await ensureProduct(config, storeId, line.product);
  }

  const res = await mcRequest(config, "POST", `/ecommerce/stores/${storeId}/orders`, {
    id: order.id,
    customer: {
      id: subscriberHash(order.email),
      email_address: order.email,
      opt_in_status: false,
      ...(order.first_name ? { first_name: order.first_name } : {}),
      ...(order.last_name ? { last_name: order.last_name } : {}),
    },
    currency_code: order.currency_code || "RON",
    order_total: order.total,
    ...(order.financial_status ? { financial_status: order.financial_status } : {}),
    ...(order.processed_at ? { processed_at_foreign: order.processed_at } : {}),
    lines: order.lines.map((l, i) => ({
      id: `${order.id}-${i + 1}`,
      product_id: l.product.id,
      product_variant_id: l.product.id,
      quantity: l.quantity,
      price: l.price,
    })),
  });
  if ("error" in res) return res;
  return { ok: true };
}

/** Update an order's financial status (e.g. "paid" after online payment confirms). */
export async function setOrderFinancialStatus(
  config: MailchimpConfig,
  storeId: string,
  orderId: string,
  financialStatus: string,
): Promise<{ ok: true } | { error: string; status?: number }> {
  const res = await mcRequest(config, "PATCH", `/ecommerce/stores/${storeId}/orders/${encodeURIComponent(orderId)}`, { financial_status: financialStatus });
  if ("error" in res) return res;
  return { ok: true };
}

/**
 * Corpul PATCH pentru o comanda anulata sau rambursata. Specul lor: `cancelled_at_foreign`
 * „passing a value for this parameter will cancel the order being edited”, iar
 * `financial_status` porneste notificarile de comanda (daca comerciantul le-a facut in Mailchimp).
 */
export function corpComandaIntoarsa(fel: "anulata" | "rambursata", acum: string): Record<string, string> {
  return fel === "anulata"
    ? { financial_status: "cancelled", cancelled_at_foreign: acum }
    : { financial_status: "refunded" };
}

/** Marcheaza comanda anulata sau rambursata. O comanda care nu exista in Mailchimp (404) n-are ce anula. */
export async function markOrderReturned(
  config: MailchimpConfig,
  storeId: string,
  orderId: string,
  fel: "anulata" | "rambursata",
): Promise<{ ok: true } | { error: string; status?: number }> {
  const res = await mcRequest(config, "PATCH", `/ecommerce/stores/${storeId}/orders/${encodeURIComponent(orderId)}`, corpComandaIntoarsa(fel, new Date().toISOString()));
  if ("error" in res && res.status !== 404) return res;
  return { ok: true };
}
