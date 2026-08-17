/*
 * Nomenclatoarele About You (tari, branduri, categorii, grupuri de atribute).
 *
 * DOUA SCHIMBARI FATA DE ABORDAREA EVIDENTA:
 *
 * 1. CATEGORIILE SE ADUC TOATE, O DATA. Sunt 851 in total, adica noua cereri de
 *    cate 100. Cu arborele intreg in memorie, cautarea si maparea automata se
 *    fac local: instant, tolerante la romana (vezi ro-taxonomy.ts) si fara sa
 *    consume din limita de 100 de cereri pe minut la fiecare tasta apasata.
 *    Filtrarea de pe serverul About You ramane doar ca plasa de siguranta.
 *
 * 2. ESECUL SE INTOARCE CU MOTIV. Varianta anterioara raspundea `null` la orice
 *    problema, iar interfata afisa „Nu am putut cauta categorii." — acelasi text
 *    si pentru o cheie invalida, si pentru o pana de retea, si pentru o limita
 *    de rata. Exact asa a stat ascunsa o eroare 401: mesajul nu spunea nimic.
 *    Acum fiecare functie intoarce fie datele, fie eroarea reala cu codul HTTP.
 */

import { createHash } from "node:crypto";
import {
  getCarriers, isAboutYouError, listAttributeGroups, listBrands, listCategories, listCountries,
  type AboutYouAuth,
} from "./client";
import { cautaCategorii, type PublicTinta } from "./ro-taxonomy";
import type {
  AboutYouAttributeGroup, AboutYouBrand, AboutYouCarrier, AboutYouCategory, AboutYouCountriesResponse,
  AboutYouMaterialType,
} from "./types";

export type Nomenclator<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

const TTL_6H = 6 * 60 * 60 * 1000;
const TTL_24H = 24 * 60 * 60 * 1000;

// Cheia de cache include mediul: sandbox si productie sunt date izolate.
// (Gazda e aceeasi — About You separa mediile prin cheia API, nu prin URL.)
function envKey(auth: AboutYouAuth): string {
  return auth.environment === "sandbox" ? "sandbox" : "production";
}

/*
 * Nomenclatoarele NU sunt toate globale, si diferenta conteaza.
 *
 * `/categories/` si `/categories/{id}/attribute-groups` intorc taxonomia
 * marketplace-ului: aceeasi pentru toata lumea, deci se pot tine pe mediu.
 * `/brands/`, `/countries/` si `/orders/carriers/` intorc DOAR ce are
 * comerciantul: brandurile lui aprobate, tarile in care are voie sa vanda,
 * curierii lui. Pe o cheie doar de mediu, al doilea magazin care deschide
 * editorul pe aceeasi instanta primeste brandurile primului magazin — si le-ar
 * si trimite mai departe la About You.
 *
 * Cheia API nu intra in clar in cheia de cache: intra o amprenta a ei.
 */
function merchantKey(auth: AboutYouAuth): string {
  return `${envKey(auth)}:${createHash("sha256").update(auth.apiKey ?? "").digest("hex").slice(0, 16)}`;
}

interface Intrare<T> { data: T; exp: number }

const brandsCache = new Map<string, Intrare<AboutYouBrand[]>>();
const carriersCache = new Map<string, Intrare<AboutYouCarrier[]>>();
const countriesCache = new Map<string, Intrare<AboutYouCountriesResponse>>();
const categoriesCache = new Map<string, Intrare<AboutYouCategory[]>>();
const attrGroupsCache = new Map<string, Intrare<AboutYouAttributeGroup[]>>();

function proaspat<T>(cache: Map<string, Intrare<T>>, key: string): T | null {
  const hit = cache.get(key);
  return hit && hit.exp > Date.now() ? hit.data : null;
}

export async function getCountriesCached(auth: AboutYouAuth): Promise<Nomenclator<AboutYouCountriesResponse>> {
  const key = merchantKey(auth);
  const hit = proaspat(countriesCache, key);
  if (hit) return { ok: true, data: hit };
  const res = await listCountries(auth);
  if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
  const data = res.data ?? { countries: [], locales: [], currencies: [] };
  countriesCache.set(key, { data, exp: Date.now() + TTL_24H });
  return { ok: true, data };
}

export async function getBrandsCached(auth: AboutYouAuth): Promise<Nomenclator<AboutYouBrand[]>> {
  const key = merchantKey(auth);
  const hit = proaspat(brandsCache, key);
  if (hit) return { ok: true, data: hit };
  const res = await listBrands(auth);
  if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
  const data = Array.isArray(res.data) ? res.data : [];
  brandsCache.set(key, { data, exp: Date.now() + TTL_24H });
  return { ok: true, data };
}

export async function getCarriersCached(auth: AboutYouAuth): Promise<Nomenclator<AboutYouCarrier[]>> {
  const key = merchantKey(auth);
  const hit = proaspat(carriersCache, key);
  if (hit) return { ok: true, data: hit };
  const data: AboutYouCarrier[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await getCarriers(auth, { page, per_page: 100 });
    if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
    const lot = res.data?.items ?? [];
    data.push(...lot);
    if (lot.length < 100) break;
  }
  carriersCache.set(key, { data, exp: Date.now() + TTL_24H });
  return { ok: true, data };
}

// Numarul de pagini e marginit ca o paginare care nu se mai termina (raspuns
// neasteptat, pagina care se repeta) sa nu tina functia ocupata la nesfarsit.
// 30 x 100 = 3000, de peste trei ori taxonomia de azi.
const MAX_PAGINI = 30;

