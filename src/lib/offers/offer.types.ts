// Shared (non-"use server") types + parsing for the Offers hub.
//
// An "offer" is one row in the `offers` table with four layers:
//   TYPE     — what kind of offer it is (see OfferType)
//   TRIGGER  — which products/categories activate it (where it shows up)
//   CONFIG   — type-specific settings (offered products, discount, copy)
//   DISPLAY  — surfaces it renders on + style
//
// Bundles are NOT modelled here — they stay as products (products.is_bundle); the
// hub only surfaces them. Everything is parsed defensively from jsonb (like
// store-sections.ts) so a malformed row can never crash the storefront.

/* ─── Type union ──────────────────────────────────────────────────────────── */

export type OfferType =
  | "frequently_bought" // FBT: anchor product + companions, combined discount (PDP)
  | "cross_sell"        // "Merge bine cu": recommended products (PDP + cart)
  | "order_bump"        // single discounted product added at checkout
  | "post_purchase"     // 1-click add on the confirmation page — Faza 2
  | "volume"            // buy X units, get %/amount off — Faza 3
  | "bogo"              // buy X get Y free/discounted — Faza 3
  | "gift"              // free gift at a spend threshold — Faza 3
  | "spend_reward";     // spend & save ladder — Faza 3

export const OFFER_TYPES: OfferType[] = [
  "frequently_bought", "cross_sell", "order_bump",
  "post_purchase", "volume", "bogo", "gift", "spend_reward",
];

// Types that are actually resolved + rendered in Faza 1. The rest are valid to
// store (schema is future-proof) but not yet evaluated by the storefront.
export const PHASE1_OFFER_TYPES: OfferType[] = ["frequently_bought", "cross_sell", "order_bump"];

export function isOfferType(v: unknown): v is OfferType {
  return typeof v === "string" && (OFFER_TYPES as string[]).includes(v);
}

/* ─── Trigger (where the offer activates) ─────────────────────────────────── */

export type OfferScope = "products" | "categories" | "all";

// Rule-only extra gates (Faza 3). Kept optional so the schema is stable now.
export interface OfferConditions {
  minQty?: number;
  minValue?: number;
  requiredProductIds?: string[];
}

export interface OfferTrigger {
  scope: OfferScope;
  /** scope === "products": the anchor product ids that show this offer. */
  productIds: string[];
  /** scope === "categories": category names (match products.category). */
  categories: string[];
  conditions?: OfferConditions;
}

/* ─── Config (type-specific) ──────────────────────────────────────────────── */

export type OfferDiscountMode = "none" | "percent" | "amount" | "fixed_price";

export interface OfferConfig {
  /** Products offered/recommended (cross_sell / FBT companions / bump / post-purchase). */
  productIds: string[];
  /** cross_sell: auto-pick from the anchor's category instead of a manual list. */
  autoByCategory: boolean;
  /** Max products shown (clamped 1..OFFER_MAX_PRODUCTS). */
  maxProducts: number;
  /** How the discount is expressed. "none" = pure recommendation (cross_sell default). */
  discountMode: OfferDiscountMode;
  discountPercent?: number;   // discountMode === "percent"
  discountAmount?: number;    // discountMode === "amount"
  fixedPrice?: number;        // discountMode === "fixed_price" (FBT: total for the set)
  /** Optional copy overrides — fall back to per-type Romanian defaults. */
  title?: string;
  buttonLabel?: string;
}

/* ─── Display (surfaces + style) ──────────────────────────────────────────── */

export type OfferSurface = "product_page" | "cart" | "checkout" | "confirmation";

export interface OfferDisplay {
  surfaces: OfferSurface[];
  style: "card" | "list" | "inline";
}

/* ─── Limits + per-type defaults ──────────────────────────────────────────── */

export const OFFER_MAX_PRODUCTS = 12;
export const OFFER_DEFAULT_MAX_PRODUCTS = 4;

// Default surfaces per type — where each offer naturally belongs. The merchant can
// override in `display.surfaces`, but these keep zero-config offers sensible.
export function defaultSurfacesFor(type: OfferType): OfferSurface[] {
  switch (type) {
    case "frequently_bought": return ["product_page"];
    case "cross_sell":        return ["product_page", "cart"];
    case "order_bump":        return ["checkout"];
    case "post_purchase":     return ["confirmation"];
    default:                  return ["cart"]; // rules apply at cart level
  }
}

// Default Romanian title per type (used when config.title is empty).
export function defaultTitleFor(type: OfferType): string {
  switch (type) {
    case "frequently_bought": return "Cumparate frecvent impreuna";
    case "cross_sell":        return "Merge bine cu";
    case "order_bump":        return "Adauga la comanda";
    case "post_purchase":     return "Completeaza comanda";
    case "gift":              return "Cadou pentru tine";
    default:                  return "Oferta speciala";
  }
}

