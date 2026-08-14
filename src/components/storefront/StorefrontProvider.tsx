"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ProductSection } from "@/lib/store-sections";
import type { Fateta, SelectieFatete } from "@/lib/storefront/catalog/facets";
import type { SetariMagazin } from "@/lib/storefront/catalog/shop-settings";
import type { MenuItem } from "@/lib/pages/menu";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import type {
  StoreCategoryNode,
  StoreFeatures,
  StorePageContent,
  StoreSocial,
} from "@/lib/storefront/store-content.types";
import type { BusinessPublic } from "@/lib/storefront/business-public";
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

// Randul TAIAT, nu cel intreg: valoarea asta traverseaza granita catre client.
// Vezi src/lib/storefront/business-public.ts.
type Business = BusinessPublic;

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
  /**
   * Unde traieste catalogul de produse.
   *
   * Azi e mereu radacina magazinului, deci `radacinaMagazin(basePath)`. Exista ca
   * un camp separat fiindca „radacina magazinului" si „pagina cu produsele" sunt
   * doua intrebari diferite, iar toate cele ~12 locuri care leaga o categorie, o
   * pagina de catalog sau sertarul de cos raspund la a doua. Scrise cu `basePath`,
   * ar fi trebuit corectate una cate una in ziua in care catalogul se muta.
   */
  catalogRoot: string;
  /**
   * Pagina curenta ESTE pagina principala a magazinului.
   *
   * Se foloseste pentru linkul de pe logo: acolo ancora goala duce in capul
   * paginii, fara navigare. Pana acum raspunsul se ghicea din prezenta
   * contextului de catalog, care azi coincide cu pagina principala; sunt insa
   * doua intrebari diferite — o pagina de catalog separata ar avea catalog fara
   * sa fie acasa, si toate cele opt headere ar fi ramas cu logoul mort.
   */
  isHome?: boolean;
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
   * Sectiunea de anunt e pornita in design.
   *
   * Header-ul care isi poarta banda in interior o citeste de aici: fara ea,
   * stingerea sau stergerea sectiunii din editor n-avea niciun efect asupra
   * benzii dinauntru, ci doar asupra barei separate, oricum absente la acel
   * header.
   */
  announcementOn?: boolean;
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
  /**
   * Numerele fara de care un cos nu poate arata un total: transportul, pragul de
   * livrare gratuita si comanda minima.
   *
   * Ajung aici fiindca sertarul se deschide acum si pe paginile fara catalog, iar
   * el le cere. Optionale: unde lipsesc, butonul de cos ramane un link catre
   * magazin, ca inainte — mai bine un drum in plus decat un total gresit.
   */
  comert?: {
    shippingCost: number;
    freeShippingThreshold: number | null;
    minOrderAmount: number | null;
    /**
     * Regimul de TVA al magazinului, pentru totalul din sertarul de cos.
     *
     * Fara el, sertarul arata marfa plus transport, atat: la magazinele cu
     * preturi FARA TVA totalul iesea mai mic decat cel cerut la finalizare.
     */
    vat?: import("@/lib/storefront/cart/pricing").CartPricingInput["vat"];
  };
  openCart: () => void;
  /** Slug-ul paginii curente, pentru starea activa din meniu. */
  currentPageSlug?: string | null;
  /**
   * Arborele de categorii al magazinului, cu subcategorii cu tot.
   *
   * Se incarca doar cand varianta de header sau de footer aleasa il cere — nu
   * punem o interogare in plus pe fiecare pagina degeaba. Pe pagina de catalog
   * exista oricum in `categories`, din contextul de catalog; aici e pentru
   * paginile fara el: selectorul de langa cautare, panourile din header si
   * meniul de pe telefon, care altfel ar arata opt nume si niciun drum catre
   * cele douazeci si doua de subcategorii de dedesubt.
   */
  searchCategories?: StoreCategoryNode[];
  /**
   * Unde duc linkurile de CATEGORIE.
   *
   * Separat de `catalogRoot`, care inseamna „catalogul acestei pagini" si
   * alimenteaza paginarea si sertarul. O categorie apasata oriunde trebuie sa
   * duca la pagina de catalog cand ea exista — acolo sunt filtrele pe atribute
   * si pret — chiar daca pagina curenta are si ea o grila. Cu un singur camp
   * pentru amandoua, paginarea de pe pagina principala ar fi sarit pe pagina de
   * catalog la fiecare apasare pe „2".
   */
  categoriiRoot: string;
  /**
   * Categoriile au pagini proprii sub pagina de catalog.
   *
   * Adevarat exact cand magazinul si-a activat pagina de catalog: acolo
   * `/magazin/bocanci` e o pagina cu titlu, filtre si canonical propriu. Fals la
   * restul magazinelor, unde categoria ramane un filtru in adresa
   * (`?cat=Bocanci`) peste grila paginii principale — forma care functioneaza si
   * azi, si care ramane citita si pe pagina de catalog pentru linkurile vechi.
   *
   * Optional dinadins: un apel care il uita produce linkul cu interogare, adica
   * o adresa mai urata, nu una rupta.
   */
  categoriiPePagina?: boolean;
  /**
   * Categoria de deasupra celei deschise, cand pagina e a unei categorii.
   *
   * Firimiturile o arata intre magazin si categoria curenta: „Magazin /
   * Imbracaminte de lucru / Geci si jachete". Fara ea, drumul sarea un nivel, iar
   * pagina unei subcategorii nu spunea nicaieri din ce face parte.
   */
  parinteCategorie?: string | null;
  /**
   * Adresa pe care se construiesc linkurile de paginare.
   *
   * De obicei chiar `catalogRoot`. Difera pe pagina unei categorii, unde
   * paginarea trebuie sa ramana in categorie, iar `catalogRoot` arata mai departe
   * catre catalogul intreg (footer, cautarea din header, „Toate produsele").
   */
  radacinaPaginare?: string;
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
  /**
   * Cate produse are magazinul, si cate trec de filtre — NUMERE, nu lungimi.
   *
   * Pana acum orice contor se citea din `.length` al listelor de mai sus, si asta
   * mergea fiindca listele erau INTREGI: browserul avea tot catalogul si felia
   * singur. Din clipa in care felierea se face pe server, `filteredProducts` are
   * douazeci si patru de elemente si nimic altceva, deci
   * „{paginatedProducts.length} din {filteredProducts.length} produse" ar scrie
   * „24 din 24 produse" pe un catalog de trei mii.
   *
   * CERUTE, nu optionale, si asta e deliberat: e acelasi truc pe care codul il
   * foloseste deja de doua ori (`price_range` in `product.types.ts`, `vandabila`
   * in `bundles.ts`). Un camp optional s-ar fi uitat exact acolo unde conteaza;
   * unul cerut il plimba pe `tsc` prin toate cele noua locuri care numarau, in
   * loc sa afle cineva din raportul unui comerciant.
   *
   * Pe palierul client sunt chiar lungimile listelor, deci nimic nu se schimba.
   */
  totalVizibile: number;
  totalFiltrate: number;
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
  /**
   * Asezarea aleasa de comerciant pentru grila paginii principale, cand e una
   * dintre cele care nu se pot exprima ca sortare obisnuita („random", „manual").
   *
   * Bara are nevoie de ea, si nu ii ajunge `effectiveSort`: dupa ce vizitatorul
   * alege „Pret crescator", `effectiveSort` nu mai e asezarea magazinului, dar
   * optiunea de intoarcere la ea trebuie sa RAMANA in lista. Fara asta, un
   * `<select>` al carui `value` nu are optiune se randeaza gol.
   */
  asezareMagazin: "" | "random" | "manual";
  /** Varianta de header aleasa are deja o caseta de cautare. */
  headerHasSearch: boolean;
  /**
   * Lista vine gata filtrata din baza, o pagina la un moment dat.
   *
   * `false` inseamna purtarea de dintotdeauna: catalogul intreg e in browser si
   * orice filtru se aplica pe loc. `true` schimba TREI lucruri, si toate trei
   * fiindca lista din memorie nu mai e catalogul:
   *
   *   1. Cautarea se aplica la o CERERE, nu la fiecare tasta — casetele trebuie
   *      sa fie intr-un `<form>` si sa cheme `trimiteCautarea`, altfel Enter nu
   *      inseamna nimic si vizitatorul scrie un termen la care pagina nu raspunde.
   *   2. Paginarea e NUMEROTATA, chiar daca reglajul cere „Incarca mai multe":
   *      modurile care aduna cresc lista din memorie, iar aici serverul trimite
   *      exact o pagina, deci a doua apasare ar fi inlocuit produsele in loc sa
   *      le adauge.
   *   3. Pastilele de varianta din filtre NU se arata: valorile lor se deriva din
   *      produsele trimise, iar selectia lor nu ajunge in adresa — ar fi
   *      comutatoare care se coloreaza si nu fac nimic. Rolul lor il joaca
   *      fatetele, care vin din rezumat.
   *
   * Un singur steag, nu trei: sunt aceeasi consecinta a aceluiasi fapt, si trei
   * booleeni care trebuie sa fie mereu egali se despart la prima schimbare.
   */
  catalogPeServer: boolean;
  /** Aplica textul din caseta. Fara efect pe palierul client. */
  trimiteCautarea: () => void;
  /**
   * O cerere de catalog e in curs (filtru, sortare sau pagina noua).
   *
   * Exista doar pe palierul server, si e singurul semn ca s-a intamplat ceva:
   * pe client filtrele raspund instantaneu, aici e un dus-intors. Fara el,
   * vizitatorul apasa o fateta, nu se schimba nimic vizibil timp de o jumatate de
   * secunda, si apasa a doua.
   */
  catalogSeIncarca: boolean;

  /**
   * Pagina asta filtreaza pe loc, adica are o lista care raspunde la cautare.
   *
   * Pagina principala o pierde in clipa in care catalogul se muta pe pagina lui:
   * ramane cu randuri de produse si cu categorii, dar fara grila, deci o cautare
   * scrisa in header n-ar mai avea unde sa arate rezultate. Casetele de cautare
   * din headere citesc semnalul prin `useCatalogCautabil` si navigheaza in loc sa
   * filtreze. Implicit `true`, ca sa insemne exact ce insemna pana acum.
   */
  filtreazaPeLoc?: boolean;

  // --- Filtre --------------------------------------------------------------
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;
  activeFilterCount: number;
  resetFilters: () => void;
  facets: CatalogFacets;
  /**
   * Fatetele bogate ale catalogului — brand, etichete, specificatii, atribute.
   *
   * Goale pe pagina principala: se calculeaza pe server, din randuri nesliuite,
   * si sunt cerute doar de pagina de catalog. Filtrele de azi (`facets` +
   * `selectedOptions`) raman neatinse langa ele, ca pagina principala sa se
   * comporte identic.
   */
  fatete: Fateta[];
  selectieFatete: SelectieFatete;
  comutaFateta: (cheie: string, valoare: string) => void;
  /**
   * Filtrele curente scrise ca interogare, fara numarul paginii.
   *
   * Exista ca sa fie o SINGURA sursa pentru doi consumatori care trebuie sa
   * spuna acelasi lucru: linkurile de paginare, care se randeaza si pe server,
   * si rescrierea barei de adrese, care se intampla pe client. Compusa separat
   * in fiecare, prima nepotrivire ar fi fost o pagina 2 care pierde filtrele —
   * si nimic n-ar fi semnalat-o.
   */
  interogareFiltre: string;
  /**
   * Reglajele paginii de catalog, cu implicitele deja aplicate.
   *
   * Le citesc si `MiniStoreRenderer` (cate produse pe pagina, felul paginarii) si
   * modelele de pagina (antet, filtre, sortari, text). Normalizate intr-un
   * singur loc, ca cele doua sa nu aplice implicite diferite pentru acelasi camp
   * lipsa. Pe pagina principala sunt implicitele si nu le citeste nimeni.
   */
  setariMagazin: SetariMagazin;
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
  /**
   * Radacinile TOATE, cu cele goale cu tot.
   *
   * O foloseste doar bara de categorii din hero. In rest, o categorie fara
   * produse ramane ascunsa: intr-un meniu e un drum infundat. Acolo insa e
   * structura magazinului, pusa in pagina la cererea comerciantului.
   */
  rootCategoryItemsToate?: CategoryItem[];
  /** Suntem intr-o subcategorie: controlul din fata devine „Inapoi", nu „Toate". */
  isDrilled: boolean;
  drillParentName: string | null;
  hasCategories: boolean;
  /**
   * Hero-ul paginii arata deja o bara de categorii, pe ecran mare.
   *
   * Sectiunea de categorii de sub el ramane pentru TELEFON, unde bara din hero e
   * ascunsa; pe calculator s-ar fi vazut aceleasi opt categorii de doua ori, la
   * doua ecrane distanta. Nu se rezolva scotand sectiunea din design: pe telefon
   * ea e singura navigare pe categorii de pe pagina.
   */
  heroAreCategorii?: boolean;
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

/**
 * Catalogul, dar numai daca pagina chiar filtreaza pe loc.
 *
 * Casetele de cautare din headere aveau o singura intrebare — „exista catalog?"
 * — si doua raspunsuri legate de ea: filtreaza la fiecare tasta, sau navigheaza
 * la magazin cu `?q=`. Cu catalogul mutat pe pagina lui, pagina principala
 * pastreaza contextul (ii trebuie pentru randuri si categorii) dar pierde grila,
 * deci filtrarea pe loc ar fi scris intr-o lista pe care nimeni n-o vede. Aici
 * cele doua intrebari se despart.
 */
export function useCatalogCautabil(): StorefrontContextValue | null {
  const ctx = useContext(CatalogContext);
  return ctx && ctx.filtreazaPeLoc !== false ? ctx : null;
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
