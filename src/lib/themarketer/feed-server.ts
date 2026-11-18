import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { storeBaseUrl } from "@/lib/seo";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { FARA_PRODUSE_DEMO } from "@/lib/teme/produse-demo";
import { disponibilitatePachet, readBundleConfig } from "@/lib/bundles";
import { hrefBrandSegment, hrefCatalogPropriu, hrefProdus, permalinkuriDin } from "@/lib/storefront/permalinkuri";
import { slugCategorie } from "@/lib/storefront/category-href";
import { segmentBrand } from "@/lib/storefront/brand-href";
import { shopOnPage } from "@/lib/storefront/design/commerce";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import { aplicaPaginaAcasa } from "@/lib/storefront/design/pagina-acasa";
import { PLATI_ONLINE } from "@/lib/orders/vanzare-confirmata";
import { imagineCatalog } from "@/lib/facebook/catalog-feed";
import { produsXml, type ProdusFeedTM } from "./feed-produse";
import { brandXml, categorieXml, ierarhiiDupaId, ierarhieDupaNume, type CategorieTM } from "./feed-categorii";
import { comandaPentruFeed, liniiTM, type ComandaTM, type ProdusLinie } from "./comanda";
import { COLOANE_PRODUS_LINIE } from "./sync";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  FEEDURILE THEMARKETER, CITITE DIN BAZA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ IN FLUX, PAGINA CU PAGINA. Vercel refuza corpurile de raspuns peste 4,5 MB, iar un catalog cu cateva
  mii de produse (descrieri, galerii, variante) trece usor de prag. Generatorii de aici scriu bucata cu
  bucata; ruta (`ruta.ts`) le trimite pe masura ce vin.

  ⚠ UN FEED RUPT LA MIJLOC NU SE INCHIDE FRUMOS. Daca o pagina nu se poate citi, generatorul arunca, iar
  ruta inchide conexiunea cu eroare: un XML valid cu jumatate de catalog ar fi scos din recomandari
  produse care exista.
*/

type Db = SupabaseClient<Database>;

export type ContextMagazin = {
  businessId: string;
  publicat: boolean;
  baza: string;
  prefixProdus: string;
  prefixMagazin: string;
  prefixBrand: string;
  /** Magazinul are pagina de catalog (deci si pagini de categorie si de brand). */
  catalogPePagina: boolean;
  categorii: CategorieTM[];
  ierarhie: (nume: string | null) => string | null;
};

/** Cate produse pe o citire. Sub plafonul de 1000 al PostgREST. */
const PRODUSE_PE_PAGINA = 500;
/** Comenzi pe o pagina a feedului: „We recommend a maximum of 50 orders per page.” */
export const COMENZI_PE_PAGINA = 50;
/** „Only the orders from the last 3 years will be imported.” */
const ANI_IMPORT = 3;

export async function contextulMagazinului(admin: Db, businessId: string): Promise<ContextMagazin | null> {
  const [{ data: biz, error: eBiz }, { data: cats, error: eCats }] = await Promise.all([
    admin.from("businesses")
      .select("id, slug, custom_domain, is_published, store_settings(page_content, storefront_design)")
      .eq("id", businessId).maybeSingle(),
    admin.from("categories")
      .select("id, name, parent_id, image_url, is_active")
      .eq("business_id", businessId)
      .order("sort_order").order("id"),
  ]);
  if (eBiz) throw new Error(`magazinul nu s-a putut citi: ${eBiz.message}`);
  if (eCats) throw new Error(`categoriile nu s-au putut citi: ${eCats.message}`);
  if (!biz) return null;
  const b = biz as unknown as { slug: string; custom_domain: string | null; is_published: boolean | null; store_settings: unknown };
  const ss = (Array.isArray(b.store_settings) ? b.store_settings[0] : b.store_settings) as { page_content?: unknown; storefront_design?: unknown } | null;
  const prefixe = permalinkuriDin(ss?.page_content);
  const design = aplicaPaginaAcasa(
    parseStoreDesign(ss?.storefront_design ?? null, { primaryColor: "#07c527", pageContent: {}, features: {} }),
    ss?.page_content,
  );
  const categorii = ((cats ?? []) as unknown as CategorieTM[]);
  return {
    businessId,
    publicat: b.is_published === true,
    baza: storeBaseUrl({ slug: b.slug, custom_domain: b.custom_domain }),
    prefixProdus: prefixe.produs,
    prefixMagazin: prefixe.magazin,
    prefixBrand: prefixe.brand,
    catalogPePagina: shopOnPage(design),
    categorii,
    ierarhie: ierarhieDupaNume(categorii),
  };
}

export const ANTET_XML = '<?xml version="1.0" encoding="UTF-8"?>\n';

const COLOANE_PRODUS_FEED =
  "id, name, slug, description, price, compare_at_price, sku, images, category, is_bundle, track_inventory, stock_quantity, page_sections, created_at";

