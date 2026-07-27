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
 * Starea magazinului, pusa la dispozitia sectiunilor, in doua straturi.
 *
 * `StoreChrome` e identitatea magazinului: nume, logo, culori, meniu, setari.
 * Atat ii trebuie unui header, unui footer sau unei sectiuni de continut, si
 * exista pe ORICE pagina publica — inclusiv pagina de produs si paginile custom,
 * care n-au catalog. Fara separarea asta, header-ul si footer-ul n-ar putea
 * trai decat pe pagina principala, iar designul ales de comerciant s-ar opri la
 * primul click pe un produs.
 *
 * `Storefront` adauga peste el starea de catalog — cautare, sortare, filtre,
 * categorii, paginare — si exista doar pe pagina de magazin.
 */

type Business = Database["public"]["Tables"]["businesses"]["Row"];

/**
 * Ce face butonul de cos, dupa pagina pe care ne aflam si dupa designul ales.
 *
 * `page` inseamna ca magazinul si-a ales cosul ca pagina de sine statatoare:
 * atunci butonul navigheaza, nu deschide nimic, si o face la fel de pe orice
 * pagina publica. Valoarea se decide intr-un singur loc,
 * `lib/storefront/design/commerce.ts`.
 */
export type CartMode = "drawer" | "page" | "link" | "hidden";

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

export interface StoreChromeValue {
  business: Business;
  basePath: string;
  /** Culoarea principala. Variantele noi folosesc `var(--st-primary)`. */
  color: string;
  pageContent: StorePageContent;
  features: StoreFeatures;
  social: StoreSocial;
  gallery: string[];
  menu: MenuItem[];
  /** Header-ul se aseaza sub bara de anunt cand aceasta exista. */
  hasAnnouncementBar: boolean;
  /**
   * Pagina are o bara lipita jos care acopera subsolul pe mobil (pagina de
   * produs). Orice varianta de footer trebuie sa lase loc pentru ea, altfel
   * bara taie ultimele randuri.
   */
  hasStickyBottomBar?: boolean;

  /**
   * Pe pagina de magazin cosul se deschide ca sertar; pe celelalte pagini
   * publice e un link inapoi la magazin, iar in modul „un singur produs" nu
   * exista deloc. Cand magazinul si-a ales cosul ca pagina, e `page` peste tot.
   */
  cartMode: CartMode;
  /** Unde duce butonul de cos in modul `page`. Absent in celelalte moduri. */
  cartHref?: string;
  openCart: () => void;
  /** Slug-ul paginii curente, pentru starea activa din meniu. */
  currentPageSlug?: string | null;
  /**
   * Categoriile de nivel intai, pentru variantele de header care au un selector
   * de categorie langa cautare. Se incarca doar cand varianta aleasa are nevoie
   * de ele — nu punem o interogare in plus pe fiecare pagina degeaba.
   */
  searchCategories?: string[];
  /** Galeria foto poate aparea pe orice pagina, deci lightbox-ul sta aici. */
  openLightbox: (url: string) => void;
  /**
   * Pagina e deschisa in iframe-ul editorului. Doar atunci sectiunile primesc
   * marcajul `data-st-section`: pe magazinul public ar fi zeci de elemente in
   * plus, degeaba, si un wrapper poate rupe selectorii CSS pe copil direct.
   */
  isPreview?: boolean;
}

export interface StorefrontContextValue extends StoreChromeValue {
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
  /** Varianta de header aleasa are deja o caseta de cautare. */
  headerHasSearch: boolean;

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
  /**
   * Categoriile de nivel intai, indiferent unde a navigat vizitatorul.
   * `currentCategoryItems` se schimba la intrarea intr-o categorie; o bara
   * laterala fixa are nevoie de o lista care nu-i fuge de sub ochi.
   */
  rootCategoryItems: CategoryItem[];
  /** Suntem intr-o subcategorie: controlul din fata devine „Inapoi", nu „Toate". */
  isDrilled: boolean;
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
  openCheckout: () => void;

  // --- Prezentare ----------------------------------------------------------
  /** Catalogul isi pune titlu propriu doar cand pagina n-are hero si nici Recomandate. */
  hasHero: boolean;
  newBadgeDays: number;
  showCategoryBadges: boolean;
  priceLowestOnly: boolean;
  freeShippingThreshold: number | null;
}

const ChromeContext = createContext<StoreChromeValue | null>(null);
const CatalogContext = createContext<StorefrontContextValue | null>(null);

/** Identitatea magazinului. Disponibila pe orice pagina publica. */
export function useStoreChrome(): StoreChromeValue {
  const ctx = useContext(ChromeContext);
  if (!ctx) throw new Error("useStoreChrome must be inside StoreChromeProvider");
  return ctx;
}

/** Starea de catalog. Disponibila doar pe pagina de magazin. */
export function useStorefront(): StorefrontContextValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useStorefront must be inside StorefrontProvider");
  return ctx;
}

/**
 * Starea de catalog daca exista, altfel `null`.
 *
 * Pentru componente care apar pe toate paginile dar se comporta diferit acolo
 * unde exista catalog — de exemplu un header cu cautare, care filtreaza pe loc
 * pe pagina de magazin si navigheaza catre ea de oriunde altundeva.
 */
/**
 * Ca useStoreChrome, dar fara sa arunce acolo unde nu exista chrome.
 *
 * Miniaturile din catalogul de design-uri randeaza pagina de produs in afara
 * magazinului, deci fara provider; ele trebuie totusi sa se randeze.
 */
export function useStoreChromeOptional(): StoreChromeValue | null {
  return useContext(ChromeContext);
}

export function useStorefrontOptional(): StorefrontContextValue | null {
  return useContext(CatalogContext);
}

/** Doar identitatea magazinului: pagina de produs, pagini custom, politici. */
export function StoreChromeProvider({
  value,
  children,
}: {
  value: StoreChromeValue;
  children: ReactNode;
}) {
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

/** Identitate + catalog: pagina de magazin. */
export function StorefrontProvider({
  value,
  children,
}: {
  value: StorefrontContextValue;
  children: ReactNode;
}) {
  return (
    <ChromeContext.Provider value={value}>
      <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
    </ChromeContext.Provider>
  );
}
