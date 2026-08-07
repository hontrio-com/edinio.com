// Maps an Edinio product + its About You enrichment into About You product items
// (one item per variant/SKU). About You is variant-first: variants share a
// `style_key` (we use the Edinio product id) and each carries its own `sku`.
//
// Pricing (v1 decision: auto RON -> EUR). In `fx_from_ron` mode the EUR price is
// computed from the product's RON price at sync time (so it always reflects the
// current rate); in `manual_eur` mode the per-variant EUR price is used. Prices
// are emitted per ship country. Per-variant RON pricing is a later refinement.

import {
  comboCompareAtPrice, comboStock, comboUnitPrice, parseVariants,
  type VariantCombo,
} from "@/lib/storefront/variants";
import type {
  AboutYouConfig, AboutYouFxConfig, AboutYouMaterialCluster, AboutYouPrice,
  AboutYouProductItem,
} from "./types";
import { DEFAULT_COUNTRY_OF_ORIGIN } from "./types";

// ── Edinio-side shapes ────────────────────────────────────────────────────────
export interface MappableProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;                     // RON
  compare_at_price: number | null;   // RON
  images: unknown;                   // Json: array of URL strings
  category: string | null;
  sku: string | null;
  weight_grams: number | null;
  track_inventory?: boolean | null;
  stock_quantity?: number | null;
  page_sections?: unknown;           // Json; se citeste prin parseVariants()
}

// Material composition stored on the listing, tagged with the type the category
// expects (textile carries fractions, non-textile does not).
export interface AboutYouStoredMaterial {
  type: "textile" | "non-textile";
  clusters: AboutYouMaterialCluster[];
}

export interface AboutYouListingEnrichment {
  brand_id: number | null;
  category_id: number | null;
  color_id: number | null;
  attributes: number[];
  material_composition: AboutYouStoredMaterial | null;
  country_of_origin: string | null;
  hs_code: string | null;
}

export interface AboutYouVariantData {
  sku: string;
  ean: string | null;
  size_id: number | null;
  second_size_id: number | null;
  color_id: number | null;
  quantity: number | null;
  retail_price_eur: number | null;
  sale_price_eur: number | null;
  enabled: boolean;
  /**
   * Date care nu stau in `aboutyou_variants`, ci in produs. Se completeaza prin
   * `atasezaPreturileRon` inainte de orice trimitere.
   */
  ron_price?: number | null;
  ron_compare_at?: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// 1 EUR = <rate> RON; apply an optional margin (%). Returns null if no valid rate.
export function ronToEur(ron: number, fx?: AboutYouFxConfig): number | null {
  const rate = fx?.rate;
  if (!rate || rate <= 0 || !(ron > 0)) return null;
  const margin = Math.max(0, fx?.margin_pct ?? 0) / 100;
  return round2((ron / rate) * (1 + margin));
}

function productImages(product: MappableProduct): string[] {
  const raw = Array.isArray(product.images) ? product.images : [];
  return raw.map((x) => String(x).trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 10);
}

// Greutatea nu se mai inlocuieste tacit: `validateListing` o cere explicit, iar
// aici doar o incadram in limitele schemei (1..100000 g).
function productWeight(product: MappableProduct): number | null {
  const w = product.weight_grams;
  if (!w || w <= 0) return null;
  return Math.min(100000, Math.max(1, Math.round(w)));
}

/*
 * SKU si EAN se verifica LOCAL, inainte de a pleca.
 *
 * Schema respinge intreaga cerere daca un singur articol are SKU sub 3 sau peste
 * 120 de caractere, iar EAN-ul trebuie sa fie EAN-13 valid (13 cifre plus cifra
 * de control). Prinse abia in raspunsul lotului, greselile astea ajung la
 * comerciant ca „produs respins", peste minute, fara sa spuna care varianta.
 */
export function verificaSku(sku: string): string | null {
  const s = sku.trim();
  if (s.length < 3) return `SKU-ul „${s}” e prea scurt (minimum 3 caractere).`;
  if (s.length > 120) return `SKU-ul „${s.slice(0, 20)}…” e prea lung (maximum 120 de caractere).`;
  return null;
}

export function eanValid(ean: string): boolean {
  const s = ean.trim();
  if (!/^\d{13}$/.test(s)) return false;
  const cifre = s.split("").map(Number);
  const suma = cifre.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (suma % 10)) % 10 === cifre[12];
}

