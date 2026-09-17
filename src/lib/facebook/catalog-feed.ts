// Meta (Facebook) Catalog product feed — RSS 2.0 with the Google Shopping (g:)
// namespace, which Meta Commerce Manager accepts as a scheduled data source.
//
// Self-contained on purpose: it reuses only the pure variant helpers and does NOT
// touch the live Google Merchant mapping. The feed `id` equals product.id so it
// matches the Facebook Pixel content_ids across the funnel — that alignment is
// what makes Advantage+ dynamic ads work.

import { storeBaseUrl, PLATFORM_ORIGIN } from "@/lib/seo";
import { extractR2Key } from "@/lib/cdn-image";
import { LATIME_JPG, sursaCereJpgInCatalog } from "@/lib/latimi-imagini";
import { adresaCuVarianta } from "@/lib/storefront/varianta-din-adresa";
import { categorieGooglePentruTrimitere } from "@/lib/google-merchant/taxonomy";
import { idArticolMeta } from "./pixel-continut";
// GTIN invalid = produs respins, deci se lasa afara. Aceeasi verificare pe care
// o folosesc feedul Google Merchant si datele structurate ale paginii.
import { isValidGtin } from "@/lib/gtin";
import { parseVariants, VARIANT_TITLE_SEP, comboUnitPrice, comboCompareAtPrice, combinatiiActiveUnice } from "@/lib/storefront/variants";
// Aceeasi poarta ca la Google Merchant, si din acelasi motiv: `products.price` a incetat sa fie
// pretul produsului cand personalizarea a capatat pret. Pusa doar pe un canal, minciuna s-ar fi
// mutat pe celalalt.
import { pretulDinCatalogMinte, type RandDeCatalog } from "@/lib/customization/pretul-din-catalog-minte";
// Motivele si textele lor stau in `lasate-afara.ts`: le citeste si panoul, care e componenta
// client. Hotararea ramane aici, langa generatorul care o aplica.
import type { MotivLipsaDinCatalog, ProdusLasatAfara } from "./lasate-afara";

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
  is_bundle?: boolean;
  /** Verdictul `disponibilitatePachet` pentru pachete. Calculat de apelant. */
  pachetDisponibil?: boolean;
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
  /** Axele de varianta care nu sunt atribute de baza, ca „Aroma:Vanilie”. Vezi `VARIANT_SLOTS`. */
  additionalVariantAttribute?: string;
  customLabels: (string | undefined)[]; // index 0..4
  itemGroupId?: string;
}

function money(value: number): string {
  return `${(Math.round((Number(value) || 0) * 100) / 100).toFixed(2)} ${CURRENCY}`;
}

/** Entitatile HTML uzuale din descrieri. Una necunoscuta ramane spatiu, ca pana acum. */
const ENTITATI: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  acirc: "â", Acirc: "Â", icirc: "î", Icirc: "Î", abreve: "ă", Abreve: "Ă",
  scedil: "ş", Scedil: "Ş", tcedil: "ţ", Tcedil: "Ţ",
  ndash: "-", mdash: "-", hellip: "...", laquo: "«", raquo: "»", bdquo: "„", rdquo: "”", ldquo: "“",
  rsquo: "'", lsquo: "'", deg: "°", times: "x", euro: "€",
};

/**
 * Descrierea ca text simplu: „Use plain text (not HTML)”.
 *
 * ⚠ ENTITATILE SE DECODEAZA, nu se inlocuiesc cu spatiu (17.09.2026). Forma de dinainte facea din
 * `c&acirc;ine` „c ine” si din `Negru &amp; Alb` „Negru Alb”: text stricat chiar in descrierea reclamei.
 */
function plainText(html: string | null, fallback: string): string {
  const text = (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d{1,6});/g, (_m, n: string) => {
      const c = Number(n);
      return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : " ";
    })
    .replace(/&#x([0-9a-f]{1,6});/gi, (_m, h: string) => {
      const c = parseInt(h, 16);
      return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : " ";
    })
    .replace(/&([a-z]+);/gi, (_m, nume: string) => ENTITATI[nume] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
  return (text || fallback).slice(0, 5000);
}

/**
 * Adresa imaginii pe care o poate primi catalogul Meta.
 *
 * ⚠ „Images must be in JPEG or PNG format” (specificatia catalogului). WebP-ul si AVIF-ul din depozit pleaca
 * prin `/api/img?…&f=jpg`, care face o singura data un JPEG de `LATIME_JPG` si trimite la el. Ce nu vine din
 * depozitul nostru (o adresa straina) ramane neatins: n-avem de unde sa-l convertim.
 */
