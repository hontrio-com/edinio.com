// Server-side dispatcher: sync one contact / order / product into the merchant's Brevo
// account when the integration is connected and the source is enabled. Never throws: it
// must never break the order/popup/form flow it is called from. Contacts and products are
// scheduled with `dupaRaspuns`; ORDER events come from the queue (`lib/email-marketing/coada.ts`,
// filled by a trigger on `orders`), with retries.

import { createAdminClient } from "@/lib/supabase/admin";
import { clientDeMarketplace } from "@/lib/orders/client-de-marketplace";
import { logError } from "@/lib/error-logger";
import { storeBaseUrl } from "@/lib/seo";
import { asteaptaIncasareOnline } from "@/lib/orders/vanzare-confirmata";
import { verdictDinEroare, type FelEveniment, type Verdict } from "@/lib/email-marketing/coada";
import { citesteCatalogul, linkProdus, type ProdusCatalog } from "@/lib/email-marketing/catalog";
import { upsertContact, createDoiContact, splitName, type BrevoConfig, type BrevoContactInput } from "@/lib/brevo";
import {
  syncOrder, batchProducts, brevoStoreId,
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
 * Pune produsele in catalogul Brevo DUPA STAREA DIN BAZA (vezi `lib/email-marketing/catalog.ts`):
 * toate, cand `ids` lipseste (sincronizarea completa), sau doar cele cerute. Totul prin
 * `POST /products/batch` (cate 100, `updateEnabled: true`): active normal, scoase din vanzare sau
 * sterse cu `isDeleted: true`.
 *
 * ⚠ Produsele sterse din baza nu mai au nume, iar Brevo cere numele la CREARE. Pleaca cu un nume de
 * rezerva: daca Brevo nu le avea, ce se creeaza e deja sters, deci nu apare nicaieri.
 */
export async function sincronizeazaProduseleBrevo(
  businessId: string,
  ids?: string[],
): Promise<{ ok: true; active: number; inactive: number; sterse: number } | { error: string; status?: number }> {
  const config = await readConfig(businessId);
  if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) {
    return { error: "Brevo nu e conectat sau sincronizarea e-commerce e oprita." };
  }
  const cat = await citesteCatalogul(businessId, ids);
  const conv = (p: ProdusCatalog): BrevoEcomProduct => ({
    id: p.id, name: p.name, price: p.price,
    url: linkProdus(cat.adresa, p.slug, p.id),
    image_url: p.image,
  });
  if (cat.active.length > 0) {
    const r = await batchProducts(config, cat.active.map(conv));
    if ("error" in r) return r;
  }
  const scoase = [...cat.inactive.map(conv), ...cat.sterse.map((id) => ({ id, name: "Produs sters", price: 0 }))];
  if (scoase.length > 0) {
    const r = await batchProducts(config, scoase, true);
    if ("error" in r) return r;
  }
  return { ok: true, active: cat.active.length, inactive: cat.inactive.length, sterse: cat.sterse.length };
}

/** Sync a product create/update/delete to Brevo. No-op unless e-commerce sync is on. */
export async function maybeSyncBrevoProduct(opts: {
  businessId: string;
  /** Doar informativ: hotaraste starea din baza (activ, stins, sters). */
  action: "upsert" | "delete";
  product: { id: string; name: string; price: number; slug?: string | null; image?: string | null };
}): Promise<void> {
  await maybeSyncBrevoProductsBulk({ businessId: opts.businessId, ids: [opts.product.id], action: opts.action });
}

type ComandaCitita = {
  business_id: string;
  customer_email: string | null;
  customer_phone: string | null;
  total: number | string | null;
  items: unknown;
  created_at: string | null;
  order_source: unknown;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  discount_code: string | null;
  shipping_address: unknown;
  businesses: { slug: string; custom_domain: string | null } | null;
};

/**
 * Statusul comenzii in vocabularul Brevo, din starea CURENTA a randului. Pura.
 *
 * Exemplele lor sunt `completed` si `cancelled`; restul urmeaza WooCommerce, pe care il folosesc
 * pluginurile lor: `pending` (plata online inca neincasata), `processing` (vanzare confirmata, inca
 * nelivrata), `completed` (expediata sau livrata), `cancelled`, `refunded`.
 *
 * ⚠ DIN RAND, NU DIN EVENIMENT. Brevo pastreaza un singur status pe comanda, iar evenimentele pot
 * ajunge in orice ordine fata de viata comenzii (la ramburs, „platita” vine DUPA livrare). Citit din
 * starea curenta, fiecare trimitere pune statusul adevarat, oricare ar fi evenimentul care a pornit-o.
 */
