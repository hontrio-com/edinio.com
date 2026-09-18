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

/**
 * Metricile de comanda din ghidul lor de integrare pentru platforme fara integrare gata facuta
 * („Placed Order”, „Ordered Product”, „Fulfilled Order”, „Cancelled Order”, „Refunded Order”), plus
 * „Delivered Order”, metrica NOASTRA: la plata la livrare, livrarea e clipa in care clientul chiar are
 * marfa (si a platit-o), deci clipa potrivita pentru fluxurile de recenzie.
 */
export type KlaviyoOrderMetric =
  | "Placed Order" | "Fulfilled Order" | "Delivered Order" | "Cancelled Order" | "Refunded Order";

export interface KlaviyoCatalogProduct {
  id: string;
  title: string;
  description?: string | null;
  url: string;              // REQUIRED by Klaviyo
  image_url?: string | null;
  price: number;
  /** `false` pentru un produs scos din vanzare: ramane in catalog, dar nu mai apare in recomandari. */
  published?: boolean;
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
    published: p.published !== false,
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

/** Cate produse intra intr-un job in lot: „Accepts up to 100 catalog items per request.” */
export const PRODUSE_PE_JOB = 100;

/**
 * Tot catalogul, in joburi in lot (`catalog-item-bulk-create-jobs` si `-update-jobs`).
 *
 * ⚠ DE CE DOUA JOBURI PE ACEEASI BUCATA, fara sa aflam intai ce exista. Joburile sunt asincrone si
 * se prelucreaza fiecare produs separat. Crearea reuseste pentru cele noi si e respinsa pentru cele
 * existente; actualizarea invers. Oricare ar rula primul, la capat fiecare produs e acolo, cu datele
 * de acum. Cu citirea intai ar fi fost inca 34 de cereri la 3351 de produse, si o intrecere intre
 * citire si joburi.
 *
 * ⚠ DE CE IN LOT. Produs cu produs (PATCH, apoi POST la 404), cel mai mare catalog de pe platforma
 * (3351 de produse) ar fi cerut peste 3300 de cereri, deci ar fi depasit limita unei functii.
 * Aici sunt 68.
 *
 * Produsele scoase din vanzare pleaca doar in actualizare, cu `published: false`: raman in catalog
 * (istoricul comenzilor le pomeneste), dar nu mai apar in recomandari.
 */
export async function catalogInLot(
  config: KlaviyoConfig,
  active: KlaviyoCatalogProduct[],
  inactive: KlaviyoCatalogProduct[] = [],
): Promise<{ ok: true; joburi: number } | { error: string; status?: number }> {
  let joburi = 0;
  const cuUrl = active.filter((p) => !!p.url);
  for (let i = 0; i < cuUrl.length; i += PRODUSE_PE_JOB) {
    const bucata = cuUrl.slice(i, i + PRODUSE_PE_JOB);
    const creare = await klaviyoRequest(config, "POST", "/catalog-item-bulk-create-jobs", {
      data: {
        type: "catalog-item-bulk-create-job",
        attributes: {
          items: {
            data: bucata.map((p) => ({
              type: "catalog-item",
              attributes: {
                external_id: String(p.id),
                integration_type: "$custom",
                catalog_type: "$default",
                ...updatableAttributes(p),
              },
            })),
          },
        },
      },
    });
    if ("error" in creare) return creare;
    joburi++;
    const actualizare = await klaviyoRequest(config, "POST", "/catalog-item-bulk-update-jobs", corpActualizareInLot(bucata, true));
    if ("error" in actualizare) return actualizare;
    joburi++;
  }
  const stinse = inactive.filter((p) => !!p.url);
  for (let i = 0; i < stinse.length; i += PRODUSE_PE_JOB) {
    const r = await klaviyoRequest(config, "POST", "/catalog-item-bulk-update-jobs", corpActualizareInLot(stinse.slice(i, i + PRODUSE_PE_JOB), false));
    if ("error" in r) return r;
    joburi++;
  }
  return { ok: true, joburi };
}

function corpActualizareInLot(bucata: KlaviyoCatalogProduct[], publicat: boolean) {
  return {
    data: {
      type: "catalog-item-bulk-update-job",
      attributes: {
        items: {
          data: bucata.map((p) => ({
            type: "catalog-item",
            id: catalogItemId(String(p.id)),
            attributes: { ...updatableAttributes(p), published: publicat },
          })),
        },
      },
    },
  };
}

/** Sterge produse in lot (`catalog-item-bulk-delete-jobs`, cate 100). */
export async function stergeInLot(
  config: KlaviyoConfig,
  ids: string[],
): Promise<{ ok: true; joburi: number } | { error: string; status?: number }> {
  let joburi = 0;
  for (let i = 0; i < ids.length; i += PRODUSE_PE_JOB) {
    const r = await klaviyoRequest(config, "POST", "/catalog-item-bulk-delete-jobs", {
      data: {
        type: "catalog-item-bulk-delete-job",
        attributes: {
          items: { data: ids.slice(i, i + PRODUSE_PE_JOB).map((id) => ({ type: "catalog-item", id: catalogItemId(String(id)) })) },
        },
      },
    });
    if ("error" in r) return r;
    joburi++;
  }
  return { ok: true, joburi };
}

export async function deleteCatalogItem(config: KlaviyoConfig, externalId: string): Promise<{ ok: true } | { error: string; status?: number }> {
  const res = await klaviyoRequest(config, "DELETE", `/catalog-items/${encodeURIComponent(catalogItemId(String(externalId)))}`);
  /* Sters deja = starea dorita. */
  if ("error" in res && res.status !== 404) return res;
  return { ok: true };
}
