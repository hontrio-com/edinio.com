// Shared (non-"use server") offers logic: storefront resolution + pricing. The
// resolve functions take a Supabase client (the admin client on the storefront)
// exactly like expandBundleStock in bundles.ts, so they run from server components
// and server actions.
//
// Only the Faza 1 offer types are resolved here (frequently_bought, cross_sell,
// order_bump). Rule types (volume/bogo/gift/spend_reward) and post_purchase are
// stored but not yet evaluated — resolving them is Faza 2/3.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { hasVariants } from "@/lib/storefront/variants";
import { type BumpItem } from "@/lib/offers/bump-pricing";
import { pretulSetului } from "@/lib/offers/fbt-pricing";
import {
  cereArboreleDeCategorii, esteUuid, expandarePeOferta, normalizeazaIds,
  opresteComanda, pretuiesteOfertele,
  triggerMatchesCart, triggerMatchesProduct, withinWindow,
  MAX_BUMPURI_AFISATE,
  type MotivRefuz, type OfertaCuReguli,
} from "@/lib/offers/offer-pricing";
import {
  parseOfferTrigger, parseOfferConfig, parseOfferDisplay,
  defaultTitleFor, isOfferType, PHASE1_OFFER_TYPES,
  type OfferType, type OfferConfig, type OfferTrigger, type OfferDisplay,
  type OfferProduct, type ResolvedOffer,
} from "./offer.types";

type Client = SupabaseClient<Database>;

function firstImage(images: unknown): string | null {
  return Array.isArray(images) && images.length ? String(images[0]) : null;
}

// The minimal anchor-product shape needed to match triggers + price an FBT set.
export interface OfferAnchor {
  id: string;
  category: string | null;
  price: number;
}

interface LoadedOffer {
  id: string;
  type: OfferType;
  trigger: OfferTrigger;
  config: OfferConfig;
  display: OfferDisplay;
}

// `withinWindow`, `triggerMatchesProduct` si `triggerMatchesCart` stau in
// `offer-pricing.ts`: sunt reguli fara baza de date, folosite si la afisare, si
// la incasare, deci au voie sa existe o singura data si sa fie testate.

// Load + parse the store's active, in-window, Faza-1 offers (highest priority first).
async function loadActiveOffers(admin: Client, businessId: string): Promise<LoadedOffer[]> {
  const { data } = await admin
    .from("offers")
    .select("id, type, trigger, config, display, priority, starts_at, ends_at")
    .eq("business_id", businessId)
    .eq("is_active", true)
    // Cheie secundara pe id: fara ea, doua oferte cu aceeasi prioritate veneau in
    // ordinea arbitrara a bazei, iar magazinul putea arata alt subset la fiecare
    // incarcare — de cand lista de bump-uri se si taie, ordinea decide ce se vede.
    .order("priority", { ascending: false })
    .order("id", { ascending: true });
  const nowMs = Date.now();
  return (data ?? [])
    .filter((o) => isOfferType(o.type) && PHASE1_OFFER_TYPES.includes(o.type as OfferType))
    .filter((o) => withinWindow(o.starts_at, o.ends_at, nowMs))
    .map((o) => ({
      id: o.id,
      type: o.type as OfferType,
      trigger: parseOfferTrigger(o.trigger),
      config: parseOfferConfig(o.config),
      display: parseOfferDisplay(o.display, o.type as OfferType),
    }));
}

/**
 * Arborele de categorii al magazinului, citit O SINGURA DATA pe cerere.
 *
 * Coborarea in subarbore sta in `extindeCategoriile` (pur, deci testabil) si se
 * face separat pentru fiecare oferta: o multime comuna tuturor ofertelor aprindea
 * oferta unei categorii pe produsele alteia.
 */
async function incarcaArborele(
  admin: Client, businessId: string,
): Promise<{ randuri: { id: string; name: string; parent_id: string | null }[]; eroare: boolean }> {
  const { data, error } = await admin
    .from("categories").select("id, name, parent_id").eq("business_id", businessId);
  return { randuri: data ?? [], eroare: !!error };
}

function toOfferProduct(p: {
  id: string; name: string; slug: string | null; price: number | string;
  compare_at_price: number | string | null; images: unknown;
  track_inventory: boolean; stock_quantity: number | null; page_sections?: unknown;
}): OfferProduct {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: Number(p.price) || 0,
    compareAtPrice: p.compare_at_price != null ? Number(p.compare_at_price) : null,
    imageUrl: firstImage(p.images),
    outOfStock: p.track_inventory && p.stock_quantity !== null && p.stock_quantity <= 0,
    hasVariants: hasVariants(p.page_sections),
  };
}

