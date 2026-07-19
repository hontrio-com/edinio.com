// About You nomenclature (countries, brands, categories, attribute groups) with
// in-process caching. The data is global (the marketplace taxonomy, not merchant
// specific), but every call needs a valid API key, so we populate the cache using
// whichever connected merchant triggered the fetch. Cache keys include the
// environment because sandbox and production taxonomies can differ.

import {
  getCarriers, isAboutYouError, listAttributeGroups, listBrands, listCategories, listCountries,
  type AboutYouAuth,
} from "./client";
import type {
  AboutYouAttributeGroup, AboutYouBrand, AboutYouCarrier, AboutYouCategory, AboutYouCountriesResponse,
} from "./types";

const TTL_6H = 6 * 60 * 60 * 1000;
const TTL_24H = 24 * 60 * 60 * 1000;

function envKey(auth: AboutYouAuth): string {
  return auth.environment === "sandbox" ? "sandbox" : "production";
}

const brandsCache = new Map<string, { data: AboutYouBrand[]; exp: number }>();
const carriersCache = new Map<string, { data: AboutYouCarrier[]; exp: number }>();
const countriesCache = new Map<string, { data: AboutYouCountriesResponse; exp: number }>();
const childrenCache = new Map<string, { data: AboutYouCategory[]; exp: number }>();
const attrGroupsCache = new Map<string, { data: AboutYouAttributeGroup[]; exp: number }>();

export async function getCountriesCached(auth: AboutYouAuth): Promise<AboutYouCountriesResponse | null> {
  const key = envKey(auth);
  const hit = countriesCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const res = await listCountries(auth);
  if (isAboutYouError(res)) return null;
  const data = res.data ?? { countries: [], locales: [], currencies: [] };
  countriesCache.set(key, { data, exp: Date.now() + TTL_24H });
  return data;
}

export async function getBrandsCached(auth: AboutYouAuth): Promise<AboutYouBrand[] | null> {
  const key = envKey(auth);
  const hit = brandsCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const res = await listBrands(auth);
  if (isAboutYouError(res)) return null;
  const data = Array.isArray(res.data) ? res.data : [];
  brandsCache.set(key, { data, exp: Date.now() + TTL_24H });
  return data;
}

export async function getCarriersCached(auth: AboutYouAuth): Promise<AboutYouCarrier[] | null> {
  const key = envKey(auth);
  const hit = carriersCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const res = await getCarriers(auth);
  if (isAboutYouError(res)) return null;
  const data = res.data?.items ?? [];
  carriersCache.set(key, { data, exp: Date.now() + TTL_24H });
  return data;
}

// Children of a category (or root categories when parentId is undefined). Pages
// through the endpoint (per_page max 100) so a broad node returns fully.
export async function getCategoryChildrenCached(auth: AboutYouAuth, parentId?: number): Promise<AboutYouCategory[] | null> {
  const key = `${envKey(auth)}:${parentId ?? "root"}`;
  const hit = childrenCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const all: AboutYouCategory[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await listCategories(auth, { parent_category: parentId, page, per_page: 100 });
    if (isAboutYouError(res)) return all.length > 0 ? all : null;
    const batch = res.data?.items ?? [];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  childrenCache.set(key, { data: all, exp: Date.now() + TTL_6H });
  return all;
}

// Free-text category search (by path). Not cached — queries are open-ended.
export async function searchCategories(auth: AboutYouAuth, query: string, limit = 30): Promise<AboutYouCategory[] | null> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await listCategories(auth, { query: q, per_page: Math.min(100, limit) });
  if (isAboutYouError(res)) return null;
  return (res.data?.items ?? []).slice(0, limit);
}

export async function getAttributeGroupsCached(auth: AboutYouAuth, categoryId: number): Promise<AboutYouAttributeGroup[] | null> {
  const key = `${envKey(auth)}:${categoryId}`;
  const hit = attrGroupsCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const res = await listAttributeGroups(auth, categoryId);
  if (isAboutYouError(res)) return null;
  const data = Array.isArray(res.data) ? res.data : [];
  attrGroupsCache.set(key, { data, exp: Date.now() + TTL_6H });
  return data;
}
