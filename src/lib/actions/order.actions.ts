"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseNotificationsConfig, sendNewOrderEmail, sendOrderConfirmationToCustomer, sendOrderStatusToCustomer, sendCustomerMessage } from "@/lib/email";
import { getStoreEmailSender } from "@/lib/email/sender";
import { logError } from "@/lib/error-logger";
import { validateDiscount } from "@/lib/actions/discount.actions";
import { markCartConverted } from "@/lib/abandoned-cart";
import type { OrderSource } from "@/lib/storefront/attribution";
import { enabledComboPriceMap } from "@/lib/storefront/variants";
import { expandBundleStock } from "@/lib/bundles";
import { applyBumpPricing, applyFbtPricing } from "@/lib/offers/offers";
import { enqueueGmcSyncMany } from "@/lib/google-merchant/queue";
import { sendGa4Purchase, sendGa4Refund } from "@/lib/google-analytics/mp";
import type { GoogleAnalyticsConfig } from "@/lib/google-analytics/types";
import { enqueueOlxSyncMany } from "@/lib/olx/queue";
import { enqueueAboutYouStockMany } from "@/lib/aboutyou/queue";
import { enqueueTrendyolInventoryMany } from "@/lib/trendyol/queue";
import { computeCardDiscount, parseCardDiscountConfig } from "@/lib/payment-methods";
import { sendSms } from "@/lib/smso";
import type { SmsoConfig } from "@/lib/smso";
import { maybeSendNoticeNotification, noticeTriggerForStatus, noticeTriggerForPayment } from "@/lib/notice-notify";
import { maybeSyncMailchimpSubscriber, maybeSyncMailchimpOrder, maybeMarkMailchimpOrderPaid, orderValueTag } from "@/lib/mailchimp-sync";
import { maybeSyncBrevoSubscriber, maybeSyncBrevoOrder, maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";
import { maybeSyncKlaviyoSubscriber, maybeTrackKlaviyoOrder } from "@/lib/klaviyo-sync";
import { formatPrice, formatDate } from "@/lib/utils/format";

// Base URL for building public store links used in notice.ro SMS templates ({store_url}/{url}).
const STORE_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ── Server-authoritative pricing ─────────────────────────────────────────────
// Customers are anonymous and prices arrive from the browser; they must NEVER be
// trusted. We reload the product and recompute every legitimate price from the
// product's own configuration, then match the submitted amount against it.

type OrderProduct = {
  id: string;
  price: number;
  is_active: boolean;
  business_id: string;
  page_sections: unknown;
};

// All legitimate per-unit prices: base price + every enabled variant combination.
function legitUnitPrices(product: OrderProduct): number[] {
  const set = new Set<number>([round2(product.price)]);
  const ps = (product.page_sections ?? {}) as {
    variants?: { enabled?: boolean; combinations?: Array<{ enabled?: boolean; price?: number | null }> };
  };
  if (ps.variants?.enabled && Array.isArray(ps.variants.combinations)) {
    for (const c of ps.variants.combinations) {
      if (c?.enabled && c.price != null) set.add(round2(Number(c.price)));
    }
  }
  return [...set];
}

// Legitimate bundle totals for a given unit price and quantity (mirrors ProductPage
// quantity-tier math: plain qty*unit is always valid; tiers 2/3 add bundle prices).
function legitBundleTotals(product: OrderProduct, unit: number, quantity: number): number[] {
  const totals = [round2(unit * quantity)];
  const ps = (product.page_sections ?? {}) as {
    quantity_tiers?: { enabled?: boolean; mode?: string; tier2_price?: number; tier3_price?: number; tier2_percent?: number; tier3_percent?: number };
  };
  const t = ps.quantity_tiers;
  if (t?.enabled) {
    const isPercent = t.mode === "percent";
    if (quantity === 2) {
      const p = isPercent ? unit * 2 * (1 - (t.tier2_percent ?? 0) / 100) : Number(t.tier2_price ?? 0);
      if (p > 0) totals.push(round2(p));
    } else if (quantity === 3) {
      const p = isPercent ? unit * 3 * (1 - (t.tier3_percent ?? 0) / 100) : Number(t.tier3_price ?? 0);
      if (p > 0) totals.push(round2(p));
    }
  }
  return totals;
}

// Returns the authoritative pre-discount subtotal, or null if the claimed unit
// price cannot be reconciled with any legitimate configuration.
function authoritativeSubtotal(product: OrderProduct, claimedUnit: number, quantity: number): number | null {
  if (!Number.isFinite(claimedUnit) || quantity < 1) return null;
  const claimed = round2(claimedUnit * quantity);
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const unit of legitUnitPrices(product)) {
    for (const candidate of legitBundleTotals(product, unit, quantity)) {
      const d = Math.abs(candidate - claimed);
      if (d < bestDiff) { bestDiff = d; best = candidate; }
    }
  }
  // Tolerance absorbs rounding only; real tampering is orders of magnitude away.
  return best !== null && bestDiff <= 0.5 ? best : null;
}

type CheckoutExtra = { id: string; label: string; price: number };

// Load and validate the store-defined checkout extras (server-authoritative prices).
function validateExtras(
  pageContent: unknown,
  clientExtras: { id: string; label: string; price: number }[] | undefined,
): CheckoutExtra[] {
  const serverExtras = ((pageContent as { checkout_config?: { extras?: CheckoutExtra[] } } | null)?.checkout_config?.extras) ?? [];
  const byId = new Map(serverExtras.map((e) => [e.id, e]));
  return (clientExtras ?? [])
    .map((e) => byId.get(e.id))
    .filter((e): e is CheckoutExtra => !!e)
    .map((e) => ({ id: e.id, label: e.label, price: round2(Number(e.price)) }));
}

