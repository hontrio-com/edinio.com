import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PreviewHeightReporter } from "@/components/storefront/PreviewHeightReporter";
import { SectionPreviewFrame } from "@/components/storefront/SectionPreviewFrame";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData } from "@/lib/storefront/chrome-value";
import { slimCatalogProduct } from "@/lib/storefront/catalog-slim";
import { resolveDesign } from "@/lib/storefront/design/parse";
import { sectionMeta, variantMeta } from "@/lib/storefront/design/registry";
import type { SectionKind } from "@/lib/storefront/design/types";
import type { StorePageContent } from "@/lib/storefront/store-content.types";

/**
 * O singura sectiune de magazin, randata izolat.
 *
 * Sursa miniaturilor din galeria de design-uri a editorului: fiecare card e un
 * iframe catre ruta asta, deci arata varianta reala cu logo-ul, culorile si
 * produsele magazinului. Alternativa — capturi pregatite dinainte — ar fi
 * insemnat ~160 de imagini de intretinut, care oricum ar fi aratat produsele
 * altcuiva.
 *
 * Nu expune nimic in plus: randeaza exact ce vede oricine pe magazinul public.
 *
 * Ruta sta DELIBERAT in afara lui `[slug]`, nu sub el. Layout-ul magazinului
 * injecteaza pixelii de marketing si bannerul de cookies: bannerul acoperea
 * miniaturile, iar pixelii ar fi trimis cate un pageview in Facebook, TikTok si
 * Google Analytics ale comerciantului la fiecare card din galerie — statistici
 * si audiente de reclame stricate de propriul editor.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ kind?: string; variant?: string }>;
}

export default async function SectionPreviewPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { kind: kindParam, variant: variantParam } = await searchParams;

  const kind = kindParam as SectionKind | undefined;
  if (!kind || !sectionMeta(kind) || !variantParam || !variantMeta(kind, variantParam)) notFound();

  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("*").eq("slug", slug).single();
  if (!business) notFound();

  const [{ data: storeSettings }, { data: products }, { data: categories }] = await Promise.all([
    createAdminClient()
      .from("store_settings")
      .select("page_content, storefront_design")
      .eq("business_id", business.id)
      .single(),
    // Cateva produse sunt de ajuns pentru o miniatura; nu incarcam catalogul.
    supabase
      .from("products")
      .select("id, name, slug, description, price, compare_at_price, images, category, is_featured, is_active, is_bundle, track_inventory, stock_quantity, sort_order, created_at, business_id, page_sections, weight_grams")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .limit(8),
    supabase
      .from("categories")
      .select("id, name, parent_id, image_url, sort_order")
      .eq("business_id", business.id)
      .order("sort_order")
      .limit(20),
  ]);

  const pageContent = (storeSettings?.page_content ?? {}) as StorePageContent;
  const resolved = resolveDesign(storeSettings?.storefront_design, {
    primaryColor: business.primary_color ?? "#1AB554",
    pageContent: pageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });

  const chrome = buildChromeData({
    business,
    pageContent,
    basePath: `/${business.slug}`,
    searchCategories: (categories ?? []).filter((c) => c.parent_id === null).map((c) => c.name),
  });

  return (
    <StorefrontThemeScope style={resolved.style}>
      <SectionPreviewFrame
        chrome={chrome}
        section={{
          id: `preview_${kind}`,
          kind,
          variant: variantParam,
          enabled: true,
          // Cu setarile implicite ale variantei, ca miniatura sa arate exact ce
          // primeste comerciantul daca o alege.
          settings: { ...(variantMeta(kind, variantParam)?.defaults ?? {}) },
        }}
        products={(products ?? []).map(slimCatalogProduct)}
        categories={categories ?? []}
      />
      <PreviewHeightReporter />
    </StorefrontThemeScope>
  );
}
