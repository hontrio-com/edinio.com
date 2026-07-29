"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { CartDemoProvider, CartProvider } from "@/components/storefront/cart/CartProvider";
import type { Fateta } from "@/lib/storefront/catalog/facets";
import { citesteSetariMagazinDinSectiune } from "@/lib/storefront/catalog/shop-settings";
import { PreviewSection } from "@/components/storefront/SectionRenderer";
import { StorefrontProvider, type StorefrontContextValue } from "@/components/storefront/StorefrontProvider";
import { CHECKOUT_DEMO } from "@/components/storefront/sections/checkout/checkout-preview";
import type { ProductPageSection as ProductPageSectionTip } from "@/components/storefront/sections/product/ProductPageSection";
import type { StoreChromeData } from "@/lib/storefront/chrome-value";
import { DEMO_PRAG_TRANSPORT_GRATUIT, DEMO_TRANSPORT, demoCartItems } from "@/lib/storefront/design/demo-content";
import { variantMeta } from "@/lib/storefront/design/registry";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import type { SectionInstance } from "@/lib/storefront/design/types";
import type { StoreCategoryNode as CategoryRow } from "@/lib/storefront/store-content.types";

/**
 * Suprafetele grele de comert si pagina de produs, incarcate la cerere.
 *
 * Miniatura randeaza o singura sectiune si stie din `section.kind` care dintre
 * ele o priveste. Importate static, pagina de produs cu galeria ei, sertarul de
 * cos si formularul de comanda ar fi parcurse in fiecare dintre cele sase-opt
 * documente pe care le deschide galeria deodata, si pentru miniatura unui header.
 */
const CartDrawerClassic = dynamic(
  () => import("@/components/storefront/sections/cart/CartDrawerClassic").then((m) => m.CartDrawerClassic),
  { ssr: true },
);
const CartPageSection = dynamic(
  () => import("@/components/storefront/sections/cart/CartPageSection").then((m) => m.CartPageSection),
  { ssr: true },
);
const CheckoutClassic = dynamic(
  () => import("@/components/storefront/sections/checkout/CheckoutClassic").then((m) => m.CheckoutClassic),
  { ssr: true },
);
const CheckoutPageSection = dynamic(
  () => import("@/components/storefront/sections/checkout/CheckoutPageSection").then((m) => m.CheckoutPageSection),
  { ssr: true },
);
const ProductPageSection = dynamic(
  () => import("@/components/storefront/sections/product/ProductPageSection").then((m) => m.ProductPageSection),
  { ssr: true },
);
const ShopPageSection = dynamic(
  () => import("@/components/storefront/sections/shop/ShopPageSection").then((m) => m.ShopPageSection),
  { ssr: true },
);

/** Produsul demonstrativ al paginii de produs, construit pe server si trimis intreg. */
export interface DemoProductPage {
  product: Parameters<typeof ProductPageSectionTip>[0]["product"];
  storeSettings: Parameters<typeof ProductPageSectionTip>[0]["storeSettings"];
}

/**
 * O sectiune randata singura, pentru miniaturile din galeria de design-uri.
 *
 * Contextul e real acolo unde conteaza — produse, categorii, culori, logo — si
 * inert unde n-are sens: intr-o miniatura nu se cauta, nu se filtreaza si nu se
 * adauga in cos. Asa fiecare varianta arata exact ca la magazinul acesta, nu la
 * unul demonstrativ, fara sa fie nevoie de intreaga masinarie a paginii.
 *
 * Pagina de produs, cosul si formularul de comanda nu sunt sectiuni de pagina,
 * deci nu trec prin `PreviewSection`: sunt panouri si pagini conduse de starea
 * magazinului, cu props proprii. Sunt tratate mai jos, fiecare cu datele lui
 * demonstrative. Dispecerul lor NU sta in `SectionOne`: acolo, o configuratie
 * salvata cu un `kind` de comert strecurat in lista paginii principale ar arunca
 * un panou fix peste magazinul public.
 */
