import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { deleteFromR2, r2KeyFromUrl } from "@/lib/r2";

/**
 * Delete image URLs from R2 — but ONLY the ones no other product in the same
 * business still references.
 *
 * Products can share the exact same image URLs: "Duplicate product" copies the
 * `images` array by reference, so a product and its copies point at the same R2
 * objects. Deleting blindly when one of them is edited/deleted then orphans the
 * siblings' images (they keep the URL but the file is gone → 404). This guard
 * checks the live catalog first and skips any URL still in use.
 *
 * Bundles live in the same `products` table, so a single query covers both.
 * Fire-and-forget: best-effort, never throws (an unused storage object is far
 * less harmful than deleting an image another product still shows).
 */
export async function deleteOrphanImages(
  supabase: SupabaseClient<Database>,
  businessId: string,
  urls: string[],
  opts?: { excludeProductId?: string },
): Promise<void> {
  try {
    const candidates = [...new Set(urls)].filter(
      (u): u is string => typeof u === "string" && !!r2KeyFromUrl(u),
    );
    if (candidates.length === 0) return;

    let q = supabase.from("products").select("images").eq("business_id", businessId);
    if (opts?.excludeProductId) q = q.neq("id", opts.excludeProductId);
    const { data: rows } = await q;

    const stillReferenced = new Set<string>();
    for (const row of rows ?? []) {
      for (const u of ((row.images as string[] | null) ?? [])) stillReferenced.add(u);
    }

    await Promise.all(
      candidates
        .filter((url) => !stillReferenced.has(url))
        .map((url) => {
          const key = r2KeyFromUrl(url);
          return key ? deleteFromR2(key).catch(() => {}) : Promise.resolve();
        }),
    );
  } catch {
    // best-effort cleanup; leaving an orphan object is acceptable.
  }
}
