import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeBaseUrl } from "@/lib/seo";
import { SuspendedStorePage } from "@/components/ministore/SuspendedStorePage";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import { resolveDesign } from "@/lib/storefront/design/parse";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { BlockRenderer } from "@/components/pages/BlockRenderer";
import { prepareBlocksForPublic } from "@/lib/pages/prepare-blocks";
import { sanitizeCss } from "@/lib/pages/sanitize-css";
import { resolveAllProductsBlocks } from "@/lib/pages/resolve-products";
import type { Block, PageSeo } from "@/lib/pages/blocks.types";
import type { PublicForm, FormField } from "@/lib/pages/forms.types";

interface Props {
  params: Promise<{ slug: string; pageSlug: string }>;
}

// Deduplicated per request: generateMetadata + the page share one set of queries.
const loadPage = cache(async (slug: string, pageSlug: string) => {
  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select("*").eq("slug", slug).single();
  if (!business) return null;
  // RLS: published pages are public; owners can also read their own drafts.
  const { data: page } = await supabase
    .from("custom_pages").select("*").eq("business_id", business.id).eq("slug", pageSlug).single();
  return { supabase, business, page };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, pageSlug } = await params;
  const loaded = await loadPage(slug, pageSlug);
  if (!loaded?.page) return {};
  const { business, page } = loaded;
  const seo = (page.seo ?? {}) as PageSeo;
  const title = `${seo.title || page.title} | ${business.store_name ?? business.business_name}`;
  const url = `${storeBaseUrl(business)}/${page.slug}`;
  const ogImage = seo.ogImage?.trim() || business.cover_url || undefined;
  return {
    // `absolute` strips the root layout's "%s | Edinio" template.
    title: { absolute: title },
    description: seo.description ?? undefined,
    keywords: seo.keywords?.trim() || undefined,
    alternates: { canonical: url },
    robots: seo.noindex ? { index: false, follow: false } : undefined,
    // `locale` si `siteName` se scriu explicit: obiectul asta inlocuieste in
    // intregime openGraph-ul radacinii, deci ce nu e aici nu se emite deloc, iar
    // og:site_name mostenit ar fi spus „Edinio" pe pagina magazinului.
    openGraph: { title, description: seo.description ?? undefined, url, type: "website", locale: "ro_RO", siteName: business.store_name ?? business.business_name, ...(ogImage ? { images: [{ url: ogImage }] } : {}) },
    // Cardul de Twitter se emite mereu, imaginea doar cand exista: nedeclarat,
    // blocul se mostenea din layout-ul radacina si previzualizarea arata Edinio,
    // desi og:title si og:url de mai sus erau deja ale magazinului.
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description: seo.description ?? undefined,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function CustomPage({ params }: Props) {
  const { slug, pageSlug } = await params;
  const loaded = await loadPage(slug, pageSlug);
  if (!loaded) notFound();
  const { supabase, business, page } = loaded;

  const { data: { user } } = await supabase.auth.getUser();
  const isOwner = user?.id === business.user_id;

  // Unpublished business: show "coming soon" to visitors (owners can preview).
  if (!business.is_published && !isOwner) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mb-6 mx-auto" style={{ backgroundColor: business.primary_color }}>
          {(business.store_name ?? business.business_name)[0]?.toUpperCase()}
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">{business.store_name ?? business.business_name}</h1>
        <p className="text-muted-foreground">Magazinul este in curand disponibil.</p>
      </div>
    );
  }

  // Suspension / trial expiry — show suspended page to visitors (owners can preview).
  if (!isOwner) {
    let isSuspended = false;
    if (business.suspended_until) isSuspended = new Date(business.suspended_until) < new Date();
    if (!isSuspended) {
      const admin = createAdminClient();
      const { data: ownerProfile } = await admin
        .from("users_profile").select("plan, plan_expires_at").eq("id", business.user_id).single();
      if ((ownerProfile?.plan === "free" || ownerProfile?.plan === "trial") && ownerProfile?.plan_expires_at) {
        isSuspended = new Date(ownerProfile.plan_expires_at) < new Date();
      }
    }
    if (isSuspended) {
      return <SuspendedStorePage businessName={business.store_name ?? business.business_name} primaryColor={business.primary_color} phone={business.phone} />;
    }
  }

  // Page must exist; unpublished pages are visible only to the owner.
  if (!page || (!page.is_published && !isOwner)) notFound();

  // store_settings (menu + logo size) and forms via service role — not anon-readable.
  const [{ data: storeSettings }, { data: formsRaw }] = await Promise.all([
    createAdminClient().from("store_settings").select("page_content, storefront_design, default_shipping_cost, free_shipping_threshold, min_order_amount").eq("business_id", business.id).single(),
    createAdminClient().from("forms").select("id, name, fields, submit_label, success_message").eq("business_id", business.id),
  ]);

  const forms: PublicForm[] = (formsRaw ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    fields: Array.isArray(f.fields) ? (f.fields as unknown as FormField[]) : [],
    submit_label: f.submit_label,
    success_message: f.success_message,
  }));

  // Meniul si marimile de logo se citesc acum in buildChromeData, dintr-un
  // singur loc pentru toate paginile publice.
  const pageContent = (storeSettings?.page_content ?? {}) as StorePageContent;

  // Custom domain detection (links honour basePath).
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${business.slug}`;

  const blocks = prepareBlocksForPublic((page.blocks as unknown as Block[]) ?? []);
  // Resolve each products-block server-side with a hard cap (scales to huge catalogs).
  // Respecta setarea de vizibilitate a catalogului (ascunde fara imagini / fara stoc).
  const productsByBlock = await resolveAllProductsBlocks(supabase, business.id, blocks, {
    hideNoImage: pageContent.hide_products_without_images === true,
    hideOutOfStock: pageContent.hide_out_of_stock_products === true,
  });
  const color = business.primary_color ?? "#1AB554";
  const social = (business.social ?? {}) as Record<string, string>;
  const pageCss = sanitizeCss(page.page_css);

  // Acelasi design ca pagina de magazin: bara de anunt, header si footer vin din
  // aceeasi configuratie, ca alegerea comerciantului sa nu se opreasca la
  // pagina principala.
  const resolved = resolveDesign(storeSettings?.storefront_design, {
    primaryColor: color,
    pageContent: pageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });
  const searchCategories = await loadSearchCategories(business.id, resolved.design);
  const chrome = buildChromeData({
    searchCategories,
    business,
    pageContent: pageContent as StorePageContent,
    basePath,
    design: resolved.design,
    currentPageSlug: page.slug,
    // Transportul, pragul de livrare gratuita si comanda minima: sertarul de cos
    // se deschide acum si pe paginile fara catalog, iar fara ele n-ar putea arata
    // un total. Vezi `StoreCartPanels`.
    comert: {
      shippingCost: Number(storeSettings?.default_shipping_cost ?? 0),
      freeShippingThreshold: storeSettings?.free_shipping_threshold ?? null,
      minOrderAmount: storeSettings?.min_order_amount ?? null,
    },
  });

  return (
    <StorefrontThemeScope style={resolved.style}>
      {pageCss ? <style dangerouslySetInnerHTML={{ __html: pageCss }} /> : null}
      <StorePageShell chrome={chrome} design={resolved.design} className="min-h-screen flex flex-col">
        {!page.is_published && isOwner && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center py-2 px-4">
            Aceasta pagina este in modul ciorna (draft) si o vezi doar tu. Publica-o din panou pentru a o face vizibila.
          </div>
        )}
        <main id={`edinio-page-${page.id}`} className="flex-1">
          <BlockRenderer
            blocks={blocks}
            ctx={{ color, basePath, storeSlug: business.slug, social, products: [], productsByBlock, forms, businessId: business.id, pageId: page.id }}
          />
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}