async function buildOrderNumber(supabase: SupabaseClient, businessId: string): Promise<string> {
  const { data: settings } = await supabase
    .from("store_settings")
    .select("order_number_format")
    .eq("business_id", businessId)
    .single();

  if (settings?.order_number_format === "sequential") {
    const { data: counter } = await supabase.rpc("next_order_number", { p_business_id: businessId });
    const n = (counter as number) ?? 1;
    return `#${String(n).padStart(4, "0")}`;
  }

  return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

// Merge client-captured attribution with the server-side user-agent into the
// stored order_source (null when there's nothing to record).
function buildOrderSource(source: OrderSource | undefined, userAgent: string | undefined): OrderSource | null {
  if (!source && !userAgent) return null;
  return { ...(source ?? {}), ...(userAgent ? { user_agent: userAgent } : {}) };
}

// Fire a server-side GA4 event (Measurement Protocol) for an order — purchase at
// checkout, refund on cancel/refund. Fire-and-forget: loads the store's GA config
// and never throws into the caller.
async function ga4OrderEvent(
  businessId: string,
  kind: "purchase" | "refund",
  o: { transactionId: string; value: number; clientId?: string; items: { product_id?: string; name: string; price: number; quantity: number }[] },
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("store_settings").select("google_analytics_config").eq("business_id", businessId).single();
    const cfg = (data?.google_analytics_config as GoogleAnalyticsConfig | null) ?? null;
    if (!cfg?.measurement_id || !cfg?.api_secret) return;
    const mp = { measurementId: cfg.measurement_id, apiSecret: cfg.api_secret };
    const items = o.items.map((i) => ({ item_id: i.product_id, item_name: i.name, price: i.price, quantity: i.quantity }));
    const payload = { transactionId: o.transactionId, value: o.value, clientId: o.clientId, items };
    if (kind === "purchase") await sendGa4Purchase(mp, payload);
    else await sendGa4Refund(mp, payload);
  } catch {
    // best-effort
  }
}

