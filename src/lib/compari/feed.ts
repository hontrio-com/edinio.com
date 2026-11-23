/**
 * Feedul de produse pentru Compari.ro (comparator de preturi), servit la `{adresa magazinului}/compari.xml`.
 *
 * ═══ CE CERE COMPARI (citit pe 23.11.2026) ═══
 *
 * Sursa: `compari.ro/static/feed-requirements.html` („Formate de FEED”) si `feed-modification.html`.
 *   - obligatorii: Identifier, Manufacturer, Name, Category, ProductUrl, Price („pretul brut, cu toate taxele
 *     incluse”) si, unde exista, ProductNumber (codul dat de producator);
 *   - recomandate: DeliveryTime, DeliveryCost, Description, ImageURL, Ean_Code;
 *   - fisierul sta pe site-ul magazinului, iar ei il descarca zilnic la 17:00.
 *
 * ⚠ NUMELE ELEMENTELOR. Pagina lor scrie acelasi camp in doua feluri (`<DeliveryCost>` in titlu, `<delivery_cost>`
 * in exemple), deci citirea lor nu tine cont de litere mari. Aici se folosesc DOAR forme care apar scrise la ei, cu
 * litere mici: `product_url` si `image_url` (formatul lor vechi), `delivery_time` si `delivery_cost` (exemplele din
 * pagina), `ean_code` si `productnumber` (`<Ean_Code>`, `<ProductNumber>`). Niciun nume nu e inventat.
 *
 * ═══ UN PRODUS, UN RAND ═══
 *
 * Un produs cu marimi si culori pleaca O DATA, cu cel mai mic pret la care chiar se poate cumpara: un comparator
 * de preturi asaza magazinele pe produs, nu pe marime. Catalogul Meta face altfel (un rand pe combinatie), fiindca
 * acolo reclama arata chiar culoarea aleasa.
 *
 * ⚠ IDENTIFICATORUL E ID-UL PRODUSULUI, nu SKU-ul. Compari: „Nu modificati identificatorul unic”. SKU-ul il poate
 * rescrie comerciantul oricand din formular; id-ul nu se schimba cat traieste produsul. SKU-ul pleaca separat, ca
 * `productnumber`, unde o corectura nu rupe nimic.
 *
 * ⚠ CIFRELE NU SE SOCOTESC AICI. Pretul vine din `getProductPriceRange` (aceeasi regula ca pagina, cardul si datele
 * structurate), TVA-ul din `pretBrut` (aceeasi regula ca feedul Pepita), termenul din Setari > Livrare, pragul de
 * transport gratuit din `pragTransportGratuit` (aceeasi regula ca finalizarea comenzii). O a doua socoteala scrisa
 * aici s-ar fi despartit de pagina la prima schimbare, iar comparatorul ar fi anuntat alt pret decat magazinul.
 */

import { storeBaseUrl } from "@/lib/seo";
import { hrefProdus } from "@/lib/storefront/permalinkuri";
import { imagineCatalog, plainText } from "@/lib/facebook/catalog-feed";
import { isValidGtin, normalizeGtin } from "@/lib/gtin";
import { getProductPriceRange } from "@/lib/utils/product-price";
import { parseVariants, toateCombinatiileEpuizate } from "@/lib/storefront/variants";
import { pretulDinCatalogMinte } from "@/lib/customization/pretul-din-catalog-minte";
import { pretBrut, type RegimTvaMagazin } from "@/lib/pepita/pret";
import type { MotivLipsaCompari, ProdusLasatAfaraCompari, RezumatCompari } from "./lasate-afara";

export type { MotivLipsaCompari } from "./lasate-afara";

/** „Name: up to 100 characters” (formatul lor de incarcare). */
export const LUNGIME_NUME_COMPARI = 100;
/** „Description: up to 4096 characters”. Se taie mai devreme, la hotar de cuvant. */
export const LUNGIME_DESCRIERE_COMPARI = 4000;

