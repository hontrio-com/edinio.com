// Meta (Facebook) Catalog product feed — RSS 2.0 with the Google Shopping (g:)
// namespace, which Meta Commerce Manager accepts as a scheduled data source.
//
// Self-contained on purpose: it reuses only the pure variant helpers and does NOT
// touch the live Google Merchant mapping. The feed `id` equals product.id so it
// matches the Facebook Pixel content_ids across the funnel — that alignment is
// what makes Advantage+ dynamic ads work.

import { storeBaseUrl } from "@/lib/seo";
import { parseVariants, VARIANT_TITLE_SEP, comboUnitPrice, comboCompareAtPrice } from "@/lib/storefront/variants";

const CURRENCY = "RON";

export interface CatalogBusiness {
  slug: string;
  custom_domain: string | null;
  store_name: string | null;
  business_name: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  images: unknown;
  category: string | null;
  track_inventory: boolean;
  stock_quantity: number | null;
  page_sections?: unknown;
}

// Per-product Google/Meta attribute overrides, stored in page_sections.google
// (the same field the Merchant editor writes).
interface GoogleAttrs {
  brand?: string; gtin?: string; mpn?: string; condition?: string;
  google_product_category?: string; gender?: string; age_group?: string;
  color?: string; size?: string; material?: string;
  custom_label_0?: string; custom_label_1?: string; custom_label_2?: string; custom_label_3?: string; custom_label_4?: string;
}

export interface CatalogItem {
  id: string;
  title: string;
  description: string;
  availability: string;   // "in stock" | "out of stock"
  condition: string;      // "new" | "refurbished" | "used"
  price: string;          // "99.90 RON"
  salePrice?: string;
  link: string;
  imageLink: string;
  additionalImageLinks: string[];
  brand: string;
  gtin?: string;
  mpn?: string;
  googleProductCategory?: string;
  productType?: string;
  color?: string;
  size?: string;
  gender?: string;
  ageGroup?: string;
  material?: string;
  pattern?: string;
  customLabels: (string | undefined)[]; // index 0..4
  itemGroupId?: string;
}

function money(value: number): string {
  return `${(Math.round((Number(value) || 0) * 100) / 100).toFixed(2)} ${CURRENCY}`;
}

function plainText(html: string | null, fallback: string): string {
  const text = (html ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, 5000);
}

// GTIN: 8/12/13/14 digits with a valid mod-10 check digit (invalid -> dropped).
function isValidGtin(raw: string | undefined): boolean {
  const s = (raw ?? "").replace(/\s/g, "");
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(s)) return false;
  const d = s.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const CONDITIONS = new Set(["new", "refurbished", "used"]);
const GENDERS = new Set(["male", "female", "unisex"]);
const AGE_GROUPS = new Set(["adult", "kids", "toddler", "infant", "newborn"]);
function oneOf(value: string | undefined, allowed: Set<string>): string | undefined {
  const v = (value ?? "").trim().toLowerCase();
  return allowed.has(v) ? v : undefined;
}

// Variant option axes -> distinct Meta variant attributes (unique set per variant).
const COLOR_RE = /cul|colou?r/i;
const SIZE_RE = /m[aă]rim|size|talie|numar|număr/i;
const MATERIAL_RE = /material|tesatur|țesătur|compozi/i;
const VARIANT_SLOTS = ["color", "size", "material", "pattern"] as const;

/**
 * Build one Meta catalog item for a simple product, or one per enabled variant
 * (linked by item_group_id) for a variable product. Products without an image
 * are skipped (Meta requires image_link and won't run imageless items in ads).
 */