/* ─── Parsing / sanitizing (jsonb -> safe typed values) ───────────────────── */

const VALID_SCOPES: OfferScope[] = ["products", "categories", "all"];
const VALID_DISCOUNT_MODES: OfferDiscountMode[] = ["none", "percent", "amount", "fixed_price"];
const VALID_SURFACES: OfferSurface[] = ["product_page", "cart", "checkout", "confirmation"];
const VALID_STYLES: OfferDisplay["style"][] = ["card", "list", "inline"];

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

export function parseOfferTrigger(raw: unknown): OfferTrigger {
  const r = (raw ?? {}) as Record<string, unknown>;
  const scope = VALID_SCOPES.includes(r.scope as OfferScope) ? (r.scope as OfferScope) : "products";
  const trigger: OfferTrigger = {
    scope,
    productIds: toStringArray(r.productIds),
    categories: toStringArray(r.categories),
  };
  const c = r.conditions as Record<string, unknown> | undefined;
  if (c && typeof c === "object") {
    const conditions: OfferConditions = {};
    if (Number.isFinite(Number(c.minQty))) conditions.minQty = Math.max(1, Math.floor(Number(c.minQty)));
    if (Number.isFinite(Number(c.minValue))) conditions.minValue = Math.max(0, Number(c.minValue));
    const req = toStringArray(c.requiredProductIds);
    if (req.length) conditions.requiredProductIds = req;
    if (Object.keys(conditions).length) trigger.conditions = conditions;
  }
  return trigger;
}

export function parseOfferConfig(raw: unknown): OfferConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const discountMode = VALID_DISCOUNT_MODES.includes(r.discountMode as OfferDiscountMode)
    ? (r.discountMode as OfferDiscountMode)
    : "none";
  const cfg: OfferConfig = {
    productIds: toStringArray(r.productIds),
    autoByCategory: r.autoByCategory === true,
    maxProducts: clampNumber(r.maxProducts, 1, OFFER_MAX_PRODUCTS, OFFER_DEFAULT_MAX_PRODUCTS),
    discountMode,
  };
  if (discountMode === "percent") cfg.discountPercent = clampNumber(r.discountPercent, 0, 100, 0);
  if (discountMode === "amount") cfg.discountAmount = Math.max(0, Number(r.discountAmount) || 0);
  if (discountMode === "fixed_price") cfg.fixedPrice = Math.max(0, Number(r.fixedPrice) || 0);
  if (typeof r.title === "string" && r.title.trim()) cfg.title = r.title.trim();
  if (typeof r.buttonLabel === "string" && r.buttonLabel.trim()) cfg.buttonLabel = r.buttonLabel.trim();
  return cfg;
}

export function parseOfferDisplay(raw: unknown, type: OfferType): OfferDisplay {
  const r = (raw ?? {}) as Record<string, unknown>;
  const surfaces = Array.isArray(r.surfaces)
    ? (r.surfaces as unknown[]).filter((s): s is OfferSurface => VALID_SURFACES.includes(s as OfferSurface))
    : [];
  const style = VALID_STYLES.includes(r.style as OfferDisplay["style"]) ? (r.style as OfferDisplay["style"]) : "card";
  return {
    surfaces: surfaces.length ? surfaces : defaultSurfacesFor(type),
    style,
  };
}

/* ─── Resolved shapes (what the storefront consumes) ──────────────────────── */

// A product resolved for display inside an offer (authoritative data from the DB).
export interface OfferProduct {
  id: string;
  name: string;
  slug: string | null;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  outOfStock: boolean;
  /** Variable product — must be configured on its own page, not quick-added. */
  hasVariants?: boolean;
}

// One offer, resolved with real product data + computed pricing, ready to render.
export interface ResolvedOffer {
  id: string;
  type: OfferType;
  title: string;
  buttonLabel?: string;
  style: OfferDisplay["style"];
  products: OfferProduct[];
  /** Combined pricing for FBT / order_bump (absent for pure cross_sell). */
  pricing?: { price: number; compareAt: number; savings: number };
}

/**
 * Distribute an FBT set's savings across the companion prices — client-side mirror of
 * the server's `fbtCompanionPrices`. Shared by the FBT card preview and the buy-together
 * handler, so the card, the checkout modal and the charged total always agree to the ban.
 * The anchor stays at full price; companions never go below 0.
 */
export function distributeFbtSavings(companionPrices: number[], savings: number): number[] {
  const compTotal = companionPrices.reduce((s, p) => s + p, 0);
  const cap = Math.min(savings, compTotal);
  if (cap <= 0 || compTotal <= 0) return companionPrices.map((p) => Math.round(p * 100) / 100);
  return companionPrices.map((p) => Math.round(Math.max(0, p - cap * (p / compTotal)) * 100) / 100);
}