export interface MagazinCompari {
  slug: string;
  custom_domain: string | null;
  store_name: string | null;
  business_name: string;
  /** Prefixul produselor (Setari > Permalink-uri). Lipsa = `product`. */
  prefix_produs?: string;
  tva: RegimTvaMagazin;
  /**
   * In cate zile ajunge comanda la client: capatul de sus al ferestrei declarate in Setari > Livrare.
   * `null` cand comerciantul nu a declarat nimic. Nu se inlocuieste cu o valoare implicita: un termen pe care
   * omul nu l-a spus e o promisiune facuta in numele lui (aceeasi regula ca in datele structurate).
   */
  zileLivrare: number | null;
  transport: {
    /** Magazinul livreaza (`store_settings.shipping_enabled`). */
    activ: boolean;
    /** Tariful de baza, in preturile magazinului (`default_shipping_cost`). `null` = nescris. */
    cost: number | null;
    /** Pragul de transport gratuit, in preturile magazinului. `null` = fara prag. */
    pragGratuit: number | null;
  };
}

export interface ProdusCompari {
  id: string;
  name: string;
  slug: string | null;
  sku: string | null;
  description: string | null;
  price: number | string | null;
  images: unknown;
  category: string | null;
  track_inventory: boolean | null;
  stock_quantity: number | null;
  page_sections?: unknown;
  is_bundle?: boolean | null;
  /** Verdictul `disponibilitatePachet`, pentru pachete. Il socoteste apelantul, care are componentele. */
  pachetDisponibil?: boolean;
}

export interface ArticolCompari {
  identifier: string;
  manufacturer: string;
  name: string;
  category: string;
  productUrl: string;
  /** Pretul brut, cu doua zecimale si punct: „117.72”. */
  price: string;
  productNumber?: string;
  eanCode?: string;
  imageUrl: string;
  description?: string;
  /** Zile, sau „NO” cand produsul nu se poate comanda. Lipsa = nedeclarat. */
  deliveryTime?: string;
  /** Suma, sau „gratuit”. Niciodata „0”: Compari il trece la formate gresite. */
  deliveryCost?: string;
}

