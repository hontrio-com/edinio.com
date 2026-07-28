import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { PagesListClient } from "@/components/pages/PagesListClient";
import type { MenuItem } from "@/lib/pages/menu";
import { cartOnPage, checkoutOnPage, shopOnPage } from "@/lib/storefront/design/commerce";
import { parseStoreDesign } from "@/lib/storefront/design/parse";

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
    supabase
      .from("store_settings")
      .select("page_content, storefront_design")
      .eq("business_id", business.id)
      .single(),
  ]);

  const menu = ((ss?.page_content as { menu?: MenuItem[] } | null)?.menu) ?? [];

  // Catalogul, cosul si finalizarea comenzii apar in lista ca pagini de sistem,
  // dar numai designul PUBLICAT spune daca sunt pagini adevarate sau raman pe
  // pagina principala, respectiv panouri peste magazin.
  const design = parseStoreDesign(ss?.storefront_design, {
    primaryColor: "#1AB554",
    pageContent: (ss?.page_content as Record<string, unknown>) ?? {},
    features: {},
  });

  return (
    <PagesListClient
      business={business}
      pages={pages ?? []}
      initialMenu={menu}
      catalogPePagina={shopOnPage(design)}
      cosPePagina={cartOnPage(design)}
      comandaPePagina={checkoutOnPage(design)}
    />
  );
}
