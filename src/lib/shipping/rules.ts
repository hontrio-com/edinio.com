// Shared (non-"use server") shipping rules engine: conditional pricing that layers
// on top of the base courier options produced by getShippingOptions. Parsed
// defensively from jsonb (like lib/offers/offer.types.ts) so a malformed row can
// never crash the storefront. The engine is a pure function over any option shape
// carrying { courier, price }, so it never imports the "use server" actions module.

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface ShippingClass {
  id: string;
  name: string;
}

export type ShippingCondition =
  | { type: "weight"; min?: number; max?: number }   // kg (min inclusiv, max exclusiv)
  | { type: "subtotal"; min?: number; max?: number } // lei, valoarea marfii dupa promo
  | { type: "quantity"; min?: number; max?: number } // nr. total de bucati
  | { type: "class"; classIds: string[]; mode: "any" | "all" }
  | { type: "category"; categories: string[] }
  | { type: "product"; productIds: string[] }
  | { type: "county"; counties: string[] };

export type ShippingAction =
  | { type: "surcharge"; amount: number; percent?: boolean } // +X lei sau +X%
  | { type: "free" }                                         // pret = 0
  | { type: "flat"; amount: number }                         // seteaza pretul (doar curieri fix)
  | { type: "hide" };                                        // scoate curierul

export interface ShippingRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;                 // evaluat descrescator
  conditions: ShippingCondition[];  // AND intre ele; gol = se potriveste mereu
  action: ShippingAction;
  couriers: string[] | null;        // null = toti curierii; altfel restrange la acesti id-uri
  presetKey?: string;               // ce scenariu presetat a generat regula (grupare in UI)
}