export async function placeOrder(data: {
  business_id: string;
  cart_session_id?: string;
  product_id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  shipping_cost: number;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  newsletter_opt_in?: boolean;
  customer_county: string;
  customer_city: string;
  customer_address: string;
  customer_country?: string;
  customer_postal_code?: string;
  discount_id?: string;
  discount_code?: string;
  discount_amount?: number;
  extras?: { id: string; label: string; price: number }[];
  custom_fields?: Record<string, string>;
  customization?: Record<string, { type: string; label: string; value: string | string[] }>;
  /** Items carried over from the storefront cart (priced server-side; variant lines
   *  are re-priced from the product's enabled combination, base otherwise). */
  additional_items?: { product_id: string; name: string; quantity: number; variant_title?: string }[];
  /** Ids of order-bump offers the customer accepted — re-priced server-side (never trusted). */
  accepted_offer_ids?: string[];
  payment_method?: string;
  selected_courier?: string;
  courier_label?: string;
  delivery_type?: string;
  locker_id?: string;
  locker_name?: string;
  locker_address?: string;
  locker_city?: string;
  locker_county?: string;
  woot_service_id?: number;
  woot_courier_name?: string;
  woot_service_name?: string;
  colete_service_id?: number;
  colete_service_name?: string;
  /** First-touch attribution captured client-side (utm / referrer / ad click id). */
  source?: OrderSource;
}) {
  // Anti-abuse: order creation is anonymous and triggers SMS/email (real cost).
  // Throttle per IP so a script can't drain SMS credit or spam the merchant.
  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  const userAgent = hdrs.get("user-agent")?.slice(0, 300) || undefined;
  if (!rateLimit(`placeOrder:${ip}`, 10, 60_000)) {
    return { error: "Prea multe incercari. Te rugam asteapta un minut si incearca din nou." };
  }

  // Use admin client for order creation — customers are anonymous, RLS requires service role
  const admin = createAdminClient();

  // Reload product + store config and recompute every price server-side.
  const [{ data: product }, { data: cfgRow }] = await Promise.all([
    admin.from("products")
      .select("id, price, is_active, business_id, page_sections")
      .eq("id", data.product_id)
      .eq("business_id", data.business_id)
      .single(),
    admin.from("store_settings")
      .select("page_content, free_shipping_threshold, min_order_amount, card_discount_config")
      .eq("business_id", data.business_id)
      .single(),
  ]);

  if (!product || !product.is_active) {
    return { error: "Produsul nu mai este disponibil. Reincarca pagina." };
  }

  const mainSubtotal = authoritativeSubtotal(product as OrderProduct, data.product_price, data.quantity);
  if (mainSubtotal === null) {
    logError({ action: "placeOrder.priceRejected", message: "Client price did not match any legitimate configuration", details: { businessId: data.business_id, productId: data.product_id, claimedUnit: data.product_price, quantity: data.quantity }, severity: "warning" });
    return { error: "Pretul comenzii nu este valid. Reincarca pagina si incearca din nou." };
  }

  // Items carried over from the cart (product-page "Comanda" with a non-empty cart).
  // Priced server-side at the product's current base price — never trusted from the
  // client (same model as placeCartOrder). The current product is excluded to avoid
  // double-counting, and unavailable/inactive items are dropped.
  let cartItems: { product_id: string; name: string; price: number; quantity: number }[] = [];
  if (data.additional_items?.length) {
    const ids = [...new Set(data.additional_items.map((i) => i.product_id))].filter((id) => id !== data.product_id);
    if (ids.length > 0) {
      const { data: extraProducts } = await admin.from("products").select("id, name, price, is_active, page_sections").in("id", ids).eq("business_id", data.business_id);
      const extraMap = new Map((extraProducts ?? []).filter((p) => p.is_active).map((p) => {
        const base = round2(Number(p.price));
        return [p.id, { name: String(p.name), price: base, combos: enabledComboPriceMap(p.page_sections, base) }];
      }));
      cartItems = data.additional_items
        .filter((i) => i.product_id !== data.product_id && extraMap.has(i.product_id) && i.quantity > 0)
        .map((i) => {
          const meta = extraMap.get(i.product_id)!;
          // Named variant priced from its enabled combination; unknown/disabled
          // variants and simple products fall back to the product's base price.
          const variantPrice = i.variant_title ? meta.combos.get(i.variant_title) : undefined;
          return {
            product_id: i.product_id,
            name: i.variant_title ? `${meta.name} (${i.variant_title})` : meta.name,
            price: variantPrice != null ? round2(variantPrice) : meta.price,
            quantity: Math.floor(i.quantity),
          };
        });
    }
  }
  // Order bumps: re-price accepted bump lines at the offer's authoritative discounted
  // price (server-side; the client can't forge it). No-op without accepted_offer_ids.
  if (data.accepted_offer_ids?.length) {
    const bumped = await applyBumpPricing(admin, data.business_id, data.accepted_offer_ids, cartItems);
    cartItems = bumped.items;
    // FBT: distribute the "bought together" set discount across the companion lines.
    // Anchor priced at the product's BASE price — matches the set pricing the storefront
    // showed (resolveProductOffers uses the base price), so preview and charge agree.
    const fbt = await applyFbtPricing(admin, data.business_id, data.accepted_offer_ids, data.product_id, round2(Number(product.price)), cartItems);
    cartItems = fbt.items;
  }
  const cartSubtotal = round2(cartItems.reduce((s, i) => s + i.price * i.quantity, 0));
  const subtotal = round2(mainSubtotal + cartSubtotal);

  // Enforce the merchant's minimum order value (Setari > Livrare) against the authoritative subtotal.
  const minOrder = cfgRow?.min_order_amount != null ? Number(cfgRow.min_order_amount) : null;
  if (minOrder !== null && subtotal < minOrder) {
    return { error: `Comanda minima este de ${minOrder} lei. Mai adauga produse pentru a finaliza comanda.` };
  }

  const validatedExtras = validateExtras(cfgRow?.page_content, data.extras);
  const extrasTotal = validatedExtras.reduce((s, e) => s + e.price, 0);

  // Re-validate the discount server-side against the authoritative subtotal.
  let discountAmount = 0;
  let validDiscountId: string | undefined;
  let isFreeShipping = false;
  if (data.discount_code) {
    const dres = await validateDiscount(data.discount_code, data.business_id, subtotal);
    if (dres.valid) {
      discountAmount = Math.min(dres.discount.discountAmount, subtotal);
      validDiscountId = dres.discount.id;
      isFreeShipping = dres.discount.type === "free_shipping";
    }
  }

  // Card-payment discount: applies only to online card methods, on the goods
  // value (subtotal + extras, after any promo), never on shipping. Computed
  // server-side and baked into total so the card processor charges the right sum.
  const cardDiscount = computeCardDiscount(
    parseCardDiscountConfig(cfgRow?.card_discount_config),
    data.payment_method,
    subtotal + extrasTotal - discountAmount,
  );

  // Shipping clamped non-negative; zeroed when free-shipping rules apply.
  const freeThreshold = cfgRow?.free_shipping_threshold != null ? Number(cfgRow.free_shipping_threshold) : null;
  let shipping = Math.max(0, round2(data.shipping_cost));
  if (isFreeShipping || (freeThreshold !== null && subtotal >= freeThreshold)) shipping = 0;

  const total = Math.max(0, round2(subtotal + extrasTotal - discountAmount - cardDiscount + shipping));

  // Bundle-aware stock: expand a bundle into its components + validate availability
  // before creating the order (prevents overselling components).
  const stockExp = await expandBundleStock(admin, data.business_id, [
    { product_id: data.product_id, quantity: data.quantity },
    ...cartItems.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
  ]);
  if ("error" in stockExp) return { error: stockExp.error };

  const order_number = await buildOrderNumber(admin, data.business_id);

  const unitPrice = round2(mainSubtotal / data.quantity);
  const allItems = [
    {
      product_id: data.product_id,
      name: data.product_name,
      price: unitPrice,
      quantity: data.quantity,
      ...(data.customization && { customization: data.customization }),
    },
    ...cartItems,
    ...validatedExtras.map(e => ({ product_id: `extra_${e.id}`, name: e.label, price: e.price, quantity: 1 })),
  ];

  const { data: order, error } = await admin.from("orders").insert({
    business_id: data.business_id,
    order_number,
    customer_name: data.customer_name.trim(),
    customer_phone: data.customer_phone.trim(),
    customer_email: data.customer_email?.trim() || null,
    shipping_address: {
      county: data.customer_county,
      city: data.customer_city.trim(),
      address: data.customer_address.trim(),
      ...(data.customer_country && data.customer_country !== "RO" && {
        country: data.customer_country,
        postal_code: data.customer_postal_code?.trim() || "",
      }),
      ...(data.selected_courier && {
        courier: data.selected_courier,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
      }),
      ...(data.locker_id && {
        locker_id: data.locker_id,
        locker_name: data.locker_name,
        locker_address: data.locker_address,
        locker_city: data.locker_city,
        locker_county: data.locker_county,
      }),
      ...(data.woot_service_id && {
        woot_service_id: data.woot_service_id,
        woot_courier_name: data.woot_courier_name,
        woot_service_name: data.woot_service_name,
      }),
      ...(data.colete_service_id && {
        colete_service_id: data.colete_service_id,
        colete_service_name: data.colete_service_name,
      }),
    },
    items: allItems,
    subtotal,
    shipping_cost: shipping,
    discount_code: validDiscountId ? data.discount_code : null,
    discount_amount: discountAmount,
    card_discount_amount: cardDiscount,
    total,
    notes: data.custom_fields && Object.keys(data.custom_fields).length > 0 ? data.custom_fields as unknown as string : null,
    payment_method: data.payment_method ?? "cash_on_delivery",
    payment_status: "unpaid",
    status: "pending",
    order_source: buildOrderSource(data.source, userAgent) as never,
  }).select("id, order_number").single();

  if (error) {
    logError({ action: "placeOrder", message: error.message, details: { code: error.code, hint: error.hint, businessId: data.business_id }, severity: "critical" });
    return { error: "Eroare la plasarea comenzii. Incearca din nou." };
  }

  if (validDiscountId) {
    await admin.rpc("increment_discount_uses", { p_discount_id: validDiscountId });
  }

  // Atomic stock decrement — bundle components when ordering a bundle, else the product itself.
  await admin.rpc("decrement_stock_batch" as never, { p_items: stockExp.decrements } as never);

  // Reflect stock/availability changes in Google Merchant + OLX (if connected).
  void enqueueGmcSyncMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), data.product_id, ...cartItems.map((i) => i.product_id)]);
  void enqueueOlxSyncMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), data.product_id, ...cartItems.map((i) => i.product_id)]);
  void enqueueAboutYouStockMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), data.product_id, ...cartItems.map((i) => i.product_id)]);
  void enqueueTrendyolInventoryMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), data.product_id, ...cartItems.map((i) => i.product_id)]);

  // Server-side GA4 purchase (Measurement Protocol) — deduped with the gtag event
  // by transaction_id; captures the conversion even when the browser tag is blocked.
  void ga4OrderEvent(data.business_id, "purchase", { transactionId: order.id, value: total, clientId: data.source?.ga_client_id, items: allItems });

  // Close the matching abandoned cart (if any) so it leaves the abandoned set
  // and counts as recovered when a recovery message had been sent.
  await markCartConverted(admin, data.business_id, {
    sessionId: data.cart_session_id,
    email: data.customer_email?.trim() || null,
    phone: data.customer_phone.trim(),
    orderId: order.id,
  });

  // Send emails
  try {
    const { data: settings } = await admin
      .from("store_settings")
      .select("notifications_config, businesses(business_name, store_name, user_id, slug)")
      .eq("business_id", data.business_id)
      .single();
    if (settings) {
      const config = parseNotificationsConfig(
        (settings.notifications_config as Record<string, unknown>) ?? {}
      );
      const biz = settings.businesses as unknown as { business_name: string; store_name: string | null; user_id: string; slug: string | null } | null;
      // Customer-facing emails use the public store name, falling back to the legal/account name.
      const businessName = biz?.store_name || biz?.business_name || "";

      let notifyEmail = config.notification_email;
      if (!notifyEmail && biz?.user_id) {
        const { data: authData } = await admin.auth.admin.getUserById(biz.user_id);
        notifyEmail = authData?.user?.email ?? "";
      }

      const emailPayload = {
        order_number: order.order_number,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        total,
        subtotal,
        items: allItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        shipping_cost: data.shipping_cost,
        discount_code: data.discount_code,
        discount_amount: (data.discount_amount ?? 0) > 0 ? (data.discount_amount ?? 0) : undefined,
        card_discount_amount: cardDiscount > 0 ? cardDiscount : undefined,
        payment_method: data.payment_method ?? "cash_on_delivery",
        business_name: businessName,
        store_url: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order_id: order.id,
        address: data.customer_address,
        city: data.customer_city,
        county: data.customer_county,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
        locker_name: data.locker_name,
        custom_fields: data.custom_fields,
      };
      const emailSender = await getStoreEmailSender(admin, data.business_id);
      await Promise.all([
        config.new_order !== false && notifyEmail
          ? sendNewOrderEmail(notifyEmail, emailPayload, emailSender)
          : null,
        data.customer_email
          ? sendOrderConfirmationToCustomer(data.customer_email, emailPayload, emailSender)
          : null,
      ].filter(Boolean));

      // notice.ro — new-order SMS (Procesare comanda / pending), opt-in per store. Fire-and-forget.
      void maybeSendNoticeNotification({
        businessId: data.business_id,
        orderId: order.id,
        triggerKey: "pending",
        phone: data.customer_phone,
        vars: {
          order: order.order_number, name: data.customer_name, total: formatPrice(total),
          awb: "", store: businessName,
          phone: data.customer_phone, email: data.customer_email ?? "",
          address: data.customer_address, city: data.customer_city, region: data.customer_county,
          payment_method: data.payment_method ?? "cash_on_delivery",
          shipping_method: data.courier_label ?? "",
          store_url: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : "",
          date_added: formatDate(new Date()),
        },
      });

      // Mailchimp — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncMailchimpSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          tags: [data.customer_county, orderValueTag(total)].filter(Boolean),
        });
      }

      // Brevo — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncBrevoSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          county: data.customer_county,
          orderValue: total,
        });
      }

      // Klaviyo — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncKlaviyoSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          county: data.customer_county,
          orderValue: total,
        });
      }

      // Mailchimp e-commerce — sync the order (revenue attribution + purchase segmentation + retargeting). Fire-and-forget.
      void maybeSyncMailchimpOrder({
        businessId: data.business_id,
        storeName: businessName,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          name: data.customer_name,
          currency: "RON",
          total,
          financial_status: "pending",
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });

      // Brevo e-commerce — sync the order (revenue attribution + purchase segmentation + retargeting). Fire-and-forget.
      void maybeSyncBrevoOrder({
        businessId: data.business_id,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          total,
          status: "pending",
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });

      // Klaviyo e-commerce — "Placed Order" event (revenue + purchase segmentation + flows). Fire-and-forget.
      void maybeTrackKlaviyoOrder({
        businessId: data.business_id,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          name: data.customer_name,
          total,
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });
    }
  } catch (e) { logError({ action: "placeOrder.emails", message: (e as Error).message ?? "Email send failed", details: { businessId: data.business_id }, severity: "warning" }); }

  revalidatePath("/dashboard/orders");
  return { success: true, orderId: order.id, orderNumber: order.order_number };
}

