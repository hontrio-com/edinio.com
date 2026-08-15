import { COLOANE_BUSINESS_PUBLIC } from "@/lib/storefront/business-public";
import { cache, Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createClient } from "@/lib/supabase/server";
import { Skeleton, SkeletonRanduri } from "@/components/ui/skeleton";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeBaseUrl } from "@/lib/seo";
import { jsonLdSafe } from "@/lib/json-ld";
import {
  articolJsonLd, blogJsonLd, firimituriJsonLd, graf, intrebariJsonLd, paginaWebJsonLd,
  type Editor, type TipPagina,
} from "@/lib/storefront/date-structurate";
import { autorPagina, dataPublicarii, imaginePagina, intrebariPagina, tipPagina } from "@/lib/pages/pagina-seo";
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
  const { data: business } = await supabase.from("businesses").select(COLOANE_BUSINESS_PUBLIC).eq("slug", slug).single();
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

/** Randul minim al unei pagini-sora, pentru legaturile dintre blog si articole. */
type PaginaSora = { slug: string; title: string; seo: unknown; created_at: string };

const COLOANE_SORA = "slug, title, seo, created_at";

/**
 * Datele structurate ale unei pagini proprii.
 *
 * ═══ DE CE E O FUNCTIE SEPARATA ═══
 *
 * Aceeasi ruta serveste patru lucruri diferite — pagina de prezentare, articolul
 * de blog, pagina care aduna articolele si vitrina unei familii de produse — iar
 * pana acum le descria pe toate la fel: cu nimic. Un comerciant a reclamat exact
 * asta: articolele lui erau indexate ca pagini oarecare, fara titlu de articol,
 * fara imagine si fara data.
 *
 * Ce fel de pagina e se DECLARA din editor (`seo.tip`), nu se ghiceste din
 * blocuri sau din slug — vezi `TipPaginaProprie`. Cine n-a declarat nimic
 * primeste `WebPage` + firimituri, adica exact ce se poate afirma despre orice
 * pagina: cum se numeste, unde sta si pe ce drum se ajunge la ea.
 */
