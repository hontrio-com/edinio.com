"use client";

import { useMemo } from "react";
import { CartProvider } from "@/components/storefront/cart/CartProvider";
import { PreviewSection } from "@/components/storefront/SectionRenderer";
import { StorefrontProvider, type StorefrontContextValue } from "@/components/storefront/StorefrontProvider";
import type { StoreChromeData } from "@/lib/storefront/chrome-value";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import type { SectionInstance } from "@/lib/storefront/design/types";
import type { StoreCategoryNode as CategoryRow } from "@/lib/storefront/store-content.types";

/**
 * O sectiune randata singura, pentru miniaturile din galeria de design-uri.
 *
 * Contextul e real acolo unde conteaza — produse, categorii, culori, logo — si
 * inert unde n-are sens: intr-o miniatura nu se cauta, nu se filtreaza si nu se
 * adauga in cos. Asa fiecare varianta arata exact ca la magazinul acesta, nu la
 * unul demonstrativ, fara sa fie nevoie de intreaga masinarie a paginii.
 */
export function SectionPreviewFrame({
  chrome,
  section,
  products,
  categories,
}: {
  chrome: StoreChromeData;
  section: SectionInstance;
  products: StorefrontProduct[];
  categories: CategoryRow[];
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
      // id-ul cerut: altfel orice varianta de rand ar aparea goala in galerie.
      productSections: [
        {
          section: { id: section.id, title: "Produse", enabled: true, mode: "selected" as const, layout: "grid" as const },
          items: items.slice(0, 4),
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

  return (
    <CartProvider slug={chrome.business.slug}>
      <StorefrontProvider value={value}>
        <PreviewSection section={section} />
      </StorefrontProvider>
    </CartProvider>
  );
}
