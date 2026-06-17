import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { PageBuilder } from "@/components/pages/PageBuilder";
import type { PageProduct } from "@/components/pages/blocks/ProductsBlock";
import type { Block, PageSeo } from "@/lib/pages/blocks.types";
import type { FormDef, FormField } from "@/lib/pages/forms.types";

export default async function EditCustomPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: page } = await supabase.from("custom_pages").select("*").eq("id", pageId).single();
  if (!page) notFound();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name, logo_url, primary_color, phone, social")
    .eq("id", page.business_id)
    .eq("user_id", user.id)
    .single();
  if (!business) notFound(); // not the owner

  const { data: profile } = await supabase.from("users_profile").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin";

  const [{ data: productsRaw }, { data: cats }, { data: formsRaw }] = await Promise.all([
    supabase.from("products").select("id, name, slug, price, compare_at_price, images, category, is_featured")
      .eq("business_id", business.id).eq("is_active", true).order("is_featured", { ascending: false }).order("sort_order").limit(60),
    supabase.from("categories").select("name").eq("business_id", business.id).order("sort_order"),
    supabase.from("forms").select("id, name, fields, submit_label, success_message, email_enabled, email_to")
      .eq("business_id", business.id).order("created_at"),
  ]);

  const products: PageProduct[] = (productsRaw ?? []).map((p) => ({
    id: p.id, name: p.name, slug: p.slug,
    price: Number(p.price), compare_at_price: p.compare_at_price != null ? Number(p.compare_at_price) : null,
    images: Array.isArray(p.images) ? (p.images as unknown[]).map(String).filter(Boolean) : [],
    category: p.category, is_featured: !!p.is_featured,
  }));

  const forms: FormDef[] = (formsRaw ?? []).map((f) => ({
    id: f.id, name: f.name,
    fields: Array.isArray(f.fields) ? (f.fields as unknown as FormField[]) : [],
    submit_label: f.submit_label, success_message: f.success_message,
    email_enabled: f.email_enabled, email_to: f.email_to,
  }));

  return (
    <PageBuilder
      pageId={page.id}
      initialTitle={page.title}
      initialSlug={page.slug}
      initialPublished={page.is_published}
      initialBlocks={(page.blocks as unknown as Block[]) ?? []}
      initialCss={page.page_css ?? ""}
      initialSeo={(page.seo ?? {}) as PageSeo}
      business={{
        id: business.id, slug: business.slug, custom_domain: business.custom_domain,
        store_name: business.store_name, business_name: business.business_name,
        logo_url: business.logo_url, primary_color: business.primary_color, phone: business.phone,
        social: (business.social ?? {}) as Record<string, string>,
      }}
      products={products}
      categories={(cats ?? []).map((c) => c.name)}
      forms={forms}
      isAdmin={isAdmin}
    />
  );
}
