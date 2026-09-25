// Server-side dispatcher: sync one contact / order / product into the merchant's Klaviyo
// account when the integration is connected and the source is enabled. Never throws: it
// must never break the order/popup/form flow it is called from. Contacts and products are
// scheduled with `dupaRaspuns`; ORDER events come from the queue (`lib/email-marketing/coada.ts`,
// filled by a trigger on `orders`), so every path that creates, pays, ships, cancels or refunds
// an order reaches Klaviyo, with retries.
//
// Klaviyo specifics vs Brevo: a subscriber needs TWO calls (upsert profile for
// properties + subscribe job for consent); e-commerce is order EVENTS + catalog items
// (no order object with a status). Unsubscribes are guarded by `subscribeProfiles`,
// which reads each profile's suppressions before subscribing.

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { clientDeMarketplace } from "@/lib/orders/client-de-marketplace";
import { asteaptaIncasareOnline } from "@/lib/orders/vanzare-confirmata";
import { storeBaseUrl } from "@/lib/seo";
import { verdictDinEroare, type FelEveniment, type Verdict } from "@/lib/email-marketing/coada";
import { citesteCatalogul, linkProdus, type ProdusCatalog } from "@/lib/email-marketing/catalog";
import { upsertProfile, subscribeProfiles, splitName, type KlaviyoConfig } from "@/lib/klaviyo";
import {
  trackOrderEvent, upsertCatalogItem, deleteCatalogItem, catalogInLot, stergeInLot,
  type KlaviyoOrderItem, type KlaviyoOrderMetric, type KlaviyoCatalogProduct,
} from "@/lib/klaviyo-ecommerce";
import { prefixProdusMagazin } from "@/lib/storefront/prefix-produs-server";

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

