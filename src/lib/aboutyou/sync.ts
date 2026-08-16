// About You sync engine — shared by the cron drain (api/cron/aboutyou-sync) and
// the dashboard "publish now" actions, so both paths behave identically.
//
// Everything is async batch: we submit products/status, store the returned
// batchRequestId in aboutyou_batches, and a poll pass resolves it later. A
// separate reconcile pass reads products back (GET /products) to pick up the
// approval/rejection transitions About You makes on its own side.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AboutYouAuth, AboutYouResult } from "./client";
import {
  getPriceBatchResults, getProductBatchResults, getProducts, getRejectedProducts, getShipBatchResults,
  getStatusBatchResults, getStockBatchResults, isAboutYouError, shipOrderItems, updatePrice,
  updateProductStatus, updateStock, upsertProducts,
} from "./client";
import {
  atasezaPreturileRon, buildAboutYouItems, buildVariantPrices, stocVarianta,
  type AboutYouListingEnrichment, type AboutYouStoredMaterial, type AboutYouVariantData,
  type MappableProduct,
} from "./mapping";
import type { AboutYouBatchAck } from "./types";
import type { AboutYouConfig, AboutYouRejectionReason } from "./types";

type Db = SupabaseClient<Database>;

export const PRODUCT_FIELDS =
  "id, name, description, price, compare_at_price, images, category, sku, weight_grams, page_sections, is_active, track_inventory, stock_quantity";

export interface AboutYouSyncContext {
  auth: AboutYouAuth;
  config: AboutYouConfig;
  businessId: string;
}

export type SyncOutcome =
  | { ok: true; action: "submitted" | "published" | "removed" | "skipped"; batchRequestId?: string }
  /**
   * `status` = codul HTTP de la About You, cand esecul vine de acolo.
   *
   * Cronul decide din el daca elementul merita reincercat fara sa consume o
   * incercare (429, 5xx, retea). Ghicit din textul mesajului, ar depinde de un
   * sir pe care About You il poate schimba oricand — si atunci coada s-ar goli
   * exact cand nu trebuie.
   */
  | { ok: false; error: string; status?: number };

export function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function loadAboutYouContext(admin: Db, businessId: string): Promise<AboutYouSyncContext | null> {
  const { data: ss } = await admin
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
  const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
  if (!config.connected || !config.api_key) return null;
  return { auth: { apiKey: config.api_key, environment: config.environment }, config, businessId };
}

// ── Loaders ───────────────────────────────────────────────────────────────────
interface ListingRow {
  id: string;
  product_id: string | null;
  style_key: string;
  status: string;
  brand_id: number | null;
  category_id: number | null;
  color_id: number | null;
  attributes: unknown;
  material_composition: unknown;
  country_of_origin: string | null;
  hs_code: string | null;
  /** Momentul in care produsul chiar a plecat spre About You. `null` = doar local. */
  last_synced_at: string | null;
}

async function getListing(admin: Db, businessId: string, productId: string): Promise<ListingRow | null> {
  const { data } = await admin
    .from("aboutyou_listings")
    .select("id, product_id, style_key, status, brand_id, category_id, color_id, attributes, material_composition, country_of_origin, hs_code, last_synced_at")
    .eq("business_id", businessId).eq("product_id", productId).maybeSingle();
  return (data as ListingRow) ?? null;
}

async function getListingByStyleKey(admin: Db, businessId: string, styleKey: string): Promise<ListingRow | null> {
  const { data } = await admin
    .from("aboutyou_listings")
    .select("id, product_id, style_key, status, brand_id, category_id, color_id, attributes, material_composition, country_of_origin, hs_code, last_synced_at")
    .eq("business_id", businessId).eq("style_key", styleKey).maybeSingle();
  return (data as ListingRow) ?? null;
}

function toEnrichment(row: ListingRow): AboutYouListingEnrichment {
  return {
    brand_id: row.brand_id,
    category_id: row.category_id,
    color_id: row.color_id,
    attributes: Array.isArray(row.attributes) ? (row.attributes as number[]) : [],
    material_composition: (row.material_composition as AboutYouStoredMaterial | null) ?? null,
    country_of_origin: row.country_of_origin,
    hs_code: row.hs_code,
  };
}

