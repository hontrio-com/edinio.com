import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Fetch ALL auth users, paginating past the 1000-per-page API cap.
 * A single listUsers({ perPage: 1000 }) silently drops users beyond the first
 * 1000 — which previously meant they vanished from admin lists/exports and never
 * received automated emails.
 */
export async function listAllAuthUsers(client: SupabaseClient): Promise<User[]> {
  const all: User[] = [];
  const perPage = 1000;
  for (let page = 1; page <= 1000; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    const users = data?.users ?? [];
    if (error || users.length === 0) break;
    all.push(...users);
    if (users.length < perPage) break;
  }
  return all;
}
