// Shared (non-"use server") offers logic: storefront resolution + pricing. The
// resolve functions take a Supabase client (the admin client on the storefront)
// exactly like expandBundleStock in bundles.ts, so they run from server components
// and server actions.
//
// Only the Faza 1 offer types are resolved here (frequently_bought, cross_sell,
// order_bump). Rule types (volume/bogo/gift/spend_reward) and post_purchase are
// stored but not yet evaluated — resolving them is Faza 2/3.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { computeBundlePricing, type BundlePricingMode } from "@/lib/bundles";
import { hasVariants } from "@/lib/storefront/variants";
import {
  parseOfferTrigger, parseOfferConfig, parseOfferDisplay,
  defaultTitleFor, isOfferType, PHASE1_OFFER_TYPES,
  type OfferType, type OfferConfig, type OfferTrigger, type OfferDisplay,
  type OfferProduct, type ResolvedOffer,
} from "./offer.types";

type Client = SupabaseClient<Database>;

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function firstImage(images: unknown): string | null {
  return Array.isArray(images) && images.length ? String(images[0]) : null;
}

// The minimal anchor-product shape needed to match triggers + price an FBT set.
export interface OfferAnchor {
  id: string;
  category: string | null;
  price: number;
}

interface LoadedOffer {
  id: string;
  type: OfferType;
  trigger: OfferTrigger;
  config: OfferConfig;
  display: OfferDisplay;
}

function withinWindow(startsAt: string | null, endsAt: string | null, nowMs: number): boolean {
  if (startsAt && new Date(startsAt).getTime() > nowMs) return false;
  if (endsAt && new Date(endsAt).getTime() < nowMs) return false;
  return true;
}

// Load + parse the store's active, in-window, Faza-1 offers (highest priority first).
async function loadActiveOffers(admin: Client, businessId: string): Promise<LoadedOffer[]> {
  const { data } = await admin
    .from("offers")
    .select("id, type, trigger, config, display, priority, starts_at, ends_at")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("priority", { ascending: false });
  const nowMs = Date.now();
  return (data ?? [])
    .filter((o) => isOfferType(o.type) && PHASE1_OFFER_TYPES.includes(o.type as OfferType))
    .filter((o) => withinWindow(o.starts_at, o.ends_at, nowMs))
    .map((o) => ({
      id: o.id,
      type: o.type as OfferType,
      trigger: parseOfferTrigger(o.trigger),
      config: parseOfferConfig(o.config),
      display: parseOfferDisplay(o.display, o.type as OfferType),
    }));
}

// Does an offer's trigger fire for a single (anchor) product?
function triggerMatchesProduct(trigger: OfferTrigger, product: { id: string; category: string | null }): boolean {
  if (trigger.scope === "all") return true;
  if (trigger.scope === "products") return trigger.productIds.includes(product.id);
  if (trigger.scope === "categories") return product.category != null && trigger.categories.includes(product.category);
  return false;
}

// Does an offer's trigger fire for ANY product in a set (cart)?
function triggerMatchesCart(trigger: OfferTrigger, products: { id: string; category: string | null }[]): boolean {
  if (trigger.scope === "all") return true;
  return products.some((p) => triggerMatchesProduct(trigger, p));
}

function toOfferProduct(p: {
  id: string; name: string; slug: string | null; price: number | string;
  compare_at_price: number | string | null; images: unknown;
  track_inventory: boolean; stock_quantity: number | null; page_sections?: unknown;
}): OfferProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: Number(p.price) || 0,
    compareAtPrice: p.compare_at_price != null ? Number(p.compare_at_price) : null,
    imageUrl: firstImage(p.images),
    outOfStock: p.track_inventory && p.stock_quantity !== null && p.stock_quantity <= 0,
    hasVariants: hasVariants(p.page_sections),
  };
}

const OFFER_PRODUCT_COLS =
  "id, name, slug, price, compare_at_price, images, is_bundle, is_active, track_inventory, stock_quantity, page_sections";

// Resolve product ids to authoritative display data. Skips missing, inactive,
// bundle, and excluded products; preserves the requested order.
async function fetchOfferProducts(
  admin: Client, businessId: string, ids: string[], excludeIds: Set<string>,
): Promise<OfferProduct[]> {
  const wanted = [...new Set(ids)].filter((id) => !excludeIds.has(id));
  if (wanted.length === 0) return [];
  const { data } = await admin
    .from("products").select(OFFER_PRODUCT_COLS)
    .eq("business_id", businessId).in("id", wanted);
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  const out: OfferProduct[] = [];
  for (const id of wanted) {
    const p = byId.get(id);
    if (!p || p.is_bundle || !p.is_active) continue;
    out.push(toOfferProduct(p));
  }
  return out;
}

