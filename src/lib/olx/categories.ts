// OLX nomenclature (categories, attributes, cities, districts) with in-process
// caching. Uses the app-level client_credentials token — per the Partner API,
// config data does not need a user context, so the mapping UI works for every
// merchant without consuming their session.

import { getAppToken } from "./oauth";
import {
  getCategories, getCategoryAttributes, getCities, getCityDistricts,
  isOlxError, suggestCategories,
} from "./client";
import type { OlxAttributeDef, OlxCategory, OlxCategorySuggestion, OlxCity, OlxDistrict } from "./types";

const TTL_6H = 6 * 60 * 60 * 1000;
const TTL_24H = 24 * 60 * 60 * 1000;

const categoryCache = new Map<string, { data: OlxCategory[]; exp: number }>();
const attributeCache = new Map<number, { data: OlxAttributeDef[]; exp: number }>();
const districtCache = new Map<number, { data: OlxDistrict[]; exp: number }>();
let cityCache: { data: OlxCity[]; exp: number } | null = null;

async function withAppToken<T>(fn: (token: string) => Promise<T | null>): Promise<T | null> {
  const token = await getAppToken();
  if (!token) return null;
  return fn(token);
}

export async function getOlxCategoriesCached(parentId?: number): Promise<OlxCategory[] | null> {
  const key = parentId != null ? String(parentId) : "root";
  const hit = categoryCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  return withAppToken(async (token) => {
    const res = await getCategories(token, parentId);
    if (isOlxError(res)) return null;
    const data = Array.isArray(res.data) ? res.data : [];
    categoryCache.set(key, { data, exp: Date.now() + TTL_6H });
    return data;
  });
}

export async function getOlxCategoryAttributesCached(categoryId: number): Promise<OlxAttributeDef[] | null> {
  const hit = attributeCache.get(categoryId);
  if (hit && hit.exp > Date.now()) return hit.data;
  return withAppToken(async (token) => {
    const res = await getCategoryAttributes(token, categoryId);
    if (isOlxError(res)) return null;
    const data = Array.isArray(res.data) ? res.data : [];
    attributeCache.set(categoryId, { data, exp: Date.now() + TTL_6H });
    return data;
  });
}

export async function suggestOlxCategoriesCached(q: string): Promise<OlxCategorySuggestion[] | null> {
  const query = q.trim();
  if (query.length < 3) return [];
  return withAppToken(async (token) => {
    const res = await suggestCategories(token, query);
    if (isOlxError(res)) return null;
    return Array.isArray(res.data) ? res.data : [];
  });
}

// ── Cities ──────────────────────────────────────────────────────────────────────
// /cities has no search param — page through the full list once per process
// (default page size 1000) and filter locally, diacritics-insensitive.

function normalize(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().trim();
}

async function loadAllCities(): Promise<OlxCity[] | null> {
  if (cityCache && cityCache.exp > Date.now()) return cityCache.data;
  return withAppToken(async (token) => {
    const all: OlxCity[] = [];
    for (let page = 0; page < 30; page++) {
      const res = await getCities(token, page * 1000, 1000);
      if (isOlxError(res)) return all.length > 0 ? all : null;
      const batch = Array.isArray(res.data) ? res.data : [];
      all.push(...batch);
      if (batch.length < 1000) break;
    }
    cityCache = { data: all, exp: Date.now() + TTL_24H };
    return all;
  });
}

export async function searchOlxCities(q: string, limit = 20): Promise<OlxCity[] | null> {
  const cities = await loadAllCities();
  if (!cities) return null;
  const nq = normalize(q);
  if (nq.length < 2) return [];
  const starts: OlxCity[] = [];
  const contains: OlxCity[] = [];
  for (const c of cities) {
    const name = normalize(c.name ?? "");
    if (name.startsWith(nq)) starts.push(c);
    else if (name.includes(nq)) contains.push(c);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export async function getOlxCityDistrictsCached(cityId: number): Promise<OlxDistrict[] | null> {
  const hit = districtCache.get(cityId);
  if (hit && hit.exp > Date.now()) return hit.data;
  return withAppToken(async (token) => {
    const res = await getCityDistricts(token, cityId);
    if (isOlxError(res)) return null;
    const data = Array.isArray(res.data) ? res.data : [];
    districtCache.set(cityId, { data, exp: Date.now() + TTL_6H });
    return data;
  });
}
