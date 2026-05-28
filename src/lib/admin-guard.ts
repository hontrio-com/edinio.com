import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("users_profile")
    .select("role, full_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (data?.role !== "admin") redirect("/dashboard");

  return { user, profile: data };
}

export async function requireAdminApi(): Promise<{ id: string; email?: string } | null> {
  const { getCachedUser: get } = await import("@/lib/supabase/cached-queries");
  const user = await get();
  if (!user) return null;

  const { createClient: create } = await import("@/lib/supabase/server");
  const supabase = await create();
  const { data } = await supabase
    .from("users_profile")
    .select("role")
    .eq("id", user.id)
    .single();

  return data?.role === "admin" ? user : null;
}
