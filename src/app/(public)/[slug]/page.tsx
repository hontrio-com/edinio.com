import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { MiniStoreRenderer } from "@/components/ministore/MiniStoreRenderer";
import { headers } from "next/headers";

interface Props { params: Promise<{ slug: string }>; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("business_name, tagline, description, city, cover_url")
    .eq("slug", slug)
    .single();
  if (!business) return {};
  const title = business.city ? `${business.business_name} - ${business.city}` : business.business_name;
  const description = business.tagline ?? business.description?.slice(0, 155) ?? `Cumpara din ${business.business_name} online.`;
  return {
    title,
    description,
    openGraph: { title, description, images: business.cover_url ? [business.cover_url] : [] },
    alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/${slug}` },
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
          {business.business_name[0]?.toUpperCase()}
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">{business.business_name}</h1>
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

  const [{ data: products }, { data: storeSettings }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("sort_order"),
    supabase
      .from("store_settings")
      .select("*")
      .eq("business_id", business.id)
      .single(),
  ]);

  // Fire-and-forget analytics (skip for owner)
  if (!isOwner) {
    const headersList = await headers();
    const ua = headersList.get("user-agent") ?? "";
    const device = /mobile/i.test(ua) ? "mobile" : /tablet/i.test(ua) ? "tablet" : "desktop";
    supabase.from("site_analytics").insert({ business_id: business.id, event_type: "visit", device, country: "RO" }).then(() => {});
  }

  return (
    <MiniStoreRenderer
      business={business}
      products={products ?? []}
      storeSettings={storeSettings}
    />
  );
}