async function dateStructuratePagina(
  supabase: SupabaseClient<Database>,
  business: { id: string; slug: string; custom_domain: string | null; business_name: string; store_name: string | null; logo_url: string | null },
  page: { id: string; slug: string; title: string; seo: unknown; blocks: unknown; created_at: string; updated_at: string },
  blocks: Block[],
): Promise<string | null> {
  const seo = (page.seo ?? {}) as PageSeo;
  /*
   * Pagina scoasa din Google n-are ce descrie. Sitemapul o sare deja
   * (`sitemap.xml/route.ts`), deci regula exista — aici doar se oglindeste, ca
   * `<head>` si `<script>` sa nu spuna lucruri diferite despre aceeasi adresa.
   */
  if (seo.noindex) return null;

  const radacina = storeBaseUrl(business);
  const url = `${radacina}/${page.slug}`;
  const numeMagazin = business.store_name ?? business.business_name;
  const editor: Editor = { nume: numeMagazin, url: radacina, logo: business.logo_url };
  const titlu = (seo.title || page.title).trim();
  const tip = tipPagina(seo);
  const imagine = imaginePagina(seo, blocks);

  const trepte = [{ nume: numeMagazin, url: radacina }];
  let principal = null;

  if (tip === "articol") {
    /*
     * Blogul din care face parte articolul: pagina-sora marcata drept lista.
     *
     * Se citeste din baza, nu dintr-un slug fixat („/blog"): comerciantul isi
     * numeste pagina cum vrea — „ghiduri", „resurse", „noutati" — iar o
     * conventie scrisa in cod ar fi mers doar la cei care au nimerit-o.
     */
    const { data: blogBrut } = await supabase
      .from("custom_pages").select(COLOANE_SORA)
      .eq("business_id", business.id).eq("is_published", true)
      .eq("seo->>tip", "lista-articole")
      .order("sort_order").limit(5);
    // Un blog scos din Google nu poate fi parintele declarat al unui articol
    // indexabil: adresa lui raspunde `noindex` si lipseste din sitemap, deci
    // `isPartOf` si treapta de firimitura ar trimite catre o pagina despre care
    // spunem singuri ca nu vrem sa fie gasita.
    const blog = ((blogBrut ?? []) as unknown as PaginaSora[])
      .find((b) => !((b.seo ?? {}) as PageSeo).noindex) ?? null;
    if (blog) trepte.push({ nume: blog.title, url: `${radacina}/${blog.slug}` });
    principal = articolJsonLd({
      titlu,
      url,
      descriere: seo.description,
      imagine,
      dataPublicarii: dataPublicarii(seo, page.created_at),
      dataModificarii: page.updated_at,
      editor,
      autor: autorPagina(seo),
      blog: blog ? { nume: blog.title, url: `${radacina}/${blog.slug}` } : null,
    });
  } else if (tip === "lista-articole") {
    const { data: articoleBrut } = await supabase
      .from("custom_pages").select(COLOANE_SORA)
      .eq("business_id", business.id).eq("is_published", true)
      .eq("seo->>tip", "articol")
      .order("created_at", { ascending: false }).limit(150);
    /*
     * ⚠ Articolul ascuns din motoarele de cautare NU se anunta pe pagina-parinte.
     *
     * Bifa „Ascunde din motoarele de cautare" si tipul „Articol de blog" sunt
     * doua comutatoare independente in editor, deci pot fi amandoua aprinse.
     * Adresa acelui articol raspunde `noindex, nofollow` si lipseste din sitemap
     * — iar `blogPost` l-ar fi anuntat oricum, cu titlu, imagine si data. Al
     * doilea semnal, care il contrazice pe primul, si singurul loc din care s-ar
     * fi aflat ca pagina exista.
     *
     * Filtrul se face AICI, nu in interogare: `seo->>noindex` e NULL pe aproape
     * toate randurile (cheia nici nu exista), iar in SQL `NULL = 'true'` nu e
     * fals, e NULL — deci un `.not(...)` ar fi taiat tacut aproape toate
     * articolele. De aia si limita a urcat la 150: taierea se face dupa.
     */
    const articole = ((articoleBrut ?? []) as unknown as PaginaSora[])
      .filter((a) => !((a.seo ?? {}) as PageSeo).noindex);
    principal = blogJsonLd({
      nume: titlu,
      url,
      descriere: seo.description,
      editor,
      articole: articole.map((a) => {
        const seoSora = (a.seo ?? {}) as PageSeo;
        return {
          titlu: (seoSora.title || a.title).trim(),
          url: `${radacina}/${a.slug}`,
          // Poza articolului din lista vine DOAR din campul declarat: blocurile
          // surorilor nu sunt aduse (ar fi o interogare grea pe fiecare) si mai
          // bine fara imagine decat cu una a altui articol.
          imagine: seoSora.ogImage,
          dataPublicarii: dataPublicarii(seoSora, a.created_at),
        };
      }),
    });
  } else {
    const tipuri: Record<string, TipPagina> = { colectie: "CollectionPage", contact: "ContactPage" };
    principal = paginaWebJsonLd({
      tip: tipuri[tip] ?? "WebPage",
      nume: titlu,
      url,
      descriere: seo.description,
      imagine,
      dataModificarii: page.updated_at,
    });
  }

  trepte.push({ nume: page.title.trim(), url });

  /*
   * Intrebarile frecvente sunt un nod IN PLUS, nu tipul paginii.
   *
   * Blocul `faq` exista pe cinci pagini publicate si nu ajungea nicaieri: omul
   * scrie intrebarile in editor, ele se afiseaza, si niciun crawler nu afla ca
   * sunt intrebari. O pagina cu o sectiune de intrebari nu devine insa „pagina de
   * intrebari" — de aia nodul sta langa cel principal, nu in locul lui.
   */
  const nod = graf(principal, firimituriJsonLd(trepte), intrebariJsonLd(intrebariPagina(blocks)));
  return nod ? jsonLdSafe(nod) : null;
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
    createAdminClient().from("store_settings").select("page_content, storefront_design, default_shipping_cost, free_shipping_threshold, min_order_amount, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown").eq("business_id", business.id).single(),
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
  /*
   * Datele structurate, dar NU pe ciorna.
   *
   * O pagina nepublicata se vede doar de proprietar, in previzualizare (bannerul
   * de mai jos). Ce descrie ea nu exista public, deci n-are ce sa ajunga la un
   * crawler care s-ar nimeri autentificat.
   */
  const dateStructurate = page.is_published
    ? await dateStructuratePagina(supabase, business, page, blocks)
    : null;
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
      vat: {
        vat_enabled: storeSettings?.vat_enabled ?? false,
        vat_rate: Number(storeSettings?.vat_rate ?? 19),
        prices_include_vat: storeSettings?.prices_include_vat ?? true,
        show_vat_breakdown: storeSettings?.show_vat_breakdown ?? true,
      },
    },
  });

  /*
   * Identitatea magazinului pleaca IMEDIAT; blocurile curg dupa ea.
   *
   * Fiecare bloc de produse de pe pagina isi face propria interogare, deci o
   * pagina cu trei randuri de produse tinea header-ul, bara de anunt si subsolul
   * blocate pana raspundea si ultimul. Toate verificarile de mai sus — magazin
   * inexistent, nepublicat, suspendat, pagina lipsa sau ciorna — s-au decis
   * deja, deci sub `<Suspense>` nu mai poate ajunge niciun `notFound()`.
   */
  return (
    <StorefrontThemeScope style={resolved.style}>
      {/* Deasupra tuturor blocurilor, deci in afara lui `<Suspense>`: nodul se
          compune numai din randul paginii si din blocurile ei, fara nicio
          interogare de produse, deci n-are de ce sa astepte. */}
      {dateStructurate ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: dateStructurate }} />
      ) : null}
      {pageCss ? <style dangerouslySetInnerHTML={{ __html: pageCss }} /> : null}
      <StorePageShell chrome={chrome} design={resolved.design} className="min-h-screen flex flex-col">
        {!page.is_published && isOwner && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center py-2 px-4">
            Aceasta pagina este in modul ciorna (draft) si o vezi doar tu. Publica-o din panou pentru a o face vizibila.
          </div>
        )}
        <main id={`edinio-page-${page.id}`} className="flex-1">
          <Suspense fallback={<ScheletBlocuri />}>
            <BlocuriPagina
              supabase={supabase}
              businessId={business.id}
              blocks={blocks}
              hideNoImage={pageContent.hide_products_without_images === true}
              hideOutOfStock={pageContent.hide_out_of_stock_products === true}
              color={color}
              basePath={basePath}
              storeSlug={business.slug}
              social={social}
              forms={forms}
              pageId={page.id}
            />
          </Suspense>
        </main>
      </StorePageShell>
    </StorefrontThemeScope>
  );
}

