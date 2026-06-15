import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Guarantees a unique product slug per store: if "tricou" is taken, returns
// "tricou-2", "tricou-3", etc. excludeProductId skips the current product on edit
// so it doesn't needlessly self-increment. Shared by product + bundle actions.
export async function resolveUniqueProductSlug(
  supabase: SupabaseClient<Database>,
  businessId: string,
  rawSlug: string | null | undefined,
  excludeProductId?: string,
): Promise<string | null> {
  const base = rawSlug?.trim() || null;
  if (!base) return null;

  const { data: rows } = await supabase
    .from("products")
    .select("id, slug")
    .eq("business_id", businessId)
    .like("slug", `${base}%`);

  const taken = new Set(
    (rows ?? [])
      .filter((r) => r.id !== excludeProductId && r.slug)
      .map((r) => r.slug as string),
  );

  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
