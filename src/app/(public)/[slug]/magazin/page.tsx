import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { MiniStoreRenderer } from "@/components/ministore/MiniStoreRenderer";
import { SuspendedStorePage } from "@/components/ministore/SuspendedStorePage";
import { construiesteFatete } from "@/lib/storefront/catalog/facets";
import { slimCatalogProduct } from "@/lib/storefront/catalog-slim";
import { radacinaMagazin } from "@/lib/storefront/category-href";
import { shopOnPage } from "@/lib/storefront/design/commerce";
import { resolveDesign } from "@/lib/storefront/design/parse";
import { isNonProductionHost } from "@/lib/storefront/host";
import { parseStoreMode } from "@/lib/storefront/store-mode";
import { canonicalCatalog, citesteFiltreDinAdresa } from "@/lib/storefront/catalog/url";
import { deriveStoreTitle, parseStoreSeo } from "@/lib/seo";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import type { Json } from "@/types/database.types";

/**
 * Pagina de catalog.
 *
 * Exista doar pentru magazinele care si-au ales catalogul ca pagina de sine
 * statatoare; la restul, produsele stau pe pagina principala si aici nu are ce
 * cauta nimeni. Alegerea e a designului, deci se citeste din aceeasi
 * configuratie ca header-ul si footerul.
 *
 * Spre deosebire de cos si de finalizare, pagina asta e INDEXABILA: e chiar
 * catalogul magazinului. De aceea are canonical, OpenGraph si intrare in
 * sitemap, si de aceea ii pasa ce filtre sunt in adresa.
 */

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Coloanele cerute in plus fata de pagina principala: `tags` alimenteaza fatetele. */
const COLOANE_CATALOG =
  "id, name, slug, description, price, compare_at_price, images, category, is_featured, is_active, is_bundle, track_inventory, stock_quantity, sort_order, created_at, business_id, page_sections, weight_grams, tags";

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const { data: business } = await createAdminClient()
    .from("businesses")
    .select("id, business_name, store_name, store_city, cover_url, custom_domain, store_settings(page_content, storefront_design)")
    .eq("slug", slug)
    .single();
  if (!business) return {};

  const brut = (business as unknown as {
    store_settings: { page_content: unknown; storefront_design: unknown } | { page_content: unknown; storefront_design: unknown }[] | null;
  }).store_settings;
  const settings = Array.isArray(brut) ? brut[0] : brut;
  const seo = parseStoreSeo(settings?.page_content ?? null);
  const displayName = business.store_name ?? business.business_name;

  const radacina = business.custom_domain
    ? `https://${business.custom_domain}`
    : `https://www.edinio.com/${slug}`;
  const { url, indexabila } = canonicalCatalog(`${radacina}/magazin`, sp);

  const title = `Toate produsele | ${displayName}`;
  const description =
    seo.description
    || `Vezi toate produsele din ${deriveStoreTitle(displayName, business.store_city)}. Filtreaza dupa categorie, pret si atribute.`;
  const images = business.cover_url ? [business.cover_url] : [];

  return {
    // `absolute` scoate template-ul „%s | Edinio" al radacinii: pe domeniul
    // comerciantului, fila din browser n-are ce cauta cu numele platformei.
    title: { absolute: title },
    description,
    // Filtrele deschid un spatiu combinatoriu: o pagina cu doua sau mai multe
    // bife nu se indexeaza, dar linkurile din ea se urmaresc mai departe.
    ...(seo.noindex || !indexabila ? { robots: { index: false, follow: true } } : {}),
    openGraph: { type: "website", locale: "ro_RO", siteName: displayName, title, description, url, images },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description, ...(images.length ? { images } : {}) },
    alternates: { canonical: url },
  };
}

