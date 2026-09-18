// Server-side dispatcher: sync one contact / order / product into the merchant's Brevo
// account when the integration is connected and the source is enabled. Never throws: it
// must never break the order/popup/form flow it is called from. Callers schedule it with
// `dupaRaspuns`, so it runs after the response without being cut off.

import { createAdminClient } from "@/lib/supabase/admin";
import { clientDeMarketplace } from "@/lib/orders/client-de-marketplace";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { logError } from "@/lib/error-logger";
import { storeBaseUrl } from "@/lib/seo";
import { upsertContact, createDoiContact, splitName, type BrevoConfig, type BrevoContactInput } from "@/lib/brevo";
import {
  syncOrder, upsertProduct, deleteProduct, batchProducts, brevoStoreId,
  type BrevoEcomProduct,
} from "@/lib/brevo-ecommerce";

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

/** Adresa publica a magazinului: domeniul propriu cand exista (acolo ajunge clientul din email). */
async function storeBaseFor(businessId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("slug, custom_domain").eq("id", businessId).single();
  return biz?.slug ? storeBaseUrl(biz as { slug: string; custom_domain: string | null }) : null;
}

/** Linkul produsului: `slug`, altfel id-ul, ca in feedul Merchant Center (vitrina le rezolva pe amandoua). */
const linkProdus = (base: string | null | undefined, slug: string | null | undefined, id: string) =>
  base ? `${base}/product/${slug || id}` : undefined;

/**
 * Upsert a contact into Brevo for a given source. No-op (silent) unless the store
 * connected Brevo, selected a list, and left the source enabled. The caller is
 * responsible for consent (e.g. a checked opt-in box at checkout).
 *
 * Cu confirmarea dubla pornita (si un sablon DOI ales), contactul NU se adauga direct:
 * Brevo ii trimite emailul de confirmare, iar dupa click il duce in lista si inapoi pe
 * pagina magazinului.
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

    // Skip contacts who unsubscribed, bounced or complained (belt-and-suspenders on never sending emailBlacklisted:false).
    const admin = createAdminClient();
    const { data: sup } = await admin
      .from("brevo_suppressions").select("id").eq("business_id", opts.businessId).eq("email", email.toLowerCase()).limit(1);
    if (sup && sup.length > 0) return;

    const { fname, lname } = splitName(opts.name);
    const contact: BrevoContactInput = {
      email,
      fname,
      lname,
      phone: opts.phone ?? undefined,
      source: SOURCE_LABEL[opts.source],
      county: opts.county ?? undefined,
      order_value: opts.orderValue != null ? orderValueBucket(opts.orderValue) : undefined,
    };

    let res: { ok: true } | { error: string; status?: number };
    if (config.double_optin && config.doi_template_id) {
      const base = await storeBaseFor(opts.businessId);
      if (!base) {
        await logError({ action: "brevo.sync.doi", message: "Magazinul nu are adresa publica, deci confirmarea dubla n-are unde intoarce clientul.", businessId: opts.businessId, severity: "warning" });
        return;
      }
      res = await createDoiContact(config, contact, base);
    } else {
      res = await upsertContact(config, contact);
    }
    if ("error" in res) {
      await logError({ action: "brevo.sync", message: res.error, businessId: opts.businessId, details: { source: opts.source, doi: !!config.double_optin }, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "brevo.sync", message: (e as Error)?.message ?? "Brevo sync failed", businessId: opts.businessId, details: { source: opts.source }, severity: "warning" });
  }
}

type OrderItem = { product_id: string; name: string; price: number; quantity: number; slug?: string | null; image?: string | null };

function toLines(items: OrderItem[], storeUrl?: string | null) {
  return items
    .filter((i) => !String(i.product_id).startsWith("extra_"))
    .map((i) => ({
      product: {
        id: i.product_id,
        name: i.name,
        price: Number(i.price) || 0,
        url: linkProdus(storeUrl, i.slug, i.product_id),
        image_url: i.image ?? null,
      } as BrevoEcomProduct,
      quantity: Number(i.quantity) || 0,
      price: Number(i.price) || 0,
    }));
}

/**
 * Sync a placed order to Brevo (revenue attribution + purchase-based segmentation +
 * product retargeting). No-op unless e-commerce sync is on.
 */