export function imagineCatalog(adresa: string): string {
  const cheie = extractR2Key(adresa);
  if (!cheie || !sursaCereJpgInCatalog(cheie)) return adresa;
  return `${PLATFORM_ORIGIN}/api/img?p=${encodeURIComponent(cheie)}&w=${LATIME_JPG}&f=jpg`;
}

const CONDITIONS = new Set(["new", "refurbished", "used"]);
const GENDERS = new Set(["male", "female", "unisex"]);
const AGE_GROUPS = new Set(["adult", "kids", "toddler", "infant", "newborn"]);
function oneOf(value: string | undefined, allowed: Set<string>): string | undefined {
  const v = (value ?? "").trim().toLowerCase();
  return allowed.has(v) ? v : undefined;
}

/*
 * Axele de varianta -> atributele Meta.
 *
 * ⚠ AXELE NERECUNOSCUTE MERG IN `additional_variant_attribute` (17.09.2026), nu in sloturile ramase libere.
 * Forma de dinainte punea o axa „Aroma” in `material` sau `pattern`, adica o minciuna in fisa produsului din
 * Shops. Ghidul variantelor Meta: „For custom variants, you can use the `additional_variant_attribute`
 * field”, iar referinta: „Do not use a core attribute as an additional attribute.”
 */
const COLOR_RE = /cul|colou?r/i;
const SIZE_RE = /m[aă]rim|size|talie|numar|număr/i;
const MATERIAL_RE = /material|tesatur|țesătur|compozi/i;
const PATTERN_RE = /model|imprimeu|pattern|desen/i;

/* ═══════════════════════════════════════════════════════════════════════════
   CINE NU AJUNGE IN CATALOG, SI DE CE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Cat citeste hotararea dintr-un rand de produs. `CatalogProduct` o indeplineste deja. */
export interface RandDeCatalogMeta extends RandDeCatalog {
  /** `products.images`, asa cum vine din baza: jsonb, deci orice. */
  images: unknown;
}

/**
 * Prima imagine folosibila, aleasa EXACT ca in generator.
 *
 * ⚠ `String(brut)`, nu o verificare de tip: si in generator un `null` din tablou devine sirul
 * „null" si pleaca in feed asa. Aici nu se repara nimic — se raspunde la aceeasi intrebare, cu
 * acelasi raspuns, altfel motivul aratat comerciantului n-ar mai fi motivul adevarat.
 *
 * Se opreste la prima gasita: pe un catalog de mii de produse, hotararea se ia si atunci cand
 * feedul nu se genereaza (panoul), si nu e nevoie sa mai construiasca inca un tablou.
 */
function primaImagine(rand: RandDeCatalogMeta): string | undefined {
  if (!Array.isArray(rand.images)) return undefined;
  for (const brut of rand.images) {
    const u = String(brut);
    if (u) return u;
  }
  return undefined;
}

/**
 * De ce nu ajunge produsul asta in catalogul Meta — sau `null` cand ajunge.
 *
 * ═══ ⚠ O SINGURA HOTARARE, CITITA DIN DOUA LOCURI ═══
 *
 * Generatorul de mai jos O APLICA (ii ignora motivul si intoarce zero articole), iar panoul o
 * CITESTE, ca sa-i poata spune comerciantului ce ramane afara. Cat timp lista de motive traia doar
 * in generator, feedul sarea produse in tacere si ecranul spunea „N produse active in magazin.
 * Feed-ul se actualizeaza automat" — deci omul credea ca pleaca toate.
 *
 * ⚠ A doua lista, scrisa pentru ecran, s-ar fi departat de asta la prima schimbare, si atunci
 * panoul ar fi mintit cu incredere. De-aia motivul se INTOARCE de aici, nu se deduce a doua oara.
 *
 * ⚠ UN PRET CARE MINTE NU INTRA IN CATALOG. Cat timp pretul venea din `products.price`, un
 * fototapet vandut la metru patrat se anunta cu 89 de lei si costa 603,75 pe pagina — iar reclamele
 * dinamice duc omul exact acolo, pe banii comerciantului. Se lasa afara TOT produsul, si variantele
 * lui: pretul de baza e cel care minte, deci niciuna dintre ofertele derivate din el nu e cinstita.
 * Acelasi „afara" ca la produsul fara imagine, si din acelasi socotit: un articol lipsa costa mai
 * putin decat unul mincinos.
 *
 * ⚠ ORDINEA E RASPUNSUL DAT OMULUI, nu o optimizare. Un fototapet fara poza are amandoua motivele;
 * i se spune cel al pretului, fiindca daca i-am cere intai poza, ar adauga-o si produsul TOT n-ar
 * pleca. Se raspunde cu ce il opreste, nu cu ce e mai usor de reparat.
 */
