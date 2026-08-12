"use client";

import { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ShoppingCart, X } from "lucide-react";
import { cdnImage } from "@/lib/cdn-image";
import { formatPrice, whatsappLink } from "@/lib/utils/format";
import { getRecoverableCart } from "@/lib/actions/abandoned-cart.actions";
import { parseProductSections, resolveSectionProducts } from "@/lib/store-sections";
import { buildProductSearchIndex, queryProductSearchIndex } from "@/lib/storefront/product-search";
import { documentDeCautare } from "@/lib/storefront/catalog/doc-cautare";
import { fbTrack, ttqTrack, gtagEvent } from "@/lib/marketing";
import type { BusinessPublic } from "@/lib/storefront/business-public";
import type { Database } from "@/types/database.types";
import { VariantQuickAdd, type QuickAddLine } from "./VariantQuickAdd";
import { parseVariants } from "@/lib/storefront/variants";
import { StorefrontThemeScope } from "@/components/storefront/StorefrontThemeScope";
import type { ResolvedStyle, StoreDesign } from "@/lib/storefront/design/types";
import { CartProvider, useCart } from "@/components/storefront/cart/CartProvider";
import { StickyCartTab } from "@/components/storefront/cart/StickyCartTab";
import { trackAddToCart } from "@/lib/storefront/cart/track-add";
import { hrefCategorie, radacinaMagazin } from "@/lib/storefront/category-href";
import { categoriiVizibile, numeCategoriiAscunse } from "@/lib/categories/vizibilitate";
import {
  cartHref, cartOnPage, checkoutHref, checkoutOnPage, grilaRamaneAcasa, sectiuniAcasa, shopHref, shopOnPage,
} from "@/lib/storefront/design/commerce";
import {
  indiciSelectati, numaraSelectia, trecefiltrele,
  type Fateta, type SelectieFatete,
} from "@/lib/storefront/catalog/facets";
import { citesteSetariMagazin } from "@/lib/storefront/catalog/shop-settings";
import { comparatorSortare, type CheieSortare } from "@/lib/storefront/catalog/sortare";
import { scrieFiltre } from "@/lib/storefront/catalog/url";
import { ShopPageSection } from "@/components/storefront/sections/shop/ShopPageSection";
import { resolveHeroBanners } from "@/lib/storefront/design/hero-banners";
import { variantMeta } from "@/lib/storefront/design/registry";
import { meniuCuAcasa } from "@/lib/pages/menu";
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

// Randul TAIAT, nu cel intreg: componenta e "use client", deci tot ce primeste
// ajunge in HTML. Vezi src/lib/storefront/business-public.ts.
type Business = BusinessPublic;
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
  /**
   * Cine a filtrat si a feliat catalogul.
   *
   * `"client"` e purtarea de dintotdeauna: `products` e catalogul INTREG si tot
   * ce urmeaza — vizibilitate, filtre, sortare, paginare — se face aici.
   *
   * `"server"` inseamna ca `products` e DEJA pagina ceruta, gata filtrata si
   * sortata de `catalog_pagina`. Atunci pasii de mai jos devin identitatea: nu se
   * refiltreaza o pagina, si mai ales nu se REFELIAZA — o a doua feliere peste 24
   * de randuri ar lasa pagina 2 goala.
   */
  palier?: "client" | "server";
  /** Numerele venite din RPC. Obligatorii pe `palier="server"`, vezi StorefrontProvider. */
  totalVizibileServer?: number;
  totalFiltrateServer?: number;
  /**
   * Numele de categorie care au produse, din `catalog_rezumat`.
   *
   * Arborele de categorii se curata la cele care CHIAR contin produse, si asta se
   * deducea din catalogul intreg. Cu o singura pagina in memorie n-ar mai fi
   * posibil — ar disparea din meniu toate categoriile care n-au produse pe pagina
   * curenta.
   */
  numeCategoriiCuProduse?: string[];
  /**
   * Capetele intervalului de pret pe TOT catalogul, din `catalog_rezumat`.
   *
   * Sugestiile din casetele de pret se derivau din lista trimisa in browser. Pe
   * palierul server aceea e o singura pagina, deci pe bricosmart filtrul propunea
   * „14 - 255" pentru un catalog de la 1,11 la 1.506,30 — un interval care ascunde
   * aproape tot magazinul, fara sa dea nicio eroare.
   */
  intervalServer?: { min: number; max: number };
  /**
   * Randurile paginii principale, rezolvate de `catalog_randuri`.
   *
   * Se derivau din `visibleProducts`, deci din catalogul INTREG — inca un motiv
   * pentru care trebuia trimis tot. Cu o singura pagina in memorie, randul
   * „Veste" ar fi aratat doar vestele care se nimeresc pe pagina curenta.
   *
   * `sectiuniServer` e pe id de sectiune; sectiunile lipsa raman goale si se
   * arunca la fel ca azi.
   */
  featuredServer?: StorefrontProduct[];
  sectiuniServer?: Record<string, StorefrontProduct[]>;
  /*
   * Adresa paginii de categorie pe care suntem, cand suntem pe una.
   *
   * Prezenta ei schimba trei lucruri: categoria NU se mai scrie in interogare
   * (o poarta chiar calea), paginarea ramane pe calea asta, iar orice apasare pe
   * o categorie navigheaza in loc sa filtreze pe loc — altfel bara de adrese ar
   * fi spus o categorie si continutul ar fi aratat alta.
   */
  caleCategorie?: string;
  /**
   * Ce lista de categorii se vede de la inceput pe pagina unei categorii: copiii
   * ei daca are, altfel fratii ei. O categorie fara copii care ar fi aratat lista
   * de la radacina si-ar fi pierdut vecinii exact acolo unde se cauta mai departe.
   */
  initialDrillParentId?: string | null;
  /** Categoria parinte a celei din cale. „Inapoi" urca la ea, nu la lista curenta. */
  parinteCategorie?: string | null;
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

