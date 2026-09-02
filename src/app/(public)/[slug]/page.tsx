import { pentruBrowser } from "@/lib/storefront/business-public";
import { textCurat } from "@/lib/storefront/date-structurate";
import { graf, magazinJsonLd } from "@/lib/storefront/date-structurate";
import { incarcaMagazinul, metadataMagazinNepublicat } from "@/lib/storefront/antet-magazin";
import { disponibilitatePachet } from "@/lib/bundles";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseStoreSeo, deriveStoreTitle, deriveStoreDescription, storeBaseUrl } from "@/lib/seo";
import { MiniStoreRenderer } from "@/components/ministore/MiniStoreRenderer";
import { ProductPageDinDesign } from "@/components/storefront/sections/product/ProductPageDinDesign";
import { SuspendedStorePage } from "@/components/ministore/SuspendedStorePage";
import { parseStoreMode } from "@/lib/storefront/store-mode";
import { getStoreProduct, enrichStoreProduct } from "@/lib/storefront/product-data";
import { resolveProductOffers } from "@/lib/offers/offers";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { COLOANE_PROIECTIE, dinProiectie, proiectieDb, type RandProiectie } from "@/lib/storefront/catalog/din-proiectie";
import { alegePalier } from "@/lib/storefront/catalog/tier";
import { categoriiVizibile, numeCategoriiAscunse } from "@/lib/categories/vizibilitate";
import { incarcaAcasaDeLaServer } from "@/lib/storefront/catalog/acasa-server";
import { citesteAsezare, samantaAmestec, sortareaAsezarii } from "@/lib/storefront/asezare";
import type { Fateta as FatetaCatalog } from "@/lib/storefront/catalog/facets";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import { isNonProductionHost } from "@/lib/storefront/host";
import { hrefCatalog } from "@/lib/storefront/category-href";
import { citesteFiltreDinAdresa, scrieFiltre } from "@/lib/storefront/catalog/url";
import { SEGMENT_MAGAZIN, grilaRamaneAcasa, radacinaCatalog, shopOnPage } from "@/lib/storefront/design/commerce";
import { parseStoreDesign, resolveDesign } from "@/lib/storefront/design/parse";
import { esteEditorDeDesign } from "@/lib/storefront/design/preview-protocol";
import { StorePageShell } from "@/components/storefront/StorePageShell";
import { buildChromeData, loadSearchCategories } from "@/lib/storefront/chrome-value";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { buildProductJsonLd } from "@/lib/storefront/product-jsonld";
import { parseTimpDeLivrare } from "@/lib/shipping/delivery-time";
import type { Json } from "@/types/database.types";
import { headers } from "next/headers";
import { after } from "next/server";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { jsonLdSafe } from "@/lib/json-ld";
import { clasificaSursa, taraDinAnteturi, referrerScurt, primaValoare } from "@/lib/storefront/sursa-vizita";

/*
 * `sort`, `pmin`, `pmax` si `stoc` sunt aici fiindca grila paginii principale are
 * chiar controalele lor (bara `catalog_toolbar`), iar pe palierul server un
 * control care nu ajunge in adresa nu poate face NIMIC: lista vine gata filtrata
 * din baza. Pana acum se opreau in memoria browserului — ceea ce mergea cat timp
 * browserul avea tot catalogul si filtra pe loc.
 */
interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    page?: string; preview?: string; editor?: string; q?: string; cat?: string; sale?: string;
    sort?: string; pmin?: string; pmax?: string; stoc?: string;
    /* Semnalele de provenienta. Vezi `lib/storefront/sursa-vizita.ts`. */
    utm_source?: string; gclid?: string; fbclid?: string; ttclid?: string;
  }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { page: pageQ, cat: catQ, sale: saleQ } = await searchParams;
  // Read via the service role: the SEO overrides live in store_settings, which
  // is no longer anon-readable, so a nested anon select would return null there.
  const { data: business } = await createAdminClient()
    .from("businesses")
    .select("id, business_name, store_name, tagline, description, store_city, cover_url, custom_domain, is_published, store_settings(page_content, storefront_design)")
    .eq("slug", slug)
    .single();
  if (!business) return {};

  /*
   * Vitrina NEPUBLICATA raspunde 200 (ecranul „in curand disponibil"), deci
   * metadata ei trebuie sa spuna explicit `noindex` — altfel magazinele in lucru
   * intra in indexul Google ca pagini goale si raman acolo si dupa publicare,
   * concurand chiar pagina adevarata. Vezi `incarcaMagazinul`.
   */
  if (!business.is_published) {
    return metadataMagazinNepublicat(business.store_name ?? business.business_name);
  }

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
  const radacina = storeBaseUrl({ slug, custom_domain: business.custom_domain });
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
        /* ⚠ `textCurat`, nu o taiere proprie: eticheta devine SPATIU, altfel „…cazare.Beneficii:". */
    || textCurat(ps?.short_description, 155)
        || (product.description ? textCurat(product.description, 155) : product.name);
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
  const sp = await searchParams;
  const { page: pageParam, preview: previewParam, q: qParam, cat: catParam, sale: saleParam } = sp;
  const initialPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  /*
   * Filtrele se citesc cu ACELASI parser ca pagina de catalog.
   *
   * Fara fatete (pagina principala nu le are), dar cu aceleasi validari — mai ales
   * `numarPozitiv`, care verifica sirul GOL primul: `Number("")` e zero, finit si
   * pozitiv, deci o adresa fara `pmin` ar fi produs un filtru „de la 0 pana la 0",
   * adica un catalog gol la fiecare incarcare. Vezi url.ts.
   */
  const filtreAcasa = citesteFiltreDinAdresa(sp, []);
  const isPreview = previewParam === "1";
  const supabase = await createClient();

  /*
   * Acelasi rand pe care l-a adus deja layout-ul, nu inca o interogare. Poarta
   * (`is_published`, sau proprietarul) e acum in `incarcaMagazinul`, fiindca
   * citirea nu mai trece prin RLS. Vezi antet-magazin.ts.
   */
  const { data: { user } } = await supabase.auth.getUser();
  const acces = await incarcaMagazinul(slug, user?.id);
  if (!acces) notFound();
  const { business, esteProprietar: isOwner } = acces;
  /*
   * Deschisa in iframe-ul editorului de DESIGN, nu doar cu `?preview=1`.
   *
   * De asta atarna tot ce tine de protocol: marcarea sectiunilor, blocarea
   * clicurilor si randarea cioarnei. Editorul vechi („Editeaza magazinul") pune
   * doar `preview=1`, deci trebuie sa primeasca o previzualizare navigabila si
   * versiunea publicata. Vezi `preview-protocol.ts`.
   */
  const esteEditorDesign = esteEditorDeDesign(sp, isOwner);

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
        // `is_active` vine INTREAGA, nefiltrata: subarborele unei categorii
        // stinse se calculeaza in `lib/categories/vizibilitate.ts`, iar el nu se
        // mai poate deduce dupa ce randul a fost scos din lista.
        .select("id, name, parent_id, image_url, sort_order, is_active")
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
  // Ciorna se randeaza DOAR in editorul de design: pana la Publica, vizitatorii
  // vad neaparat versiunea publicata.
  //
  // ⚠ Nu pe `preview=1`. Il pune si „Editeaza magazinul", care nu stie nimic
  // despre ciorne: acolo o ciorna ramasa de la celalalt editor deturna
  // previzualizarea, iar comerciantul isi salva modificarile si vedea in dreapta
  // alt magazin, fara sa i se spuna de ce.
  const useDraft = esteEditorDesign && !!storeSettings?.storefront_design_draft;
  const designDeRandat = useDraft ? storeSettings?.storefront_design_draft : storeSettings?.storefront_design;

  /*
   * Designul se rezolva AICI, inaintea citirii datelor, nu dupa.
   *
   * `incarcaAcasaDeLaServer` decide ce randuri de produse cere din baza, iar
   * decizia aia trebuie sa fie aceeasi cu cea de la randare. Cat timp o lua din
   * `page_content`, iar randarea o lua din design, existau doua porti pentru
   * acelasi rand: ochiul din editorul de design marca „Recomandate" vizibila si
   * nu se intampla nimic, fiindca serverul nu ceruse produsele.
   */
  const resolved = resolveDesign(designDeRandat, {
    primaryColor: business.primary_color ?? "#1AB554",
    pageContent: (storeSettings?.page_content as Record<string, unknown>) ?? {},
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });

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

  /*
   * Ce pleaca in browser: lista FARA subarborii stinsi, plus numele lor.
   *
   * Amandoua se calculeaza aici, pe server. Trimisa intreaga, lista ar fi ajuns
   * in HTML-ul fiecarui vizitator cu tot cu raioanele scoase din magazin —
   * randuri pe care browserul nu le randeaza niciodata, dar care se citesc din
   * sursa paginii. Numele stinse merg separat, fiindca grila are nevoie de ele ca
   * sa scoata produsele acelor categorii.
   */
  const categoriiDeNavigat = categoriiVizibile(categoriesData);
  const numeStinse = [...numeCategoriiAscunse(categoriesData)];

  // Categoria din adresa, rezolvata din ID in NUME ca la `initialCategory` de mai
  // jos. Se calculeaza aici fiindca palierul server are nevoie de ea INAINTE de
  // a cere pagina.
  const catRawSus = (catParam ?? "").slice(0, 100);
  const categorieAcasa =
    (catRawSus && categoriiDeNavigat.find((c) => c.id === catRawSus)?.name) || catRawSus || "";

  const palier = rezumat
    ? alegePalier({ pageContent: pcCatalog, totalProduse: rezumat.total, publicat: business.is_published === true })
    : "client";
  const peServer = palier === "server";

  /*
   * Asezarea grilei, si samanta amestecului — amandoua calculate AICI, pe server.
   *
   * Samanta pleaca si spre SQL, si spre browser, ca ambele paliere sa aseze la fel.
   * Calculata in browser ar fi citit ceasul vizitatorului: HTML-ul serverului si
   * prima randare ar fi iesit diferite, deci eroare de hidratare si o grila care
   * sare. Motivul intreg e in `asezare.ts`.
   */
  const asezare = citesteAsezare(pcCatalog);
  const samanta = samantaAmestec(new Date());
  const sortareaGrilei = sortareaAsezarii(
    asezare,
    (pcCatalog.sort_options as { default_sort?: string } | undefined)?.default_sort,
  );

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
      design: resolved.design,
      // Subarborii de sectiune se calculeaza pe lista VIZIBILA: o subcategorie
      // stinsa n-are ce cauta in randul parintelui ei aprins. RPC-ul taie oricum
      // si el, pe aceeasi regula (`public.categorii_ascunse`).
      categorii: categoriiDeNavigat,
      faraImagini,
      faraStocAscuns,
      rezumat,
      sortareImplicita: sortareaGrilei,
      asezare,
      samanta,
      categorie: categorieAcasa,
      reduceri: saleParam === "1",
      cautare: filtreAcasa.cautare,
      /*
       * Sortarea CERUTA in adresa, si e alta treaba decat implicitul magazinului.
       *
       * Browserul compune `sortTouched = !!initialSort`, deci: cu `?sort=` ordinea
       * e cea cerută, iar fara el si cu o cautare activa ordinea e RELEVANTA — nu
       * `default_sort`. Trimise amestecat, ar fi ieșit acelasi NUMAR de produse in
       * alta ordine, adica exact clasa de defect care a lovit deja de trei ori pe
       * suprafetele astea si nu se vede din contoare.
       */
      sortareDinAdresa: filtreAcasa.sortare,
      pretMin: filtreAcasa.pretMin,
      pretMax: filtreAcasa.pretMax,
      stoc: filtreAcasa.stoc,
      preia: (r) => {
        products = r.products; totalVizibile = r.totalVizibile; totalFiltrate = r.totalFiltrate;
        featuredServer = r.featured; sectiuniServer = r.sectiuni;
      },
    });

    /*
     * O pagina dincolo de ultima e 404, nu o pagina goala cu raspuns 200.
     *
     * Search Console citeste o pagina indexabila fara continut ca SOFT 404, si
     * asta scade increderea in paginile 2..N pentru care s-a facut paginarea
     * crawlabila. Aceeasi regula ca pe `/magazin`.
     *
     * `notFound()` sta AICI, in componenta paginii, nu sub `<Suspense>`: aruncat
     * de acolo, invelisul ar fi plecat deja cu 200. Vezi [[suspense-coaja-pagini]].
     * Pagina 1 goala ramane 200 — un magazin fara produse e un raspuns valid.
     */
    if (reusitPeServer && initialPage > 1 && products.length === 0) notFound();
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
      ═══ ⚠ SURSA SE MASOARA, NU SE PRESUPUNE (02.09.2026) ═══

      `source`, `referrer` si `metadata` nu se scriau NICIODATA: 0 randuri
      completate din 15.306. Dar panoul comerciantului are o sectiune „Surse de
      trafic", iar acolo lipsa devenea afirmatie (`e.source ?? "direct"`).

      Deci fiecare comerciant vedea „Direct 100%" — o cifra pe care se taie
      bugete de reclama. Nu lipsea o cifra; era una FALSA.

      Iar `country` era scris in cod ca `"RO"`, pentru orice vizitator din lume.

      ⚠ TOT CE SE CITESTE DIN ANTETURI SE CITESTE AICI, in randare. In `after`
      nu se mai poate — vezi nota de mai jos.
    */
    const referrerBrut = headersList.get("referer");
    const sursaVizitei = clasificaSursa({
      utmSource: primaValoare(sp.utm_source),
      gclid: primaValoare(sp.gclid),
      fbclid: primaValoare(sp.fbclid),
      ttclid: primaValoare(sp.ttclid),
      referrer: referrerBrut,
      gazdaProprie: host,
    });
    const taraVizitatorului = taraDinAnteturi(headersList);
    const referrerVizitei = referrerScurt(referrerBrut);

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
      await createAdminClient().from("site_analytics").insert({
        business_id: business.id,
        event_type: "visit",
        device,
        source: sursaVizitei,
        referrer: referrerVizitei,
        /*
          ⚠ `null` CAND TARA NU SE STIE, si asta a cerut o migrare.

          Coloana era `NOT NULL DEFAULT 'RO'`: schema INSASI afirma ca fiecare
          vizitator din lume e din Romania. Chiar scos din cod, implicitul ar fi
          pus aceeasi valoare — deci reparatia in cod singura ar fi fost teatru.

          Migrarea `site_analytics_country_fara_implicit_ro` (02.09.2026) a scos
          si `NOT NULL`, si implicitul. Randurile vechi raman 'RO' si nu se ating:
          ele chiar n-au fost masurate, iar rescrierea lor ar inlocui o minciuna
          veche cu una noua.
        */
        country: taraVizitatorului,
      });
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
      const opsCanonical = storeBaseUrl(business);
      const opsShippingCost = Number(storeSettings?.default_shipping_cost ?? 0) || 0;
      const opsTimpLivrare = parseTimpDeLivrare(storeSettings?.page_content ?? null);
      const opsJsonLd = buildProductJsonLd(product, opsCanonical, business.store_name ?? business.business_name, {
        cost: opsShippingCost,
        min: opsTimpLivrare?.tranzitMin ?? null,
        max: opsTimpLivrare?.tranzitMax ?? null,
        handlingMin: opsTimpLivrare?.procesareMin,
        handlingMax: opsTimpLivrare?.procesareMax,
      },
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
      /*
       * ⚠ Si magazinul, nu doar produsul.
       *
       * Ramura asta emitea DOAR `Product`, deci magazinele cu un singur produs —
       * singurele carora pagina principala le e chiar pagina de produs — erau
       * singurele fara nicio identitate in datele structurate: fara nume de firma,
       * fara adresa, fara telefon. Cele doua noduri stau in acelasi `@graph` si au
       * `@id`-uri distincte, deci descriu doua lucruri, nu acelasi lucru de doua ori.
       *
       * NU se adauga `BreadcrumbList`: aici produsul CHIAR e radacina magazinului,
       * deci cele doua trepte ar arata catre aceeasi adresa — firimitura pe care
       * Search Console o raporteaza ca invalida.
       */
      const opsGraf = graf(magazinJsonLd(business, opsCanonical), opsJsonLd);
      return (
        <>
          {opsGraf ? (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: jsonLdSafe(opsGraf) }}
            />
          ) : null}
          {/*
            Scopul de tema il pune ACUM invelisul, nu randul de aici: asa culorile
            si fonturile trimise live de editorul de design se aplica fara
            reincarcare. Vezi `StorePageShell`.
          */}
          <>
            <StorePageShell
              chrome={opsChrome}
              design={opsResolved.design}
              style={opsResolved.style}
              esteEditorDesign={esteEditorDesign}
              className="min-h-screen"
            >
              <ProductPageDinDesign
                variantImplicita={opsResolved.design.product.page.variant}
                setariImplicite={opsResolved.design.product.page.settings}
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
          </>
        </>
      );
    }
  }

  // Designul magazinului. Ciorna se randeaza DOAR pentru proprietar si doar in
  // preview: pana la Publica, vizitatorii vad neaparat versiunea publicata.

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

  /*
   * ⚠ Canonicalul urmeaza MAGAZINUL, nu gazda pe care a venit cererea.
   *
   * `storeBaseUrl` e aceeasi functie pe care o folosesc `generateMetadata` de mai
   * sus (prin expresia ei), pagina de catalog si paginile de politici. Calculat
   * dupa `isCustomDomain`, `@id`-ul magazinului ar fi fost altul cand aceeasi
   * vitrina se deschide pe edinio.com — se intampla la `?preview=1` si la
   * domeniile pe care cronul le-a gasit moarte — deci pagina principala si
   * paginile ei de categorie ar fi descris DOUA entitati in loc de una, iar
   * `<link rel="canonical">` din `<head>` ar fi contrazis `url`-ul din `<script>`.
   */
  const canonicalUrl = storeBaseUrl(business);
  /*
   * Nodul de identitate al magazinului.
   *
   * Se construieste in `magazinJsonLd`, nu aici: aceleasi campuri le cere si
   * ramura „un singur produs" de mai sus, iar a doua copie scrisa de mana ar fi
   * divergent garantat — exact povestea celor doua familii de coloane de adresa
   * din `identitate-publica.ts`. Acolo sta si de ce tipul e `Store` doar cand
   * chiar exista o adresa, si `OnlineStore` altfel.
   */
  const storeJsonLd = graf(magazinJsonLd(business, canonicalUrl));

  return (
    <>
      {storeJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(storeJsonLd) }}
        />
      ) : null}
      <MiniStoreRenderer
        business={pentruBrowser(business)}
        products={products}
        /*
         * Ce s-a INTAMPLAT, nu ce s-a decis.
         *
         * Cand palierul server n-a reusit (RPC picat, magazin neindexat, cuvant
         * prea comun la cautare), mai jos s-a citit catalogul INTREG. Trimis cu
         * `palier="server"`, renderer-ul n-ar mai filtra, n-ar mai sorta si mai
         * ales n-ar mai felia — deci ar randa tot catalogul deodata la o adresa
         * care cerea douazeci de produse.
         */
        palier={reusitPeServer ? palier : "client"}
        totalVizibileServer={totalVizibile}
        totalFiltrateServer={totalFiltrate}
        numeCategoriiCuProduse={reusitPeServer ? rezumat?.categorii : undefined}
        /*
         * Numai cand filtrarea chiar se face in browser.
         *
         * Pe palierul server produsele vin deja taiate de `catalog_pagina`, deci
         * trimise aici numele stinse ar fi singurul loc din HTML din care s-ar
         * afla ce raioane si-a stins comerciantul. Vezi propul.
         */
        numeCategoriiStinse={reusitPeServer ? undefined : numeStinse}
        intervalServer={reusitPeServer && rezumat
          ? { min: Number(rezumat.price_min), max: Number(rezumat.price_max) }
          : undefined}
        featuredServer={featuredServer}
        sectiuniServer={sectiuniServer}
        storeSettings={setariDeTrimis}
        basePath={basePath}
        categories={categoriiDeNavigat}
        initialPage={initialPage}
        initialSearch={filtreAcasa.cautare}
        initialCategory={initialCategory}
        initialOnSale={saleParam === "1"}
        /*
         * Controalele barei de deasupra grilei trebuie sa arate ce spune adresa.
         *
         * Pe palierul server ele NAVIGHEAZA, deci starea lor vine de aici: fara
         * props-urile astea, o cerere `?pmax=50` ar fi randat lista filtrata cu
         * casetele goale, si prima atingere a oricarui alt filtru ar fi trimis o
         * adresa fara `pmax` — adica filtrul dispare singur.
         *
         * Pe palierul client nu se schimba nimic vizibil: pana acum nu se citeau,
         * dar nici nu le scria nimeni in adresa de pe pagina principala.
         */
        initialSort={filtreAcasa.sortare}
        /*
         * Asezarea si samanta merg SI in browser, nu doar in RPC.
         *
         * Pe palierul client grila se sorteaza acolo, deci fara ele „amestecat" si
         * „ordinea mea" ar fi fost doua optiuni care nu fac nimic pe magazinele
         * mici — adica pe aproape toate. Iar cand palierul server pica pe calea
         * veche, browserul trebuie sa poata reface exact aceeasi ordine.
         *
         * ⚠ Pe palierul server lista manuala NU se trimite: acolo `catalog_pagina`
         * a asezat deja randurile si browserul nu mai sorteaza nimic, deci pana la
         * o suta de UUID-uri (~3,7 kB) ar fi calatorit in HTML-ul fiecarui
         * vizitator fara sa fie citite — si tocmai pe magazinele mari, unde
         * palierul server exista ca sa taie din payload. `mod` ramane: din el se
         * compune ordinea implicita si optiunea din bara de sortare.
         */
        asezare={reusitPeServer ? { ...asezare, ids: [] } : asezare}
        samanta={samanta}
        initialPriceMin={filtreAcasa.pretMin}
        initialPriceMax={filtreAcasa.pretMax}
        initialInStock={filtreAcasa.stoc}
        editorDesign={esteEditorDesign}

        design={resolved.design}
        designStyle={resolved.style}
      />
    </>
  );
}
