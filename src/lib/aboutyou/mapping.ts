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
/*
 * ⚠ Se refoloseste rescrierea de adrese a lui Trendyol, nu se scrie a treia (eMAG o refoloseste
 * si el). Motivul e acolo: 1466 de imagini pe 855 de produse mai stau pe domeniul de INCERCARI
 * `pub-*.r2.dev`, pe care Cloudflare spune raspicat sa nu-l folosesti in productie. About You isi
 * aduce singur imaginile de pe adresele pe care i le dam — exact ca Trendyol — deci produsele
 * alea ii pica la fel. Cele doua domenii servesc acelasi obiect, aceeasi suma de control.
 */
import { adresaPublicaImagine } from "@/lib/trendyol/mapping";
import type {
  AboutYouConfig, AboutYouFxConfig, AboutYouMaterialCluster, AboutYouMaterialType, AboutYouPrice,
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
  /** Imaginea combinatiei din produs, pentru calea de culoare. Vezi `imaginiPeCulori`. */
  combo_image?: string | null;
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
  return raw.map((x) => String(x).trim()).filter((u) => /^https?:\/\//i.test(u));
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
  /** Ce se afiseaza in editor. Pentru un produs fara variante, „Unic". */
  label: string;
  /**
   * Titlul REAL al combinatiei din Edinio, sau `null` cand produsul n-are
   * variante. Nu se confunda cu `label`: dupa el se scade stocul combinatiei la o
   * comanda de marketplace, deci o valoare inventata („Unic", „Variantă 2") nu
   * s-ar potrivi cu nimic si ar raporta fals „a cerut mai mult stoc decat exista",
   * la fiecare comanda.
   */
  variantTitle: string | null;
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
  /**
   * Imaginea COMBINATIEI, cand exista.
   *
   * La About You imaginile tin de calea de CULOARE, nu de produs: un produs cu trei culori are
   * trei seturi de fotografii. Vezi `imaginiPeCulori`.
   */
  image: string | null;
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
        variantTitle: c.title?.trim() || null,
        sku: (c.sku || `${product.id}-${c.id || i}`).trim(),
        ron_price: comboUnitPrice(c, product.price),
        ron_compare_at: comboCompareAtPrice(c, product.compare_at_price),
        gtin: c.gtin?.trim() || null,
        quantity: stoc.quantity,
        stocViu: stoc.viu,
        image: c.image?.trim() || null,
      };
    });
  }
  const stoc = stocVarianta(product, null);
  return [{
    key: "default",
    label: "Unic",
    // Produsul n-are combinatii, deci nu exista niciun titlu de potrivit.
    variantTitle: null,
    sku: (product.sku || product.id).trim(),
    /* Fara combinatii nu exista imagine de combinatie: raman cele ale produsului. */
    image: null,
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
    /*
     * FARA SLOT = varianta nu mai exista pe produs.
     *
     * Aici se completa cu datele PRODUSULUI: pretul de baza si instantaneul de
     * stoc salvat o data in editor. Asa pleca mai departe spre About You o marime
     * scoasa de la vanzare — XXL de 170 de lei se relista la 100, dintr-un stoc
     * inexistent, si fiecare comanda era pierdere plus o comanda neonorabila.
     * Randul se DEZACTIVEAZA, deci nu intra in niciun payload (nici la produs,
     * nici la stoc, nici la pret). Scoaterea SKU-ului de pe About You o face
     * `reconciliazaVariante` din sync.ts.
     */
    if (!slot) return { ...v, enabled: false, ron_price: null, ron_compare_at: null, combo_image: null };
    return {
      ...v,
      ron_price: slot.ron_price,
      ron_compare_at: slot.ron_compare_at,
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
      quantity: slot.stocViu ? slot.quantity : (v.quantity ?? slot.quantity),
      ean: v.ean ?? slot.gtin ?? null,
      combo_image: slot.image,
    };
  });
}

// ── Price building ────────────────────────────────────────────────────────────

/**
 * Tarile in care se plateste in EURO.
 *
 * ⚠ E UN FAPT PUBLIC, NU UN RASPUNS DE API — si de-aia sta aici, scris. Paza de la configurare se
 * sprijinea pe nomenclatorul lor si CADEA DESCHIS cand cererea pica: „fara nomenclator nu inventam
 * un blocaj". O paza care se stinge singura la o pana nu e o paza, mai ales cand greseala pe care
 * o apara e de bani.
 *
 * ⚠ NUMAI ZONA EURO PROPRIU-ZISA. Statele care folosesc euro fara sa fie in ea (Monaco, Muntenegru,
 * Kosovo…) nu sunt piete About You, iar o lista mai larga inseamna mai multe feluri de a gresi. Ce
 * lipseste de aici se opreste — si asta e directia buna.
 */
