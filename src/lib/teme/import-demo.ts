import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { slugify } from "@/lib/utils/slugify";
import { hrefCategorie } from "@/lib/storefront/category-href";
import { proiecteazaImediat } from "@/lib/storefront/catalog/proiector";
import type { SetDateDemo } from "./tipuri";

/*
  ═══════════════════════════════════════════════════════════════════════════
  IMPORTUL DATELOR DEMO ALE UNEI TEME (etapele 16.1 si 18 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Raspunsul lui: „Adaugă, marcate demo”. Deci importul ADAUGA langa ce are magazinul si nu sterge, nu suprascrie nimic:
  - o categorie cu acelasi nume exista deja: se foloseste a lui (si nu se marcheaza, ramane a lui);
  - produsele poarta `source = "tema-demo"` si `external_id = "<tema>:<cheie>"`; indexul unic pe (magazin, sursa, cod)
    face ca un import repetat sa nu dubleze nimic;
  - bannerele se pun DUPA ale lui, cu linkurile lor;
  - ce s-a adaugat (categoriile create, bannerele) se tine in `page_content.date_demo`, ca „Șterge datele demo” sa scoata
    exact asta.

  ⚠ FARA marketplace-uri: `createProduct` trimite fiecare produs nou spre eMAG, Trendyol, Google si celelalte. Un produs
  demo n-are ce cauta acolo, deci importul scrie direct, apoi doar proiecteaza catalogul (cautarea, filtrele).
*/

export const SURSA_DEMO = "tema-demo";

export function externalIdDemo(tema: string, cheie: string): string {
  return `${tema}:${cheie}`;
}

/** Ce a adaugat importul in magazin, in `page_content.date_demo`. */
export interface UrmaDateDemo {
  tema: string;
  /** Id-urile categoriilor CREATE de import (nu si ale lui, refolosite dupa nume). */
  categorii: string[];
  /** Adresele bannerelor adaugate. */
  bannere: string[];
  /** Id-urile randurilor de produse adaugate in `product_sections`. */
  randuri: string[];
  la: string;
}

/** Numele, cum se compara: fara spatii pe margini, fara deosebire de majuscule. */
const cheieNume = (n: string) => n.trim().toLocaleLowerCase("ro");

/** O categorie de creat: pe primul nivel (`parinte` null) sau sub categoria cu numele dat. */
export interface CategorieDeCreat {
  nume: string;
  parinte: string | null;
  imagine: string | null;
}

/**
 * Categoriile care lipsesc, in ordinea in care se creeaza (intai primul nivel). Una cu acelasi nume (oriunde in
 * arbore) nu se mai creeaza: produsele se leaga de categorie prin NUME, iar doua cu acelasi nume ar fi ambigue.
 */
export function categoriiDeCreat(existente: readonly string[], date: SetDateDemo): CategorieDeCreat[] {
  const are = new Set(existente.map(cheieNume));
  const sus: CategorieDeCreat[] = [];
  const jos: CategorieDeCreat[] = [];
  for (const c of date.categorii) {
    if (!are.has(cheieNume(c.nume))) {
      sus.push({ nume: c.nume, parinte: null, imagine: c.imagine });
      are.add(cheieNume(c.nume));
    }
    for (const copil of c.copii) {
      if (are.has(cheieNume(copil))) continue;
      jos.push({ nume: copil, parinte: c.nume, imagine: null });
      are.add(cheieNume(copil));
    }
  }
  return [...sus, ...jos];
}

/**
 * Sluguri unice pentru numele date, fata de cele ocupate deja in magazin: aceeasi regula ca la produsele adaugate de
 * mana (`resolveUniqueProductSlug`): baza, apoi `-2`, `-3`.
 */
export function sluguriUnice(nume: readonly string[], ocupate: Iterable<string>): string[] {
  const luate = new Set(ocupate);
  return nume.map((n) => {
    const baza = slugify(n) || "produs";
    let slug = baza;
    for (let i = 2; luate.has(slug); i++) slug = `${baza}-${i}`;
    luate.add(slug);
    return slug;
  });
}

/**
 * Bannerele dupa import: ale lui, neatinse, apoi cele demo care nu sunt deja acolo. Listele de imagini si de linkuri
 * merg pereche (`hero_banners`, `hero_banner_links`), deci cea de linkuri se completeaza pana la lungimea primei.
 */