const STATUS_SMS_LABELS: Record<string, string> = {
  pending: "in asteptare",
  confirmed: "confirmata",
  processing: "in procesare",
  shipped: "expediata",
  delivered: "livrata",
  cancelled: "anulata",
  refunded: "rambursata",
};

// Short transactional SMS for an order status change (auto-notify, opt-in per store).
function defaultStatusSms(status: string, opts: { orderNumber: string; businessName: string; awb?: string }): string {
  const biz = opts.businessName;
  switch (status) {
    case "confirmed":
      return `Comanda ${opts.orderNumber} a fost confirmata. Multumim! ${biz}`;
    case "shipped":
      return `Comanda ${opts.orderNumber} a fost expediata${opts.awb ? `, AWB ${opts.awb}` : ""}. ${biz}`;
    case "delivered":
      return `Comanda ${opts.orderNumber} a fost livrata. Iti multumim! ${biz}`;
    default:
      return `Comanda ${opts.orderNumber}: ${STATUS_SMS_LABELS[status] ?? status}. ${biz}`;
  }
}

export async function updateOrder(orderId: string, data: { status: string; payment_status: string; awb?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: order } = await supabase
    .from("orders")
    .select("business_id, order_number, customer_name, customer_email, customer_phone, total, status, payment_status, shipping_address, payment_method, created_at, items, order_source")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id, business_name, store_name, slug").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };
  const storeName = biz.store_name || biz.business_name;

  const { error } = await supabase.from("orders")
    .update({ status: data.status as never, payment_status: data.payment_status as never })
    .eq("id", orderId);

  if (error) {
    logError({ action: "updateOrder", message: error.message, details: { code: error.code, hint: error.hint, orderId }, userId: user.id });
    return { error: "Eroare la actualizare." };
  }

  const statusChanged = data.status !== (order.status as string);
  const paymentChanged = data.payment_status !== (order.payment_status as string);

  // Server-side GA4 refund (Measurement Protocol) when the sale is reversed —
  // refunds can't be tracked from the customer's browser. Offset by transaction_id.
  const GA4_REVERSAL = new Set(["refunded", "cancelled"]);
  if (statusChanged && GA4_REVERSAL.has(data.status) && !GA4_REVERSAL.has(order.status as string)) {
    const refundItems = Array.isArray(order.items) ? (order.items as { product_id?: string; name: string; price: number; quantity: number }[]) : [];
    const gaClientId = (order.order_source as { ga_client_id?: string } | null)?.ga_client_id;
    void ga4OrderEvent(order.business_id, "refund", { transactionId: orderId, value: order.total ?? 0, clientId: gaClientId, items: refundItems });
  }

  // Send status change email to customer
  if (statusChanged && order.customer_email) {
    const emailSender = await getStoreEmailSender(createAdminClient(), order.business_id);
    sendOrderStatusToCustomer(order.customer_email, {
      order_number: order.order_number,
      customer_name: order.customer_name,
      total: order.total,
      status: data.status,
      business_name: storeName,
      awb: data.awb,
      store_url: biz.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
    }, emailSender).catch(() => {});
  }

  // Send status change SMS to customer (opt-in per store via SMSO)
  if (statusChanged && order.customer_phone) {
    const { data: st } = await supabase
      .from("store_settings")
      .select("smso_config")
      .eq("business_id", order.business_id)
      .single();
    const smso = st?.smso_config as (SmsoConfig & { notify_status_change?: boolean }) | null;
    if (smso?.enabled && smso.api_key && smso.sender_id && smso.notify_status_change) {
      void sendSms(smso.api_key, {
        to: order.customer_phone,
        sender: smso.sender_id,
        body: defaultStatusSms(data.status, {
          orderNumber: order.order_number,
          businessName: storeName,
          awb: data.awb,
        }),
        type: "transactional",
      });
    }
  }

  // Auto-generate an invoice with whichever provider has auto-invoicing enabled
  // (SmartBill / Oblio / fGO) — at most one per order. Fire-and-forget.
  if (statusChanged || paymentChanged) {
    import("@/lib/actions/invoice-auto.actions").then(({ maybeAutoInvoice }) => {
      void maybeAutoInvoice(order.business_id, orderId, data.status, data.payment_status);
    }).catch(() => {});
  }

  // notice.ro SMS — transactional notification on a status / payment change, using
  // the merchant's chosen template per trigger (opt-in). Fire-and-forget.
  if (order.customer_phone && (statusChanged || paymentChanged)) {
    const ship = (order.shipping_address ?? {}) as {
      address?: string; city?: string; county?: string; postcode?: string; country?: string; courier_label?: string;
    };
    const noticeVars = {
      order: order.order_number,
      name: order.customer_name,
      total: formatPrice(Number(order.total)),
      awb: data.awb ?? "",
      store: storeName,
      phone: order.customer_phone ?? "",
      email: order.customer_email ?? "",
      address: ship.address ?? "",
      city: ship.city ?? "",
      region: ship.county ?? "",
      postcode: ship.postcode ?? "",
      country: ship.country ?? "",
      payment_method: (order.payment_method as string | null) ?? "",
      shipping_method: ship.courier_label ?? "",
      store_url: biz.slug ? `${STORE_BASE_URL}/${biz.slug}` : "",
      date_added: order.created_at ? formatDate(order.created_at as string) : "",
    };
    if (statusChanged) {
      const tk = noticeTriggerForStatus(data.status);
      if (tk) void maybeSendNoticeNotification({ businessId: order.business_id, orderId, triggerKey: tk, phone: order.customer_phone, vars: noticeVars });
    }
    if (paymentChanged) {
      const tk = noticeTriggerForPayment(data.payment_status);
      if (tk) void maybeSendNoticeNotification({ businessId: order.business_id, orderId, triggerKey: tk, phone: order.customer_phone, vars: noticeVars });
      if (data.payment_status === "paid") { void maybeMarkMailchimpOrderPaid(orderId); void maybeMarkBrevoOrderPaid(orderId); }
    }
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true };
}