export function SectionPreviewFrame({
  chrome,
  section,
  products,
  categories,
  fatete,
  produsDemo,
}: {
  chrome: StoreChromeData;
  section: SectionInstance;
  products: StorefrontProduct[];
  categories: CategoryRow[];
  /**
   * Fatetele produselor demonstrative, calculate in ruta.
   *
   * NU aici: `slimCatalogProduct` reconstruieste `page_sections` si pastreaza
   * doar variantele si pachetul, deci brandul si specificatiile nu mai exista
   * pe produsele care ajung pana aici. Calculate dupa slimuire, jumatate din
   * filtrele miniaturii ar fi fost mereu goale.
   */
  fatete: Fateta[];
  produsDemo?: DemoProductPage;
}) {
  const value = useMemo<StorefrontContextValue>(() => {
    const nimic = () => {};
    const items = products.slice(0, 8);
    const topLevel = categories.filter((c) => c.parent_id === null);

    return {
      ...chrome,
      openCart: nimic,
      openLightbox: nimic,
      isPreview: false,
      // Miniatura arata sectiunea asa cum apare pe pagina principala: acolo
      // logoul e o ancora goala, nu un link care ar scoate iframe-ul din cadru.
      isHome: true,

      products,
      visibleProducts: products,
      filteredProducts: items,
      paginatedProducts: items,
      featuredProducts: products.filter((p) => p.is_featured).slice(0, 8),
      // Un rand curat n-are configuratie aici, deci ii dam una sintetica cu
      // id-ul cerut: altfel un rand deschis direct pe ruta de previzualizare ar
      // aparea gol. Randul nu mai e in catalogul de design-uri, dar ruta ramane.
      productSections: [
        {
          section: { id: section.id, title: "Produse", enabled: true, mode: "selected" as const, layout: "grid" as const },
          items: items.slice(0, 6),
        },
      ],
      isProductOutOfStock: (p) => !!(p.track_inventory && p.stock_quantity === 0),

      search: "",
      setSearch: nimic,
      sort: "newest",
      setSort: nimic,
      setSortTouched: nimic,
      effectiveSort: "newest",
      hasSearchMatches: false,
      headerHasSearch: false,

      filtersOpen: false,
      setFiltersOpen: nimic,
      activeFilterCount: 0,
      resetFilters: nimic,
      facets: { options: [], priceMin: 0, priceMax: 0 },
      // Fatetele miniaturii se calculeaza din produsele demonstrative, nu sunt
      // goale: pagina de catalog se alege tocmai dupa cum arata filtrele, iar o
      // coloana goala langa o grila ar fi facut cele trei modele sa para
      // identice. Bifarea ramane inerta — intr-o miniatura nu se filtreaza.
      fatete,
      selectieFatete: {},
      comutaFateta: nimic,
      interogareFiltre: "",
      // Miniatura arata varianta cu setarile ei implicite, exact ca restul
      // galeriei: sectiunea sintetica de la ruta poarta deja `defaults`.
      setariMagazin: citesteSetariMagazinDinSectiune(section),
      priceMin: "",
      setPriceMin: nimic,
      priceMax: "",
      setPriceMax: nimic,
      selectedOptions: {},
      toggleOption: nimic,
      onSaleOnly: false,
      setOnSaleOnly: nimic,
      inStockOnly: false,
      setInStockOnly: nimic,

      categories,
      categoryFilter: "toate",
      currentCategoryItems: topLevel.map((c) => ({
        key: c.id,
        id: c.id,
        name: c.name,
        image: c.image_url,
        hasChildren: categories.some((x) => x.parent_id === c.id),
      })),
      rootCategoryItems: topLevel.map((c) => ({
        key: c.id,
        id: c.id,
        name: c.name,
        image: c.image_url,
        hasChildren: categories.some((x) => x.parent_id === c.id),
      })),
      isDrilled: false,
      drillParentName: null,
      hasCategories: topLevel.length > 0,
      hasAnyCategoryImage: topLevel.some((c) => !!c.image_url),
      selectCategoryItem: nimic,
      resetCategory: nimic,
      goBackCategory: nimic,
      viewAllCategory: nimic,

      currentPage: 1,
      // Derivat, nu fixat la 1: pagina de catalog se alege si dupa cum arata
      // bara de paginare, iar fixata acolo n-ar fi aparut in nicio miniatura.
      totalPages: Math.max(1, Math.ceil(products.length / 8)),
      goToPage: nimic,

      addToCart: nimic,
      addedId: null,
      openCheckout: nimic,

      hasHero: true,
      newBadgeDays: 7,
      showCategoryBadges: true,
      priceLowestOnly: false,
      freeShippingThreshold: 200,
    };
  }, [chrome, section, products, categories, fatete]);

  // Cosul si formularul de comanda: acelasi cod ca in magazin, dar in fluxul
  // paginii, cu un cos demonstrativ tinut in memorie si fara niciun apel pe
  // server. `CartProvider`-ul real nu se monteaza deloc pe ramurile astea, ca
  // miniatura sa nu poata atinge cosul comerciantului.
  if (section.kind === "cart_drawer") {
    // Variantele de tip pagina se randeaza ca pagini, nu ca panouri: acelasi
    // `surface` din registry care decide si comportamentul in magazin.
    const caPagina = variantMeta("cart_drawer", section.variant)?.surface === "page";
    return (
      <CartDemoProvider items={demoCartItems()}>
        {caPagina ? (
          <CartPageSection
            variant={section.variant}
            settings={section.settings}
            preview
            onCheckout={() => {}}
            color={chrome.color}
            basePath={chrome.basePath}
            businessId={chrome.business.id}
            shippingCost={DEMO_TRANSPORT}
            freeShippingThreshold={DEMO_PRAG_TRANSPORT_GRATUIT}
            minOrderAmount={null}
          />
        ) : (
          <CartDrawerClassic
            inline
            open
            onClose={() => {}}
            onCheckout={() => {}}
            color={chrome.color}
            basePath={chrome.basePath}
            businessId={chrome.business.id}
            shippingCost={DEMO_TRANSPORT}
            freeShippingThreshold={DEMO_PRAG_TRANSPORT_GRATUIT}
            minOrderAmount={null}
          />
        )}
      </CartDemoProvider>
    );
  }

  if (section.kind === "checkout") {
    const caPagina = variantMeta("checkout", section.variant)?.surface === "page";
    const comune = {
      open: true as const,
      preview: CHECKOUT_DEMO,
      onClose: () => {},
      color: chrome.color,
      basePath: chrome.basePath,
      businessId: chrome.business.id,
      shippingCost: CHECKOUT_DEMO.courierOptions[0]?.price ?? DEMO_TRANSPORT,
      freeShippingThreshold: DEMO_PRAG_TRANSPORT_GRATUIT,
      emailFieldConfig: { enabled: true, required: false },
    };
    return (
      <CartDemoProvider items={demoCartItems()}>
        {caPagina ? <CheckoutPageSection variant={section.variant} {...comune} /> : <CheckoutClassic {...comune} />}
      </CartDemoProvider>
    );
  }

  /*
   * Pagina de catalog trece prin dispecerul ei, nu prin `PreviewSection`.
   *
   * Acelasi motiv ca la cos si la comanda: un `kind` de pagina strecurat in
   * lista paginii principale ar fi randat un catalog intreg peste magazinul
   * public. Varianta „none" nu are ce arata — produsele raman pe pagina
   * principala — deci miniatura ei spune exact asta.
   *
   * Si spune si ce URMEAZA daca alegi altceva, fiindca altfel textul se citea ca
   * o alegere intre doua lucruri care se exclud: „magazinul nu are o pagina
   * separata" suna ca si cum pagina separata ar goli prima pagina. Nu o goleste
   * — produsele raman si acolo, iar mutarea completa e un comutator, stins
   * implicit.
   */
  if (section.kind === "shop_page") {
    if (variantMeta("shop_page", section.variant)?.surface !== "page") {
      return (
        <div className="flex items-center justify-center min-h-[220px] px-8 py-12 text-center">
          <div className="max-w-md space-y-2">
            <p className="text-sm text-[var(--st-muted)]">
              Produsele raman pe pagina principala, sub celelalte sectiuni. Magazinul nu are o pagina separata de catalog.
            </p>
            <p className="text-[13px] text-[var(--st-muted)]">
              Alege un model de mai jos ca sa ai si pagina Magazin, cu toate filtrele. Produsele raman si pe prima pagina; se muta complet acolo doar daca stingi tu comutatorul.
            </p>
          </div>
        </div>
      );
    }
    return (
      <CartProvider slug={chrome.business.slug}>
        <StorefrontProvider value={value}>
          <ShopPageSection variant={section.variant} setari={section.settings} />
        </StorefrontProvider>
      </CartProvider>
    );
  }

  if (section.kind === "product_page" && produsDemo) {
    return (
      <ProductPageSection
        variant={section.variant}
        demo
        business={chrome.business}
        product={produsDemo.product}
        storeSettings={produsDemo.storeSettings}
        basePath={chrome.basePath}
      />
    );
  }

  return (
    <CartProvider slug={chrome.business.slug}>
      <StorefrontProvider value={value}>
        <PreviewSection section={section} />
      </StorefrontProvider>
    </CartProvider>
  );
}
