import { cache } from "react";
import { createClient } from "./server";

/**
 * Cached user lookup — deduplicated per request via React.cache.
 * When layout + page both call this in the same render, only ONE auth API call is made.
 */
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * Fetch the user current business + full store_settings in a single JOIN query.
 * Eliminates the sequential waterfall (2 round trips) into 1.
 * React.cache deduplicates this per-request across layout and page.
 */
export const getCachedBusinessWithSettings = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, store_settings(*)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .single();
  if (!data) return { business: null, settings: null };
  const settings = Array.isArray(data.store_settings)
    ? (data.store_settings[0] ?? null)
    : (data.store_settings ?? null);
  return { business: { id: data.id }, settings };
});