/** Disponibilitatea pachetelor din pagina, din componentele lor (citite intr-o singura cerere pe bucata). */
async function pacheteDisponibile(admin: Db, businessId: string, pagina: ProdusFeedTM[]): Promise<Map<string, boolean>> {
  const pachete = pagina.filter((p) => p.is_bundle);
  const rezultat = new Map<string, boolean>();
  if (pachete.length === 0) return rezultat;
  const componente = [...new Set(pachete.flatMap((p) => (readBundleConfig(p.page_sections)?.items ?? []).map((i) => i.product_id)))];
  const stari = new Map<string, { track_inventory: boolean; stock_quantity: number | null }>();
  for (const bucata of bucatiDeIduri(componente)) {
    const { data, error } = await admin.from("products")
      .select("id, track_inventory, stock_quantity")
      .eq("business_id", businessId).eq("is_active", true).or(FARA_PRODUSE_DEMO)
      .in("id", bucata);
    if (error) throw new Error(`componentele pachetelor nu s-au putut citi: ${error.message}`);
    for (const c of (data ?? []) as { id: string; track_inventory: boolean | null; stock_quantity: number | null }[]) {
      stari.set(c.id, { track_inventory: !!c.track_inventory, stock_quantity: c.stock_quantity });
    }
  }
  for (const p of pachete) {
    const d = disponibilitatePachet((readBundleConfig(p.page_sections)?.items ?? []).map((it) => {
      const c = stari.get(it.product_id);
      return { quantity: it.quantity, vandabila: !!c, track_inventory: !!c?.track_inventory, stock_quantity: c?.stock_quantity ?? null };
    }));
    rezultat.set(p.id, d.inStock);
  }
  return rezultat;
}

export async function* fluxProduse(admin: Db, ctx: ContextMagazin): AsyncGenerator<string> {
  yield `${ANTET_XML}<products>\n`;
  for (let de = 0; ; de += PRODUSE_PE_PAGINA) {
    const { data, error } = await admin.from("products")
      .select(COLOANE_PRODUS_FEED)
      .eq("business_id", ctx.businessId).eq("is_active", true).or(FARA_PRODUSE_DEMO)
      .order("id")
      .range(de, de + PRODUSE_PE_PAGINA - 1);
    if (error) throw new Error(`produsele nu s-au putut citi: ${error.message}`);
    const pagina = (data ?? []) as unknown as ProdusFeedTM[];
    const pachete = await pacheteDisponibile(admin, ctx.businessId, pagina);
    let bucata = "";
    for (const p of pagina) {
      bucata += produsXml({ ...p, pachetDisponibil: p.is_bundle ? pachete.get(p.id) ?? false : undefined }, ctx);
    }
    if (bucata) yield bucata;
    if (pagina.length < PRODUSE_PE_PAGINA) break;
  }
  yield "</products>\n";
}

export async function* fluxCategorii(ctx: ContextMagazin): AsyncGenerator<string> {
  yield `${ANTET_XML}<categories>\n`;
  const ierarhii = ierarhiiDupaId(ctx.categorii);
  const catalog = hrefCatalogPropriu(ctx.baza, ctx.prefixMagazin);
  let bucata = "";
  for (const c of ctx.categorii) {
    if (c.is_active === false) continue;
    const ierarhie = ierarhii.get(c.id);
    if (!ierarhie) continue;
    const seg = slugCategorie(c.name ?? "");
    bucata += categorieXml(c, ierarhie, ctx.catalogPePagina && seg ? `${catalog}/${seg}` : null);
  }
  yield bucata;
  yield "</categories>\n";
}

export async function* fluxBranduri(admin: Db, ctx: ContextMagazin): AsyncGenerator<string> {
  yield `${ANTET_XML}<brands>\n`;
  const { data, error } = await admin.rpc("catalog_branduri", {
    p_business: ctx.businessId,
    p_fara_imagini: false,
    p_fara_stoc_ascuns: false,
  });
  if (error) throw new Error(`brandurile nu s-au putut citi: ${error.message}`);
  const vazute = new Set<string>();
  let bucata = "";
  for (const r of (data ?? []) as { brand: string; logo_url: string | null }[]) {
    const segment = segmentBrand(r.brand);
    if (!segment || vazute.has(segment)) continue;
    vazute.add(segment);
    bucata += brandXml(
      { nume: r.brand, segment, logo: r.logo_url },
      ctx.catalogPePagina ? hrefBrandSegment(ctx.baza, segment, ctx.prefixBrand) : null,
    );
  }
  yield bucata;
  yield "</brands>\n";
}

/* ═══ FEEDUL DE COMENZI ═══ */

const COLOANE_COMANDA_FEED =
  "id, order_number, customer_name, customer_email, customer_phone, shipping_address, items, shipping_cost, total, "
  + "discount_code, discount_amount, card_discount_amount, offer_discount_amount, cod_discount_amount, cod_fee_amount, "
  + "vat_amount, status, payment_status, payment_method, created_at";

export type CerereComenzi = { pagina: number; deLa: string; panaLa: string | null };