// ── Variant slots (derived from the Edinio product for the editor) ────────────
export interface VariantSlot {
  key: string;
  label: string;
  sku: string;
  ron_price: number;
  ron_compare_at: number | null;
  /** Codul de bare al combinatiei, cand comerciantul l-a completat deja in Edinio. */
  gtin: string | null;
  /** Stocul de trimis la About You, derivat ca in restul aplicatiei. */
  quantity: number;
  /**
   * Stocul de mai sus vine dintr-o sursa care se misca singura (combinatia sau
   * produsul care tine inventar), nu dintr-un numar scris cu mana.
   */
  stocViu: boolean;
}

/*
 * Combinatiile produsului.
 *
 * `parseVariants` cere si `options`, nu doar `combinations` — corect pentru
 * vitrina, unde fara axe n-ai ce selector sa desenezi. Aici insa conteaza altceva:
 * SKU-ul fiecarei variante. Un produs cu combinatii dar fara axe (date vechi sau
 * incomplete) ar cadea pe varianta unica si si-ar SCHIMBA SKU-urile — adica ar
 * aparea ca produs nou pe About You, iar cel vechi ar ramane acolo orfan. De aceea
 * cadem pe citirea directa a combinatiilor.
 */
function combinatii(product: MappableProduct): VariantCombo[] {
  const v = parseVariants(product.page_sections);
  if (v) return v.combinations.filter((c) => c.enabled !== false);

  const brute = (product.page_sections as { variants?: { enabled?: boolean; combinations?: VariantCombo[] } } | null)?.variants;
  if (!brute?.enabled || !Array.isArray(brute.combinations)) return [];
  return brute.combinations.filter((c) => c && c.enabled !== false);
}

/*
 * Stocul unei variante, dintr-un singur loc.
 *
 * Erau doua reguli diferite pentru acelasi lucru: la creare se trimitea ce
 * scrisese comerciantul in editor, la impingerea de stoc se recalcula din produs.
 * Cele doua puteau devia oricat, si nimic nu semnala asta. Ordinea de aici e
 * singura: stocul combinatiei, apoi al produsului cand se tine inventar, iar
 * pentru produsele fara inventar o valoare mare (About You cere un numar).
 */
export const STOC_NELIMITAT = 100;

export function stocVarianta(product: MappableProduct, combo: VariantCombo | null): { quantity: number; viu: boolean } {
  const alCombinatiei = combo ? comboStock(combo) : null;
  if (alCombinatiei != null) return { quantity: Math.max(0, alCombinatiei), viu: true };
  if (product.track_inventory) return { quantity: Math.max(0, product.stock_quantity ?? 0), viu: true };
  return { quantity: STOC_NELIMITAT, viu: false };
}

function gtinProdus(product: MappableProduct): string | null {
  const g = (product.page_sections as { google?: { gtin?: string } } | null)?.google?.gtin;
  return typeof g === "string" && g.trim() ? g.trim() : null;
}

export function deriveVariantSlots(product: MappableProduct): VariantSlot[] {
  const combos = combinatii(product);
  if (combos.length > 0) {
    return combos.map((c, i) => {
      const stoc = stocVarianta(product, c);
      return {
        key: c.id || `c${i}`,
        label: (c.title || `Variantă ${i + 1}`).trim(),
        sku: (c.sku || `${product.id}-${c.id || i}`).trim(),
        ron_price: comboUnitPrice(c, product.price),
        ron_compare_at: comboCompareAtPrice(c, product.compare_at_price),
        gtin: c.gtin?.trim() || null,
        quantity: stoc.quantity,
        stocViu: stoc.viu,
      };
    });
  }
  const stoc = stocVarianta(product, null);
  return [{
    key: "default",
    label: "Unic",
    sku: (product.sku || product.id).trim(),
    ron_price: product.price,
    ron_compare_at: product.compare_at_price,
    // Produsul fara variante isi tine codul de bare in `page_sections.google.gtin`
    // — acolo il pun deja feedurile Google si Facebook. Fara asta, comerciantul
    // era pus sa retasteze in editor un cod pe care Edinio il avea deja.
    gtin: gtinProdus(product),
    quantity: stoc.quantity,
    stocViu: stoc.viu,
  }];
}

