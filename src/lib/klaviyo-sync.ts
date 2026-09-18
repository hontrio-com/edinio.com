// Server-side dispatcher: sync one contact / order / product into the merchant's Klaviyo
// account when the integration is connected and the source is enabled. Never throws: it
// must never break the order/popup/form flow it is called from. Callers schedule it with
// `dupaRaspuns`, so it runs after the response without being cut off.
//
// Klaviyo specifics vs Brevo: a subscriber needs TWO calls (upsert profile for
// properties + subscribe job for consent); e-commerce is order EVENTS + catalog items
// (no order object with a status). Unsubscribes are guarded by `subscribeProfiles`,
// which reads each profile's suppressions before subscribing.

import { createAdminClient } from "@/lib/supabase/admin";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { logError } from "@/lib/error-logger";
import { clientDeMarketplace } from "@/lib/orders/client-de-marketplace";
import { asteaptaIncasareOnline } from "@/lib/orders/vanzare-confirmata";
import { storeBaseUrl } from "@/lib/seo";
import { upsertProfile, subscribeProfiles, splitName, type KlaviyoConfig } from "@/lib/klaviyo";
import {
  trackOrderEvent, upsertCatalogItem, deleteCatalogItem,
  type KlaviyoOrderItem, type KlaviyoOrderMetric,
} from "@/lib/klaviyo-ecommerce";

export type KlaviyoSource = "checkout" | "popup" | "forms";

const SOURCE_LABEL: Record<KlaviyoSource, string> = {
  checkout: "Checkout",
  popup: "Popup",
  forms: "Formular",
};

/** Comenzile magazinului propriu sunt in lei; cele de marketplace nu ajung aici deloc. */
const MONEDA = "RON";

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
 * responsible for consent (a checked opt-in box at checkout). Suppressed profiles
 * (unsubscribed, spam complaint, bounced) are skipped by `subscribeProfiles`.
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

    const sub = await subscribeProfiles(config, [email], `Edinio: ${SOURCE_LABEL[opts.source]}`);
    if ("error" in sub) {
      await logError({ action: "klaviyo.sync.subscribe", message: sub.error, businessId: opts.businessId, details: { source: opts.source }, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "klaviyo.sync", message: (e as Error)?.message ?? "Klaviyo sync failed", businessId: opts.businessId, details: { source: opts.source }, severity: "warning" });
  }
}

type OrderItem = { product_id: string; name: string; price: number; quantity: number; category?: string | null; slug?: string | null; image?: string | null };

function liniiKlaviyo(items: OrderItem[], storeUrl?: string | null): KlaviyoOrderItem[] {
  return items
    .filter((i) => !String(i.product_id).startsWith("extra_"))
    .map((i) => ({
      product_id: i.product_id,
      name: i.name,
      price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 0,
      category: i.category ?? null,
      /* Ca in feedul Merchant Center: `slug`, altfel id-ul, pe care vitrina il rezolva la fel. */
      url: storeUrl ? `${storeUrl}/product/${i.slug || i.product_id}` : undefined,
      image_url: i.image ?? null,
    }));
}

/**
 * „Placed Order” la CREAREA comenzii, numai cand vanzarea e deja confirmata.
 *
 * ⚠ La plata online (card, Klarna, Revolut, iPay) comanda exista inainte ca banii sa intre,
 * iar pana pe 18.09.2026 pleca venit in Klaviyo si pentru platile refuzate sau abandonate.
 * Aceeasi regula ca la Meta, TikTok si GA4 (`vanzare-confirmata.ts`): la plata online
 * evenimentul pleaca din `maybeMarkKlaviyoOrderPaid`, cand banii chiar au intrat.
 */
