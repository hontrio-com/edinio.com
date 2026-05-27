import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "./server";

/**
 * Cached user lookup — deduplicated per request via React.cache.
 * When layout + page both call this, only ONE auth API call is made per request.
 */
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

/**
 * Current business for user — cached 5 min in Next.js Data Cache.
 * Invalidated by revalidateTag(`business-${userId}`) in server actions.
 */
export function getCachedCurrentBusiness(userId: string) {
  return unstable_cache(
    async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("businesses")
        .select("id")
        .eq("user_id", userId)
        .order("created_at")
        .limit(1)
        .single();
      return data ?? null;
    },
    [`business-${userId}`],
    { revalidate: 300, tags: [`business-${userId}`] }
  )();
}

/**
 * Full store_settings row — cached 60 s.
 * Invalidated by revalidateTag(`store-settings-${businessId}`) in server actions.
 */
export function getCachedStoreSettings(businessId: string) {
  return unstable_cache(
    async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("store_settings")
        .select("*")
        .eq("business_id", businessId)
        .single();
      return data ?? null;
    },
    [`store-settings-${businessId}`],
    { revalidate: 60, tags: [`store-settings-${businessId}`] }
  )();
}

/**
 * User profile — cached 5 min.
 * Invalidated by revalidateTag(`profile-${userId}`) in server actions.
 */
export function getCachedProfile(userId: string) {
  return unstable_cache(
    async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("users_profile")
        .select("*")
        .eq("id", userId)
        .single();
      return data ?? null;
    },
    [`profile-${userId}`],
    { revalidate: 300, tags: [`profile-${userId}`] }
  )();
}

/**
 * All businesses for user — cached 5 min.
 * Invalidated by revalidateTag(`businesses-${userId}`) in server actions.
 */
export function getCachedBusinesses(userId: string) {
  return unstable_cache(
    async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("businesses")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    [`businesses-${userId}`],
    { revalidate: 300, tags: [`businesses-${userId}`] }
  )();
}
