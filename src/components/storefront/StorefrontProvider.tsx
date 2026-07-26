"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ProductSection } from "@/lib/store-sections";
import type { MenuItem } from "@/lib/pages/menu";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import type {
  StoreCategoryNode,
  StoreFeatures,
  StorePageContent,
  StoreSocial,
} from "@/lib/storefront/store-content.types";
import type { Database } from "@/types/database.types";

/**
 * Starea paginii de magazin, pusa la dispozitia sectiunilor.
 *
 * Toata logica de catalog (cautare, sortare, filtre, categorii, paginare,
 * adaugare in cos) traia in closure-ul unei singure componente de ~1500 de
 * linii. Ca sa poata exista mai multe variante de design pentru fiecare
 * sectiune, sectiunile trebuie sa fie componente separate — iar atunci au
 * nevoie de starea asta fara sa primeasca treizeci de props fiecare.
 *
 * Contextul e construit de pagina de magazin, nu de un provider separat: asa
 * decompunerea se face bucata cu bucata, fara sa mutam intr-un pas toata starea
 * dintr-un loc in altul.
 */

type Business = Database["public"]["Tables"]["businesses"]["Row"];

/** Un element din navigarea pe categorii (pastile si cercuri cu imagini). */
export interface CategoryItem {
  key: string;
  id: string | null;
  name: string;
  image: string | null;
  hasChildren: boolean;
}

/** Fatetele de filtrare derivate din catalog. */
export interface CatalogFacets {
  options: { name: string; values: string[] }[];
  priceMin: number;
  priceMax: number;
}

export interface StorefrontContextValue {
  // --- Magazinul -----------------------------------------------------------
  business: Business;
  basePath: string;
  /** Culoarea principala. Variantele noi folosesc `var(--st-primary)`. */
  color: string;
  pageContent: StorePageContent;
  features: StoreFeatures;
  social: StoreSocial;
  gallery: string[];
  menu: MenuItem[];

  // --- Catalog -------------------------------------------------------------
  /** Lista COMPLETA. Ramane sursa pentru stocul derivat al pachetelor. */
  products: StorefrontProduct[];
  /** Dupa regulile de vizibilitate din editor (fara imagini / fara stoc). */
  visibleProducts: StorefrontProduct[];
  filteredProducts: StorefrontProduct[];
  paginatedProducts: StorefrontProduct[];
  featuredProducts: StorefrontProduct[];
  productSections: { section: ProductSection; items: StorefrontProduct[] }[];
  isProductOutOfStock: (p: StorefrontProduct) => boolean;

  // --- Cautare si sortare --------------------------------------------------
  search: string;
  setSearch: (v: string) => void;
  sort: string;
  setSort: (v: string) => void;
  setSortTouched: (v: boolean) => void;
  /** „relevance" cat timp exista o cautare si nu s-a ales explicit alta sortare. */
  effectiveSort: string;
  hasSearchMatches: boolean;

  // --- Filtre --------------------------------------------------------------
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;
  activeFilterCount: number;
  resetFilters: () => void;
  facets: CatalogFacets;
  priceMin: string;
  setPriceMin: (v: string) => void;
  priceMax: string;
  setPriceMax: (v: string) => void;
  selectedOptions: Record<string, string[]>;
  toggleOption: (name: string, value: string) => void;
  onSaleOnly: boolean;
  setOnSaleOnly: (v: boolean) => void;
  inStockOnly: boolean;
  setInStockOnly: (v: boolean) => void;

  // --- Categorii -----------------------------------------------------------
  categories: StoreCategoryNode[];
  categoryFilter: string;
  currentCategoryItems: CategoryItem[];
  drillParentName: string | null;
  hasCategories: boolean;
  hasAnyCategoryImage: boolean;
  selectCategoryItem: (item: CategoryItem) => void;
  resetCategory: () => void;
  goBackCategory: () => void;
  viewAllCategory: (category: string) => void;

  // --- Paginare ------------------------------------------------------------
  currentPage: number;
  totalPages: number;
  goToPage: (n: number) => void;

  // --- Comert --------------------------------------------------------------
  addToCart: (product: StorefrontProduct) => void;
  /** Produsul care tocmai a intrat in cos, pentru starea „Adaugat!" a cardului. */
  addedId: string | null;
  openCart: () => void;
  openCheckout: () => void;

  // --- Prezentare ----------------------------------------------------------
  newBadgeDays: number;
  showCategoryBadges: boolean;
  priceLowestOnly: boolean;
  freeShippingThreshold: number | null;
  openLightbox: (url: string) => void;
}

const StorefrontContext = createContext<StorefrontContextValue | null>(null);

export function useStorefront(): StorefrontContextValue {
  const ctx = useContext(StorefrontContext);
  if (!ctx) throw new Error("useStorefront must be inside StorefrontProvider");
  return ctx;
}

export function StorefrontProvider({
  value,
  children,
}: {
  value: StorefrontContextValue;
  children: ReactNode;
}) {
  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}
