/*
  ═══════════════════════════════════════════════════════════════════════════════
  FEEDUL DE PRODUSE THEMARKETER: un produs, scris ca XML. Pur.
  ═══════════════════════════════════════════════════════════════════════════════

  Forma e cea din developers.themarketer.com/reference/product-feed (actualizata 23.04.2026). Campurile
  OBLIGATORII acolo: id, sku, name, description, url, main_image, category, brand, acquisition_price,
  price, sale_price, availability, stock, media_gallery („daca nu exista mai multe imagini, pune imaginea
  principala”), created_at. Variatiile sunt optionale.

  ═══ REGULILE LOR, SI CUM LE INDEPLINIM ═══

  - `sale_price` e OBLIGATORIU: „If product is not on sale, must be equal to price” (specul API de
    produs). Deci la un produs fara reducere pleaca de doua ori acelasi pret;
  - `availability`: 0 = epuizat, 1 = in stoc, 2 = la furnizor. „If stock > 0, availability must be 1.
    If stock is 0, availability can be 0 or 2.” Un produs FARA stoc urmarit (se vinde oricand) pleaca cu
    stoc 0 si disponibilitate 2: exact ce face pluginul lor oficial pentru stocul negestionat. Un stoc
    inventat („999”) ar fi aratat in emailurile de tip „ultimele bucati” cifre care nu exista;
  - `brand` e obligatoriu: fara brand, „N/A” (asa scrie si specul lor: „N/A if product does not have
    brand set”). La fel la categorie;
  - `acquisition_price` e obligatoriu, iar platforma nu tine pretul de achizitie: pleaca 0;
  - `created_at`: „YYYY-MM-DD HH:mm”, ora Romaniei.

  ═══ CINE RAMANE AFARA ═══

  Aceeasi hotarare ca in catalogul Meta (`motivulLipseiDinCatalog`): produsul fara imagine si cel al carui
  pret de catalog minte (vandut la metru patrat, de pilda). theMarketer pune pretul in emailurile de
  recomandare; un pret mincinos ar trimite omul la un produs care costa altceva.

  ⚠ Imaginile pleaca prin `imagineCatalog`: WebP-ul si AVIF-ul din depozit devin JPEG. Emailurile se
  citesc si in Outlook pentru Windows, care nu afiseaza WebP.
*/

import { el, grup, numar } from "@/lib/pepita/xml";
import { imagineCatalog, motivulLipseiDinCatalog, plainText } from "@/lib/facebook/catalog-feed";
import { hrefProdus } from "@/lib/storefront/permalinkuri";
import {
  parseVariants, combinatiiActiveUnice, comboUnitPrice, comboCompareAtPrice, VARIANT_TITLE_SEP,
} from "@/lib/storefront/variants";
import { idVariantaTM, skuProdusTM, skuVariantaTM } from "./identitate";

export type ProdusFeedTM = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  price: number | string | null;
  compare_at_price: number | string | null;
  sku: string | null;
  images: unknown;
  category: string | null;
  is_bundle: boolean | null;
  track_inventory: boolean | null;
  stock_quantity: number | null;
  page_sections: unknown;
  created_at: string | null;
  /** Calculata de apelant din componente (vezi `disponibilitatePachet`). Doar la pachete. */
  pachetDisponibil?: boolean;
};

export type ContextFeedTM = {
  /** Adresa publica a magazinului (`storeBaseUrl`). */
  baza: string;
  /** Prefixul produselor (Setari > Permalink-uri). */
  prefixProdus: string;
  /** Ierarhia completa a categoriei („Barbati|Incaltaminte|Sneakers”), dupa numele ei. */
  ierarhie: (categorie: string | null) => string | null;
};

export const FARA_VALOARE = "N/A";

const CULOARE = /cul|colou?r/i;
const MARIME = /m[aă]rim|size|talie|numar|număr/i;

