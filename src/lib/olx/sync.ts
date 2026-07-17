// Shared OLX sync engine — used by the cron drain (api/cron/olx-sync) and by
// the direct "publish now" server action, so both paths behave identically.
//
// Reconciliation rules per product:
//  - product deleted            -> deactivate + DELETE advert, drop local row
//  - product inactive / stoc 0  -> deactivate advert (kept on OLX, reactivable)
//  - product sellable           -> create or update advert; reactivate if it was
//                                  deactivated/expired; `limited` means the OLX
//                                  free quota is exhausted (buy packet + activate)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { ensureMerchantToken } from "./oauth";
import {
  advertCommand, createAdvert, deleteAdvert, getAdvert, isOlxError, updateAdvert,
  type OlxResult,
} from "./client";
import { isProductSellable, toOlxAdvertBody, type MappableBusiness, type MappableProduct } from "./mapping";
import type { OlxAdvert, OlxConfig } from "./types";

type Db = SupabaseClient<Database>;

export const PRODUCT_FIELDS =
  "id, name, slug, description, price, compare_at_price, images, category, is_active, track_inventory, stock_quantity";

export interface OlxSyncContext {
  token: string;
  config: OlxConfig;
  business: MappableBusiness;
}

export interface OlxAdvertRow {
  id: string;
  olx_advert_id: number | null;
  status: string;
  offer_id: string;
}

export type SyncOutcome =
  | { ok: true; action: "created" | "updated" | "deactivated" | "activated" | "deleted" | "skipped"; status?: string; url?: string | null }
  | { ok: false; permanent: boolean; error: string };

export function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function loadOlxContext(admin: Db, businessId: string): Promise<OlxSyncContext | null> {
  const { data: ss } = await admin
    .from("store_settings").select("olx_config").eq("business_id", businessId).single();
  const config = (ss?.olx_config as OlxConfig) ?? {};
  if (!config.connected || !config.refresh_token) return null;
  const tok = await ensureMerchantToken(admin, businessId, config);
  if ("error" in tok) return null;
  const { data: biz } = await admin
    .from("businesses").select("slug, custom_domain, store_name, business_name").eq("id", businessId).single();
  if (!biz) return null;
  return { token: tok.token, config: tok.config, business: biz as MappableBusiness };
}

// Retryable = network, rate-limit, auth hiccup, 5xx. Permanent = validation.
function classify(res: { error: string; status: number; validation?: unknown[] }): { permanent: boolean } {
  if (res.status === 400) return { permanent: true };
  return { permanent: false };
}

function advertPatch(advert: OlxAdvert, now: string) {
  return {
    olx_advert_id: advert.id,
    status: advert.status || "new",
    olx_url: advert.url ?? null,
    valid_to: advert.valid_to ? new Date(advert.valid_to.replace(" ", "T") + "+03:00").toISOString() : null,
    error: null,
    last_synced_at: now,
    last_status_at: now,
    updated_at: now,
  };
}

async function getRow(admin: Db, businessId: string, offerId: string): Promise<OlxAdvertRow | null> {
  const { data } = await admin
    .from("olx_adverts").select("id, olx_advert_id, status, offer_id")
    .eq("business_id", businessId).eq("offer_id", offerId).maybeSingle();
  return (data as OlxAdvertRow) ?? null;
}

async function saveError(admin: Db, businessId: string, offerId: string, productId: string | null, message: string): Promise<void> {
  const now = new Date().toISOString();
  await admin.from("olx_adverts").upsert(
    {
      business_id: businessId, offer_id: offerId, product_id: productId,
      status: "error", error: message.slice(0, 500), updated_at: now,
    } as never,
    { onConflict: "business_id,offer_id" },
  );
}

// ── Delete / deactivate / activate ──────────────────────────────────────────────

async function removeRemote(admin: Db, ctx: OlxSyncContext, businessId: string, row: OlxAdvertRow | null): Promise<SyncOutcome> {
  if (!row) return { ok: true, action: "skipped" };
  if (row.olx_advert_id) {
    // DELETE rejects `active` adverts — deactivate first (best-effort).
    if (["active", "new", "unconfirmed", "limited"].includes(row.status)) {
      await advertCommand(ctx.token, row.olx_advert_id, "deactivate");
    }
    const res = await deleteAdvert(ctx.token, row.olx_advert_id);
    if (isOlxError(res) && res.status !== 404) {
      const { permanent } = classify(res);
      if (!permanent) return { ok: false, permanent: false, error: res.error };
      // permanent (ex. invalid status persistent) — keep going and drop the row
    }
  }
  await admin.from("olx_adverts").delete().eq("id", row.id);
  return { ok: true, action: "deleted" };
}