// Auto cross-sell: products from the anchor's category (active, non-bundle), newest first.
async function fetchCategoryProducts(
  admin: Client, businessId: string, category: string, excludeIds: Set<string>, limit: number,
): Promise<OfferProduct[]> {
  const { data } = await admin
    .from("products").select(OFFER_PRODUCT_COLS)
    .eq("business_id", businessId).eq("category", category)
    .eq("is_active", true).eq("is_bundle", false)
    .order("created_at", { ascending: false })
    .limit(limit + excludeIds.size);
  const out: OfferProduct[] = [];
  for (const p of data ?? []) {
    if (excludeIds.has(p.id)) continue;
    out.push(toOfferProduct(p));
    if (out.length >= limit) break;
  }
  return out;
}

// Map the offer discount mode to the shared bundle pricing helper.
function discountModeToBundleMode(mode: OfferConfig["discountMode"]): BundlePricingMode | null {
  if (mode === "percent") return "discount_percent";
  if (mode === "amount") return "discount_amount";
  if (mode === "fixed_price") return "fixed";
  return null; // "none"
}

// Combined price for a set of products (FBT anchor + companions, or a single bump).
function computeSetPricing(prices: number[], config: OfferConfig): ResolvedOffer["pricing"] {
  const mode = discountModeToBundleMode(config.discountMode);
  const compareAt = round2(prices.reduce((s, p) => s + p, 0));
  if (!mode) return { price: compareAt, compareAt, savings: 0 };
  return computeBundlePricing(
    prices.map((p) => ({ price: p, quantity: 1 })),
    mode,
    { fixedPrice: config.fixedPrice, discountPercent: config.discountPercent, discountAmount: config.discountAmount },
  );
}

/**
 * Offers to show on a product page (PDP): "cumparate frecvent impreuna" (FBT) and
 * "merge bine cu" (cross_sell) that target this product. FBT returns combined
 * pricing over the anchor + in-stock companions; cross_sell is a pure recommendation.
 * The anchor itself is always excluded from the recommended list.
 */
export async function resolveProductOffers(
  admin: Client, businessId: string, anchor: OfferAnchor,
): Promise<ResolvedOffer[]> {
  const offers = await loadActiveOffers(admin, businessId);
  const applicable = offers.filter(
    (o) =>
      (o.type === "frequently_bought" || o.type === "cross_sell") &&
      o.display.surfaces.includes("product_page") &&
      triggerMatchesProduct(o.trigger, anchor),
  );
  if (applicable.length === 0) return [];

  const exclude = new Set([anchor.id]);
  const resolved: ResolvedOffer[] = [];
  for (const o of applicable) {
    const products = o.type === "cross_sell" && o.config.autoByCategory && anchor.category
      ? await fetchCategoryProducts(admin, businessId, anchor.category, exclude, o.config.maxProducts)
      : (await fetchOfferProducts(admin, businessId, o.config.productIds, exclude)).slice(0, o.config.maxProducts);
    if (products.length === 0) continue;

    const base: ResolvedOffer = {
      id: o.id,
      type: o.type,
      title: o.config.title || defaultTitleFor(o.type),
      buttonLabel: o.config.buttonLabel,
      style: o.display.style,
      products,
    };
    // FBT: combined price over the anchor + all in-stock companions (an FBT you
    // cannot fully buy is pointless, so out-of-stock companions are dropped).
    if (o.type === "frequently_bought") {
      const buyable = products.filter((p) => !p.outOfStock);
      if (buyable.length === 0) continue;
      base.products = buyable;
      base.pricing = computeSetPricing([anchor.price, ...buyable.map((p) => p.price)], o.config);
    }
    resolved.push(base);
  }
  return resolved;
}

/**
 * Offers for the cart / checkout surfaces: order bumps (checkout) and cart
 * cross-sell (cart) that target anything already in the cart. Products already in
 * the cart are excluded. Bump offers carry per-product discounted pricing.
 */
export async function resolveCartOffers(
  admin: Client, businessId: string, cartProductIds: string[], surface: "cart" | "checkout",
): Promise<ResolvedOffer[]> {
  if (cartProductIds.length === 0) return [];
  const offers = await loadActiveOffers(admin, businessId);
  // Need cart products' categories to evaluate category-scoped triggers.
  const { data: cartRows } = await admin
    .from("products").select("id, category")
    .eq("business_id", businessId).in("id", [...new Set(cartProductIds)]);
  const cartProducts = (cartRows ?? []).map((r) => ({ id: r.id, category: r.category }));

  const wantType: OfferType = surface === "checkout" ? "order_bump" : "cross_sell";
  const applicable = offers.filter(
    (o) => o.type === wantType && o.display.surfaces.includes(surface) && triggerMatchesCart(o.trigger, cartProducts),
  );
  if (applicable.length === 0) return [];

  const exclude = new Set(cartProductIds);
  const resolved: ResolvedOffer[] = [];
  for (const o of applicable) {
    const products = (await fetchOfferProducts(admin, businessId, o.config.productIds, exclude)).slice(0, o.config.maxProducts);
    if (products.length === 0) continue;

    const base: ResolvedOffer = {
      id: o.id,
      type: o.type,
      title: o.config.title || defaultTitleFor(o.type),
      buttonLabel: o.config.buttonLabel,
      style: o.display.style,
      products,
    };
    // Order bump: a single product with its own discounted price.
    if (o.type === "order_bump") {
      const p = products[0];
      base.products = [p];
      base.pricing = computeSetPricing([p.price], o.config);
    }
    resolved.push(base);
  }
  return resolved;
}