const ZI = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parametrii feedului de comenzi: `page` (de la 1), `start_date` si `end_date` (`YYYY-MM-DD`, ca in pluginul
 * lor). Fara `start_date`: acum trei ani, cat importa theMarketer oricum. Pura.
 */
export function cerereaComenzilor(p: URLSearchParams, acum: Date = new Date()): CerereComenzi | { eroare: string } {
  const paginaBruta = (p.get("page") ?? "1").trim() || "1";
  if (!/^\d{1,6}$/.test(paginaBruta)) return { eroare: "Incorrect page" };
  /* Paginile lor pornesc de la 1 (ca `paged` in pluginul lor); un `page=0` e tot prima pagina, nu o eroare
     care ar opri importul inainte sa inceapa. */
  const pagina = Math.max(1, Number(paginaBruta));
  const minim = new Date(acum);
  minim.setUTCFullYear(minim.getUTCFullYear() - ANI_IMPORT);
  const start = (p.get("start_date") ?? "").trim();
  if (start && !ZI.test(start)) return { eroare: "Incorrect Date start_date" };
  const end = (p.get("end_date") ?? "").trim();
  if (end && !ZI.test(end)) return { eroare: "Incorrect Date end_date" };
  const deLaCerut = start ? new Date(`${start}T00:00:00Z`) : minim;
  if (Number.isNaN(deLaCerut.getTime())) return { eroare: "Incorrect Date start_date" };
  const deLa = deLaCerut < minim ? minim : deLaCerut;
  return {
    pagina,
    deLa: deLa.toISOString(),
    panaLa: end ? new Date(`${end}T23:59:59.999Z`).toISOString() : null,
  };
}

/**
 * O pagina a feedului de comenzi, ca JSON: `{"orders":{"order":[…]}}`. Pagina dupa ultima intoarce o lista
 * goala.
 *
 * ⚠ FILTRELE STAU IN INTEROGARE, nu dupa ea. theMarketer se opreste la prima pagina mai scurta decat
 * restul; o pagina subtiata in cod (o comanda de marketplace scoasa dupa citire) ar fi oprit importul la
 * jumatate.
 *   - marketplace-urile: cumparatorul lor nu e clientul comerciantului (`clientDeMarketplace`);
 *   - plata online neincasata nu e o vanzare (aceeasi regula ca la `save_order`).
 * ⚠ Ordinea e de la cea mai VECHE: o comanda noua intrata in timpul importului se adauga la coada, nu
 * muta paginile deja citite.
 */
export async function paginaComenzi(admin: Db, ctx: ContextMagazin, cerere: CerereComenzi): Promise<string> {
  let q = admin.from("orders")
    .select(COLOANE_COMANDA_FEED)
    .eq("business_id", ctx.businessId)
    .gte("created_at", cerere.deLa)
    .or("order_source->>marketplace.is.null,order_source->>marketplace.eq.")
    .or(`payment_method.not.in.(${PLATI_ONLINE.join(",")}),payment_status.in.(paid,refunded)`)
    .not("customer_email", "is", null)
    .neq("customer_email", "");
  if (cerere.panaLa) q = q.lte("created_at", cerere.panaLa);
  const de = (cerere.pagina - 1) * COMENZI_PE_PAGINA;
  const { data, error } = await q.order("created_at").order("id").range(de, de + COMENZI_PE_PAGINA - 1);
  if (error) throw new Error(`comenzile nu s-au putut citi: ${error.message}`);
  const comenzi = (data ?? []) as unknown as ComandaTM[];

  /* Produsele de azi ale tuturor liniilor din pagina, intr-o singura citire pe bucata. */
  const ids = [...new Set(comenzi.flatMap((c) => (Array.isArray(c.items) ? c.items : [])
    .map((i) => (i as { product_id?: unknown })?.product_id)
    .filter((x): x is string => typeof x === "string" && !x.startsWith("extra_"))))];
  const produse = new Map<string, ProdusLinie>();
  for (const bucata of bucatiDeIduri(ids)) {
    const { data: pr, error: ePr } = await admin.from("products").select(COLOANE_PRODUS_LINIE).eq("business_id", ctx.businessId).in("id", bucata);
    if (ePr) throw new Error(`produsele comenzilor nu s-au putut citi: ${ePr.message}`);
    for (const p of (pr ?? []) as unknown as ProdusLinie[]) produse.set(p.id, p);
  }

  const urlProdus = (p: ProdusLinie) => hrefProdus(ctx.baza, p.slug || p.id, ctx.prefixProdus);
  const imagine = (p: ProdusLinie) => {
    const prima = Array.isArray(p.images) ? p.images.map(String).find(Boolean) : undefined;
    return prima ? imagineCatalog(prima) : "";
  };
  const lista = comenzi
    .map((c) => comandaPentruFeed(c, liniiTM(c.items, produse), produse, { urlProdus, imagine, ierarhie: ctx.ierarhie, baza: ctx.baza }))
    .filter((x): x is Record<string, unknown> => x !== null);
  return JSON.stringify({ orders: { order: lista } });
}
