import { createHash } from "node:crypto";
import { cotaTva, pretBrut, type RegimTvaMagazin } from "@/lib/pepita/pret";
import { hrefProdus } from "@/lib/storefront/permalinkuri";
import { adresaCuVarianta } from "@/lib/storefront/varianta-din-adresa";
import { areDescriere, imaginileProdusului, type ArticolCatalog, type ProdusCatalog } from "./eligibilitate";

/**
 * Corpul unui produs pentru `POST /products/save` si `/products/save/bulk` (planul, §5.4.4).
 *
 * Campurile, dupa tabelul „Product object" din Save product [A]:
 *
 *   product_website_id  id-ul randului din `easysales_produse` („Numeric, True (Unique)");
 *   sku                 SKU-ul INGHETAT (`sku_trimis`), nu cel de azi al produsului;
 *   name                la varianta `Nume (titlu)`, aceeasi forma ca pe linia de comanda;
 *   type                `simple`, sau `complex` pentru fiecare combinatie [A];
 *   description         HTML-ul produsului, asa cum l-a curatat editorul (obligatorie [A]);
 *   sale_price          pretul CU TVA [A: „including VAT"], prin aceeasi socoteala ca Pepita;
 *   full_price          pretul vechi de taiat cu TVA, altfel egal cu `sale_price` (`/prices/bulk` le cere pe amandoua);
 *   tax_rate            `vat_enabled ? vat_rate : 0`;
 *   stock               E3: 0; E4: `stocDeTrimis`;
 *   weight              kg [A], din `weight_grams`;
 *   images              produsul, cu poza combinatiei prima;
 *   categories          `category_website_id`-ul frunzei [A: „Array of category_website_id's"];
 *   characteristics     `[{id, value}]`, cu `id` = `characteristic_website_id` [A];
 *   brand, ean, url, parent_*, handling_time  optionale [A].
 *
 * ⚠ `parent_id` e id-ul randului `#parinte`, iar parintele NU pleaca separat: `type` spune „simple if
 * product doesn't have a parent / complex - if the product is a variation" [A], deci un parinte ar fi
 * un produs simplu vandabil care nu exista. Daca parintele se trimite separat e IPOTEZA (M-PROD-3).
 *
 * ⚠ `acquisition_price`, `height`, `meta_fields` apar numai in corpul exemplului, nedocumentate [A]:
 * nu pleaca. Nici `supplier_sku` si `warehouse_location`.
 */

export interface CorpProdus {
  product_website_id: number;
  sku: string;
  name: string;
  type: "simple" | "complex";
  description: string;
  sale_price: number;
  full_price: number;
  tax_rate: number;
  stock: number;
  weight?: number;
  images: string[];
  categories: number[];
  characteristics: { id: number; value: string }[];
  brand?: string;
  ean?: string;
  url?: string;
  parent_id?: number;
  parent_name?: string;
  parent_url?: string;
  handling_time?: number;
}

export interface IntrareCorp {
  produs: ProdusCatalog;
  articol: ArticolCatalog;
  productWebsiteId: number;
  sku: string;
  /** Id-ul randului `#parinte`, la variante. */
  parinteId: number | null;
  magazin: RegimTvaMagazin;
  /** Adresa publica a magazinului (`storeBaseUrl`). */
  baza: string;
  /** Prefixul produselor (Setari > Permalink-uri). */
  prefixProdus: string;
  /** `category_website_id`-ul frunzei (sau al categoriei de rezerva). */
  categorii: number[];
  caracteristici: { id: number; value: string }[];
  /** Imaginile deja aduse la un format primit (`imaginiPentruEmag`), in ordinea lor. */
  imagini: string[];
  stoc: number;
  /**
   * Preturile care pleaca. ⚠ La un articol deja trimis sunt cele TRIMISE ultima oara, nu cele de azi:
   * pretul nou pleaca numai pe drumul lui (`/products/prices/bulk`), prin siguranta de masa. Altfel o
   * scumpire cu 50% a tot catalogului, facuta odata cu o schimbare de descriere, ar trece pe langa paza.
   */
  preturi: { sale_price: number; full_price: number };
  termenZile: number | null;
  descriereDinNume: boolean;
}

function escapeazaHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Preturile brute ale articolului: `sale_price` si `full_price` (niciodata sub `sale_price`). */
export function preturileArticolului(
  a: Pick<ArticolCatalog, "pret" | "pretVechi">, magazin: RegimTvaMagazin,
): { sale_price: number; full_price: number } {
  const vanzare = pretBrut(a.pret, magazin);
  const vechi = a.pretVechi != null ? pretBrut(a.pretVechi, magazin) : vanzare;
  return { sale_price: vanzare, full_price: vechi > vanzare ? vechi : vanzare };
}

/** Imaginile articolului: la varianta, poza combinatiei prima; fara dubluri. */
export function imaginileArticolului(p: Pick<ProdusCatalog, "images">, a: Pick<ArticolCatalog, "combo">): string[] {
  const ale = imaginileProdusului(p.images);
  const poza = typeof a.combo?.image === "string" ? a.combo.image.trim() : "";
  return poza ? [poza, ...ale.filter((u) => u !== poza)] : ale;
}

/** Adresa produsului in magazin, si a variantei. */
export function adreseleArticolului(
  p: Pick<ProdusCatalog, "id" | "slug">, a: Pick<ArticolCatalog, "combo">, baza: string, prefix: string,
): { url: string; parinte: string } {
  const parinte = hrefProdus(baza, p.slug || p.id, prefix);
  return { parinte, url: a.combo ? adresaCuVarianta(parinte, a.combo) : parinte };
}

export function corpulProdusului(x: IntrareCorp): CorpProdus {
  const { produs: p, articol: a } = x;
  const nume = (p.name ?? "").trim();
  const adrese = adreseleArticolului(p, a, x.baza, x.prefixProdus);
  const descriere = areDescriere(p.description)
    ? (p.description as string)
    : x.descriereDinNume ? `<p>${escapeazaHtml(nume)}</p>` : "";
  const google = ((p.page_sections as { google?: { brand?: unknown } } | null)?.google) ?? {};
  const brand = typeof google.brand === "string" ? google.brand.trim() : "";
  const greutate = Number(p.weight_grams);

  const corp: CorpProdus = {
    product_website_id: x.productWebsiteId,
    sku: x.sku,
    name: a.fel === "complex" ? `${nume} (${a.titlu})` : nume,
    type: a.fel,
    description: descriere,
    sale_price: x.preturi.sale_price,
    full_price: x.preturi.full_price,
    tax_rate: cotaTva(x.magazin),
    stock: Math.max(0, Math.floor(x.stoc)),
    images: x.imagini,
    categories: x.categorii,
    characteristics: x.caracteristici,
    url: adrese.url,
  };
  if (Number.isFinite(greutate) && greutate > 0) corp.weight = Math.round(greutate) / 1000;
  if (brand) corp.brand = brand;
  if (a.ean) corp.ean = a.ean;
  if (a.fel === "complex" && x.parinteId != null) {
    corp.parent_id = x.parinteId;
    corp.parent_name = nume;
    corp.parent_url = adrese.parinte;
  }
  if (x.termenZile != null) corp.handling_time = x.termenZile;
  return corp;
}

/** JSON cu cheile ordonate, ca aceeasi valoare sa dea mereu aceeasi amprenta. */
function canonic(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonic).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>).sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonic((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/**
 * Amprenta CONTINUTULUI: corpul fara preturi si fara stoc.
 *
 * ⚠ Pretul si stocul au drumurile lor (`/products/prices/bulk`, `/stocks/bulk`), cu siguranta de masa
 * fiecare. Pusa si in amprenta, o schimbare de pret ar retrimite produsul intreg cu Save, adica
 * exact ocolind paza pretului.
 */
export function amprentaContinutului(corp: CorpProdus): string {
  const { sale_price: _v, full_price: _f, stock: _s, ...rest } = corp;
  void _v; void _f; void _s;
  return createHash("sha256").update(canonic(rest), "utf8").digest("hex").slice(0, 32);
}

/** Octetii pe care ii ocupa un corp intr-un lot (pentru plafonul lotului). */
export function octetii(corp: CorpProdus): number {
  return Buffer.byteLength(JSON.stringify(corp), "utf8");
}
