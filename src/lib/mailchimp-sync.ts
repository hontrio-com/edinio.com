// Server-side dispatcher: sync one subscriber into the merchant's Mailchimp audience
// when the integration is connected and the source is enabled. Never throws: it must
// never break the order/popup/form flow it is called from. Callers schedule it with
// `dupaRaspuns`, so it runs after the response without being cut off.

import { createAdminClient } from "@/lib/supabase/admin";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { logError } from "@/lib/error-logger";
import { clientDeMarketplace } from "@/lib/orders/client-de-marketplace";
import { storeBaseUrl } from "@/lib/seo";
import { upsertMember, splitName, type MailchimpConfig } from "@/lib/mailchimp";
import {
  ensureStore, upsertProduct, deleteProduct, syncOrder, setOrderFinancialStatus, markOrderReturned,
  mailchimpStoreId, type EcomProduct,
} from "@/lib/mailchimp-ecommerce";

/** Linkul produsului: `slug`, altfel id-ul, ca in feedul Merchant Center (vitrina le rezolva pe amandoua). */
const linkProdus = (base: string | null | undefined, slug: string | null | undefined, id: string) =>
  base ? `${base}/product/${slug || id}` : undefined;

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
  /**
   * ⚠ OBLIGATORIU, ca `tsc` sa numeasca fiecare apelant.
   *
   * De el atarna daca un cumparator de marketplace intra sau nu in marketingul
   * comerciantului. Optional, apelantii l-ar fi omis tacut. Vezi `clientDeMarketplace`.
   */
  orderSource: unknown;
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
    /* ⚠ Cumparatorul unui marketplace nu e clientul comerciantului: vezi
       `clientDeMarketplace`. Emailul poate fi chiar un alias al platformei. */
    if (clientDeMarketplace(opts.orderSource)) return;
    const email = (opts.order.email ?? "").trim();
    if (!email || opts.order.items.length === 0) return;

    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("store_settings").select("mailchimp_config").eq("business_id", opts.businessId).single();
    const config = settings?.mailchimp_config as MailchimpConfig | null;
    if (!config?.enabled || !config.api_key || !config.audience_id || !config.ecommerce_sync) return;

    const storeId = config.ecommerce_store_id ?? mailchimpStoreId(opts.businessId, config.audience_id);
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
          url: linkProdus(opts.storeUrl, it.slug, it.product_id),
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

async function readConfig(businessId: string): Promise<MailchimpConfig | null> {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("mailchimp_config").eq("business_id", businessId).single();
  return (settings?.mailchimp_config as MailchimpConfig | null) ?? null;
}

/** Adresa publica a magazinului: domeniul propriu cand exista (acolo ajunge clientul din email). */
async function storeBaseFor(businessId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("slug, custom_domain").eq("id", businessId).single();
  return biz?.slug ? storeBaseUrl(biz as { slug: string; custom_domain: string | null }) : null;
}

/**
 * Sync a product create/update/delete to the Mailchimp store. No-op unless e-commerce sync is on.
 *
 * ⚠ Linkul produsului se calculeaza AICI. Pana pe 18.09.2026 se astepta un `storeUrl` de la
 * apelant, pe care niciun apelant nu-l trimitea: produsele din Mailchimp n-aveau niciun link,
 * deci blocurile de produs din emailuri nu duceau nicaieri.
 */