interface AtributeProdus { brand?: unknown; gtin?: unknown; mpn?: unknown }

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Taie la `max`, dar nu prin mijlocul unui cuvant; semnul ramas singur la capat se scoate. */
export function taieLaCuvant(sir: string, max: number): string {
  if (sir.length <= max) return sir;
  const bucata = sir.slice(0, max);
  const spatiu = bucata.lastIndexOf(" ");
  const taiat = spatiu > max * 0.6 ? bucata.slice(0, spatiu) : bucata;
  return taiat.replace(/[\s,;:|\-(]+$/u, "").trimEnd();
}

/** Prima imagine folosibila, aleasa ca in catalogul Meta. */
function primaImagine(images: unknown): string | undefined {
  if (!Array.isArray(images)) return undefined;
  for (const brut of images) {
    const u = typeof brut === "string" ? brut.trim() : "";
    if (u) return u;
  }
  return undefined;
}

/** Pretul de vitrina al produsului (cel mai mic la care se poate cumpara) si daca are vreo oferta. */
function pretulDeVitrina(produs: ProdusCompari): { pret: number; faraOferta: boolean } {
  const interval = getProductPriceRange(Number(produs.price) || 0, produs.page_sections ?? null);
  return { pret: interval.min, faraOferta: interval.faraOferta };
}

/**
 * De ce nu ajunge produsul in feed, sau `null` cand ajunge.
 *
 * ⚠ O SINGURA HOTARARE: generatorul o aplica, iar un ecran care ar vrea sa spuna comerciantului ce ramane afara
 * o citeste de aici, nu o deduce a doua oara (lectia catalogului Meta, `motivulLipseiDinCatalog`).
 *
 * ⚠ Produsul EPUIZAT nu e aici: el ramane in feed, cu `delivery_time` „NO”. Compari il ascunde singur, iar la
 * intoarcerea in stoc isi regaseste locul. Scos din feed, ar fi luat de la capat („reintrodus ca produs nou”).
 */
export function motivulLipseiDinCompari(magazin: MagazinCompari, produs: ProdusCompari): MotivLipsaCompari | null {
  if (pretulDinCatalogMinte(produs)) return "pret-care-minte";
  if (!primaImagine(produs.images)) return "fara-imagine";
  if (!text(produs.category)) return "fara-categorie";
  if (pretBrut(pretulDeVitrina(produs).pret, magazin.tva) <= 0) return "fara-pret";
  return null;
}

/** Produsul se poate comanda acum? Aceeasi regula ca pagina produsului si ca datele structurate. */
function stareaStocului(produs: ProdusCompari, faraOferta: boolean): "in-stoc" | "epuizat" | "precomanda" {
  const ps = (produs.page_sections ?? null) as { stock_status?: unknown } | null;
  const marcaj = typeof ps?.stock_status === "string" ? ps.stock_status : "in_stock";
  const urmareste = produs.track_inventory === true;
  const epuizat = marcaj === "out_of_stock"
    || faraOferta
    || (produs.is_bundle ? produs.pachetDisponibil === false : urmareste && (Number(produs.stock_quantity) || 0) <= 0)
    || (urmareste && toateCombinatiileEpuizate(parseVariants(produs.page_sections ?? null)));
  if (epuizat) return "epuizat";
  return marcaj === "preorder" ? "precomanda" : "in-stoc";
}

/** O suma pentru feed: intreaga cand e intreaga („45”), altfel cu doua zecimale si punct („54.45”). */
function suma(valoare: number): string {
  const rotunjit = Math.round(valoare * 100) / 100;
  return Number.isInteger(rotunjit) ? String(rotunjit) : rotunjit.toFixed(2);
}

/**
 * Costul livrarii pentru un singur produs, cum l-ar plati cine comanda doar produsul acesta.
 *
 * ⚠ „gratuit”, NU „0”: pagina Compari trece `0` la formate gresite si da ca exemple bune „gratuit” si „Free”.
 * ⚠ Pragul se compara in PRETURILE MAGAZINULUI, ca la finalizarea comenzii (`subtotal >= prag`), iar tariful
 * pleaca BRUT: la un magazin cu preturi fara TVA, transportul intra in baza de TVA (`vatBase`).
 * ⚠ Tarif nescris sau livrare oprita = campul lipseste. Un cost inventat ar fi o promisiune a noastra.
 */
function costulLivrarii(magazin: MagazinCompari, pretDeVitrina: number): string | undefined {
  const t = magazin.transport;
  if (!t.activ) return undefined;
  if (t.pragGratuit !== null && pretDeVitrina >= t.pragGratuit) return "gratuit";
  if (t.cost === null || !Number.isFinite(t.cost) || t.cost < 0) return undefined;
  if (t.cost === 0) return "gratuit";
  return suma(pretBrut(t.cost, magazin.tva));
}

/**
 * Un rand de feed pentru un produs, sau `null` cand produsul ramane afara (vezi `motivulLipseiDinCompari`).
 * `caleaCategoriei` intoarce calea intreaga („Parinte > Copil”) pentru numele categoriei de pe produs.
 */
export function construiesteArticolCompari(
  magazin: MagazinCompari,
  produs: ProdusCompari,
  caleaCategoriei: (nume: string) => string,
): ArticolCompari | null {
  if (motivulLipseiDinCompari(magazin, produs)) return null;

  const imagine = primaImagine(produs.images);
  if (!imagine) return null;

  const { pret, faraOferta } = pretulDeVitrina(produs);
  const atribute = (((produs.page_sections ?? null) as { google?: AtributeProdus } | null)?.google) ?? {};
  const categorie = text(produs.category);
  const stoc = stareaStocului(produs, faraOferta);

  /*
   * ⚠ „NO” pentru produsul epuizat, zilele DOAR pentru cel care se poate comanda acum, nimic pentru precomanda:
   * termenul din Setari > Livrare e al marfii din stoc, iar o precomanda are alt termen, pe care nu-l stim.
   * Cel putin 1: `0` nu e intre formatele lor, iar „1” inseamna la ei „In stoc”.
   */
  const deliveryTime = stoc === "epuizat"
    ? "NO"
    : stoc === "in-stoc" && magazin.zileLivrare !== null
      ? String(Math.max(1, Math.trunc(magazin.zileLivrare)))
      : undefined;

  const descriere = taieLaCuvant(plainText(produs.description, ""), LUNGIME_DESCRIERE_COMPARI);
  const gtin = text(atribute.gtin);

  return {
    identifier: produs.id,
    manufacturer: text(atribute.brand) || text(magazin.store_name) || magazin.business_name,
    name: taieLaCuvant(produs.name.replace(/\s+/g, " ").trim(), LUNGIME_NUME_COMPARI),
    category: caleaCategoriei(categorie) || categorie,
    productUrl: hrefProdus(storeBaseUrl(magazin), produs.slug ?? produs.id, magazin.prefix_produs),
    price: pretBrut(pret, magazin.tva).toFixed(2),
    productNumber: text(atribute.mpn) || text(produs.sku) || undefined,
    eanCode: isValidGtin(gtin) ? normalizeGtin(gtin) : undefined,
    imageUrl: imagineCatalog(imagine),
    description: descriere || undefined,
    deliveryTime,
    deliveryCost: stoc === "epuizat" ? undefined : costulLivrarii(magazin, pret),
  };
}

/**
 * Ce i se spune comerciantului despre feed: cate produse pleaca, cate ascunde Compari si cate raman afara.
 *
 * ⚠ Se socoteste cu ACELEASI doua functii pe care le foloseste ruta feedului, nu cu o regula scrisa pentru ecran:
 * un numar de aici care nu e numarul din feed ar fi o liniste falsa.
 * ⚠ `lasate` se numara pe TOATE, nu doar pe cele aratate: „3 produse” cu doua exemple e adevarat, „2 produse”
 * fiindca atatea incap pe ecran ar fi o minciuna.
 */
export function rezumatulFeeduluiCompari(
  magazin: MagazinCompari,
  produse: readonly ProdusCompari[],
  plafon: number,
): RezumatCompari {
  let inFeed = 0;
  let epuizate = 0;
  let lasate = 0;
  const exemple: ProdusLasatAfaraCompari[] = [];
  for (const p of produse) {
    const motiv = motivulLipseiDinCompari(magazin, p);
    if (motiv) {
      lasate++;
      if (exemple.length < plafon) exemple.push({ id: p.id, name: p.name, motiv });
      continue;
    }
    const articol = construiesteArticolCompari(magazin, p, (nume) => nume);
    if (!articol) continue;
    inFeed++;
    if (articol.deliveryTime === "NO") epuizate++;
  }
  return { active: produse.length, inFeed, epuizate, lasate, exemple };
}

/**
 * Numele unei categorii -> calea ei intreaga, „Parinte > Copil”, cum o cere Compari („Putem procesa categorii
 * cu structura ierarhica”).
 *
 * ⚠ Produsul isi tine categoria ca NUME, nu ca id. Cand doua categorii au acelasi nume sub parinti diferiti,
 * castiga prima din lista primita: aceeasi nedeterminare o are si vitrina, iar aici macar e mereu aceeasi.
 * ⚠ Un lant de parinti care se inchide in cerc (date stricate) se opreste dupa zece trepte, nu se invarte.
 */
export function caiDeCategorii(
  noduri: readonly { id: string; name: string | null; parent_id: string | null }[],
): Map<string, string> {
  const dupaId = new Map(noduri.map((n) => [n.id, n]));
  const cai = new Map<string, string>();
  for (const nod of noduri) {
    const nume = text(nod.name);
    if (!nume || cai.has(nume)) continue;
    const bucati = [nume];
    const vazute = new Set([nod.id]);
    let parinte = nod.parent_id ? dupaId.get(nod.parent_id) : undefined;
    while (parinte && !vazute.has(parinte.id) && bucati.length < 10) {
      vazute.add(parinte.id);
      const numeParinte = text(parinte.name);
      if (numeParinte) bucati.unshift(numeParinte);
      parinte = parinte.parent_id ? dupaId.get(parinte.parent_id) : undefined;
    }
    cai.set(nume, bucati.join(" > "));
  }
  return cai;
}

/* ═══ Scrierea ═══ */

/**
 * Text pus intr-un element XML.
 *
 * ⚠ Caracterele de control (o descriere venita dintr-un import le poate avea) nu sunt XML 1.0: unul singur
 * face tot fisierul necitibil, deci tot magazinul iese din comparator pentru o litera. Se scot, nu se scapa.
 */
function xml(sir: string): string {
  return sir
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function el(nume: string, valoare?: string): string {
  return valoare ? `<${nume}>${xml(valoare)}</${nume}>` : "";
}

/** Feedul intreg, in forma „<products><product>…</product></products>” ceruta de Compari. */
export function serializeazaFeedCompari(articole: readonly ArticolCompari[]): string {
  const corp = articole.map((a) =>
    "<product>"
    + el("identifier", a.identifier)
    + el("manufacturer", a.manufacturer)
    + el("name", a.name)
    + el("category", a.category)
    + el("product_url", a.productUrl)
    + el("price", a.price)
    + el("productnumber", a.productNumber)
    + el("ean_code", a.eanCode)
    + el("image_url", a.imageUrl)
    + el("description", a.description)
    + el("delivery_time", a.deliveryTime)
    + el("delivery_cost", a.deliveryCost)
    + "</product>",
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<products>\n${corp}${corp ? "\n" : ""}</products>\n`;
}