function StoreContent({ business, products, storeSettings, basePath: basePathProp, categories, initialPage = 1, initialSearch = "", initialCategory = "toate", initialOnSale = false, design: designProp, designStyle: designStyleProp, preview = false, surface = "home", caleCategorie, initialDrillParentId = null, parinteCategorie = null, fatete = FARA_FATETE, jetoane = FARA_JETOANE, initialSelectieFatete, initialPriceMin = "", initialPriceMax = "", initialInStock = false, initialSort = "", palier = "client", totalVizibileServer, totalFiltrateServer, numeCategoriiCuProduse, intervalServer, featuredServer, sectiuniServer }: Props) {
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
   * Catalogul a PLECAT de pe pagina principala, iar noi randam pagina principala.
   *
   * Nu e acelasi lucru cu „exista o pagina de catalog": implicit, produsele
   * raman si aici. Semnul e adevarat doar cand comerciantul a stins anume
   * „pastreaza produsele si pe pagina principala".
   *
   * Din el ies trei lucruri, toate legate de absenta grilei: cautarea din header
   * navigheaza in loc sa filtreze o lista invizibila, apasarea unei categorii
   * duce la pagina de catalog, iar „Vezi toate" nu mai deruleaza catre o ancora
   * care nu mai exista in DOM.
   */
  const catalogMutat = surface === "home" && shopOnPage(design) && !grilaRamaneAcasa(design);
  // Setarile paginii de catalog, cu implicitele aplicate. Aceleasi valori le
  // citeste si modelul de pagina, dintr-un singur loc: citite separat, cele
  // doua ar aplica implicite diferite pentru acelasi camp lipsa, iar un catalog
  // care numara 24 pe pagina cu o paginare care crede 20 arata pagini goale.
  const setariMagazin = useMemo(() => citesteSetariMagazin(design), [design]);
  /*
   * Radacina catalogului, vazuta DE PE PAGINA ASTA.
   *
   * Fiecare suprafata cu grila trimite catre ea insasi: pastilele de categorii
   * de pe pagina principala filtreaza grila de acolo, cele de pe pagina de
   * catalog o filtreaza pe a lor. Doar cand grila a plecat de acasa pleaca si
   * linkurile ei. Paginile fara catalog — produs, pagini proprii — primesc
   * raspunsul din `buildChromeData`, care arata catre pagina de catalog cand
   * exista, fiindca acolo e experienta completa.
   */
  const categoriiRootPagina = shopOnPage(design) ? shopHref(basePath) : radacinaMagazin(basePath);
  // Paginarea si linkurile ei raman pe pagina curenta; `catalogRoot` ramane
  // catalogul intreg, fiindca de el atarna „Toate produsele" din footer si
  // cautarea din header — acelea n-au ce cauta inchise intr-o categorie.
  const radacinaPaginare = caleCategorie ?? "";
  const catalogRootPagina = surface === "shop" || catalogMutat
    ? shopHref(basePath)
    : radacinaMagazin(basePath);
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
  /*
   * Cine filtreaza: browserul sau baza. Citit sus, fiindca de el atarna si starea
   * cautarii si paginarea, nu doar randarea listei.
   */
  const peServer = palier === "server";
  const [search, setSearch] = useState(initialSearch);
  /*
   * Ce cautare a CERUT adresa, fata de ce se tasteaza acum.
   *
   * Pe palierul client cele doua sunt acelasi lucru: fiecare tasta filtreaza
   * lista pe loc, deci adresa poate sa urmeze imediat. Pe palierul server nu pot
   * fi acelasi lucru — o cautare aplicata inseamna un dus-intors la server, si
   * n-o face nimeni la fiecare litera. Deci `search` e ce se vede in caseta, iar
   * asta e ce s-a cerut; se apropie una de alta la Enter (`trimiteCautarea`).
   *
   * Conteaza si pentru linkurile de paginare: ele poarta `interogareFiltre`, iar
   * cu textul tastat un link catre pagina 2 ar fi purtat o cautare pe care nimeni
   * n-a trimis-o.
   */
  const [cautareAplicata, setCautareAplicata] = useState(initialSearch);
  /**
   * Cautarea care e in vigoare ACUM: pe client, ce se tasteaza (filtrarea e
   * instantanee); pe server, ce s-a cerut. Tot ce depinde de „ce cauta omul" —
   * adresa, linkurile de paginare, resetarea la pagina 1 — citeste asta, ca sa
   * existe o singura definitie si nu doua care se despart la prima schimbare.
   */
  const cautareInAdresa = peServer ? cautareAplicata : search;
  const [categoryFilter, setCategoryFilter] = useState(initialCategory);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  // Variable product whose option picker is open (grid quick-add).
  const [quickAddProduct, setQuickAddProduct] = useState<Product | null>(null);
  // Page is seeded from the URL (?page=N, read server-side as initialPage) so
  // returning from a product page (browser back) lands on the same page instead
  // of resetting to 1. goToPage keeps the URL in sync without a navigation.
  /*
   * ⚠ DOUA LUCRURI DIFERITE: pagina CERUTA si pagina AFISATA.
   *
   * Erau una singura, si de aici a iesit defectul raportat: „Inainte nu schimba
   * pagina, doar numerele merg". Masurat in productie pe bricosmart, pe palierul
   * server: adresa ajungea `?page=2`, produsele erau chiar ale paginii 2, dar
   * starea din browser ramanea 1 — deci `Inainte` calcula `1 + 1` si cerea IAR
   * pagina 2, iar `Inapoi` statea dezactivat pe pagina 2. Numerele „mergeau"
   * fiindca sunt absolute: nu se socotesc din starea stricata.
   *
   * Pe palierul server pagina afisata NU e o alegere a browserului, e un fapt:
   * serverul a trimis exact fereastra aceea. Tinuta a doua oara in stare, copia
   * poate ramane in urma — si a ramas. Deci acolo se CITESTE din props, iar
   * starea pastreaza doar ce a CERUT omul, ca sa stie efectul de navigare unde
   * sa mearga.
   *
   * Pe palierul client lista e in memorie, felierea o face chiar starea asta,
   * deci cele doua coincid si nu se schimba nimic.
   */
  const [paginaCeruta, setPaginaCeruta] = useState(initialPage);
  const currentPage = peServer ? initialPage : paginaCeruta;
  const setCurrentPage = setPaginaCeruta;
  const goToPage = useCallback((n: number) => {
    setPaginaCeruta(n);
    if (typeof window === "undefined") return;
    /*
     * Pe palierul server adresa o scrie efectul de navigare, nu functia asta.
     *
     * Acolo o schimbare de pagina e o CERERE, nu o feliere in memorie, iar un
     * `replaceState` de aici ar fi lasat bara de adrese inaintea continutului
     * pentru cateva sute de milisecunde — exact starea in care paginarea „arata
     * ca merge" si nu merge, adica defectul pe care faza asta il repara.
     */
    if (peServer) return;
    const sp = new URLSearchParams(window.location.search);
    if (n <= 1) sp.delete("page"); else sp.set("page", String(n));
    const qs = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, [peServer]);
  // Remember the active page for this tab so the "Magazin" link on a product page
  // can return here (browser back already works via the URL).
  useEffect(() => {
    try { sessionStorage.setItem(`store_page_${business.slug}`, String(currentPage)); } catch {}
  }, [currentPage, business.slug]);

  /*
   * Disponibilitatea unui pachet iese din componentele lui, prin ACEEASI regula pe
   * care o foloseste verificarea de la comanda.
   *
   * Reimplementarea de aici trata componentele necunoscute drept disponibile —
   * dar payload-ul contine TOT catalogul activ al magazinului, deci un id care nu
   * se regaseste inseamna sters sau dezactivat, adica exact invers. Asa a stat
   * „Pachet Femei" o saptamana pe raft, la 358,40 lei, cu toate cele trei
   * componente sterse.
   */
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  /*
   * Verdictul vine de la SERVER, gata luat.
   *
   * Se deriva aici, din harta intregului catalog, si asta mergea doar fiindca
   * payload-ul continea TOT catalogul activ: un id de componenta care nu se
   * regasea insemna „sters". Regula ramane scrisa in
   * lib/storefront/stoc-catalog.ts si oglindita in SQL (`catalog_fara_stoc`), cu
   * test de paritate intre ele — dar raspunsul se calculeaza o data, la scriere,
   * nu la fiecare afisare de pagina in browserul fiecarui vizitator.
   *
   * Asta e si conditia ca lista sa poata deveni PARTIALA: cu o singura pagina de
   * produse in memorie, derivarea de dinainte ar fi marcat fiecare pachet ca
   * indisponibil, fiindca nu si-ar mai fi gasit componentele.
   */
  const isProductOutOfStock = useCallback((p: Product): boolean => p.fara_stoc, []);

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
  // Cheile care sunt filtre ale catalogului. Restul parametrilor din adresa
  // sunt straini si trebuie pastrati la rescriere.
  const jetoaneChei = useMemo(() => new Set(fatete.map((f) => f.cheie)), [fatete]);

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
  // Cate bannere are hero-ul, din aceeasi sursa ca randarea lui.
  const bannereHero = resolveHeroBanners(pageContent as Record<string, unknown>, business.cover_url).banners.length;
  // Cu „Acasa" in fata, ca pe toate celelalte pagini. Vezi `meniuCuAcasa`.
  const menu = meniuCuAcasa(pageContent.menu ?? [], pageContent.menu_fara_acasa);
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
  /*
   * Ordinea: ce cere adresa, apoi ce a ales comerciantul pentru pagina de
   * catalog, apoi implicitul magazinului.
   *
   * Setarea de pagina CADE pe cea globala cand e goala, nu o dubleaza: doua
   * comutatoare pentru acelasi lucru inseamna, mai devreme sau mai tarziu, un
   * comerciant care stinge unul si nu intelege de ce lucrul ramane aprins.
   */
  const [sort, setSort] = useState<string>(
    initialSort || (surface === "shop" ? setariMagazin.sortareImplicita : "") || defaultSort,
  );
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
  /*
   * Categoriile stinse din panou, si numele pe care le scot din magazin.
   *
   * Perechea din baza e `public.categorii_ascunse(p_business)`, care taie acelasi
   * lucru pentru palierul server si pentru cautare. Aici se calculeaza din lista
   * INTREAGA de categorii, nu din cea filtrata: subarborele unei categorii stinse
   * nu se mai poate deduce dupa ce a fost scos.
   */
  const numeCategoriiStinse = useMemo(() => numeCategoriiAscunse(categories ?? []), [categories]);
  const visibleProducts = useMemo(() => {
    // Pe palierul server comutatoarele de vizibilitate au fost deja aplicate in
    // interogare; reaplicate aici n-ar strica nimic, dar ar sugera ca lista e
    // intreaga, ceea ce nu mai e adevarat.
    if (peServer) return products;
    if (!hideNoImage && !hideNoStock && numeCategoriiStinse.size === 0) return products;
    return products.filter((p) => {
      // Produsele dintr-o categorie stinsa ies din TOATE suprafetele vizitatorului
      // (grila, fatete, cautare, sectiuni), exact ca produsele fara imagine cand
      // comutatorul acela e pornit. Pagina lor de produs ramane accesibila prin
      // link direct — pentru „nu se mai vinde deloc" exista `is_active` pe produs.
      if (p.category && numeCategoriiStinse.has(p.category)) return false;
      if (hideNoImage) {
        const imgs = Array.isArray(p.images) ? (p.images as unknown[]).filter(Boolean) : [];
        if (imgs.length === 0) return false;
      }
      if (hideNoStock && isProductOutOfStock(p)) return false;
      return true;
    });
  }, [products, hideNoImage, hideNoStock, isProductOutOfStock, peServer, numeCategoriiStinse]);

  // Category hierarchy — built from the categories table (parent_id) + product
  // assignments. Only categories whose subtree contains products are shown,
  // afara de cand comerciantul cere altfel din editor (`show_empty_categories`).
  const arataCategoriiGoale = pageContent.show_empty_categories === true;
  const catTree = useMemo(() => {
    type Item = { key: string; id: string | null; name: string; image: string | null; hasChildren: boolean };
    // Subarborii stinsi ies din navigare cu totul.
    const list = categoriiVizibile(categories ?? []);
    // Din rezumat cand exista: pe palierul server, `visibleProducts` e o singura
    // pagina, iar dedus din ea arborele ar pierde toate categoriile care n-au
    // produse pe pagina curenta. Rezumatul se recalculeaza pe coada dupa o
    // stingere, deci pana atunci poate contine inca numele stinse — de aia se
    // trec si ele prin acelasi filtru.
    const productCatNames = new Set<string>(
      (numeCategoriiCuProduse ?? []).filter((n) => !numeCategoriiStinse.has(n)),
    );
    if (!numeCategoriiCuProduse) {
      visibleProducts.forEach(p => { if (p.category) productCatNames.add(p.category); });
    }

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
    /*
     * Ce intra in navigare.
     *
     * Implicit doar categoriile care chiar duc undeva: una goala e un drum
     * infundat printre altele care duc la produse. Cu `show_empty_categories`
     * pornit din editor, comerciantul cere explicit ca magazinul sa-i arate
     * raioanele asa cum le-a asezat el, goale sau nu — util cand marfa vine in
     * valuri sau cand categoriile se fac inaintea produselor.
     */
    const trece = (c: StoreCategoryNode): boolean => arataCategoriiGoale || hasProducts(c);
    const toItem = (c: StoreCategoryNode): Item => ({
      key: c.id, id: c.id, name: c.name, image: c.image_url,
      hasChildren: (childrenOf.get(c.id) ?? []).some(trece),
    });

    const subtreeByName: Record<string, string[]> = {};
    for (const c of list) subtreeByName[c.name] = subtreeNames(c);

    const childItemsById: Record<string, Item[]> = {};
    for (const c of list) {
      const kids = (childrenOf.get(c.id) ?? []).filter(trece).map(toItem);
      if (kids.length) childItemsById[c.id] = kids;
    }

    /*
     * NUMELE PURTATE DOAR DE PRODUSE NU MAI APAR IN NAVIGARE.
     *
     * Apareau, si nu ca o scapare: importurile lasa des categorii care nu ajung
     * in tabel, iar acelea au pagini adevarate in magazin. Dar in banda ieseau ca
     * niste cercuri gri cu o litera — fara imagine (n-au rand unde sa o tina),
     * fara loc in ordine, si fara nimic care sa le poata atinge din panou. Pe
     * Vetdepo asa au ajuns sapte nume maghiare langa cele douasprezece raioane
     * ale magazinului.
     *
     * Cauza lor s-a inchis la radacina: stergerea si redenumirea unei categorii
     * duc acum produsele cu ele (`category.actions.ts`). Ce ramane orfan e o
     * ramasita, si o ramasita n-are ce cauta in meniul magazinului. Produsele ei
     * raman in „Toate", in cautare si pe pagina lor.
     */
    const topCats = list.filter(c => !c.parent_id && trece(c)).sort((a, b) => a.sort_order - b.sort_order);
    const topItems: Item[] = topCats.map(toItem);

    /*
     * Aceeasi lista, dar cu categoriile goale la locul lor.
     *
     * Navigarea de catalog le lasa deoparte: acolo o categorie fara produse e un
     * drum infundat printre altele care duc undeva. Bara de categorii din hero e
     * insa structura magazinului, aleasa anume de comerciant — iar un magazin la
     * inceput de drum isi face intai categoriile si abia apoi produsele. Ascunse
     * si acolo, designul pe care tocmai l-a ales i-ar fi aratat gol.
     */
    const toateRadacinile: Item[] = list
      .filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({
        key: c.id, id: c.id, name: c.name, image: c.image_url,
        hasChildren: (childrenOf.get(c.id) ?? []).length > 0,
      }));

    const hasAnyImage = topItems.some(i => i.image) || Object.values(childItemsById).some(arr => arr.some(i => i.image));
    return { topItems, toateRadacinile, childItemsById, subtreeByName, byId, hasAnyImage };
  }, [categories, visibleProducts, numeCategoriiCuProduse, numeCategoriiStinse, arataCategoriiGoale]);

  const [drillParentId, setDrillParentId] = useState<string | null>(initialDrillParentId);
  const drillParent = drillParentId ? catTree.byId.get(drillParentId) ?? null : null;
  const currentItems = drillParentId ? (catTree.childItemsById[drillParentId] ?? []) : catTree.topItems;
  const hasCategories = catTree.topItems.length > 0;
  const hasAnyCategoryImage = catTree.hasAnyImage;

  /*
   * Apasarea unei categorii DUCE la pagina de catalog, cand ea exista.
   *
   * De oriunde, nu doar cand grila a plecat de acasa: cine apasa pe o categorie
   * vrea sa vada tot ce e in ea si sa filtreze mai departe dupa pret sau
   * atribute, iar acelea sunt pe pagina de catalog. Grila de pe pagina
   * principala ramane pentru rasfoit, nu pentru cautat.
   *
   * Si pe pagina de catalog: de cand fiecare categorie are pagina ei, filtrarea
   * pe loc ar fi lasat adresa in urma continutului. Magazinele fara pagina de
   * catalog raman insa exact cum erau — acolo grila filtreaza pe loc, ca inainte.
   */
  const categoriileNavigheaza = shopOnPage(design);

  function selectCategoryItem(item: { id: string | null; name: string; hasChildren: boolean }) {
    if (categoriileNavigheaza) {
      window.location.href = hrefCategorie(categoriiRootPagina, item.name, true);
      return;
    }
    // Drill into a category that has subcategories; otherwise just filter by it.
    if (item.hasChildren && item.id) setDrillParentId(item.id);
    setCategoryFilter(item.name);
  }
  function resetCategory() {
    // Din pagina unei categorii, „Toate" inseamna catalogul intreg, deci o
    // navigare. Stersul filtrului pe loc ar fi aratat tot catalogul la o adresa
    // care se numeste dupa o categorie.
    if (caleCategorie) {
      window.location.href = categoriiRootPagina;
      return;
    }
    if (catalogMutat) {
      window.location.href = catalogRootPagina;
      return;
    }
    setCategoryFilter("toate");
    setDrillParentId(null);
  }
  function goBackCategory() {
    const backTo = drillParent?.parent_id ?? null;
    const numeParinte = backTo ? catTree.byId.get(backTo)?.name : null;
    // Pe pagina unei categorii, „Inapoi" urca la parintele CATEGORIEI, nu la
    // parintele listei afisate: dintr-o subcategorie, lista aratata e cea a
    // fratilor, iar parintele listei ar fi fost cu un nivel mai sus decat se
    // asteapta oricine.
    if (caleCategorie) {
      window.location.href = parinteCategorie
        ? hrefCategorie(categoriiRootPagina, parinteCategorie, true)
        : categoriiRootPagina;
      return;
    }
    setDrillParentId(backTo);
    setCategoryFilter(numeParinte ?? "toate");
  }

  // Featured products
  // Pe palierul server vin gata alese din `catalog_randuri`: derivate din
  // `visibleProducts`, ar fi cuprins doar produsele de pe pagina curenta.
  const featuredProducts = useMemo(
    () => (peServer ? (featuredServer ?? []) : visibleProducts.filter(p => p.is_featured)),
    [visibleProducts, peServer, featuredServer],
  );

  // Custom product sections — curated rows shown above the main catalog. Resolved
  // from the already-loaded product list (no extra queries); empty ones are dropped.
  const productSections = useMemo(() => {
    return parseProductSections(pageContent.product_sections)
      .filter(s => s.enabled)
      // Pe palierul server randurile sunt deja rezolvate, dupa ACELEASI reguli,
      // in `catalog_randuri`. Aruncarea celor goale ramane aici, ca sa fie un
      // singur loc care decide ce se afiseaza.
      .map(section => ({
        section,
        items: peServer
          ? (sectiuniServer?.[section.id] ?? [])
          : resolveSectionProducts(section, visibleProducts, catTree.subtreeByName),
      }))
      .filter(x => x.items.length > 0);
  }, [pageContent.product_sections, visibleProducts, catTree.subtreeByName, peServer, sectiuniServer]);

  function viewAllCategory(category: string) {
    // Ancora `#produse` traieste pe grila. Mutata, „Vezi toate" ar fi derulat
    // catre `null`, adica n-ar fi facut nimic si n-ar fi dat nicio eroare.
    if (categoriileNavigheaza) {
      window.location.href = hrefCategorie(categoriiRootPagina, category, true);
      return;
    }
    setCategoryFilter(category);
    setDrillParentId(null);
    if (typeof document !== "undefined") {
      document.getElementById("produse")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /*
   * Filter facets: variant options + price bounds across the products.
   *
   * PE PALIERUL SERVER capetele de pret vin din REZUMAT, nu din lista.
   *
   * Derivate din `visibleProducts`, ele descriau doar pagina curenta: pe
   * bricosmart casetele de pret propuneau „14" si „255" pentru un catalog care
   * merge de la 1,11 la 1.506,30. Nu da nicio eroare — doar sugereaza un interval
   * care ascunde nouazeci la suta din marfa, si tocmai in filtrul de pret.
   *
   * Lista de OPTIUNI de varianta nu se poate salva la fel: n-are echivalent in
   * rezumat si n-are nici filtru in RPC, deci pastilele ei ar fi comutatoare care
   * nu fac nimic. Pe palierul server ies din panou (mai jos, in
   * `CatalogFilterFields`); pe pagina de catalog rolul lor il joaca deja fatetele,
   * care vin din rezumat si CHIAR filtreaza.
   */
  const facets = useMemo(() => {
    const opts = new Map<string, Set<string>>();
    let min = Infinity;
    let max = 0;
    for (const p of visibleProducts) {
      // Capetele intervalului se iau din pretul VANDABIL, ca sa nu propuna un
      // minim pe care niciun produs nu-l are: PANTALONI P URBAN are baza 175 si
      // toate cele 90 de marimi la 203.
      const price = p.price_range.min;
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
    // Capetele din rezumat descriu TOT catalogul; cele din lista, doar pagina.
    // `Math.floor`/`Math.ceil` rămân, ca sugestia sa fie un numar rotund la fel ca
    // pe palierul client.
    if (peServer && intervalServer) {
      return { options, priceMin: Math.floor(intervalServer.min), priceMax: Math.ceil(intervalServer.max) };
    }
    return { options, priceMin: min === Infinity ? 0 : Math.floor(min), priceMax: Math.ceil(max) };
  }, [visibleProducts, peServer, intervalServer]);

  // Search engine — diacritics-insensitive + typo-tolerant, ranked by
  // relevance (see @/lib/storefront/product-search). Deferred so results
  // recompute off the urgent keystroke render.
  const deferredSearch = useDeferredValue(search);
  /*
   * Pe palierul server nu se construieste NICIUN index local.
   *
   * `visibleProducts` e o singura pagina acolo, deci un index peste ea ar fi
   * cautat in 20 de produse si ar fi raspuns cu incredere „2 rezultate" pentru un
   * termen care are 300 in catalog. Cautarea s-a facut deja in SQL, peste tot
   * catalogul (`catalog_cauta` + acelasi motor, rulat in Node).
   *
   * Campurile indexate vin din `documentDeCautare`, ca sa fie ACELEASI si aici, si
   * in panoul din header, si pe server. Erau scrise de doua ori si cele doua nu
   * spuneau acelasi lucru — vezi fisierul.
   */
  const searchIdx = useMemo(
    () => (peServer ? null : buildProductSearchIndex(visibleProducts.map(documentDeCautare))),
    [visibleProducts, peServer],
  );
  // null = empty query (no search filtering); otherwise product id → relevance.
  const searchMatches = useMemo(
    () => (searchIdx ? queryProductSearchIndex(searchIdx, deferredSearch) : null),
    [searchIdx, deferredSearch],
  );
  /*
   * „Se cauta acum?" — din adresa pe palierul server, din motorul local pe client.
   *
   * De asta atarna doua lucruri vizibile: optiunea „Relevanta" din selectorul de
   * sortare, si sortarea implicita cat timp exista o cautare. Citita din
   * `searchMatches`, pe palierul server ar fi fost mereu „nu se cauta", deci
   * „Relevanta" ar fi lipsit exact de pe pagina care CHIAR e sortata dupa
   * relevanta.
   */
  const seCautaAcum = peServer ? cautareInAdresa.trim().length > 0 : searchMatches !== null;
  const effectiveSort = seCautaAcum && !sortTouched ? "relevance" : sort;

  // Filtered products
  const filteredProducts = useMemo(() => {
    // Pe palierul server lista E deja rezultatul filtrelor, in ordinea ceruta.
    // Refiltrata aici ar fi cel mult o no-op costisitoare, dar RESORTATA ar fi o
    // greseala: sortarea s-a facut peste TOT catalogul, iar o resortare peste 24
    // de randuri ar reordona pagina in interiorul ei.
    if (peServer) return products;
    const pMin = priceMin.trim() ? parseFloat(priceMin) : null;
    const pMax = priceMax.trim() ? parseFloat(priceMax) : null;
    const activeOpts = Object.entries(selectedOptions).filter(([, v]) => v.length > 0);
    const list = visibleProducts.filter(p => {
      const matchesSearch = !searchMatches || searchMatches.has(p.id);
      const matchesCategory = categoryFilter === "toate"
        || (catTree.subtreeByName[categoryFilter] ?? [categoryFilter]).includes(p.category ?? "");
      // Filtrul si insigna de reducere judeca pretul AFISAT. Pe pretul de baza,
      // „sub 200 lei" cuprindea un produs al carui card scrie 203.
      const price = p.price_range.min;
      const matchesPrice = (pMin == null || price >= pMin) && (pMax == null || price <= pMax);
      const matchesSale = !onSaleOnly || (p.compare_at_price != null && Number(p.compare_at_price) > price);
      // Aceeasi regula ca insigna „Stoc epuizat" de pe card, adica si pentru
      // pachete. Formularea de dinainte (`!p.track_inventory || stock > 0`) nu
      // stia de ele: un pachet se scrie cu `track_inventory: false` (bundles.ts),
      // deci PRIMA ramura era adevarata pentru FIECARE pachet si toate treceau
      // neconditionat filtrul — inclusiv „Pachet Femei", cu toate cele trei
      // componente sterse. Exact defectul pe care docblock-ul din bundles.ts a
      // fost scris ca sa-l incheie, supravietuit intr-a patra formulare.
      const matchesStock = !inStockOnly || !isProductOutOfStock(p);
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
    // Sortarile stau in lib/storefront/catalog/sortare.ts: toate dau o ordine
    // TOTALA (departajare finala pe id), fiindca altfel felierea pe server ar
    // putea aseza altfel randurile egale la fiecare pagina. Motivul intreg e
    // scris acolo. "relevance" exista doar cat timp se cauta (vezi effectiveSort).
    list.sort(comparatorSortare(effectiveSort as CheieSortare, searchMatches));
    return list;
  }, [visibleProducts, searchMatches, categoryFilter, effectiveSort, priceMin, priceMax, selectedOptions, onSaleOnly, inStockOnly, selectieIndici, isProductOutOfStock, peServer, products]);

  /*
   * Cate produse intra pe o pagina, si cum se ajunge la urmatoarele.
   *
   * Pagina principala ramane pe douazeci, cat avea inainte sa existe reglajul:
   * un magazin nu trebuie sa vada alta densitate doar fiindca a aparut o setare
   * pe alta pagina. Pagina de catalog citeste ce a ales comerciantul.
   */
  const PRODUCTS_PER_PAGE = surface === "shop" ? setariMagazin.perPage : 20;
  // Pe palierul client lista E intreaga, deci lungimea ei E totalul. Cand
  // felierea trece pe server, aici intra numarul venit din RPC — de aceea
  // consumatorii citesc deja `totalFiltrate` din context, nu lungimi.
  const totalFiltrateEfectiv = peServer ? (totalFiltrateServer ?? 0) : filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltrateEfectiv / PRODUCTS_PER_PAGE));
  /*
   * La „incarca mai multe" si la derulare, paginile se ADUNA in loc sa se
   * inlocuiasca: `currentPage` inseamna acolo „cate pagini s-au incarcat".
   *
   * Numarul ramane scris in adresa la toate trei modurile, deci un link
   * partajat reface exact cat vazuse expeditorul, iar linkurile de paginare
   * raman crawlabile — doar ca la modurile care aduna sunt ascunse vizual.
   */
  /*
   * „Incarca mai multe" si derularea infinita NU exista pe palierul server.
   *
   * Modurile alea ADUNA paginile: `currentPage` inseamna acolo „cate pagini s-au
   * incarcat", si lista din memorie creste. Pe palierul server serverul trimite
   * exact O pagina, deci a doua apasare ar fi INLOCUIT primele douazeci de produse
   * cu urmatoarele douazeci sub un buton care scrie „Incarca mai multe" — adica
   * produse care dispar la o apasare care promite ca adauga.
   *
   * Deci acolo paginarea e numerotata, indiferent de ce a ales comerciantul. Azi
   * niciun magazin de pe palierul server nu foloseste alt mod (verificat: ambele
   * au `modPaginare: "pagini"`), deci nu se schimba nimic vizibil; conditia e
   * pentru cel care apasa maine butonul din editor.
   */
  const aduna = surface === "shop" && !peServer && setariMagazin.modPaginare !== "pagini";
  // A doua feliere ar goli pagina 2: serverul a trimis DEJA fereastra ceruta, iar
  // `slice((2-1)*24, 2*24)` peste 24 de randuri da lista goala.
  const paginatedProducts = peServer ? filteredProducts : filteredProducts.slice(
    aduna ? 0 : (currentPage - 1) * PRODUCTS_PER_PAGE,
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
    // Pagina principala fara grila nu mai ARATA lista: un `view_item_list` de
    // acolo ar fi raportat douazeci de produse pe care nu le vede nimeni, si ar
    // fi stricat rata de clic din rapoartele comerciantului.
    if (catalogMutat) return;
    if (paginatedProducts.length === 0) return;
    const semnatura = `${currentPage}:${paginatedProducts.map((p) => p.id).join(",")}`;
    if (listaTrimisa.current === semnatura) return;
    listaTrimisa.current = semnatura;
    gtagEvent("view_item_list", {
      item_list_id: surface === "shop" ? "pagina_magazin" : "catalog",
      item_list_name: surface === "shop" ? "Pagina Magazin" : "Produse",
      items: paginatedProducts.map((p, i) => ({ item_id: p.id, item_name: p.name, price: p.price_range.min, index: (currentPage - 1) * PRODUCTS_PER_PAGE + i, quantity: 1 })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filteredProducts]);

  // Reset to page 1 when filters change — but not on the initial mount, which
  // would clobber a page restored from the URL.
  //
  // `cautareAplicata`, nu `search`: pe palierul server tastarea nu e inca o
  // filtrare, deci nu are ce reseta. Legat de `search`, fiecare litera ar fi mutat
  // pagina la 1 — adica o navigare la server pe care n-a cerut-o nimeni. Pe
  // palierul client cele doua sunt aceeasi valoare, deci nu se schimba nimic.
  const filtersInitRef = useRef(true);
  useEffect(() => {
    if (filtersInitRef.current) { filtersInitRef.current = false; return; }
    goToPage(1);
  }, [cautareInAdresa, categoryFilter, effectiveSort, priceMin, priceMax, selectedOptions, onSaleOnly, inStockOnly, selectieFatete, goToPage]);

  /*
   * Filtrele traiesc si in adresa, nu doar in stare.
   *
   * Pe pagina principala grila e o parte a unei pagini de prezentare si nimeni
   * nu trimite mai departe „pagina 3 filtrata"; pe o pagina care se numeste
   * Magazin si isi face reclama cu filtrare pe atribute, un link care nu poarta
   * filtrele e un bug raportat. Se scrie cu `replaceState`, ca butonul Inapoi sa
   * ramana al paginilor, nu al fiecarei bife.
   */
  /*
   * Parametrii care NU sunt ai catalogului, citititi o singura data la montare.
   *
   * `utm_*`, `gclid`, `fbclid` si `preview=1` trebuie sa supravietuiasca
   * rescrierii adresei. Fara ei, prima bifa pe un filtru stergea atribuirea
   * campaniei din bara de adrese, in cursa cu pixelii care tocmai o citeau — iar
   * proprietarul care isi vedea ciorna pierdea preview-ul la reincarcare.
   */
  const parametriStraini = useRef<[string, string][]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rezervati = new Set(["cat", "q", "page", "sort", "pmin", "pmax", "sale", "stoc", "cos", "recover", "code"]);
    parametriStraini.current = [...new URLSearchParams(window.location.search).entries()]
      .filter(([k]) => !rezervati.has(k) && !jetoaneChei.has(k));
  }, [jetoaneChei]);

  /*
   * Adresa paginii de catalog, compusa din starea curenta.
   *
   * Se calculeaza aici, o singura data, si o folosesc AMANDOI consumatorii:
   * efectul care rescrie bara de adrese si linkurile de paginare, care se
   * randeaza si pe server. Scrisa in doua locuri, prima nepotrivire ar fi fost o
   * pagina 2 care pierde filtrele.
   *
   * Interogarea, ca FUNCTIE de textul cautat — nu ca valoare.
   *
   * Doi apelanti au nevoie de ea cu doua texte diferite: adresa si linkurile de
   * paginare o vor cu cautarea CERUTA (`?q=`), iar trimiterea unei cautari noi o
   * vrea cu cea TASTATA. Compusa in doua locuri, prima nepotrivire ar fi fost o
   * pagina 2 care pierde filtrele — de aia e o singura compunere, parametrizata.
   */
  const compuneInterogare = useCallback(
    (cautare: string) => scrieFiltre({
      // Pe pagina unei categorii, categoria e chiar calea: scrisa si in
      // interogare, ar fi dat `/magazin/bocanci?cat=Bocanci` la fiecare filtrare.
      categorie: caleCategorie ? "" : categoryFilter,
      cautare,
      sortare: sortTouched ? sort : "",
      reduceri: onSaleOnly,
      stoc: inStockOnly,
      pretMin: priceMin,
      pretMax: priceMax,
      fatete: selectieFatete,
    }),
    [caleCategorie, categoryFilter, sort, sortTouched, onSaleOnly, inStockOnly, priceMin, priceMax, selectieFatete],
  );
  const interogareFiltre = useMemo(
    () => compuneInterogare(cautareInAdresa),
    [compuneInterogare, cautareInAdresa],
  );

  /**
   * Trimite cautarea tastata. Pe palierul client nu are ce trimite — filtrarea
   * s-a intamplat deja la fiecare tasta.
   *
   * NU navigheaza singura: doar face cautarea „aplicata", si de acolo o preia
   * efectul de navigare de mai jos. Asa exista UN SINGUR loc care schimba adresa,
   * in loc de doua care trebuie tinute in sincron — iar o a doua navigare
   * declansata de aici ar fi intrat in cursa cu prima si ar fi putut ateriza pe
   * cautarea veche.
   */
  const trimiteCautarea = useCallback(() => {
    if (!peServer) return;
    setCautareAplicata(search);
  }, [peServer, search]);

  /*
   * Adresa completa a unei stari de filtre. Parametrii straini se adauga AICI,
   * nu in `interogareFiltre`.
   *
   * Interogarea aceea alimenteaza si linkurile de paginare, care se randeaza pe
   * server: `utm_*`/`gclid`/`preview` adaugati acolo ar fi lipsit din HTML-ul
   * initial si ar fi aparut la hidratare, adica exact nepotrivirea pe care am
   * scos-o din paginare. In plus, o eticheta de campanie n-are ce cauta copiata
   * in linkul catre pagina 2.
   */
  const adresaPentru = useCallback((interogare: string, pagina: number) => {
    const straine = parametriStraini.current
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    const qs = [interogare, pagina > 1 ? `page=${pagina}` : "", straine].filter(Boolean).join("&");
    return `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  }, []);

  /*
   * PE PALIERUL SERVER, UN FILTRU SCHIMBAT TREBUIE SA CEARA PAGINA DIN NOU.
   *
   * Asta era jumatatea care lipsea din A3/A6, si lipsea tacut. Serverul randa
   * corect orice adresa, dar in browser NIMIC nu naviga: `goToPage` si efectul de
   * mai jos scriau doar `history.replaceState`, iar `filteredProducts` intoarce pe
   * palierul server chiar lista primita. Deci bara de adrese spunea `?page=2` sau
   * `?q=aspirator` si grila arata neschimbat primele 20 de produse. Verificat in
   * productie pe bricosmart: paginare, cautare, sortare, pret si fatete — toate
   * inerte. Nimic nu da eroare, deci nimeni nu raporteaza; se vede doar dupa ce
   * apesi si te uiti.
   *
   * `router.push`, nu `window.location.href`, si nu din eleganta: o reincarcare
   * intreaga PIERDE FOCUSUL din casetele de pret, deci scrisul unui numar din doua
   * cifre s-ar fi rupt la mijloc. In plus trimite ~207 kB in loc de ~45 kB de
   * payload RSC si sare derularea in capul paginii. `staleTimes.dynamic` e 30 s in
   * `next.config.ts`, deci o adresa nouă se cere mereu de la server, iar una
   * revizitata in 30 s vine instant din cache-ul de router — ceea ce e chiar ce
   * vrem la „bifez, ma razgandesc, debifez".
   */
  const router = useRouter();
  const [navigheaza, startNavigare] = useTransition();
  const ceruteDeServer = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    /*
     * Pe pagina principala filtrele stau in memorie, si acolo e in regula: grila
     * e o parte a unei pagini de prezentare. Pe palierul server insa NU POT sta in
     * memorie — lista vine gata filtrata de la server, deci singurul mod de a o
     * schimba e o cerere noua. De aia conditia e „shop SAU server", nu doar „shop".
     */
    if (surface !== "shop" && !peServer) return;

    /*
     * Se navigheaza catre pagina CERUTA, nu catre cea afisata.
     *
     * Pe palierul server cea afisata vine din props, deci e mereu egala cu ce a
     * randat serverul: folosita aici, tinta ar fi fost mereu adresa curenta si
     * efectul n-ar fi navigat NICIODATA. Cele doua se despart exact cat tine
     * dus-intorsul, si tocmai despartirea aia e navigarea.
     */
    const tinta = adresaPentru(interogareFiltre, paginaCeruta);

    /*
     * Prima trecere doar RETINE adresa cu care s-a randat pagina.
     *
     * Se face aici, sincron la montare, si NU in temporizator: o apasare in
     * prima jumatate de secunda ar fi anulat temporizatorul, iar rularea urmatoare
     * ar fi crezut ca tot e montarea — si prima schimbare de filtru s-ar fi
     * pierdut in liniste. Se retine adresa COMPUSA, nu `window.location.search`:
     * o adresa care vine cu parametrii in alta ordine ar fi aratat ca o schimbare
     * si ar fi declansat o navigare degeaba.
     */
    if (peServer && ceruteDeServer.current === null) {
      ceruteDeServer.current = tinta;
      return;
    }

    /*
     * Cu INTARZIERE, nu la fiecare tasta.
     *
     * Pe palierul client motivul era Safari: `replaceState` de doua ori per tasta,
     * iar Safari le limiteaza la o suta in treizeci de secunde si arunca
     * `SecurityError` dupa. Pe palierul server intarzierea are un al doilea rost,
     * mai scump: fiecare navigare e un dus-intors la server, deci cele trei tastari
     * ale unui „150" in caseta de pret trebuie sa dea O navigare, nu trei.
     */
    const id = window.setTimeout(() => {
      if (!peServer) {
        window.history.replaceState(null, "", tinta);
        return;
      }
      if (tinta === ceruteDeServer.current) return;
      ceruteDeServer.current = tinta;
      startNavigare(() => router.push(tinta, { scroll: false }));
    }, peServer ? 400 : 250);
    return () => window.clearTimeout(id);
  }, [surface, peServer, interogareFiltre, paginaCeruta, adresaPentru, router]);

  /*
   * Inapoi/Inainte aduc alte props; starea controalelor trebuie sa le urmeze.
   *
   * Navigarile PROPRII n-au nevoie de asta — acolo starea s-a schimbat prima si
   * serverul a raspuns exact ce cerea ea. Dar butonul Inapoi al browserului
   * reface arborele din cache-ul de router (documentat: back/forward nu respecta
   * `staleTimes`, ca sa nu sara derularea), deci vin props-urile paginii de
   * dinainte peste o stare care a rămas a paginii curente: caseta de pret ar fi
   * aratat 50 peste o grila nefiltrata.
   *
   * Se resincronizeaza DOAR cand semnatura props-urilor se schimba, si de aia
   * comparatia sta intr-un `ref` si nu intre props si stare: comparate intre ele,
   * o singura valoare care nu se normalizeaza identic pe cele doua parti ar fi
   * dat o bucla infinita de randari pe pagina de catalog.
   */
  const semnaturaProps = JSON.stringify([
    initialPage, initialSearch, initialCategory, initialOnSale, initialInStock,
    initialPriceMin, initialPriceMax, initialSort, initialSelectieFatete ?? {},
  ]);
  const propsAplicate = useRef<string | null>(null);
  useEffect(() => {
    if (!peServer) return;
    if (propsAplicate.current === null || propsAplicate.current === semnaturaProps) {
      propsAplicate.current = semnaturaProps;
      return;
    }
    propsAplicate.current = semnaturaProps;
    /*
     * Si marcajul „ce ne-a dat serverul" se sterge, altfel Inapoi se anuleaza
     * singur.
     *
     * Fara linia asta: Inapoi aduce props-urile paginii vechi, resincronizarea
     * pune starea pe ele, efectul de navigare recompune adresa veche, o compara cu
     * `ceruteDeServer` — care tine inca adresa spre care am navigat INAINTE — le
     * vede diferite, si navigheaza iar INAINTE. Adica butonul Inapoi nu mai
     * functioneaza deloc pe pagina de catalog.
     *
     * `null` in loc de adresa nouă: asa urmatoarea rulare a efectului intra pe
     * ramura de „montare", isi retine adresa curenta si NU navigheaza — deci nu
     * trebuie recompusa aici a doua oara aceeasi adresa.
     */
    ceruteDeServer.current = null;
    setCurrentPage(initialPage);
    setSearch(initialSearch);
    // Si cautarea APLICATA, nu doar textul din caseta: altfel `interogareFiltre` ar
    // fi rămas pe termenul de dinainte de Inapoi si ar fi cerut iar pagina aceea.
    setCautareAplicata(initialSearch);
    setCategoryFilter(initialCategory);
    setOnSaleOnly(initialOnSale);
    setInStockOnly(initialInStock);
    setPriceMin(initialPriceMin);
    setPriceMax(initialPriceMax);
    setSort(initialSort || (surface === "shop" ? setariMagazin.sortareImplicita : "") || defaultSort);
    setSortTouched(!!initialSort);
    setSelectieFatete(initialSelectieFatete ?? {});
    // `semnaturaProps` acopera toate valorile de mai sus; enumerate una cu una,
    // lista de dependinte ar fi fost o a doua definitie a aceleiasi semnaturi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peServer, semnaturaProps]);

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
    radacinaPaginare: radacinaPaginare || catalogRootPagina,
    categoriiPePagina: categoriileNavigheaza,
    parinteCategorie,
    // Categoriile duc MEREU la pagina de catalog cand ea exista, chiar daca
    // pagina asta are si ea o grila: acolo sunt filtrele pe atribute si pret,
    // adica exact ce cauta cineva care apasa pe o categorie.
    categoriiRoot: categoriiRootPagina,
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
    /*
     * Bara si decalajul header-ului se calculeaza din ACEEASI conditie.
     *
     * `AnnouncementMarquee` se ascunde pe pagina principala cand comerciantul a
     * stins „arata pe pagina magazinului"; pe pagina de catalog nu se ascunde,
     * fiindca `isHome` e fals acolo. Cu regula veche, header-ul se aseza pe
     * `top-0` ca si cum bara n-ar exista, dar bara se randa — si i se suprapunea.
     */
    hasAnnouncementBar:
      (surface !== "home" || showAnnouncementOnStore)
      && pageContent.announcement_bar?.enabled === true
      && standaloneAnnouncement(design)?.enabled === true,
    announcementOn: design.chrome.announcement?.enabled === true,
    hasHero,

    products,
    visibleProducts,
    filteredProducts,
    paginatedProducts,
    // Pe palierul client sunt chiar lungimile listelor. Cand felierea trece pe
    // server, `filteredProducts` are doar pagina curenta si numerele vin din
    // raspunsul RPC-ului — de aia sunt campuri, nu `.length` la locul folosirii.
    totalVizibile: peServer ? (totalVizibileServer ?? 0) : visibleProducts.length,
    totalFiltrate: totalFiltrateEfectiv,
    featuredProducts,
    productSections,
    isProductOutOfStock,

    search,
    setSearch,
    sort,
    setSort,
    setSortTouched,
    effectiveSort,
    hasSearchMatches: seCautaAcum,
    catalogPeServer: peServer,
    trimiteCautarea,
    catalogSeIncarca: navigheaza,
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
    interogareFiltre,
    setariMagazin,
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
    rootCategoryItemsToate: catTree.toateRadacinile,
    isDrilled: drillParentId !== null,
    drillParentName: drillParent?.name ?? null,
    hasCategories,
    /*
     * Bara de categorii din hero se randeaza doar pe ecran mare, doar cu cel
     * putin o categorie SI doar cu cel putin un banner — hero-ul acela e
     * jumatate categorii, jumatate banner, si fara banner nu se randeaza deloc.
     *
     * Conditia trebuie sa fie exact aceeasi ca in componenta: mai larga aici,
     * sectiunea de categorii de dedesubt s-ar da la o parte pentru un hero care
     * nu exista, si magazinul ar ramane fara nicio lista de categorii.
     */
    heroAreCategorii: sectiuniDeAcasa.some(
      (s) => s.kind === "hero" && s.enabled && s.variant === "categories",
    ) && catTree.toateRadacinile.length > 0 && bannereHero > 0,
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

      {/*
        Manerul de cos de pe marginea din dreapta, pentru ecrane mari.
        Perechea de calculator a barei de jos: acolo cosul nu se poate rata, aici
        iconita din bara de sus iese din ecran la prima derulare. Acelasi comutator
        din editor le porneste pe amandoua, ca sa nu fie doua reglaje pentru
        acelasi lucru.
      */}
      {showStickyCartBar && (
        <StickyCartTab
          color={color}
          onOpen={cosPePagina ? mergiLaCos : () => setCartOpen(true)}
          hidden={cartOpen || checkoutOpen}
        />
      )}

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
          price_range: quickAddProduct.price_range,
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
    <CartProvider slug={props.business.slug} businessId={props.business.id}>
      <StoreContent {...props} />
    </CartProvider>
  );
}
