import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { PagesListClient } from "@/components/pages/PagesListClient";
import type { MenuItem } from "@/lib/pages/menu";

export default async function PagesPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!business) redirect("/dashboard");

  const [{ data: pages }, { data: ss }] = await Promise.all([
    supabase
      .from("custom_pages")
      .select("id, slug, title, is_published, updated_at")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("created_at"),
    supabase.from("store_settings").select("page_content").eq("business_id", business.id).single(),
  ]);

  const menu = ((ss?.page_content as { menu?: MenuItem[] } | null)?.menu) ?? [];

  return <PagesListClient business={business} pages={pages ?? []} initialMenu={menu} />;
}
