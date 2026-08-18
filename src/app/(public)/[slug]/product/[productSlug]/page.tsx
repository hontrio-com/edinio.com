import { pentruBrowser } from "@/lib/storefront/business-public";
import { disponibilitatePachet } from "@/lib/bundles";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeBaseUrl } from "@/lib/seo";
import { parseStoreMode, parseStoreModeFromSettings } from "@/lib/storefront/store-mode";
import { enrichStoreProduct } from "@/lib/storefront/product-data";
import { buildProductJsonLd } from "@/lib/storefront/product-jsonld";
import { parseTimpDeLivrare } from "@/lib/shipping/delivery-time";
import type { Json } from "@/types/database.types";
import { ProductPageSection } from "@/components/storefront/sections/product/ProductPageSection";
import { resolveProductOffers } from "@/lib/offers/offers";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import { resolveDesign } from "@/lib/storefront/design/parse";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { jsonLdSafe } from "@/lib/json-ld";

interface Props {
  params: Promise<{ slug: string; productSlug: string }>;
}

// UUID v4 pattern to detect legacy product links
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Store id + custom domain (canonical URL) + display mode (One Product Store),
// cached per request. store_settings is not anon-readable, so this reads via the
// service role to see page_content (where the OPS flag lives).
const getBusinessMetaCached = cache(async (slug: string) => {
  const { data } = await createAdminClient()
    .from("businesses")
    .select("id, custom_domain, store_settings(page_content)")
    .eq("slug", slug)
    .single();
  return {
    businessId: data?.id ?? null,
    customDomain: data?.custom_domain ?? null,
    storeMode: parseStoreModeFromSettings((data as { store_settings?: unknown } | null)?.store_settings),
  };
});

// React cache() deduplicates this call between generateMetadata and the page
// — a single DB round trip serves both, per request. De aceea aduce randul
// intreg: pagina are nevoie de toate coloanele, nu doar de cele pentru meta.
const getProductCached = cache(async (slug: string, productSlug: string) => {
  const { businessId } = await getBusinessMetaCached(slug);
  if (!businessId) return null;
  const supabase = await createClient();
  const col = UUID_RE.test(productSlug) ? "id" : "slug";
  // Slug-ul de produs e unic doar in cadrul magazinului (indexul e pe
  // business_id + slug). Fara filtrul pe magazin, doua magazine cu acelasi slug
  // ar face `.single()` sa intoarca eroare si ar scoate 404 pe amandoua paginile.
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq(col, productSlug)
    .eq("business_id", businessId)
    .single();
  return data;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productSlug, slug } = await params;
  const product = await getProductCached(slug, productSlug);
  if (!product) return {};
  const ps = product.page_sections as { seo?: { title?: string; description?: string }; short_description?: string } | null;
  const seo = ps?.seo;
  const title = seo?.title || product.name;
  const description = seo?.description
    || (ps?.short_description ? ps.short_description.replace(/<[^>]+>/g, "").slice(0, 155) : "")
    || (product.description ? product.description.replace(/<[^>]+>/g, "").slice(0, 155) : product.name);
  const images = product.images as string[] | null;
  const canonicalSlug = product.slug ?? productSlug;
  const { customDomain, storeMode } = await getBusinessMetaCached(slug);
  const url = `${storeBaseUrl({ slug, custom_domain: customDomain })}/product/${canonicalSlug}`;
  // One Product Store: only the main product is indexable (and it 301s to the
  // homepage, handled in the page). Every other product is noindex,follow.
  const noindex = storeMode.mode === "one_product" && storeMode.productId !== product.id;
  return {
    // `absolute` strips the root layout's "%s | Edinio" template.
    title: { absolute: title },
    description,
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      ...(images?.[0] ? { images: [{ url: images[0] }] } : {}),
    },
    twitter: {
      card: images?.[0] ? "summary_large_image" : "summary",
      title,
      description,
      ...(images?.[0] ? { images: [images[0]] } : {}),
    },
  };
}