export const TARI_EURO = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);

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

  /*
   * ═══ ⚠ ACELASI NUMAR PLECA LA FIECARE TARA, ORICARE I-AR FI MONEDA (26.08.2026) ═══
   *
   * Pretul se socoteste in EURO, si atat: `countries.map` il punea ca atare in fiecare tara. Cu
   * Polonia in lista, 20 EUR pleca drept `retail_price: 20` — iar acolo cifra se citeste in
   * ZLOTI. Aproape un sfert din pret, la fiecare vanzare, tacut.
   *
   * ⚠ EXISTA O PAZA LA CONFIGURARE, DAR CADEA DESCHIS: cand nomenclatorul lor nu se putea citi,
   * `tariNeEuro` intorcea lista goala („fara nomenclator nu inventam un blocaj") si orice tara
   * trecea. Iar aici, la trimitere, nu era nicio verificare — deci o configurare salvata intr-o
   * clipa proasta ramanea gresita pentru totdeauna.
   *
   * ⚠ SE VERIFICA PE UN FAPT PUBLIC, NU PE API-UL LOR. Zona euro e o lista stabila si cunoscuta;
   * nu depinde de o cerere care poate pica. Asa paza nu mai are cum sa cada deschis.
   *
   * ⚠ SI SE OPRESTE, NU SE CONVERTESTE. O conversie ar cere un curs pe fiecare moneda, o data de
   * referinta si o hotarare despre rotunjire — trei lucruri pe care nu le luam in locul
   * comerciantului. Se spune ce e de facut si se opreste.
   */
  const neEuro = countries.filter((c) => !TARI_EURO.has(c.toUpperCase()));
  if (neEuro.length > 0) {
    return {
      error: `Prețurile se trimit în euro, iar ${neEuro.join(", ")} folosesc altă monedă. `
        + "Scoate țările astea din setările About You până când adăugăm conversia pe monedă.",
    };
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

/*
 * ── Cate grupe de material cere categoria ────────────────────────────────────
 *
 * About You numeste compozitia „mandatory ... for your products", dar numarul de
 * COMPONENTE difera pe familie de categorie, si documentatia e transcrisa aici
 * cuvant cu cuvant (user-guide/product-material.md, §„Component Requirements"):
 *
 *   „Lined Bags and Backpacks: A minimum of two different material components
 *    (=clusters) are required."
 *   „Shoes: Three components (=clusters) are required: outer material, inner
 *    material, and sole material."
 *   „Lined jackets: Two components are required: outer material and inner material."
 *   „Other Accessories: Only the material needs to be specified."
 *
 * ATENTIE LA CUVANTUL „LINED". La genti si jachete cerinta e conditionata de
 * captuseala — o geanta necaptusita chiar ARE o singura componenta, si a o bloca
 * ar fi exact greseala pe care ne-o reproseaza comerciantii: un blocaj fara
 * acoperire in documentatie. La pantofi formularea e neconditionata, deci acolo
 * blocheaza. In rest doar avertizam, pentru ca respingerea vine tarziu si costa.
 *
 * PLAFONUL DE 3 NU E O REGULA DE API. Schema OpenAPI nu are `maxItems` pe
 * `material_composition_*`. Vine din sablonul lor Excel, care are exact „Cluster
 * Name (1), (2), or (3)" si, in aceeasi propozitie, cel mult trei materiale per
 * grupa (coloanele .1/.2/.3). De aceea amandoua sunt AVERTISMENTE, nu blocaje:
 * n-avem dreptul sa oprim ceva ce API-ul accepta. In editor butonul se opreste
 * totusi la 3, ca indrumare.
 */
export const MAX_CLUSTERE_MATERIAL = 3;
export const MAX_MATERIALE_PER_CLUSTER = 3;

export interface RegulaClustere {
  minim: number;
  /** `true` = documentatia o cere neconditionat, deci blocheaza; `false` = avertisment. */
  blocheaza: boolean;
  mesaj: string;
}

function segmenteCale(path: string | null | undefined): string[] {
  return (path ?? "").split("|").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function regulaClustere(path: string | null | undefined): RegulaClustere {
  const seg = segmenteCale(path);
  const areSegment = (cuvant: string) => seg.includes(cuvant);
  const contine = (cuvant: string) => seg.some((s) => s.includes(cuvant));

  /*
   * Blocam DOAR cand calea trece chiar prin nivelul „Shoes".
   *
   * Potrivirea pe subsir e utila la frunze („Sneakers", „Ankle boots"), dar
   * prinde si „Shoe care" sau „Shoe accessories" — iar acolo un blocaj de trei
   * grupe ar face categoria nelistabila, adica exact reprosul de la care am
   * pornit: o cerinta pe care About You nu o are. Nivelul de categorie e o proba
   * sigura; cuvintele de frunza doar avertizeaza.
   */
  if (areSegment("shoes")) {
    return {
      minim: 3,
      blocheaza: true,
      mesaj: "Încălțămintea cere trei grupe de material la About You: exterior, interior și talpă.",
    };
  }
  if (contine("sneaker") || contine("trainer") || contine("boot") || contine("sandal") || contine("shoe")) {
    return {
      minim: 3,
      blocheaza: false,
      mesaj: "Dacă produsul e încălțăminte, About You cere trei grupe de material: exterior, interior și talpă.",
    };
  }
  if (contine("bag") || contine("backpack") || contine("rucksack") || contine("suitcase")) {
    return {
      minim: 2,
      blocheaza: false,
      mesaj: "Gențile și rucsacurile CĂPTUȘITE cer două grupe de material la About You (exterior și căptușeală). Dacă produsul chiar nu are căptușeală, poți trimite o singură grupă.",
    };
  }
  if (contine("jacket") || contine("coat") || contine("blazer") || contine("parka")) {
    return {
      minim: 2,
      blocheaza: false,
      mesaj: "Jachetele CĂPTUȘITE cer două grupe de material la About You (exterior și căptușeală). Dacă produsul nu e căptușit, o singură grupă e în regulă.",
    };
  }
  return { minim: 1, blocheaza: true, mesaj: "Completează compoziția materialului." };
}

/**
 * Ce cere categoria in materie de compozitie.
 *
 * `necunoscut` NU e acelasi lucru cu `tip: null`. Primul inseamna ca taxonomia
 * nu s-a putut citi si atunci nu avem voie sa deducem nimic; al doilea inseamna
 * ca About You chiar nu cere compozitie pentru categoria asta.
 */
export interface CerintaMaterialListare {
  tip: AboutYouMaterialType | null;
  path?: string | null;
  necunoscut?: boolean;
  /**
   * Categoria are grup de marimi, deci cere `size` pe FIECARE varianta.
   * `null` = n-am putut afla, si atunci nu deducem nimic.
   */
  cereMarime?: boolean | null;
}

export interface RezultatValidare {
  /** Blocheaza trimiterea. */
  issues: string[];
  /** Nu blocheaza, dar About You poate respinge produsul pentru ele. */
  warnings: string[];
}

/**
 * Tot ce blocheaza listarea, in romana, inainte de a pleca ceva spre About You.
 *
 * Functia exista de la inceput, dar nu era apelata de nicaieri: greselile se
 * aflau abia din raspunsul asincron al lotului, ca „produs respins", fara sa
 * spuna ce anume lipseste. Acum o cheama editorul (ca sa arate lista) SI
 * `syncProductNow` (ca sa nu se poata ocoli prin sincronizarea automata —
 * comentariul de aici sustinea, gresit, ca o cheama `buildAboutYouItems`).
 */
export function validateListing(ctx: BuildContext, material?: CerintaMaterialListare | null): RezultatValidare {
  const { config, product, listing } = ctx;
  const issues: string[] = [];
  const warnings: string[] = [];
  const brand = listing.brand_id ?? config.brand_id;
  if (!brand) issues.push("Lipsește brandul About You.");
  if (!effectiveCategoryId(config, product, listing)) issues.push("Categoria nu este mapată la About You.");
  /*
   * Culoarea. `buildAboutYouItems` face `v.color_id ?? listing.color_id`, deci o
   * varianta fara culoare o MOSTENESTE tacut pe cea a listarii.
   *
   * Verificarea se sarea complet cand listarea avea culoare, si atunci amestecul
   * trecea nevazut: un produs care avea o culoare si a primit apoi inca cinci
   * pleca cu unele SKU-uri pe culoarea lor si cu restul pe cea veche, toate cu
   * aceleasi imagini — iar documentatia lor spune ca imaginile tin de fiecare
   * cale de culoare. Nu cerem insa culoare pe fiecare varianta a unui produs care
   * difera doar prin marime: acolo o singura culoare e corecta.
   */
  const active = ctx.variants.filter((v) => v.enabled);
  const cuCuloare = active.filter((v) => v.color_id).length;
  if (cuCuloare > 0 && cuCuloare < active.length) {
    for (const v of active.filter((x) => !x.color_id)) {
      issues.push(`Varianta ${v.sku || "?"} nu are culoare, dar altele au. Completeaz-o pe toate.`);
    }
  } else if (cuCuloare === 0 && !listing.color_id) {
    issues.push("Lipsește culoarea.");
  }
  /*
   * Imaginile se verifica PE CULOARE, nu pe produs.
   *
   * ⚠ Verificarea veche („produsul n-are imagini") ar fi refuzat tocmai produsul facut cum
   * trebuie: cel cu trei culori si fotografiile puse pe fiecare combinatie, fara nicio imagine la
   * nivelul produsului. Se cere ce cere si About You — cel putin o imagine PE ARTICOL.
   */
  const aleProdusului = productImages(product);
  const galerii = imaginiPeCulori(aleProdusului, active, listing.color_id);
  const faraImagini = [...galerii.entries()].filter(([, g]) => g.length === 0).map(([c]) => c);
  if (galerii.size === 0 && aleProdusului.length === 0) {
    issues.push("Produsul nu are imagini valide (URL http/https).");
  }
  for (const culoare of faraImagini) {
    issues.push(`Culoarea ${culoare} nu are nicio imagine validă, nici pe combinațiile ei, nici pe produs.`);
  }
  /*
   * ⚠ Si cand a mers, dar prost: la mai multe culori, una fara fotografii proprii imprumuta
   * fotografiile produsului — adica, de obicei, poza altei culori. Se listeaza (mai bine decat
   * deloc), dar comerciantul trebuie sa afle.
   */
  if (galerii.size > 1) {
    const proprii = new Set(active.filter((v) => (v.combo_image ?? "").trim())
      .map((v) => v.color_id ?? listing.color_id));
    for (const culoare of galerii.keys()) {
      if (!proprii.has(culoare)) {
        warnings.push(`Culoarea ${culoare} nu are fotografii proprii: se trimit cele ale produsului, care arată de obicei altă culoare.`);
      }
    }
  }
  if (productWeight(product) == null) issues.push("Produsul nu are greutate. Completeaz-o în fișa produsului.");

  if (material?.necunoscut) {
    // Taxonomia nu s-a putut citi. Tacerea de aici insemna, inainte, „categoria
    // nu cere material" — si produsul pleca fara singurul camp pe care About You
    // il numeste explicit obligatoriu.
    issues.push("Nu am putut verifica ce compoziție de material cere această categorie. Încearcă din nou peste câteva momente.");
  } else if (material?.tip) {
    const m = listing.material_composition;
    const clusters = m && Array.isArray(m.clusters) ? m.clusters : [];
    if (clusters.length === 0) {
      issues.push("Lipsește compoziția materialului, obligatorie pentru această categorie.");
    } else {
      // `cluster_id` are `minimum: 1` in schema: un zero respinge toata cererea.
      if (clusters.some((c) => !(c.cluster_id > 0))) {
        issues.push("Alege grupa de material pentru fiecare componentă a compoziției.");
      }
      if (clusters.some((c) => (c.components ?? []).length === 0)) {
        issues.push("O grupă de material nu are niciun material ales.");
      }
      // Avertisment, nu blocaj: API-ul nu are `maxItems`, plafonul e al sablonului
      // lor Excel. Nu oprim ceva ce About You accepta.
      if (clusters.length > MAX_CLUSTERE_MATERIAL) {
        warnings.push(`Șablonul About You are loc pentru cel mult ${MAX_CLUSTERE_MATERIAL} grupe de material, iar acum sunt ${clusters.length}.`);
      }
      const preaMulte = clusters.filter((c) => (c.components ?? []).length > MAX_MATERIALE_PER_CLUSTER).length;
      if (preaMulte > 0) {
        warnings.push(`Șablonul About You are loc pentru cel mult ${MAX_MATERIALE_PER_CLUSTER} materiale într-o grupă.`);
      }
      // Fiecare grupa descrie ALTA parte a produsului (exterior, captuseala,
      // talpa). Aceeasi grupa de doua ori nu descrie nimic in plus.
      const ids = clusters.map((c) => c.cluster_id);
      if (new Set(ids).size !== ids.length) {
        issues.push("Aceeași grupă de material apare de două ori. Fiecare grupă descrie altă parte a produsului.");
      }
      if (material.tip === "textile") {
        // Suma e pe FIECARE grupa in parte, nu pe tot produsul: exemplul oficial
        // are Lining 100% si Material 100%, adica 200% la un loc.
        for (const cluster of clusters) {
          const suma = (cluster.components ?? []).reduce((s, c) => s + (c.fraction ?? 0), 0);
          if (Math.round(suma) !== 100) {
            issues.push("Procentele fiecărei grupe de material trebuie să însumeze 100%.");
            break;
          }
        }
      }
      const regula = regulaClustere(material.path);
      if (clusters.length < regula.minim) {
        const text = `${regula.mesaj} Acum ai ${clusters.length}.`;
        if (regula.blocheaza) issues.push(text); else warnings.push(text);
      }
    }
  }

  if (active.length === 0) issues.push("Nicio variantă activă de listat.");
  for (const v of active) {
    if (!v.sku) { issues.push("O variantă nu are SKU."); continue; }
    const problemaSku = verificaSku(v.sku);
    if (problemaSku) issues.push(problemaSku);
    if (!v.ean) issues.push(`Varianta ${v.sku} nu are cod EAN.`);
    else if (!eanValid(v.ean)) issues.push(`Codul EAN al variantei ${v.sku} nu este un EAN-13 valid.`);
  }

  /*
   * Doua variante nu pot fi identice pe (culoare, marime, a doua marime).
   *
   * `size_id` nu era verificat NICAIERI. Un tricou S/M/L cu selectoarele de
   * marime neatinse pleca drept trei SKU-uri cu aceeasi culoare si `size: null` —
   * pentru About You, trei duplicate ale aceleiasi variante. Respingerea venea
   * asincron, cu „wrong sizes", fara sa spuna care varianta. Verificarea pe
   * PERECHE, nu pe „are marime", nu inventeaza o cerinta: o geanta fara marime
   * ramane valida cat timp e singura.
   */
  const perechi = new Map<string, string[]>();
  for (const v of active) {
    if (!v.sku) continue;
    const cheie = `${v.color_id ?? listing.color_id ?? 0}|${v.size_id ?? 0}|${v.second_size_id ?? 0}`;
    const lista = perechi.get(cheie);
    if (lista) lista.push(v.sku); else perechi.set(cheie, [v.sku]);
  }
  for (const skus of perechi.values()) {
    if (skus.length > 1) {
      issues.push(`Variantele ${skus.slice(0, 4).join(", ")} au aceeași combinație de culoare și mărime. Alege mărimea pentru fiecare.`);
    }
  }

  /*
   * Marimea pusa doar pe UNELE variante e semnalata, simetric cu culoarea.
   *
   * Verificarea pe perechi prinde duplicatele, dar nu si cazul in care o marime
   * NOUA, aparuta pe produs dupa ultima completare, pleaca cu `size: null` langa
   * surorile ei completate: perechea ei e unica, deci trece — si About You o vede
   * ca varianta fara marime.
   */
  const cuMarime = active.filter((v) => v.size_id).length;
  if (material?.cereMarime) {
    /*
     * Categoria ARE grup de marimi, deci le cere pe toate.
     *
     * ⚠ Probat pe fir: About You a respins o GEANTA cu „Size is required for this
     * category", desi schema declara `size` nulabil. Chiar si acolo exista „One
     * Size". Fara regula asta, respingerea venea de la ei, peste douazeci de
     * secunde, fara sa spuna ce varianta.
     */
    for (const v of active.filter((x) => !x.size_id)) {
      issues.push(`Varianta ${v.sku || "?"} nu are mărime, iar About You o cere pentru această categorie (dacă produsul nu are mărimi, alege „One Size”).`);
    }
  } else if (cuMarime > 0 && cuMarime < active.length) {
    for (const v of active.filter((x) => !x.size_id)) {
      issues.push(`Varianta ${v.sku || "?"} nu are mărime, dar altele au. Completeaz-o pe toate.`);
    }
  }

  // „If products have the 2nd size dimension (e.g. different leg lengths or
  // cupsizes), the second size dimension is mandatory for ALL variants."
  const cuAdoua = active.filter((v) => v.second_size_id).length;
  if (cuAdoua > 0 && cuAdoua < active.length) {
    issues.push("A doua dimensiune de mărime e completată doar la unele variante. About You o cere pe toate sau pe niciuna.");
  }

  return { issues, warnings };
}

/**
 * Imaginile fiecarei cai de CULOARE.
 *
 * ═══ ⚠ O SINGURA GALERIE PLECA LA TOATE CULORILE (27.08.2026) ═══
 *
 * `images` se socotea o data, din produs, si se punea IDENTIC pe fiecare articol. La About You
 * imaginile tin insa de calea de culoare: cumparatorul care alege rosu vedea fotografiile
 * produsului negru. Comentariul din `validateListing` scria deja asta — „documentatia lor spune ca
 * imaginile tin de fiecare cale de culoare" — dar codul nu se schimbase.
 *
 * Regula, si de ce e in doi timpi:
 *
 *   O SINGURA CULOARE (sau niciuna proprie) → imaginile combinatiilor se ADAUGA la cele ale
 *   produsului. Un produs care difera doar prin marime are o singura cale de culoare, deci toate
 *   fotografiile sunt ale ei. Aici mai multe imagini inseamna doar o fisa mai buna.
 *
 *   MAI MULTE CULORI → fiecare culoare primeste NUMAI imaginile ei. Adaugate, fotografiile
 *   produsului (care arata o singura culoare, de obicei cea principala) ar fi pus poze negre sub
 *   articolul rosu — exact defectul reparat, doar mutat mai jos in galerie.
 *
 *   ⚠ O CULOARE FARA IMAGINI PROPRII cade tot pe cele ale produsului: About You cere cel putin o
 *   imagine, si un articol nelistat e mai rau decat unul cu fotografia culorii principale.
 *   `validateListing` o spune comerciantului, ca sa poata repara.
 */
export function imaginiPeCulori(
  aleProdusului: string[],
  variante: { color_id: number | null; combo_image?: string | null }[],
  culoareaListarii: number | null,
): Map<number, string[]> {
  /* ⚠ Rescrise LA IESIRE, intr-un singur loc: adresele salvate raman neatinse. */
  const aleLui = aleProdusului.map(adresaPublicaImagine);
  const pePozitie = new Map<number, string[]>();
  const culori = new Set<number>();
  for (const v of variante) {
    const culoare = v.color_id ?? culoareaListarii;
    if (culoare == null) continue;
    culori.add(culoare);
    const img = adresaPublicaImagine((v.combo_image ?? "").trim());
    if (!/^https?:\/\//i.test(img)) continue;
    const lista = pePozitie.get(culoare) ?? [];
    if (!lista.includes(img)) lista.push(img);
    pePozitie.set(culoare, lista);
  }

  const singura = culori.size <= 1;
  const iesire = new Map<number, string[]>();
  for (const culoare of culori) {
    const aleEi = pePozitie.get(culoare) ?? [];
    /* ⚠ Cele ale produsului stau PRIMELE cand se amesteca: prima imagine e coperta articolului,
       iar comerciantul si-a ales-o deja acolo. */
    const toate = singura || aleEi.length === 0
      ? [...aleLui, ...aleEi]
      : aleEi;
    iesire.set(culoare, [...new Set(toate)].slice(0, MAX_IMAGINI));
  }
  return iesire;
}

/* About You primeste cel mult atatea imagini pe articol. */
const MAX_IMAGINI = 10;

export function buildAboutYouItems(ctx: BuildContext): { items: AboutYouProductItem[] } | { error: string } {
  const { config, product, listing } = ctx;

  const brand = listing.brand_id ?? config.brand_id;
  if (!brand) return { error: "Alege brandul About You." };
  const category = effectiveCategoryId(config, product, listing);
  if (!category) return { error: "Categoria produsului nu este mapată la About You." };

  const images = productImages(product);

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

  /*
   * ⚠ Verificarea imaginilor s-a MUTAT dupa asta, si nu din comoditate: cand fiecare culoare are
   * fotografiile ei, un produs poate sa n-aiba niciuna la nivelul lui si sa fie totusi complet.
   * Oprit mai sus, ar fi refuzat tocmai produsele facute cum trebuie.
   */
  const peCuloare = imaginiPeCulori(images, enabled, listing.color_id);

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
    const imagini = peCuloare.get(color) ?? [];
    if (imagini.length === 0) {
      return { error: `Varianta ${v.sku} nu are nicio imagine validă, nici pe culoarea ei, nici pe produs.` };
    }

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
      images: imagini,
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