/**
 * Completeaza din produs datele pe care `aboutyou_variants` nu le tine: pretul in
 * lei, pretul taiat, stocul si codul de bare.
 *
 * Fara pasul asta, toate variantele plecau cu pretul de baza al produsului: un
 * tricou cu baza 100 lei si marimea XXL la 170 lei se lista la 100 de lei
 * convertiti, pe toate marimile. Editorul arata insa pretul CORECT al variantei,
 * calculat din aceleasi `deriveVariantSlots` — deci ce vedea comerciantul si ce
 * se trimitea difereau, fara nicio eroare.
 */
export function atasezaPreturileRon(
  product: MappableProduct, variants: AboutYouVariantData[],
): AboutYouVariantData[] {
  const dupaSku = new Map(deriveVariantSlots(product).map((s) => [s.sku, s]));
  return variants.map((v) => {
    const slot = dupaSku.get(v.sku);
    return {
      ...v,
      ron_price: slot?.ron_price ?? product.price,
      ron_compare_at: slot?.ron_compare_at ?? product.compare_at_price,
      /*
       * Stocul VIU bate numarul scris in editor.
       *
       * `aboutyou_variants.quantity` e un instantaneu, salvat o data si niciodata
       * reimprospatat. Preferat, impingerea de stoc de dupa fiecare comanda ar
       * retrimite mereu aceeasi valoare: se vand patru bucati din zece si About
       * You afla in continuare zece, la nesfarsit — adica supravanzare. Numarul
       * din editor conteaza doar acolo unde nu exista o sursa vie (produs fara
       * inventar urmarit).
       */
      quantity: slot?.stocViu ? slot.quantity : (v.quantity ?? slot?.quantity ?? stocVarianta(product, null).quantity),
      ean: v.ean ?? slot?.gtin ?? null,
    };
  });
}

// ── Price building ────────────────────────────────────────────────────────────
export function buildVariantPrices(
  config: AboutYouConfig, product: MappableProduct, variant: AboutYouVariantData,
): { prices: AboutYouPrice[] } | { error: string } {
  const countries = config.ship_countries ?? [];
  if (countries.length === 0) return { error: "Alege cel puțin o țară de listare." };

  let retail: number | null;
  let sale: number | null = null;

  if (config.price_mode === "manual_eur") {
    retail = variant.retail_price_eur;
    sale = variant.sale_price_eur ?? null;
    if (retail == null || !(retail > 0)) return { error: `Setează prețul EUR pentru varianta ${variant.sku}.` };
  } else {
    // fx_from_ron: retail = pretul taiat cand exista, sale = pretul real de
    // vanzare; altfel doar pretul de vanzare.
    //
    // Pretul de pornire si cel taiat sunt AMANDOUA ale variantei — combinatiile
    // din Edinio poarta si `compare_at_price`.
    const ronVanzare = variant.ron_price != null && variant.ron_price > 0 ? variant.ron_price : product.price;
    const ronTaiat = variant.ron_compare_at ?? product.compare_at_price;
    const onSale = ronTaiat != null && ronTaiat > ronVanzare;

    // Cele doua cauze de esec se despart: „nu ai pus cursul" si „produsul are
    // pretul zero" cereau lucruri diferite de la comerciant, dar primeau acelasi
    // mesaj despre curs.
    if (!(config.fx?.rate && config.fx.rate > 0)) {
      return { error: "Setează cursul valutar RON -> EUR în setări." };
    }
    if (!(ronVanzare > 0)) {
      return { error: `Varianta ${variant.sku} are prețul 0. About You nu acceptă prețuri zero.` };
    }

    retail = ronToEur(onSale ? (ronTaiat as number) : ronVanzare, config.fx);
    sale = onSale ? ronToEur(ronVanzare, config.fx) : null;
    if (retail == null) return { error: `Nu am putut calcula prețul în euro pentru varianta ${variant.sku}.` };
  }

  const prices = countries.map<AboutYouPrice>((c) => ({
    country_code: c,
    retail_price: retail as number,
    ...(sale != null && sale > 0 ? { sale_price: sale } : {}),
  }));
  return { prices };
}

// ── Item building ─────────────────────────────────────────────────────────────
export interface BuildContext {
  config: AboutYouConfig;
  product: MappableProduct;
  listing: AboutYouListingEnrichment;
  variants: AboutYouVariantData[];
}

// Effective category id: listing override, else the store's category_map entry.
export function effectiveCategoryId(config: AboutYouConfig, product: MappableProduct, listing: AboutYouListingEnrichment): number | null {
  if (listing.category_id) return listing.category_id;
  const entry = product.category ? config.category_map?.[product.category] : undefined;
  return entry?.category_id ?? null;
}