// `category` intra aici pentru re-evaluarea de la comanda: declansatoarele pe
// categorii au nevoie de ea, si asa se ia dintr-o singura interogare, impreuna
// cu preturile si stocul.
const OFFER_PRODUCT_COLS =
  "id, name, slug, price, compare_at_price, images, is_bundle, is_active, track_inventory, stock_quantity, page_sections, category";

// Resolve product ids to authoritative display data. Skips missing, inactive,
// bundle, and excluded products; preserves the requested order.
async function fetchOfferProducts(
  admin: Client, businessId: string, ids: string[], excludeIds: Set<string>,
): Promise<OfferProduct[]> {
  const wanted = [...new Set(ids)].filter((id) => !excludeIds.has(id));
  if (wanted.length === 0) return [];
  const { data } = await admin
    .from("products").select(OFFER_PRODUCT_COLS)
    .eq("business_id", businessId).in("id", wanted);
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  const out: OfferProduct[] = [];
  for (const id of wanted) {
    const p = byId.get(id);
    if (!p || p.is_bundle || !p.is_active) continue;
    out.push(toOfferProduct(p));
  }
  return out;
}

// Auto cross-sell: products from the anchor's category (active, non-bundle), newest first.
async function fetchCategoryProducts(
  admin: Client, businessId: string, categorii: Set<string>, excludeIds: Set<string>, limit: number,
): Promise<OfferProduct[]> {
  if (categorii.size === 0) return [];
  const { data } = await admin
    .from("products").select(OFFER_PRODUCT_COLS)
    .eq("business_id", businessId).in("category", [...categorii])
    .eq("is_active", true).eq("is_bundle", false)
    .order("created_at", { ascending: false })
    .limit(limit + excludeIds.size);
  const out: OfferProduct[] = [];
  for (const p of data ?? []) {
    if (excludeIds.has(p.id)) continue;
    out.push(toOfferProduct(p));
    if (out.length >= limit) break;
  }
  return out;
}

// Combined price for a set of products (FBT anchor + companions, or a single bump).
// Formula sta in `fbt-pricing.ts`, ca afisarea si incasarea sa nu poata apuca pe
// drumuri diferite.
function computeSetPricing(prices: number[], config: OfferConfig): ResolvedOffer["pricing"] {
  return pretulSetului(prices, config);
}

/**
 * Offers to show on a product page (PDP): "cumparate frecvent impreuna" (FBT) and
 * "merge bine cu" (cross_sell) that target this product. FBT returns combined
 * pricing over the anchor + in-stock companions; cross_sell is a pure recommendation.
 * The anchor itself is always excluded from the recommended list.
 */
export async function resolveProductOffers(
  admin: Client, businessId: string, anchor: OfferAnchor,
): Promise<ResolvedOffer[]> {
  const offers = await loadActiveOffers(admin, businessId);
  // O singura citire a arborelui de categorii, coborata separat pentru fiecare
  // oferta: o multime comuna aprindea oferta unei categorii pe produsele alteia.
  const extinsele = expandarePeOferta(
    offers.some(cereArboreleDeCategorii) ? (await incarcaArborele(admin, businessId)).randuri : [],
  );
  const applicable = offers.filter(
    (o) =>
      (o.type === "frequently_bought" || o.type === "cross_sell") &&
      o.display.surfaces.includes("product_page") &&
      triggerMatchesProduct(o.trigger, anchor, extinsele(o)),
  );
  if (applicable.length === 0) return [];

  const exclude = new Set([anchor.id]);
  const resolved: ResolvedOffer[] = [];
  for (const o of applicable) {
    /*
     * Bazinul de recomandare: ce a ales COMERCIANTUL, nu categoria-frunza a
     * produsului. Un magazin care declanseaza pe „Imbracaminte Femei" si are o
     * singura rochie n-avea ce recomanda — chiar rochia din care se pornea era
     * exclusa, deci oferta disparea. Cu declansator pe categorii se cauta in tot
     * subarborele ales; la „toate" sau pe produse ramane categoria produsului.
     */
    const bazin = extinsele(o) ?? new Set(anchor.category ? [anchor.category] : []);
    const products = o.type === "cross_sell" && o.config.autoByCategory
      ? await fetchCategoryProducts(admin, businessId, bazin, exclude, o.config.maxProducts)
      : (await fetchOfferProducts(admin, businessId, o.config.productIds, exclude)).slice(0, o.config.maxProducts);
    if (products.length === 0) continue;

    const base: ResolvedOffer = {
      id: o.id,
      type: o.type,
      title: o.config.title || defaultTitleFor(o.type),
      buttonLabel: o.config.buttonLabel,
      style: o.display.style,
      products,
    };
    // FBT: combined price over the anchor + all in-stock companions (an FBT you
    // cannot fully buy is pointless, so out-of-stock companions are dropped).
    // Produsele cu variante ies si ele: setul se cumpara dintr-o apasare, deci
    // n-are unde sa intrebe ce marime, iar fara alegere ar intra in comanda la
    // pretul de baza si serverul ar respinge-o.
    if (o.type === "frequently_bought") {
      const buyable = products.filter((p) => !p.outOfStock && !p.hasVariants);
      if (buyable.length === 0) continue;
      base.products = buyable;
      base.pricing = computeSetPricing([anchor.price, ...buyable.map((p) => p.price)], o.config);
    }
    resolved.push(base);
  }
  return resolved;
}

