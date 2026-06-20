import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { StoreEditor } from "@/components/editor/StoreEditor";

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

  const { data: profile } = await supabase.from("users_profile").select("plan").eq("id", user.id).single();

  return <StoreEditor business={business} storeSettings={storeSettings} plan={profile?.plan ?? "free"} />;
}