async function getVariantData(admin: Db, listingId: string): Promise<AboutYouVariantData[]> {
  const { data } = await admin
    .from("aboutyou_variants")
    .select("sku, ean, size_id, second_size_id, color_id, quantity, retail_price_eur, sale_price_eur, enabled")
    .eq("listing_id", listingId);
  return (data ?? []).map((v) => ({
    sku: v.sku,
    ean: v.ean,
    size_id: v.size_id,
    second_size_id: v.second_size_id,
    color_id: v.color_id,
    quantity: v.quantity,
    retail_price_eur: v.retail_price_eur,
    sale_price_eur: v.sale_price_eur,
    enabled: v.enabled,
  }));
}

async function setListingStatus(
  admin: Db, listingId: string, status: string, extra: Record<string, unknown> = {},
): Promise<void> {
  const now = new Date().toISOString();
  await admin.from("aboutyou_listings")
    .update({ status, last_status_at: now, updated_at: now, ...extra } as never)
    .eq("id", listingId);
}

async function recordBatch(
  admin: Db, businessId: string, batchRequestId: string, kind: string, relatedIds: string[],
): Promise<void> {
  await admin.from("aboutyou_batches").upsert(
    { business_id: businessId, batch_request_id: batchRequestId, kind, status: "pending", related_ids: relatedIds as never },
    { onConflict: "business_id,batch_request_id" },
  );
}

// ── Upsert (create/update on About You) ─────────────────────────────────────────
export async function syncProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  /*
   * `data: null` inseamna DOUA lucruri diferite, si le confundam.
   *
   * Produs sters (`error === null`) — atunci da, il scoatem si de pe About You.
   * Dar o citire cazuta (timeout de instructiune, conexiune pierduta) intoarce
   * tot `data: null`, cu `error` completat. Pe acea ramura codul chema
   * `removeProductNow`: trecea produsul pe `inactive` la About You si stergea
   * randul din `aboutyou_listings`, cu tot cu variante. Un hop de retea rupea
   * definitiv o listare bine configurata.
   */
  const { data: product, error: eroareProdus } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
  if (eroareProdus) return { ok: false, error: eroareProdus.message };
  if (!product) return removeProductNow(admin, ctx, productId);

  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: false, error: "Produsul nu are configurare About You. Completează detaliile de listare mai întâi." };

  // Deactivated in Edinio -> set inactive on About You instead of relisting it.
  if ((product as { is_active?: boolean }).is_active === false) {
    if (["pending", "draft", "active", "pending_approval", "pending_active"].includes(listing.status)) {
      return setRemoteStatus(admin, ctx, productId, "inactive");
    }
    return { ok: true, action: "skipped" };
  }

  const produs = product as unknown as MappableProduct;
  const variants = atasezaPreturileRon(produs, await getVariantData(admin, listing.id));
  const built = buildAboutYouItems({
    config: ctx.config,
    product: produs,
    listing: toEnrichment(listing),
    variants,
  });
  if ("error" in built) {
    await setListingStatus(admin, listing.id, "error", { error: built.error });
    return { ok: false, error: built.error };
  }

  // POST /products/ accepta cel mult 100 de articole (`maxItems`), iar depasirea
  // respinge cererea INTREAGA, nu doar surplusul. Un produs cu peste 100 de
  // variante nu s-ar fi putut lista deloc.
  let batchRequestId: string | undefined;
  for (let i = 0; i < built.items.length; i += 100) {
    const res = await upsertProducts(ctx.auth, built.items.slice(i, i + 100));
    if (isAboutYouError(res)) {
      await setListingStatus(admin, listing.id, "error", { error: res.error });
      return { ok: false, error: res.error, status: res.status };
    }
    const id = res.data?.batchRequestId;
    if (id) {
      batchRequestId = batchRequestId ?? id;
      await recordBatch(admin, ctx.businessId, id, "product", [listing.style_key]);
    }
    if (i + 100 < built.items.length) await pause(300);
  }
  const now = new Date().toISOString();
  await setListingStatus(admin, listing.id, "pending", { error: null, last_synced_at: now });
  return { ok: true, action: "submitted", batchRequestId };
}