/**
 * Offers for the cart / checkout surfaces: order bumps (checkout) and cart
 * cross-sell (cart) that target anything already in the cart. Products already in
 * the cart are excluded. Bump offers carry per-product discounted pricing.
 */
export async function resolveCartOffers(
  admin: Client, businessId: string, cartProductIds: string[], surface: "cart" | "checkout",
): Promise<ResolvedOffer[]> {
  if (cartProductIds.length === 0) return [];
  const offers = await loadActiveOffers(admin, businessId);
  // Need cart products' categories to evaluate category-scoped triggers.
  const { data: cartRows } = await admin
    .from("products").select("id, category")
    .eq("business_id", businessId).in("id", [...new Set(cartProductIds)]);
  const cartProducts = (cartRows ?? []).map((r) => ({ id: r.id, category: r.category }));

  // O singura citire a arborelui de categorii, coborata separat pentru fiecare
  // oferta: o multime comuna aprindea oferta unei categorii pe produsele alteia.
  const extinsele = expandarePeOferta(
    offers.some(cereArboreleDeCategorii) ? (await incarcaArborele(admin, businessId)).randuri : [],
  );

  const wantType: OfferType = surface === "checkout" ? "order_bump" : "cross_sell";
  const applicable = offers.filter(
    (o) => o.type === wantType && o.display.surfaces.includes(surface) && triggerMatchesCart(o.trigger, cartProducts, extinsele(o)),
  );
  if (applicable.length === 0) return [];

  const exclude = new Set(cartProductIds);
  const resolved: ResolvedOffer[] = [];
  for (const o of applicable) {
    // „Alege automat produse din aceeasi categorie" mergea doar pe pagina de
    // produs: in cos se cerea lista de id-uri, care la ofertele automate e
    // goala, deci oferta disparea tacut din toate cele patru variante de cos.
    // Categoria se ia din primul produs din cos care declanseaza oferta.
    // Acelasi bazin ca pe pagina de produs: alegerea comerciantului, cu tot
    // subarborele ei. Cu categoria-frunza a produsului din cos, un magazin cu un
    // singur produs pe categorie nu putea recomanda niciodata nimic.
    const declansator = cartProducts.find((p) => triggerMatchesProduct(o.trigger, p, extinsele(o)) && p.category);
    const bazin = extinsele(o) ?? new Set(declansator?.category ? [declansator.category] : []);
    const products = o.type === "cross_sell" && o.config.autoByCategory
      ? await fetchCategoryProducts(admin, businessId, bazin, exclude, o.config.maxProducts)
      : (await fetchOfferProducts(admin, businessId, o.config.productIds, exclude)).slice(0, o.config.maxProducts);
    if (products.length === 0) continue;

    const base: ResolvedOffer = {
      id: o.id,
      type: o.type,
      title: o.config.title || defaultTitleFor(o.type),
      buttonLabel: o.config.buttonLabel,
      style: o.display.style,
      products,
    };
    // Order bump: a single product with its own discounted price.
    //
    // Nu primul produs din lista, ci primul care poate fi luat dintr-o apasare:
    // unul epuizat trecea de afisare si abia la ultimul clic serverul respingea
    // TOATA comanda, iar unul cu variante intra fara varianta, la pretul de
    // baza. Bump-ul n-are cum sa intrebe nimic — de aceea alege doar ce e gata
    // de adaugat.
    if (o.type === "order_bump") {
      const p = products.find((x) => !x.outOfStock && !x.hasVariants);
      if (!p) continue;
      base.products = [p];
      base.pricing = computeSetPricing([p.price], o.config);
    }
    resolved.push(base);
  }
  // Magazinul nu arata mai multe bump-uri decat accepta comanda. Altfel un
  // comerciant cu noua oferte pe acelasi cos ar fi pus clientul in situatia sa
  // bifeze tot, iar serverul sa-i refuze comanda pentru un plafon despre care
  // interfata nu stia nimic.
  return surface === "checkout" ? resolved.slice(0, MAX_BUMPURI_AFISATE) : resolved;
}