export async function maybeSyncMailchimpProduct(opts: {
  businessId: string;
  action: "upsert" | "delete";
  product: { id: string; name: string; price: number; slug?: string | null; image?: string | null };
}): Promise<void> {
  try {
    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.audience_id || !config.ecommerce_sync || !config.ecommerce_store_id) return;
    const storeId = config.ecommerce_store_id;

    if (opts.action === "delete") {
      await deleteProduct(config, storeId, opts.product.id);
      return;
    }
    const base = await storeBaseFor(opts.businessId);
    const res = await upsertProduct(config, storeId, {
      id: opts.product.id,
      title: opts.product.name,
      url: linkProdus(base, opts.product.slug, opts.product.id),
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

/**
 * Citeste comanda si o trece prin poarta de marketplace. `null` = nu se trimite nimic.
 *
 * ⚠ `order_source` e CERUT anume: fara el poarta ar citi `undefined` si ar tacea exact pe
 * comenzile pentru care exista.
 */
async function comandaPentruMailchimp(orderId: string): Promise<{ businessId: string; config: MailchimpConfig; storeId: string } | null> {
  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("business_id, order_source").eq("id", orderId).single();
  if (!order) return null;
  /*
   * ⚠ POARTA STA AICI, unde se citeste comanda, nu la apelant.
   *
   * Functiile de mai jos sunt chemate din `updateOrder` de fiecare data cand comerciantul
   * trece o comanda pe „platit” sau o anuleaza, si de acolo nu se uita nimeni la origine.
   * Deci prima apasare trimitea emailul unui cumparator de marketplace, cu tot cu comanda,
   * intr-o lista de marketing. Vezi `clientDeMarketplace`.
   */
  if (clientDeMarketplace((order as { order_source?: unknown }).order_source)) return null;

  const config = await readConfig(order.business_id);
  if (!config?.enabled || !config.api_key || !config.audience_id || !config.ecommerce_sync || !config.ecommerce_store_id) return null;
  return { businessId: order.business_id, config, storeId: config.ecommerce_store_id };
}

/** Mark a Mailchimp e-commerce order as paid (called when online payment confirms). Never throws. */
export async function maybeMarkMailchimpOrderPaid(orderId: string): Promise<void> {
  try {
    const c = await comandaPentruMailchimp(orderId);
    if (!c) return;
    const res = await setOrderFinancialStatus(c.config, c.storeId, orderId, "paid");
    /* 404: comanda n-a ajuns niciodata in Mailchimp (sincronizarea pornita dupa ea). */
    if ("error" in res && res.status !== 404) {
      await logError({ action: "mailchimp.ecommerce.paid", message: res.error, businessId: c.businessId, details: { orderId }, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "mailchimp.ecommerce.paid", message: (e as Error)?.message ?? "paid sync failed", details: { orderId }, severity: "warning" });
  }
}

/**
 * Comanda anulata sau rambursata: fara asta, venitul atribuit emailului ramanea in Mailchimp
 * si pentru coletele refuzate. Masurat pe 18.09.2026: ~18% din comenzile proprii din ultimele
 * 90 de zile s-au terminat anulate sau rambursate. Never throws.
 */
export async function maybeMarkMailchimpOrderReturned(orderId: string, fel: "anulata" | "rambursata"): Promise<void> {
  try {
    const c = await comandaPentruMailchimp(orderId);
    if (!c) return;
    const res = await markOrderReturned(c.config, c.storeId, orderId, fel);
    if ("error" in res) {
      await logError({ action: "mailchimp.ecommerce.returned", message: res.error, businessId: c.businessId, details: { orderId, fel }, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "mailchimp.ecommerce.returned", message: (e as Error)?.message ?? "returned sync failed", details: { orderId, fel }, severity: "warning" });
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
    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.audience_id || !config.ecommerce_sync || !config.ecommerce_store_id) return;
    const storeId = config.ecommerce_store_id;

    if (opts.action === "delete") {
      for (const id of opts.ids) await deleteProduct(config, storeId, id);
      return;
    }

    /* Upsert: pull current product data for the affected ids.
       Pe bucati: `.in()` intra in ADRESA, iar peste ~650 de id-uri cererea e
       respinsa la margine (masurat, vezi `supabase/id-chunks.ts`). */
    const products: { id: string; name: string; price: number; images: unknown; slug: string | null }[] = [];
    for (const bucata of bucatiDeIduri(opts.ids)) {
      const { data } = await admin
        .from("products").select("id, name, price, images, slug").eq("business_id", opts.businessId).in("id", bucata);
      products.push(...((data ?? []) as typeof products));
    }
    const base = await storeBaseFor(opts.businessId);
    /*
     * ⚠ Pana pe 18.09.2026 primul esec oprea TOT lotul (`break`), deci un singur produs respins
     * lasa restul catalogului nesincronizat. Acum se opreste doar la cheie invalida sau
     * permisiuni lipsa (s-ar repeta la fiecare produs); 429 il reia transportul.
     */
    let esuate = 0;
    let prima = "";
    for (const p of products) {
      const img = Array.isArray(p.images) ? (p.images as unknown[])[0] : null;
      const res = await upsertProduct(config, storeId, {
        id: p.id, title: p.name, price: Number(p.price) || 0,
        url: linkProdus(base, p.slug, p.id),
        image_url: typeof img === "string" ? img : null,
      });
      if ("error" in res) {
        esuate++;
        if (!prima) prima = res.error;
        const status = (res as { status?: number }).status;
        if (status === 401 || status === 403) break;
      }
    }
    if (esuate > 0) {
      await logError({
        action: "mailchimp.ecommerce.product.bulk",
        message: `${esuate} din ${products.length} produse nu s-au sincronizat in Mailchimp. Prima eroare: ${prima}`,
        businessId: opts.businessId,
        severity: "warning",
      });
    }
  } catch (e) {
    await logError({ action: "mailchimp.ecommerce.product.bulk", message: (e as Error)?.message ?? "bulk product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}
