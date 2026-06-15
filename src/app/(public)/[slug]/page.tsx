import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MiniStoreRenderer } from "@/components/ministore/MiniStoreRenderer";
import { SuspendedStorePage } from "@/components/ministore/SuspendedStorePage";
import { headers } from "next/headers";

interface Props { params: Promise<{ slug: string }>; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("business_name, store_name, tagline, description, store_city, cover_url, custom_domain")
    .eq("slug", slug)
    .single();
  if (!business) return {};
  const displayName = business.store_name ?? business.business_name;
  const title = business.store_city ? `${displayName} - ${business.store_city}` : displayName;
  const description = business.tagline ?? business.description?.slice(0, 155) ?? `Cumpara din ${displayName} online.`;
  // When a custom domain is configured, consolidate SEO to it (so edinio.com/slug
  // also points its canonical at the store's own domain).
  const url = business.custom_domain ? `https://${business.custom_domain}` : `https://www.edinio.com/${slug}`;
  const images = business.cover_url ? [business.cover_url] : [];
  return {
    title,
    description,
    openGraph: { title, description, url, images },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      ...(images.length ? { images } : {}),
    },
    alternates: { canonical: url },
  };
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const [{ data: business }, { data: { user } }] = await Promise.all([
    supabase.from("businesses").select("*").eq("slug", slug).single(),
    supabase.auth.getUser(),
  ]);

  if (!business) notFound();

  const isOwner = user?.id === business.user_id;

  if (!business.is_published && !isOwner) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mb-6 mx-auto"
          style={{ backgroundColor: business.primary_color }}>
          {(business.store_name ?? business.business_name)[0]?.toUpperCase()}
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">{business.store_name ?? business.business_name}</h1>
        <p className="text-muted-foreground mb-6">Magazinul este in curand disponibil.</p>
        {business.phone && (
          <a href={`tel:${business.phone}`}
            className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white rounded-xl transition-colors"
            style={{ backgroundColor: business.primary_color }}>
            Contacteaza-ne
          </a>
        )}
      </div>
    );
  }

  // Check suspension or trial expiry — show suspended page to visitors.
  // Owners can still access their store to preview it.
  if (!isOwner) {
    let isSuspended = false;

    // Grace period expired (failed payment)
    if (business.suspended_until) {
      isSuspended = new Date(business.suspended_until) < new Date();
    }

    // Trial expired — use admin client to bypass RLS (anonymous visitors can't read users_profile)
    if (!isSuspended) {
      const admin = createAdminClient();
      const { data: ownerProfile } = await admin
        .from("users_profile")
        .select("plan, plan_expires_at")
        .eq("id", business.user_id)
        .single();

      if ((ownerProfile?.plan === "free" || ownerProfile?.plan === "trial") && ownerProfile?.plan_expires_at) {
        isSuspended = new Date(ownerProfile.plan_expires_at) < new Date();
      }
    }

    if (isSuspended) {
      return (
        <SuspendedStorePage
          businessName={business.store_name ?? business.business_name}
          primaryColor={business.primary_color}
          phone={business.phone}
        />
      );
    }
  }

  const [{ data: products }, { data: storeSettings }, { data: categoriesData }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, slug, description, price, compare_at_price, images, category, is_featured, is_active, is_bundle, track_inventory, stock_quantity, sort_order, created_at, business_id, page_sections")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("sort_order"),
    createAdminClient()
      .from("store_settings")
      .select("id, business_id, page_content, store_policies, default_shipping_cost, free_shipping_threshold, min_order_amount")
      .eq("business_id", business.id)
      .single(),
    supabase
      .from("categories")
      .select("id, name, parent_id, image_url, sort_order")
      .eq("business_id", business.id)
      .order("sort_order"),
  ]);

  // Detect custom domain access
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${business.slug}`;

  // Fire-and-forget analytics (skip for owner)
  if (!isOwner) {
    const ua = headersList.get("user-agent") ?? "";
    const device = /mobile/i.test(ua) ? "mobile" : /tablet/i.test(ua) ? "tablet" : "desktop";
    supabase.from("site_analytics").insert({ business_id: business.id, event_type: "visit", device, country: "RO" }).then(() => {});
  }

  const displayName = business.store_name ?? business.business_name;
  const canonicalUrl = isCustomDomain ? `https://${business.custom_domain}` : `https://www.edinio.com/${business.slug}`;
  const storeJsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: displayName,
    url: canonicalUrl,
    ...(business.description ? { description: business.description.slice(0, 500) } : {}),
    ...(business.cover_url ? { image: business.cover_url } : {}),
    ...(business.logo_url ? { logo: business.logo_url } : {}),
    ...(business.store_city ? {
      address: {
        "@type": "PostalAddress",
        addressLocality: business.store_city,
        addressCountry: "RO",
      },
    } : {}),
    ...(business.phone ? { telephone: business.phone } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(storeJsonLd) }}
      />
      <MiniStoreRenderer
        business={business}
        products={products ?? []}
        storeSettings={storeSettings}
        basePath={basePath}
        categories={categoriesData ?? []}
      />
    </>
  );
}