// ── Order editing (merchant fixes customer mistakes) ────────────────────────
// Deliberately SEPARATE from updateOrder: editing customer data / address /
// items must never fire the status & payment hooks (customer email, SMS,
// notice.ro, auto-invoicing) that updateOrder triggers.

export async function searchOrderProducts(businessId: string, query: string): Promise<
  { products: { id: string; name: string; price: number; stock_quantity: number | null; track_inventory: boolean; is_bundle: boolean }[] } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  let q = supabase.from("products")
    .select("id, name, price, stock_quantity, track_inventory, is_bundle")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name")
    .limit(20);
  const term = query.trim();
  if (term) q = q.ilike("name", `%${term}%`);
  const { data: rows, error } = await q;
  if (error) return { error: "Eroare la cautarea produselor." };
  return {
    products: (rows ?? []).map((p) => ({
      id: p.id as string,
      name: String(p.name),
      price: round2(Number(p.price)),
      stock_quantity: p.stock_quantity as number | null,
      track_inventory: !!p.track_inventory,
      is_bundle: !!p.is_bundle,
    })),
  };
}

export async function updateOrderDetails(orderId: string, data: {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  address: string;
  city: string;
  county: string;
  postal_code?: string;
  /** Products to append to the order; re-priced server-side from the live catalog. */
  added_items?: { product_id: string; quantity: number }[];
}): Promise<{ success: true; newTotal: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, business_id, status, items, subtotal, total, shipping_address")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  if (order.status === "cancelled" || order.status === "refunded") {
    return { error: "Comenzile anulate sau rambursate nu pot fi editate." };
  }

  const name = data.customer_name.trim();
  const phone = data.customer_phone.trim();
  const address = data.address.trim();
  const city = data.city.trim();
  const county = data.county.trim();
  if (!name || !phone) return { error: "Numele si telefonul clientului sunt obligatorii." };
  if (!address || !city || !county) return { error: "Adresa, orasul si judetul sunt obligatorii." };

  // Merge duplicate additions; integer quantities only.
  const wanted = new Map<string, number>();
  for (const it of data.added_items ?? []) {
    const qty = Math.floor(Number(it.quantity));
    if (!it.product_id || !Number.isFinite(qty) || qty <= 0) continue;
    wanted.set(it.product_id, Math.min(999, (wanted.get(it.product_id) ?? 0) + qty));
  }

  // Re-price added products from the live catalog (never trust the client) and
  // validate stock bundle-aware, exactly like order placement does.
  const admin = createAdminClient();
  let newItems: { product_id: string; name: string; price: number; quantity: number }[] = [];
  let decrements: { product_id: string; quantity: number }[] = [];
  if (wanted.size > 0) {
    const ids = [...wanted.keys()];
    const { data: products } = await admin.from("products")
      .select("id, name, price, is_active")
      .in("id", ids)
      .eq("business_id", order.business_id);
    const live = new Map((products ?? []).filter((p) => p.is_active).map((p) => [p.id as string, p]));
    if (ids.some((id) => !live.has(id))) {
      return { error: "Unul dintre produsele adaugate nu mai este disponibil. Reincarca pagina si incearca din nou." };
    }

    const stockExp = await expandBundleStock(admin, order.business_id, ids.map((id) => ({ product_id: id, quantity: wanted.get(id)! })));
    if ("error" in stockExp) return { error: stockExp.error };
    decrements = stockExp.decrements;

    newItems = ids.map((id) => ({
      product_id: id,
      name: String(live.get(id)!.name),
      price: round2(Number(live.get(id)!.price)),
      quantity: wanted.get(id)!,
    }));
  }

  const addedSum = round2(newItems.reduce((s, i) => s + i.price * i.quantity, 0));
  const newSubtotal = round2(Number(order.subtotal) + addedSum);
  const newTotal = round2(Number(order.total) + addedSum);

  // Merge the address into shipping_address WITHOUT touching courier/locker/
  // service keys — those belong to the checkout choice and the AWB flow.
  const prevShip = (order.shipping_address ?? {}) as Record<string, unknown>;
  const newShip = {
    ...prevShip,
    county,
    city,
    address,
    ...(data.postal_code?.trim() ? { postal_code: data.postal_code.trim() } : {}),
  };

  // Refuse to touch a row whose items are not the expected array — appending
  // onto a corrupt value would silently replace the customer's original items.
  if (!Array.isArray(order.items)) {
    logError({ action: "updateOrderDetails", message: "orders.items is not an array", details: { orderId }, userId: user.id, severity: "warning" });
    return { error: "Structura comenzii nu permite editarea. Contacteaza suportul." };
  }
  const prevItems = order.items as unknown[];

  const { error } = await supabase.from("orders").update({
    customer_name: name,
    customer_phone: phone,
    customer_email: data.customer_email?.trim() || null,
    shipping_address: newShip,
    items: [...prevItems, ...newItems],
    subtotal: newSubtotal,
    total: newTotal,
    updated_at: new Date().toISOString(),
  } as never).eq("id", orderId);

  if (error) {
    logError({ action: "updateOrderDetails", message: error.message, details: { code: error.code, hint: error.hint, orderId }, userId: user.id });
    return { error: "Eroare la salvarea modificarilor." };
  }

  // Stock decrement + Google Merchant availability sync for the added items
  // (mirrors placeOrder; runs only after the order update committed).
  if (decrements.length > 0) {
    await admin.rpc("decrement_stock_batch" as never, { p_items: decrements } as never);
    void enqueueGmcSyncMany(order.business_id, [...new Set([...decrements.map((d) => d.product_id), ...newItems.map((i) => i.product_id)])]);
    void enqueueOlxSyncMany(order.business_id, [...new Set([...decrements.map((d) => d.product_id), ...newItems.map((i) => i.product_id)])]);
    void enqueueAboutYouStockMany(order.business_id, [...new Set([...decrements.map((d) => d.product_id), ...newItems.map((i) => i.product_id)])]);
    void enqueueTrendyolInventoryMany(order.business_id, [...new Set([...decrements.map((d) => d.product_id), ...newItems.map((i) => i.product_id)])]);
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true, newTotal };
}