/** „YYYY-MM-DD HH:mm”, ora Romaniei. `null` pentru o data care nu se poate citi. */
export function dataTM(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Pretul si pretul redus, in forma ceruta: fara reducere, amandoua egale. */
export function preturiTM(pret: number, comparatie: number | null): { price: number; sale_price: number } {
  const p = Number.isFinite(pret) ? Math.max(0, pret) : 0;
  if (comparatie != null && Number.isFinite(comparatie) && comparatie > p) return { price: comparatie, sale_price: p };
  return { price: p, sale_price: p };
}

/**
 * Stocul si disponibilitatea, dupa regula lor. `stoc` = numarul urmarit (null = nu se urmareste).
 * `vandabil` = se poate cumpara (produsul activ, pachetul cu componente).
 */
export function disponibilitateTM(stoc: number | null, vandabil: boolean): { availability: 0 | 1 | 2; stock: number } {
  if (!vandabil) return { availability: 0, stock: 0 };
  if (stoc == null) return { availability: 2, stock: 0 };
  const n = Number.isFinite(stoc) ? Math.max(0, Math.floor(stoc)) : 0;
  return { availability: n > 0 ? 1 : 0, stock: n };
}

function primaImagine(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  for (const brut of images) {
    const u = String(brut);
    if (u) return u;
  }
  return null;
}

function brandul(pageSections: unknown): string {
  const b = (pageSections as { google?: { brand?: unknown } } | null)?.google?.brand;
  return typeof b === "string" && b.trim() ? b.trim() : FARA_VALOARE;
}

/**
 * Un `<product>` complet, sau sirul gol cand produsul ramane afara (fara imagine, pret care minte).
 */
export function produsXml(p: ProdusFeedTM, ctx: ContextFeedTM): string {
  if (motivulLipseiDinCatalog({ price: p.price, page_sections: p.page_sections, images: p.images })) return "";
  const imagini = (Array.isArray(p.images) ? p.images.map(String).filter(Boolean) : []);
  const principala = primaImagine(p.images);
  if (!principala) return "";

  const pretBaza = Number(p.price) || 0;
  const comparatieBaza = p.compare_at_price != null && String(p.compare_at_price).trim() !== "" ? Number(p.compare_at_price) : null;
  const urmarit = p.track_inventory === true && !p.is_bundle;
  const vandabil = p.is_bundle ? p.pachetDisponibil !== false : true;

  const variante = parseVariants(p.page_sections);
  const active = combinatiiActiveUnice(variante);

  const varXml: string[] = [];
  let pretProdus = preturiTM(pretBaza, comparatieBaza);
  let disp = disponibilitateTM(urmarit ? (p.stock_quantity ?? 0) : null, vandabil);

  if (variante && active.length > 0) {
    const axe = variante.options.map((o) => (CULOARE.test(o.name) ? "color" : MARIME.test(o.name) ? "size" : null));
    let celMaiMic: { price: number; sale_price: number } | null = null;
    let stocTotal = 0;
    let vreoUnaInStoc = false;
    let vreoUnaNeurmarita = false;
    for (const combo of active) {
      const unitar = comboUnitPrice(combo, pretBaza) || pretBaza;
      const preturi = preturiTM(unitar, comboCompareAtPrice(combo, comparatieBaza));
      if (!celMaiMic || preturi.sale_price < celMaiMic.sale_price) celMaiMic = preturi;

      const brut = combo.stock_quantity != null && String(combo.stock_quantity).trim() !== "" ? Number(combo.stock_quantity) : null;
      /* La fel ca in catalogul Meta: stocul combinatiei cand produsul e urmarit si combinatia il are scris;
         altfel, cel al produsului. */
      const stocCombo = urmarit ? (brut != null && Number.isFinite(brut) ? brut : (p.stock_quantity ?? 0)) : null;
      const d = disponibilitateTM(stocCombo, vandabil);
      if (d.availability === 1) { vreoUnaInStoc = true; stocTotal += d.stock; }
      if (d.availability === 2) vreoUnaNeurmarita = true;

      const parti = combo.title.split(VARIANT_TITLE_SEP);
      const marime = axe.findIndex((a) => a === "size");
      const culoare = axe.findIndex((a) => a === "color");
      varXml.push(grup("variation",
        el("id", idVariantaTM(p.id, combo.title))
        + el("sku", skuVariantaTM(p.id, combo.title, combo.sku))
        + el("acquisition_price", "0")
        + el("price", numar(preturi.price))
        + el("sale_price", numar(preturi.sale_price))
        + (marime >= 0 ? el("size", parti[marime]) : "")
        + (culoare >= 0 ? el("color", parti[culoare]) : "")
        + el("availability", String(d.availability))
        + el("stock", String(d.stock)),
      ));
    }
    if (celMaiMic) pretProdus = celMaiMic;
    disp = vreoUnaInStoc
      ? { availability: 1, stock: stocTotal }
      : vreoUnaNeurmarita ? { availability: 2, stock: 0 } : { availability: 0, stock: 0 };
  }

  const url = hrefProdus(ctx.baza, p.slug || p.id, ctx.prefixProdus);
  const galerie = (imagini.length ? imagini : [principala]).map((u) => el("image", imagineCatalog(u))).join("");

  return grup("product",
    el("id", p.id)
    + el("sku", skuProdusTM(p.id, p.sku))
    + el("name", p.name)
    + el("description", plainText(p.description, p.name))
    + el("url", url)
    + el("main_image", imagineCatalog(principala))
    + el("category", ctx.ierarhie(p.category) || FARA_VALOARE)
    + el("brand", brandul(p.page_sections))
    + el("acquisition_price", "0")
    + el("price", numar(pretProdus.price))
    + el("sale_price", numar(pretProdus.sale_price))
    + el("availability", String(disp.availability))
    + el("stock", String(disp.stock))
    + grup("media_gallery", galerie)
    + grup("variations", varXml.join(""))
    + el("created_at", dataTM(p.created_at) ?? dataTM(new Date().toISOString())),
  ) + "\n";
}