async function deactivateRemote(admin: Db, ctx: OlxSyncContext, row: OlxAdvertRow): Promise<SyncOutcome> {
  if (!row.olx_advert_id) return { ok: true, action: "skipped" };
  const res = await advertCommand(ctx.token, row.olx_advert_id, "deactivate");
  const now = new Date().toISOString();
  if (!isOlxError(res)) {
    await admin.from("olx_adverts")
      .update({ status: "removed_by_user", error: null, last_status_at: now, updated_at: now })
      .eq("id", row.id);
    return { ok: true, action: "deactivated", status: "removed_by_user" };
  }
  // 400 = deja inactiv (invalid status) — force a status refresh instead of failing.
  if (res.status === 400) {
    await admin.from("olx_adverts").update({ last_status_at: null, updated_at: now }).eq("id", row.id);
    return { ok: true, action: "skipped" };
  }
  return { ok: false, permanent: false, error: res.error };
}

async function activateRemote(admin: Db, ctx: OlxSyncContext, row: OlxAdvertRow): Promise<SyncOutcome> {
  if (!row.olx_advert_id) return { ok: true, action: "skipped" };
  const res = await advertCommand(ctx.token, row.olx_advert_id, "activate");
  const now = new Date().toISOString();
  if (!isOlxError(res)) {
    // Activation may pass through moderation again — poll will settle it.
    await admin.from("olx_adverts")
      .update({ status: "new", error: null, last_status_at: null, updated_at: now })
      .eq("id", row.id);
    return { ok: true, action: "activated", status: "new" };
  }
  if (res.status === 400 && /limit|packet|pachet/i.test(res.error)) {
    await admin.from("olx_adverts").update({ status: "limited", updated_at: now }).eq("id", row.id);
    return { ok: false, permanent: true, error: "Cota de anunturi gratuite este epuizata. Cumpara un pachet OLX si activeaza anuntul." };
  }
  const { permanent } = classify(res);
  return { ok: false, permanent, error: res.error };
}

// ── Upsert (create/update + stock reconciliation) ───────────────────────────────

async function upsertRemote(
  admin: Db, ctx: OlxSyncContext, businessId: string,
  offerId: string, product: MappableProduct | null,
): Promise<SyncOutcome> {
  const row = await getRow(admin, businessId, offerId);

  // Product gone (or no longer loadable) -> remove the advert entirely.
  if (!product) return removeRemote(admin, ctx, businessId, row);

  // Inactive or out of stock -> deactivate but keep the advert for later.
  if (!isProductSellable(product)) {
    if (row?.olx_advert_id && ["active", "new", "unconfirmed"].includes(row.status)) {
      return deactivateRemote(admin, ctx, row);
    }
    return { ok: true, action: "skipped" };
  }

  const entry = product.category ? ctx.config.category_map?.[product.category] : undefined;
  if (!entry) {
    if (row) await saveError(admin, businessId, offerId, product.id, "Categoria produsului nu este mapata la o categorie OLX.");
    return row
      ? { ok: false, permanent: true, error: "Categoria produsului nu este mapata la o categorie OLX." }
      : { ok: true, action: "skipped" };
  }

  const body = toOlxAdvertBody(ctx.business, product, ctx.config, entry);
  const now = new Date().toISOString();

  if (row?.olx_advert_id) {
    const res: OlxResult<OlxAdvert> = await updateAdvert(ctx.token, row.olx_advert_id, body);
    if (isOlxError(res)) {
      if (res.status === 404) {
        // Advert vanished on OLX (removed manually) — recreate on next attempt.
        await admin.from("olx_adverts").update({ olx_advert_id: null, updated_at: now }).eq("id", row.id);
        return { ok: false, permanent: false, error: "Anuntul nu mai exista pe OLX - va fi recreat." };
      }
      const { permanent } = classify(res);
      if (permanent) await saveError(admin, businessId, offerId, product.id, res.error);
      return { ok: false, permanent, error: res.error };
    }
    const advert = res.data ?? ({ id: row.olx_advert_id, status: row.status } as OlxAdvert);
    await admin.from("olx_adverts").upsert(
      { business_id: businessId, offer_id: offerId, product_id: product.id, ...advertPatch(advert, now) } as never,
      { onConflict: "business_id,offer_id" },
    );
    // It was deactivated/expired and is sellable again -> reactivate.
    if (["removed_by_user", "outdated"].includes(advert.status || row.status)) {
      const freshRow = await getRow(admin, businessId, offerId);
      if (freshRow) await activateRemote(admin, ctx, freshRow);
    }
    return { ok: true, action: "updated", status: advert.status, url: advert.url ?? null };
  }

  const res: OlxResult<OlxAdvert> = await createAdvert(ctx.token, body);
  if (isOlxError(res)) {
    const { permanent } = classify(res);
    if (permanent) await saveError(admin, businessId, offerId, product.id, res.error);
    return { ok: false, permanent, error: res.error };
  }
  const advert = res.data;
  if (!advert?.id) {
    await saveError(admin, businessId, offerId, product.id, "Raspuns OLX fara ID de anunt.");
    return { ok: false, permanent: true, error: "Raspuns OLX fara ID de anunt." };
  }
  await admin.from("olx_adverts").upsert(
    { business_id: businessId, offer_id: offerId, product_id: product.id, ...advertPatch(advert, now) } as never,
    { onConflict: "business_id,offer_id" },
  );
  return { ok: true, action: "created", status: advert.status, url: advert.url ?? null };
}