export async function deleteOrder(orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: order } = await supabase.from("orders").select("business_id").eq("id", orderId).single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) {
    logError({ action: "deleteOrder", message: error.message, details: { code: error.code, orderId }, userId: user.id });
    return { error: "Eroare la stergerea comenzii." };
  }

  revalidatePath("/dashboard/orders");
  return { success: true };
}

export async function sendCustomerNotification(orderId: string, subject: string, message: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  if (!subject.trim() || !message.trim()) return { error: "Completeaza subiectul si mesajul." };

  const { data: order } = await supabase
    .from("orders")
    .select("business_id, order_number, customer_email")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("business_name, store_name").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  if (!order.customer_email) return { error: "Clientul nu a lasat o adresa de email." };

  const emailSender = await getStoreEmailSender(createAdminClient(), order.business_id);
  const res = await sendCustomerMessage(order.customer_email, {
    subject: subject.trim(),
    message: message.trim(),
    businessName: biz.store_name || biz.business_name,
    orderNumber: order.order_number,
  }, emailSender);
  if ("error" in res) return { error: res.error };
  return { success: true };
}

export async function sendCustomerSms(orderId: string, message: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  if (!message.trim()) return { error: "Scrie mesajul SMS." };

  const { data: order } = await supabase
    .from("orders")
    .select("business_id, customer_phone")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  if (!order.customer_phone) return { error: "Clientul nu a lasat un numar de telefon." };

  const { data: st } = await supabase
    .from("store_settings")
    .select("smso_config")
    .eq("business_id", order.business_id)
    .single();
  const smso = st?.smso_config as SmsoConfig | null;
  if (!smso?.enabled || !smso.api_key || !smso.sender_id) {
    return { error: "SMSO nu este activat. Conecteaza-l din Integrari." };
  }

  const res = await sendSms(smso.api_key, {
    to: order.customer_phone,
    sender: smso.sender_id,
    body: message.trim(),
    type: "transactional",
  });
  if (!res.success) return { error: res.error ?? "Eroare la trimiterea SMS-ului." };
  return { success: true };
}

