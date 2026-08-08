import { COLOANE_BUSINESS_PUBLIC, pentruBrowser } from "@/lib/storefront/business-public";
import { disponibilitatePachet } from "@/lib/bundles";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseStoreSeo, deriveStoreTitle, deriveStoreDescription } from "@/lib/seo";
import { MiniStoreRenderer } from "@/components/ministore/MiniStoreRenderer";
import { ProductPageSection } from "@/components/storefront/sections/product/ProductPageSection";
import { SuspendedStorePage } from "@/components/ministore/SuspendedStorePage";
import { parseStoreMode } from "@/lib/storefront/store-mode";
import { getStoreProduct, enrichStoreProduct } from "@/lib/storefront/product-data";
import { resolveProductOffers } from "@/lib/offers/offers";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { COLOANE_PROIECTIE, dinProiectie, proiectieDb, type RandProiectie } from "@/lib/storefront/catalog/din-proiectie";
import { alegePalier } from "@/lib/storefront/catalog/tier";
import { incarcaAcasaDeLaServer } from "@/lib/storefront/catalog/acasa-server";
import type { Fateta as FatetaCatalog } from "@/lib/storefront/catalog/facets";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import { isNonProductionHost } from "@/lib/storefront/host";
import { hrefCatalog } from "@/lib/storefront/category-href";
import { scrieFiltre } from "@/lib/storefront/catalog/url";
import { SEGMENT_MAGAZIN, grilaRamaneAcasa, radacinaCatalog, shopOnPage } from "@/lib/storefront/design/commerce";
import { parseStoreDesign, resolveDesign } from "@/lib/storefront/design/parse";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { buildProductJsonLd } from "@/lib/storefront/product-jsonld";
import type { Json } from "@/types/database.types";
import { headers } from "next/headers";
import { after } from "next/server";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { jsonLdSafe } from "@/lib/json-ld";

