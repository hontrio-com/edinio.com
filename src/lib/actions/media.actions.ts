"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deleteFromR2, r2KeyFromUrl } from "@/lib/r2";
import { logError } from "@/lib/error-logger";
import { collectR2Urls, inferMediaType, inferFolder } from "@/lib/media/scan";
import type { Database } from "@/types/database.types";

export type MediaRow = Database["public"]["Tables"]["media_library"]["Row"];

export interface UsageRef {
  kind: "product" | "page" | "store";
  id: string | null;
  label: string;
}
export type UsageMap = Record<string, UsageRef[]>;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type BizCtx =
  | { ok: false; error: string }
  | { ok: true; supabase: SupabaseServerClient; userId: string; businessId: string };

/** Resolve the caller's most recent business id (same pattern as the editor page). */
async function resolveBusiness(): Promise<BizCtx> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nu esti autentificat." };
  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!biz) return { ok: false, error: "Magazin negasit." };
  return { ok: true, supabase, userId: user.id, businessId: biz.id };
}

// Path segments that are NOT store media and must stay out of the library
// (support-ticket attachments, platform announcements). They flow through the same
// upload helpers but belong to support chat / admin, not a store's catalog.
const NON_STORE_KEY_SEGMENTS = ["/support/", "/announcements/"];
function isStoreMediaKey(key: string): boolean {
  const probe = `/${key}`;
  return !NON_STORE_KEY_SEGMENTS.some((s) => probe.includes(s));
}

// A key is "owned" by the caller only if it lives in their R2 namespace: standard
// uploads are `{bucket}/{userId}/…`; bulk/import product images are
// `products/{businessId}/…`. This gates R2 deletion so a crafted media_library row
// pointing at another tenant's key (URLs are public on storefronts) cannot delete
// that tenant's file from storage.
function keyOwnedBy(key: string, userId: string, businessId: string): boolean {
  const parts = key.split("/");
  if (parts[1] === userId) return true;
  if (parts[0] === "products" && parts[1] === businessId) return true;
  return false;
}

/* ─── Register (called after every successful upload) ─────────────────────────── */

export interface RegisterMediaInput {
  url: string;
  type?: "image" | "video";
  mimeType?: string | null;
  fileName?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  folder?: string | null;
}

/**
 * Insert a freshly uploaded file into the library. Idempotent: a conflict on
 * (business_id, r2_key) is ignored so existing rows (and their SEO metadata) are
 * never clobbered. Best-effort — never throws into the upload path.
 */