export async function maybeTrackKlaviyoOrder(opts: {
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
  /** ⚠ OBLIGATORIU, din acelasi motiv: de metoda atarna daca vanzarea e confirmata acum. */
  paymentMethod: string | null | undefined;
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
    /* ⚠ Cumparatorul unui marketplace nu e clientul comerciantului: vezi
       `clientDeMarketplace`. Emailul poate fi chiar un alias al platformei. */
    if (clientDeMarketplace(opts.orderSource)) return;
    if (asteaptaIncasareOnline(opts.paymentMethod)) return;
    const email = (opts.order.email ?? "").trim();
    if (!email || opts.order.items.length === 0) return;

    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;

    const { fname, lname } = splitName(opts.order.name);
    const res = await trackOrderEvent(config, "Placed Order", {
      id: opts.order.id,
      email,
      first_name: fname,
      last_name: lname,
      total: opts.order.total,
      currency: MONEDA,
      time: opts.order.createdAt,
      items: liniiKlaviyo(opts.order.items, opts.storeUrl),
    });
    if ("error" in res) {
      await logError({ action: "klaviyo.ecommerce.order", message: res.error, businessId: opts.businessId, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "klaviyo.ecommerce.order", message: (e as Error)?.message ?? "order track failed", businessId: opts.businessId, severity: "warning" });
  }
}

type ComandaCitita = {
  business_id: string;
  customer_email: string | null;
  customer_name: string | null;
  total: number | string | null;
  items: unknown;
  created_at: string | null;
  order_source: unknown;
  payment_method: string | null;
  payment_status: string | null;
  businesses: { slug: string; custom_domain: string | null } | null;
};

/** Citeste comanda si o trece prin poarta de marketplace. `null` = nu se trimite nimic. */
async function comandaPentruKlaviyo(orderId: string): Promise<{ c: ComandaCitita; config: KlaviyoConfig } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("business_id, customer_email, customer_name, total, items, created_at, order_source, payment_method, payment_status, businesses(slug, custom_domain)")
    .eq("id", orderId)
    .single();
  const c = data as unknown as ComandaCitita | null;
  if (!c?.customer_email) return null;
  /* ⚠ POARTA STA AICI, unde se citeste comanda: vezi `maybeMarkBrevoOrderPaid`. */
  if (clientDeMarketplace(c.order_source)) return null;
  const config = await readConfig(c.business_id);
  if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return null;
  return { c, config };
}

async function trimiteDinComanda(orderId: string, c: ComandaCitita, config: KlaviyoConfig, metric: KlaviyoOrderMetric): Promise<void> {
  const items = (Array.isArray(c.items) ? c.items : []) as OrderItem[];
  if (items.length === 0) return;
  const base = c.businesses ? storeBaseUrl(c.businesses) : null;
  const { fname, lname } = splitName(c.customer_name);
  const res = await trackOrderEvent(config, metric, {
    id: orderId,
    email: (c.customer_email ?? "").trim(),
    first_name: fname,
    last_name: lname,
    total: Number(c.total) || 0,
    currency: MONEDA,
    time: metric === "Placed Order" ? (c.created_at ?? undefined) : undefined,
    items: liniiKlaviyo(items, base),
  });
  if ("error" in res) {
    await logError({ action: "klaviyo.ecommerce.order", message: res.error, businessId: c.business_id, details: { orderId, metric }, severity: "warning" });
  }
}

/**
 * „Placed Order” cand plata online s-a confirmat. Idempotent: daca evenimentul plecase deja
 * la creare (ramburs trecut de comerciant pe „platit”), Klaviyo il arunca pe al doilea
 * dupa `unique_id`. Nu arunca niciodata.
 */
export async function maybeMarkKlaviyoOrderPaid(orderId: string): Promise<void> {
  try {
    const gasita = await comandaPentruKlaviyo(orderId);
    if (!gasita) return;
    await trimiteDinComanda(orderId, gasita.c, gasita.config, "Placed Order");
  } catch (e) {
    await logError({ action: "klaviyo.ecommerce.paid", message: (e as Error)?.message ?? "paid track failed", details: { orderId }, severity: "warning" });
  }
}

/**
 * A fost comanda asta raportata ca vanzare in Klaviyo? La ramburs, da (de la creare); la plata
 * online, numai daca banii au intrat vreodata (`paid`, sau `refunded`, care vine dupa `paid`).
 */
export function aFostRaportataCaVanzare(metoda: string | null | undefined, stareaPlatii: string | null | undefined): boolean {
  if (!asteaptaIncasareOnline(metoda)) return true;
  const s = (stareaPlatii ?? "").toLowerCase();
  return s === "paid" || s === "refunded";
}

/**
 * „Cancelled Order” / „Refunded Order”. Pleaca numai pentru comenzile care au intrat ca
 * vanzare: o plata cu cardul abandonata si anulata n-a fost niciodata „Placed Order”.
 */
