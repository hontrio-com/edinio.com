import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeBaseUrl } from "@/lib/seo";
import { SuspendedStorePage } from "@/components/ministore/SuspendedStorePage";
import { StoreHeader } from "@/components/ministore/StoreHeader";
import { StoreFooter } from "@/components/ministore/StoreFooter";
import { BlockRenderer } from "@/components/pages/BlockRenderer";
import { prepareBlocksForPublic } from "@/lib/pages/prepare-blocks";
import { sanitizeCss } from "@/lib/pages/sanitize-css";
import { resolveAllProductsBlocks } from "@/lib/pages/resolve-products";
import type { Block, PageSeo } from "@/lib/pages/blocks.types";
import type { MenuItem } from "@/lib/pages/menu";
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
    openGraph: { title, description: seo.description ?? undefined, url, type: "website", ...(ogImage ? { images: [{ url: ogImage }] } : {}) },
    ...(ogImage ? { twitter: { card: "summary_large_image" as const, title, description: seo.description ?? undefined, images: [ogImage] } } : {}),
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
    createAdminClient().from("store_settings").select("page_content").eq("business_id", business.id).single(),
    createAdminClient().from("forms").select("id, name, fields, submit_label, success_message").eq("business_id", business.id),
  ]);

  const forms: PublicForm[] = (formsRaw ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    fields: Array.isArray(f.fields) ? (f.fields as unknown as FormField[]) : [],
    submit_label: f.submit_label,
    success_message: f.success_message,
  }));

  const pageContent = (storeSettings?.page_content ?? {}) as { menu?: MenuItem[]; logo_size?: number; footer_logo_size?: number };
  const menu = pageContent.menu ?? [];
  const logoSize = pageContent.logo_size ?? 36;
  const footerLogoSize = pageContent.footer_logo_size ?? 36;

  // Custom domain detection (links honour basePath).
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${business.slug}`;

  const blocks = prepareBlocksForPublic((page.blocks as unknown as Block[]) ?? []);
  // Resolve each products-block server-side with a hard cap (scales to huge catalogs).
  const productsByBlock = await resolveAllProductsBlocks(supabase, business.id, blocks);
  const color = business.primary_color ?? "#1AB554";
  const social = (business.social ?? {}) as Record<string, string>;
  const pageCss = sanitizeCss(page.page_css);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {pageCss ? <style dangerouslySetInnerHTML={{ __html: pageCss }} /> : null}
      <StoreHeader
        business={{ slug: business.slug, business_name: business.business_name, store_name: business.store_name, logo_url: business.logo_url, primary_color: color, phone: business.phone }}
        menu={menu}
        basePath={basePath}
        currentSlug={page.slug}
        logoSize={logoSize}
      />
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
      <StoreFooter
        business={{ business_name: business.business_name, store_name: business.store_name, logo_url: business.logo_url, primary_color: color, social, cui: business.cui, reg_com: business.reg_com, address: business.address, city: business.city, county: business.county, store_address: business.store_address, store_city: business.store_city, store_county: business.store_county }}
        menu={menu}
        basePath={basePath}
        businessId={business.id}
        footerLogoSize={footerLogoSize}
      />
    </div>
  );
}