// ── Publish / unpublish ─────────────────────────────────────────────────────────
async function setRemoteStatus(
  admin: Db, ctx: AboutYouSyncContext, productId: string, status: "published" | "inactive" | "draft",
): Promise<SyncOutcome> {
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: false, error: "Listarea About You nu există." };
  const res = await updateProductStatus(ctx.auth, [{ style_key: listing.style_key, status }]);
  if (isAboutYouError(res)) {
    await setListingStatus(admin, listing.id, "error", { error: res.error });
    return { ok: false, error: res.error, status: res.status };
  }
  const batchRequestId = res.data?.batchRequestId;
  await setListingStatus(admin, listing.id, status === "published" ? "pending" : "inactive", { error: null });
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "status", [listing.style_key]);
  return { ok: true, action: "published", batchRequestId };
}

export function publishProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  return setRemoteStatus(admin, ctx, productId, "published");
}
export function unpublishProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  return setRemoteStatus(admin, ctx, productId, "inactive");
}

/*
 * Dezactiveaza pe About You, apoi sterge randurile locale.
 *
 * ORDINEA CONTEAZA, si esecul dezactivarii NU se poate inghiti: randul local e
 * singura urma ca produsul exista pe About You. Sters dupa o dezactivare esuata,
 * produsul ramane ACTIV pe marketplace, se vinde in continuare, iar noi nu mai
 * avem nici macar `style_key`-ul ca sa-l oprim. De aceea, daca About You nu
 * confirma dezactivarea, pastram randul si intoarcem eroare: elementul se
 * reincearca la urmatoarea trecere a cronului.
 */
async function stergeListare(
  admin: Db, ctx: AboutYouSyncContext, listing: ListingRow,
): Promise<SyncOutcome> {
  /*
   * „Exista pe About You?" se citeste din `last_synced_at`, nu din `status`.
   *
   * Pe `status` era o capcana care se inchidea singura: cand dezactivarea esua,
   * scriam `status = "error"` — iar „error" era tocmai una din valorile citite ca
   * „exista doar local". A doua incercare sarea peste dezactivare si stergea randul,
   * lasand produsul ACTIV pe About You si fara nicio urma la noi. `last_synced_at`
   * se scrie o singura data, cand produsul chiar a plecat, si nu se mai retrage.
   */
  const eDoarLocala = listing.last_synced_at == null;
  if (!eDoarLocala) {
    const res = await updateProductStatus(ctx.auth, [{ style_key: listing.style_key, status: "inactive" }]);
    if (isAboutYouError(res)) {
      await setListingStatus(admin, listing.id, "error", {
        error: `Nu am putut dezactiva produsul pe About You: ${res.error}`,
      });
      return { ok: false, error: res.error, status: res.status };
    }
  }
  await admin.from("aboutyou_listings").delete().eq("id", listing.id);
  return { ok: true, action: "removed" };
}

export async function removeProductNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  return stergeListare(admin, ctx, listing);
}

export async function removeByStyleKey(admin: Db, ctx: AboutYouSyncContext, styleKey: string): Promise<SyncOutcome> {
  const listing = await getListingByStyleKey(admin, ctx.businessId, styleKey);
  if (!listing) return { ok: true, action: "skipped" };
  return stergeListare(admin, ctx, listing);
}

// ── Batch polling (cron) ────────────────────────────────────────────────────────
interface BatchRow { id: string; batch_request_id: string; kind: string; related_ids: unknown; attempts: number }

