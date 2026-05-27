import { cache } from "react";
import { createClient } from "./server";

/**
 * Cached user lookup — deduplicated per request across all Server Components.
 * When both the dashboard layout and a page call this, only ONE auth API call is made.
 */
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});