export function bannereDupaImport(
  pc: Record<string, unknown>,
  date: SetDateDemo,
  radacinaCatalog: string,
): { imagini: string[]; linkuri: string[]; adaugate: string[] } {
  const imagini = Array.isArray(pc.hero_banners) ? pc.hero_banners.filter((x): x is string => typeof x === "string") : [];
  const linkuriVechi = Array.isArray(pc.hero_banner_links) ? pc.hero_banner_links.map((x) => (typeof x === "string" ? x : "")) : [];
  const linkuri = imagini.map((_, i) => linkuriVechi[i] ?? "");
  const adaugate: string[] = [];
  for (const b of date.bannere) {
    if (imagini.includes(b.imagine)) continue;
    imagini.push(b.imagine);
    linkuri.push(hrefCategorie(radacinaCatalog, b.categorie));
    adaugate.push(b.imagine);
  }
  return { imagini, linkuri, adaugate };
}

/** Id-ul unui rand demo in `product_sections` (incape in cele 64 de caractere ale legaturii din design). */
export function idRandDemo(tema: string, cheie: string): string {
  return `demo-${tema}-${cheie}`;
}

/**
 * Randurile de produse dupa import: ale lui, neatinse, apoi cele demo care lipsesc, cu produsele dupa id (cele care
 * nu s-au gasit raman pe dinafara, nu ca id-uri moarte).
 */
export function randuriDupaImport(
  pc: Record<string, unknown>,
  date: SetDateDemo,
  tema: string,
  idDupaCheie: ReadonlyMap<string, string>,
): { randuri: unknown[]; adaugate: string[] } {
  const randuri = Array.isArray(pc.product_sections) ? [...pc.product_sections] : [];
  const existente = new Set(randuri.map((r) => (r && typeof r === "object" ? (r as { id?: unknown }).id : null)));
  const adaugate: string[] = [];
  for (const r of date.randuri) {
    const id = idRandDemo(tema, r.cheie);
    if (existente.has(id)) continue;
    const productIds = r.produse.map((k) => idDupaCheie.get(k)).filter((x): x is string => !!x);
    if (productIds.length === 0) continue;
    randuri.push({ id, title: r.titlu, enabled: true, mode: "selected", productIds, layout: "carousel", limit: productIds.length });
    adaugate.push(id);
  }
  return { randuri, adaugate };
}

/** Urma de dupa import: cea de dinainte (un import repetat) plus ce s-a adaugat acum. */
export function urmaDupaImport(veche: unknown, tema: string, categorii: string[], bannere: string[], randuri: string[], la: string): UrmaDateDemo {
  const v = veche && typeof veche === "object" ? (veche as Partial<UrmaDateDemo>) : {};
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
  return {
    tema,
    categorii: [...new Set([...lista(v.categorii), ...categorii])],
    bannere: [...new Set([...lista(v.bannere), ...bannere])],
    randuri: [...new Set([...lista(v.randuri), ...randuri])],
    la,
  };
}

export interface RezultatImport {
  categorii: number;
  produse: number;
  bannere: number;
  randuri: number;
}

/**
 * Importa datele demo ale temei in magazin. `admin` e clientul cu cheia de serviciu: apelantul (actiunea de server,
 * scriptul magazinului demo) a verificat deja ca magazinul e al cui trebuie.
 *
 * `radacinaCatalog` e radacina relativa a catalogului (`/magazin`, sau sirul gol cand produsele stau pe prima pagina),
 * ca in `CampLink`: din ea se fac linkurile bannerelor.
 */