export type { BumpItem };

/* ─── Re-evaluarea ofertelor la plasarea comenzii ─────────────────────────── */

/**
 * Un singur mesaj pentru toate motivele de refuz. Motivele sunt schimbari facute
 * de comerciant, la care clientul n-are ce raspunde decat reincarcand, iar unul
 * granular i-ar spune unui atacator exact ce verificare a picat.
 */
const OFERTA_INDISPONIBILA =
  "Oferta pe care ai acceptat-o nu mai este disponibila. Reincarca pagina si incearca din nou.";

/** Cand nu am PUTUT verifica oferta (baza a cazut), raspunsul e sa mai incerce, nu sa reincarce. */
const OFERTA_NEVERIFICATA =
  "Nu am putut verifica oferta acceptata. Te rugam incearca din nou in cateva momente.";

export interface ContextOferte {
  /**
   * Comanda directa: produsul din formular, cu AMBELE preturi de care are nevoie
   * setul „cumparate frecvent impreuna" — cel de catalog, cu care s-a calculat
   * economia aratata pe card, si cel unitar chiar platit (varianta aleasa), dupa
   * care se imparte economia. `null` pe calea cosului, care n-are ancora.
   */
  anchor: { productId: string; basePrice: number; unitPrice: number } | null;
  /** Produsele comenzii pentru care clientul a ales o varianta — vin sigur din cos. */
  cuVariantaAleasa?: Set<string>;
}

export interface RezultatOferte {
  items: BumpItem[];
  savings: number;
  applied: string[];
  rejected: { id: string; motiv: MotivRefuz }[];
  /** Cand e prezent, comanda se OPRESTE cu mesajul asta. */
  error?: string;
}

/**
 * Pretul ofertelor acceptate, RE-EVALUAT integral pe server.
 *
 * Pana acum existau doua functii (`applyBumpPricing` si `applyFbtPricing`) care
 * citeau din `offers` doar `id, type, config, starts_at, ends_at`: `trigger` si
 * `display` nici nu ajungeau in memorie. Nu se verifica deci nici daca oferta se
 * aprinde pe comanda asta, nici daca se arata pe suprafata de unde vine comanda,
 * si se repretuia ORICE linie al carei produs aparea in `config.productIds` —
 * fara regulile pe care le aplica magazinul cand alege ce produs sa arate
 * (primele `maxProducts`, doar cele cu stoc si fara variante). Id-ul ofertei
 * ajunge in browser prin `getCheckoutBumps`, deci oricine il putea trimite pe o
 * comanda straina si incasa reducerea.
 *
 * Acum se reface tot drumul magazinului, cu ACELEASI functii, iar o oferta care
 * nu se mai poate justifica OPRESTE comanda in loc sa dispara in tacere: bump-ul
 * nu promite doar un pret, ci adauga un produs, si a-l lasa in comanda la pretul
 * intreg inseamna ca ecranul scria una si curierul incaseaza alta. Exact
 * tratamentul cuponului respins. Singura exceptie e „lipsa_din_comanda": acolo
 * nu s-a promis nimic si nu s-a miscat niciun leu.
 *
 * Cost: doua interogari, exact cat cereau cele doua functii inlocuite (care
 * citeau de doua ori aceleasi randuri), plus una pe arborele de categorii doar
 * daca vreo oferta acceptata se declanseaza pe categorii.
 */