// Context de cos calculat server-side in getShippingOptions (date autoritative din DB).
export interface ShippingCartContext {
  subtotal: number;
  weightKg: number;
  quantity: number;
  classIds: string[];
  categories: string[];
  productIds: string[];
  county: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

/** Id scurt pentru reguli/clase noi (client + server). */
export function newShippingId(prefix: string): string {
  const rnd = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${rnd}`;
}

/* ─── Condition matching ───────────────────────────────────────────────────── */

// min inclusiv, max EXCLUSIV — trepte contigue (0-1, 1-5, 5+) nu se suprapun.
function inRange(v: number, min?: number, max?: number): boolean {
  if (min != null && v < min) return false;
  if (max != null && v >= max) return false;
  return true;
}

const norm = (s: string) => (s ?? "").trim().toLowerCase();

export function conditionsMatch(conds: ShippingCondition[], ctx: ShippingCartContext): boolean {
  return conds.every((c) => {
    switch (c.type) {
      case "weight":   return inRange(ctx.weightKg, c.min, c.max);
      case "subtotal": return inRange(ctx.subtotal, c.min, c.max);
      case "quantity": return inRange(ctx.quantity, c.min, c.max);
      case "class":    return c.mode === "all"
        ? c.classIds.every((id) => ctx.classIds.includes(id))
        : c.classIds.some((id) => ctx.classIds.includes(id));
      case "category": return c.categories.some((x) => ctx.categories.includes(x));
      case "product":  return c.productIds.some((x) => ctx.productIds.includes(x));
      case "county":   return c.counties.map(norm).includes(norm(ctx.county));
      default:         return false;
    }
  });
}

/* ─── Engine ───────────────────────────────────────────────────────────────── */

/**
 * Post-proceseaza optiunile de baza cu regulile care se potrivesc pe context.
 * Generic peste orice forma cu { courier, price } — pastreaza toate celelalte campuri.
 *
 * Per optiune (in ordinea priority desc):
 *   - `flat`      → DOAR pe curieri fix (flatCourierIds); seteaza pretul de baza (prima castiga).
 *   - `surcharge` → se adauga peste pretul de baza (se cumuleaza); orice curier.
 *   - `free`      → pret 0; orice curier.
 *   - `hide`      → scoate optiunea; orice curier.
 * Fara reguli active → optiunile se intorc neatinse (compatibilitate 100%).
 */
export function applyShippingRules<T extends { courier: string; price: number }>(
  options: T[],
  rules: ShippingRule[],
  ctx: ShippingCartContext,
  flatCourierIds: Set<string>,
): T[] {
  const active = rules
    .filter((r) => r.enabled && conditionsMatch(r.conditions, ctx))
    .sort((a, b) => b.priority - a.priority);
  if (active.length === 0) return options;

  const out: T[] = [];
  for (const opt of options) {
    const applicable = active.filter(
      (r) => !r.couriers || r.couriers.length === 0 || r.couriers.includes(opt.courier),
    );
    if (applicable.some((r) => r.action.type === "hide")) continue;

    // Pret de baza: prima regula `flat` care se potriveste (doar curieri fix), altfel pretul propriu.
    let base = opt.price;
    if (flatCourierIds.has(opt.courier)) {
      const flat = applicable.find((r) => r.action.type === "flat");
      if (flat && flat.action.type === "flat") base = Math.max(0, flat.action.amount);
    }

    const free = applicable.some((r) => r.action.type === "free");
    let surcharge = 0;
    for (const r of applicable) {
      if (r.action.type === "surcharge") {
        surcharge += r.action.percent ? base * (r.action.amount / 100) : r.action.amount;
      }
    }

    const price = free ? 0 : round2(Math.max(0, base + surcharge));
    out.push({ ...opt, price });
  }
  return out;
}

/* ─── Parsing (jsonb -> valori tipate sigure) ──────────────────────────────── */

export function parseShippingClasses(raw: unknown): ShippingClass[] {
  if (!Array.isArray(raw)) return [];
  const out: ShippingClass[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = toStr(o.id).trim();
    const name = toStr(o.name).trim();
    if (id && name) out.push({ id, name });
  }
  return out;
}

function parseCondition(raw: unknown): ShippingCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const t = toStr(o.type);
  if (t === "weight" || t === "subtotal" || t === "quantity") {
    const min = o.min != null && Number.isFinite(Number(o.min)) ? Number(o.min) : undefined;
    const max = o.max != null && Number.isFinite(Number(o.max)) ? Number(o.max) : undefined;
    if (min == null && max == null) return null;
    return { type: t, min, max };
  }
  if (t === "class") {
    const classIds = toStrArr(o.classIds);
    if (!classIds.length) return null;
    return { type: "class", classIds, mode: o.mode === "all" ? "all" : "any" };
  }
  if (t === "category") {
    const categories = toStrArr(o.categories);
    return categories.length ? { type: "category", categories } : null;
  }
  if (t === "product") {
    const productIds = toStrArr(o.productIds);
    return productIds.length ? { type: "product", productIds } : null;
  }
  if (t === "county") {
    const counties = toStrArr(o.counties);
    return counties.length ? { type: "county", counties } : null;
  }
  return null;
}

function parseAction(raw: unknown): ShippingAction | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const t = toStr(o.type);
  if (t === "surcharge") return { type: "surcharge", amount: Math.max(0, toNum(o.amount)), percent: o.percent === true };
  if (t === "flat")      return { type: "flat", amount: Math.max(0, toNum(o.amount)) };
  if (t === "free")      return { type: "free" };
  if (t === "hide")      return { type: "hide" };
  return null;
}

export function parseShippingRules(raw: unknown): ShippingRule[] {
  if (!Array.isArray(raw)) return [];
  const out: ShippingRule[] = [];
  raw.forEach((r, idx) => {
    if (!r || typeof r !== "object") return;
    const o = r as Record<string, unknown>;
    const action = parseAction(o.action);
    if (!action) return;
    const conditions = Array.isArray(o.conditions)
      ? o.conditions.map(parseCondition).filter((c): c is ShippingCondition => c !== null)
      : [];
    const couriers = Array.isArray(o.couriers) ? toStrArr(o.couriers) : null;
    out.push({
      id: toStr(o.id).trim() || `rule-${idx}`,
      name: toStr(o.name).trim() || "Regula transport",
      enabled: o.enabled !== false,
      priority: Number.isFinite(Number(o.priority)) ? Number(o.priority) : 0,
      conditions,
      action,
      couriers: couriers && couriers.length ? couriers : null,
      presetKey: typeof o.presetKey === "string" ? o.presetKey : undefined,
    });
  });
  return out;
}