export async function pollOpenBatches(admin: Db, ctx: AboutYouSyncContext, limit = 20): Promise<void> {
  const { data } = await admin
    .from("aboutyou_batches")
    .select("id, batch_request_id, kind, related_ids, attempts")
    .eq("business_id", ctx.businessId)
    .in("status", ["pending", "processing", "retry"])
    .order("submitted_at", { ascending: true })
    .limit(limit);
  const batches = (data ?? []) as BatchRow[];

  for (const b of batches) {
    const res =
      b.kind === "status" ? await getStatusBatchResults(ctx.auth, b.batch_request_id)
      : b.kind === "stock" ? await getStockBatchResults(ctx.auth, b.batch_request_id)
      : b.kind === "price" ? await getPriceBatchResults(ctx.auth, b.batch_request_id)
      : b.kind === "ship" ? await getShipBatchResults(ctx.auth, b.batch_request_id)
      : await getProductBatchResults(ctx.auth, b.batch_request_id);
    const now = new Date().toISOString();

    if (isAboutYouError(res)) {
      await admin.from("aboutyou_batches")
        .update({ attempts: b.attempts + 1, polled_at: now, status: b.attempts + 1 >= 6 ? "failed" : "retry" } as never)
        .eq("id", b.id);
      continue;
    }
    const result = res.data;
    if (!result || result.status === "pending" || result.status === "processing" || result.status === "retry") {
      /*
       * Un lot care nu se aseaza NU poate ramane deschis la nesfarsit.
       *
       * Selectia de mai sus ia cele mai vechi loturi deschise, in limita `limit`.
       * Un lot ramas „pending" era numarat la fiecare trecere si, fiind cel mai
       * vechi, ocupa un loc pentru totdeauna: cu destule astfel de loturi, cele
       * noi nu mai ajungeau niciodata sa fie interogate. Cronul ruleaza din minut
       * in minut, deci 120 de incercari inseamna ca About You a avut doua ore sa
       * raspunda. Dupa atat, lotul se inchide ca esuat si eliberam locul.
       */
      const incercari = b.attempts + 1;
      const abandonat = incercari >= 120;
      await admin.from("aboutyou_batches").update({
        attempts: incercari,
        polled_at: now,
        ...(abandonat
          ? { status: "failed", result_summary: { status: result?.status ?? "necunoscut", abandonat: true } as never }
          : {}),
      } as never).eq("id", b.id);
      if (abandonat && (b.kind === "product" || b.kind === "status")) {
        const styleKeys = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
        for (const sk of styleKeys) {
          const listing = await getListingByStyleKey(admin, ctx.businessId, sk);
          if (listing && listing.status === "pending") {
            await setListingStatus(admin, listing.id, "error", {
              error: "About You nu a finalizat procesarea. Încearcă din nou.",
            });
          }
        }
      }
      continue;
    }

    // Completed or failed: aggregate per-style errors and settle the batch.
    const styleKeys = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
    const errors = (result.items ?? []).filter((it) => !it.success).flatMap((it) => it.errors ?? []);
    const hardFail = result.status === "failed" || errors.length > 0;

    /*
     * Loturile de expediere isi aseaza propria comanda.
     *
     * `shipOrderNow` lasa comanda pe `ship_pending`; abia aici stim daca About
     * You a acceptat. Fara pasul asta, o expediere respinsa ramanea marcata ca
     * reusita si nimeni n-o mai relua — clientul astepta un colet despre care
     * marketplace-ul nu stia nimic.
     */
    if (b.kind === "ship") {
      const orderIds = Array.isArray(b.related_ids) ? (b.related_ids as string[]) : [];
      for (const oid of orderIds) {
        await admin.from("aboutyou_orders")
          .update({
            status: hardFail ? "ship_failed" : "shipped",
            last_synced_at: now,
            updated_at: now,
          } as never)
          .eq("business_id", ctx.businessId).eq("order_id", oid);
      }
    }

    // Only catalog batches (product create/update, status) reflect onto the
    // listing status; stock/price batches are transient and just settle.
    if (b.kind === "product" || b.kind === "status") {
      for (const sk of styleKeys) {
        const listing = await getListingByStyleKey(admin, ctx.businessId, sk);
        if (!listing) continue;
        if (hardFail) {
          await setListingStatus(admin, listing.id, "error", { error: errors.slice(0, 5).join("; ").slice(0, 500) || "Eroare la procesarea pe About You." });
        } else if (b.kind === "product" && listing.status === "pending") {
          // Product accepted; it exists as a draft on About You until published.
          await setListingStatus(admin, listing.id, "draft", { error: null });
        }
      }
    }
    await admin.from("aboutyou_batches")
      .update({ status: hardFail ? "failed" : "completed", polled_at: now, result_summary: { status: result.status, errors: errors.slice(0, 10) } as never })
      .eq("id", b.id);
  }
}

/*
 * ── Reconciliere (cron): citim inapoi statusurile de la About You ─────────────
 *
 * DOUA APELURI, nu unul, pentru ca sunt doua raspunsuri diferite.
 *
 * `GET /products/` da statusul, dar NU si motivul respingerii — schema lui nici
 * nu are campurile alea. Codul le citea totusi de acolo, primea `undefined` si
 * scria peste ce stia deja: dupa fiecare trecere a cronului, un produs respins
 * ramanea „respins" cu lista de motive golita. Motivele vin de la
 * `GET /products/rejected`, si doar de acolo le scriem.
 */
