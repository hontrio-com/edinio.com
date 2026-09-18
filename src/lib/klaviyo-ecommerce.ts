// Klaviyo E-commerce sync (server-only). Klaviyo's e-commerce model is event-based:
// a "Placed Order" event drives revenue attribution + purchase-based segmentation +
// post-purchase flows; one "Ordered Product" per line drives product-level flows and
// segments. Products are pushed to the Klaviyo Catalog (for product recommendations /
// retargeting). Carts stay on Edinio's abandoned-cart system.
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
  /** ISO 4217. Fara ea, Klaviyo pune venitul in moneda implicita a CONTULUI, nu in lei. */
  currency: string;
  time?: string;            // ISO 8601
  items: KlaviyoOrderItem[];
}

/** Metricile de comanda din ghidul lor de integrare pentru platforme fara integrare gata facuta. */
export type KlaviyoOrderMetric = "Placed Order" | "Cancelled Order" | "Refunded Order";

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

const bani = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function profilDin(order: KlaviyoOrderInput) {
  const attrs: Record<string, unknown> = { email: order.email };
  if (order.first_name) attrs.first_name = order.first_name;
  if (order.last_name) attrs.last_name = order.last_name;
  return { data: { type: "profile", attributes: attrs } };
}

function articol(i: KlaviyoOrderItem) {
  return {
    ProductID: i.product_id,
    ProductName: i.name,
    Quantity: i.quantity,
    ItemPrice: bani(i.price),
    RowTotal: bani(i.price * i.quantity),
    ...(i.url ? { ProductURL: i.url } : {}),
    ...(i.image_url ? { ImageURL: i.image_url } : {}),
    ...(i.category ? { Categories: [i.category] } : {}),
  };
}

/** Corpul unui eveniment de comanda (`POST /events`), pur, ca sa poata fi probat. */
export function corpEvenimentComanda(metric: KlaviyoOrderMetric, order: KlaviyoOrderInput) {
  const items = order.items;
  return {
    data: {
      type: "event",
      attributes: {
        metric: { data: { type: "metric", attributes: { name: metric } } },
        profile: profilDin(order),
        properties: {
          OrderId: order.id,
          ItemNames: items.map((i) => i.name),
          Categories: Array.from(new Set(items.map((i) => i.category).filter((c): c is string => !!c))),
          Items: items.map(articol),
        },
        value: bani(order.total),
        value_currency: order.currency,
        /*
         * Klaviyo pastreaza DOAR primul eveniment cu acelasi `unique_id` pe acelasi profil si
         * aceeasi metrica. De aceea „Placed Order” se poate trimite si la creare, si la plata:
         * al doilea se arunca.
         */
        unique_id: String(order.id),
        time: order.time ?? new Date().toISOString(),
      },
    },
  };
}

/** Corpul unui „Ordered Product” pentru linia `k` a comenzii. */
export function corpProdusComandat(order: KlaviyoOrderInput, k: number) {
  const i = order.items[k];
  return {
    data: {
      type: "event",
      attributes: {
        metric: { data: { type: "metric", attributes: { name: "Ordered Product" } } },
        profile: profilDin(order),
        properties: { OrderId: order.id, ...articol(i) },
        value: bani(i.price * i.quantity),
        value_currency: order.currency,
        /* Pe LINIE, nu pe produs: acelasi produs poate aparea de doua ori, in doua variante. */
        unique_id: `${order.id}:${k + 1}`,
        time: order.time ?? new Date().toISOString(),
      },
    },
  };
}

/**
 * Trimite un eveniment de comanda. La „Placed Order” pleaca si cate un „Ordered Product”
 * pe linie. Idempotent prin `unique_id`.
 */
export async function trackOrderEvent(
  config: KlaviyoConfig,
  metric: KlaviyoOrderMetric,
  order: KlaviyoOrderInput,
): Promise<{ ok: true } | { error: string; status?: number }> {
  const res = await klaviyoRequest(config, "POST", "/events", corpEvenimentComanda(metric, order));
  if ("error" in res) return res;
  if (metric === "Placed Order") {
    for (let k = 0; k < order.items.length; k++) {
      const linie = await klaviyoRequest(config, "POST", "/events", corpProdusComandat(order, k));
      if ("error" in linie) return linie;
    }
  }
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
 * Upsert a catalog item: PATCH by composite id; POST to create ONLY when the item does not
 * exist (404). Skips silently if we have no url (Klaviyo requires one).
 *
 * ⚠ ORDINEA E ASA DINADINS. Pana pe 18.09.2026 se facea POST si apoi PATCH dupa ORICE esec,
 * deci si dupa o cheie invalida sau un 429: eroarea reala ramanea ascunsa sub a doua cerere.
 * Invers, cu PATCH doar la „exista deja”, ar fi trebuit ghicit codul duplicatului, pe care
 * specul lor nu-l da (scrie doar `4XX`). „Nu exista” e 404 pe orice resursa cautata dupa id,
 * si e si cazul rar: produsul editat exista deja.
 */
export async function upsertCatalogItem(
  config: KlaviyoConfig,
  p: KlaviyoCatalogProduct,
): Promise<{ ok: true } | { error: string; status?: number }> {
  if (!p.url) return { ok: true };

  const id = catalogItemId(String(p.id));
  const patch = await klaviyoRequest(config, "PATCH", `/catalog-items/${encodeURIComponent(id)}`, {
    data: { type: "catalog-item", id, attributes: updatableAttributes(p) },
  });
  if (!("error" in patch)) return { ok: true };
  if (patch.status !== 404) return patch;

  const create = await klaviyoRequest(config, "POST", "/catalog-items", {
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
  if ("error" in create) return create;
  return { ok: true };
}

export async function deleteCatalogItem(config: KlaviyoConfig, externalId: string): Promise<{ ok: true } | { error: string; status?: number }> {
  const res = await klaviyoRequest(config, "DELETE", `/catalog-items/${encodeURIComponent(catalogItemId(String(externalId)))}`);
  /* Sters deja = starea dorita. */
  if ("error" in res && res.status !== 404) return res;
  return { ok: true };
}
