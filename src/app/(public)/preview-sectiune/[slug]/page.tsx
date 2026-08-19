import { COLOANE_BUSINESS_PUBLIC } from "@/lib/storefront/business-public";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PreviewHeightReporter } from "@/components/storefront/PreviewHeightReporter";
import { SectionPreviewFrame } from "@/components/storefront/SectionPreviewFrame";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import { buildChromeData } from "@/lib/storefront/chrome-value";
import { slimCatalogProduct } from "@/lib/storefront/catalog-slim";
import { construiesteFatete } from "@/lib/storefront/catalog/facets";
import { DEMO_BANNERS, DEMO_CATEGORIES, DEMO_LOGO, DEMO_MENU, DEMO_TRANSPORT, demoProductPage, demoProducts } from "@/lib/storefront/design/demo-content";
import { toateSectiunile } from "@/lib/storefront/design/edit";
import { resolveDesign } from "@/lib/storefront/design/parse";
import { sectionMeta, variantMeta } from "@/lib/storefront/design/registry";
import type { SectionKind } from "@/lib/storefront/design/types";
import type { StorePageContent } from "@/lib/storefront/store-content.types";

/**
 * O singura sectiune de magazin, randata izolat.
 *
 * Sursa miniaturilor din galeria de design-uri a editorului: fiecare card e un
 * iframe catre ruta asta, deci arata varianta reala cu logo-ul, culorile si
 * produsele magazinului. Alternativa — capturi pregatite dinainte — ar fi
 * insemnat ~160 de imagini de intretinut, care oricum ar fi aratat produsele
 * altcuiva.
 *
 * Nu expune nimic in plus: randeaza exact ce vede oricine pe magazinul public.
 *
 * Ruta sta DELIBERAT in afara lui `[slug]`, nu sub el. Layout-ul magazinului
 * injecteaza pixelii de marketing si bannerul de cookies: bannerul acoperea
 * miniaturile, iar pixelii ar fi trimis cate un pageview in Facebook, TikTok si
 * Google Analytics ale comerciantului la fiecare card din galerie — statistici
 * si audiente de reclame stricate de propriul editor.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ kind?: string; variant?: string }>;
}

export default async function SectionPreviewPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { kind: kindParam, variant: variantParam } = await searchParams;

  const kind = kindParam as SectionKind | undefined;
  if (!kind || !sectionMeta(kind) || !variantParam || !variantMeta(kind, variantParam)) notFound();

  const supabase = await createClient();
  const { data: business } = await supabase.from("businesses").select(COLOANE_BUSINESS_PUBLIC).eq("slug", slug).single();
  if (!business) notFound();

  /*
   * Ciorna, pentru proprietar. Publicatul, pentru oricine altcineva.
   *
   * ⚠ Miniaturile citeau doar designul PUBLICAT, deci cardul marcat „Activ"
   * arata starea de dinaintea ultimelor modificari: comerciantul alegea un
   * design, apoi apasa Publica, primea „Designul e live" — si toate cardurile
   * ramaneau neschimbate pana la o reincarcare cu F5. Aceeasi regula ca pe
   * storefront (`[slug]/page.tsx`), ca miniatura si magazinul sa nu spuna doua
   * lucruri diferite.
   */
  const { data: { user } } = await supabase.auth.getUser();
  const { data: storeSettings } = await createAdminClient()
    .from("store_settings")
    .select("page_content, storefront_design, storefront_design_draft")
    .eq("business_id", business.id)
    .single();
  const esteProprietar = !!user && user.id === business.user_id;
  const designDeCitit = esteProprietar && storeSettings?.storefront_design_draft
    ? storeSettings.storefront_design_draft
    : storeSettings?.storefront_design;
  // Randul FARA coloana de ciorna, singurul care are voie sa plece catre client.
  const faraCiorna = storeSettings
    ? (() => { const { storefront_design_draft: _ciorna, ...rest } = storeSettings; return rest; })()
    : {};
  const produseDemo = demoProducts(business.id);
  const paginaProdusDemo = demoProductPage(business.id);
  /*
   * Fatetele se calculeaza INAINTE de slimuire, ca si in magazinul real.
   *
   * `slimCatalogProduct` reconstruieste `page_sections` si pastreaza doar
   * variantele si pachetul, deci brandul si specificatiile demonstrative n-ar
   * mai exista pe produsele care ajung la miniatura, iar filtrele ei ar fi
   * ramas pe jumatate goale — exact ce deosebeste modelele de pagina de catalog.
   */
  const indexFatete = construiesteFatete(produseDemo);
  const produseCuFatete = produseDemo.map((p) => {
    const slim = slimCatalogProduct(p);
    const f = indexFatete.perProdus.get(p.id);
    return f ? { ...slim, f } : slim;
  });

  // Continutul e demonstrativ, identitatea magazinului nu: designul se alege cu
  // logo-ul, culorile si fontul lui, dar cu bannere, categorii si produse care
  // exista mereu, ca fiecare varianta sa se vada intreaga.
  const realPageContent = (storeSettings?.page_content ?? {}) as StorePageContent;
  const pageContent: StorePageContent = {
    ...realPageContent,
    menu: DEMO_MENU,
    hero_banners: DEMO_BANNERS,
    hero_banner_links: [],
  };
  // Designul se deriva din configuratia REALA: ce sectiuni are magazinul aprinse
  // si ce varianta foloseste nu trebuie sa depinda de continutul demonstrativ.
  const resolved = resolveDesign(designDeCitit, {
    primaryColor: business.primary_color ?? "#1AB554",
    pageContent: realPageContent as Record<string, unknown>,
    features: (business.features as Record<string, unknown>) ?? {},
    coverUrl: business.cover_url,
    tagline: business.tagline,
  });

  // Sectiunea pe care magazinul o are ACUM pentru acest tip. Prima instanta e
  // reprezentanta: designul se aplica oricum tuturor (vezi SectionDesignBrowser).
  const sectiuneaReala = toateSectiunile(resolved.design).find((s) => s.kind === kind) ?? null;

  const chrome = {
    ...buildChromeData({
      // Logo-ul si sloganul raman ale magazinului cand exista; se imprumuta doar
      // cand lipsesc, ca header-ul sa nu apara gol in miniatura.
      business: {
        ...business,
        logo_url: business.logo_url || DEMO_LOGO,
        tagline: business.tagline || "Produse alese cu grija, livrate rapid",
      },
      pageContent,
      basePath: `/${business.slug}`,
      searchCategories: DEMO_CATEGORIES,
    }),
    // Miniatura randeaza o singura sectiune, deci deasupra header-ului nu exista
    // nicio bara de anunt de ocolit, oricat de aprinsa ar fi ea in magazin.
    // Altfel header-urile isi calculau `top-9` fata de ceva ce aici nu se
    // randeaza. Se stinge aici, nu in `pageContent`: miniatura barei de anunt
    // insasi se randeaza din acel continut si trebuie sa ramana intreaga.
    hasAnnouncementBar: false,
  };

  return (
    <StorefrontThemeScope style={resolved.style}>
      <SectionPreviewFrame
        chrome={chrome}
        section={{
          id: `preview_${kind}`,
          kind,
          variant: variantParam,
          enabled: true,
          /*
           * Setarile REALE cand miniatura arata varianta pe care magazinul o
           * foloseste deja; implicitele variantei in rest.
           *
           * ⚠ Cu implicitele peste tot, panoul de Setari din „Design sectiuni"
           * nu avea nicio previzualizare: comerciantul schimba un titlu, un numar
           * de coloane sau un comutator, si nici macar cardul marcat „Activ" nu
           * se schimba. Pentru variantele NEALESE implicitele raman corecte —
           * acolo intrebarea e „cum arata daca o aleg", iar reglajele actuale
           * apartin altei variante.
           */
          settings: {
            ...(variantMeta(kind, variantParam)?.defaults ?? {}),
            ...(sectiuneaReala?.variant === variantParam ? sectiuneaReala.settings : {}),
          },
        }}
        products={produseCuFatete}
        categories={DEMO_CATEGORIES}
        fatete={indexFatete.fatete}
        // Pagina de produs primeste produsul demonstrativ INTREG, nu trecut prin
        // `slimCatalogProduct`: acela taie tocmai combinatiile de variante si
        // imaginile de dupa prima, adica jumatate din ce arata designul.
        produsDemo={{
          product: paginaProdusDemo.product as never,
          storeSettings: {
            /*
             * ⚠ CIORNA NU ARE VOIE SA IASA DIN FUNCTIA ASTA.
             *
             * `storeSettings` ajunge INTREG ca prop la o componenta de client, iar
             * React serializeaza props-urile in HTML. Din clipa in care randul
             * cuprinde si coloana de ciorna — pana la 200 KB de design nepublicat —
             * ea ajunge in sursa paginii, iar ruta asta n-are nicio poarta de
             * autentificare: `?kind=header&variant=classic` pe slugul oricui o
             * serveste oricui. Aceeasi curatare ca in `[slug]/page.tsx`.
             */
            ...faraCiorna,
            page_content: { ...realPageContent, ...paginaProdusDemo.pageContent },
            default_shipping_cost: DEMO_TRANSPORT,
            free_shipping_threshold: null,
            min_order_amount: null,
          } as never,
        }}
      />
      <PreviewHeightReporter />
    </StorefrontThemeScope>
  );
}