export async function reconcileStatuses(admin: Db, ctx: AboutYouSyncContext, maxPages = 5): Promise<void> {
  const respinse: string[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const res = await getProducts(ctx.auth, { page, per_page: 100 });
    if (isAboutYouError(res)) return;
    const items = res.data?.items ?? [];
    if (items.length === 0) break;
    const now = new Date().toISOString();
    for (const it of items) {
      if (!it.style_key) continue;
      const eRespins = it.status === "rejected";
      if (eRespins) respinse.push(it.style_key);
      await admin.from("aboutyou_listings")
        .update({
          status: it.status,
          last_status_at: now,
          updated_at: now,
          // Cand About You retrage respingerea, motivele vechi trebuie sa dispara:
          // altfel produsul apare aprobat, dar cu o eroare veche lipita de el.
          ...(eRespins ? {} : { rejection_reasons: [] as never, error: null }),
        } as never)
        .eq("business_id", ctx.businessId).eq("style_key", it.style_key);
    }
    const total = Number((res.data?.pagination as { pages?: number } | undefined)?.pages ?? 1);
    if (page >= total) break;
    await pause(250);
  }

  if (respinse.length === 0) return;
  await pause(250);

  // Limita de rata aici e 50/min, de douazeci de ori mai stransa: o singura
  // trecere paginata, nu cate o cerere per produs respins.
  const deRespins = new Set(respinse);
  for (let page = 1; page <= maxPages; page++) {
    const res = await getRejectedProducts(ctx.auth, { page, per_page: 100 });
    if (isAboutYouError(res)) return;
    const items = res.data?.items ?? [];
    if (items.length === 0) break;
    const now = new Date().toISOString();
    for (const it of items) {
      if (!it.style_key || !deRespins.has(it.style_key)) continue;
      const rejection = (it.rejection_reasons ?? []) as AboutYouRejectionReason[];
      await admin.from("aboutyou_listings")
        .update({
          rejection_reasons: (rejection as unknown) as never,
          error: it.rejection_message ?? null,
          updated_at: now,
        } as never)
        .eq("business_id", ctx.businessId).eq("style_key", it.style_key);
    }
    const total = Number((res.data?.pagination as { pages?: number } | undefined)?.pages ?? 1);
    if (page >= total) break;
    await pause(250);
  }
}

// ── Queue routing ────────────────────────────────────────────────────────────────
export interface AboutYouQueueItem {
  id: string;
  business_id: string;
  product_id: string | null;
  offer_id: string;
  op: string;
  attempts: number;
}

export async function processQueueItem(admin: Db, ctx: AboutYouSyncContext, item: AboutYouQueueItem): Promise<SyncOutcome> {
  switch (item.op) {
    case "delete":
      return removeByStyleKey(admin, ctx, item.offer_id);
    case "publish":
      return item.product_id ? publishProductNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    case "stock":
      return item.product_id ? pushStockNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    case "price":
      return item.product_id ? pushPriceNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
    case "ship":
      return shipOrderNow(admin, ctx, item.offer_id);
    default:
      // upsert: full product push (also refreshes stock + price on About You).
      return item.product_id ? syncProductNow(admin, ctx, item.product_id) : { ok: true, action: "skipped" };
  }
}

/*
 * ── Impingere dedicata de stoc / pret ────────────────────────────────────────
 *
 * Stocul se calculeaza cu ACEEASI regula ca la creare (`stocVarianta` din
 * mapping.ts). Erau doua reguli diferite pentru acelasi lucru — una la creare,
 * alta aici — iar cele doua puteau devia oricat fara ca nimic sa semnaleze.
 *
 * `valid_at` NU se trimite: fara el, About You aplica valoarea imediat, ceea ce
 * e exact ce vrem dupa o comanda. Cu el am programa o valoare in viitor si o
 * comanda intre timp ar fi suprascrisa de programare.
 */
const MAX_ITEMI_STOC_PRET = 1000;

export async function pushStockNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  const { data: product, error: eroareProdus } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
  if (eroareProdus) return { ok: false, error: eroareProdus.message };
  if (!product) return { ok: true, action: "skipped" };
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  const produs = product as unknown as MappableProduct;
  const variants = atasezaPreturileRon(produs, await getVariantData(admin, listing.id))
    .filter((v) => v.enabled && v.sku);
  if (variants.length === 0) return { ok: true, action: "skipped" };

  const items = variants.map((v) => ({
    sku: v.sku,
    quantity: Math.max(0, Math.min(1_000_000, Math.round(v.quantity ?? stocVarianta(produs, null).quantity))),
  }));

  return trimiteInTranse(admin, ctx, listing.style_key, "stock", items,
    (lot) => updateStock(ctx.auth, lot));
}