export async function maybeMarkKlaviyoOrderReturned(orderId: string, fel: "anulata" | "rambursata"): Promise<void> {
  try {
    const gasita = await comandaPentruKlaviyo(orderId);
    if (!gasita) return;
    if (!aFostRaportataCaVanzare(gasita.c.payment_method, gasita.c.payment_status)) return;
    await trimiteDinComanda(orderId, gasita.c, gasita.config, fel === "anulata" ? "Cancelled Order" : "Refunded Order");
  } catch (e) {
    await logError({ action: "klaviyo.ecommerce.returned", message: (e as Error)?.message ?? "returned track failed", details: { orderId, fel }, severity: "warning" });
  }
}

async function storeBaseFor(businessId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("slug, custom_domain").eq("id", businessId).single();
  /* Domeniul propriu cand exista: acolo ajunge clientul care da click in email. */
  return biz?.slug ? storeBaseUrl(biz as { slug: string; custom_domain: string | null }) : null;
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
      const del = await deleteCatalogItem(config, opts.product.id);
      if ("error" in del) await logError({ action: "klaviyo.ecommerce.product", message: del.error, businessId: opts.businessId, severity: "warning" });
      return;
    }
    const base = await storeBaseFor(opts.businessId);
    const res = await upsertCatalogItem(config, {
      id: opts.product.id,
      title: opts.product.name,
      description: opts.product.description ?? null,
      price: opts.product.price,
      url: base ? `${base}/product/${opts.product.slug || opts.product.id}` : "",
      image_url: opts.product.image ?? null,
    });
    if ("error" in res) {
      await logError({ action: "klaviyo.ecommerce.product", message: res.error, businessId: opts.businessId, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "klaviyo.ecommerce.product", message: (e as Error)?.message ?? "product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}

/** Un esec de cheie sau de permisiuni se repeta la fiecare produs: acolo lotul se opreste. */
const esteDeConfigurare = (status?: number) => status === 401 || status === 403;

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

    /*
     * ⚠ Pana pe 18.09.2026 primul esec oprea TOT lotul (`break`), orice ar fi fost, deci un
     * singur produs respins lasa restul catalogului nesincronizat, fara urma. Acum se opreste
     * doar la cheie invalida sau permisiuni lipsa (care s-ar repeta la fiecare produs); 429 il
     * reia transportul; restul se numara si se scriu o data.
     */
    let esuate = 0;
    let primaEroare = "";
    const noteaza = (e: { error: string; status?: number }) => {
      esuate++;
      if (!primaEroare) primaEroare = e.error;
      return esteDeConfigurare(e.status);
    };

    if (opts.action === "delete") {
      for (const id of opts.ids) {
        const del = await deleteCatalogItem(config, id);
        if ("error" in del && noteaza(del)) break;
      }
    } else {
      const admin = createAdminClient();
      const base = await storeBaseFor(opts.businessId);
      /* Pe bucati, acelasi motiv ca in `mailchimp-sync.ts`: `.in()` intra in
         adresa si peste ~650 de id-uri cererea e respinsa la margine. */
      const products: {
        id: string; name: string; price: number; images: unknown; slug: string | null; description: string | null;
      }[] = [];
      for (const bucata of bucatiDeIduri(opts.ids)) {
        const { data } = await admin
          .from("products").select("id, name, price, images, slug, description").eq("business_id", opts.businessId).in("id", bucata);
        products.push(...((data ?? []) as typeof products));
      }
      for (const p of products) {
        const img = Array.isArray(p.images) ? (p.images as unknown[])[0] : null;
        const res = await upsertCatalogItem(config, {
          id: p.id,
          title: p.name,
          description: p.description ?? null,
          price: Number(p.price) || 0,
          url: base ? `${base}/product/${p.slug || p.id}` : "",
          image_url: typeof img === "string" ? img : null,
        });
        if ("error" in res && noteaza(res)) break;
      }
    }
    if (esuate > 0) {
      await logError({
        action: "klaviyo.ecommerce.product.bulk",
        message: `${esuate} din ${opts.ids.length} produse nu s-au sincronizat in Klaviyo. Prima eroare: ${primaEroare}`,
        businessId: opts.businessId,
        severity: "warning",
      });
    }
  } catch (e) {
    await logError({ action: "klaviyo.ecommerce.product.bulk", message: (e as Error)?.message ?? "bulk product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}
