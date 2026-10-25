import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { disponibilitatePachet, readBundleConfig } from "@/lib/bundles";
import { expandProductOffers, type MappableBusiness, type MappableProduct } from "@/lib/google-merchant/mapping";
import { offerIdVarianta } from "@/lib/google-merchant/id-oferta";
import type { GoogleMerchantConfig } from "@/lib/google-merchant/types";
import { pretulDinCatalogMinte } from "@/lib/customization/pretul-din-catalog-minte";
import { permalinkuriDin } from "@/lib/storefront/permalinkuri";
import { combinatiiActiveUnice, comboStock, parseVariants, type VariantCombo } from "@/lib/storefront/variants";
import type { Paginare } from "./api";

/**
 * `GET /api/hontrio/v1/produse`: catalogul, cu ofertele EXACT asa cum pleaca la Merchant Center.
 *
 * ═══ ⚠ O SINGURA DEFINITIE A OFERTEI: `expandProductOffers` ═══
 *
 * Hontrio leaga fiecare oferta de aici de oferta din Merchant Center si de randul ei din rapoartele
 * Google Ads (`segments.product_item_id`). Daca ID-ul, pretul sau disponibilitatea ar fi calculate a
 * doua oara aici, prima schimbare facuta intr-o parte (cum a fost ID-ul variantei taiat la 50 de
 * caractere, `id-oferta.ts`) ar fi rupt legatura fara nicio eroare: rapoartele ar fi aratat oferte
 * „necunoscute", iar Hontrio ar fi oprit reclamele unor produse care se vand.
 *
 * Deci ofertele se citesc din chiar ce ar trimite cronul `gmc-sync`, inclusiv pentru magazinele care
 * n-au Merchant Center legat (cu configurarea implicita): ID-ul nu atarna de configurare.
 *
 * ⚠ SI ACEEASI RETRAGERE: produsul al carui pret din catalog nu e cel platit (`pretulDinCatalogMinte`)
 * nu are nicio oferta, ca la Google. Hontrio n-are voie sa faca reclama unui pret pe care pagina nu-l
 * cere.
 */

type Db = SupabaseClient<Database>;

/** Cate oferte intra cel mult intr-o pagina. Vezi `paginaProduse`. */
export const PLAFON_OFERTE_PE_PAGINA = 1000;

export const COLOANE_PRODUS =
  "id, name, slug, description, price, compare_at_price, images, category, is_active, is_bundle, track_inventory, stock_quantity, weight_grams, page_sections, sku, created_at, updated_at";

