import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PreviewHeightReporter } from "@/components/storefront/PreviewHeightReporter";
import { SectionPreviewFrame } from "@/components/storefront/SectionPreviewFrame";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData } from "@/lib/storefront/chrome-value";
import { slimCatalogProduct } from "@/lib/storefront/catalog-slim";
import { DEMO_BANNERS, DEMO_CATEGORIES, DEMO_MENU, demoProducts } from "@/lib/storefront/design/demo-content";
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

  const { data: storeSettings } = await createAdminClient()
    .from("store_settings")
    .select("page_content, storefront_design")
    .eq("business_id", business.id)
    .single();
  const produseDemo = demoProducts(business.id);

  // Continutul e demonstrativ, identitatea magazinului nu: designul se alege cu
  // logo-ul, culorile si fontul lui, dar cu bannere, categorii si produse care
  // exista mereu, ca fiecare varianta sa se vada intreaga.
  const realPageContent = (storeSettings?.page_content ?? {}) as StorePageContent;
  const pageContent: StorePageContent = {
    ...realPageContent,
    menu: DEMO_MENU,
    hero_banners: DEMO_BANNERS,
    hero_banner_links: [],
  };
  // Designul se deriva din configuratia REALA: ce sectiuni are magazinul aprinse
  // si ce varianta foloseste nu trebuie sa depinda de continutul demonstrativ.
  const resolved = resolveDesign(storeSettings?.storefront_design, {
    primaryColor: business.primary_color ?? "#1AB554",
    pageContent: realPageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });

  const chrome = buildChromeData({
    business,
    pageContent,
    basePath: `/${business.slug}`,
    searchCategories: DEMO_CATEGORIES.map((c) => c.name),
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
        products={produseDemo.map(slimCatalogProduct)}
        categories={DEMO_CATEGORIES}
      />
      <PreviewHeightReporter />
    </StorefrontThemeScope>
  );
}
