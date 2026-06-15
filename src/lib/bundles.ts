// Shared (non-"use server") bundle logic: types, pricing and availability.
// A bundle is a product (is_bundle=true) whose components live in
// page_sections.bundle. Used by the dashboard builder, storefront and orders.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type BundlePricingMode = "fixed" | "discount_percent" | "discount_amount";

export interface BundleItem {
  product_id: string;
  quantity: number;
}

export interface BundleConfig {
  items: BundleItem[];
  pricing_mode: BundlePricingMode;
  discount_percent?: number;
  discount_amount?: number;
}

// A bundle item paired with the real product data (resolved from the DB).
export interface BundleComponent {
  product_id: string;
  quantity: number;
  name: string;
  price: number;
  image_url: string | null;
  track_inventory: boolean;
  stock_quantity: number | null;
  missing?: boolean;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function bundleComponentsSum(components: { price: number; quantity: number }[]): number {
  return round2(components.reduce((s, c) => s + (Number(c.price) || 0) * (Number(c.quantity) || 0), 0));
}

// Effective bundle price + the "compare at" (sum of components) + the saving.
export function computeBundlePricing(
  components: { price: number; quantity: number }[],
  mode: BundlePricingMode,
  opts: { fixedPrice?: number; discountPercent?: number; discountAmount?: number },
): { price: number; compareAt: number; savings: number } {
  const compareAt = bundleComponentsSum(components);
  let price: number;
  if (mode === "fixed") {
    price = round2(Math.max(0, Number(opts.fixedPrice) || 0));
  } else if (mode === "discount_percent") {
    const pct = Math.min(100, Math.max(0, Number(opts.discountPercent) || 0));
    price = round2(compareAt * (1 - pct / 100));
  } else {
    const amt = Math.max(0, Number(opts.discountAmount) || 0);
    price = round2(Math.max(0, compareAt - amt));
  }
  const savings = round2(Math.max(0, compareAt - price));
  return { price, compareAt, savings };
}

// Availability derived from components: in stock only if every tracked component
// has enough stock for at least one bundle. Returns max buildable count
// (Infinity when no component tracks inventory).
export function bundleAvailability(
  components: { quantity: number; track_inventory: boolean; stock_quantity: number | null; missing?: boolean }[],
): { inStock: boolean; max: number } {
  if (components.length === 0) return { inStock: false, max: 0 };
  let max = Infinity;
  for (const c of components) {
    if (c.missing) return { inStock: false, max: 0 };
    if (!c.track_inventory) continue; // unlimited
    const per = Math.max(1, Number(c.quantity) || 1);
    const avail = Math.floor((Number(c.stock_quantity) || 0) / per);
    max = Math.min(max, avail);
  }
  if (max === Infinity) return { inStock: true, max: Infinity };
  return { inStock: max > 0, max };
}

// Order-time: turn ordered items into the actual stock decrements, expanding any
// bundle into its components, and validating component stock. Returns an error
// string if a component is missing or out of stock (prevents overselling).
export async function expandBundleStock(
  admin: SupabaseClient<Database>,
  businessId: string,
  orderedItems: { product_id: string; quantity: number }[],
): Promise<{ decrements: { product_id: string; quantity: number }[] } | { error: string }> {
  const ids = [...new Set(orderedItems.map((i) => i.product_id))];
  if (ids.length === 0) return { decrements: [] };

  const { data: ordered } = await admin
    .from("products")
    .select("id, is_bundle, page_sections")
    .eq("business_id", businessId)
    .in("id", ids);
  const orderedMap = new Map((ordered ?? []).map((p) => [p.id, p]));

  // Expand bundles into component requirements; non-bundles map to themselves.
  const need = new Map<string, number>();
  for (const item of orderedItems) {
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const p = orderedMap.get(item.product_id);
    const cfg = p?.is_bundle ? readBundleConfig(p.page_sections) : null;
    if (cfg) {
      for (const comp of cfg.items) {
        need.set(comp.product_id, (need.get(comp.product_id) ?? 0) + comp.quantity * qty);
      }
    } else {
      need.set(item.product_id, (need.get(item.product_id) ?? 0) + qty);
    }
  }

  const compIds = [...need.keys()];
  if (compIds.length === 0) return { decrements: [] };
  const { data: comps } = await admin
    .from("products")
    .select("id, track_inventory, stock_quantity")
    .eq("business_id", businessId)
    .in("id", compIds);
  const compMap = new Map((comps ?? []).map((c) => [c.id, c]));

  for (const [pid, required] of need) {
    const c = compMap.get(pid);
    if (!c) return { error: "Un produs din pachet nu mai este disponibil. Reincarca pagina." };
    if (c.track_inventory && (Number(c.stock_quantity) || 0) < required) {
      return { error: "Stoc insuficient pentru un produs din pachet. Reincarca pagina." };
    }
  }

  return { decrements: [...need.entries()].map(([product_id, quantity]) => ({ product_id, quantity })) };
}

// Safely read a bundle config off a product's page_sections JSON.
export function readBundleConfig(pageSections: unknown): BundleConfig | null {
  const ps = (pageSections ?? {}) as { bundle?: BundleConfig };
  const b = ps.bundle;
  if (!b || !Array.isArray(b.items) || b.items.length === 0) return null;
  return {
    items: b.items
      .filter((i) => i && typeof i.product_id === "string")
      .map((i) => ({ product_id: i.product_id, quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)) })),
    pricing_mode: b.pricing_mode ?? "fixed",
    discount_percent: b.discount_percent,
    discount_amount: b.discount_amount,
  };
}
