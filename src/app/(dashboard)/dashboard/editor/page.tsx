import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { StoreEditor } from "@/components/editor/StoreEditor";

export default async function EditorPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const { data: storeSettings } = await supabase
    .from("store_settings")
    .select("*")
    .eq("business_id", business.id)
    .single();

  return <StoreEditor business={business} storeSettings={storeSettings} />;
}
