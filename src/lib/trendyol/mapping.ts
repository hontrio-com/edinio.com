// Maps an Edinio product + its Trendyol enrichment into Trendyol product items
// (one item per variant/barcode). Trendyol is variant-first: variants share a
// `productMainId` (we use the Edinio product id) and each carries its own barcode.
//
// Preturile pleaca DIRECT, fara conversie: Trendyol le citeste in moneda vitrinei
// alese (RO -> RON). listPrice e pretul taiat cand exista, salePrice cel de
// vanzare, si listPrice trebuie sa fie >= salePrice. Atributele `varianter`
// (marime/culoare) stau pe varianta; restul sunt la nivel de produs si se repeta
// pe fiecare item.
//
// Ce NU trimitem, desi API-ul domestic turcesc le are: `currencyType` (moneda o da
// vitrina) si `cargoCompanyId` (curierul se declara la expediere).

import type { TrendyolConfig, TrendyolProductAttribute, TrendyolProductItem } from "./types";
import { coteTvaVitrina, infoVitrina, necesitaSgr, pretSgr, tvaImplicitVitrina } from "./types";
import {
  comboStock, combinatiiActiveUnice, comboUnitPrice, parseVariants, type VariantCombo,
} from "@/lib/storefront/variants";

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
  /*
   * Sectiunile produsului, cu forma REALA a combinatiilor.
   *
   * Tipul de aici era o copie prescurtata care declara doar `id`, `title`,
   * `price`, `sku` si `enabled`. Copia n-a fost niciodata gresita sintactic, dar
   * ascundea doua campuri pe care Trendyol le cere: `gtin` (codul de bare al
   * combinatiei) si `stock_quantity` (stocul ei). Cat timp nu erau declarate,
   * nici nu se putea scrie codul care le citeste — se fabrica un barcode si se
   * trimitea stocul produsului intreg pe fiecare varianta.
   */
  page_sections?: {
    variants?: {
      enabled?: boolean;
      combinations?: VariantCombo[];
    };
    google?: { gtin?: string };
  } | null;
}

export interface TrendyolListingEnrichment {
  /** ⚠ Tara de FABRICATIE a produsului, nu a vanzatorului. Vezi `default_country_of_origin`. */
  country_of_origin?: string | null;
  brand_id: number | null;
  category_id: number | null;
  /** Cate ambalaje are produsul, pentru garantia SGR. `null` = unul singur. */
  sgr_units?: number | null;
  attributes: TrendyolProductAttribute[]; // product-level (non-varianter)
  dimensional_weight: number | null;
  cargo_company_id: number | null;
}