function liniiKlaviyo(items: OrderItem[], storeUrl?: string | null, prefixProdus?: string): KlaviyoOrderItem[] {
  return items
    .filter((i) => !String(i.product_id).startsWith("extra_"))
    .map((i) => ({
      product_id: i.product_id,
      name: i.name,
      price: Number(i.price) || 0,
      quantity: Number(i.quantity) || 0,
      category: i.category ?? null,
      /* Ca in feedul Merchant Center: `slug`, altfel id-ul, pe care vitrina il rezolva la fel. */
      url: linkProdus(storeUrl, i.slug, i.product_id, prefixProdus),
      image_url: i.image ?? null,
    }));
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

/**
 * Citeste comanda si o trece prin poarta de marketplace. `{ sarit }` = nimic de trimis, cu motivul.
 *
 * ⚠ POARTA STA AICI, unde se citeste comanda, nu la apelant: vezi `clientDeMarketplace`. Triggerul
 * din baza are si el una, dar aceea e doar o economie; asta e cea care conteaza.
 */
async function comandaPentruKlaviyo(orderId: string): Promise<{ c: ComandaCitita; config: KlaviyoConfig } | { sarit: string } | { eroare: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("business_id, customer_email, customer_name, total, items, created_at, order_source, payment_method, payment_status, businesses(slug, custom_domain)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { eroare: error.message };
  const c = data as unknown as ComandaCitita | null;
  if (!c) return { sarit: "comanda nu mai exista" };
  if (clientDeMarketplace(c.order_source)) return { sarit: "comanda de marketplace" };
  if (!(c.customer_email ?? "").trim()) return { sarit: "comanda fara email" };
  const config = await readConfig(c.business_id);
  if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return { sarit: "integrarea e oprita" };
  return { c, config };
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
 * Metrica Klaviyo pentru un eveniment al cozii, sau motivul pentru care nu pleaca nimic. Pura.
 *
 * ⚠ „PLACED ORDER” NUMAI PENTRU O VANZARE. La plata online comanda exista inainte ca banii sa intre,
 * iar pana pe 18.09.2026 pleca venit in Klaviyo si pentru platile refuzate sau abandonate. Aceeasi
 * regula ca la Meta, TikTok si GA4 (`vanzare-confirmata.ts`): la card, evenimentul pleaca la plata.
 * Klaviyo pastreaza doar primul eveniment cu acelasi `unique_id`, deci „creata” si „platita” pe
 * aceeasi comanda cu ramburs nu dubleaza nimic.
 */
export function metricaKlaviyo(
  fel: FelEveniment,
  metoda: string | null | undefined,
  stareaPlatii: string | null | undefined,
): { metric: KlaviyoOrderMetric } | { sarit: string } {
  const vanzare = aFostRaportataCaVanzare(metoda, stareaPlatii);
  switch (fel) {
    case "creata":
      return vanzare ? { metric: "Placed Order" } : { sarit: "plata online inca neincasata: pleaca la plata" };
    case "platita":
      return { metric: "Placed Order" };
    case "expediata":
      return vanzare ? { metric: "Fulfilled Order" } : { sarit: "n-a fost raportata ca vanzare" };
    case "livrata":
      return vanzare ? { metric: "Delivered Order" } : { sarit: "n-a fost raportata ca vanzare" };
    case "anulata":
      return vanzare ? { metric: "Cancelled Order" } : { sarit: "n-a fost raportata ca vanzare" };
    case "rambursata":
      return vanzare ? { metric: "Refunded Order" } : { sarit: "n-a fost raportata ca vanzare" };
  }
}

/**
 * Trimite un eveniment al cozii (`lib/email-marketing/coada.ts`) catre Klaviyo. Nu arunca.
 */
export async function evenimentKlaviyo(orderId: string, fel: FelEveniment): Promise<Verdict> {
  try {
    const gasita = await comandaPentruKlaviyo(orderId);
    if ("eroare" in gasita) return { fel: "esuat", motiv: gasita.eroare };
    if ("sarit" in gasita) return { fel: "sarit", motiv: gasita.sarit };
    const { c, config } = gasita;

    const m = metricaKlaviyo(fel, c.payment_method, c.payment_status);
    if ("sarit" in m) return { fel: "sarit", motiv: m.sarit };

    const items = (Array.isArray(c.items) ? c.items : []) as OrderItem[];
    const linii = liniiKlaviyo(items, c.businesses ? storeBaseUrl(c.businesses) : null, await prefixProdusMagazin(c.business_id));
    if (linii.length === 0) return { fel: "sarit", motiv: "comanda fara produse" };

    const { fname, lname } = splitName(c.customer_name);
    const res = await trackOrderEvent(config, m.metric, {
      id: orderId,
      email: (c.customer_email ?? "").trim(),
      first_name: fname,
      last_name: lname,
      total: Number(c.total) || 0,
      currency: MONEDA,
      /* „Placed Order” poarta clipa comenzii; restul, clipa in care s-au intamplat. */
      time: m.metric === "Placed Order" ? (c.created_at ?? undefined) : undefined,
      items: linii,
    });
    if ("error" in res) return verdictDinEroare(res);
    return { fel: "trimis" };
  } catch (e) {
    return { fel: "esuat", motiv: e instanceof Error ? e.message : "exceptie" };
  }
}

/** Sub pragul asta se trimite produs cu produs (imediat); peste el, in joburi in lot. */
const PRAG_DIRECT = 5;

/**
 * Pune produsele in catalogul Klaviyo DUPA STAREA DIN BAZA (vezi `lib/email-marketing/catalog.ts`):
 * toate, cand `ids` lipseste (sincronizarea completa), sau doar cele cerute. Active: publicate;
 * scoase din vanzare: `published: false`; sterse din baza: sterse si din catalog.
 */
export async function sincronizeazaProduseleKlaviyo(
  businessId: string,
  ids?: string[],
): Promise<{ ok: true; active: number; inactive: number; sterse: number } | { error: string; status?: number }> {
  const config = await readConfig(businessId);
  if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) {
    return { error: "Klaviyo nu e conectat sau sincronizarea e-commerce e oprita." };
  }
  const cat = await citesteCatalogul(businessId, ids);
  const conv = (p: ProdusCatalog, publicat: boolean): KlaviyoCatalogProduct => ({
    id: p.id,
    title: p.name,
    description: p.description,
    price: p.price,
    url: linkProdus(cat.adresa, p.slug, p.id, cat.prefixProdus) ?? "",
    image_url: p.image,
    published: publicat,
  });
  const numar = { active: cat.active.length, inactive: cat.inactive.length, sterse: cat.sterse.length };

  if (ids && numar.active + numar.inactive + numar.sterse <= PRAG_DIRECT) {
    for (const p of cat.active) {
      const r = await upsertCatalogItem(config, conv(p, true));
      if ("error" in r) return r;
    }
    for (const p of cat.inactive) {
      const r = await upsertCatalogItem(config, conv(p, false));
      if ("error" in r) return r;
    }
    for (const id of cat.sterse) {
      const r = await deleteCatalogItem(config, id);
      if ("error" in r) return r;
    }
    return { ok: true, ...numar };
  }

  const lot = await catalogInLot(config, cat.active.map((p) => conv(p, true)), cat.inactive.map((p) => conv(p, false)));
  if ("error" in lot) return lot;
  if (cat.sterse.length > 0) {
    const st = await stergeInLot(config, cat.sterse);
    if ("error" in st) return st;
  }
  return { ok: true, ...numar };
}

/** Sync a product create/update/delete to the Klaviyo catalog. No-op unless e-commerce sync is on. */
export async function maybeSyncKlaviyoProduct(opts: {
  businessId: string;
  /** Doar informativ: hotaraste starea din baza (activ, stins, sters). */
  action: "upsert" | "delete";
  product: { id: string; name: string; price: number; slug?: string | null; image?: string | null; description?: string | null };
}): Promise<void> {
  await maybeSyncKlaviyoProductsBulk({ businessId: opts.businessId, ids: [opts.product.id], action: opts.action });
}

/** Bulk catalog sync (a set of ids). No-op unless e-commerce sync is on. Never throws. */
export async function maybeSyncKlaviyoProductsBulk(opts: {
  businessId: string;
  ids: string[];
  /** Doar informativ: hotaraste starea din baza (activ, stins, sters). */
  action: "upsert" | "delete";
}): Promise<void> {
  try {
    if (opts.ids.length === 0) return;
    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;
    const r = await sincronizeazaProduseleKlaviyo(opts.businessId, opts.ids);
    if ("error" in r) {
      await logError({ action: "klaviyo.ecommerce.product", message: r.error, businessId: opts.businessId, details: { produse: opts.ids.length }, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "klaviyo.ecommerce.product", message: (e as Error)?.message ?? "product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}