interface Props { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string; preview?: string; q?: string; cat?: string; sale?: string }>; }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { page: pageQ, cat: catQ, sale: saleQ } = await searchParams;
  // Read via the service role: the SEO overrides live in store_settings, which
  // is no longer anon-readable, so a nested anon select would return null there.
  const { data: business } = await createAdminClient()
    .from("businesses")
    .select("id, business_name, store_name, tagline, description, store_city, cover_url, custom_domain, store_settings(page_content, storefront_design)")
    .eq("slug", slug)
    .single();
  if (!business) return {};

  // Merchant overrides (Settings > SEO) win; otherwise fall back to the
  // auto-derived defaults (single source of truth in @/lib/seo).
  const rawSettings = (business as unknown as { store_settings: { page_content: unknown; storefront_design?: unknown } | { page_content: unknown; storefront_design?: unknown }[] | null }).store_settings;
  const settings = Array.isArray(rawSettings) ? rawSettings[0] : rawSettings;
  const seo = parseStoreSeo(settings?.page_content ?? null);
  // Designul PUBLICAT, doar ca sa stim daca exista pagina de catalog. Contextul e
  // minimal: intrebarea nu depinde de culori sau de bannere.
  const designPtSeo = parseStoreDesign(
    (settings as { storefront_design?: unknown } | null)?.storefront_design ?? null,
    { primaryColor: "#1AB554", pageContent: {}, features: {} },
  );

  const displayName = business.store_name ?? business.business_name;
  const title = seo.title || deriveStoreTitle(displayName, business.store_city);
  const description = seo.description || deriveStoreDescription({ tagline: business.tagline, description: business.description, displayName });
  // When a custom domain is configured, consolidate SEO to it (so edinio.com/slug
  // also points its canonical at the store's own domain).
  const radacina = business.custom_domain ? `https://${business.custom_domain}` : `https://www.edinio.com/${slug}`;
  /*
   * Canonicalul urmeaza filtrele care CHIAR schimba continutul.
   *
   * Paginile 2..N, categoriile si reducerile sunt adrese crawlabile, cu produse
   * diferite; toate aratau catre radacina, deci Google le vedea ca duplicate ale
   * primei pagini si nu indexa niciuna. Cautarea libera (?q=) ramane in afara:
   * acolo canonicalul catre radacina e corect, sunt infinit de multe.
   */
  // Codificarea e cea din linkuri (`encodeURIComponent`), nu cea din
  // `URLSearchParams`: aceea scrie spatiile cu `+`, deci canonicalul ar arata
  // catre alta adresa decat cea pe care a crawlat-o Google.
  const filtre: string[] = [];
  if (catQ) filtre.push(`cat=${encodeURIComponent(catQ)}`);
  if (saleQ === "1") filtre.push("sale=1");
  const nrPagina = Math.max(1, parseInt(pageQ ?? "1", 10) || 1);
  if (nrPagina > 1) filtre.push(`page=${nrPagina}`);
  const sir = filtre.join("&");
  /*
   * Cand catalogul are si pagina lui, versiunile FILTRATE ale paginii principale
   * arata canonical catre ea.
   *
   * `/?cat=Manusi` si `/magazin?cat=Manusi` listeaza aceleasi produse. Lasate
   * amandoua auto-canonice, Google ar fi ales singur intre ele si ar fi impartit
   * semnalul de link in doua. Canonicalul e exact unealta pentru asta: cele doua
   * adrese raman functionale pentru vizitator, dar una singura se indexeaza.
   *
   * Pagina principala NEfiltrata isi pastreaza canonicalul ei: nu e un duplicat,
   * are hero, randuri alese si restul sectiunilor pe langa grila.
   */
  const areCatalogSeparat = shopOnPage(designPtSeo);
  const radacinaCanonic = areCatalogSeparat && sir ? `${radacina}/${SEGMENT_MAGAZIN}` : radacina;
  const url = sir ? `${radacinaCanonic}?${sir}` : radacina;

  // One Product Store: the homepage *is* the chosen product's landing page, so its
  // metadata comes from that product (canonical stays on the homepage URL). Store
  // SEO overrides (Settings > SEO) still win when set.
  const storeMode = parseStoreMode(settings?.page_content ?? null);
  if (storeMode.mode === "one_product" && storeMode.productId) {
    const product = await getStoreProduct(business.id, storeMode.productId);
    if (product) {
      const ps = product.page_sections as { seo?: { title?: string; description?: string }; short_description?: string } | null;
      const opsTitle = seo.title || ps?.seo?.title || product.name;
      const opsDescription = seo.description
        || ps?.seo?.description
        || (ps?.short_description ? ps.short_description.replace(/<[^>]+>/g, "").slice(0, 155) : "")
        || (product.description ? product.description.replace(/<[^>]+>/g, "").slice(0, 155) : product.name);
      const pImgs = product.images as string[] | null;
      const opsImage = seo.ogImage || pImgs?.[0] || business.cover_url;
      const opsImages = opsImage ? [opsImage] : [];
      return {
        title: { absolute: opsTitle },
        description: opsDescription,
        ...(seo.noindex ? { robots: { index: false, follow: true } } : {}),
        // `type` si `locale` se scriu explicit: obiectul asta inlocuieste in
        // intregime openGraph-ul din layout-ul radacina, deci ce nu e aici nu se
        // emite deloc, iar og:type e obligatoriu in protocol.
        openGraph: { type: "website", locale: "ro_RO", siteName: displayName, title: opsTitle, description: opsDescription, url, images: opsImages },
        twitter: {
          card: opsImages.length ? "summary_large_image" : "summary",
          title: opsTitle,
          description: opsDescription,
          ...(opsImages.length ? { images: opsImages } : {}),
        },
        alternates: { canonical: url },
      };
    }
    // Chosen product missing/inactive — fall through to the store metadata below.
  }

  const ogImage = seo.ogImage || business.cover_url;
  const images = ogImage ? [ogImage] : [];
  return {
    // `absolute` strips the root layout's "%s | Edinio" template — storefronts
    // must show only the merchant's own name in Google / browser tabs.
    title: { absolute: title },
    description,
    // Advanced opt-in: hide the homepage from search. "follow" stays on so
    // crawlers still reach the (indexable) product pages it links to.
    ...(seo.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: { type: "website", locale: "ro_RO", siteName: displayName, title, description, url, images },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      ...(images.length ? { images } : {}),
    },
    alternates: { canonical: url },
  };
}