export async function importaDateleDemo(
  admin: SupabaseClient<Database>,
  businessId: string,
  tema: string,
  date: SetDateDemo,
  radacinaCatalog: string,
): Promise<RezultatImport> {
  // ── Categoriile: doar cele care lipsesc ──
  const { data: catExistente, error: eCat } = await admin
    .from("categories").select("id, name, sort_order").eq("business_id", businessId);
  if (eCat) throw new Error(`categorii: ${eCat.message}`);
  const dupaNume = new Map((catExistente ?? []).map((c) => [cheieNume(c.name), c.id]));
  let ordine = Math.max(-1, ...(catExistente ?? []).map((c) => c.sort_order ?? 0)) + 1;
  const deCreat = categoriiDeCreat((catExistente ?? []).map((c) => c.name), date);
  const create: string[] = [];
  for (const nivel of [deCreat.filter((c) => !c.parinte), deCreat.filter((c) => c.parinte)]) {
    if (nivel.length === 0) continue;
    const randuri = nivel.map((c) => ({
      business_id: businessId,
      name: c.nume,
      parent_id: c.parinte ? dupaNume.get(cheieNume(c.parinte)) ?? null : null,
      sort_order: ordine++,
      is_active: true,
      image_url: c.imagine,
    }));
    const { data: scrise, error } = await admin.from("categories").insert(randuri).select("id, name");
    if (error) throw new Error(`categorii noi: ${error.message}`);
    for (const c of scrise ?? []) {
      dupaNume.set(cheieNume(c.name), c.id);
      create.push(c.id);
    }
  }

  // ── Produsele: doar cele care nu sunt deja (dupa cod) ──
  const { data: dejaDemo, error: eDemo } = await admin
    .from("products").select("external_id").eq("business_id", businessId).eq("source", SURSA_DEMO);
  if (eDemo) throw new Error(`produse demo: ${eDemo.message}`);
  const coduri = new Set((dejaDemo ?? []).map((p) => p.external_id));
  const noi = date.produse.filter((p) => !coduri.has(externalIdDemo(tema, p.cheie)));
  if (noi.length > 0) {
    const { data: sluguriLuate, error: eSlug } = await admin
      .from("products").select("slug").eq("business_id", businessId).not("slug", "is", null);
    if (eSlug) throw new Error(`sluguri: ${eSlug.message}`);
    const sluguri = sluguriUnice(noi.map((p) => p.nume), (sluguriLuate ?? []).map((r) => r.slug as string));
    const randuri = noi.map((p, i) => ({
      business_id: businessId,
      name: p.nume,
      slug: sluguri[i],
      description: p.descriere,
      price: p.pret,
      compare_at_price: p.pretVechi ?? null,
      category: p.categorie,
      images: [p.imagine] as Json,
      track_inventory: false,
      stock_quantity: null,
      is_featured: p.recomandat === true,
      is_active: true,
      page_sections: {} as Json,
      source: SURSA_DEMO,
      external_id: externalIdDemo(tema, p.cheie),
    }));
    const { error } = await admin.from("products").insert(randuri);
    if (error) throw new Error(`produse noi: ${error.message}`);
  }

  // ── Produsele demo ale temei, dupa cheie: pentru randurile de pe prima pagina ──
  const { data: aleTemei, error: eTema } = await admin
    .from("products").select("id, external_id").eq("business_id", businessId).eq("source", SURSA_DEMO).like("external_id", `${tema}:%`);
  if (eTema) throw new Error(`produsele temei: ${eTema.message}`);
  const idDupaCheie = new Map((aleTemei ?? []).map((p) => [String(p.external_id).slice(tema.length + 1), p.id]));

  // ── Bannerele, randurile si urma, in `page_content` ──
  const { data: setari, error: eSet } = await admin
    .from("store_settings").select("page_content").eq("business_id", businessId).single();
  if (eSet) throw new Error(`setari: ${eSet.message}`);
  const pc = (setari?.page_content ?? {}) as Record<string, unknown>;
  const { imagini, linkuri, adaugate } = bannereDupaImport(pc, date, radacinaCatalog);
  const randuri = randuriDupaImport(pc, date, tema, idDupaCheie);
  const urma = urmaDupaImport(pc.date_demo, tema, create, adaugate, randuri.adaugate, new Date().toISOString());
  const { error: eScris } = await admin.from("store_settings").update({
    page_content: { ...pc, hero_banners: imagini, hero_banner_links: linkuri, product_sections: randuri.randuri, date_demo: urma } as never,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);
  if (eScris) throw new Error(`page_content: ${eScris.message}`);

  // Cautarea si filtrele magazinului citesc proiectia, nu tabelul de produse.
  await proiecteazaImediat(businessId);

  return { categorii: create.length, produse: noi.length, bannere: adaugate.length, randuri: randuri.adaugate.length };
}