export function statusBrevo(
  status: string | null | undefined,
  plata: string | null | undefined,
  metoda: string | null | undefined,
): string {
  const s = (status ?? "").toLowerCase();
  const p = (plata ?? "").toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (s === "refunded" || p === "refunded") return "refunded";
  if (s === "shipped" || s === "delivered") return "completed";
  if (p === "paid" || !asteaptaIncasareOnline(metoda)) return "processing";
  return "pending";
}

/**
 * Trimite un eveniment al cozii (`lib/email-marketing/coada.ts`) catre Brevo: comanda se retrimite
 * intreaga (`POST /orders/status` e upsert dupa id), cu statusul de acum. Nu arunca.
 */
export async function evenimentBrevo(orderId: string, fel: FelEveniment): Promise<Verdict> {
  /* Evenimentul doar PORNESTE trimiterea: statusul se citeste din rand (`statusBrevo`), oricare ar fi. */
  void fel;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("business_id, customer_email, customer_phone, total, items, created_at, order_source, status, payment_status, payment_method, discount_code, shipping_address, businesses(slug, custom_domain)")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return { fel: "esuat", motiv: error.message };
    const order = data as unknown as ComandaCitita | null;
    if (!order) return { fel: "sarit", motiv: "comanda nu mai exista" };
    /*
     * ⚠ POARTA STA AICI, unde se citeste comanda, nu la apelant: vezi `clientDeMarketplace`.
     * Triggerul din baza are si el una, dar aceea e doar o economie.
     */
    if (clientDeMarketplace(order.order_source)) return { fel: "sarit", motiv: "comanda de marketplace" };
    const email = (order.customer_email ?? "").trim();
    if (!email) return { fel: "sarit", motiv: "comanda fara email" };

    const config = await readConfig(order.business_id);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) {
      return { fel: "sarit", motiv: "integrarea e oprita" };
    }

    const items = (Array.isArray(order.items) ? order.items : []) as OrderItem[];
    const base = order.businesses ? storeBaseUrl(order.businesses) : null;
    const lines = toLines(items, base);
    if (lines.length === 0) return { fel: "sarit", motiv: "comanda fara produse" };

    const adr = (order.shipping_address ?? {}) as { address?: string; city?: string; county?: string; postcode?: string; country?: string };
    const res = await syncOrder(config, {
      id: orderId,
      email,
      status: statusBrevo(order.status, order.payment_status, order.payment_method),
      amount: Number(order.total) || 0,
      created_at: order.created_at ?? undefined,
      coupons: order.discount_code ? [order.discount_code] : undefined,
      billing: {
        address: adr.address, city: adr.city, region: adr.county, postCode: adr.postcode,
        countryCode: /^[A-Za-z]{2}$/.test(adr.country ?? "") ? (adr.country as string).toUpperCase() : undefined,
        phone: order.customer_phone ?? undefined,
        paymentMethod: order.payment_method ?? undefined,
      },
      lines,
    }, brevoStoreId(order.business_id));
    if ("error" in res) return verdictDinEroare(res);
    return { fel: "trimis" };
  } catch (e) {
    return { fel: "esuat", motiv: e instanceof Error ? e.message : "exceptie" };
  }
}

/** Bulk product sync (a set of ids). No-op unless e-commerce sync is on. Never throws. */
export async function maybeSyncBrevoProductsBulk(opts: {
  businessId: string;
  ids: string[];
  /** Doar informativ: hotaraste starea din baza (activ, stins, sters). */
  action: "upsert" | "delete";
}): Promise<void> {
  try {
    if (opts.ids.length === 0) return;
    const config = await readConfig(opts.businessId);
    if (!config?.enabled || !config.api_key || !config.list_id || !config.ecommerce_sync) return;
    const r = await sincronizeazaProduseleBrevo(opts.businessId, opts.ids);
    if ("error" in r) {
      await logError({ action: "brevo.ecommerce.product", message: r.error, businessId: opts.businessId, details: { produse: opts.ids.length }, severity: "warning" });
    }
  } catch (e) {
    await logError({ action: "brevo.ecommerce.product", message: (e as Error)?.message ?? "product sync failed", businessId: opts.businessId, severity: "warning" });
  }
}