export function buildCatalogItems(business: CatalogBusiness, product: CatalogProduct): CatalogItem[] {
  const images = Array.isArray(product.images) ? product.images.map(String).filter(Boolean) : [];
  const primaryImage = images[0];
  if (!primaryImage) return [];

  const link = `${storeBaseUrl(business)}/product/${product.slug ?? product.id}`;
  const g = ((product.page_sections as { google?: GoogleAttrs } | null)?.google) ?? {};
  const brand = g.brand || business.store_name || business.business_name;
  const condition = oneOf(g.condition, CONDITIONS) ?? "new";
  const gender = oneOf(g.gender, GENDERS);
  const ageGroup = oneOf(g.age_group, AGE_GROUPS);
  const validGtin = isValidGtin(g.gtin);
  const description = plainText(product.description, product.name);
  const additional = images.slice(1, 11);
  const customLabels = [g.custom_label_0, g.custom_label_1, g.custom_label_2, g.custom_label_3, g.custom_label_4];
  const productType = product.category?.trim() || undefined;
  const googleCat = g.google_product_category?.trim() || undefined;

  const basePrice = Number(product.price) || 0;
  const baseCompare = product.compare_at_price != null ? Number(product.compare_at_price) : null;
  const inStock = !product.track_inventory || (product.stock_quantity ?? 0) > 0;

  const variants = parseVariants(product.page_sections);
  const enabled = variants?.combinations.filter((c) => c.enabled && c.title) ?? [];

  if (!variants || enabled.length === 0) {
    const hasSale = baseCompare != null && baseCompare > basePrice;
    return [{
      id: product.id,
      title: product.name.slice(0, 200),
      description,
      availability: inStock ? "in stock" : "out of stock",
      condition,
      price: money(hasSale ? baseCompare! : basePrice),
      salePrice: hasSale ? money(basePrice) : undefined,
      link,
      imageLink: primaryImage,
      additionalImageLinks: additional,
      brand,
      gtin: validGtin ? g.gtin!.replace(/\s/g, "") : undefined,
      mpn: g.mpn?.trim() || undefined,
      googleProductCategory: googleCat,
      productType,
      color: g.color?.trim() || undefined,
      size: g.size?.trim() || undefined,
      gender,
      ageGroup,
      material: g.material?.trim() || undefined,
      customLabels,
      itemGroupId: undefined,
    }];
  }

  // Assign each axis to a distinct slot (recognized first, rest fill remaining),
  // so every variant has a unique attribute set.
  const usedSlots = new Set<string>();
  const slotFor: (string | undefined)[] = variants.options.map((o) => {
    const named = COLOR_RE.test(o.name) ? "color" : SIZE_RE.test(o.name) ? "size" : MATERIAL_RE.test(o.name) ? "material" : undefined;
    if (named && !usedSlots.has(named)) { usedSlots.add(named); return named; }
    return undefined;
  });
  variants.options.forEach((_, i) => {
    if (slotFor[i]) return;
    const free = VARIANT_SLOTS.find((s) => !usedSlots.has(s));
    if (free) { usedSlots.add(free); slotFor[i] = free; }
  });

  return enabled.map((combo) => {
    const parts = combo.title.split(VARIANT_TITLE_SEP);
    const unit = comboUnitPrice(combo, basePrice) || basePrice;
    const compare = comboCompareAtPrice(combo, baseCompare);
    const hasSale = compare != null && compare > unit;
    const stock = combo.stock_quantity != null && String(combo.stock_quantity).trim() !== "" ? Number(combo.stock_quantity) : null;
    const comboInStock = product.track_inventory && stock != null && Number.isFinite(stock) ? stock > 0 : inStock;
    const slots: Record<string, string> = {};
    variants.options.forEach((_, i) => {
      const slot = slotFor[i];
      if (slot && parts[i]) slots[slot] = parts[i];
    });
    return {
      id: `${product.id}-${combo.id}`.slice(0, 100),
      title: `${product.name} - ${combo.title}`.slice(0, 200),
      description,
      availability: comboInStock ? "in stock" : "out of stock",
      condition,
      price: money(hasSale ? compare! : unit),
      salePrice: hasSale ? money(unit) : undefined,
      link,
      imageLink: combo.image || primaryImage,
      additionalImageLinks: additional,
      brand,
      // No per-variant identifiers in the model; a shared GTIN across variants is a
      // duplicate-GTIN error, so variants omit gtin/mpn.
      gtin: undefined,
      mpn: undefined,
      googleProductCategory: googleCat,
      productType,
      color: slots.color ?? (g.color?.trim() || undefined),
      size: slots.size ?? (g.size?.trim() || undefined),
      gender,
      ageGroup,
      material: slots.material ?? (g.material?.trim() || undefined),
      pattern: slots.pattern,
      customLabels,
      itemGroupId: product.id,
    };
  });
}

// ── Serialization ────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function gEl(name: string, v?: string): string { return v ? `<g:${name}>${esc(v)}</g:${name}>` : ""; }
function rEl(name: string, v?: string): string { return v ? `<${name}>${esc(v)}</${name}>` : ""; }

/** Render the catalog items as a Google-Shopping-style RSS 2.0 feed (Meta accepts it). */
export function serializeCatalogFeed(business: CatalogBusiness, items: CatalogItem[]): string {
  const base = storeBaseUrl(business);
  const storeName = business.store_name || business.business_name;
  const body = items.map((it) =>
    "<item>" +
    gEl("id", it.id) +
    rEl("title", it.title) +
    rEl("description", it.description) +
    rEl("link", it.link) +
    gEl("image_link", it.imageLink) +
    it.additionalImageLinks.map((u) => gEl("additional_image_link", u)).join("") +
    gEl("availability", it.availability) +
    gEl("condition", it.condition) +
    gEl("price", it.price) +
    gEl("sale_price", it.salePrice) +
    gEl("brand", it.brand) +
    gEl("gtin", it.gtin) +
    gEl("mpn", it.mpn) +
    gEl("google_product_category", it.googleProductCategory) +
    gEl("product_type", it.productType) +
    gEl("color", it.color) +
    gEl("size", it.size) +
    gEl("gender", it.gender) +
    gEl("age_group", it.ageGroup) +
    gEl("material", it.material) +
    gEl("pattern", it.pattern) +
    gEl("item_group_id", it.itemGroupId) +
    it.customLabels.map((v, i) => gEl(`custom_label_${i}`, v)).join("") +
    "</item>",
  ).join("");
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>' +
    rEl("title", storeName) +
    rEl("link", base) +
    rEl("description", `Catalog produse ${storeName}`) +
    body +
    "</channel></rss>";
}