export default async function PaginaMagazin({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: business }, { data: { user } }] = await Promise.all([
    supabase.from("businesses").select("*").eq("slug", slug).single(),
    supabase.auth.getUser(),
  ]);
  if (!business) notFound();

  const isOwner = user?.id === business.user_id;

  const admin = createAdminClient();
  const { data: storeSettings } = await admin
    .from("store_settings")
    .select("id, business_id, page_content, store_policies, default_shipping_cost, free_shipping_threshold, min_order_amount, storefront_design, storefront_design_draft")
    .eq("business_id", business.id)
    .single();

  const host = (await headers()).get("host")?.split(":")[0] ?? "";
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${slug}`;

  // Ciorna se randeaza DOAR pentru proprietar si doar in preview, exact ca pe
  // pagina principala; pana la Publica, vizitatorii vad versiunea publicata.
  const isPreview = sp.preview === "1";
  const useDraft = isPreview && isOwner && !!storeSettings?.storefront_design_draft;
  const resolved = resolveDesign(useDraft ? storeSettings?.storefront_design_draft : storeSettings?.storefront_design, {
    primaryColor: business.primary_color ?? "#1AB554",
    pageContent: (storeSettings?.page_content as Record<string, unknown>) ?? {},
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });

  /*
   * Magazinul cu un singur produs n-are catalog, prin definitie.
   *
   * Verificarea NU e in tiparul copiat de la cos, si lipsa ei ar fi anulat
   * dintr-o data cele trei reguli ale modului: pagina principala randeaza
   * produsul in locul catalogului, `/product/*` face 301 catre ea, iar sitemapul
   * nu listeaza produse. O pagina care le arata pe toate, indexabila, ar fi
   * ocolit toate trei. Se verifica INAINTEA gate-ului de design.
   */
  if (parseStoreMode((storeSettings?.page_content as Json) ?? null).mode === "one_product") {
    redirect(radacinaMagazin(basePath));
  }

  // Magazinul are produsele pe pagina principala: aici n-are ce cauta nimeni.
  // Redirect, nu 404 — un link vechi trebuie sa duca in magazin, nu intr-o
  // pagina de eroare.
  if (!shopOnPage(resolved.design)) redirect(radacinaMagazin(basePath));

  if (!business.is_published && !isOwner) redirect(radacinaMagazin(basePath));

  // Magazin suspendat sau abonament expirat: pagina principala arata deja
  // „suspendat", dar de aici se putea cumpara mai departe. Aceeasi verificare ca
  // pe rutele frate de cos si de finalizare; proprietarul trece.
  if (!isOwner) {
    let suspendat = business.suspended_until ? new Date(business.suspended_until) < new Date() : false;
    if (!suspendat) {
      const { data: ownerProfile } = await admin
        .from("users_profile").select("plan, plan_expires_at").eq("id", business.user_id).single();
      if ((ownerProfile?.plan === "free" || ownerProfile?.plan === "trial") && ownerProfile?.plan_expires_at) {
        suspendat = new Date(ownerProfile.plan_expires_at) < new Date();
      }
    }
    if (suspendat) {
      return (
        <SuspendedStorePage
          businessName={business.store_name ?? business.business_name}
          primaryColor={business.primary_color}
          phone={business.phone}
        />
      );
    }
  }

  // Catalogul complet, in ferestre: un query simplu se trunchiaza silentios la
  // 1000 de randuri (cap PostgREST) si ar ascunde produse.
  const [productsRaw, categoriesData] = await Promise.all([
    fetchAllRows("storefront.magazin.products", (from, to) =>
      supabase
        .from("products")
        .select(COLOANE_CATALOG)
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("sort_order")
        .order("id")
        .range(from, to)),
    fetchAllRows("storefront.magazin.categories", (from, to) =>
      supabase
        .from("categories")
        .select("id, name, parent_id, image_url, sort_order")
        .eq("business_id", business.id)
        .order("sort_order")
        .order("id")
        .range(from, to)),
  ]);

  /*
   * Fatetele se calculeaza AICI, pe randurile brute.
   *
   * `slimCatalogProduct` reconstruieste `page_sections` si pastreaza doar
   * variantele si pachetul, deci brandul si specificatiile nu mai exista in
   * browser. Calculate dupa slimuire, jumatate din filtre ar fi fost mereu
   * goale.
   */
  const index = construiesteFatete(productsRaw);
  const products = productsRaw.map((p) => {
    const slim: Record<string, unknown> = { ...slimCatalogProduct(p) };
    // `tags` a fost cerut doar pentru fatete, care sunt gata: in browser nu il
    // citeste nimeni, iar la 1221 de produse ar fi zeci de kilobytes degeaba.
    delete slim.tags;
    const f = index.perProdus.get(p.id);
    if (f) slim.f = f;
    return slim as unknown as StorefrontProduct;
  });

  // Analitica: aterizarile directe pe pagina de catalog sunt vizite reale, la
  // fel ca cele pe pagina principala. Aceleasi excluderi — proprietarul si
  // gazdele care nu sunt de productie, ca preview-ul sa nu scrie in statistici.
  if (!isOwner && !isNonProductionHost(host)) {
    const ua = (await headers()).get("user-agent") ?? "";
    const device = /mobile/i.test(ua) ? "mobile" : /tablet/i.test(ua) ? "tablet" : "desktop";
    supabase.from("site_analytics").insert({ business_id: business.id, event_type: "visit", device, country: "RO" }).then(() => {});
  }

  const filtre = citesteFiltreDinAdresa(sp, index.fatete);
  // `?cat=` poate purta numele categoriei (headere, footer) sau id-ul ei
  // (linkurile de meniu de tip categorie). Filtrul lucreaza pe nume, deci
  // id-urile se traduc aici; altfel linkul din meniu ar duce la un catalog gol.
  const initialCategory =
    (filtre.categorie && categoriesData.find((c) => c.id === filtre.categorie)?.name) || filtre.categorie || "toate";

  /*
   * Ciorna de design nu are voie sa iasa din functia asta.
   *
   * `storeSettings` ajunge INTREG ca prop la o componenta de client, iar React
   * serializeaza props-urile in HTML: coloana de ciorna — pana la 200 KB de
   * design nepublicat — ar ajunge in pagina fiecarui vizitator anonim. Tipul
   * propului n-o contine, dar un tip nu curata nimic la executie.
   */
  const setariDeTrimis = storeSettings ? { ...storeSettings, storefront_design_draft: null } : null;

  return (
    <MiniStoreRenderer
      surface="shop"
      business={business}
      products={products}
      storeSettings={setariDeTrimis as never}
      basePath={basePath}
      categories={categoriesData}
      design={resolved.design}
      designStyle={resolved.style}
      preview={isPreview && isOwner}
      fatete={index.fatete}
      jetoane={index.jetoane}
      initialPage={filtre.pagina}
      initialSearch={filtre.cautare}
      initialCategory={initialCategory}
      initialOnSale={filtre.reduceri}
      initialInStock={filtre.stoc}
      initialPriceMin={filtre.pretMin}
      initialPriceMax={filtre.pretMax}
      initialSelectieFatete={filtre.fatete}
    />
  );
}