export function motivulLipseiDinCatalog(rand: RandDeCatalogMeta): MotivLipsaDinCatalog | null {
  if (pretulDinCatalogMinte(rand)) return "pret-care-minte";
  if (!primaImagine(rand)) return "fara-imagine";
  return null;
}

/**
 * Cate produse raman afara, si primele dintre ele cu motivul fiecaruia.
 *
 * ⚠ `total` se numara pe TOATE, nu doar pe cele aratate: „3 produse" cu doua exemple e adevarat,
 * „2 produse" fiindca atatea incap pe ecran ar fi o minciuna linistitoare — exact felul de cifra
 * din care comerciantul afla mai tarziu, din vanzari.
 */
export function lasateAfaraDinCatalog<T extends RandDeCatalogMeta & { id: string; name: string }>(
  produse: readonly T[],
  plafon: number,
): { total: number; produse: ProdusLasatAfara[] } {
  let total = 0;
  const primele: ProdusLasatAfara[] = [];
  for (const p of produse) {
    const motiv = motivulLipseiDinCatalog(p);
    if (!motiv) continue;
    total++;
    if (primele.length < plafon) primele.push({ id: p.id, name: p.name, motiv });
  }
  return { total, produse: primele };
}

/**
 * Build one Meta catalog item for a simple product, or one per enabled variant
 * (linked by item_group_id) for a variable product. Products left out — no image,
 * or a catalog price that lies — are decided by `motivulLipseiDinCatalog` above,
 * which is the same verdict the dashboard shows the merchant.
 */