/**
 * Forma unei pagini construite din blocuri: o banda lata sus (hero sau imagine),
 * apoi titlu si cateva randuri de continut.
 */
function ScheletBlocuri() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-[320px] rounded-none" />
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Skeleton className="h-8 w-64" />
        <SkeletonRanduri randuri={3} inaltime="h-28" className="mt-6" />
      </div>
    </div>
  );
}

async function BlocuriPagina({
  supabase, businessId, blocks, hideNoImage, hideOutOfStock,
  color, basePath, storeSlug, social, forms, pageId,
}: {
  supabase: SupabaseClient<Database>;
  businessId: string;
  blocks: Block[];
  hideNoImage: boolean;
  hideOutOfStock: boolean;
  color: string;
  basePath: string;
  storeSlug: string;
  social: Record<string, string>;
  forms: PublicForm[];
  pageId: string;
}) {
  // Resolve each products-block server-side with a hard cap (scales to huge catalogs).
  // Respecta setarea de vizibilitate a catalogului (ascunde fara imagini / fara stoc).
  const productsByBlock = await resolveAllProductsBlocks(supabase, businessId, blocks, {
    hideNoImage,
    hideOutOfStock,
  });

  return (
    <BlockRenderer
      blocks={blocks}
      ctx={{ color, basePath, storeSlug, social, products: [], productsByBlock, forms, businessId, pageId }}
    />
  );
}