/** Toata taxonomia About You, adusa o data si tinuta in memorie. */
export async function getAllCategoriesCached(auth: AboutYouAuth): Promise<Nomenclator<AboutYouCategory[]>> {
  const key = envKey(auth);
  const hit = proaspat(categoriesCache, key);
  if (hit) return { ok: true, data: hit };

  const toate: AboutYouCategory[] = [];
  const vazute = new Set<number>();
  for (let page = 1; page <= MAX_PAGINI; page++) {
    const res = await listCategories(auth, { page, per_page: 100 });
    if (isAboutYouError(res)) {
      // O pagina cazuta la mijloc ar da un arbore trunchiat care ARATA complet:
      // cautarea n-ar mai gasi categorii reale si nimeni n-ar sti de ce. Mai
      // bine spunem ca n-am putut.
      return { ok: false, error: res.error, status: res.status };
    }
    const lot = res.data?.items ?? [];
    for (const c of lot) {
      if (!vazute.has(c.id)) { vazute.add(c.id); toate.push(c); }
    }
    if (lot.length < 100) break;
  }

  if (toate.length === 0) {
    return { ok: false, error: "About You nu a returnat nicio categorie.", status: 200 };
  }
  categoriesCache.set(key, { data: toate, exp: Date.now() + TTL_6H });
  return { ok: true, data: toate };
}

/**
 * Copiii unei categorii, sau radacinile cand nu se da parinte.
 *
 * Se derivă din arborele deja adus: `parent_id` e in fiecare intrare, deci nu
 * are rost inca o cerere. ATENTIE la varianta anterioara — cerea `/categories/`
 * FARA `parent_category` pentru radacini, ceea ce nu intoarce radacinile, ci
 * primele 100 de categorii din tot arborele, in ordine alfabetica.
 */
export async function getCategoryChildrenCached(
  auth: AboutYouAuth, parentId?: number,
): Promise<Nomenclator<AboutYouCategory[]>> {
  const toate = await getAllCategoriesCached(auth);
  if (!toate.ok) return toate;
  const copii = toate.data.filter((c) =>
    parentId == null ? (c.parent_id == null) : c.parent_id === parentId);
  return { ok: true, data: copii };
}

/**
 * Cautare de categorii, local, cu traducere din romana.
 *
 * Daca arborele nu se poate aduce (retea, limita de rata), cadem pe filtrarea
 * de pe serverul About You: mai slaba — nu intelege romana — dar mai buna decat
 * o lista goala.
 */
export async function searchCategories(
  auth: AboutYouAuth,
  query: string,
  optiuni?: { limita?: number; publicImplicit?: PublicTinta | null },
): Promise<Nomenclator<AboutYouCategory[]>> {
  const q = query.trim();
  if (q.length < 2) return { ok: true, data: [] };
  const limita = optiuni?.limita ?? 40;

  const toate = await getAllCategoriesCached(auth);
  if (toate.ok) {
    return { ok: true, data: cautaCategorii(q, toate.data, { limita, publicImplicit: optiuni?.publicImplicit ?? null }) };
  }

  const res = await listCategories(auth, { query: q, per_page: Math.min(100, limita) });
  if (isAboutYouError(res)) return { ok: false, error: toate.error, status: toate.status };
  return { ok: true, data: (res.data?.items ?? []).slice(0, limita) };
}

/*
 * Ce compozitie de material cere categoria — dintr-un singur loc.
 *
 * Se citea in TREI locuri (editorul, validarea, si de nicaieri pe calea
 * automata), fiecare cu aceeasi scapare: ramura in care taxonomia NU se poate
 * aduce era netratata, iar rezultatul cadea pe `null`. Iar `null` inseamna, mai
 * departe, „categoria asta nu cere material" — deci un 401, o limita de rata sau
 * o pana de retea faceau sa dispara tacut singura cerinta pe care About You o
 * numeste explicit obligatorie, si produsul pleca gol.
 *
 * De aceea rezultatul are trei stari, nu doua: cere / nu cere / NU STIM. Ultima
 * blocheaza; nu se confunda cu a doua.
 */
export type CerintaMaterial =
  | { ok: true; tip: AboutYouMaterialType | null; path: string | null }
  | { ok: false; error: string; status: number };

export async function getCerintaMaterial(
  auth: AboutYouAuth, categoryId: number | null | undefined,
): Promise<CerintaMaterial> {
  // Fara categorie nu exista cerinta de material; lipsa categoriei e semnalata
  // separat de `validateListing`, cu mesajul ei.
  if (!categoryId) return { ok: true, tip: null, path: null };
  const tax = await getAllCategoriesCached(auth);
  if (!tax.ok) return { ok: false, error: tax.error, status: tax.status };
  const cat = tax.data.find((c) => c.id === categoryId);
  if (!cat) {
    // Categoria mapata nu mai e in arbore: About You a restructurat taxonomia.
    // Tot „nu stim" e, nu „nu cere".
    return { ok: false, error: "Categoria aleasă nu mai există în taxonomia About You.", status: 404 };
  }
  return { ok: true, tip: cat.material_composition_type ?? null, path: cat.path ?? cat.name ?? null };
}

export async function getAttributeGroupsCached(
  auth: AboutYouAuth, categoryId: number,
): Promise<Nomenclator<AboutYouAttributeGroup[]>> {
  const key = `${envKey(auth)}:${categoryId}`;
  const hit = proaspat(attrGroupsCache, key);
  if (hit) return { ok: true, data: hit };
  const res = await listAttributeGroups(auth, categoryId);
  if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
  const data = Array.isArray(res.data) ? res.data : [];
  attrGroupsCache.set(key, { data, exp: Date.now() + TTL_6H });
  return { ok: true, data };
}
