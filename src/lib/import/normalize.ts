// Value normalizers for messy real-world feed data (Shopify / Woo / generic CSV).
// Server-only (sanitizeHtml pulls in sanitize-html). Pure, no DB access.

import { slugify } from "@/lib/utils/slugify";
import { sanitizeHtml } from "@/lib/utils/sanitize-html";

/**
 * Parse a price string into a number, tolerating thousands/decimal separators
 * in both EU ("1.299,00") and US ("1,299.00") styles, plus currency symbols.
 * Returns null for empty/invalid/negative.
 */
export function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/[^0-9.,-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // The separator appearing last is the decimal one.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Decimal if exactly 1-2 digits trail the comma, otherwise a thousands sep.
    s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    // Multiple dots => all but the last are thousands separators.
    const dots = (s.match(/\./g) ?? []).length;
    if (dots > 1) {
      const last = s.lastIndexOf(".");
      s = s.slice(0, last).replace(/\./g, "") + "." + s.slice(last + 1);
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Convert a weight value to grams. Shopify exports grams; Woo exports kg; the
 * generic mapper passes the user-chosen unit ("auto" sniffs the text).
 */
export function parseWeightToGrams(raw: unknown, unit: "kg" | "g" | "auto" = "auto"): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const num = parsePrice(s.replace(/[a-z]/g, ""));
  if (num == null) return null;

  let u = unit;
  if (u === "auto") {
    if (/\b(lb|lbs|pound)/.test(s)) return Math.round(num * 453.592);
    if (/kg/.test(s)) u = "kg";
    else if (/\bg\b|gram/.test(s)) u = "g";
    else u = "kg"; // unitless weight columns are almost always kg
  }
  return u === "kg" ? Math.round(num * 1000) : Math.round(num);
}

const TRUE_SET = new Set([
  "1", "true", "yes", "y", "da", "t", "active", "activ", "published", "publicat",
  "visible", "vizibil", "in stock", "instock", "in_stock", "enabled", "on",
]);
const FALSE_SET = new Set([
  "0", "false", "no", "n", "nu", "f", "inactive", "inactiv", "draft", "ciorna",
  "hidden", "ascuns", "out of stock", "outofstock", "disabled", "off", "",
]);

export function parseBool(raw: unknown, fallback = false): boolean {
  if (raw == null) return fallback;
  const s = String(raw).trim().toLowerCase();
  if (TRUE_SET.has(s)) return true;
  if (FALSE_SET.has(s)) return false;
  return fallback;
}

/** Extract image URLs from a delimited cell, keeping only http(s) links. */
export function splitImages(raw: unknown): string[] {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  return dedupe(
    s
      .split(/[\s,|\n]+/)
      .map((t) => t.trim())
      .filter((t) => /^https?:\/\//i.test(t)),
  );
}

/** Split a tags cell on comma / pipe / newline. */
export function splitTags(raw: unknown): string[] {
  if (raw == null) return [];
  return dedupe(
    String(raw)
      .split(/[,|\n]/)
      .map((t) => t.trim())
      .filter(Boolean),
  ).slice(0, 30);
}

/**
 * Parse a category cell into a hierarchy path. Takes the first category when
 * several are listed (our schema stores one category per product) and splits
 * the hierarchy on ">".
 */
export function parseCategoryPath(raw: unknown): string[] {
  if (raw == null) return [];
  const first = String(raw).split(/[,|\n]/)[0]?.trim() ?? "";
  if (!first) return [];
  return first
    .split(/\s*>\s*/)
    .map((p) => cleanText(p))
    .filter(Boolean)
    .slice(0, 4);
}

export function cleanText(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).replace(/\s+/g, " ").trim();
}

export function htmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

export function parseIntOrNull(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = parseInt(s.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Sanitize imported HTML (XSS defense) using the same allowlist as the editor. */
export function sanitizeDescription(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const clean = sanitizeHtml(s).trim();
  return clean || null;
}

/** Build a slug from the product name, falling back to an external id. */
export function makeSlug(name: string, fallback?: string | null): string | null {
  const base = slugify(name || "");
  if (base) return base.slice(0, 80);
  if (fallback) {
    const f = slugify(fallback);
    if (f) return f.slice(0, 80);
  }
  return null;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
