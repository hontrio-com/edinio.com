// Server-side dispatcher: sync one subscriber into the merchant's Mailchimp audience
// when the integration is connected and the source is enabled. Never throws: it must
// never break the order/popup/form flow it is called from. Contacts and products are
// scheduled with `dupaRaspuns`; ORDER events come from the queue (`lib/email-marketing/coada.ts`,
// filled by a trigger on `orders`), with retries.

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { clientDeMarketplace } from "@/lib/orders/client-de-marketplace";
import { storeBaseUrl } from "@/lib/seo";
import { verdictDinEroare, type FelEveniment, type Verdict } from "@/lib/email-marketing/coada";
import { citesteCatalogul, linkProdus, type ProdusCatalog } from "@/lib/email-marketing/catalog";
import { mcRequest, upsertMember, splitName, type MailchimpConfig } from "@/lib/mailchimp";
import {
  ensureStore, upsertProduct, deleteProduct, syncOrder, corpComandaIntoarsa, catalogInLot,
  type EcomProduct,
} from "@/lib/mailchimp-ecommerce";
import { prefixProdusMagazin } from "@/lib/storefront/prefix-produs-server";

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

async function readConfig(businessId: string): Promise<MailchimpConfig | null> {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("mailchimp_config").eq("business_id", businessId).single();
  return (settings?.mailchimp_config as MailchimpConfig | null) ?? null;
}

/** Sub pragul asta se trimite produs cu produs (imediat); peste el, prin loturi (`/batches`). */
const PRAG_DIRECT = 5;

/**
 * Pune produsele in catalogul Mailchimp DUPA STAREA DIN BAZA (vezi `lib/email-marketing/catalog.ts`):
 * toate, cand `ids` lipseste (sincronizarea completa), sau doar cele cerute. Active: `PUT` (creat sau
 * actualizat); scoase din vanzare sau sterse din baza: sterse din catalog (Mailchimp n-are produs
 * nepublicat).
 *
 * ⚠ Linkul produsului se calculeaza AICI. Pana pe 18.09.2026 se astepta un `storeUrl` de la apelant,
 * pe care niciun apelant nu-l trimitea: produsele din Mailchimp n-aveau niciun link, deci blocurile
 * de produs din emailuri nu duceau nicaieri.
 */
export async function sincronizeazaProduseleMailchimp(
  businessId: string,
  ids?: string[],
): Promise<{ ok: true; active: number; inactive: number; sterse: number; loturi: string[] } | { error: string; status?: number }> {
  const config = await readConfig(businessId);
  if (!config?.enabled || !config.api_key || !config.audience_id || !config.ecommerce_sync) {
    return { error: "Mailchimp nu e conectat sau sincronizarea e-commerce e oprita." };
  }
  let storeId = config.ecommerce_store_id;
  if (!storeId) {
    const admin = createAdminClient();
    const { data: biz } = await admin.from("businesses").select("store_name, business_name, custom_domain, email").eq("id", businessId).single();
    const s = await ensureStore(config, businessId, {
      name: biz?.store_name || biz?.business_name || "Magazin",
      currency: "RON",
      domain: biz?.custom_domain ?? undefined,
      email: biz?.email ?? undefined,
    });
    if ("error" in s) return s;
    storeId = s.storeId;
  }

  const cat = await citesteCatalogul(businessId, ids);
  const conv = (p: ProdusCatalog): EcomProduct => ({
    id: p.id, title: p.name, price: p.price,
    url: linkProdus(cat.adresa, p.slug, p.id, cat.prefixProdus),
    image_url: p.image,
  });
  const scoase = [...cat.inactive.map((p) => p.id), ...cat.sterse];
  const numar = { active: cat.active.length, inactive: cat.inactive.length, sterse: cat.sterse.length };

  if (ids && cat.active.length + scoase.length <= PRAG_DIRECT) {
    for (const p of cat.active) {
      const r = await upsertProduct(config, storeId, conv(p));
      if ("error" in r) return r;
    }
    for (const id of scoase) {
      const r = await deleteProduct(config, storeId, id);
      if ("error" in r) return r;
    }
    return { ok: true, ...numar, loturi: [] };
  }

  const lot = await catalogInLot(config, storeId, cat.active.map(conv), scoase);
  if ("error" in lot) return lot;
  return { ok: true, ...numar, loturi: lot.loturi };
}