export async function registerMedia(input: RegisterMediaInput): Promise<{ ok: boolean }> {
  try {
    const ctx = await resolveBusiness();
    if (!ctx.ok) return { ok: false };
    const key = r2KeyFromUrl(input.url);
    if (!key) return { ok: false };
    // Keep non-store media (support attachments, announcements) out of the library.
    if (!isStoreMediaKey(key)) return { ok: false };

    const row = {
      business_id: ctx.businessId,
      user_id: ctx.userId,
      url: input.url,
      r2_key: key,
      type: input.type ?? inferMediaType(key),
      mime_type: input.mimeType ?? null,
      file_name: input.fileName ?? null,
      size_bytes: input.sizeBytes ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      duration_seconds: input.durationSeconds ?? null,
      folder: input.folder ?? inferFolder(key),
    };

    const { error } = await ctx.supabase
      .from("media_library")
      .upsert(row, { onConflict: "business_id,r2_key", ignoreDuplicates: true });
    if (error) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/* ─── List ────────────────────────────────────────────────────────────────────── */

export async function listMedia(): Promise<{ rows: MediaRow[] } | { error: string }> {
  const ctx = await resolveBusiness();
  if (!ctx.ok) return { error: ctx.error };

  // Lazy backfill: if the library is empty for this store, import existing media
  // before the first listing so the user sees their history immediately.
  const { count } = await ctx.supabase
    .from("media_library")
    .select("id", { count: "exact", head: true })
    .eq("business_id", ctx.businessId);
  if ((count ?? 0) === 0) {
    await backfillMediaLibrary();
  }

  const { data, error } = await ctx.supabase
    .from("media_library")
    .select("*")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    logError({ action: "listMedia", message: error.message, userId: ctx.userId });
    return { error: "Nu am putut incarca biblioteca." };
  }
  return { rows: data ?? [] };
}

/* ─── Update metadata (SEO) ──────────────────────────────────────────────────── */

export async function updateMediaMeta(
  id: string,
  meta: { alt_text?: string; title?: string; caption?: string; description?: string; tags?: string[] },
): Promise<{ success: true } | { error: string }> {
  const ctx = await resolveBusiness();
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase
    .from("media_library")
    .update({
      alt_text: meta.alt_text ?? null,
      title: meta.title ?? null,
      caption: meta.caption ?? null,
      description: meta.description ?? null,
      ...(meta.tags ? { tags: meta.tags } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("business_id", ctx.businessId);
  if (error) {
    logError({ action: "updateMediaMeta", message: error.message, userId: ctx.userId });
    return { error: "Nu am putut salva modificarile." };
  }
  revalidatePath("/dashboard/editor/media");
  return { success: true };
}

/* ─── Delete (the single R2 deletion authority) ──────────────────────────────── */

export async function deleteMedia(ids: string[]): Promise<{ success: true; deleted: number } | { error: string }> {
  const ctx = await resolveBusiness();
  if (!ctx.ok) return { error: ctx.error };
  if (ids.length === 0) return { success: true, deleted: 0 };

  const { data: rows, error } = await ctx.supabase
    .from("media_library")
    .select("id, r2_key")
    .in("id", ids)
    .eq("business_id", ctx.businessId);
  if (error) return { error: "Nu am putut sterge fisierele." };

  // Remove the R2 objects first (best-effort), then the rows. Only delete keys that
  // live in the caller's own R2 namespace — never another tenant's storage object.
  await Promise.all(
    (rows ?? [])
      .filter((r) => keyOwnedBy(r.r2_key, ctx.userId, ctx.businessId))
      .map((r) => deleteFromR2(r.r2_key).catch(() => {})),
  );

  const { error: delErr } = await ctx.supabase
    .from("media_library")
    .delete()
    .in("id", (rows ?? []).map((r) => r.id))
    .eq("business_id", ctx.businessId);
  if (delErr) {
    logError({ action: "deleteMedia", message: delErr.message, userId: ctx.userId });
    return { error: "Stergerea a esuat partial." };
  }
  revalidatePath("/dashboard/editor/media");
  return { success: true, deleted: rows?.length ?? 0 };
}

/* ─── Usage (on-demand; powers the delete warning + "used in" badge) ──────────── */

export async function getMediaUsage(): Promise<{ usage: UsageMap } | { error: string }> {
  const ctx = await resolveBusiness();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, businessId } = ctx;

  const usage: UsageMap = {};
  const add = (urls: Set<string>, ref: UsageRef) => {
    for (const u of urls) (usage[u] ??= []).push(ref);
  };

  const [products, pages, biz, settings] = await Promise.all([
    supabase.from("products").select("id, name, images, page_sections").eq("business_id", businessId),
    supabase.from("custom_pages").select("id, title, blocks, seo").eq("business_id", businessId),
    supabase.from("businesses").select("logo_url, cover_url, gallery").eq("id", businessId).maybeSingle(),
    supabase.from("store_settings").select("*").eq("business_id", businessId).maybeSingle(),
  ]);

  for (const p of products.data ?? []) {
    add(collectR2Urls([p.images, p.page_sections]), { kind: "product", id: p.id, label: `Produs: ${p.name}` });
  }
  for (const pg of pages.data ?? []) {
    add(collectR2Urls([pg.blocks, pg.seo]), { kind: "page", id: pg.id, label: `Pagina: ${pg.title}` });
  }
  if (biz.data) {
    add(collectR2Urls([biz.data.logo_url, biz.data.cover_url, biz.data.gallery]), {
      kind: "store", id: null, label: "Magazin (logo / copertă / galerie)",
    });
  }
  if (settings.data) {
    add(collectR2Urls(settings.data), { kind: "store", id: null, label: "Setări magazin" });
  }

  return { usage };
}

/* ─── Backfill (idempotent scan + upsert of existing media) ───────────────────── */

export async function backfillMediaLibrary(): Promise<{ success: true; added: number } | { error: string }> {
  const ctx = await resolveBusiness();
  if (!ctx.ok) return { error: ctx.error };
  const { supabase, businessId, userId } = ctx;

  const [products, pages, biz, settings, existing] = await Promise.all([
    supabase.from("products").select("images, page_sections").eq("business_id", businessId),
    supabase.from("custom_pages").select("blocks, seo").eq("business_id", businessId),
    supabase.from("businesses").select("logo_url, cover_url, gallery").eq("id", businessId).maybeSingle(),
    supabase.from("store_settings").select("*").eq("business_id", businessId).maybeSingle(),
    supabase.from("media_library").select("r2_key").eq("business_id", businessId),
  ]);

  const all = new Set<string>();
  for (const p of products.data ?? []) collectR2Urls([p.images, p.page_sections], all);
  for (const pg of pages.data ?? []) collectR2Urls([pg.blocks, pg.seo], all);
  if (biz.data) collectR2Urls([biz.data.logo_url, biz.data.cover_url, biz.data.gallery], all);
  if (settings.data) collectR2Urls(settings.data, all);

  const known = new Set((existing.data ?? []).map((r) => r.r2_key));
  const rows = [...all]
    .map((url) => ({ url, key: r2KeyFromUrl(url) }))
    .filter((x): x is { url: string; key: string } => !!x.key && !known.has(x.key))
    .map(({ url, key }) => ({
      business_id: businessId,
      user_id: userId,
      url,
      r2_key: key,
      type: inferMediaType(key),
      folder: inferFolder(key),
      file_name: key.split("/").pop() ?? null,
    }));

  if (rows.length === 0) return { success: true, added: 0 };

  const { error } = await supabase
    .from("media_library")
    .upsert(rows, { onConflict: "business_id,r2_key", ignoreDuplicates: true });
  if (error) {
    logError({ action: "backfillMediaLibrary", message: error.message, userId });
    return { error: "Importul bibliotecii a esuat." };
  }
  revalidatePath("/dashboard/editor/media");
  return { success: true, added: rows.length };
}