function effectiveAttributes(config: AboutYouConfig, product: MappableProduct, listing: AboutYouListingEnrichment): number[] {
  if (listing.attributes && listing.attributes.length > 0) return listing.attributes;
  const entry = product.category ? config.category_map?.[product.category] : undefined;
  return entry?.attributes ?? [];
}

/**
 * Tot ce blocheaza listarea, in romana, inainte de a pleca ceva spre About You.
 *
 * Functia exista de la inceput, dar nu era apelata de nicaieri: greselile se
 * aflau abia din raspunsul asincron al lotului, ca „produs respins", fara sa
 * spuna ce anume lipseste. Acum o cheama si editorul (ca sa arate lista), si
 * `buildAboutYouItems` (ca sa nu se poata ocoli).
 *
 * `cereMaterial` vine din categorie: About You cere compozitia materialului
 * pentru 849 din cele 851 de categorii, iar tipul (textil sau nu) il decide tot
 * categoria, nu comerciantul.
 */
export function validateListing(ctx: BuildContext, cereMaterial?: "textile" | "non-textile" | null): string[] {
  const { config, product, listing } = ctx;
  const issues: string[] = [];
  const brand = listing.brand_id ?? config.brand_id;
  if (!brand) issues.push("Lipsește brandul About You.");
  if (!effectiveCategoryId(config, product, listing)) issues.push("Categoria nu este mapată la About You.");
  // `buildAboutYouItems` cere culoare pe FIECARE varianta (mapping: `v.color_id ??
  // listing.color_id`). Verificata cu `some`, o culoare pusa pe o singura varianta
  // trecea de validare si cadea abia la trimitere, pe alta varianta.
  if (!listing.color_id) {
    const fara = ctx.variants.filter((v) => v.enabled && !v.color_id);
    if (fara.length === ctx.variants.filter((v) => v.enabled).length) issues.push("Lipsește culoarea.");
    else for (const v of fara) issues.push(`Varianta ${v.sku || "?"} nu are culoare.`);
  }
  if (productImages(product).length === 0) issues.push("Produsul nu are imagini valide (URL http/https).");
  if (productWeight(product) == null) issues.push("Produsul nu are greutate. Completeaz-o în fișa produsului.");

  if (cereMaterial) {
    const m = listing.material_composition;
    if (!m || !Array.isArray(m.clusters) || m.clusters.length === 0) {
      issues.push("Lipsește compoziția materialului, obligatorie pentru această categorie.");
    } else if (m.clusters.some((c) => !(c.cluster_id > 0))) {
      // `cluster_id` are `minimum: 1` in schema: un zero respinge toata cererea.
      issues.push("Alege grupa de material pentru compoziție.");
    } else if (cereMaterial === "textile") {
      for (const cluster of m.clusters) {
        const suma = (cluster.components ?? []).reduce((s, c) => s + (c.fraction ?? 0), 0);
        if (Math.round(suma) !== 100) {
          issues.push("Procentele compoziției textile trebuie să însumeze 100%.");
          break;
        }
      }
    }
  }

  const enabled = ctx.variants.filter((v) => v.enabled);
  if (enabled.length === 0) issues.push("Nicio variantă activă de listat.");
  for (const v of enabled) {
    if (!v.sku) { issues.push("O variantă nu are SKU."); continue; }
    const problemaSku = verificaSku(v.sku);
    if (problemaSku) issues.push(problemaSku);
    if (!v.ean) issues.push(`Varianta ${v.sku} nu are cod EAN.`);
    else if (!eanValid(v.ean)) issues.push(`Codul EAN al variantei ${v.sku} nu este un EAN-13 valid.`);
  }
  return issues;
}

