import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StoreDesignEditor } from "@/components/store-editor/StoreDesignEditor";
import { parseStoreDesign } from "@/lib/storefront/design/parse";
import type { DesignContext } from "@/lib/storefront/design/types";

/**
 * Editorul de design pe sectiuni.
 *
 * Ruta e separata de `/dashboard/editor` cat timp sistemul se construieste:
 * editorul vechi ramane intact si functional, iar cele doua se unesc dupa ce
 * variantele exista. Asta permite si testarea pe preview fara sa se atinga
 * fluxul pe care comerciantii il folosesc azi.
 */
export default async function DesignEditorPage() {
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

  // Ciorna, daca exista; altfel designul publicat. Un comerciant care revine in
  // editor trebuie sa gaseasca exact unde a ramas.
  const areCiorna = !!settings?.storefront_design_draft;
  const design = parseStoreDesign(
    areCiorna ? settings?.storefront_design_draft : settings?.storefront_design,
    ctx,
  );

  return (
    <StoreDesignEditor
      businessId={business.id}
      slug={business.slug}
      designInitial={design}
      ctx={ctx}
      areCiorna={areCiorna}
    />
  );
}
