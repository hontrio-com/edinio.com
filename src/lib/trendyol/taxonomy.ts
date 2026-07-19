// Trendyol nomenclature (category tree, category attributes + values, brands,
// supplier addresses) with in-process caching. Data is global (the marketplace
// taxonomy), but every call needs valid credentials, so we populate the cache
// using whichever connected merchant triggered the fetch. Cache keys include the
// environment (stage and production taxonomies differ).

import {
  getBrandsByName, getCategoryAttributes, getCategoryAttributeValues, getCategoryTree,
  getSupplierAddresses, isTrendyolError, type TrendyolAuth,
} from "./client";
import type {
  TrendyolBrand, TrendyolCategory, TrendyolCategoryAttribute, TrendyolSupplierAddresses,
} from "./types";

const TTL_6H = 6 * 60 * 60 * 1000;
const TTL_24H = 24 * 60 * 60 * 1000;

function envKey(auth: TrendyolAuth): string {
  return auth.environment === "stage" ? "stage" : "production";
}

const treeCache = new Map<string, { data: TrendyolCategory[]; exp: number }>();
const attrCache = new Map<string, { data: TrendyolCategoryAttribute[]; exp: number }>();
const valuesCache = new Map<string, { data: { attributeValueId: number; attributeValue: string }[]; exp: number }>();
const addressCache = new Map<string, { data: TrendyolSupplierAddresses; exp: number }>();

// Whole category tree in one call; cached, navigated in memory by the UI.
export async function getCategoryTreeCached(auth: TrendyolAuth): Promise<TrendyolCategory[] | null> {
  const key = envKey(auth);
  const hit = treeCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const res = await getCategoryTree(auth);
  if (isTrendyolError(res)) return null;
  const raw = res.data as { categories?: TrendyolCategory[] } | TrendyolCategory[];
  const data = Array.isArray(raw) ? raw : (raw.categories ?? []);
  treeCache.set(key, { data, exp: Date.now() + TTL_24H });
  return data;
}

// Flatten only leaf categories (usable for products), diacritics-insensitive search.
function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim();
}
function collectLeaves(nodes: TrendyolCategory[], path: string, out: { id: number; label: string }[]): void {
  for (const n of nodes) {
    const label = path ? `${path} > ${n.name}` : n.name;
    if (!n.subCategories || n.subCategories.length === 0) out.push({ id: n.id, label });
    else collectLeaves(n.subCategories, label, out);
  }
}
export async function searchLeafCategories(auth: TrendyolAuth, query: string, limit = 40): Promise<{ id: number; label: string }[] | null> {
  const tree = await getCategoryTreeCached(auth);
  if (!tree) return null;
  const leaves: { id: number; label: string }[] = [];
  collectLeaves(tree, "", leaves);
  const nq = normalize(query);
  if (nq.length < 2) return [];
  return leaves.filter((l) => normalize(l.label).includes(nq)).slice(0, limit);
}

export async function getCategoryAttributesCached(auth: TrendyolAuth, categoryId: number): Promise<TrendyolCategoryAttribute[] | null> {
  const key = `${envKey(auth)}:${categoryId}`;
  const hit = attrCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const res = await getCategoryAttributes(auth, categoryId);
  if (isTrendyolError(res)) return null;
  const data = res.data?.categoryAttributes ?? [];
  attrCache.set(key, { data, exp: Date.now() + TTL_6H });
  return data;
}

export async function getCategoryAttributeValuesCached(auth: TrendyolAuth, categoryId: number, attributeId: number): Promise<{ attributeValueId: number; attributeValue: string }[] | null> {
  const key = `${envKey(auth)}:${categoryId}:${attributeId}`;
  const hit = valuesCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const res = await getCategoryAttributeValues(auth, categoryId, attributeId);
  if (isTrendyolError(res)) return null;
  const data = res.data?.content ?? [];
  valuesCache.set(key, { data, exp: Date.now() + TTL_6H });
  return data;
}

// Brands: the catalogue is huge, so we search by name rather than caching all.
export async function searchBrands(auth: TrendyolAuth, name: string): Promise<TrendyolBrand[] | null> {
  const q = name.trim();
  if (q.length < 2) return [];
  const res = await getBrandsByName(auth, q);
  if (isTrendyolError(res)) return null;
  return (res.data?.brands ?? []).slice(0, 30);
}

export async function getSupplierAddressesCached(auth: TrendyolAuth, force = false): Promise<TrendyolSupplierAddresses | null> {
  const key = envKey(auth);
  const hit = addressCache.get(key);
  if (!force && hit && hit.exp > Date.now()) return hit.data;
  const res = await getSupplierAddresses(auth);
  if (isTrendyolError(res)) return null;
  const data = res.data ?? { supplierAddresses: [] };
  addressCache.set(key, { data, exp: Date.now() + TTL_6H });
  return data;
}