// ── Public entrypoints ──────────────────────────────────────────────────────────

export interface OlxQueueItem {
  id: string;
  business_id: string;
  product_id: string | null;
  offer_id: string;
  op: string;
  attempts: number;
}

export async function processQueueItem(
  admin: Db, ctx: OlxSyncContext, item: OlxQueueItem, product: MappableProduct | null,
): Promise<SyncOutcome> {
  switch (item.op) {
    case "delete":
      return removeRemote(admin, ctx, item.business_id, await getRow(admin, item.business_id, item.offer_id));
    case "deactivate": {
      const row = await getRow(admin, item.business_id, item.offer_id);
      return row ? deactivateRemote(admin, ctx, row) : { ok: true, action: "skipped" };
    }
    case "activate": {
      const row = await getRow(admin, item.business_id, item.offer_id);
      return row ? activateRemote(admin, ctx, row) : { ok: true, action: "skipped" };
    }
    default:
      return upsertRemote(admin, ctx, item.business_id, item.offer_id, product);
  }
}

// Direct (synchronous) publish used by the dashboard's per-product actions.
export async function syncProductNow(admin: Db, ctx: OlxSyncContext, businessId: string, productId: string): Promise<SyncOutcome> {
  const { data } = await admin
    .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", businessId).maybeSingle();
  return upsertRemote(admin, ctx, businessId, productId, (data as MappableProduct | null) ?? null);
}

export async function deactivateProductNow(admin: Db, ctx: OlxSyncContext, businessId: string, productId: string): Promise<SyncOutcome> {
  const row = await getRow(admin, businessId, productId);
  return row ? deactivateRemote(admin, ctx, row) : { ok: true, action: "skipped" };
}

export async function activateProductNow(admin: Db, ctx: OlxSyncContext, businessId: string, productId: string): Promise<SyncOutcome> {
  const row = await getRow(admin, businessId, productId);
  return row ? activateRemote(admin, ctx, row) : { ok: true, action: "skipped" };
}

export async function deleteAdvertNow(admin: Db, ctx: OlxSyncContext, businessId: string, offerId: string): Promise<SyncOutcome> {
  return removeRemote(admin, ctx, businessId, await getRow(admin, businessId, offerId));
}

// Refresh one advert's status from OLX (used by the cron poll).
export async function refreshAdvertStatus(
  admin: Db, ctx: OlxSyncContext, rowId: string, olxAdvertId: number,
): Promise<void> {
  const now = new Date().toISOString();
  const res = await getAdvert(ctx.token, olxAdvertId);
  if (isOlxError(res)) {
    if (res.status === 404) {
      // Removed on OLX directly — reflect locally.
      await admin.from("olx_adverts").delete().eq("id", rowId);
      return;
    }
    await admin.from("olx_adverts").update({ last_status_at: now }).eq("id", rowId);
    return;
  }
  const advert = res.data;
  await admin.from("olx_adverts").update({
    status: advert.status || "new",
    olx_url: advert.url ?? null,
    valid_to: advert.valid_to ? new Date(advert.valid_to.replace(" ", "T") + "+03:00").toISOString() : null,
    last_status_at: now,
    updated_at: now,
  }).eq("id", rowId);
}