function buildBreadcrumbJsonLd(storeName: string, storeUrl: string, productName: string, productUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: storeName, item: storeUrl },
      { "@type": "ListItem", position: 2, name: productName, item: productUrl },
    ],
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { slug, productSlug } = await params;
  const supabase = await createClient();

  // business + product in parallel (publication gated by RLS on both tables).
  // Produsul vine din aceeasi functie cache()-uita ca generateMetadata, deci o
  // singura interogare pe products serveste ambele.
  const [{ data: business }, product] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, user_id, slug, business_name, store_name, tagline, description, phone, whatsapp, email, address, city, county, cui, reg_com, store_address, store_city, store_county, logo_url, cover_url, primary_color, is_published, custom_domain, social, gallery, features")
      .eq("slug", slug)
      .single(),
    getProductCached(slug, productSlug),
  ]);

  if (!business || !product || product.business_id !== business.id || !product.is_active) notFound();

  // SEO: redirect /product/{uuid} → /product/{slug} (301)
  //
  // Prefixul se calculeaza AICI, nu mai jos: pe domeniu propriu adresele n-au
  // slug-ul magazinului in ele, deci un redirect catre `/{slug}/product/...`
  // ducea in 404 pe chiar magazinele cu domeniul lor.
  if (UUID_RE.test(productSlug) && product.slug) {
    const gazda = (await headers()).get("host")?.split(":")[0] ?? "";
    const peDomeniuPropriu = !!business.custom_domain && gazda === business.custom_domain;
    redirect(peDomeniuPropriu ? `/product/${product.slug}` : `/${slug}/product/${product.slug}`);
  }

  // store_settings is no longer anon-readable — fetch the public-safe columns via service role.
  const { data: storeSettings } = await createAdminClient()
    .from("store_settings")
    // Coloanele de TVA lipseau, iar pagina le citeste: eticheta „(TVA inclus)" /
    // „(fara TVA)" de langa pret nu s-a afisat NICIODATA, la niciun magazin,
    // fiindca `vat_enabled` venea `undefined` si cadea pe rezerva `false`.
    // Sunt sigure public — se dau oricum prin `getPublicStoreConfig`.
    .select("page_content, store_policies, default_shipping_cost, free_shipping_threshold, min_order_amount, storefront_design, vat_enabled, vat_rate, prices_include_vat, show_vat_label, show_vat_breakdown")
    .eq("business_id", business.id)
    .single();

  // Detect custom domain access (also the One Product Store homepage target).
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${business.slug}`;

  // One Product Store: the homepage already renders this exact product as the
  // store's landing page, so the canonical /product/<main> URL is duplicate
  // content — 301 it to the homepage. Secondary products stay reachable but get
  // noindex (see generateMetadata above).
  const storeMode = parseStoreMode((storeSettings?.page_content as Json) ?? null);
  if (storeMode.mode === "one_product" && storeMode.productId === product.id) {
    redirect(basePath || "/");
  }

  // Shared enrichment (Media Library alt text, card-payment flag, bundle
  // components) + server-side rich-text sanitization of the product, in place.
  const { altMap, hasCardPayment, bundleComponents } = await enrichStoreProduct(business, product);

  // Cross-sell / FBT offers for this product. `offers` is owner-only (not anon-readable),
  // so it's resolved server-side with the service role — exactly like storeSettings above.
  const productOffers = await resolveProductOffers(createAdminClient(), business.id, {
    id: product.id, category: product.category, price: Number(product.price) || 0,
  });

  const brand = business.store_name ?? business.business_name;
  const storeBase = storeBaseUrl(business);
  const productUrl = `${storeBase}/product/${product.slug ?? productSlug}`;
  const shippingCost = Number(storeSettings?.default_shipping_cost ?? 0) || 0;
  // Termenul de livrare: Setari → Livrare, cu rezerva pe estimarea din editor.
  // Aceleasi zile pe care le arata casuta „Estimare livrare" de pe pagina.
  const timpLivrare = parseTimpDeLivrare(storeSettings?.page_content ?? null);
  const jsonLd = buildProductJsonLd(product, productUrl, brand, {
    cost: shippingCost,
    min: timpLivrare?.tranzitMin ?? null,
    max: timpLivrare?.tranzitMax ?? null,
    handlingMin: timpLivrare?.procesareMin,
    handlingMax: timpLivrare?.procesareMax,
  },
    product.is_bundle && !disponibilitatePachet(bundleComponents).inStock);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(brand, storeBase, product.name, productUrl);

  // Acelasi header si footer ca pe pagina de magazin, din aceeasi configuratie.
  const pageContent = (storeSettings?.page_content ?? {}) as StorePageContent;
  const resolved = resolveDesign(storeSettings?.storefront_design, {
    primaryColor: business.primary_color ?? "#1AB554",
    pageContent: pageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });
  const searchCategories = await loadSearchCategories(business.id, resolved.design);
  const chrome = buildChromeData({
    searchCategories,
    business: business as never,
    pageContent,
    basePath,
    design: resolved.design,
    // Bara de cumparare lipita jos acopera subsolul pe mobil.
    hasStickyBottomBar: true,
    // Transportul, pragul de livrare gratuita si comanda minima: sertarul de cos
    // se deschide acum si pe paginile fara catalog, iar fara ele n-ar putea arata
    // un total. Vezi `StoreCartPanels`.
    comert: {
      shippingCost: Number(storeSettings?.default_shipping_cost ?? 0),
      freeShippingThreshold: storeSettings?.free_shipping_threshold ?? null,
      minOrderAmount: storeSettings?.min_order_amount ?? null,
      vat: {
        vat_enabled: storeSettings?.vat_enabled ?? false,
        vat_rate: Number(storeSettings?.vat_rate ?? 19),
        prices_include_vat: storeSettings?.prices_include_vat ?? true,
        show_vat_breakdown: storeSettings?.show_vat_breakdown ?? true,
      },
    },
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(breadcrumbJsonLd) }}
      />
      <StorefrontThemeScope style={resolved.style}>
        <StorePageShell chrome={chrome} design={resolved.design} className="min-h-screen">
          <ProductPageSection
            variant={resolved.design.product.page.variant}
                setari={resolved.design.product.page.settings}
            business={pentruBrowser(business) as never}
            product={product}
            storeSettings={storeSettings as never}
            basePath={basePath}
            hasCardPayment={hasCardPayment}
            bundleComponents={bundleComponents}
            altMap={altMap}
            productOffers={productOffers}
          />
        </StorePageShell>
      </StorefrontThemeScope>
    </>
  );
}