export async function maybeSyncBrevoOrder(opts: {
  businessId: string;
  storeUrl?: string;
  /**
   * ⚠ OBLIGATORIU, ca `tsc` sa numeasca fiecare apelant.
   *
   * De el atarna daca un cumparator de marketplace intra sau nu in marketingul
   * comerciantului. Optional, apelantii care nu se gandesc la asta l-ar fi omis tacut, iar
   * poarta ar fi existat degeaba. Vezi `clientDeMarketplace`.
   */
  orderSource: unknown;
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
    /* ⚠ Cumparatorul unui marketplace nu e clientul comerciantului: vezi
       `clientDeMarketplace`. Emailul poate fi chiar un alias al platformei. */
    if (clientDeMarketplace(opts.orderSource)) return;
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
}): Promise<void> {
  try {
    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;

    if (opts.action === "delete") {
      const del = await deleteProduct(config, opts.product.id);
      if ("error" in del) await logError({ action: "brevo.ecommerce.product", message: del.error, businessId: opts.businessId, severity: "warning" });
      return;
    }
    const base = await storeBaseFor(opts.businessId);
    const res = await upsertProduct(config, {
      id: opts.product.id,
      name: opts.product.name,
      price: opts.product.price,
      url: linkProdus(base, opts.product.slug, opts.product.id),
      image_url: opts.product.image ?? null,
    });
    if ("error" in res) {
      await logError({ action: "brevo.ecommerce.product", message: res.error, businessId: opts.businessId, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "brevo.ecommerce.product", message: (e as Error)?.message ?? "product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}

type ComandaCitita = {
  business_id: string;
  customer_email: string | null;
  total: number | string | null;
  items: unknown;
  created_at: string | null;
  order_source: unknown;
  businesses: { slug: string; custom_domain: string | null } | null;
};

/**
 * Re-posteaza comanda cu un status nou. Brevo n-are PATCH pe comanda, deci se trimite din nou
 * (upsert dupa id), refacuta din randul din baza. Nu arunca niciodata.
 */
async function trimiteStatusul(orderId: string, status: "paid" | "cancelled" | "refunded", actiune: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("orders").select("business_id, customer_email, total, items, created_at, order_source, businesses(slug, custom_domain)").eq("id", orderId).single();
    const order = data as unknown as ComandaCitita | null;
    if (!order?.customer_email) return;
    /*
     * ⚠ POARTA STA AICI, unde se citeste comanda, nu la apelant.
     *
     * Functia asta e chemata din `updateOrder` de fiecare data cand comerciantul trece o
     * comanda pe „platit", si de acolo nu se uita nimeni la origine. Deci prima apasare pe
     * butonul de plata trimitea emailul unui cumparator de marketplace, cu tot cu comanda,
     * intr-o lista de marketing. Vezi `clientDeMarketplace`.
     */
    if (clientDeMarketplace(order.order_source)) return;

    const config = await readConfig(order.business_id);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;

    const items = (Array.isArray(order.items) ? order.items : []) as OrderItem[];
    if (items.length === 0) return;
    const base = order.businesses ? storeBaseUrl(order.businesses) : null;

    const res = await syncOrder(config, {
      id: orderId,
      email: order.customer_email,
      status,
      amount: Number(order.total) || 0,
      created_at: order.created_at ?? undefined,
      lines: toLines(items, base),
    }, brevoStoreId(order.business_id));
    if ("error" in res) {
      await logError({ action: actiune, message: res.error, businessId: order.business_id, details: { orderId, status }, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: actiune, message: (e as Error)?.message ?? "order status sync failed", details: { orderId, status }, severity: "warning" });
  }
}

/**
 * Mark a Brevo order as paid when an online payment confirms. Brevo has no order PATCH,
 * so we re-post the order (upsert by id) with status "paid", rebuilt from the DB row.
 * Fetches its own business/config. Best-effort: never breaks the payment flow.
 */
export async function maybeMarkBrevoOrderPaid(orderId: string): Promise<void> {
  await trimiteStatusul(orderId, "paid", "brevo.ecommerce.paid");
}

/**
 * Comanda anulata sau rambursata: fara asta, venitul atribuit emailului ramanea in Brevo si
 * pentru coletele refuzate. Masurat pe 18.09.2026: ~18% din comenzile proprii din ultimele 90
 * de zile s-au terminat anulate sau rambursate.
 */
export async function maybeMarkBrevoOrderReturned(orderId: string, fel: "anulata" | "rambursata"): Promise<void> {
  await trimiteStatusul(orderId, fel === "anulata" ? "cancelled" : "refunded", "brevo.ecommerce.returned");
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
      let esuate = 0;
      let prima = "";
      for (const id of opts.ids) {
        const del = await deleteProduct(config, id);
        if ("error" in del) {
          esuate++;
          if (!prima) prima = del.error;
          if (del.status === 401 || del.status === 403) break;
        }
      }
      if (esuate > 0) {
        await logError({ action: "brevo.ecommerce.product.bulk", message: `${esuate} din ${opts.ids.length} produse nu s-au sters din Brevo. Prima eroare: ${prima}`, businessId: opts.businessId, severity: "warning" });
      }
      return;
    }

    const admin = createAdminClient();
    /* Pe bucati, acelasi motiv ca in `mailchimp-sync.ts` si `klaviyo-sync.ts`:
       `.in()` intra in adresa si peste ~650 de id-uri cererea e respinsa la
       margine. */
    const products: { id: string; name: string; price: number; images: unknown; slug: string | null }[] = [];
    for (const bucata of bucatiDeIduri(opts.ids)) {
      const { data } = await admin
        .from("products").select("id, name, price, images, slug").eq("business_id", opts.businessId).in("id", bucata);
      products.push(...((data ?? []) as typeof products));
    }
    const base = await storeBaseFor(opts.businessId);
    /*
     * ⚠ IN LOTURI DE 100 (`POST /products/batch`, cu `updateEnabled: true`). Pana pe 18.09.2026
     * mergea produs cu produs fara `updateEnabled`: primul produs deja existent intorcea 400,
     * iar bucla se oprea (`break`), deci catalogul ramanea neatins. In plus, pe planul gratuit
     * Brevo primeste 2 cereri pe secunda la `POST /v3/products`.
     */
    const res = await batchProducts(config, products.map((p) => {
      const img = Array.isArray(p.images) ? (p.images as unknown[])[0] : null;
      return {
        id: p.id, name: p.name, price: Number(p.price) || 0,
        url: linkProdus(base, p.slug, p.id),
        image_url: typeof img === "string" ? img : null,
      };
    }));
    if ("error" in res) {
      await logError({ action: "brevo.ecommerce.product.bulk", message: res.error, businessId: opts.businessId, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "brevo.ecommerce.product.bulk", message: (e as Error)?.message ?? "bulk product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}