export async function placeCartOrder(data: {
  business_id: string;
  cart_session_id?: string;
  items: { product_id: string; name: string; price: number; quantity: number; variant_title?: string }[];
  shipping_cost: number;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  newsletter_opt_in?: boolean;
  customer_county: string;
  customer_city: string;
  customer_address: string;
  customer_country?: string;
  customer_postal_code?: string;
  discount_id?: string;
  discount_code?: string;
  discount_amount?: number;
  extras?: { id: string; label: string; price: number }[];
  custom_fields?: Record<string, string>;
  vat_amount?: number;
  vat_rate?: number;
  accepted_offer_ids?: string[];
  payment_method?: string;
  selected_courier?: string;
  courier_label?: string;
  delivery_type?: string;
  locker_id?: string;
  locker_name?: string;
  locker_address?: string;
  locker_city?: string;
  locker_county?: string;
  woot_service_id?: number;
  woot_courier_name?: string;
  woot_service_name?: string;
  colete_service_id?: number;
  colete_service_name?: string;
  /** First-touch attribution captured client-side (utm / referrer / ad click id). */
  source?: OrderSource;
}) {
  // Anti-abuse: anonymous + triggers SMS/email (real cost). Throttle per IP.
  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  const userAgent = hdrs.get("user-agent")?.slice(0, 300) || undefined;
  if (!rateLimit(`placeCartOrder:${ip}`, 10, 60_000)) {
    return { error: "Prea multe incercari. Te rugam asteapta un minut si incearca din nou." };
  }

  // Use admin client — customers are anonymous
  const admin = createAdminClient();

  // Reload every product + store config; recompute all prices server-side.
  const productIds = [...new Set(data.items.map((i) => i.product_id))];
  const [{ data: dbProducts }, { data: cfgRow }] = await Promise.all([
    admin.from("products")
      .select("id, price, is_active, page_sections")
      .in("id", productIds)
      .eq("business_id", data.business_id),
    admin.from("store_settings")
      .select("page_content, free_shipping_threshold, min_order_amount, vat_enabled, vat_rate, prices_include_vat, card_discount_config")
      .eq("business_id", data.business_id)
      .single(),
  ]);

  const activeProducts = (dbProducts ?? []).filter((p) => p.is_active);
  const priceMap = new Map(activeProducts.map((p) => [p.id, round2(Number(p.price))]));
  // Per-product map of enabled variant title -> authoritative unit price. A cart
  // line that names a variant is re-priced from this, never from the browser.
  const comboMap = new Map(
    activeProducts.map((p) => [p.id, enabledComboPriceMap(p.page_sections, round2(Number(p.price)))]),
  );
  if (data.items.some((i) => !priceMap.has(i.product_id))) {
    logError({ action: "placeCartOrder.itemUnavailable", message: "Cart item missing/inactive for business", details: { businessId: data.business_id, productIds }, severity: "warning" });
    return { error: "Unul dintre produse nu mai este disponibil. Reincarca cosul." };
  }
  // A named variant that no longer maps to an enabled combination (merchant
  // disabled or renamed it) must not silently fall back to the base price.
  if (data.items.some((i) => i.variant_title && !comboMap.get(i.product_id)?.has(i.variant_title))) {
    logError({ action: "placeCartOrder.variantUnavailable", message: "Cart variant no longer enabled", details: { businessId: data.business_id, productIds }, severity: "warning" });
    return { error: "O varianta din cos nu mai este disponibila. Reincarca cosul." };
  }

  let validatedItems = data.items.map((i) => {
    const variantPrice = i.variant_title ? comboMap.get(i.product_id)!.get(i.variant_title) : undefined;
    return {
      product_id: i.product_id,
      name: i.variant_title ? `${i.name} (${i.variant_title})` : i.name,
      price: variantPrice != null ? round2(variantPrice) : priceMap.get(i.product_id)!,
      quantity: i.quantity,
    };
  });
  // Order bumps: re-price accepted bump lines at the offer's authoritative discounted
  // price (server-side; the client can't forge it). No-op without accepted_offer_ids.
  if (data.accepted_offer_ids?.length) {
    const bumped = await applyBumpPricing(admin, data.business_id, data.accepted_offer_ids, validatedItems);
    validatedItems = bumped.items;
  }
  const subtotal = round2(validatedItems.reduce((s, i) => s + i.price * i.quantity, 0));

  // Enforce the merchant's minimum order value (Setari > Livrare) against the authoritative subtotal.
  const minOrder = cfgRow?.min_order_amount != null ? Number(cfgRow.min_order_amount) : null;
  if (minOrder !== null && subtotal < minOrder) {
    return { error: `Comanda minima este de ${minOrder} lei. Mai adauga produse pentru a finaliza comanda.` };
  }

  const validatedExtras = validateExtras(cfgRow?.page_content, data.extras);
  const extrasTotal = validatedExtras.reduce((s, e) => s + e.price, 0);

  // Re-validate discount server-side (guard even though cart has no discount UI today).
  let discountAmount = 0;
  let validDiscountId: string | undefined;
  let isFreeShipping = false;
  if (data.discount_code) {
    const dres = await validateDiscount(data.discount_code, data.business_id, subtotal);
    if (dres.valid) {
      discountAmount = Math.min(dres.discount.discountAmount, subtotal);
      validDiscountId = dres.discount.id;
      isFreeShipping = dres.discount.type === "free_shipping";
    }
  }

  // Recompute VAT from store config (mirrors MiniStoreRenderer) so it cannot be forged.
  const vatEnabled = cfgRow?.vat_enabled ?? false;
  const vatRate = Number(cfgRow?.vat_rate ?? 19);
  const pricesIncludeVat = cfgRow?.prices_include_vat ?? true;
  const vatBase = subtotal + extrasTotal;
  const vatAmount = vatEnabled
    ? pricesIncludeVat
      ? round2(vatBase - vatBase / (1 + vatRate / 100))
      : round2(vatBase * (vatRate / 100))
    : 0;
  // Only VAT-exclusive pricing adds VAT on top of the total (matches the storefront grand total).
  const vatAddOn = vatEnabled && !pricesIncludeVat ? vatAmount : 0;

  // Card-payment discount: only for online card methods, on the goods value
  // (subtotal + extras, after promo), never on shipping/VAT. Baked into total.
  const cardDiscount = computeCardDiscount(
    parseCardDiscountConfig(cfgRow?.card_discount_config),
    data.payment_method,
    subtotal + extrasTotal - discountAmount,
  );

  const freeThreshold = cfgRow?.free_shipping_threshold != null ? Number(cfgRow.free_shipping_threshold) : null;
  let shipping = Math.max(0, round2(data.shipping_cost));
  if (isFreeShipping || (freeThreshold !== null && subtotal >= freeThreshold)) shipping = 0;

  const total = Math.max(0, round2(subtotal + extrasTotal - discountAmount - cardDiscount + shipping + vatAddOn));

  // Bundle-aware stock: expand any bundle into its components + validate availability
  // before creating the order (prevents overselling components).
  const stockExp = await expandBundleStock(admin, data.business_id, validatedItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })));
  if ("error" in stockExp) return { error: stockExp.error };

  const order_number = await buildOrderNumber(admin, data.business_id);

  const allItems = [
    ...validatedItems,
    ...validatedExtras.map((e) => ({ product_id: `extra_${e.id}`, name: e.label, price: e.price, quantity: 1 })),
  ];

  const { data: order, error } = await admin.from("orders").insert({
    business_id: data.business_id,
    order_number,
    customer_name: data.customer_name.trim(),
    customer_phone: data.customer_phone.trim(),
    customer_email: data.customer_email?.trim() || null,
    shipping_address: {
      county: data.customer_county,
      city: data.customer_city.trim(),
      address: data.customer_address.trim(),
      ...(data.customer_country && data.customer_country !== "RO" && {
        country: data.customer_country,
        postal_code: data.customer_postal_code?.trim() || "",
      }),
      ...(data.selected_courier && {
        courier: data.selected_courier,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
      }),
      ...(data.locker_id && {
        locker_id: data.locker_id,
        locker_name: data.locker_name,
        locker_address: data.locker_address,
        locker_city: data.locker_city,
        locker_county: data.locker_county,
      }),
      ...(data.woot_service_id && {
        woot_service_id: data.woot_service_id,
        woot_courier_name: data.woot_courier_name,
        woot_service_name: data.woot_service_name,
      }),
      ...(data.colete_service_id && {
        colete_service_id: data.colete_service_id,
        colete_service_name: data.colete_service_name,
      }),
    },
    items: allItems,
    subtotal,
    shipping_cost: shipping,
    discount_code: validDiscountId ? data.discount_code : null,
    discount_amount: discountAmount,
    card_discount_amount: cardDiscount,
    total,
    vat_amount: vatAmount,
    vat_rate: vatEnabled ? vatRate : 0,
    notes: data.custom_fields && Object.keys(data.custom_fields).length > 0 ? data.custom_fields as unknown as string : null,
    payment_method: data.payment_method ?? "cash_on_delivery",
    payment_status: "unpaid",
    status: "pending",
    order_source: buildOrderSource(data.source, userAgent) as never,
  }).select("id, order_number, total").single();

  if (error) {
    logError({ action: "placeCartOrder", message: error.message, details: { code: error.code, hint: error.hint, businessId: data.business_id, itemCount: data.items.length }, severity: "critical" });
    return { error: "Eroare la plasarea comenzii. Incearca din nou." };
  }

  if (validDiscountId) {
    await admin.rpc("increment_discount_uses", { p_discount_id: validDiscountId });
  }

  // Atomic batch stock decrement — bundle components expanded; non-bundles as-is.
  await admin.rpc("decrement_stock_batch" as never, { p_items: stockExp.decrements } as never);

  // Reflect stock/availability changes in Google Merchant + OLX (if connected).
  void enqueueGmcSyncMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);
  void enqueueOlxSyncMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);
  void enqueueAboutYouStockMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);
  void enqueueTrendyolInventoryMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);

  // Server-side GA4 purchase (Measurement Protocol) — deduped with the gtag event
  // by transaction_id; captures the conversion even when the browser tag is blocked.
  void ga4OrderEvent(data.business_id, "purchase", { transactionId: order.id, value: total, clientId: data.source?.ga_client_id, items: allItems });

  // Close the matching abandoned cart (if any) so it leaves the abandoned set
  // and counts as recovered when a recovery message had been sent.
  await markCartConverted(admin, data.business_id, {
    sessionId: data.cart_session_id,
    email: data.customer_email?.trim() || null,
    phone: data.customer_phone.trim(),
    orderId: order.id,
  });

  // Send emails
  try {
    const { data: settings } = await admin
      .from("store_settings")
      .select("notifications_config, businesses(business_name, store_name, user_id, slug)")
      .eq("business_id", data.business_id)
      .single();
    if (settings) {
      const config = parseNotificationsConfig(
        (settings.notifications_config as Record<string, unknown>) ?? {}
      );
      const biz = settings.businesses as unknown as { business_name: string; store_name: string | null; user_id: string; slug: string | null } | null;
      // Customer-facing emails use the public store name, falling back to the legal/account name.
      const businessName = biz?.store_name || biz?.business_name || "";

      let notifyEmail = config.notification_email;
      if (!notifyEmail && biz?.user_id) {
        const { data: authData } = await admin.auth.admin.getUserById(biz.user_id);
        notifyEmail = authData?.user?.email ?? "";
      }

      const emailPayload = {
        order_number: order.order_number,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        total,
        subtotal,
        items: allItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        shipping_cost: data.shipping_cost,
        discount_code: data.discount_code,
        discount_amount: (data.discount_amount ?? 0) > 0 ? (data.discount_amount ?? 0) : undefined,
        card_discount_amount: cardDiscount > 0 ? cardDiscount : undefined,
        payment_method: data.payment_method ?? "cash_on_delivery",
        business_name: businessName,
        store_url: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order_id: order.id,
        address: data.customer_address,
        city: data.customer_city,
        county: data.customer_county,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
        locker_name: data.locker_name,
        custom_fields: data.custom_fields,
      };
      const emailSender = await getStoreEmailSender(admin, data.business_id);
      await Promise.all([
        config.new_order !== false && notifyEmail
          ? sendNewOrderEmail(notifyEmail, emailPayload, emailSender)
          : null,
        data.customer_email
          ? sendOrderConfirmationToCustomer(data.customer_email, emailPayload, emailSender)
          : null,
      ].filter(Boolean));

      // notice.ro — new-order SMS (Procesare comanda / pending), opt-in per store. Fire-and-forget.
      void maybeSendNoticeNotification({
        businessId: data.business_id,
        orderId: order.id,
        triggerKey: "pending",
        phone: data.customer_phone,
        vars: {
          order: order.order_number, name: data.customer_name, total: formatPrice(total),
          awb: "", store: businessName,
          phone: data.customer_phone, email: data.customer_email ?? "",
          address: data.customer_address, city: data.customer_city, region: data.customer_county,
          payment_method: data.payment_method ?? "cash_on_delivery",
          shipping_method: data.courier_label ?? "",
          store_url: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : "",
          date_added: formatDate(new Date()),
        },
      });

      // Mailchimp — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncMailchimpSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          tags: [data.customer_county, orderValueTag(total)].filter(Boolean),
        });
      }

      // Brevo — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncBrevoSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          county: data.customer_county,
          orderValue: total,
        });
      }

      // Klaviyo — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncKlaviyoSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          county: data.customer_county,
          orderValue: total,
        });
      }

      // Mailchimp e-commerce — sync the order (revenue attribution + purchase segmentation + retargeting). Fire-and-forget.
      void maybeSyncMailchimpOrder({
        businessId: data.business_id,
        storeName: businessName,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          name: data.customer_name,
          currency: "RON",
          total,
          financial_status: "pending",
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });

      // Brevo e-commerce — sync the order (revenue attribution + purchase segmentation + retargeting). Fire-and-forget.
      void maybeSyncBrevoOrder({
        businessId: data.business_id,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          total,
          status: "pending",
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });

      // Klaviyo e-commerce — "Placed Order" event (revenue + purchase segmentation + flows). Fire-and-forget.
      void maybeTrackKlaviyoOrder({
        businessId: data.business_id,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          name: data.customer_name,
          total,
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });
    }
  } catch (e) { logError({ action: "placeOrder.emails", message: (e as Error).message ?? "Email send failed", details: { businessId: data.business_id }, severity: "warning" }); }

  revalidatePath("/dashboard/orders");
  return { success: true, orderId: order.id, orderNumber: order.order_number };
}
