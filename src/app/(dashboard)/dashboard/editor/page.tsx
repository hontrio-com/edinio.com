import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { StoreEditor } from "@/components/editor/StoreEditor";
import { MarkEditorVisited } from "@/components/dashboard/MarkEditorVisited";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

export default async function EditorPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("businesses")
    .select("*, store_settings(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!row) redirect("/dashboard");

  const { store_settings: rawSettings, ...business } = row;
  const storeSettings = Array.isArray(rawSettings)
    ? rawSettings[0] ?? null
    : rawSettings ?? null;

  // Categories windowed past the 1000-row PostgREST cap (big imported taxonomies).
  const [{ data: profile }, categories] = await Promise.all([
    supabase.from("users_profile").select("plan").eq("id", user.id).single(),
    fetchAllRows("dashboard.editor.categories", (from, to) =>
      supabase.from("categories").select("id, name, parent_id, sort_order").eq("business_id", row.id)
        .order("sort_order").order("id").range(from, to)
    ),
  ]);

  return (
    <>
      <MarkEditorVisited />
      <StoreEditor business={business} storeSettings={storeSettings} plan={profile?.plan ?? "free"} categories={categories} />
    </>
  );
}