export async function applyOfferPricing(
  admin: Client,
  businessId: string,
  acceptedOfferIds: string[] | undefined,
  items: BumpItem[],
  ctx: ContextOferte,
): Promise<RezultatOferte> {
  const oprit = (rejected: { id: string; motiv: MotivRefuz }[], error?: string): RezultatOferte =>
    ({ items, savings: 0, applied: [], rejected, error });

  const { ids, preaMulte } = normalizeazaIds(acceptedOfferIds);
  if (ids.length === 0) return oprit([]);
  if (preaMulte) {
    return oprit(ids.map((id) => ({ id, motiv: "prea_multe" as const })), OFERTA_INDISPONIBILA);
  }

  const { data, error } = await admin
    .from("offers")
    .select("id, type, trigger, config, display, priority, starts_at, ends_at")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .in("id", ids);
  // O interogare cazuta NU inseamna „oferta nu mai e valabila": fara `error`
  // citit, `data` null transforma orice id revendicat in „inexistenta" si o pana
  // de o secunda a bazei ar refuza comenzi spunandu-i clientului sa reincarce
  // pagina, cand singurul raspuns corect e sa mai incerce o data.
  if (error) return oprit([], OFERTA_NEVERIFICATA);

  const rejected: { id: string; motiv: MotivRefuz }[] = [];
  const randuri = (data ?? []).filter((r) => isOfferType(r.type));
  const gasite = new Set(randuri.map((r) => r.id));
  for (const id of ids) if (!gasite.has(id)) rejected.push({ id, motiv: "inexistenta" });

  const oferte: OfertaCuReguli[] = randuri.map((r) => ({
    id: r.id,
    type: r.type as OfferType,
    trigger: parseOfferTrigger(r.trigger),
    config: parseOfferConfig(r.config),
    display: parseOfferDisplay(r.display, r.type as OfferType),
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    priority: Number(r.priority) || 0,
  }));

  // O SINGURA interogare de produse, peste reuniunea de id-uri: liniile comenzii
  // (pentru declansator), ancora, si tot ce ofera ofertele revendicate (pentru
  // pret, stoc, variante si pachet).
  const idProduse = new Set<string>(items.map((i) => i.product_id).filter(esteUuid));
  if (esteUuid(ctx.anchor?.productId)) idProduse.add(ctx.anchor!.productId);
  for (const o of oferte) for (const pid of o.config.productIds) if (esteUuid(pid)) idProduse.add(pid);
  const produseCerute = idProduse.size
    ? await admin.from("products").select(OFFER_PRODUCT_COLS)
        .eq("business_id", businessId).in("id", [...idProduse])
    : null;
  if (produseCerute?.error) return oprit([], OFERTA_NEVERIFICATA);
  const randuriProduse = produseCerute?.data ?? [];

  const categoriaLui = new Map<string, string | null>();
  const oferibile = new Map<string, OfferProduct>();
  for (const p of randuriProduse) {
    categoriaLui.set(p.id, p.category);
    // Aceleasi doua conditii ca `fetchOfferProducts`: ce nu se poate oferi la
    // afisare nu se poate nici pretui la incasare.
    if (p.is_active && !p.is_bundle) oferibile.set(p.id, toOfferProduct(p));
  }

  // La AFISARE, un arbore necitit inseamna cel mult o oferta care nu se arata; la
  // INCASARE ar insemna un declansator evaluat pe date lipsa, deci un refuz cu
  // mesajul gresit. De aceea aici pana se spune pe fata.
  const arbore = oferte.some(cereArboreleDeCategorii)
    ? await incarcaArborele(admin, businessId)
    : { randuri: [], eroare: false };
  if (arbore.eroare) return oprit([], OFERTA_NEVERIFICATA);
  const extinsele = expandarePeOferta(arbore.randuri);

  const cuCategorie = (id: string) => ({ id, category: categoriaLui.get(id) ?? null });
  const out = items.map((i) => ({ ...i }));
  const rez = pretuiesteOfertele({
    oferte,
    linii: out,
    ctx: {
      ancora: ctx.anchor ? cuCategorie(ctx.anchor.productId) : null,
      produse: [...new Set([...(ctx.anchor ? [ctx.anchor.productId] : []), ...items.map((i) => i.product_id)])]
        .map(cuCategorie),
      cuVariantaAleasa: ctx.cuVariantaAleasa,
    },
    oferibile,
    ancora: { basePrice: ctx.anchor?.basePrice ?? 0, unitPrice: ctx.anchor?.unitPrice ?? 0 },
    extinsele,
    nowMs: Date.now(),
  });

  rejected.push(...rez.rejected);
  if (opresteComanda(rejected)) return oprit(rejected, OFERTA_INDISPONIBILA);

  return { items: out, savings: rez.savings, applied: rez.applied, rejected };
}
