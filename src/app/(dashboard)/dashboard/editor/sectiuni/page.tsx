import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SectionDesignBrowser } from "@/components/store-editor/SectionDesignBrowser";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import type { DesignContext } from "@/lib/storefront/design/types";

export const metadata = { title: "Design sectiuni" };

/**
 * Catalogul de design-uri pe sectiuni.
 *
 * Ruta e separata de editorul cu preview live pentru ca raspunde altei
 * intrebari: acolo se aseaza si se reordoneaza sectiunile, aici se alege cum
 * arata fiecare si i se regleaza setarile. Amandoua scriu in aceeasi ciorna.
 */
export default async function SectionDesignPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, primary_color, features, cover_url, tagline, store_settings(page_content, storefront_design, storefront_design_draft)")
    .eq("user_id", user.id)
    .single();

  if (!business) redirect("/dashboard");

  const settings = Array.isArray(business.store_settings) ? business.store_settings[0] : business.store_settings;
  const ctx: DesignContext = {
    primaryColor: business.primary_color ?? "#1AB554",
    pageContent: (settings?.page_content as Record<string, unknown>) ?? {},
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  };

  const publicat = parseStoreDesign(settings?.storefront_design, ctx);
  const design = settings?.storefront_design_draft
    ? parseStoreDesign(settings.storefront_design_draft, ctx)
    : publicat;

  return (
    <SectionDesignBrowser
      businessId={business.id}
      slug={business.slug}
      designInitial={design}
      designPublicat={publicat}
    />
  );
}