export function buildAboutYouItems(ctx: BuildContext): { items: AboutYouProductItem[] } | { error: string } {
  const { config, product, listing } = ctx;

  const brand = listing.brand_id ?? config.brand_id;
  if (!brand) return { error: "Alege brandul About You." };
  const category = effectiveCategoryId(config, product, listing);
  if (!category) return { error: "Categoria produsului nu este mapată la About You." };

  const images = productImages(product);
  if (images.length === 0) return { error: "Produsul nu are imagini valide." };

  const weight = productWeight(product);
  if (weight == null) {
    // Inainte, lipsa greutatii se inlocuia tacit cu 500 g. About You calculeaza
    // transportul din ea, iar un colet declarat pe jumatate din cat cantareste
    // costa mai mult decat s-a incasat, la fiecare comanda.
    return { error: "Produsul nu are greutate. Completeaz-o în fișa produsului." };
  }
  const tari = config.ship_countries ?? [];
  if (tari.length === 0) return { error: "Alege cel puțin o țară de listare." };
  const countryOfOrigin = (listing.country_of_origin || config.default_country_of_origin || DEFAULT_COUNTRY_OF_ORIGIN).toUpperCase();
  const attributes = effectiveAttributes(config, product, listing);
  const styleKey = product.id;

  /*
   * DOUA CAMPURI PE CARE NU LE TRIMITEM, DELIBERAT.
   *
   * `name`: About You genereaza singur numele, din categorie si culoare, iar
   * campul asta e numele DE DESIGN — documentatia cere explicit „doar numele
   * produsului/designului, fara categorii, culori, materiale; daca nu exista un
   * nume de design, lasa campul gol". Numele nostru de produs („Geanta dama piele
   * naturala neagra") e exact ce nu trebuie pus acolo: ar aparea in ghilimele
   * langa numele generat, dubland informatia.
   *
   * `descriptions`: cheile sunt LOCALE, nu o descriere unica. Localele
   * comerciantului sunt it/fr/de/nl/pl — nu exista `ro`. Am avea doar textul
   * romanesc si l-am pune sub eticheta de germana. Mai bine nimic decat o
   * descriere pe care cumparatorul n-o intelege. Se trimit cand vom avea traduceri.
   */

  const material = listing.material_composition;
  const materialFields: Pick<AboutYouProductItem, "material_composition_textile" | "material_composition_non_textile"> = {};
  if (material && material.type && Array.isArray(material.clusters) && material.clusters.length > 0) {
    if (material.type === "textile") materialFields.material_composition_textile = material.clusters;
    else materialFields.material_composition_non_textile = material.clusters;
  }

  const enabled = ctx.variants.filter((v) => v.enabled);
  if (enabled.length === 0) return { error: "Nicio variantă activă de listat." };

  const items: AboutYouProductItem[] = [];
  const skuVazute = new Set<string>();
  for (const v of enabled) {
    if (!v.sku) return { error: "O variantă nu are SKU." };
    const problemaSku = verificaSku(v.sku);
    if (problemaSku) return { error: problemaSku };
    // Doua variante cu acelasi SKU inseamna ca a doua o suprascrie pe prima la
    // About You, tacut: raman mai putine marimi decat crede comerciantul.
    if (skuVazute.has(v.sku)) return { error: `SKU-ul „${v.sku}” apare la două variante. Fiecare variantă are nevoie de un SKU unic.` };
    skuVazute.add(v.sku);
    if (v.ean && !eanValid(v.ean)) {
      return { error: `Codul EAN al variantei ${v.sku} nu este un EAN-13 valid (13 cifre cu cifră de control).` };
    }
    const color = v.color_id ?? listing.color_id;
    if (!color) return { error: "Lipsește culoarea produsului." };
    const priced = buildVariantPrices(config, product, v);
    if ("error" in priced) return priced;

    const item: AboutYouProductItem = {
      style_key: styleKey,
      sku: v.sku,
      color,
      brand,
      category,
      weight,
      country_of_origin: countryOfOrigin,
      attributes,
      prices: priced.prices,
      images,
      // `countries` spune UNDE se publica; `prices` spune CU CAT. Trimise din
      // aceeasi sursa, cele doua liste nu pot ajunge sa se contrazica.
      countries: [...tari],
      // `size` e in lista `required` din schema, chiar daca valoarea acceptata e
      // si `null`. Omisa, cererea INTREAGA primeste 400 — un singur produs fara
      // marime (geanta, portofel, bijuterie) bloca toate variantele lui.
      // `second_size`, `ean` si `quantity` NU sunt obligatorii, de aceea raman
      // puse conditionat.
      size: v.size_id ?? null,
      // Stocul pleaca odata cu produsul: altfel articolul se creeaza cu zero pe
      // stoc si ramane invizibil pana la prima impingere de stoc.
      quantity: Math.max(0, v.quantity ?? stocVarianta(product, null).quantity),
      ...materialFields,
    };
    if (v.ean) item.ean = v.ean;
    if (listing.hs_code) item.hs_code = listing.hs_code.trim().slice(0, 20);
    if (v.second_size_id) item.second_size = v.second_size_id;
    items.push(item);
  }
  return { items };
}