export interface RandProdus extends MappableProduct {
  is_active: boolean;
  sku: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfertaHontrio {
  /** Identic cu `offerId` din Merchant Center si cu `product_item_id` din Google Ads. */
  id: string;
  /** `itemGroupId` la variante (ID-ul produsului), `null` la produsul simplu. */
  grup_id: string | null;
  /** Titlul combinatiei („Rosu / XL"), `null` la produsul simplu. */
  varianta: string | null;
  titlu: string;
  url: string;
  imagine: string | null;
  /** Pretul platit azi. */
  pret: number;
  /** Pretul taiat, cand oferta e la reducere. */
  pret_vechi: number | null;
  disponibil: boolean;
  /** Bucatile declarate, sau `null` cand stocul nu se urmareste (nelimitat). */
  stoc: number | null;
  sku: string | null;
  gtin: string | null;
  mpn: string | null;
  brand: string | null;
  etichete: Record<string, string>;
  /** Starea ofertei la Google, din ultima sincronizare Edinio (`gmc_products`), daca exista. */
  stare_google: string | null;
}

export interface ProdusHontrio {
  id: string;
  nume: string;
  activ: boolean;
  categorie: string | null;
  pachet: boolean;
  creat_la: string;
  actualizat_la: string;
  oferte: OfertaHontrio[];
  /**
   * De ce un produs ACTIV n-are nicio oferta. `null` cand are, sau cand e inactiv (atunci motivul e
   * chiar `activ: false`).
   */
  fara_oferte: "pret_neconfirmat" | null;
}

function dinMicros(v: unknown): number | null {
  const micros = Number((v as { amountMicros?: unknown } | null | undefined)?.amountMicros);
  return Number.isFinite(micros) ? Math.round(micros / 10_000) / 100 : null;
}

function sir(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * Stocul unei oferte, cu aceeasi regula ca disponibilitatea din `expandProductOffers`.
 *
 * ⚠ La varianta, campul gol inseamna „nu tin socoteala pe varianta asta" (`comboStock`), iar atunci
 * ramane stocul produsului intreg. Pachetul se scrie cu `track_inventory: false`; stocul lui e cate
 * pachete intregi ies din componente.
 */
function stocul(produs: RandProdus, combo: VariantCombo | null, maxPachet: number | null): number | null {
  if (produs.is_bundle) return maxPachet;
  if (!produs.track_inventory) return null;
  const peVarianta = combo ? comboStock(combo) : null;
  if (peVarianta !== null) return peVarianta;
  const n = Number(produs.stock_quantity);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Pura: un produs, cu ofertele lui, scris pentru Hontrio.
 *
 * @param pachet disponibilitatea pachetului din componente, calculata de apelant (`null` la produsul
 *               care nu e pachet). `max` e `Infinity` cand nicio componenta nu-si urmareste stocul.
 */
export function produsPentruHontrio(
  magazin: MappableBusiness,
  produs: RandProdus,
  config: GoogleMerchantConfig,
  pachet: { inStock: boolean; max: number } | null,
  stariGoogle: ReadonlyMap<string, string>,
): ProdusHontrio {
  const baza = {
    id: produs.id,
    nume: produs.name,
    activ: produs.is_active,
    categorie: sir(produs.category),
    pachet: !!produs.is_bundle,
    creat_la: produs.created_at,
    actualizat_la: produs.updated_at,
  };
  /* ⚠ Produsul stins nu pleaca la Google (cronul il sterge de acolo), deci nici aici n-are oferte. */
  if (!produs.is_active) return { ...baza, oferte: [], fara_oferte: null };

  const maxPachet = pachet ? (Number.isFinite(pachet.max) ? pachet.max : null) : null;
  const oferte = expandProductOffers(magazin, { ...produs, pachetDisponibil: pachet?.inStock }, config);
  if (oferte.length === 0) {
    return { ...baza, oferte: [], fara_oferte: pretulDinCatalogMinte(produs) ? "pret_neconfirmat" : null };
  }

  /* Combinatia fiecarei oferte, dupa acelasi ID pe care il scrie `expandProductOffers`. */
  const combinatii = new Map<string, VariantCombo>();
  for (const c of combinatiiActiveUnice(parseVariants(produs.page_sections))) {
    combinatii.set(offerIdVarianta(produs.id, c), c);
  }

  return {
    ...baza,
    fara_oferte: null,
    oferte: oferte.map(({ offerId, input }) => {
      const a = (input as { productAttributes?: Record<string, unknown> }).productAttributes ?? {};
      const combo = combinatii.get(offerId) ?? null;
      const pretLista = dinMicros(a.price) ?? 0;
      const pretRedus = dinMicros(a.salePrice);
      const gtins = Array.isArray(a.gtins) ? a.gtins.filter((g): g is string => typeof g === "string") : [];
      const etichete: Record<string, string> = {};
      for (let i = 0; i <= 4; i++) {
        const v = sir(a[`customLabel${i}`]);
        if (v) etichete[`custom_label_${i}`] = v;
      }
      return {
        id: offerId,
        grup_id: sir(a.itemGroupId),
        varianta: combo?.title ?? null,
        titlu: String(a.title ?? produs.name),
        url: String(a.link ?? ""),
        imagine: sir(a.imageLink),
        pret: pretRedus ?? pretLista,
        pret_vechi: pretRedus !== null ? pretLista : null,
        disponibil: a.availability === "IN_STOCK",
        stoc: stocul(produs, combo, maxPachet),
        sku: sir(combo?.sku) ?? sir(produs.sku),
        gtin: gtins[0] ?? null,
        mpn: sir(a.mpn),
        brand: sir(a.brand),
        etichete,
        stare_google: stariGoogle.get(offerId) ?? null,
      };
    }),
  };
}

/** Ce trebuie stiut despre magazin ca sa se poata scrie ofertele: linkuri, marca, configurarea Google. */
export async function contextulOfertelor(
  admin: Db, businessId: string,
): Promise<{ magazin: MappableBusiness; config: GoogleMerchantConfig } | null> {
  const [{ data: biz, error: eBiz }, { data: setari, error: eSet }] = await Promise.all([
    admin.from("businesses").select("slug, custom_domain, store_name, business_name").eq("id", businessId).maybeSingle(),
    admin.from("store_settings")
      .select("google_merchant_config, permalinks:page_content->permalinks")
      .eq("business_id", businessId).maybeSingle(),
  ]);
  if (eBiz) throw eBiz;
  if (eSet) throw eSet;
  if (!biz) return null;
  /* ⚠ Acelasi prefix de produs ca in cronul `gmc-sync` (`loadBusinessContext`): altfel linkurile difera. */
  const prefix_produs = permalinkuriDin({ permalinks: (setari as { permalinks?: unknown } | null)?.permalinks }).produs;
  const config = ((setari as { google_merchant_config?: unknown } | null)?.google_merchant_config ?? {}) as GoogleMerchantConfig;
  return { magazin: { ...(biz as Omit<MappableBusiness, "prefix_produs">), prefix_produs }, config };
}

/**
 * O pagina de produse, in ordinea `id`-ului.
 *
 * ⚠ PAGINA SE TAIE SI DUPA NUMARUL DE OFERTE, nu doar dupa produse. Un produs poate avea zeci de
 * combinatii, iar raspunsul unei functii Vercel are cel mult 4,5 MB: o suta de produse cu cate
 * cincizeci de variante l-ar fi depasit. Cand plafonul se atinge, pagina se opreste la produsul acela
 * si `urmatorul` arata de unde continua. Un produs nu se rupe niciodata intre doua pagini.
 */
export async function paginaProduse(
  admin: Db, businessId: string, p: Paginare,
): Promise<{ produse: ProdusHontrio[]; urmatorul: string | null } | null> {
  const ctx = await contextulOfertelor(admin, businessId);
  if (!ctx) return null;

  let q = admin.from("products").select(COLOANE_PRODUS).eq("business_id", businessId);
  if (p.actualizateDupa) q = q.gte("updated_at", p.actualizateDupa);
  if (p.dupa) q = q.gt("id", p.dupa);
  const { data, error } = await q.order("id", { ascending: true }).limit(p.limita);
  if (error) throw error;
  const randuri = (data ?? []) as unknown as RandProdus[];

  /*
   * Pachetele: disponibilitatea vine din componente, ca in cronul `gmc-sync`, dar cu O singura citire
   * pentru toata pagina, nu una pe pachet.
   */
  const configPachete = new Map<string, NonNullable<ReturnType<typeof readBundleConfig>>>();
  for (const r of randuri) {
    if (!r.is_bundle || !r.is_active) continue;
    const cfg = readBundleConfig(r.page_sections);
    if (cfg) configPachete.set(r.id, cfg);
  }
  const iduriComponente = [...new Set([...configPachete.values()].flatMap((c) => c.items.map((i) => i.product_id)))];
  const componente = new Map<string, { is_active: boolean; track_inventory: boolean; stock_quantity: number | null }>();
  if (iduriComponente.length) {
    const { data: comps, error: eComp } = await admin
      .from("products").select("id, is_active, track_inventory, stock_quantity")
      .eq("business_id", businessId).in("id", iduriComponente);
    if (eComp) throw eComp;
    for (const c of comps ?? []) componente.set(c.id, c);
  }

  const stariGoogle = new Map<string, string>();
  const iduri = randuri.map((r) => r.id);
  if (iduri.length) {
    const { data: gmc, error: eGmc } = await admin
      .from("gmc_products").select("offer_id, status").eq("business_id", businessId).in("product_id", iduri);
    if (eGmc) throw eGmc;
    for (const g of gmc ?? []) if (g.status) stariGoogle.set(g.offer_id, g.status);
  }

  const produse: ProdusHontrio[] = [];
  let oferte = 0;
  for (const r of randuri) {
    let pachet: { inStock: boolean; max: number } | null = null;
    if (r.is_bundle) {
      const cfg = configPachete.get(r.id);
      pachet = disponibilitatePachet((cfg?.items ?? []).map((it) => {
        const c = componente.get(it.product_id);
        return {
          quantity: it.quantity,
          vandabila: !!c && c.is_active,
          track_inventory: !!c?.track_inventory,
          stock_quantity: c?.stock_quantity ?? null,
        };
      }));
    }
    const produs = produsPentruHontrio(ctx.magazin, r, ctx.config, pachet, stariGoogle);
    produse.push(produs);
    oferte += produs.oferte.length;
    if (oferte >= PLAFON_OFERTE_PE_PAGINA) break;
  }

  const taiata = produse.length < randuri.length;
  const plina = randuri.length === p.limita;
  return { produse, urmatorul: taiata || plina ? produse[produse.length - 1].id : null };
}