export function buildCatalogItems(
  business: CatalogBusiness,
  product: CatalogProduct,
  /** Harta categoriilor din Google Merchant (categoria magazinului -> categoria Google), daca exista. */
  hartaCategorii?: Record<string, string> | null,
): CatalogItem[] {
  if (motivulLipseiDinCatalog(product)) return [];

  const images = Array.isArray(product.images) ? product.images.map(String).filter(Boolean) : [];
  /*
   * ⚠ ACEEASI functie ca in motivul „fara imagine", nu doar aceeasi conditie: `images[0]` scris a
   * doua oara aici ar fi fost o a doua regula despre ce inseamna „are poza", si prima zi in care
   * s-ar fi despartit de cealalta e ziua in care panoul spune „fara imagine" despre un produs care
   * pleaca, sau tace despre unul care nu pleaca.
   *
   * ⚠ `return []`-ul de mai jos nu se atinge NICIODATA: motivul de la intrarea in functie a scos
   * deja produsul. Ramane pentru tip — `primaryImage` trebuie sa fie un sir. Masurat: mutantul care
   * il stinge trece toate probele, fiindca e cod mort. Ce apara probele cu adevarat e regula din
   * `primaImagine` (mutantul care o slabeste pica pe produsul cu poze goale).
   */
  const primaryImage = primaImagine(product);
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
  /*
   * Categoria Google: cea de pe produs, altfel cea din harta facuta in Google Merchant. ⚠ Prin
   * `categorieGooglePentruTrimitere`, deci ID-ul oficial: 5 din caile vechi ale listei noastre nu existau
   * in taxonomie, iar Meta citeste aceeasi taxonomie („Enter either the category name ... or its ID number”).
   */
  const googleCat = categorieGooglePentruTrimitere(
    g.google_product_category?.trim() || (product.category ? hartaCategorii?.[product.category] : undefined),
  );

  const basePrice = Number(product.price) || 0;
  const baseCompare = product.compare_at_price != null ? Number(product.compare_at_price) : null;
  /*
   * Pachetul se scrie cu `track_inventory: false`, deci prima ramura era mereu
   * adevarata si feedul anunta „in stock" orice pachet — inclusiv unul cu toate
   * componentele sterse. Disponibilitatea lui vine din componente, si se
   * primeste calculata: aici nu exista acces la baza.
   */
  const inStock = product.is_bundle
    ? product.pachetDisponibil !== false
    : (!product.track_inventory || (product.stock_quantity ?? 0) > 0);

  const variants = parseVariants(product.page_sections);
  // Cate o oferta pe TITLU, nu pe rand: titlurile duplicate au si `id` duplicat,
  // deci a doua oferta o suprascria pe prima la Google (acelasi `offerId`) si
  // feedul publica alt pret decat pagina. Prima castiga, ca peste tot.
  const enabled = combinatiiActiveUnice(variants);

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
      imageLink: imagineCatalog(primaryImage),
      additionalImageLinks: additional.map(imagineCatalog),
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

  // Fiecare axa recunoscuta primeste atributul ei de baza, o singura data; restul merg in
  // `additional_variant_attribute`, ca „Nume:Valoare”.
  const usedSlots = new Set<string>();
  const slotFor: (string | undefined)[] = variants.options.map((o) => {
    const named = COLOR_RE.test(o.name) ? "color" : SIZE_RE.test(o.name) ? "size"
      : MATERIAL_RE.test(o.name) ? "material" : PATTERN_RE.test(o.name) ? "pattern" : undefined;
    if (named && !usedSlots.has(named)) { usedSlots.add(named); return named; }
    return undefined;
  });

  return enabled.map((combo) => {
    const parts = combo.title.split(VARIANT_TITLE_SEP);
    const unit = comboUnitPrice(combo, basePrice) || basePrice;
    const compare = comboCompareAtPrice(combo, baseCompare);
    const hasSale = compare != null && compare > unit;
    const stock = combo.stock_quantity != null && String(combo.stock_quantity).trim() !== "" ? Number(combo.stock_quantity) : null;
    const comboInStock = product.track_inventory && stock != null && Number.isFinite(stock) ? stock > 0 : inStock;
    const slots: Record<string, string> = {};
    const suplimentare: string[] = [];
    variants.options.forEach((o, i) => {
      const slot = slotFor[i];
      if (!parts[i]) return;
      if (slot) slots[slot] = parts[i];
      else suplimentare.push(`${o.name.replace(/[:,]/g, " ").trim()}:${parts[i].replace(/[:,]/g, " ").trim()}`);
    });
    return {
      /* ⚠ O singura definitie a ID-ului, aceeasi pe care o trimite pixelul: `idArticolMeta`. */
      id: idArticolMeta(product.id, combo.id),
      /*
       * ⚠ NUMELE PRODUSULUI, fara combinatie (17.09.2026). Ghidul variantelor Meta, la exemplul corect: „The name
       * of the product and the `item_group_id` fields match (so that the name does not change when variants are
       * selected, but images do)”. Combinatia o spun atributele (culoare, marime, ...).
       */
      title: product.name.slice(0, 200),
      description,
      availability: comboInStock ? "in stock" : "out of stock",
      condition,
      price: money(hasSale ? compare! : unit),
      salePrice: hasSale ? money(unit) : undefined,
      /*
       * ⚠ Adresa care deschide pagina PE VARIANTA („images and external links match the color of the item”).
       * Pagina o preselecteaza din `?varianta=`; aceeasi adresa o trimit si Google Merchant si datele structurate.
       */
      link: adresaCuVarianta(link, combo),
      imageLink: imagineCatalog(combo.image || primaryImage),
      additionalImageLinks: additional.map(imagineCatalog),
      brand,
      // Codul de bare AL COMBINATIEI: fiecare culoare sau marime isi are codul
      // ei. Codul de pe produs NU se foloseste aici nici ca rezerva — pus pe mai
      // multe variante, ar fi cod duplicat, iar Meta le respinge.
      gtin: isValidGtin(combo.gtin) ? combo.gtin!.replace(/\s/g, "") : undefined,
      // `mpn` se poate repeta intre variantele aceluiasi model, deci ramane cel
      // de pe produs.
      mpn: g.mpn?.trim() || undefined,
      googleProductCategory: googleCat,
      productType,
      color: slots.color ?? (g.color?.trim() || undefined),
      size: slots.size ?? (g.size?.trim() || undefined),
      gender,
      ageGroup,
      material: slots.material ?? (g.material?.trim() || undefined),
      pattern: slots.pattern,
      additionalVariantAttribute: suplimentare.length ? suplimentare.join(", ") : undefined,
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
    gEl("additional_variant_attribute", it.additionalVariantAttribute) +
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
