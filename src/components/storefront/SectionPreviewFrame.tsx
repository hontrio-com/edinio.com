"use client";

import { useMemo } from "react";
import { CartDemoProvider, CartProvider } from "@/components/storefront/cart/CartProvider";
import { PreviewSection } from "@/components/storefront/SectionRenderer";
import { StorefrontProvider, type StorefrontContextValue } from "@/components/storefront/StorefrontProvider";
import { CartDrawerClassic } from "@/components/storefront/sections/cart/CartDrawerClassic";
import { CheckoutClassic } from "@/components/storefront/sections/checkout/CheckoutClassic";
import { CHECKOUT_DEMO } from "@/components/storefront/sections/checkout/checkout-preview";
import { ProductPageSection } from "@/components/storefront/sections/product/ProductPageSection";
import type { StoreChromeData } from "@/lib/storefront/chrome-value";
import { DEMO_PRAG_TRANSPORT_GRATUIT, DEMO_TRANSPORT, demoCartItems } from "@/lib/storefront/design/demo-content";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import type { SectionInstance } from "@/lib/storefront/design/types";
import type { StoreCategoryNode as CategoryRow } from "@/lib/storefront/store-content.types";

/** Produsul demonstrativ al paginii de produs, construit pe server si trimis intreg. */
export interface DemoProductPage {
  product: Parameters<typeof ProductPageSection>[0]["product"];
  storeSettings: Parameters<typeof ProductPageSection>[0]["storeSettings"];
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
  produsDemo,
}: {
  chrome: StoreChromeData;
  section: SectionInstance;
  products: StorefrontProduct[];
  categories: CategoryRow[];
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
      totalPages: 1,
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
  }, [chrome, section.id, products, categories]);

  // Cosul si formularul de comanda: acelasi cod ca in magazin, dar in fluxul
  // paginii, cu un cos demonstrativ tinut in memorie si fara niciun apel pe
  // server. `CartProvider`-ul real nu se monteaza deloc pe ramurile astea, ca
  // miniatura sa nu poata atinge cosul comerciantului.
  if (section.kind === "cart_drawer") {
    return (
      <CartDemoProvider items={demoCartItems()}>
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
      </CartDemoProvider>
    );
  }

  if (section.kind === "checkout") {
    return (
      <CartDemoProvider items={demoCartItems()}>
        <CheckoutClassic
          open
          preview={CHECKOUT_DEMO}
          onClose={() => {}}
          color={chrome.color}
          basePath={chrome.basePath}
          businessId={chrome.business.id}
          shippingCost={CHECKOUT_DEMO.courierOptions[0]?.price ?? DEMO_TRANSPORT}
          freeShippingThreshold={DEMO_PRAG_TRANSPORT_GRATUIT}
          emailFieldConfig={{ enabled: true, required: false }}
        />
      </CartDemoProvider>
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
