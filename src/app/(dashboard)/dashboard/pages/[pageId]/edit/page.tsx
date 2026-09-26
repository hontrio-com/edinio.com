import { getProductPriceRange } from "@/lib/utils/product-price";
import { slimPageSections } from "@/lib/storefront/catalog-slim";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { PageBuilder } from "@/components/pages/PageBuilder";
import type { PageProduct } from "@/components/pages/blocks/ProductsBlock";
import type { Block, PageSeo, ProductsBlock } from "@/lib/pages/blocks.types";
import { flattenBlocks } from "@/lib/pages/block-tree";

const COLOANE_PRODUS = "id, name, slug, price, compare_at_price, images, category, is_featured, page_sections, is_bundle, track_inventory, stock_quantity";
import type { FormDef, FormField } from "@/lib/pages/forms.types";
import { permalinkuriDin } from "@/lib/storefront/permalinkuri";
import { parseStoreDesign, resolveDesign } from "@/lib/storefront/design/parse";
import { fundalulPaginii } from "@/lib/pages/fundal-pagina";
import { curataHtmlPentruEditor } from "@/lib/pages/prepare-blocks";
import { shopOnPage } from "@/lib/storefront/design/commerce";
import { resolveAllBundlesBlocks } from "@/lib/pages/resolve-bundles";
import { integrariPentruPagini } from "@/lib/pages/integrari-pagini";

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

  // Categories windowed past the 1000-row PostgREST cap (big imported taxonomies).
  const [{ data: productsRaw }, cats, { data: formsRaw }, { data: pagini }, { data: ss }] = await Promise.all([
    supabase.from("products").select(COLOANE_PRODUS)
      .eq("business_id", business.id).eq("is_active", true).order("is_featured", { ascending: false }).order("sort_order").limit(60),
    fetchAllRows("dashboard.page-edit.categories", (from, to) =>
      supabase.from("categories").select("id, name").eq("business_id", business.id)
        .order("sort_order").order("id").range(from, to)
    ),
    supabase.from("forms").select("id, name, fields, submit_label, success_message, email_enabled, email_to, mailchimp_enabled, brevo_enabled, klaviyo_enabled")
      .eq("business_id", business.id).order("created_at"),
    /* Pentru sugestiile de link: paginile magazinului (fara cea deschisa) si prefixele adreselor. */
    supabase.from("custom_pages").select("title, slug, is_published")
      .eq("business_id", business.id).neq("id", page.id).order("sort_order").order("created_at").limit(500),
    supabase.from("store_settings").select("page_content, storefront_design").eq("business_id", business.id).maybeSingle(),
  ]);

  /*
    Pachetele (pentru previzualizarea blocului „Pachete”) si integrarile active
    (ce blocuri de integrare se pot adauga). Pachetele: cel mult 12, ca pe pagina.
  */
  const [pacheteMap, integrari] = await Promise.all([
    resolveAllBundlesBlocks(supabase, business.id, [{ id: "editor", type: "bundles", mode: "all", limit: 12, showRecentSales: true }]),
    integrariPentruPagini(business.id),
  ]);
  const furnizori = [
    integrari.newsletter.mailchimp && "Mailchimp", integrari.newsletter.brevo && "Brevo", integrari.newsletter.klaviyo && "Klaviyo",
  ].filter((x): x is string => !!x);

  const pc = (ss?.page_content ?? {}) as Record<string, unknown>;
  const permalinkuri = permalinkuriDin(pc);
  const catalogPePagina = shopOnPage(parseStoreDesign(ss?.storefront_design, { primaryColor: business.primary_color ?? "#07c527", pageContent: pc, features: {} }));
  // Acelasi fundal ca pe magazin (vezi `fundalulPaginii`).
  const fundal = fundalulPaginii(resolveDesign(ss?.storefront_design, { primaryColor: business.primary_color ?? "#07c527", pageContent: pc, features: {} }).style.colors.background);

  /*
    Previzualizarea blocurilor de produse (26.09.2026, auditul paginilor): editorul
    incarca primele 60 de produse, iar blocurile „alese de mana” sau „pe categorie”
    cu produse din afara lor ieseau goale in editor, desi pe magazin aveau produse.
    Se aduc si acelea, marginit.
  */
  const blocuriProduse = flattenBlocks((page.blocks as unknown as Block[]) ?? []).filter((b): b is ProductsBlock => b.type === "products");
  const incarcate = new Set((productsRaw ?? []).map((p) => p.id));
  const lipsa = [...new Set(blocuriProduse.flatMap((b) => (b.mode === "selected" ? b.productIds ?? [] : [])))].filter((id) => !incarcate.has(id)).slice(0, 200);
  const categoriiBlocuri = [...new Set(blocuriProduse.flatMap((b) => (b.mode === "category" && b.category ? [b.category] : [])))].slice(0, 20);
  const extra = await Promise.all([
    lipsa.length ? supabase.from("products").select(COLOANE_PRODUS).eq("business_id", business.id).eq("is_active", true).in("id", lipsa) : null,
    ...categoriiBlocuri.map((c) => supabase.from("products").select(COLOANE_PRODUS).eq("business_id", business.id).eq("is_active", true)
      .eq("category", c).order("sort_order").limit(24)),
  ]);
  const toateProdusele = [...(productsRaw ?? [])];
  for (const r of extra) for (const p of r?.data ?? []) if (!incarcate.has(p.id)) { incarcate.add(p.id); toateProdusele.push(p); }

  const products: PageProduct[] = toateProdusele.map((p) => ({
    id: p.id, name: p.name, slug: p.slug,
    price: Number(p.price), compare_at_price: p.compare_at_price != null ? Number(p.compare_at_price) : null,
    images: Array.isArray(p.images) ? (p.images as unknown[]).map(String).filter(Boolean) : [],
    category: p.category, is_featured: !!p.is_featured,
    // Slimuit, nu brut: previzualizarea are nevoie doar de axe, ca sa aleaga intre
    // „Alege optiunile" si „Adauga in cos". Brut, cele 60 de randuri insemnau
    // 183 KB in payload-ul editorului la un singur magazin.
    page_sections: slimPageSections(p.page_sections),
    // Acelasi pret ca pagina publicata: altfel comerciantul aseaza blocul dupa un
    // numar pe care clientul nu-l vede.
    price_range: getProductPriceRange(Number(p.price), p.page_sections ?? null),
    epuizat: !p.is_bundle && !!p.track_inventory && p.stock_quantity === 0,
  }));

  const forms: FormDef[] = (formsRaw ?? []).map((f) => ({
    id: f.id, name: f.name,
    fields: Array.isArray(f.fields) ? (f.fields as unknown as FormField[]) : [],
    submit_label: f.submit_label, success_message: f.success_message,
    email_enabled: f.email_enabled, email_to: f.email_to, mailchimp_enabled: f.mailchimp_enabled, brevo_enabled: f.brevo_enabled ?? false, klaviyo_enabled: f.klaviyo_enabled ?? false,
  }));

  return (
    <PageBuilder
      pageId={page.id}
      fundal={fundal}
      initialTitle={page.title}
      initialSlug={page.slug}
      initialPublished={page.is_published}
      initialBlocks={curataHtmlPentruEditor((page.blocks as unknown as Block[]) ?? [])}
      initialCss={page.page_css ?? ""}
      initialSeo={(page.seo ?? {}) as PageSeo}
      initialVersiune={page.updated_at}
      legaturi={{
        pagini: (pagini ?? []).map((p) => ({ titlu: p.title, slug: p.slug, publicata: p.is_published })),
        categorii: cats.map((c) => c.name),
        radacinaCatalog: catalogPePagina ? `/${permalinkuri.magazin}` : "",
        prefixProdus: permalinkuri.produs,
      }}
      business={{
        id: business.id, slug: business.slug, custom_domain: business.custom_domain,
        store_name: business.store_name, business_name: business.business_name,
        logo_url: business.logo_url, primary_color: business.primary_color, phone: business.phone,
        social: (business.social ?? {}) as Record<string, string>,
      }}
      products={products}
      categories={cats.map((c) => c.name)}
      forms={forms}
      isAdmin={isAdmin}
      pachete={pacheteMap.editor ?? []}
      integrari={{ furnizori, plati: integrari.plati, curieri: integrari.curieri }}
    />
  );
}
