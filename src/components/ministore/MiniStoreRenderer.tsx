"use client";

import { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from "react";
import dynamic from "next/dynamic";
import { ShoppingCart, X } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { formatPrice, whatsappLink } from "@/lib/utils/format";
import { getRecoverableCart } from "@/lib/actions/abandoned-cart.actions";
import { readBundleConfig } from "@/lib/bundles";
import { parseProductSections, resolveSectionProducts } from "@/lib/store-sections";
import { buildProductSearchIndex, queryProductSearchIndex } from "@/lib/storefront/product-search";
import { fbTrack, ttqTrack, gtagEvent } from "@/lib/marketing";
import type { Database } from "@/types/database.types";
import { VariantQuickAdd, type QuickAddLine } from "./VariantQuickAdd";
import { parseVariants } from "@/lib/storefront/variants";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import type { ResolvedStyle, StoreDesign } from "@/lib/storefront/design/types";
import { CartProvider, useCart } from "@/components/storefront/cart/CartProvider";
import { trackAddToCart } from "@/lib/storefront/cart/track-add";
import { hrefCategorie } from "@/lib/storefront/category-href";
import {
  cartHref, cartOnPage, checkoutHref, checkoutOnPage, radacinaCatalog, sectiuniAcasa, shopOnPage,
} from "@/lib/storefront/design/commerce";
import {
  indiciSelectati, numaraSelectia, trecefiltrele,
  type Fateta, type SelectieFatete,
} from "@/lib/storefront/catalog/facets";
import { ShopPageSection } from "@/components/storefront/sections/shop/ShopPageSection";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { variantMeta } from "@/lib/storefront/design/registry";
import type { StorefrontProduct } from "@/lib/storefront/product.types";
import { StorefrontProvider, type StorefrontContextValue } from "@/components/storefront/StorefrontProvider";
import { ChromeSection, SectionRenderer } from "@/components/storefront/SectionRenderer";
import { headerAreCautare, standaloneAnnouncement } from "@/lib/storefront/design/chrome";
import { useDesignPreview } from "@/components/storefront/useDesignPreview";
import type {
  StoreCategoryNode,
  StoreFeatures,
  StorePageContent,
  StoreSocial,
} from "@/lib/storefront/store-content.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];
// Forma produsului a fost mutata in lib/storefront/product.types.ts, ca sa poata
// fi importata si de sectiunile extrase din acest fisier.
type Product = StorefrontProduct;
type StoreSettings = Pick<
  Database["public"]["Tables"]["store_settings"]["Row"],
  "id" | "business_id" | "page_content" | "store_policies" | "default_shipping_cost" | "free_shipping_threshold" | "min_order_amount"
>;

/**
 * Variantele de cos si de formular de comanda, dupa id-ul din registry.
 *
 * Incarcate la cerere, inclusiv „classic": montarea lor e conditionata de design
 * (`{!cosPePagina && ...}`), deci magazinul care si-a ales cosul sau finalizarea
 * ca pagini nu le randeaza niciodata si n-are de ce sa le descarce.
 */
const CartDrawerClassic = dynamic(
  () => import("@/components/storefront/sections/cart/CartDrawerClassic").then((m) => m.CartDrawerClassic),
  { ssr: true },
);
const CheckoutClassic = dynamic(
  () => import("@/components/storefront/sections/checkout/CheckoutClassic").then((m) => m.CheckoutClassic),
  { ssr: true },
);
const VARIANTE_COS: Record<string, typeof CartDrawerClassic> = { classic: CartDrawerClassic };
const VARIANTE_COMANDA: Record<string, typeof CheckoutClassic> = { classic: CheckoutClassic };

/*
 * Implicitele goale ale fatetelor, ca CONSTANTE de modul.
 *
 * Scrise ca literali in lista de parametri (`fatete = []`), se evalueaza din nou
 * la FIECARE randare, deci sunt referinte noi de fiecare data. `useMemo` compara
 * dependintele cu `Object.is`, asa ca memo-ul fatetelor se invalida mereu, iar
 * prin el si `filteredProducts` — care il are in dependinte. Rezultatul ar fi
 * fost o refiltrare si o resortare a intregului catalog la fiecare tasta, la
 * fiecare adaugare in cos si la fiecare trecere cu mausul peste un card, pe
 * TOATE magazinele, inclusiv cele care nu ating pagina de catalog. La 1221 de
 * produse, sortarea implicita „newest" face doua parsari de data per comparatie.
 */
const FARA_FATETE: Fateta[] = [];
const FARA_JETOANE: string[] = [];

interface Props {
  business: Business;
  products: Product[];
  storeSettings: StoreSettings | null;
  basePath?: string;
  categories?: StoreCategoryNode[];
  initialPage?: number;
  /** Cautare si categorie venite din adresa (?q=, ?cat=), folosite de header-ul cu cautare. */
  initialSearch?: string;
  initialCategory?: string;
  /** ?sale=1 — porneste catalogul filtrat pe reduceri (butonul din header). */
  initialOnSale?: boolean;
  /**
   * Configuratia de design (sectiuni + variante) si stilul rezolvat, calculate
   * server-side. Cat timp exista o singura varianta per sectiune — cea „classic",
   * identica cu ce era hardcodat aici — `design` inca nu decide randarea; doar
   * `designStyle` are efect, prin variabilele CSS de pe StorefrontThemeScope.
   */
  design: StoreDesign;
  designStyle: ResolvedStyle;
  /**
   * Pagina e deschisa in iframe-ul editorului. Atunci designul poate fi
   * suprascris live prin postMessage, fara salvare si fara reincarcare.
   */
  preview?: boolean;
  /**
   * Care suprafata de magazin se randeaza: pagina principala sau pagina de
   * catalog.
   *
   * Amandoua au nevoie de EXACT aceeasi masinarie — un singur `CartProvider`, un
   * singur sertar, aceleasi filtre, acelasi quick-add, aceiasi pixeli — si
   * difera doar prin sectiunile pe care le arata. Doua componente ar fi insemnat
   * doua copii ale acelei masinarii, iar prima diferenta strecurata intre ele ar
   * fi fost un al doilea `CartProvider`: numarul din cos ar fi inghetat in
   * header, fiindca evenimentul `storage` nu se declanseaza in fila care scrie.
   */
  surface?: "home" | "shop";
  /** Fatetele calculate pe server. Doar pagina de catalog le cere. */
  fatete?: Fateta[];
  jetoane?: string[];
  /** Filtrele venite din adresa, ca un link partajat sa arate acelasi catalog. */
  initialSelectieFatete?: SelectieFatete;
  initialPriceMin?: string;
  initialPriceMax?: string;
  initialInStock?: boolean;
  /** Sortarea din adresa. Gol = ramane cea implicita a magazinului. */
  initialSort?: string;
}

function StoreContent({ business, products, storeSettings, basePath: basePathProp, categories, initialPage = 1, initialSearch = "", initialCategory = "toate", initialOnSale = false, design: designProp, designStyle: designStyleProp, preview = false, surface = "home", fatete = FARA_FATETE, jetoane = FARA_JETOANE, initialSelectieFatete, initialPriceMin = "", initialPriceMax = "", initialInStock = false, initialSort = "" }: Props) {
  // In editor, designul vine live prin postMessage; in rest sunt exact props-urile.
  const { design, style: designStyle } = useDesignPreview(designProp, designStyleProp, preview);
  // Cosul si formularul de comanda nu sunt sectiuni de pagina, deci nu trec prin
  // `SectionRenderer`: sunt panouri conduse de starea de aici, cu zece props.
  // Dispecerul lor sta la locul de montare; variantele viitoare intra in cele
  // doua liste de sus, incarcate la fel, la cerere.
  const CosVarianta = VARIANTE_COS[design.commerce.cartDrawer.variant] ?? CartDrawerClassic;
  const ComandaVarianta = VARIANTE_COMANDA[design.commerce.checkout.variant] ?? CheckoutClassic;

  // Cand comerciantul si-a ales cosul sau finalizarea ca pagini de sine
  // statatoare, panourile nu se mai monteaza deloc si butoanele navigheaza.
  // Alegerea e exclusiva prin design: doua drumuri catre acelasi lucru ar
  // insemna doua fluxuri de urmarit si un client care nu stie unde a ajuns.
  const cosPePagina = cartOnPage(design);
  const comandaPePagina = checkoutOnPage(design);
  const basePath = basePathProp ?? `/${business.slug}`;
  /*
   * Catalogul si-a luat pagina lui, iar noi randam pagina principala.
   *
   * Din semnul asta ies trei lucruri: grila si bara de cautare nu se mai
   * randeaza aici, cautarea din header navigheaza in loc sa filtreze, iar
   * apasarea unei categorii duce la pagina de catalog. Fara el, fiecare dintre
   * cele trei ar fi schimbat o stare pe care n-o vede nimeni.
   */
  const catalogMutat = surface === "home" && shopOnPage(design);
  const catalogRootPagina = radacinaCatalog(basePath, design);
  const mergiLaCos = useCallback(() => { window.location.href = cartHref(basePath); }, [basePath]);
  const mergiLaComanda = useCallback(() => { window.location.href = checkoutHref(basePath); }, [basePath]);
  const [cartOpen, setCartOpen] = useState(false);

  /*
   * `?cos=1` deschide sertarul la sosire.
   *
   * Butonul de cos de pe paginile fara catalog (produs, politici, pagini
   * proprii) nu are unde sa deschida sertarul, deci trimite aici cu semnul
   * asta. Fara el, clientul care adauga un produs de pe pagina lui ateriza in
   * prima pagina a magazinului, fara sa vada ce a adaugat. Semnul se sterge
   * imediat din adresa, ca reincarcarea sa nu redeschida sertarul.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("cos") !== "1") return;
    // Adresa nu poate fi citita la randare: pe server nu exista, iar o stare
    // initiala diferita ar da eroare de hidratare. Efectul e singurul loc.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCartOpen(true);
    sp.delete("cos");
    const qs = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, []);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [recoverDiscountCode, setRecoverDiscountCode] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  // Variable product whose option picker is open (grid quick-add).
  const [quickAddProduct, setQuickAddProduct] = useState<Product | null>(null);
  // Page is seeded from the URL (?page=N, read server-side as initialPage) so
  // returning from a product page (browser back) lands on the same page instead
  // of resetting to 1. goToPage keeps the URL in sync without a navigation.
  const [currentPage, setCurrentPage] = useState(initialPage);
  const goToPage = useCallback((n: number) => {
    setCurrentPage(n);
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (n <= 1) sp.delete("page"); else sp.set("page", String(n));
    const qs = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, []);
  // Remember the active page for this tab so the "Magazin" link on a product page
  // can return here (browser back already works via the URL).
  useEffect(() => {
    try { sessionStorage.setItem(`store_page_${business.slug}`, String(currentPage)); } catch {}
  }, [currentPage, business.slug]);

  // Bundle availability is derived from components (best-effort on the storefront;
  // the authoritative check happens at order time). Resolve components from the
  // loaded product list; unknown components are treated as available.
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  // Per-product weights (grams) for the international shipping quote (opt-in).
  const productWeights = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) if (p.weight_grams) m[p.id] = p.weight_grams;
    return m;
  }, [products]);
  const isProductOutOfStock = useCallback((p: Product): boolean => {
    if (p.is_bundle) {
      const cfg = readBundleConfig(p.page_sections);
      if (!cfg || cfg.items.length === 0) return false;
      return cfg.items.some((it) => {
        const comp = productById.get(it.product_id);
        return !!(comp && comp.track_inventory && (comp.stock_quantity ?? 0) < it.quantity);
      });
    }
    return !!(p.track_inventory && p.stock_quantity === 0);
  }, [productById]);

  // Product filters (price range, variant options, on-sale, in-stock)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceMin, setPriceMin] = useState(initialPriceMin);
  const [priceMax, setPriceMax] = useState(initialPriceMax);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [onSaleOnly, setOnSaleOnly] = useState(initialOnSale);
  const [inStockOnly, setInStockOnly] = useState(initialInStock);
  /*
   * Fatetele bogate stau intr-o stare SEPARATA de `selectedOptions`.
   *
   * Cele doua se aduna la filtrare, dar nu se amesteca: pagina principala
   * ramane exact pe filtrele ei de azi (optiuni de varianta derivate din
   * payload-ul slimuit), iar pagina de catalog foloseste fatetele calculate pe
   * server, care includ brandul si specificatiile. Unificate acum, orice
   * greseala din regula de calitate a fatetelor s-ar fi vazut si in filtrele
   * deja folosite ale paginii principale.
   */
  const [selectieFatete, setSelectieFatete] = useState<SelectieFatete>(initialSelectieFatete ?? {});
  const selectieIndici = useMemo(() => indiciSelectati(selectieFatete, jetoane), [selectieFatete, jetoane]);

  const comutaFateta = useCallback((cheie: string, valoare: string) => {
    setSelectieFatete((prev) => {
      const cur = prev[cheie] ?? [];
      const next = cur.includes(valoare) ? cur.filter((v) => v !== valoare) : [...cur, valoare];
      const out = { ...prev };
      if (next.length) out[cheie] = next;
      else delete out[cheie];
      return out;
    });
  }, []);

  function toggleOption(name: string, value: string) {
    setSelectedOptions((prev) => {
      const cur = prev[name] ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      const out = { ...prev };
      if (next.length) out[name] = next;
      else delete out[name];
      return out;
    });
  }
  function resetFilters() {
    setPriceMin("");
    setPriceMax("");
    setSelectedOptions({});
    setOnSaleOnly(false);
    setInStockOnly(false);
    setSelectieFatete({});
  }
  const activeFilterCount =
    (priceMin.trim() || priceMax.trim() ? 1 : 0) +
    Object.values(selectedOptions).reduce((s, v) => s + v.length, 0) +
    numaraSelectia(selectieFatete) +
    (onSaleOnly ? 1 : 0) +
    (inStockOnly ? 1 : 0);
  const { addItem, count, total, restoreCart, items: cartItemsForTracking } = useCart();

  // Cart recovery: a ?recover=<cartId> link rebuilds the saved cart and opens
  // checkout (optionally pre-applying a discount code from &code=).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cartId = params.get("recover");
    if (!cartId) return;
    const code = params.get("code");
    let cancelled = false;
    getRecoverableCart(cartId).then((items) => {
      if (cancelled || items.length === 0) return;
      restoreCart(items.map((i) => ({ productId: i.product_id, name: i.name, price: i.price, imageUrl: i.image_url ?? null, quantity: i.quantity })));
      if (code) setRecoverDiscountCode(code);
      // Magazinele cu finalizarea pe pagina n-au ce modal sa deschida: linkul
      // din emailul de recuperare trebuie sa ajunga tot la formular, deci
      // navigheaza, ducand codul de reducere mai departe in adresa.
      if (comandaPePagina) {
        window.location.href = code
          ? `${checkoutHref(basePath)}?code=${encodeURIComponent(code)}`
          : checkoutHref(basePath);
        return;
      }
      setCheckoutOpen(true);
    });
    // Clean the URL so a refresh doesn't re-trigger recovery.
    const url = new URL(window.location.href);
    url.searchParams.delete("recover");
    url.searchParams.delete("code");
    window.history.replaceState({}, "", url.toString());
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const color = business.primary_color ?? "#1AB554";
  const shippingCost = Number(storeSettings?.default_shipping_cost ?? 20);
  const freeShippingThreshold = storeSettings?.free_shipping_threshold
    ? Number(storeSettings.free_shipping_threshold)
    : null;
  const minOrderAmount = storeSettings?.min_order_amount
    ? Number(storeSettings.min_order_amount)
    : null;

  const pageContent = (storeSettings?.page_content as StorePageContent) ?? {};
  const menu = pageContent.menu ?? [];
  const social = (business.social as StoreSocial) ?? {};
  const gallery = Array.isArray(business.gallery) ? (business.gallery as string[]) : [];
  const features = (business.features as StoreFeatures) ?? {};

  const showWhatsApp = features.floating_whatsapp !== false && !!business.whatsapp;
  const showCall = features.floating_call === true && !!business.phone;

  const showAnnouncementOnStore = pageContent.show_announcement_on_store !== false && pageContent.announcement_bar?.enabled === true;

  const showStickyCartBar = pageContent.sticky_cart_bar?.enabled !== false;

  const newBadgeDays = pageContent.new_badge?.enabled !== false ? (pageContent.new_badge?.days ?? 7) : 0;

  // Produse variabile: interval de pret implicit; doar pretul minim daca e dezactivat din editor.
  const priceLowestOnly = pageContent.price_range_display?.enabled === false;

  // Sorting is a standard storefront feature — always shown. Honour the saved
  // default sort if present, otherwise newest-first.
  const defaultSort = pageContent.sort_options?.default_sort ?? "newest";
  // Sortarea din adresa bate implicitul magazinului: un link partajat trebuie
  // sa arate lista in aceeasi ordine ca cea din care a fost copiat.
  const [sort, setSort] = useState<string>(initialSort || defaultSort);
  // While a search is active and no sort was explicitly chosen, results order
  // by relevance — surfaced as a visible "Relevanta" option in the dropdown.
  const [sortTouched, setSortTouched] = useState(!!initialSort);

  // Titlul grilei principale depinde de existenta hero-ului: cand pagina nu are
  // hero si nici sectiunea Recomandate, catalogul isi pune propriul titlu.
  //
  // Conteaza si sectiunea, nu doar continutul: hero-ul se poate stinge sau sterge
  // din editor, iar dupa aceea catalogul ar fi ramas fara antet asteptand un hero
  // care nu se mai randeaza. Pe designul derivat cele doua conditii coincid, deci
  // magazinele care n-au atins editorul raman identice.
  const heroActiv = design.home.some((s) => s.kind === "hero" && s.enabled);
  const hasHero =
    heroActiv
    && (resolveHeroBanners(pageContent as Record<string, unknown>, business.cover_url).banners.length > 0
      || !!business.tagline);

  // Grila si bara de cautare se muta pe pagina de catalog cand exista una.
  // Regula sta in `commerce.ts`, langa gate, ca sa fie una singura si testabila.
  const sectiuniDeAcasa = useMemo(() => sectiuniAcasa(design), [design]);

  // H1-ul paginii de magazin traieste in hero, singura sectiune care il emite si
  // in acelasi timp se poate stinge si sterge. Cand nicio sectiune activa nu il
  // declara, il punem noi, ascuns: o pagina fara niciun titlu de nivel unu isi
  // pierde titlul in rezultatele cautarii.
  // Pe pagina de catalog H1-ul il emite chiar varianta aleasa, deci fallback-ul
  // ascuns n-are ce cauta acolo; scanarea listei paginii principale n-ar fi
  // gasit-o oricum, fiindca slotul e in afara lui `design.home`.
  const areTitluDePagina = surface === "shop"
    ? variantMeta("shop_page", design.shop.page.variant)?.providesH1 === true
    : sectiuniDeAcasa.some((s) => s.enabled && variantMeta(s.kind, s.variant)?.providesH1 === true);
  const showCategoryBadges = pageContent.show_category_badges !== false; // category chip on product cards

  // Vizibilitate catalog (opt-in din editor): ascunde produsele fara imagini
  // si/sau fara stoc din TOATE suprafetele vizitatorului (grila + paginare,
  // Recomandate, sectiuni custom, cautare, fatete, pastile de categorii).
  // `products` COMPLET ramane sursa pentru derivarea stocului la pachete,
  // componentele bundle si greutatile de transport — o componenta ascunsa
  // individual nu strica pachetul care o contine. PDP prin link direct ramane
  // accesibil (deci si One Product Store e neafectat).
  const hideNoImage = pageContent.hide_products_without_images === true;
  const hideNoStock = pageContent.hide_out_of_stock_products === true;
  const visibleProducts = useMemo(() => {
    if (!hideNoImage && !hideNoStock) return products;
    return products.filter((p) => {
      if (hideNoImage) {
        const imgs = Array.isArray(p.images) ? (p.images as unknown[]).filter(Boolean) : [];
        if (imgs.length === 0) return false;
      }
      if (hideNoStock && isProductOutOfStock(p)) return false;
      return true;
    });
  }, [products, hideNoImage, hideNoStock, isProductOutOfStock]);

  // Category hierarchy — built from the categories table (parent_id) + product
  // assignments. Only categories whose subtree contains products are shown.
  const catTree = useMemo(() => {
    type Item = { key: string; id: string | null; name: string; image: string | null; hasChildren: boolean };
    const list = categories ?? [];
    const productCatNames = new Set<string>();
    visibleProducts.forEach(p => { if (p.category) productCatNames.add(p.category); });

    const byId = new Map(list.map(c => [c.id, c]));
    const childrenOf = new Map<string, StoreCategoryNode[]>();
    for (const c of list) {
      if (c.parent_id) {
        const arr = childrenOf.get(c.parent_id) ?? [];
        arr.push(c);
        childrenOf.set(c.parent_id, arr);
      }
    }
    for (const arr of childrenOf.values()) arr.sort((a, b) => a.sort_order - b.sort_order);

    const subtreeNames = (c: StoreCategoryNode): string[] => {
      const out = [c.name];
      for (const ch of childrenOf.get(c.id) ?? []) out.push(...subtreeNames(ch));
      return out;
    };
    const hasProducts = (c: StoreCategoryNode): boolean => subtreeNames(c).some(n => productCatNames.has(n));
    const toItem = (c: StoreCategoryNode): Item => ({
      key: c.id, id: c.id, name: c.name, image: c.image_url,
      hasChildren: (childrenOf.get(c.id) ?? []).some(hasProducts),
    });

    const subtreeByName: Record<string, string[]> = {};
    for (const c of list) subtreeByName[c.name] = subtreeNames(c);

    const childItemsById: Record<string, Item[]> = {};
    for (const c of list) {
      const kids = (childrenOf.get(c.id) ?? []).filter(hasProducts).map(toItem);
      if (kids.length) childItemsById[c.id] = kids;
    }

    const topCats = list.filter(c => !c.parent_id && hasProducts(c)).sort((a, b) => a.sort_order - b.sort_order);
    const tableNames = new Set(list.map(c => c.name));
    const orphanItems: Item[] = Array.from(productCatNames)
      .filter(n => !tableNames.has(n)).sort()
      .map(n => ({ key: `orphan:${n}`, id: null, name: n, image: null, hasChildren: false }));
    const topItems: Item[] = [...topCats.map(toItem), ...orphanItems];

    const hasAnyImage = topItems.some(i => i.image) || Object.values(childItemsById).some(arr => arr.some(i => i.image));
    return { topItems, childItemsById, subtreeByName, byId, hasAnyImage };
  }, [categories, visibleProducts]);

  const [drillParentId, setDrillParentId] = useState<string | null>(null);
  const drillParent = drillParentId ? catTree.byId.get(drillParentId) ?? null : null;
  const currentItems = drillParentId ? (catTree.childItemsById[drillParentId] ?? []) : catTree.topItems;
  const hasCategories = catTree.topItems.length > 0;
  const hasAnyCategoryImage = catTree.hasAnyImage;

  function selectCategoryItem(item: { id: string | null; name: string; hasChildren: boolean }) {
    if (catalogMutat) {
      window.location.href = hrefCategorie(catalogRootPagina, item.name);
      return;
    }
    // Drill into a category that has subcategories; otherwise just filter by it.
    if (item.hasChildren && item.id) setDrillParentId(item.id);
    setCategoryFilter(item.name);
  }
  function resetCategory() {
    if (catalogMutat) {
      window.location.href = catalogRootPagina;
      return;
    }
    setCategoryFilter("toate");
    setDrillParentId(null);
  }
  function goBackCategory() {
    const backTo = drillParent?.parent_id ?? null;
    setDrillParentId(backTo);
    setCategoryFilter(backTo ? (catTree.byId.get(backTo)?.name ?? "toate") : "toate");
  }

  // Featured products
  const featuredProducts = useMemo(() => visibleProducts.filter(p => p.is_featured), [visibleProducts]);

  // Custom product sections — curated rows shown above the main catalog. Resolved
  // from the already-loaded product list (no extra queries); empty ones are dropped.
  const productSections = useMemo(() => {
    return parseProductSections(pageContent.product_sections)
      .filter(s => s.enabled)
      .map(section => ({ section, items: resolveSectionProducts(section, visibleProducts, catTree.subtreeByName) }))
      .filter(x => x.items.length > 0);
  }, [pageContent.product_sections, visibleProducts, catTree.subtreeByName]);

  function viewAllCategory(category: string) {
    // Ancora `#produse` traieste pe grila. Mutata, „Vezi toate" ar fi derulat
    // catre `null`, adica n-ar fi facut nimic si n-ar fi dat nicio eroare.
    if (catalogMutat) {
      window.location.href = hrefCategorie(catalogRootPagina, category);
      return;
    }
    setCategoryFilter(category);
    setDrillParentId(null);
    if (typeof document !== "undefined") {
      document.getElementById("produse")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Filter facets: variant options + price bounds across the products.
  const facets = useMemo(() => {
    const opts = new Map<string, Set<string>>();
    let min = Infinity;
    let max = 0;
    for (const p of visibleProducts) {
      const price = Number(p.price);
      if (Number.isFinite(price)) {
        if (price < min) min = price;
        if (price > max) max = price;
      }
      const ps = p.page_sections as { variants?: { enabled?: boolean; options?: { name: string; values: string[] }[] } } | null;
      if (ps?.variants?.enabled && Array.isArray(ps.variants.options)) {
        for (const o of ps.variants.options) {
          if (!o?.name || !Array.isArray(o.values)) continue;
          const set = opts.get(o.name) ?? new Set<string>();
          for (const v of o.values) if (v != null && String(v).trim()) set.add(String(v));
          opts.set(o.name, set);
        }
      }
    }
    const options = [...opts.entries()]
      .map(([name, set]) => ({ name, values: [...set].sort((a, b) => a.localeCompare(b, "ro", { numeric: true })) }))
      .filter((o) => o.values.length > 0);
    return { options, priceMin: min === Infinity ? 0 : Math.floor(min), priceMax: Math.ceil(max) };
  }, [visibleProducts]);

  // Search engine — diacritics-insensitive + typo-tolerant, ranked by
  // relevance (see @/lib/storefront/product-search). Deferred so results
  // recompute off the urgent keystroke render.
  const deferredSearch = useDeferredValue(search);
  const searchIdx = useMemo(() => buildProductSearchIndex(visibleProducts.map((p) => {
    const ps = p.page_sections as { variants?: { enabled?: boolean; options?: { name: string; values: string[] }[] } } | null;
    const optionValues = ps?.variants?.enabled
      ? (ps.variants.options ?? []).flatMap((o) => (Array.isArray(o?.values) ? o.values.map(String) : []))
      : undefined;
    return { id: p.id, name: p.name, category: p.category, description: p.description, optionValues };
  })), [visibleProducts]);
  // null = empty query (no search filtering); otherwise product id → relevance.
  const searchMatches = useMemo(
    () => queryProductSearchIndex(searchIdx, deferredSearch),
    [searchIdx, deferredSearch],
  );
  const effectiveSort = searchMatches && !sortTouched ? "relevance" : sort;

  // Filtered products
  const filteredProducts = useMemo(() => {
    const pMin = priceMin.trim() ? parseFloat(priceMin) : null;
    const pMax = priceMax.trim() ? parseFloat(priceMax) : null;
    const activeOpts = Object.entries(selectedOptions).filter(([, v]) => v.length > 0);
    const list = visibleProducts.filter(p => {
      const matchesSearch = !searchMatches || searchMatches.has(p.id);
      const matchesCategory = categoryFilter === "toate"
        || (catTree.subtreeByName[categoryFilter] ?? [categoryFilter]).includes(p.category ?? "");
      const price = Number(p.price);
      const matchesPrice = (pMin == null || price >= pMin) && (pMax == null || price <= pMax);
      const matchesSale = !onSaleOnly || (p.compare_at_price != null && Number(p.compare_at_price) > price);
      const matchesStock = !inStockOnly || !p.track_inventory || (p.stock_quantity ?? 0) > 0;
      let matchesOptions = true;
      if (activeOpts.length) {
        const ps = p.page_sections as { variants?: { options?: { name: string; values: string[] }[] } } | null;
        const prodOpts = new Map<string, Set<string>>();
        for (const o of ps?.variants?.options ?? []) prodOpts.set(o.name, new Set((o.values ?? []).map(String)));
        matchesOptions = activeOpts.every(([name, vals]) => {
          const s = prodOpts.get(name);
          return s ? vals.some((v) => s.has(v)) : false;
        });
      }
      const matchesFatete = trecefiltrele(p.f, selectieIndici);
      return matchesSearch && matchesCategory && matchesPrice && matchesSale && matchesStock && matchesOptions && matchesFatete;
    });
    // Sort. "relevance" only exists while a search is active (see effectiveSort).
    if (searchMatches && effectiveSort === "relevance") {
      list.sort((a, b) =>
        ((searchMatches.get(b.id) ?? 0) - (searchMatches.get(a.id) ?? 0))
        || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return list;
    }
    switch (effectiveSort) {
      case "price_asc": list.sort((a, b) => Number(a.price) - Number(b.price)); break;
      case "price_desc": list.sort((a, b) => Number(b.price) - Number(a.price)); break;
      case "popular": list.sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0)); break;
      case "name_asc": list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "newest": default: list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
    }
    return list;
  }, [visibleProducts, searchMatches, categoryFilter, effectiveSort, priceMin, priceMax, selectedOptions, onSaleOnly, inStockOnly, selectieIndici]);

  const PRODUCTS_PER_PAGE = 20;
  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * PRODUCTS_PER_PAGE,
    currentPage * PRODUCTS_PER_PAGE,
  );

  /*
   * GA4 `view_item_list` pentru pagina de catalog vizibila.
   *
   * Lista se numeste dupa SUPRAFATA, nu „catalog" peste tot: cu doua suprafete
   * care arata produse, un singur nume ar fi amestecat in rapoarte grila de pe
   * pagina principala cu pagina de catalog, iar comerciantul n-ar mai fi putut
   * compara. Semnatura opreste si trimiterile repetate: efectul depinde de
   * `filteredProducts`, care se recalculeaza la fiecare cautare asezata, deci o
   * cautare de opt litere emitea pana la opt evenimente pentru aceeasi lista.
   */
  const listaTrimisa = useRef("");
  useEffect(() => {
    if (paginatedProducts.length === 0) return;
    const semnatura = `${currentPage}:${paginatedProducts.map((p) => p.id).join(",")}`;
    if (listaTrimisa.current === semnatura) return;
    listaTrimisa.current = semnatura;
    gtagEvent("view_item_list", {
      item_list_id: surface === "shop" ? "pagina_magazin" : "catalog",
      item_list_name: surface === "shop" ? "Pagina Magazin" : "Produse",
      items: paginatedProducts.map((p, i) => ({ item_id: p.id, item_name: p.name, price: Number(p.price) || 0, index: (currentPage - 1) * PRODUCTS_PER_PAGE + i, quantity: 1 })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filteredProducts]);

  // Reset to page 1 when filters change — but not on the initial mount, which
  // would clobber a page restored from the URL.
  const filtersInitRef = useRef(true);
  useEffect(() => {
    if (filtersInitRef.current) { filtersInitRef.current = false; return; }
    goToPage(1);
  }, [search, categoryFilter, effectiveSort, priceMin, priceMax, selectedOptions, onSaleOnly, inStockOnly, selectieFatete, goToPage]);

  /*
   * Filtrele traiesc si in adresa, nu doar in stare.
   *
   * Pe pagina principala grila e o parte a unei pagini de prezentare si nimeni
   * nu trimite mai departe „pagina 3 filtrata"; pe o pagina care se numeste
   * Magazin si isi face reclama cu filtrare pe atribute, un link care nu poarta
   * filtrele e un bug raportat. Se scrie cu `replaceState`, ca butonul Inapoi sa
   * ramana al paginilor, nu al fiecarei bife.
   */
  useEffect(() => {
    if (surface !== "shop" || typeof window === "undefined") return;
    // Se construieste de la zero, nu se peticeste adresa existenta: altfel un
    // filtru scos ar fi ramas in link, fiindca stergerea lui n-are unde sa se
    // vada. Numarul paginii e singurul care se pastreaza — il scrie `goToPage`,
    // iar efectul asta nu stie despre el.
    const sp = new URLSearchParams();
    const adresa = new URLSearchParams(window.location.search);
    const pagina = adresa.get("page");
    // `preview=1` nu e un filtru, e modul in care proprietarul isi vede ciorna:
    // sters din adresa, o reincarcare l-ar fi aruncat pe designul publicat.
    if (adresa.get("preview") === "1") sp.set("preview", "1");
    if (categoryFilter && categoryFilter !== "toate") sp.set("cat", categoryFilter);
    if (search.trim()) sp.set("q", search.trim());
    for (const [cheie, valori] of Object.entries(selectieFatete)) {
      if (valori.length) sp.set(cheie, valori.join("|"));
    }
    if (priceMin.trim()) sp.set("pmin", priceMin.trim());
    if (priceMax.trim()) sp.set("pmax", priceMax.trim());
    if (onSaleOnly) sp.set("sale", "1");
    if (inStockOnly) sp.set("stoc", "1");
    if (sortTouched && sort) sp.set("sort", sort);
    if (pagina) sp.set("page", pagina);
    const qs = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [surface, selectieFatete, priceMin, priceMax, onSaleOnly, inStockOnly, sort, sortTouched, categoryFilter, search]);

  // Fire the AddToCart pixels and flash the card's "Adaugat!" state for a line
  // that just entered the cart (shared by simple products and variant quick-add).
  function trackAndFlash(productId: string, name: string, price: number) {
    trackAddToCart({ productId, name, price });
    setAddedId(productId);
    setTimeout(() => setAddedId(null), 1500);
  }

  function handleAddToCart(product: Product) {
    // Variable product: open the picker instead of silently adding at base price.
    if (parseVariants(product.page_sections)) { setQuickAddProduct(product); return; }
    const images = Array.isArray(product.images) ? product.images : [];
    const price = Number(product.price);
    addItem({
      productId: product.id,
      slug: product.slug ?? undefined,
      name: product.name,
      price,
      imageUrl: images[0] ? String(images[0]) : null,
    });
    trackAndFlash(product.id, product.name, price);
  }

  // Quick-add confirm: the fully resolved variant line from the picker sheet.
  function handleQuickAdd(line: QuickAddLine) {
    addItem(line);
    trackAndFlash(line.productId, line.name, line.price);
  }

  /**
   * Starea paginii, pusa la dispozitia sectiunilor.
   *
   * Nu e memoizata deliberat: azi tot ce e mai jos traieste in aceeasi
   * componenta, deci orice schimbare de stare rerandeaza oricum totul.
   * Memoizarea devine utila abia dupa ce sectiunile sunt componente separate,
   * si atunci se face pe bucati, nu pe obiectul intreg.
   */
  const storefront: StorefrontContextValue = {
    business,
    basePath,
    // Linkurile de categorie duc unde pune designul catalogul: cand exista
    // pagina de magazin, acolo, nu inapoi in grila paginii principale.
    catalogRoot: catalogRootPagina,
    isHome: surface === "home",
    // Pagina principala fara grila nu mai poate filtra pe loc: cautarea din
    // header trebuie sa navigheze, nu sa scrie intr-o lista pe care n-o vede
    // nimeni. Vezi `useCatalogCautabil`.
    filtreazaPeLoc: !catalogMutat,
    color,
    pageContent,
    features,
    social,
    gallery,
    menu,
    // Acelasi calcul ca bara randata mai jos: stinsa sau stearsa din editorul de
    // sectiuni, `page_content` ramane pe „enabled" si header-ul ar fi ramas lipit
    // la `top-9` peste o fasie goala.
    hasAnnouncementBar: showAnnouncementOnStore && standaloneAnnouncement(design)?.enabled === true,
    announcementOn: design.chrome.announcement?.enabled === true,
    hasHero,

    products,
    visibleProducts,
    filteredProducts,
    paginatedProducts,
    featuredProducts,
    productSections,
    isProductOutOfStock,

    search,
    setSearch,
    sort,
    setSort,
    setSortTouched,
    effectiveSort,
    hasSearchMatches: searchMatches !== null,
    // Orice forma de cautare din header — bara permanenta SAU lupa — ascunde
    // campul din catalog: doua cautari una sub alta nu ajuta pe nimeni.
    headerHasSearch: headerAreCautare(design),

    filtersOpen,
    setFiltersOpen,
    activeFilterCount,
    resetFilters,
    facets,
    fatete,
    selectieFatete,
    comutaFateta,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    selectedOptions,
    toggleOption,
    onSaleOnly,
    setOnSaleOnly,
    inStockOnly,
    setInStockOnly,

    categories: categories ?? [],
    categoryFilter,
    currentCategoryItems: currentItems,
    rootCategoryItems: catTree.topItems,
    isDrilled: drillParentId !== null,
    drillParentName: drillParent?.name ?? null,
    hasCategories,
    hasAnyCategoryImage,
    selectCategoryItem,
    resetCategory,
    goBackCategory,
    viewAllCategory,

    currentPage,
    totalPages,
    goToPage,

    addToCart: handleAddToCart,
    addedId,
    cartMode: cosPePagina ? "page" : "drawer",
    cartHref: cosPePagina ? cartHref(basePath) : undefined,
    openCart: cosPePagina ? mergiLaCos : () => setCartOpen(true),
    openCheckout: comandaPePagina ? mergiLaComanda : () => setCheckoutOpen(true),

    newBadgeDays,
    showCategoryBadges,
    priceLowestOnly,
    freeShippingThreshold,
    openLightbox: setLightboxUrl,
    isPreview: preview,
  };

  return (
    <StorefrontProvider value={storefront}>
    <StorefrontThemeScope style={designStyle} className="min-h-screen">
      <ChromeSection section={standaloneAnnouncement(design)} />
      <ChromeSection section={design.chrome.header} />

      {!areTitluDePagina && (
        <h1 className="sr-only">
          {business.store_name ?? business.business_name}
          {business.tagline ? ` - ${business.tagline}` : ""}
        </h1>
      )}
      {surface === "shop" ? (
        <main>
          <ShopPageSection variant={design.shop.page.variant} setari={design.shop.page.settings} />
        </main>
      ) : (
        <SectionRenderer sections={sectiuniDeAcasa} />
      )}

      <ChromeSection section={design.chrome.footer} />

      {/* Floating buttons */}
      <div className={`fixed right-4 z-30 flex flex-col items-center gap-3 transition-all ${showStickyCartBar && count > 0 && !cartOpen && !checkoutOpen ? "bottom-[5.5rem] lg:bottom-5" : "bottom-5"}`}>
        {showCall && (
          <a href={`tel:${business.phone}`}
            className="hover:scale-110 active:scale-95 transition-transform"
            style={{ filter: `drop-shadow(0 4px 14px ${color}88)` }}>
            <svg viewBox="0 0 64 64" className="h-14 w-14" xmlns="http://www.w3.org/2000/svg">
              <circle cx="32" cy="32" r="32" fill={color}/>
              <svg x="16" y="16" width="32" height="32" viewBox="0 0 24 24">
                <path fill="white" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
              </svg>
            </svg>
          </a>
        )}
        {showWhatsApp && (
          <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer"
            className="hover:scale-110 active:scale-95 transition-transform"
            style={{ filter: "drop-shadow(0 4px 14px rgba(37,211,102,0.55))" }}>
            <svg viewBox="0 0 64 64" className="h-14 w-14" xmlns="http://www.w3.org/2000/svg">
              <circle cx="32" cy="32" r="32" fill="#25D366"/>
              <svg x="15" y="13" width="34" height="38" viewBox="0 0 448 512">
                <path fill="white" d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
              </svg>
            </svg>
          </a>
        )}
      </div>

      {/* Sticky cart bar (mobile) */}
      {showStickyCartBar && count > 0 && !cartOpen && !checkoutOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-surface border-t border-border shadow-2xl px-4 py-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={cosPePagina ? mergiLaCos : () => setCartOpen(true)}
            className="w-full flex items-center justify-between gap-3 py-3 px-4 rounded-xl text-white font-bold text-sm active:scale-[0.98] transition-transform"
            style={{ backgroundColor: color }}>
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              <span>{count} {count === 1 ? "produs" : "produse"}</span>
            </div>
            <span>{formatPrice(total)}</span>
          </button>
        </div>
      )}

      {/* Cart drawer */}
      {!cosPePagina && (
        <CosVarianta
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          color={color}
          basePath={basePath}
          businessId={business.id}
          onCheckout={() => {
            setCartOpen(false);
            // Cand finalizarea e pe pagina, sertarul duce acolo in loc sa
            // deschida modalul, iar evenimentele de palnie le trimite PAGINA la
            // incarcare, nu clicul de aici: altfel ar lipsi pentru cine intra
            // direct pe adresa si s-ar dubla pentru cine vine din sertar.
            if (comandaPePagina) { mergiLaComanda(); return; }
            setCheckoutOpen(true);
            fbTrack("InitiateCheckout", { value: total, currency: "RON", num_items: count, content_type: "product", content_ids: cartItemsForTracking.map((i) => i.productId) });
            ttqTrack("InitiateCheckout", { value: total, currency: "RON", contents: cartItemsForTracking.map((i) => ({ content_id: i.productId, content_type: "product", content_name: i.name, price: i.price, quantity: i.quantity })) });
            gtagEvent("begin_checkout", { currency: "RON", value: total, items: cartItemsForTracking.map((i) => ({ item_id: i.productId, item_name: i.name, price: i.price, quantity: i.quantity })) });
          }}
          shippingCost={shippingCost}
          freeShippingThreshold={freeShippingThreshold}
          minOrderAmount={minOrderAmount}
        />
      )}

      {/* Checkout modal */}
      {!comandaPePagina && (
        <ComandaVarianta
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          color={color}
          basePath={basePath}
          businessId={business.id}
          shippingCost={shippingCost}
          freeShippingThreshold={freeShippingThreshold}
          emailFieldConfig={pageContent.checkout_config?.email_field ?? { enabled: true, required: false }}
          initialDiscountCode={recoverDiscountCode}
          productWeights={productWeights}
        />
      )}

      {/* Variant picker (opened by "Alege optiunile" on a variable product card) */}
      <VariantQuickAdd
        open={quickAddProduct !== null}
        product={quickAddProduct ? {
          id: quickAddProduct.id,
          name: quickAddProduct.name,
          slug: quickAddProduct.slug,
          price: Number(quickAddProduct.price),
          compare_at_price: quickAddProduct.compare_at_price != null ? Number(quickAddProduct.compare_at_price) : null,
          images: Array.isArray(quickAddProduct.images) ? quickAddProduct.images.map(String).filter(Boolean) : [],
          page_sections: quickAddProduct.page_sections,
        } : null}
        color={color}
        onClose={() => setQuickAddProduct(null)}
        onAdd={handleQuickAdd}
        deferCombinations
      />

      {/* Gallery lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}>
          <button type="button" aria-label="Inchide galeria" onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-surface/10 flex items-center justify-center text-white hover:bg-surface/20 transition-colors">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cdnImage(lightboxUrl, 2560)} alt="Imagine galerie marita"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </StorefrontThemeScope>
    </StorefrontProvider>
  );
}

export function MiniStoreRenderer(props: Props) {
  return (
    <CartProvider slug={props.business.slug}>
      <StoreContent {...props} />
    </CartProvider>
  );
}