/**
 * Trimite in transe de cel mult 1000 (limita `maxItems` a schemelor de stoc si
 * pret). Peste limita, cererea INTREAGA e respinsa, nu doar surplusul.
 */
async function trimiteInTranse<T>(
  admin: Db, ctx: AboutYouSyncContext, styleKey: string, kind: "stock" | "price",
  items: T[], trimite: (lot: T[]) => Promise<AboutYouResult<AboutYouBatchAck>>,
): Promise<SyncOutcome> {
  if (items.length === 0) return { ok: true, action: "skipped" };
  let batchRequestId: string | undefined;
  for (let i = 0; i < items.length; i += MAX_ITEMI_STOC_PRET) {
    const res = await trimite(items.slice(i, i + MAX_ITEMI_STOC_PRET));
    if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
    const id = res.data?.batchRequestId;
    if (id) {
      batchRequestId = batchRequestId ?? id;
      await recordBatch(admin, ctx.businessId, id, kind, [styleKey]);
    }
    if (i + MAX_ITEMI_STOC_PRET < items.length) await pause(300);
  }
  return { ok: true, action: "submitted", batchRequestId };
}

export async function pushPriceNow(admin: Db, ctx: AboutYouSyncContext, productId: string): Promise<SyncOutcome> {
  const { data: product, error: eroareProdus } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", ctx.businessId).maybeSingle();
  // O citire cazuta nu inseamna „produs sters": elementul trebuie reincercat,
  // nu sarit tacut, altfel pretul de pe About You ramane vechi la nesfarsit.
  if (eroareProdus) return { ok: false, error: eroareProdus.message };
  if (!product) return { ok: true, action: "skipped" };
  const listing = await getListing(admin, ctx.businessId, productId);
  if (!listing) return { ok: true, action: "skipped" };
  const produs = product as unknown as MappableProduct;
  const variants = atasezaPreturileRon(produs, await getVariantData(admin, listing.id))
    .filter((v) => v.enabled && v.sku);
  if (variants.length === 0) return { ok: true, action: "skipped" };

  const items: { sku: string; price: { country_code: string; retail_price: number; sale_price?: number | null } }[] = [];
  for (const v of variants) {
    const priced = buildVariantPrices(ctx.config, produs, v);
    if ("error" in priced) return { ok: false, error: priced.error };
    for (const p of priced.prices) {
      items.push({ sku: v.sku, price: { country_code: p.country_code, retail_price: p.retail_price, sale_price: p.sale_price ?? null } });
    }
  }
  // Un item PER SKU PER TARA: cu multe marimi si mai multe tari, limita de 1000
  // se atinge repede.
  return trimiteInTranse(admin, ctx, listing.style_key, "price", items,
    (lot) => updatePrice(ctx.auth, lot));
}

// ── Fulfillment: push AWB tracking to About You (Faza 4, dropshipping) ────────────
// The About You order item integer IDs live in aboutyou_orders.items; the courier
// + tracking are derived from whichever *_awb_number the merchant generated in
// Edinio, mapped to an About You carrier_key via the store's carrier_map.
const COURIER_FIELDS: { field: string; courier: string }[] = [
  { field: "cargus_awb_number", courier: "cargus" },
  { field: "sameday_awb_number", courier: "sameday" },
  { field: "fan_courier_awb_number", courier: "fan-courier" },
  { field: "dpd_awb_number", courier: "dpd" },
  { field: "colete_awb_number", courier: "colete" },
  { field: "woot_awb_number", courier: "woot" },
  { field: "gls_awb_number", courier: "gls" },
  { field: "pallex_awb_number", courier: "pallex" },
  { field: "ecolet_awb_number", courier: "ecolet" },
  { field: "posta_awb_number", courier: "posta" },
  { field: "packeta_packet_id", courier: "packeta" },
  { field: "innoship_awb_number", courier: "innoship" },
  { field: "smartship_awb_number", courier: "smartship" },
  /* ⚠ Ultimul sosit ramane ULTIMUL in lista: bucla ia primul camp nevid, deci un
     curier nou pus in fata ar fura precedenta unui AWB emis anterior cu altul. */
  { field: "shipo_awb_number", courier: "shipo" },
  { field: "fedex_awb_number", courier: "fedex" },
  { field: "ups_awb_number", courier: "ups" },
];