export interface TrendyolVariantData {
  barcode: string;
  stock_code: string | null;
  /** Titlul combinatiei din Edinio; leaga varianta listata de stocul care se misca. */
  variant_title?: string | null;
  attributes: TrendyolProductAttribute[]; // per-variant (varianter, e.g. size/color)
  quantity: number | null;
  list_price: number | null;
  sale_price: number | null;
  vat_rate: number | null;
  enabled: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

/**
 * Domeniul public al imaginilor, in locul celui de dezvoltare.
 *
 * ⚠ `pub-<hash>.r2.dev` e domeniul pe care Cloudflare il da unui bucket R2
 * pentru INCERCARI, si documentatia lor spune raspicat sa nu fie folosit in
 * productie: e limitat si nu are garantii. In Edinio au ramas 1.466 de imagini
 * pe el, pe 855 de produse din 28 de magazine — ramasite de dinaintea
 * domeniului propriu.
 *
 * Trendyol isi aduce singur imaginile de pe adresele pe care i le dam, si le
 * respinge produsul cand nu le poate lua („Eroare de conexiune la serverul de
 * imagini"). Verificat: cele doua domenii servesc EXACT acelasi obiect, aceeasi
 * suma de control — deci rescrierea la trimitere nu schimba ce vede clientul,
 * doar pe unde ajunge acolo.
 *
 * Se face aici, la iesire, nu printr-o migrare de date: adresele salvate raman
 * neatinse, iar daca domeniul se schimba vreodata, se schimba intr-un loc.
 */
const CDN_PUBLIC = "https://edinio-cdn.com";
const R2_DEZVOLTARE = /^https:\/\/pub-[a-z0-9]+\.r2\.dev\//i;

export function adresaPublicaImagine(url: string): string {
  return R2_DEZVOLTARE.test(url) ? url.replace(R2_DEZVOLTARE, `${CDN_PUBLIC}/`) : url;
}

// Trendyol accepta DOAR https la imagini; una pe http e respinsa la validare si
// pica tot produsul, asa ca o sarim din start.
function productImages(product: MappableProduct): string[] {
  const raw = Array.isArray(product.images) ? product.images : [];
  return raw
    .map((x) => adresaPublicaImagine(String(x).trim()))
    .filter((u) => /^https:\/\//i.test(u))
    .slice(0, 8);
}

/**
 * Barcode-ul, verificat dupa regulile Trendyol.
 *
 * Documentatia lasa litere, cifre si doar `.`, `-`, `_`. Un SKU cu spatii sau
 * diacritice trece de noi si e respins de ei abia dupa procesarea lotului, cu un
 * mesaj greu de legat de produs — deci il prindem aici.
 */
export function verificaBarcode(barcode: string): string | null {
  if (!barcode) return "O variantă nu are barcode.";
  if (barcode.length > 40) return `Barcode-ul „${barcode}" depășește 40 de caractere (limita Trendyol).`;
  if (!/^[A-Za-z0-9._-]+$/.test(barcode)) {
    return `Barcode-ul „${barcode}" conține caractere nepermise. Trendyol acceptă doar litere, cifre, punct, liniuță și underscore.`;
  }
  return null;
}

/**
 * Cota de TVA a variantei, adusa in setul acceptat de vitrina.
 *
 * Vitrina RO primeste doar 0, 11 sau 21. O cota veche (19) sau lipsa ar fi
 * respinsa, deci alegem cea mai apropiata valoare permisa in loc sa trimitem un
 * lot intreg la refuz.
 */
export function tvaPentruVitrina(config: TrendyolConfig, vatRate: number | null): number {
  /*
   * Originea conteaza, dar NU se presupune.
   *
   * Un vanzator roman extins pe GR/BG poate folosi si cotele romanesti (11, 21):
   * fara asta, un 21 legal ar fi „corectat" tacit la 24. Dar presupunand „RO"
   * pentru oricine, un comerciant cu cont inregistrat in Grecia ar fi primit ca
   * valide niste cote pe care Trendyol i le respinge — o largire a validarii
   * bazata pe o presupunere despre altcineva.
   *
   * Fara origine declarata, se aplica strict cotele vitrinei: comportamentul de
   * dinainte, care e si cel corect pentru un vanzator neextins.
   */
  const permise = coteTvaVitrina(config.storefront, config.origine);
  if (vatRate == null) return tvaImplicitVitrina(config.storefront);
  if (permise.includes(vatRate)) return vatRate;
  return permise.reduce((best, c) => (Math.abs(c - vatRate) < Math.abs(best - vatRate) ? c : best), permise[0]);
}

function productWeight(product: MappableProduct, listing: TrendyolListingEnrichment): number {
  if (listing.dimensional_weight && listing.dimensional_weight > 0) return listing.dimensional_weight;
  const kg = product.weight_grams && product.weight_grams > 0 ? product.weight_grams / 1000 : 1;
  return Math.max(0.1, round2(kg));
}

// ── Variant slots (derived from the Edinio product for the editor) ────────────
export interface VariantSlot {
  key: string;
  label: string;
  /**
   * Titlul REAL al combinatiei („S / Roșu"), pastrat separat de `label`.
   *
   * Pe el se scade stocul cand vine o comanda de pe Trendyol, deci trebuie sa
   * fie exact sirul din `page_sections.variants.combinations[].title`, nu
   * eticheta de afisat. `null` la produsul fara variante: acolo nu exista nicio
   * combinatie de potrivit, iar stocul de produs e cel adevarat.
   */
  variantTitle: string | null;
  barcode: string;
  ron_price: number;
  /** Stocul variantei ASTEIA, nu al produsului intreg. */
  quantity: number;
  /** Stocul de mai sus vine dintr-o sursa care se misca singura, nu dintr-un numar scris cu mana. */
  stocViu: boolean;
}

/*
 * Combinatiile produsului.
 *
 * `parseVariants` cere si `options`; un produs cu combinatii dar fara axe (date
 * vechi sau import incomplet) ar cadea altfel pe „varianta unica" si si-ar
 * schimba barcode-urile — adica ar aparea ca produs nou pe Trendyol, iar cel
 * vechi ar ramane acolo orfan. De aceea cadem pe citirea directa.
 *
 * ⚠ DEDUPLICAREA PE TITLU NU E OPTIONALA.
 *
 * Sunt produse reale cu acelasi titlu de combinatie de doua ori — masurat: 37 de
 * titluri duplicate pe 8 produse. `combinatiiActiveUnice` pastreaza PRIMA, si
 * asa face toata aplicatia: `findCombo` (ce vede clientul), `comboStockMap` (ce
 * stoc se verifica) si `consuma_stoc_comanda_marketplace` (din ce se scade).
 *
 * Fara ea, cele doua sloturi ies cu acelasi `variantTitle`, iar potrivirea pe
 * titlu din editor le prabuseste pe amandoua pe acelasi rand salvat: salvarea
 * sterge toate variantele si apoi cade pe cheia unica `(business_id, barcode)`.
 * Listarea ramane cu ZERO variante, stocul nu mai pleaca niciodata, iar
 * comenzile intra fara sa scada nimic.
 */
function combinatii(product: MappableProduct): VariantCombo[] {
  const v = parseVariants(product.page_sections);
  if (v) return combinatiiActiveUnice(v);

  const brute = product.page_sections?.variants;
  if (!brute?.enabled || !Array.isArray(brute.combinations)) return [];
  const vazute = new Set<string>();
  const out: VariantCombo[] = [];
  for (const c of brute.combinations) {
    if (!c || c.enabled === false) continue;
    // Aceeasi regula si pe calea de rezerva: prima combinatie a unui titlu castiga.
    const t = c.title?.trim();
    if (t) {
      if (vazute.has(t)) continue;
      vazute.add(t);
    }
    out.push(c);
  }
  return out;
}

/** Codul de bare al produsului fara variante, de unde il pun deja feedurile Google si Facebook. */
function gtinProdus(product: MappableProduct): string | null {
  const g = product.page_sections?.google?.gtin;
  return typeof g === "string" && g.trim() ? g.trim() : null;
}

/**
 * Barcode-ul cand comerciantul n-a completat nici GTIN, nici SKU.
 *
 * Forma veche era `${product.id}-${c.id}`: doua uuid-uri, adica 73 de caractere
 * peste limita de 40 pe care tot noi o verificam — deci orice produs cu variante
 * si fara SKU-uri se oprea, cu un mesaj care da vina pe „barcode-ul tau" desi
 * barcode-ul era fabricat de noi.
 *
 * Uuid-ul produsului fara cratime are exact 32 de caractere, deci ramane loc de
 * o cratima si 7 caractere de discriminant. Discriminantul e derivat din ID-ul
 * combinatiei, nu din pozitia ei: pozitia se schimba cand comerciantul sterge o
 * marime, si atunci variantele ramase si-ar schimba barcode-ul, adica s-ar
 * dubla pe Trendyol.
 */
const LUNGIME_MAXIMA_BARCODE = 40;

export function barcodeDerivat(productId: string, comboId: string, index: number): string {
  const baza = productId.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  const sufix = comboId ? comboId.replace(/[^A-Za-z0-9]/g, "").slice(0, 6) : String(index);
  return `${baza}-${sufix}`.slice(0, LUNGIME_MAXIMA_BARCODE);
}

export function deriveVariantSlots(product: MappableProduct): VariantSlot[] {
  const combos = combinatii(product);
  if (combos.length > 0) {
    const sloturi = combos.map((c, i) => {
      const stoc = stocVarianta(product, c);
      return {
        key: c.id || `c${i}`,
        label: (c.title || `Variantă ${i + 1}`).trim(),
        variantTitle: c.title?.trim() || null,
        /*
         * Ordinea: SKU, apoi GTIN, apoi o derivare scurta.
         *
         * ⚠ SKU-UL RAMANE PRIMUL, SI ASTA E O DECIZIE DE MIGRARE, NU DE GUST.
         *
         * Barcode-ul nu e o preferinta, e IDENTITATEA articolului la Trendyol:
         * odata trimis, el leaga oferta lor de randul nostru. Pus GTIN-ul
         * inainte, orice varianta care are si SKU si GTIN si-ar fi schimbat
         * barcode-ul la prima salvare — adica al doilea produs pe Trendyol,
         * primul ramas acolo orfan si VANDABIL, si fara niciun rand la noi din
         * care sa-l mai putem pune pe zero.
         *
         * Asa, GTIN-ul umple exact golul pentru care a fost adus — combinatiile
         * fara SKU, cele care pana acum primeau un barcode fabricat de 73 de
         * caractere — si nu misca nimic din ce e deja listat.
         */
        barcode: (c.sku?.trim() || c.gtin?.trim() || barcodeDerivat(product.id, c.id || "", i)).trim(),
        ron_price: comboUnitPrice(c, product.price),
        quantity: stoc.quantity,
        stocViu: stoc.viu,
      };
    });
    return dezambiguizeazaBarcoduri(sloturi, product.id);
  }
  const stoc = stocVarianta(product, null);
  return [{
    key: "default",
    label: "Unic",
    variantTitle: null,
    /*
     * Si aici SKU-ul e primul, din acelasi motiv — ba chiar mai apasat.
     *
     * Produsul fara variante are `variantTitle: null`, deci potrivirea pe titlu
     * din editor NU-l acopera niciodata: singura legatura intre randul salvat si
     * slotul derivat e chiar barcode-ul. Schimbat, randul existent devine
     * negasibil, editorul afiseaza varianta goala si salvarea creeaza un al
     * doilea produs pe Trendyol.
     *
     * GTIN-ul de produs ramane a doua optiune: ajuta produsele fara SKU, care
     * altfel plecau cu un uuid drept cod de bare.
     */
    barcode: (product.sku || gtinProdus(product) || product.id).trim(),
    ron_price: product.price,
    quantity: stoc.quantity,
    stocViu: stoc.viu,
  }];
}

/*
 * Doua variante ale aceluiasi produs nu pot pleca cu acelasi barcode.
 *
 * Se intampla real: acelasi SKU pus pe toate marimile, sau acelasi GTIN copiat
 * peste tot. Trendyol ar accepta prima varianta si ar suprascrie-o cu a doua,
 * deci produsul ar aparea cu o singura marime, fara nicio eroare. Duplicatele
 * primesc o derivare proprie, care e unica prin constructie.
 */
function dezambiguizeazaBarcoduri(sloturi: VariantSlot[], productId: string): VariantSlot[] {
  const vazute = new Set<string>();
  return sloturi.map((s, i) => {
    if (!vazute.has(s.barcode)) { vazute.add(s.barcode); return s; }
    const derivat = barcodeDerivat(productId, s.key, i);
    vazute.add(derivat);
    return { ...s, barcode: derivat };
  });
}

/**
 * Stocul unei variante, dintr-un singur loc.
 *
 * Ordinea: stocul COMBINATIEI, apoi al produsului cand se tine inventar, iar
 * pentru produsele fara inventar o valoare mare (Trendyol cere un numar).
 *
 * Primul pas lipsea, si de aceea fiecare marime primea stocul TOTAL al
 * produsului: S=5, M=5, L=5 pleca la Trendyol ca 15 pe fiecare barcode, adica 45
 * de bucati vandabile din 15. Iar `reconcileInventory` folosea aceeasi functie,
 * deci nu corecta abaterea — o confirma ca stare dorita.
 */
export const STOC_NELIMITAT = 100;

export function stocVarianta(
  product: { track_inventory?: boolean | null; stock_quantity?: number | null },
  combo: VariantCombo | null,
): { quantity: number; viu: boolean } {
  const alCombinatiei = combo ? comboStock(combo) : null;
  if (alCombinatiei != null) return { quantity: Math.max(0, alCombinatiei), viu: true };
  /*
   * ⚠ `viu` inseamna „stocul ACESTEI variante", nu „un numar pe care il stim".
   *
   * Cand combinatia exista dar n-are stoc propriu, cadem pe stocul produsului —
   * care e un fond COMUN, nu al variantei. Marcat `viu`, ajungea in
   * `stocuriVii.dupaTitlu` si de acolo bate cantitatea scrisa de comerciant in
   * editor: un tricou cu 15 bucati in total si S/M/L fara stoc pe combinatie
   * pleca la Trendyol cu 15 pe fiecare marime, peste cele 5/5/5 completate de
   * om, si campul i se bloca in interfata ca sa nu poata corecta.
   *
   * Deci: doar produsul FARA combinatii isi are stocul „viu" pe varianta.
   */
  if (product.track_inventory) {
    return { quantity: Math.max(0, product.stock_quantity ?? 0), viu: combo === null };
  }
  return { quantity: STOC_NELIMITAT, viu: false };
}

// Resolve the quantity to send for a variant. Shared by createProducts (buildTrendyolItems)
// AND the inventory push (sync.computeInventoryItems) so a listed product never gets a
// different stock across the two paths. Single-variant products with inventory tracking
// take the product's own stock; explicit per-variant quantities win otherwise.
export function resolveVariantQuantity(
  product: { track_inventory?: boolean | null; stock_quantity?: number | null },
  variantQuantity: number | null,
  single: boolean,
  forceZero = false,
  /**
   * Stocul combinatiei, cand produsul are variante cu stoc propriu.
   *
   * Bate numarul salvat in `trendyol_variants.quantity`: acela e o fotografie
   * facuta o data in editor si care nu se mai misca niciodata, pe cand stocul
   * combinatiei se schimba la fiecare vanzare. Aceeasi regula exista deja mai
   * sus pentru produsul fara variante (`single && track_inventory`).
   */
  comboQuantity: number | null = null,
): number {
  let qty: number;
  if (forceZero) qty = 0;
  else if (single && product.track_inventory) qty = product.stock_quantity ?? 0;
  else if (comboQuantity != null) qty = comboQuantity;
  else if (variantQuantity != null) qty = variantQuantity;
  else if (product.track_inventory) qty = product.stock_quantity ?? 0;
  else qty = STOC_NELIMITAT;
  return Math.max(0, Math.min(20000, Math.round(qty)));
}

/**
 * Stocul viu al fiecarei variante, pentru cele doua cai care trimit cantitati.
 *
 * `buildTrendyolItems` (creare) si `computeInventoryItems` (impingere de stoc)
 * citesc amandoua de aici, ca sa nu ajunga sa trimita numere diferite pentru
 * acelasi barcode — exact felul de diferenta care se vede abia ca oscilatie in
 * reconciliere, cu stocul corectat inainte si inapoi la fiecare rulare de cron.
 *
 * Cautarea se face INTAI dupa titlul combinatiei si abia apoi dupa barcode:
 * variantele deja listate isi pastreaza barcode-ul dinainte, care poate sa nu
 * mai fie cel pe care l-ar deriva codul de azi. Titlul, in schimb, e acelasi
 * sir si in `page_sections`, si in `trendyol_variants.variant_title`.
 */
export interface StocuriVii {
  dupaTitlu: Map<string, number>;
  dupaBarcode: Map<string, number>;
}

export function stocuriVii(product: MappableProduct): StocuriVii {
  const dupaTitlu = new Map<string, number>();
  const dupaBarcode = new Map<string, number>();
  for (const s of deriveVariantSlots(product)) {
    if (!s.stocViu) continue;
    // PRIMA combinatie a unui titlu castiga, ca peste tot in aplicatie —
    // `deriveVariantSlots` deduplica deja, dar garda ramane: e mai ieftina
    // decat sa afli dintr-o supravanzare ca s-a strecurat un duplicat.
    if (s.variantTitle && !dupaTitlu.has(s.variantTitle)) dupaTitlu.set(s.variantTitle, s.quantity);
    if (!dupaBarcode.has(s.barcode)) dupaBarcode.set(s.barcode, s.quantity);
  }
  return { dupaTitlu, dupaBarcode };
}

/** Stocul viu al unei variante deja salvate, cautat cum trebuie. */
export function stocVarianteiSalvate(
  stocuri: StocuriVii, variant: { barcode: string; variant_title?: string | null },
): number | null {
  if (variant.variant_title) {
    const dupaTitlu = stocuri.dupaTitlu.get(variant.variant_title);
    if (dupaTitlu != null) return dupaTitlu;
  }
  return stocuri.dupaBarcode.get(variant.barcode) ?? null;
}

// ── Price building (direct RON) ───────────────────────────────────────────────
/**
 * Moneda in care sunt scrise preturile magazinului.
 *
 * ⚠ `MappableProduct.price` e documentat „RON" chiar in tipul lui, si asa si e: pretul din
 * fisa produsului. Nu se converteste nicaieri.
 */
const MONEDA_MAGAZINULUI = "RON";

/**
 * Preturile unei variante, in moneda VITRINEI.
 *
 * ═══ ⚠ UN PRET IN RON TRIMIS PE O VITRINA IN EURO (26.08.2026) ═══
 *
 * Trendyol citeste numarul in moneda vitrinei alese; noi nu convertim nimic, si e in regula
 * atat timp cat vitrina e RO. Dar sub Cross Country acelasi produs se listeaza si pe GR, SA,
 * AE, KW — iar cand varianta n-avea pret Trendyol propriu, se cadea inapoi pe `product.price`:
 *
 *   product.price = 100      (RON, adica vreo 20 EUR)
 *   vitrina GR               -> Trendyol citeste „100 EUR"
 *
 * Marfa pleaca la de cinci ori pretul, sau la o cincime — dupa moneda. Si NU DA NICIO EROARE:
 * numarul e valid, doar intelesul e altul. Se vede abia la prima comanda.
 *
 * ⚠ DE-AIA NU SE MAI CADE INAPOI TACUT. Pe o vitrina cu alta moneda, lipsa pretului explicit
 * e o piedica, nu o valoare implicita: comerciantul o vede si o completeaza. O conversie
 * facuta de noi ar fi fost si mai rea — ar fi cerut un curs, un moment al cursului si o
 * marja, adica trei hotarari comerciale luate in locul lui.
 */
export function buildVariantPrices(
  product: MappableProduct,
  variant: TrendyolVariantData,
  /**
   * ⚠ Optional, ca sa nu se rupa apelantii care listeaza pe vitrina de acasa. Lipsa lui
   * inseamna „vitrina implicita", adica RON — purtarea de pana acum.
   */
  config?: Pick<TrendyolConfig, "storefront">,
): { listPrice: number; salePrice: number } | { error: string } {
  const vitrina = infoVitrina(config?.storefront);
  const alta = vitrina.moneda !== MONEDA_MAGAZINULUI;

  const areSale = variant.sale_price != null && variant.sale_price > 0;
  const areList = variant.list_price != null && variant.list_price > 0;

  if (alta && !areSale) {
    return {
      error: `Completează prețul Trendyol pentru ${vitrina.tara} în ${vitrina.moneda}, `
        + `la varianta ${variant.barcode}. Prețul din magazin e în ${MONEDA_MAGAZINULUI} `
        + `și ar pleca la ei ca și cum ar fi ${vitrina.moneda}.`,
    };
  }

  const onSale = product.compare_at_price != null && product.compare_at_price > product.price;
  const sale = areSale ? (variant.sale_price as number) : product.price;
  let list = areList
    ? (variant.list_price as number)
    /* ⚠ Si pretul taiat: pe alta moneda se ia tot cel explicit, iar cand lipseste se
       foloseste chiar pretul de vanzare — nu cel din magazin, care e in alta moneda. */
    : (alta ? sale : (onSale ? (product.compare_at_price as number) : product.price));
  if (!(sale > 0)) return { error: `Prețul variantei ${variant.barcode} este 0.` };
  if (list < sale) list = sale; // Trendyol requires listPrice >= salePrice
  return { listPrice: round2(list), salePrice: round2(sale) };
}

/**
 * Atributele, in forma pe care o primeste API-ul lor.
 *
 * ⚠ `attributeValueId` SI `attributeValueIds` NU SE TRIMIT IMPREUNA. Cand comerciantul a ales
 * mai multe valori (categoriile cu `allowMultipleAttributeValues`), pleaca lista si singularul
 * se lasa deoparte — altfel trimitem doua declaratii despre acelasi atribut si nu stim pe care
 * o citesc ei.
 *
 * ⚠ Si valorile goale se scot: un `attributeValueIds: []` ar fi spus „atributul asta il
 * declar, si nu are nicio valoare", ceea ce e mai rau decat sa nu-l trimitem deloc.
 */
export function curataAtribute(atribute: TrendyolProductAttribute[]): TrendyolProductAttribute[] {
  const out: TrendyolProductAttribute[] = [];
  for (const a of atribute) {
    if (!a || typeof a.attributeId !== "number") continue;
    const multe = Array.isArray(a.attributeValueIds)
      ? a.attributeValueIds.filter((x) => typeof x === "number" && x > 0)
      : [];
    if (multe.length > 0) {
      out.push({ attributeId: a.attributeId, attributeValueIds: multe });
      continue;
    }
    if (typeof a.attributeValueId === "number" && a.attributeValueId > 0) {
      out.push({ attributeId: a.attributeId, attributeValueId: a.attributeValueId });
      continue;
    }
    const liber = (a.customAttributeValue ?? "").trim();
    if (liber) out.push({ attributeId: a.attributeId, customAttributeValue: liber });
  }
  return out;
}

// ── Item building ─────────────────────────────────────────────────────────────
export interface BuildContext {
  config: TrendyolConfig;
  product: MappableProduct;
  listing: TrendyolListingEnrichment;
  variants: TrendyolVariantData[];
}

export function effectiveCategoryId(config: TrendyolConfig, product: MappableProduct, listing: TrendyolListingEnrichment): number | null {
  if (listing.category_id) return listing.category_id;
  const entry = product.category ? config.category_map?.[product.category] : undefined;
  return entry?.category_id ?? null;
}
export function effectiveBrandId(config: TrendyolConfig, product: MappableProduct, listing: TrendyolListingEnrichment): number | null {
  if (listing.brand_id) return listing.brand_id;
  const entry = product.category ? config.category_map?.[product.category] : undefined;
  return entry?.brand_id ?? config.brand_id ?? null;
}
function effectiveAttributes(config: TrendyolConfig, product: MappableProduct, listing: TrendyolListingEnrichment): TrendyolProductAttribute[] {
  if (listing.attributes && listing.attributes.length > 0) return listing.attributes;
  const entry = product.category ? config.category_map?.[product.category] : undefined;
  return entry?.attributes ?? [];
}

export function buildTrendyolItems(ctx: BuildContext): { items: TrendyolProductItem[] } | { error: string } {
  const { config, product, listing } = ctx;

  const brandId = effectiveBrandId(config, product, listing);
  if (!brandId) return { error: "Alege brandul Trendyol." };
  const categoryId = effectiveCategoryId(config, product, listing);
  if (!categoryId) return { error: "Categoria produsului nu este mapată la Trendyol." };
  // Curierul si adresele NU mai sunt conditii pentru listare: pe marketplace-ul
  // international curierul se comunica abia la expediere (`providerCode`), iar
  // adresele sunt optionale — Trendyol foloseste implicitele contului. Cerute
  // aici, blocau listarea unor produse perfect valide.

  const images = productImages(product);
  if (images.length === 0) {
    return { error: "Produsul nu are imagini pe https. Trendyol acceptă doar imagini https." };
  }

  const title = stripHtml(product.name).slice(0, 100);
  const description = stripHtml(product.description ?? product.name).slice(0, 30000);
  const weight = productWeight(product, listing);
  const productLevelAttrs = effectiveAttributes(config, product, listing);
  // `productMainId` are aceeasi limita ca barcode-ul: 40 de caractere. Un uuid
  // intra lejer, dar taiem oricum, ca sa nu depinda de forma id-ului.
  const productMainId = product.id.slice(0, 40);

  const enabled = ctx.variants.filter((v) => v.enabled);
  if (enabled.length === 0) return { error: "Nicio variantă activă de listat." };
  const single = enabled.length === 1;
  // Stocul viu al fiecarei combinatii, ca fiecare marime sa plece cu al ei si nu
  // cu totalul produsului.
  const stocuri = stocuriVii(product);

  const items: TrendyolProductItem[] = [];
  for (const v of enabled) {
    // Barcode is the cross-endpoint identifier (create, inventory, order match); it
    // must be identical everywhere, so reject bad ones rather than silently fixing.
    const barcode = (v.barcode || "").trim();
    const problema = verificaBarcode(barcode);
    if (problema) return { error: problema };
    const priced = buildVariantPrices(product, v, config);
    if ("error" in priced) return priced;

    const item: TrendyolProductItem = {
      barcode,
      title,
      productMainId,
      brandId,
      categoryId,
      quantity: resolveVariantQuantity(product, v.quantity, single, false, stocVarianteiSalvate(stocuri, v)),
      stockCode: (v.stock_code || barcode).slice(0, 100),
      dimensionalWeight: weight,
      description,
      listPrice: priced.listPrice,
      salePrice: priced.salePrice,
      vatRate: tvaPentruVitrina(config, v.vat_rate),
      images: images.map((url) => ({ url })),
      attributes: curataAtribute([...productLevelAttrs, ...(Array.isArray(v.attributes) ? v.attributes : [])]),
    };
    /*
     * Garantia SGR, obligatorie prin lege in Romania.
     *
     * Se trimite DOAR pe vitrina RO si doar pe categoriile de bauturi si uleiuri
     * — pe restul, campul n-are ce cauta. Se calculeaza pe unitate de ambalaj,
     * deci un bax de sase doze inseamna 3 lei, nu 0,50.
     */
    if (necesitaSgr(categoryId, config.storefront)) {
      item.sgrPrice = pretSgr(listing.sgr_units);
    }
    /*
     * ═══ TARA DE FABRICATIE, CERUTA DE EI DIN 23.10.2026 ═══
     *
     * Camp nou de nivel intai, adaugat pe 17.08.2026 si optional pana atunci. Se ia de pe
     * listare, iar cand lipseste, din implicitul magazinului.
     *
     * ⚠ NU SE PUNE UN IMPLICIT INVENTAT. Fara nicio valoare aleasa de comerciant, campul NU
     * pleaca — un magazin din Romania vinde hrana facuta in Germania si jucarii facute in
     * China, iar un „RO" pus de noi peste tot ar fi o declaratie falsa despre marfa lui.
     * Cat timp campul e optional la ei, lipsa lui nu strica nimic; cand devine obligatoriu,
     * refuzul lor va numi chiar campul, si comerciantul stie ce sa completeze.
     *
     * ⚠ SI NU INLOCUIESTE ATRIBUTUL. Pana la 23.10.2026, o categorie care cere „origine" ca
     * atribut trebuie sa primeasca in continuare si atributul — ele merg impreuna, nu unul
     * in locul celuilalt. De-aia nu se scoate nimic din `attributes`.
     */
    const taraFabricatiei = (listing.country_of_origin || config.default_country_of_origin || "")
      .trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(taraFabricatiei)) item.origin = taraFabricatiei;

    // Adresele sunt optionale: le trimitem doar daca vanzatorul a ales explicit
    // altele decat implicitele contului sau.
    if (config.shipment_address_id) item.shipmentAddressId = config.shipment_address_id;
    if (config.returning_address_id) item.returningAddressId = config.returning_address_id;
    items.push(item);
  }
  return { items };
}

/** Moneda in care Trendyol citeste preturile trimise, dupa vitrina aleasa. */
export function monedaVitrina(config: TrendyolConfig): string {
  return infoVitrina(config.storefront).moneda;
}