/** Sync a product create/update/delete to the Mailchimp store. No-op unless e-commerce sync is on. */
export async function maybeSyncMailchimpProduct(opts: {
  businessId: string;
  /** Doar informativ: hotaraste starea din baza (activ, stins, sters). */
  action: "upsert" | "delete";
  product: { id: string; name: string; price: number; slug?: string | null; image?: string | null };
}): Promise<void> {
  await maybeSyncMailchimpProductsBulk({ businessId: opts.businessId, ids: [opts.product.id], action: opts.action });
}

type ComandaCitita = {
  business_id: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total: number | string | null;
  items: unknown;
  created_at: string | null;
  order_source: unknown;
  status: string | null;
  payment_status: string | null;
  discount_code: string | null;
  discount_amount: number | string | null;
  shipping_cost: number | string | null;
  shipping_address: unknown;
  businesses: { slug: string; custom_domain: string | null; store_name: string | null; business_name: string | null; email: string | null } | null;
};

/** Starea financiara Mailchimp din starea CURENTA a comenzii. Pura. */
export function stareFinanciaraMailchimp(status: string | null | undefined, plata: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  const p = (plata ?? "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "refunded" || p === "refunded") return "refunded";
  if (p === "paid") return "paid";
  return "pending";
}

/**
 * Atribuirea venitului pe campanie, din fotografia facuta la aterizare (`order_source`). Pura.
 *
 * ⚠ FARA `campaign_id`, MAILCHIMP NU STIE CAREI CAMPANII SA-I DEA VENITUL. Linkurile din campaniile
 * lor poarta `mc_cid` (campania) si uneori `mc_tc` (codul de urmarire, a carui singura valoare
 * permisa de spec e `prec`). Pana pe 18.09.2026 nu le captam deloc.
 */
export function atribuireMailchimp(
  orderSource: unknown,
  origine: string | null,
): { campaign_id?: string; tracking_code?: string; landing_site?: string } {
  const src = (orderSource ?? {}) as { mc_cid?: unknown; mc_tc?: unknown; landing?: unknown };
  const out: { campaign_id?: string; tracking_code?: string; landing_site?: string } = {};
  if (typeof src.mc_cid === "string" && /^[A-Za-z0-9]{1,50}$/.test(src.mc_cid)) out.campaign_id = src.mc_cid;
  if (src.mc_tc === "prec") out.tracking_code = "prec";
  if (origine && typeof src.landing === "string" && src.landing.startsWith("/")) out.landing_site = `${origine}${src.landing}`;
  return out;
}

/**
 * Trimite un eveniment al cozii (`lib/email-marketing/coada.ts`) catre Mailchimp. Nu arunca.
 *
 * „creata” pune comanda intreaga (`PUT`, idempotent), cu starea de ACUM. Restul sunt schimbari
 * punctuale (`PATCH`): fiecare camp porneste la ei o notificare anume, deci nu se retrimite tot.
 * O comanda pe care Mailchimp n-o are (404: sincronizarea pornita dupa ea) n-are ce schimba.
 */
export async function evenimentMailchimp(orderId: string, fel: FelEveniment): Promise<Verdict> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("business_id, customer_email, customer_name, customer_phone, total, items, created_at, order_source, status, payment_status, discount_code, discount_amount, shipping_cost, shipping_address, businesses(slug, custom_domain, store_name, business_name, email)")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return { fel: "esuat", motiv: error.message };
    const c = data as unknown as ComandaCitita | null;
    if (!c) return { fel: "sarit", motiv: "comanda nu mai exista" };
    /*
     * ⚠ POARTA STA AICI, unde se citeste comanda, nu la apelant: vezi `clientDeMarketplace`.
     * Triggerul din baza are si el una, dar aceea e doar o economie.
     */
    if (clientDeMarketplace(c.order_source)) return { fel: "sarit", motiv: "comanda de marketplace" };
    const email = (c.customer_email ?? "").trim();
    if (!email) return { fel: "sarit", motiv: "comanda fara email" };

    const config = await readConfig(c.business_id);
    if (!config?.enabled || !config.api_key || !config.audience_id || !config.ecommerce_sync) {
      return { fel: "sarit", motiv: "integrarea e oprita" };
    }

    let storeId = config.ecommerce_store_id;
    if (!storeId) {
      /* Magazinul de comert nu s-a facut la salvare: il facem acum. */
      const biz = c.businesses;
      const s = await ensureStore(config, c.business_id, {
        name: biz?.store_name || biz?.business_name || "Magazin",
        currency: "RON",
        domain: biz?.custom_domain ?? undefined,
        email: biz?.email ?? undefined,
      });
      if ("error" in s) return verdictDinEroare(s);
      storeId = s.storeId;
    }

    const cale = `/ecommerce/stores/${storeId}/orders/${encodeURIComponent(orderId)}`;
    const patch = async (corp: Record<string, string>): Promise<Verdict> => {
      const r = await mcRequest(config, "PATCH", cale, corp);
      if ("error" in r) return r.status === 404 ? { fel: "sarit", motiv: "comanda nu exista in Mailchimp" } : verdictDinEroare(r);
      return { fel: "trimis" };
    };

    switch (fel) {
      case "platita": return patch({ financial_status: "paid" });
      case "expediata": return patch({ fulfillment_status: "shipped" });
      case "livrata": return { fel: "sarit", motiv: "Mailchimp n-are stare de livrare" };
      case "anulata": return patch(corpComandaIntoarsa("anulata", new Date().toISOString()));
      case "rambursata": return patch(corpComandaIntoarsa("rambursata", new Date().toISOString()));
      case "creata": break;
    }

    const items = (Array.isArray(c.items) ? c.items : []) as Array<{ product_id: string; name: string; price: number; quantity: number; slug?: string | null; image?: string | null }>;
    const base = c.businesses ? storeBaseUrl(c.businesses) : null;
    const prefixProdus = await prefixProdusMagazin(c.business_id);
    const linii = items
      .filter((it) => !String(it.product_id).startsWith("extra_"))
      .map((it) => ({
        product: {
          id: it.product_id,
          title: it.name,
          url: linkProdus(base, it.slug, it.product_id, prefixProdus),
          image_url: it.image ?? null,
          price: Number(it.price) || 0,
        } as EcomProduct,
        quantity: Number(it.quantity) || 0,
        price: Number(it.price) || 0,
      }));
    if (linii.length === 0) return { fel: "sarit", motiv: "comanda fara produse" };

    const s = (c.status ?? "").toLowerCase();
    const reducere = Number(c.discount_amount) || 0;
    const adr = (c.shipping_address ?? {}) as { address?: string; city?: string; county?: string; postcode?: string; country?: string };
    const { fname, lname } = splitName(c.customer_name);
    const res = await syncOrder(config, storeId, {
      id: orderId,
      email,
      first_name: fname,
      last_name: lname,
      currency_code: "RON",
      total: Number(c.total) || 0,
      processed_at: c.created_at ?? undefined,
      financial_status: stareFinanciaraMailchimp(c.status, c.payment_status),
      fulfillment_status: s === "shipped" || s === "delivered" ? "shipped" : undefined,
      cancelled_at: s === "cancelled" ? new Date().toISOString() : undefined,
      ...atribuireMailchimp(c.order_source, base ? new URL(base).origin : null),
      shipping_total: Number(c.shipping_cost) || 0,
      discount_total: reducere,
      promos: c.discount_code && reducere > 0 ? [{ code: c.discount_code, amount_discounted: reducere, type: "fixed" }] : undefined,
      shipping_address: {
        name: c.customer_name ?? undefined, address1: adr.address, city: adr.city, province: adr.county,
        postal_code: adr.postcode,
        country_code: /^[A-Za-z]{2}$/.test(adr.country ?? "") ? (adr.country as string).toUpperCase() : undefined,
        phone: c.customer_phone ?? undefined,
      },
      lines: linii,
    });
    if ("error" in res) return verdictDinEroare(res);
    return { fel: "trimis" };
  } catch (e) {
    return { fel: "esuat", motiv: e instanceof Error ? e.message : "exceptie" };
  }
}

/** Bulk product sync (a set of ids). No-op unless e-commerce sync is on. Never throws. */
export async function maybeSyncMailchimpProductsBulk(opts: {
  businessId: string;
  ids: string[];
  /** Doar informativ: hotaraste starea din baza (activ, stins, sters). */
  action: "upsert" | "delete";
}): Promise<void> {
  try {
    if (opts.ids.length === 0) return;
    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.audience_id || !config.ecommerce_sync) return;
    const r = await sincronizeazaProduseleMailchimp(opts.businessId, opts.ids);
    if ("error" in r) {
      await logError({ action: "mailchimp.ecommerce.product", message: r.error, businessId: opts.businessId, details: { produse: opts.ids.length }, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "mailchimp.ecommerce.product", message: (e as Error)?.message ?? "product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}