export default async function SlugPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageParam, preview: previewParam, q: qParam, cat: catParam, sale: saleParam } = await searchParams;
  const initialPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const isPreview = previewParam === "1";
  const supabase = await createClient();

  const [{ data: business }, { data: { user } }] = await Promise.all([
    supabase.from("businesses").select(COLOANE_BUSINESS_PUBLIC).eq("slug", slug).single(),
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

  /*
   * Ordinea: setarile si agregatele INTAI, decizia, apoi produsele.
   *
   * Decizia „cine feliaza" are nevoie si de comutatoarele din `page_content`, si
   * de numarul total din rezumat. Citite in acelasi val cu produsele, palierul
   * server ar fi adus si tot catalogul, SI pagina.
   */
  const [{ data: storeSettings }, categoriesData, rezumatRaspuns] = await Promise.all([
    createAdminClient()
      .from("store_settings")
      // Coloanele de TVA sunt necesare pentru eticheta de langa pret: prima pagina
      // randeaza pagina de produs cand magazinul e „un singur produs". Vezi ruta
      // /product/[productSlug], unde lipseau la fel.
      .select("id, business_id, page_content, store_policies, default_shipping_cost, free_shipping_threshold, min_order_amount, storefront_design, storefront_design_draft, vat_enabled, prices_include_vat, show_vat_label")
      .eq("business_id", business.id)
      .single(),
    fetchAllRows("storefront.home.categories", (from, to) =>
      supabase
        .from("categories")
        .select("id, name, parent_id, image_url, sort_order")
        .eq("business_id", business.id)
        .order("sort_order")
        .order("id")
        .range(from, to)
    ),
    proiectieDb()
      .from("catalog_rezumat")
      .select("total, price_min, price_max, categorii, fatete")
      .eq("business_id", business.id)
      .eq("fara_imagini", false)
      .eq("fara_stoc_ascuns", false)
      .maybeSingle(),
  ]);

  /*
   * Ciorna de design nu are voie sa iasa din functia asta.
   *
   * `storeSettings` ajunge INTREG ca prop la componente de client, iar React
   * serializeaza props-urile in HTML: coloana de ciorna — pana la 200 KB de
   * design nepublicat — ajungea in pagina fiecarui vizitator anonim, desi
   * migratia promitea exact contrariul. Tipul propului n-o contine, dar un tip
   * nu curata nimic la executie.
   */
  // Ciorna se randeaza DOAR pentru proprietar si doar in preview: pana la
  // Publica, vizitatorii vad neaparat versiunea publicata.
  const useDraft = isPreview && isOwner && !!storeSettings?.storefront_design_draft;
  const designDeRandat = useDraft ? storeSettings?.storefront_design_draft : storeSettings?.storefront_design;

  const setariDeTrimis = storeSettings
    ? (() => { const { storefront_design_draft: _ciorna, ...rest } = storeSettings; return rest as typeof storeSettings; })()
    : storeSettings;

  const pcCatalog = (storeSettings?.page_content as Record<string, unknown>) ?? {};
  const faraImagini = pcCatalog.hide_products_without_images === true;
  const faraStocAscuns = pcCatalog.hide_out_of_stock_products === true;

  /*
   * Rezumatul cerut mai sus e cel cu AMBELE comutatoare stinse, fiindca abia
   * dupa ce citim setarile stim care rand ne trebuie. Cand comutatoarele sunt
   * pornite, se cere randul potrivit — un al doilea dus-intors, dar numai la
   * magazinele care chiar folosesc comutatoarele.
   */
  let rezumat = (rezumatRaspuns.data ?? null) as unknown as {
    total: number; price_min: number; price_max: number; categorii: string[];
    fatete: { jetoane?: string[]; fatete?: FatetaCatalog[] };
  } | null;
  if (rezumat && (faraImagini || faraStocAscuns)) {
    const { data } = await proiectieDb()
      .from("catalog_rezumat")
      .select("total, price_min, price_max, categorii, fatete")
      .eq("business_id", business.id)
      .eq("fara_imagini", faraImagini)
      .eq("fara_stoc_ascuns", faraStocAscuns)
      .maybeSingle();
    if (data) rezumat = data as unknown as typeof rezumat;
  }

  // Categoria din adresa, rezolvata din ID in NUME ca la `initialCategory` de mai
  // jos. Se calculeaza aici fiindca palierul server are nevoie de ea INAINTE de
  // a cere pagina.
  const catRawSus = (catParam ?? "").slice(0, 100);
  const categorieAcasa =
    (catRawSus && categoriesData.find((c) => c.id === catRawSus)?.name) || catRawSus || "";

  const seCautaAcasa = (qParam ?? "").trim().length > 0;
  const palier = rezumat
    ? alegePalier({ pageContent: pcCatalog, totalProduse: rezumat.total, cauta: seCautaAcasa })
    : "client";
  const peServer = palier === "server";

  let products: StorefrontProduct[] = [];
  let totalVizibile = 0;
  let totalFiltrate = 0;
  let featuredServer: StorefrontProduct[] | undefined;
  let sectiuniServer: Record<string, StorefrontProduct[]> | undefined;
  let reusitPeServer = false;

  if (peServer && rezumat) {
    reusitPeServer = await incarcaAcasaDeLaServer({
      businessId: business.id,
      pagina: initialPage,
      pageContent: pcCatalog,
      categorii: categoriesData,
      faraImagini,
      faraStocAscuns,
      rezumat,
      sortareImplicita: (pcCatalog.sort_options as { default_sort?: string } | undefined)?.default_sort || "newest",
      categorie: categorieAcasa,
      reduceri: saleParam === "1",
      preia: (r) => {
        products = r.products; totalVizibile = r.totalVizibile; totalFiltrate = r.totalFiltrate;
        featuredServer = r.featured; sectiuniServer = r.sectiuni;
      },
    });
  }

  if (!reusitPeServer) {
    const productsRaw = await fetchAllRows("storefront.home.products", (from, to) =>
      /*
       * Service role, si de ce e in regula.
       *
       * `catalog_produs` are RLS pornit si NICIO politica, deci se citeste doar cu
       * cheia de serviciu. Cu asta pierdem politica de pe `products`, care cerea
       * „produs activ AL UNEI AFACERI PUBLICATE" — iar acum ambele conditii sunt
       * tinute in alta parte: ACTIV prin declansator, iar PUBLICAT prin poarta din
       * codul de mai sus, care iese din functie inainte sa se ajunga aici.
       *
       * Poarta aia nu mai are voie sa se mute sub aceasta citire.
       */
      proiectieDb()
        .from("catalog_produs")
        .select(COLOANE_PROIECTIE)
        .eq("business_id", business.id)
        .order("is_featured", { ascending: false })
        .order("sort_order")
        .order("product_id")
        .range(from, to));
    products = (productsRaw as unknown as RandProiectie[]).map(dinProiectie);
    totalVizibile = products.length;
    totalFiltrate = products.length;
  }

  // Detect custom domain access
  const headersList = await headers();
  const host = (headersList.get("host") ?? "").split(":")[0];
  const isCustomDomain = business.custom_domain && host === business.custom_domain;
  const basePath = isCustomDomain ? "" : `/${business.slug}`;

  // Analitica, DUPA ce raspunsul a plecat (skip pentru proprietar). Sarita si pe
  // preview/localhost: acele medii scriu in baza de PRODUCTIE, deci fiecare
  // vizita de test ar aparea in statisticile comerciantului. Detalii in
  // lib/storefront/host.ts.
  if (!isOwner && !isNonProductionHost(host)) {
    const ua = headersList.get("user-agent") ?? "";
    const device = /mobile/i.test(ua) ? "mobile" : /tablet/i.test(ua) ? "tablet" : "desktop";
    /*
     * `after` in loc de promisiune lasata sa atarne.
     *
     * Un `.then(() => {})` nesupravegheat nu tine raspunsul, dar nici nu e
     * garantat: functia se poate incheia cu INSERT-ul inca in zbor, si atunci
     * vizita se pierde in tacere. `after` il muta explicit dupa raspuns si il
     * tine in viata pana se termina — deci si mai rapid, si mai sigur.
     *
     * Nu face ruta dinamica (documentatia lui `after`: „not a Request-time API").
     * `device` se citeste AICI, in randare, nu inauntru: antetele nu se pot citi
     * din callback.
     *
     * Scriem cu SERVICE ROLE, nu cu clientul vizitatorului. Politica publica de
     * INSERT (`with_check true`) a fost stearsa: permitea oricui cu cheia anon
     * sa injecteze evenimente pentru ORICE magazin — statistici otravite si
     * crestere necontrolata a bazei. Serverul stie deja ce magazin randeaza.
     */
    const ipVizitator = clientIpFromHeaders(headersList);
    /*
     * Limita pe IP inaintea scrierii.
     *
     * Scrierea de analitice era SINGURA scriere publica fara NICIUN limitator —
     * nici in memorie, nici durabil. Un script care cere `/{slug}` in bucla
     * insereaza un rand la fiecare cerere, cu service role, deci ocolind si RLS-ul
     * si orice plafon. Tabela a ajuns a cincea ca marime a bazei doar din trafic
     * NORMAL; e cel mai ieftin mod de a umfla baza platformei si de a otravi
     * statisticile unui comerciant.
     *
     * Exact atacul pentru care s-a sters deja politica publica de INSERT — doar ca
     * atunci s-a inchis usa clientului si a ramas deschisa cea a serverului.
     *
     * Sta INAUNTRUL lui `after`, deci nu intra pe drumul raspunsului. Iar `ip` se
     * citeste AICI, in randare: antetele nu se pot citi din callback.
     */
    after(async () => {
      const { permis } = await consumaLimita(`analytics:${ipVizitator}`, 120, 3600);
      if (!permis) return;
      await createAdminClient().from("site_analytics")
        .insert({ business_id: business.id, event_type: "visit", device, country: "RO" });
    });
  }

  // One Product Store: render the chosen product's landing page as the homepage,
  // reusing the same ProductPage component as /product/[slug]. Falls back to the
  // catalog below if the product is missing/inactive (defence in depth — the
  // Settings toggle already requires a product before enabling this mode).
  const storeMode = parseStoreMode((storeSettings?.page_content as Json) ?? null);
  if (storeMode.mode === "one_product" && storeMode.productId) {
    const product = await getStoreProduct(business.id, storeMode.productId);
    if (product) {
      const { altMap, hasCardPayment, bundleComponents } = await enrichStoreProduct(business, product);
      // Ofertele produsului, exact ca pe ruta normala de produs. Fara ele,
      // magazinul cu un singur produs era singurul unde „Cumparate impreuna" si
      // „Merge bine cu" nu se randau nicaieri: ruta /product/<principal> face
      // 301 incoace, deci nu mai ajunge niciodata la locul unde se rezolvau.
      const opsProductOffers = await resolveProductOffers(createAdminClient(), business.id, {
        id: product.id,
        category: product.category,
        price: Number(product.price) || 0,
      });
      // Product structured data for the landing page. The product's canonical URL
      // is this homepage (the /product/<main> URL 301s here), so the JSON-LD points
      // at the homepage too — mirrors the shipping/delivery used on the product route.
      const opsCanonical = isCustomDomain ? `https://${business.custom_domain}` : `https://www.edinio.com/${business.slug}`;
      const opsShippingCost = Number(storeSettings?.default_shipping_cost ?? 0) || 0;
      const opsDe = (storeSettings?.page_content as { delivery_estimate?: { enabled?: boolean; min_days?: number; max_days?: number } } | null)?.delivery_estimate;
      const opsDelivery = opsDe?.enabled ? { min: opsDe.min_days ?? 1, max: opsDe.max_days ?? 3 } : { min: 1, max: 3 };
      const opsJsonLd = buildProductJsonLd(product, opsCanonical, business.store_name ?? business.business_name, { cost: opsShippingCost, min: opsDelivery.min, max: opsDelivery.max },
        product.is_bundle && !disponibilitatePachet(bundleComponents).inStock);
      // Modul „un singur produs": nu exista catalog in spate, deci butonul de
      // cos din header n-are unde sa duca.
      const opsResolved = resolveDesign(designDeRandat, {
        primaryColor: business.primary_color ?? "#1AB554",
        pageContent: (storeSettings?.page_content as Record<string, unknown>) ?? {},
        features: (business.features as Record<string, unknown>) ?? {},
        coverUrl: business.cover_url,
        tagline: business.tagline,
      });
      // Categoriile pentru header/footer se aduc ca pe orice alta ruta fara
      // catalog: fara ele, subsolul paginii principale ramanea fara coloana de
      // categorii, desi paginile de produs ale ACELUIASI magazin o aveau plina.
      // `cartMode: "hidden"` ramane deasupra designului (chrome-value.ts:62), deci
      // cosul nu reapare.
      const opsSearchCategories = await loadSearchCategories(business.id, opsResolved.design);
      const opsChrome = buildChromeData({
        business,
        pageContent: (storeSettings?.page_content ?? {}) as StorePageContent,
        basePath,
        design: opsResolved.design,
        cartMode: "hidden",
        hasStickyBottomBar: true,
        searchCategories: opsSearchCategories,
      });
      return (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdSafe(opsJsonLd) }}
          />
          <StorefrontThemeScope style={opsResolved.style}>
            <StorePageShell chrome={opsChrome} design={opsResolved.design} className="min-h-screen">
              <ProductPageSection
                variant={opsResolved.design.product.page.variant}
                setari={opsResolved.design.product.page.settings}
                business={pentruBrowser(business)}
                product={product}
                storeSettings={setariDeTrimis as never}
                basePath={basePath}
                hasCardPayment={hasCardPayment}
                bundleComponents={bundleComponents}
                altMap={altMap}
                productOffers={opsProductOffers}
                isHome
              />
            </StorePageShell>
          </StorefrontThemeScope>
        </>
      );
    }
  }

  // Designul magazinului. Ciorna se randeaza DOAR pentru proprietar si doar in
  // preview: pana la Publica, vizitatorii vad neaparat versiunea publicata.

  const resolved = resolveDesign(
    designDeRandat,
    {
      primaryColor: business.primary_color ?? "#1AB554",
      pageContent: (storeSettings?.page_content as Record<string, unknown>) ?? {},
      features: (business.features as Record<string, unknown>) ?? {},
      coverUrl: business.cover_url,
      tagline: business.tagline,
    },
  );

  /*
   * Grila a plecat de pe pagina principala: adresele ei vechi o urmeaza.
   *
   * Doar cand comerciantul a stins anume „pastreaza produsele si pe pagina
   * principala". Cat timp grila ramane aici, `?cat=` face exact ce facea si nu
   * are de ce sa navigheze nicaieri.
   *
   * Cand a plecat insa, `?cat=`, `?sale=1` si `?page=N` — adrese crawlabile ale
   * grilei, zeci sau sute deja indexate la magazinele mari — ar fi ramas sa arate
   * o pagina de prezentare cu un parametru fara efect: nici 404, nici continutul
   * promis, adica exact felul de pagina pe care Google il scoate din index in
   * tacere.
   *
   * Permanent, nu temporar: mutarea e o alegere de design, nu un accident, iar
   * un 307 ar fi lasat semnalul de link pe adresa veche.
   */
  // Sarit in previzualizare: acolo designul poate fi ciorna, iar o navigare ar
  // scoate iframe-ul editorului din pagina si ar rupe legatura postMessage.
  const grilaAPlecat = shopOnPage(resolved.design) && !grilaRamaneAcasa(resolved.design);
  if (!isPreview && grilaAPlecat && (catParam || saleParam === "1" || pageParam || qParam)) {
    // `scrieFiltre` codifica spatiile cu %20, la fel ca linkurile de categorie si
    // ca toate canonicalele. `URLSearchParams` le-ar fi scris cu `+`, deci
    // redirectul ar fi produs o A DOUA adresa pentru exact acelasi continut.
    permanentRedirect(hrefCatalog(
      radacinaCatalog(basePath, resolved.design),
      scrieFiltre({
        categorie: catParam,
        cautare: qParam,
        reduceri: saleParam === "1",
        pagina: pageParam ? Number(pageParam) : undefined,
      }),
    ));
  }

  // `?cat=` poate veni cu numele categoriei (din header) sau cu id-ul ei
  // (linkurile de meniu de tip categorie trimit `target`, care e un id). Filtrul
  // catalogului lucreaza pe nume, deci id-urile se traduc aici; altfel linkul ar
  // duce la un catalog gol.
  const initialCategory = categorieAcasa || "toate";

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
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(storeJsonLd) }}
      />
      <MiniStoreRenderer
        business={pentruBrowser(business)}
        products={products}
        palier={palier}
        totalVizibileServer={totalVizibile}
        totalFiltrateServer={totalFiltrate}
        numeCategoriiCuProduse={peServer ? rezumat?.categorii : undefined}
        featuredServer={featuredServer}
        sectiuniServer={sectiuniServer}
        storeSettings={setariDeTrimis}
        basePath={basePath}
        categories={categoriesData}
        initialPage={initialPage}
        initialSearch={(qParam ?? "").slice(0, 100)}
        initialCategory={initialCategory}
        initialOnSale={saleParam === "1"}
        preview={isPreview}
        design={resolved.design}
        designStyle={resolved.style}
      />
    </>
  );
}
