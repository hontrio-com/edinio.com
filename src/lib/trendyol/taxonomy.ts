// Trendyol nomenclature (category tree, category attributes + values, brands,
// supplier addresses) with in-process caching. Every call needs valid credentials,
// so we populate the cache using whichever connected merchant triggered the fetch.
//
// Doua feluri de date, doua feluri de chei — vezi `cheiePublica` si `cheieVanzator`.
// Nomenclatoarele sunt publice si se pot imparti; adresele NU.

import {
  getBrandsByName, getCategoryAttributes, getCategoryAttributeValues, getCategoryTree,
  getSupplierAddresses, isTrendyolError, type TrendyolAuth,
} from "./client";
import type {
  TrendyolBrand, TrendyolCategory, TrendyolCategoryAttribute, TrendyolSupplierAddresses,
} from "./types";
import { TRENDYOL_DEFAULT_STOREFRONT } from "./types";

const TTL_6H = 6 * 60 * 60 * 1000;
const TTL_24H = 24 * 60 * 60 * 1000;

/**
 * Cheia pentru date PUBLICE (taxonomia marketplace-ului).
 *
 * Include vitrina, nu doar mediul: categoriile si atributele vin traduse si
 * filtrate pe tara, deci arborele romanesc si cel german sunt liste diferite.
 * Fara vitrina in cheie, al doilea comerciant primea taxonomia primului.
 */
function cheiePublica(auth: TrendyolAuth): string {
  const env = auth.environment === "stage" ? "stage" : "production";
  return `${env}:${auth.storefront ?? TRENDYOL_DEFAULT_STOREFRONT}`;
}

/**
 * Cheia pentru date ale UNUI vanzator (adresele lui).
 *
 * Trebuie sa contina supplierId. Cache-ul era pe mediu, deci adresele primului
 * magazin conectat se serveau tuturor celorlalte — scurgere intre chiriasi si,
 * practic, colete trimise de la adresa altcuiva.
 */
function cheieVanzator(auth: TrendyolAuth): string {
  return `${cheiePublica(auth)}:${auth.supplierId}`;
}

const treeCache = new Map<string, { data: TrendyolCategory[]; exp: number }>();
const attrCache = new Map<string, { data: TrendyolCategoryAttribute[]; exp: number }>();
const valuesCache = new Map<string, { data: { attributeValueId: number; attributeValue: string }[]; exp: number }>();
const addressCache = new Map<string, { data: TrendyolSupplierAddresses; exp: number }>();

// Whole category tree in one call; cached, navigated in memory by the UI.
export async function getCategoryTreeCached(auth: TrendyolAuth): Promise<TrendyolCategory[] | null> {
  const key = cheiePublica(auth);
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
/** Toate categoriile finale, ca lista plata. Baza pentru maparea automata. */
export async function getLeafCategoriesCached(auth: TrendyolAuth): Promise<{ id: number; label: string }[] | null> {
  const tree = await getCategoryTreeCached(auth);
  if (!tree) return null;
  const leaves: { id: number; label: string }[] = [];
  collectLeaves(tree, "", leaves);
  return leaves;
}

export async function searchLeafCategories(auth: TrendyolAuth, query: string, limit = 40): Promise<{ id: number; label: string }[] | null> {
  const leaves = await getLeafCategoriesCached(auth);
  if (!leaves) return null;
  const nq = normalize(query);
  if (nq.length < 2) return [];
  return leaves.filter((l) => normalize(l.label).includes(nq)).slice(0, limit);
}

export async function getCategoryAttributesCached(auth: TrendyolAuth, categoryId: number): Promise<TrendyolCategoryAttribute[] | null> {
  const key = `${cheiePublica(auth)}:${categoryId}`;
  const hit = attrCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const res = await getCategoryAttributes(auth, categoryId);
  if (isTrendyolError(res)) return null;
  const data = res.data?.categoryAttributes ?? [];
  attrCache.set(key, { data, exp: Date.now() + TTL_6H });
  return data;
}

export async function getCategoryAttributeValuesCached(auth: TrendyolAuth, categoryId: number, attributeId: number): Promise<{ attributeValueId: number; attributeValue: string }[] | null> {
  const key = `${cheiePublica(auth)}:${categoryId}:${attributeId}`;
  const hit = valuesCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const res = await getCategoryAttributeValues(auth, categoryId, attributeId);
  if (isTrendyolError(res)) return null;
  const data = res.data?.content ?? [];
  valuesCache.set(key, { data, exp: Date.now() + TTL_6H });
  return data;
}

// Brands: the catalogue is huge, so we search by name rather than caching all.
// Raspunsul cautarii e un array simplu (spre deosebire de lista completa, care
// vine invelita in `{ brands }`); tolerăm ambele forme, ca sa nu se rupa daca
// Trendyol le uniformizeaza vreodata.
export async function searchBrands(auth: TrendyolAuth, name: string): Promise<TrendyolBrand[] | null> {
  const q = name.trim();
  if (q.length < 2) return [];
  const res = await getBrandsByName(auth, q);
  if (isTrendyolError(res)) return null;
  const brut = res.data as TrendyolBrand[] | { brands?: TrendyolBrand[] } | null;
  const lista = Array.isArray(brut) ? brut : (brut?.brands ?? []);
  return lista.slice(0, 30);
}

/**
 * Adresele vanzatorului.
 *
 * Serviciul e limitat la O SINGURA cerere pe ora, deci cache-ul nu e o optimizare,
 * ci singurul mod de a-l folosi fara sa lovim 429. `force` reimprospateaza, dar nu
 * mai des de un sfert de ora, si pastreaza ultimul raspuns bun daca apelul esueaza
 * — mai bine adrese de acum zece minute decat un selector gol.
 */
const REIMPROSPATARE_MIN = 15 * 60 * 1000;

export async function getSupplierAddressesCached(auth: TrendyolAuth, force = false): Promise<TrendyolSupplierAddresses | null> {
  const key = cheieVanzator(auth);
  const hit = addressCache.get(key);
  const acum = Date.now();
  if (hit && hit.exp > acum) {
    const proaspat = hit.exp - acum > TTL_6H - REIMPROSPATARE_MIN;
    if (!force || proaspat) return hit.data;
  }
  const res = await getSupplierAddresses(auth);
  if (isTrendyolError(res)) return hit?.data ?? null;
  const data = res.data ?? { supplierAddresses: [] };
  addressCache.set(key, { data, exp: Date.now() + TTL_6H });
  return data;
}
