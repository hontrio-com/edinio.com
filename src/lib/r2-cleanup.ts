import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * NO-OP since the Media Library shipped.
 *
 * Previously this deleted R2 objects no longer referenced by any product. With the
 * Media Library (`src/lib/actions/media.actions.ts`) every uploaded file is now a
 * catalog entry and the library is the SINGLE authority for deleting from R2 (via
 * `deleteMedia`). Removing an image from a product / replacing a logo must only
 * UNLINK it — the file stays in the library for reuse. Auto-deleting here would
 * orphan library rows (broken thumbnails) and silently destroy reusable assets.
 *
 * Kept as a no-op (signature intact) so existing call sites compile unchanged.
 * Unused storage is cleaned up explicitly from the library UI ("nefolosite").
 */
export async function deleteOrphanImages(
  _supabase: SupabaseClient<Database>,
  _businessId: string,
  _urls: string[],
  _opts?: { excludeProductId?: string },
): Promise<void> {
  /* intentionally does nothing — see doc comment above */
}