export async function shipOrderNow(admin: Db, ctx: AboutYouSyncContext, orderId: string): Promise<SyncOutcome> {
  const { data: order } = await admin
    .from("orders")
    /* ⚠ Coloana trebuie ceruta AICI, nu doar adaugata in `COURIER_FIELDS`: ce nu
       se selecteaza nu ajunge in `row`, iar bucla de mai jos ar cauta un camp
       inexistent si ar iesi cu „skipped" — adica un succes raportat pentru o
       comanda ramasa neexpediata la marketplace. */
    .select("id, tracking_number, cargus_awb_number, sameday_awb_number, fan_courier_awb_number, dpd_awb_number, colete_awb_number, woot_awb_number, gls_awb_number, pallex_awb_number, ecolet_awb_number, posta_awb_number, innoship_awb_number, packeta_packet_id, smartship_awb_number, shipo_awb_number, fedex_awb_number, ups_awb_number")
    .eq("id", orderId).eq("business_id", ctx.businessId).maybeSingle();
  if (!order) return { ok: true, action: "skipped" };

  const { data: ayOrder } = await admin
    .from("aboutyou_orders").select("id, items")
    .eq("business_id", ctx.businessId).eq("order_id", orderId).maybeSingle();
  if (!ayOrder) return { ok: true, action: "skipped" }; // not an About You order

  const row = order as Record<string, unknown>;
  let tracking: string | undefined;
  let courier: string | undefined;
  for (const { field, courier: c } of COURIER_FIELDS) {
    const v = row[field];
    if (typeof v === "string" && v.trim()) { tracking = v.trim(); courier = c; break; }
  }
  if (!tracking && typeof row.tracking_number === "string" && row.tracking_number.trim()) tracking = row.tracking_number.trim();
  if (!tracking) return { ok: true, action: "skipped" }; // no AWB generated yet

  const carrierKey = (courier ? ctx.config.carrier_map?.[courier] : undefined) ?? ctx.config.default_carrier_key;
  if (!carrierKey) return { ok: false, error: "Mapează curierul la un carrier About You în setări." };

  const rawItems = (ayOrder as { items?: unknown }).items;
  const items = Array.isArray(rawItems) ? (rawItems as { order_item_id?: number; status?: string }[]) : [];
  // Articolele deja anulate sau returnate nu se mai expediaza: trimise, About You
  // respinge intreaga cerere de expediere, deci s-ar bloca si celelalte.
  const orderItemIds = items
    .filter((i) => i.status !== "cancelled" && i.status !== "returned")
    .map((i) => i.order_item_id)
    .filter((x): x is number => typeof x === "number");
  if (orderItemIds.length === 0) return { ok: true, action: "skipped" };

  // return_tracking_key is REQUIRED by the ship endpoint; RO couriers issue a single
  // AWB for both directions, so we reuse the shipment tracking as the return key.
  const res = await shipOrderItems(ctx.auth, [{
    order_items: orderItemIds, carrier_key: carrierKey,
    shipment_tracking_key: tracking, return_tracking_key: tracking,
  }]);
  if (isAboutYouError(res)) return { ok: false, error: res.error, status: res.status };
  const batchRequestId = res.data?.batchRequestId;
  const now = new Date().toISOString();
  if (batchRequestId) await recordBatch(admin, ctx.businessId, batchRequestId, "ship", [orderId]);
  /*
   * Statusul devine „trimis catre About You", nu „expediat".
   *
   * Expedierea e asincrona: raspunsul de aici e doar confirmarea ca lotul a fost
   * primit. Scriind direct „shipped", o expediere pe care About You o respinge
   * mai tarziu (curier nemapat, articol deja anulat) ramanea marcata ca reusita
   * si nimeni nu o mai relua. Statusul final il pune `pollOpenBatches`, dupa ce
   * vede rezultatul lotului.
   */
  await admin.from("aboutyou_orders")
    .update({ status: "ship_pending", last_synced_at: now, updated_at: now } as never)
    .eq("id", (ayOrder as { id: string }).id);
  return { ok: true, action: "submitted", batchRequestId };
}