export interface BumpItem { product_id: string; name: string; price: number; quantity: number }

/**
 * Order-time enforcement for accepted order-bump offers. Re-prices any order line
 * covered by an accepted bump offer to the offer's AUTHORITATIVE discounted price
 * (computed from the offer config in the DB — the client can never forge it).
 *
 * The bump discount lives in the item price (no separate discount line), so subtotal,
 * total, invoices and emails all stay correct automatically with zero extra plumbing.
 * A pure no-op when `acceptedOfferIds` is empty — so order creation is byte-identical
 * to today unless the storefront actually sends accepted bump offers.
 */
export async function applyBumpPricing(
  admin: Client, businessId: string, acceptedOfferIds: string[], items: BumpItem[],
): Promise<{ items: BumpItem[]; savings: number }> {
  const ids = [...new Set((acceptedOfferIds ?? []).filter((x) => typeof x === "string" && x))];
  if (ids.length === 0) return { items, savings: 0 };

  const { data } = await admin
    .from("offers")
    .select("id, type, config, starts_at, ends_at")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .in("id", ids);
  if (!data || data.length === 0) return { items, savings: 0 };

  const nowMs = Date.now();
  const out = items.map((i) => ({ ...i }));
  let savings = 0;
  for (const o of data) {
    if (o.type !== "order_bump" || !withinWindow(o.starts_at, o.ends_at, nowMs)) continue;
    const cfg = parseOfferConfig(o.config);
    const pid = cfg.productIds[0];
    if (!pid) continue;
    const line = out.find((i) => i.product_id === pid);
    if (!line) continue; // the customer didn't actually add the bump product — no discount
    const priced = computeSetPricing([line.price], cfg);
    if (priced && priced.price < line.price) {
      savings = round2(savings + (line.price - priced.price) * line.quantity);
      line.price = priced.price;
    }
  }
  return { items: out, savings };
}

/**
 * Distribute an FBT set's savings across the COMPANION prices — the anchor stays at
 * full price (it's the main product being ordered via the buy box). Deterministic and
 * shared by the storefront preview and the order-time enforcement, so the two always
 * compute identical companion prices (no client/server mismatch). Savings are capped
 * at the companions' total (companions never go below 0).
 */
export function fbtCompanionPrices(anchorPrice: number, companionPrices: number[], config: OfferConfig): number[] {
  const pricing = computeSetPricing([anchorPrice, ...companionPrices], config);
  const compTotal = round2(companionPrices.reduce((s, p) => s + p, 0));
  const savings = pricing ? Math.min(pricing.savings, compTotal) : 0;
  if (savings <= 0 || compTotal <= 0) return companionPrices.map((p) => round2(p));
  return companionPrices.map((p) => round2(Math.max(0, p - savings * (p / compTotal))));
}

/**
 * Order-time enforcement for accepted "frequently bought together" offers. Re-prices
 * the companion lines to their AUTHORITATIVE FBT share (computed from the offer config
 * in the DB + the anchor's unit price — the client can never forge it). The discount
 * lives in the companion item prices, so totals/invoices/emails stay correct with no
 * extra plumbing. No-op unless an accepted FBT offer's companions are in the order.
 */
export async function applyFbtPricing(
  admin: Client, businessId: string, acceptedOfferIds: string[],
  anchorProductId: string, anchorUnitPrice: number, items: BumpItem[],
): Promise<{ items: BumpItem[] }> {
  const ids = [...new Set((acceptedOfferIds ?? []).filter((x) => typeof x === "string" && x))];
  if (ids.length === 0) return { items };

  const { data } = await admin
    .from("offers")
    .select("id, type, config, starts_at, ends_at")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .in("id", ids);
  if (!data || data.length === 0) return { items };

  const nowMs = Date.now();
  const out = items.map((i) => ({ ...i }));
  for (const o of data) {
    if (o.type !== "frequently_bought" || !withinWindow(o.starts_at, o.ends_at, nowMs)) continue;
    const cfg = parseOfferConfig(o.config);
    const compIds = new Set(cfg.productIds);
    const compLines = out.filter((i) => compIds.has(i.product_id) && i.product_id !== anchorProductId);
    if (compLines.length === 0) continue;
    const discounted = fbtCompanionPrices(anchorUnitPrice, compLines.map((l) => l.price), cfg);
    compLines.forEach((l, idx) => { if (discounted[idx] < l.price) l.price = discounted[idx]; });
  }
  return { items: out };
}
