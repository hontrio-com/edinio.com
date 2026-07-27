"use client";

import { useState, useCallback, useRef, useEffect, useMemo, useSyncExternalStore } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ChevronLeft, ChevronRight, ShieldCheck, Truck, RotateCcw,
  ShoppingBag, ShoppingCart, Check, ArrowLeft, Package, Plus, Calendar, Star,
} from "lucide-react";
import { formatPrice, formatPriceRange } from "@/lib/utils/format";
import { fbTrack, ttqTrack, gtagEvent } from "@/lib/marketing";
import { getProductPriceRange } from "@/lib/utils/product-price";
import {
  parseVariants, comboTitle, findCombo, isValueAvailable, comboUnitPrice, comboCompareAtPrice,
  VARIANT_TITLE_SEP,
} from "@/lib/storefront/variants";
import { OrderModal } from "@/components/ministore/OrderModal";
import type { QuantityTier } from "@/components/ministore/OrderModal";
import { ProductOffers } from "@/components/ministore/ProductOffers";
import type { ResolvedOffer, OfferProduct } from "@/lib/offers/offer.types";
import { distributeFbtSavings } from "@/lib/offers/offer.types";

import type {
  Business, Product, StoreSettings, PageContent, PageSections,
} from "./_shared/product-page.types";
import {
  abonareMiscareRedusa, citesteMiscareRedusa, hashSir,
  SocialProof, FAQItem, CTAButton,
} from "./_shared/pieces";
import { cosDupaComanda } from "@/lib/storefront/cart/consume";
import { trackAddToCart } from "@/lib/storefront/cart/track-add";
import { useCartOptional } from "@/components/storefront/cart/CartProvider";
import { useStoreChromeOptional } from "@/components/storefront/StorefrontProvider";

/* ─── Gallery ─────────────────────────────────────────────────────────────── */

/**
 * Latimea reala a coloanei de galerie pe desktop: (72rem container - 4rem gap) / 2.
 *
 * Acelasi `sizes` pe copia de telefon si pe cea de desktop, desi arata diferit:
 * amandoua marcheaza prima imagine cu `priority`, iar preincarcarea din <head> nu
 * stie de `display:none`. Cu `sizes` diferiti browserul alegea doi candidati si
 * descarca de doua ori aceeasi fotografie; identici, alege acelasi fisier o data.
 */
const GALLERY_SIZES = "(min-width: 1024px) 544px, 100vw";

function Gallery({ slides, activeSlide, goTo, mobile, color, imgAlt, hasDiscount, discountPct, onTouchStart, onTouchEnd }: {
  slides: string[];
  activeSlide: number;
  goTo: (idx: number) => void;
  mobile: boolean;
  color: string;
  imgAlt: (src: string, i: number) => string;
  hasDiscount: boolean;
  discountPct: number;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-muted/40 shadow-lg"
      style={{ aspectRatio: "1/1" }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {slides.length === 0 ? (
        <div className="w-full h-full flex items-center justify-center">
          <Package className="h-20 w-20 text-muted-foreground/40" />
        </div>
      ) : mobile ? (
        <div className="flex h-full transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${activeSlide * 100}%)` }}>
          {slides.map((src, i) => (
            <div key={i} className="relative w-full h-full flex-shrink-0">
              <Image src={src} alt={imgAlt(src, i)} fill sizes={GALLERY_SIZES}
                className="object-contain p-2" priority={i === 0} />
            </div>
          ))}
        </div>
      ) : (
        // Pe desktop diapozitivele stau suprapuse in acelasi cadru vizibil, deci
        // browserul le socoteste pe toate „in ecran" si le-ar descarca deodata
        // (`opacity: 0` nu opreste nici descarcarea, nici decodarea). Montam doar
        // diapozitivul activ si vecinii imediati: trecerea are nevoie de cel vechi
        // si de cel nou in acelasi timp, restul se aduc abia cand ajungi la ele.
        slides.map((src, i) => (
          <div key={i} className="absolute inset-0 transition-opacity duration-700 overflow-hidden"
            style={{ opacity: i === activeSlide ? 1 : 0 }}>
            {/* Doar prima fotografie e prioritara; restul se incarca lenes.
                Toate raman insa MONTATE: demontarea celor departate ar taia
                tranzitia de opacitate la salturile de mai mult de o pozitie
                (miniatura departata, sau sageata care se intoarce la prima) si
                ar lasa un patrat gol pana soseste imaginea. */}
            <Image src={src} alt={imgAlt(src, i)} fill sizes={GALLERY_SIZES}
              className="object-contain p-2" priority={i === 0} loading={i === 0 ? undefined : "lazy"} />
          </div>
        ))
      )}

      {slides.length > 1 && (
        <>
          <button type="button" aria-label="Imaginea anterioara" onClick={e => { e.stopPropagation(); goTo(activeSlide - 1); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-surface/80 backdrop-blur-sm flex items-center justify-center shadow-md z-10 hover:bg-surface transition-colors">
            <ChevronLeft size={16} className="text-foreground" />
          </button>
          <button type="button" aria-label="Imaginea urmatoare" onClick={e => { e.stopPropagation(); goTo(activeSlide + 1); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-surface/80 backdrop-blur-sm flex items-center justify-center shadow-md z-10 hover:bg-surface transition-colors">
            <ChevronRight size={16} className="text-foreground" />
          </button>
          {/* Dot indicators: mobile only (desktop uses the thumbnail strip) and only
              for small galleries — 33 dots would be an unusable cramped row. The
              "1 / N" counter above covers navigation for larger sets. */}
          {mobile && slides.length <= 8 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
              {slides.map((_, i) => (
                // Bulina inactiva pe un token de text, nu pe alb: fundalul galeriei
                // e aproape alb, deci albul 60% ieseau la circa 1:1 (WCAG 1.4.11
                // cere 3:1) si clientul nu vedea cate imagini mai sunt.
                <button key={i} type="button" aria-label={`Imaginea ${i + 1}`} onClick={() => goTo(i)}
                  className="rounded-full transition-all duration-300"
                  style={i === activeSlide
                    ? { width: 24, height: 8, backgroundColor: color }
                    : { width: 8, height: 8, backgroundColor: "var(--color-muted-foreground)" }} />
              ))}
            </div>
          )}
          <div className="absolute top-3 left-3 bg-black/30 backdrop-blur-sm text-white text-[10px] font-medium px-2.5 py-1 rounded-full z-10">
            {activeSlide + 1} / {slides.length}
          </div>
        </>
      )}

      {hasDiscount && (
        <div className="absolute top-3 right-3 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md z-10" style={{ backgroundColor: color }}>
          -{discountPct}%
        </div>
      )}
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */

export function ProductPageClassic({ business, product, storeSettings, basePath: basePathProp, hasCardPayment = false, bundleComponents = [], altMap = {}, isHome = false, productOffers = [], setari = {}, demo = false }: {
  business: Business;
  product: Product;
  storeSettings: StoreSettings | null;
  basePath?: string;
  hasCardPayment?: boolean;
  bundleComponents?: { id: string; name: string; slug: string | null; price: number; image_url: string | null; quantity: number; out_of_stock: boolean }[];
  altMap?: Record<string, string>;
  /** When this product page IS the store homepage (One Product Store mode):
   *  hides the "back to store" breadcrumb since there is no catalog behind it. */
  isHome?: boolean;
  /** Cross-sell offers resolved server-side for this product (rendered as "Merge bine cu"). */
  productOffers?: ResolvedOffer[];
  /** Reglajele variantei, din `design.product.page.settings`. Vezi registry. */
  setari?: Record<string, unknown>;
  /**
   * Miniatura din catalogul de design-uri: pagina se randeaza inerta.
   *
   * Fara pixeli (altfel fiecare card din galerie ar trimite un ViewContent in
   * Facebook, TikTok si Analytics ale comerciantului), fara sa atinga cosul lui
   * din localStorage (galeria ruleaza pe aceeasi origine cu magazinul), fara
   * animatii care se repeta la nesfarsit si fara bara lipita jos, care ar pluti
   * peste miniatura fara sa intre in inaltimea masurata. Se opreste dupa galerie
   * si zona de cumparare: pagina intreaga trece de 3000 px si, micsorata intr-un
   * card, ar deveni o banda ilizibila.
   */
  demo?: boolean;
}) {
  const basePath = basePathProp ?? `/${business.slug}`;
  const images = Array.isArray(product.images) ? product.images.map(String).filter(Boolean) : [];

  // Pixels / GA4: standard product-view event, once per product.
  const productId = product.id;
  const productName = product.name;
  const productPrice = Number(product.price) || 0;
  useEffect(() => {
    if (demo) return;
    gtagEvent("view_item", { currency: "RON", value: productPrice, items: [{ item_id: productId, item_name: productName, price: productPrice, quantity: 1 }] });
    fbTrack("ViewContent", { content_ids: [productId], content_name: productName, content_type: "product", value: productPrice, currency: "RON" });
    ttqTrack("ViewContent", { value: productPrice, currency: "RON", contents: [{ content_id: productId, content_type: "product", content_name: productName, price: productPrice, quantity: 1 }] });
  }, [demo, productId, productName, productPrice]);
  // SEO alt text from the Media Library, falling back to the product name.
  const imgAlt = (src: string, i: number) => altMap[src] || `${product.name} ${i + 1}`;

  const color = business.primary_color ?? "#1AB554";

  const shippingCost = Number(storeSettings?.default_shipping_cost ?? 20);
  const freeShippingThreshold = storeSettings?.free_shipping_threshold
    ? Number(storeSettings.free_shipping_threshold) : null;
  const minOrderAmount = storeSettings?.min_order_amount
    ? Number(storeSettings.min_order_amount) : null;
  // VAT note shown under the price (only for VAT-registered stores).
  const vatEnabled = storeSettings?.vat_enabled ?? false;
  const pricesIncludeVat = storeSettings?.prices_include_vat ?? true;

  const pageContent = (storeSettings?.page_content as PageContent) ?? {};
  const pageSections = (product.page_sections as PageSections) ?? {};

  // Short description = blurb under the title; long description = "Descriere" section.
  const shortDesc = (pageSections.short_description ?? "").trim();
  const hasShortDesc = shortDesc !== "" && shortDesc !== "<p></p>";
  const hasLongDesc = !!product.description && product.description !== "<p></p>";
  const topBlurb = hasShortDesc ? shortDesc : (hasLongDesc ? product.description : null);

  const trustBadgesEnabled = pageContent.trust_badges_enabled !== false;
  const benefitsSection = pageContent.benefits_section;
  const howItWorksSection = pageContent.how_it_works_section;
  const faqSection = pageContent.faq_section;
  // WCAG 2.2.2: cinci din cele sase efecte de buton se repeta la nesfarsit si nu
  // au buton de oprire, deci se sting cand vizitatorul cere miscare redusa —
  // exact ce fac deja clasele .fx-* pentru paginile custom (globals.css).
  const reduceMotion = useSyncExternalStore(abonareMiscareRedusa, citesteMiscareRedusa, () => false);
  // In miniatura, cinci din cele sase efecte de buton sunt animatii care se
  // repeta la nesfarsit; zece iframe-uri deodata ar arde procesorul degeaba.
  const buttonEffect = demo || reduceMotion ? "none" : (pageContent.button_effect ?? "none");
  const deliveryEstimate = pageContent.delivery_estimate;
  const showQualityBadge = pageContent.show_quality_badge === true; // "Calitate verificata" badge — off unless enabled (ANPC/Omnibus: merchant opt-in)
  // Numar stabil, derivat din id-ul produsului: cu Math.random() serverul si
  // browserul scriau numere diferite in acelasi HTML (nepotrivire de hidratare).
  // Fix in miniatura, ca fiecare card din galerie sa arate acelasi numar.
  const viewerCount = demo ? 23 : 18 + (hashSir(product.id) % 10);
  const showSocialProof = pageContent.show_social_proof === true; // fake live-viewers counter — off unless enabled

  // Variante — sursa unica din lib/storefront/variants.ts. Un produs cu
  // `variants.enabled` dar fara nicio optiune NU e variabil: altfel butonul de
  // comanda ramanea stins cu „Selecteaza optiunile" si nimic de selectat, desi
  // acelasi produs se adauga normal in cos din cardul de catalog.
  const variantsData = useMemo(() => parseVariants(product.page_sections), [product.page_sections]);
  // In miniatura prima combinatie e deja aleasa. Altfel butonul principal ar
  // aparea stins, cu „Selecteaza optiunile", in fiecare design de pagina de
  // produs — adica tocmai elementul dupa care se alege designul ar lipsi.
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() =>
    demo && variantsData
      ? Object.fromEntries(variantsData.options.map((o) => [o.name, o.values[0] ?? ""]))
      : {},
  );

  const selectedComboTitle = useMemo(
    () => (variantsData ? comboTitle(variantsData.options, selectedOptions) : null),
    [variantsData, selectedOptions],
  );

  const selectedCombo = useMemo(
    () => (variantsData ? findCombo(variantsData, selectedComboTitle) : null),
    [variantsData, selectedComboTitle],
  );

  // Variant image: the exact combo image when everything is selected, otherwise the
  // image of the first enabled combination that matches the partial selection (e.g.
  // only the colour chosen, size not yet). Lets the gallery preview the colour before
  // the size is picked. Only the image reacts to a partial choice — price/SKU/stock
  // still need the full combination.
  const variantImage = useMemo(() => {
    if (!variantsData) return null;
    let candidate: string | null = null;
    if (selectedCombo?.image) {
      candidate = selectedCombo.image;
    } else {
      const chosen = variantsData.options
        .map(o => selectedOptions[o.name])
        .filter(Boolean) as string[];
      if (chosen.length === 0) return null;
      // Only preview when the partial selection pins down ONE image. Choosing the
      // colour (which carries the image) is unambiguous; choosing only the size still
      // spans several colour images, so we keep the base gallery in that case.
      const imgs = new Set<string>();
      for (const c of variantsData.combinations) {
        if (!c.enabled || !c.image) continue;
        const parts = c.title.split(VARIANT_TITLE_SEP);
        if (chosen.every(s => parts.includes(s))) imgs.add(c.image);
      }
      if (imgs.size !== 1) return null;
      candidate = [...imgs][0];
    }
    // Honour a variant image ONLY if it is actually one of the product's gallery
    // images. Variant images are picked FROM the gallery in the editor, so a value
    // outside it is stale (e.g. an imported external URL not rehosted to match the
    // gallery) and would otherwise render as a DUPLICATE of the real gallery image.
    return candidate && images.includes(candidate) ? candidate : null;
  }, [variantsData, selectedCombo, selectedOptions, images]);

  // Title reflects the selected variation(s) live (e.g. "Saltea - 80*180").
  const displayName = useMemo(() => {
    if (!variantsData) return product.name;
    const selected = variantsData.options.map(o => selectedOptions[o.name]).filter(Boolean);
    return selected.length > 0 ? `${product.name} - ${selected.join(" / ")}` : product.name;
  }, [variantsData, selectedOptions, product.name]);

  // Display images — prepend the (full or partial) variant image if available
  const displayImages = useMemo(() => {
    if (variantImage) {
      return [variantImage, ...images.filter(img => img !== variantImage)];
    }
    return images;
  }, [variantImage, images]);

  const slides = displayImages.length > 0 ? displayImages : [];

  // Pretul combinatiei trece prin ACELASI helper ca grila, cealalta varianta de
  // pagina si repretuirea de pe server. Formula proprie de aici trata sirul „0"
  // ca pret real, deci pagina scria 0 lei si serverul incasa pretul de baza:
  // clientul platea altceva decat i s-a aratat.
  const basePrice = Number(product.price);
  const displayPrice = comboUnitPrice(selectedCombo, basePrice);
  const displayComparePrice = comboCompareAtPrice(
    selectedCombo,
    product.compare_at_price ? Number(product.compare_at_price) : null,
  );

  // Inainte de a alege o varianta, afiseaza intervalul de pret (sau doar minimul daca e setat din editor).
  const priceRange = getProductPriceRange(basePrice, pageSections);
  const priceLowestOnly = pageContent.price_range_display?.enabled === false;
  const showPriceRange = !selectedCombo && priceRange.hasRange;

  const hasDiscount = !showPriceRange && displayComparePrice && displayComparePrice > displayPrice;
  const discountPct = hasDiscount
    ? Math.round((1 - displayPrice / displayComparePrice!) * 100)
    : 0;

  // Stock status
  const stockStatus = pageSections.stock_status ?? "in_stock";
  const isOutOfStock = stockStatus === "out_of_stock"
    || (product.track_inventory && product.stock_quantity !== null && product.stock_quantity === 0);
  const isPreorder = !isOutOfStock && stockStatus === "preorder";
  // Combinatia trebuie sa EXISTE si sa fie activa, nu doar sa aiba titlul
  // complet: altfel linia intra in cos cu pretul de baza, iar serverul respinge
  // comanda intreaga la trimitere.
  const needsVariant = !!variantsData && !selectedCombo;

  // Specifications — auto-append dimensions if present.
  //
  // Citirile din `pageSections` stau INAUNTRUL memoizarii: scoase afara, ele
  // produceau un vector nou la fiecare randare, deci dependenta se schimba mereu
  // si compilatorul renunta sa optimizeze componenta intreaga.
  const specifications = useMemo(() => {
    const dimensions = pageSections.dimensions;
    const rows = [...(pageSections.specifications ?? [])];
    if (dimensions) {
      if (dimensions.length > 0) rows.push({ label: "Lungime", value: `${dimensions.length} cm` });
      if (dimensions.width > 0) rows.push({ label: "Latime", value: `${dimensions.width} cm` });
      if (dimensions.height > 0) rows.push({ label: "Inaltime", value: `${dimensions.height} cm` });
    }
    if (product.weight_grams) rows.push({ label: "Greutate", value: `${product.weight_grams} g` });
    return rows;
  }, [pageSections.specifications, pageSections.dimensions, product.weight_grams]);

  // Build quantity tiers — percent mode when variants enabled
  const tierConfig = pageSections.quantity_tiers;
  const quantityTiers: QuantityTier[] | undefined = tierConfig?.enabled
    ? (() => {
        const isPercent = tierConfig.mode === "percent";
        const tier2Price = isPercent
          ? displayPrice * 2 * (1 - (tierConfig.tier2_percent ?? 0) / 100)
          : tierConfig.tier2_price;
        const tier3Price = isPercent
          ? displayPrice * 3 * (1 - (tierConfig.tier3_percent ?? 0) / 100)
          : tierConfig.tier3_price;
        const hasT2 = isPercent ? (tierConfig.tier2_percent ?? 0) > 0 : tier2Price > 0;
        const hasT3 = isPercent ? (tierConfig.tier3_percent ?? 0) > 0 : tier3Price > 0;
        return [
          { qty: 1, price: displayPrice, badge: "" },
          ...(hasT2 ? [{ qty: 2, price: Math.round(tier2Price * 100) / 100, badge: tierConfig.tier2_badge }] : []),
          ...(hasT3 ? [{ qty: 3, price: Math.round(tier3Price * 100) / 100, badge: tierConfig.tier3_badge }] : []),
        ];
      })()
    : undefined;

  const [activeSlide, setActiveSlide] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [fbtOffer, setFbtOffer] = useState<{ id: string; items: { product_id: string; name: string; imageUrl: string | null; price: number; quantity: number }[] } | undefined>(undefined);
  /**
   * Cosul magazinului, citit LIVE din provider.
   *
   * Inainte pagina il citea o singura data din localStorage la montare si scria
   * direct inapoi, in paralel cu providerul. Cu doi scriitori, orice produs
   * adaugat dupa montare lipsea din comanda dar era sters odata cu ea. Acum
   * exista un singur scriitor, iar `useCartOptional` acopera miniatura din
   * catalogul de design-uri, care randeaza pagina fara provider.
   */
  const cos = useCartOptional();
  const chrome = useStoreChromeOptional();
  // Produsul curent iese: el se comanda separat, cu cantitatea din formular.
  const cartItems = useMemo(
    () => (demo || !cos ? [] : cos.items.filter((i) => i.productId !== product.id)),
    [demo, cos, product.id],
  );
  // In magazinul cu un singur produs cosul nu are nicio interfata — nici in
  // header, nici sertar, nici pagina — deci butonul ar confirma o actiune care
  // nu duce nicaieri. In miniatura nu exista chrome, dar butonul trebuie vazut.
  const arataButonCos = setari.showAddToCart !== false && (demo || chrome?.cartMode !== "hidden");
  const [adaugatInCos, setAdaugatInCos] = useState(false);

  function adaugaInCos() {
    if (demo || !cos || isOutOfStock || needsVariant) return;
    cos.addItem({
      productId: product.id,
      slug: product.slug ?? undefined,
      // Numele ramane simplu, combinatia sta in `variantTitle`: asa cheia de
      // linie iese identica cu cea din grila si acelasi produs creste in
      // cantitate in loc sa se dubleze.
      name: product.name,
      price: displayPrice,
      imageUrl: selectedCombo?.image || slides[0] || null,
      variantTitle: selectedComboTitle ?? undefined,
      variantSku: selectedCombo?.sku || undefined,
    });
    trackAddToCart({ productId: product.id, name: product.name, price: displayPrice });
    setAdaugatInCos(true);
    setTimeout(() => setAdaugatInCos(false), 1800);
  }

  // Add a cross-sell product to the store cart, so it rides into the order.
  // No discount — the price is unchanged.
  const addOfferProductToCart = useCallback((p: OfferProduct) => {
    if (demo || !cos) return;
    cos.addItem({ productId: p.id, slug: p.slug ?? undefined, name: p.name, price: p.price, imageUrl: p.imageUrl });
    trackAddToCart({ productId: p.id, name: p.name, price: p.price });
  }, [demo, cos]);

  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const touchStartX = useRef<number>(0);
  const thumbStripRef = useRef<HTMLDivElement>(null);

  const deliveryDates = useMemo(() => {
    if (!deliveryEstimate?.enabled) return null;
    const acum = new Date().getTime();
    const ZI = 24 * 60 * 60 * 1000;
    // Zilele se adauga pe instant si data se formateaza ancorata in fusul
    // Romaniei: serverul ruleaza in UTC, browserul in fusul vizitatorului, iar
    // fara ancora cele doua randari dau zile diferite in jurul miezului noptii
    // (nepotrivire de hidratare + estimare care se schimba sub ochii clientului).
    const fmt = (ms: number) => new Date(ms).toLocaleDateString("ro-RO", {
      timeZone: "Europe/Bucharest", day: "numeric", month: "long",
    });
    return {
      min: fmt(acum + (deliveryEstimate.min_days ?? 2) * ZI),
      max: fmt(acum + (deliveryEstimate.max_days ?? 4) * ZI),
    };
  }, [deliveryEstimate]);

  // Reset slide when variant image changes
  useEffect(() => { setActiveSlide(0); }, [variantImage]);

  // Keep the active thumbnail in view when navigating a large (scrollable) gallery.
  useEffect(() => {
    const active = thumbStripRef.current?.children[activeSlide] as HTMLElement | undefined;
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeSlide]);

  const goTo = useCallback((idx: number) => {
    setActiveSlide((idx + Math.max(slides.length, 1)) % Math.max(slides.length, 1));
  }, [slides.length]);

  // FBT "Cumpara impreuna": distribute the set savings across the companion prices
  // (the exact formula the server enforces), pre-accept the offer, open the buy-now modal.
  function handleBuyTogether(offer: ResolvedOffer) {
    if (!offer.pricing) return;
    const distributed = distributeFbtSavings(offer.products.map((p) => p.price), offer.pricing.savings);
    const items = offer.products.map((p, idx) => ({
      product_id: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      price: distributed[idx],
      quantity: 1,
    }));
    setFbtOffer({ id: offer.id, items });
    setModalOpen(true);
  }

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(dx) > 40) goTo(activeSlide + (dx > 0 ? 1 : -1));
  };

  // Zona de cumparare, randata O SINGURA DATA. Pana acum existau doua copii, una
  // pentru telefon si una pentru desktop, ascunse una pe alta din CSS: in acelasi
  // document ajungeau doi <h1> identici, doua descrieri si doua seturi de butoane.
  // Marimile se comuta acum din clase responsive.
  //
  // Se apeleaza ca functie, nu ca element JSX: o componenta declarata in corpul
  // randarii primeste alt tip la fiecare randare, iar React demonteaza si
  // remonteaza tot subarborele la orice alegere de varianta (imaginile se
  // re-decodeaza, focusul de pe butonul apasat dispare, tranzitiile nu apuca sa
  // ruleze).
  function zonaDeCumparare() {
    return (
      // `min-w-0`: pe telefon divul e element de grila, iar dimensiunea minima
      // automata l-ar lasa sa se dilate la latimea unui tabel sau a unei imagini
      // din descrierea scurta, largind si coloana galeriei.
      <div className="flex flex-col gap-3 lg:gap-4 min-w-0">
        {/* Quality badge */}
        {showQualityBadge && (
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 w-fit" style={{ backgroundColor: `${color}1a` }}>
            <div className="flex">{[1, 2, 3, 4, 5].map(i => <Star key={i} size={11} style={{ color, fill: color }} />)}</div>
            <span className="text-[11px] font-semibold" style={{ color }}>Calitate verificata</span>
          </div>
        )}

        {/* Title */}
        <h1 className="tracking-tight font-bold text-foreground leading-tight text-2xl lg:text-4xl">
          {displayName}
        </h1>

        {topBlurb && (
          <div
            className="policy-content text-muted-foreground leading-relaxed text-sm lg:text-base"
            // Sanitized server-side (see product route) before reaching the client.
            dangerouslySetInnerHTML={{ __html: topBlurb }}
          />
        )}

        {/* Price */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="tracking-tight font-bold text-foreground text-3xl lg:text-4xl">
            {showPriceRange
              ? formatPriceRange(priceRange.min, priceRange.max, priceLowestOnly)
              : formatPrice(displayPrice)}
          </span>
          {hasDiscount && (
            <>
              <span className="text-lg text-muted-foreground line-through">{formatPrice(displayComparePrice!)}</span>
              <span className="text-white text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: color }}>-{discountPct}%</span>
            </>
          )}
          {pageSections.customization?.enabled && pageSections.customization.fields.length > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${color}1a`, color }}>Personalizabil</span>
          )}
        </div>
        {vatEnabled && (
          <p className="text-xs text-muted-foreground">
            {pricesIncludeVat ? "Prețul include TVA" : "Preț fără TVA (TVA se adaugă la finalizare)"}
          </p>
        )}

        {/* Bundle contents — shown prominently in the buy box */}
        {product.is_bundle && bundleComponents.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pachetul conține</p>

            {/* Mobile: clean stacked list (full names, no truncation) */}
            <div className="space-y-1.5 sm:hidden">
              {bundleComponents.map((c) => (
                <div key={c.id} className="flex items-center gap-2.5 bg-surface border border-border rounded-lg p-1.5">
                  <div className="relative w-9 h-9 rounded-md overflow-hidden bg-muted/40 shrink-0">
                    {c.image_url
                      ? <Image src={c.image_url} alt={c.name} fill sizes="36px" className="object-contain p-0.5" />
                      : <div className="w-full h-full flex items-center justify-center"><Package size={14} className="text-muted-foreground/50" /></div>}
                  </div>
                  <span className="text-sm text-foreground leading-snug flex-1 min-w-0">
                    {c.quantity > 1 && <span className="font-bold">{c.quantity}× </span>}{c.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Desktop: inline "A + B + C" chips */}
            <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
              {bundleComponents.map((c, i) => (
                <div key={c.id} className="flex items-center gap-1.5">
                  {i > 0 && <Plus size={14} className="text-muted-foreground shrink-0" />}
                  <div className="flex items-center gap-1.5 bg-surface border border-border rounded-lg pl-1 pr-2 py-1">
                    <div className="relative w-7 h-7 rounded-md overflow-hidden bg-muted/40 shrink-0">
                      {c.image_url
                        ? <Image src={c.image_url} alt={c.name} fill sizes="28px" className="object-contain" />
                        : <div className="w-full h-full flex items-center justify-center"><Package size={12} className="text-muted-foreground/50" /></div>}
                    </div>
                    <span className="text-xs font-medium text-foreground max-w-[160px] truncate">{c.quantity > 1 ? `${c.quantity}× ` : ""}{c.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {deliveryDates && (
          <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 border" style={{ backgroundColor: `${color}12`, borderColor: `${color}30` }}>
            <Calendar size={16} className="flex-shrink-0" style={{ color }} />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {deliveryEstimate?.text || "Estimare livrare"}
              </p>
              <p className="text-xs text-muted-foreground">{deliveryDates.min} - {deliveryDates.max}</p>
            </div>
          </div>
        )}

        {variantsData && variantsData.options.length > 0 && (
          <div className="space-y-4">
            {variantsData.options.map(option => (
              <div key={option.id}>
                <p className="text-sm font-semibold text-foreground mb-2">
                  {option.name}
                  {selectedOptions[option.name] && (
                    <span className="font-normal text-muted-foreground ml-2">- {selectedOptions[option.name]}</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {option.values.map(val => {
                    const isSelected = selectedOptions[option.name] === val;
                    const available = isValueAvailable(variantsData, selectedOptions, option.name, val);
                    return (
                      <button key={val} type="button"
                        onClick={() => setSelectedOptions(prev => ({
                          ...prev,
                          [option.name]: isSelected ? "" : val,
                        }))}
                        disabled={!available}
                        className="px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all"
                        style={isSelected
                          ? { borderColor: color, backgroundColor: `${color}18`, color: "var(--color-foreground)" }
                          : available
                          ? { borderColor: "var(--color-border)", color: "var(--color-foreground)" }
                          : { borderColor: "var(--color-border)", color: "var(--color-muted-foreground)", textDecoration: "line-through", cursor: "not-allowed" }
                        }>
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {selectedComboTitle && !selectedCombo && (
              <p className="text-sm text-red-500 font-medium">Aceasta combinatie nu este disponibila.</p>
            )}
          </div>
        )}

        {/* Stock indicators */}
        {isPreorder && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 border" style={{ backgroundColor: `${color}12`, borderColor: `${color}30` }}>
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            <span className="text-sm font-semibold text-foreground">Produs in precomanda</span>
          </div>
        )}
        {!isOutOfStock && !isPreorder && product.track_inventory && product.stock_quantity !== null && product.stock_quantity > 0 && product.stock_quantity <= 10 && (
          <motion.div className="flex items-center gap-2"
            animate={demo || reduceMotion ? undefined : { opacity: [1, 0.5, 1] }} transition={{ duration: 2, repeat: Infinity }}>
            <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-red-600">
              Doar {product.stock_quantity} {product.stock_quantity === 1 ? "bucata ramasa" : "bucati ramase"} in stoc
            </span>
          </motion.div>
        )}

        {/* CTA */}
        <CTAButton color={color} isOutOfStock={isOutOfStock} isPreorder={isPreorder} needsVariant={needsVariant} hasCardPayment={hasCardPayment} effect={buttonEffect} onClick={() => { setFbtOffer(undefined); setModalOpen(true); }} />

        {/* Comanda directa ramane actiunea principala; cosul e pentru cine mai
            vrea sa se uite prin magazin inainte sa cumpere. */}
        {arataButonCos && (
          <button type="button" onClick={adaugaInCos} disabled={isOutOfStock || needsVariant || (!demo && !cos)}
            className="w-full py-3.5 text-base font-semibold rounded-xl border-2 bg-surface hover:bg-muted/40 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
            style={{ borderColor: color, color }}>
            {adaugatInCos ? <Check size={18} /> : <ShoppingCart size={18} />}
            {adaugatInCos ? "Adaugat in cos" : "Adauga in cos"}
          </button>
        )}
        <p aria-live="polite" className="sr-only">{adaugatInCos ? "Produsul a fost adaugat in cos" : ""}</p>

        {/* Trust mini */}
        {trustBadgesEnabled && (
          <div className="grid grid-cols-3 gap-2 py-1">
            {[
              { icon: ShieldCheck, text: "Plata la livrare" },
              { icon: Truck, text: "Livrare 24-48h" },
              { icon: RotateCcw, text: "Retur 14 zile" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex flex-col items-center gap-1.5 text-center">
                <Icon size={20} style={{ color }} />
                <span className="text-[11px] text-muted-foreground font-medium leading-tight">{text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Doar pe desktop, ca pana acum. `flex-col` pe invelis, nu `block`:
            pastilata e `inline-flex`, deci intr-un bloc s-ar stramta la latimea
            textului in loc sa umple coloana, cum face azi. */}
        {showSocialProof && (
          <div className="hidden lg:flex lg:flex-col">
            <SocialProof count={viewerCount} color={color} />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Breadcrumb back to catalog (restores the catalog page the visitor left from) */}
      {!isHome && setari.showBreadcrumb !== false && (
        <div className="bg-surface/80 border-b border-border">
          <div className="max-w-6xl mx-auto px-4 md:px-6 h-11 flex items-center gap-3">
            <a href={basePath || "/"} aria-label="Inapoi la magazin"
              onClick={(e) => {
                try {
                  const p = sessionStorage.getItem(`store_page_${business.slug}`);
                  if (p && Number(p) > 1) { e.preventDefault(); window.location.href = `${basePath || "/"}?page=${p}`; }
                } catch {}
              }}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ArrowLeft size={16} />
              <span>Magazin</span>
            </a>
            <span className="text-muted-foreground/50">/</span>
            <span className="text-sm font-medium text-muted-foreground truncate">{product.name}</span>
          </div>
        </div>
      )}

      {/* Hero: o singura grila, cu asezarea comutata din CSS. Galeria ramane in
          doua variante (banda care culiseaza pe telefon, diapozitive suprapuse pe
          desktop), dar zona de cumparare e una singura. */}
      <div className="px-4 pt-3 pb-8 lg:px-6 lg:pt-8 lg:pb-16">
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-2 lg:gap-16 lg:items-start">
          <div>
            <div className="lg:hidden">
              <Gallery mobile slides={slides} activeSlide={activeSlide} goTo={goTo} color={color}
                imgAlt={imgAlt} hasDiscount={!!hasDiscount} discountPct={discountPct}
                onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} />
            </div>
            {/* Animatia de intrare a fost dintotdeauna doar pe desktop; aici sta pe
                un invelis `hidden lg:block`, deci pe telefon nu are ce misca. */}
            <motion.div className="hidden lg:block" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
              <Gallery mobile={false} slides={slides} activeSlide={activeSlide} goTo={goTo} color={color}
                imgAlt={imgAlt} hasDiscount={!!hasDiscount} discountPct={discountPct}
                onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} />
              {slides.length > 1 && (
                <div ref={thumbStripRef} className="flex gap-2 mt-3 overflow-x-auto pb-1">
                  {slides.map((src, i) => (
                    <button key={i} type="button" aria-label={`Selecteaza imaginea ${i + 1}`} onClick={() => goTo(i)}
                      className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden transition-all bg-muted/40"
                      style={{ border: `2px solid ${i === activeSlide ? color : "transparent"}`, opacity: i === activeSlide ? 1 : 0.55 }}>
                      <Image src={src} alt={imgAlt(src, i)} fill sizes="64px" className="object-contain p-1" />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
          {/* `contents` pe telefon: elementul nu genereaza cutie, deci animatia de
              intrare (desktop-only, ca inainte) nu are efect, iar zona de cumparare
              ramane copil direct al grilei. */}
          <motion.div className="contents lg:block" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            {zonaDeCumparare()}
          </motion.div>
        </div>
      </div>

      {/* Miniatura se opreste aici: galeria si zona de cumparare sunt ce
          deosebeste designurile de pagina de produs. Mai jos urmeaza sectiuni de
          continut care depind de ce a completat comerciantul si care, in plus, se
          animeaza abia cand intra in ecran — intr-un cadru care nu deruleaza ar
          ramane transparente. */}
      {demo ? null : (
      <>
      {/* Cross-sell offers ("Merge bine cu") — renders nothing if the store has none */}
      <ProductOffers offers={productOffers} basePath={basePath} color={color}
        anchor={{ name: product.name, price: displayPrice, imageUrl: images[0] ?? null }}
        ancoraIndisponibila={isOutOfStock ? { motiv: "Stoc epuizat" } : needsVariant ? { motiv: "Selecteaza optiunile" } : null}
        onBuyTogether={handleBuyTogether} onAddToCart={addOfferProductToCart} />

      {/* Benefits */}
      {benefitsSection?.enabled && benefitsSection.items.length > 0 && (
        <section className="py-12 md:py-28 px-4 md:px-6 bg-background">
          <div className="max-w-6xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-14">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-3">De ce sa alegi</p>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">{benefitsSection.title}</h2>
            </motion.div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
              {benefitsSection.items.map((b, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="bg-surface border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${color}20` }}>
                    <span className="text-lg font-bold" style={{ color }}>{i + 1}</span>
                  </div>
                  <h3 className="font-semibold text-foreground text-base mb-2">{b.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{b.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      {howItWorksSection?.enabled && howItWorksSection.steps.length > 0 && (
        <section className="py-12 md:py-28 px-4 md:px-6 bg-surface">
          <div className="max-w-6xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-3">Simplu de folosit</p>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">{howItWorksSection.title}</h2>
            </motion.div>
            {/* Mobile */}
            <div className="md:hidden flex flex-col gap-3">
              {howItWorksSection.steps.map((step, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="flex items-center gap-4 bg-surface border border-border rounded-xl p-4 shadow-sm">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-bold text-lg text-white"
                    style={{ backgroundColor: color }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm mb-0.5">{step.title}</h3>
                    <p className="text-muted-foreground text-xs leading-relaxed">{step.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            {/* Desktop */}
            <div className="hidden md:grid md:grid-cols-3 gap-8 relative">
              <div className="absolute top-12 left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-px bg-gradient-to-r from-border via-border to-border" />
              {howItWorksSection.steps.map((step, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.15 }}
                  className="flex flex-col items-center text-center relative">
                  <div className="w-24 h-24 rounded-full bg-surface border-2 border-border shadow-sm flex flex-col items-center justify-center mb-6 z-10">
                    <span className="font-bold text-xl" style={{ color }}>{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="font-semibold text-foreground text-xl mb-3">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Long description */}
      {hasShortDesc && hasLongDesc && (
        <section className="py-12 md:py-28 px-4 md:px-6 bg-surface">
          <div className="max-w-3xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Descriere</h2>
            </motion.div>
            <div className="policy-content text-muted-foreground leading-relaxed text-base"
              dangerouslySetInnerHTML={{ __html: product.description ?? "" }} />
          </div>
        </section>
      )}

      {/* Bundle contents */}
      {product.is_bundle && bundleComponents.length > 0 && (
        <section className="py-12 md:py-24 px-4 md:px-6 bg-surface">
          <div className="max-w-4xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-12">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-3">Pachet</p>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Ce conține pachetul</h2>
            </motion.div>
            <div className="grid sm:grid-cols-2 gap-3">
              {bundleComponents.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface shadow-sm">
                  <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-muted/40 border border-border shrink-0">
                    {c.image_url
                      ? <Image src={c.image_url} alt={c.name} fill sizes="56px" className="object-contain p-1" />
                      : <div className="w-full h-full flex items-center justify-center"><Package className="h-5 w-5 text-muted-foreground/50" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground leading-snug">{c.quantity > 1 ? `${c.quantity}x ` : ""}{c.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatPrice(c.price)}{c.out_of_stock ? " · indisponibil" : ""}</p>
                  </div>
                </div>
              ))}
            </div>
            {Number(product.compare_at_price) > Number(product.price) && (
              <p className="text-center text-sm text-muted-foreground mt-6">
                Cumpărate separat: <span className="line-through">{formatPrice(Number(product.compare_at_price))}</span>
                {" · "}în pachet plătești <span className="font-bold" style={{ color }}>{formatPrice(Number(product.price))}</span>
              </p>
            )}
          </div>
        </section>
      )}

      {/* Specifications */}
      {specifications.length > 0 && (
        <section className="py-12 md:py-28 px-4 md:px-6 bg-background">
          <div className="max-w-4xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-14">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-3">Detalii tehnice</p>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">Specificatii</h2>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
              className="border border-border rounded-xl overflow-hidden shadow-sm">
              {specifications.map((spec, i) => (
                // Randul se stivuieste pe telefon: cu eticheta fixata la 11rem si
                // px-6, pe un ecran de 320 px ramaneau 80 px pentru valoare.
                <div key={i}
                  className={`flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:gap-4 ${i % 2 === 0 ? "bg-surface" : "bg-muted/30"} ${i !== specifications.length - 1 ? "border-b border-border" : ""}`}>
                  <span className="text-sm text-muted-foreground font-medium sm:w-44 sm:shrink-0">{spec.label}</span>
                  <span className="text-sm font-semibold text-foreground">{spec.value}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </section>
      )}

      {/* FAQ */}
      {faqSection?.enabled && faqSection.items.length > 0 && (
        <section className="py-12 md:py-28 px-4 md:px-6 bg-surface">
          <div className="max-w-3xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-14">
              <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono mb-3">Intrebari frecvente</p>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">{faqSection.title}</h2>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
              className="bg-surface border border-border rounded-xl shadow-sm px-4 md:px-8">
              {faqSection.items.map((faq, i) => (
                <FAQItem key={i} faq={faq} isOpen={openFaq === i}
                  onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
              ))}
            </motion.div>
          </div>
        </section>
      )}

      {/* Sticky bottom bar (mobile) */}
      {!modalOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-surface border-t border-border shadow-2xl px-4 py-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground truncate">
                {displayName}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-foreground">
                  {showPriceRange
                    ? formatPriceRange(priceRange.min, priceRange.max, priceLowestOnly)
                    : formatPrice(displayPrice)}
                </span>
                {hasDiscount && (
                  <span className="text-xs text-muted-foreground line-through">{formatPrice(displayComparePrice!)}</span>
                )}
              </div>
            </div>
            <button type="button" onClick={() => { setFbtOffer(undefined); setModalOpen(true); }} disabled={isOutOfStock || needsVariant}
              className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-white rounded-xl flex-shrink-0 disabled:opacity-40 hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
              style={{ backgroundColor: color }}>
              <ShoppingBag size={16} />
              {isOutOfStock ? "Epuizat" : isPreorder ? "Precomanda" : "Comanda"}
            </button>
          </div>
        </div>
      )}

      {/* Order Modal */}
      <OrderModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setFbtOffer(undefined); }}
        product={{
          id: product.id,
          name: selectedCombo ? `${product.name} (${selectedCombo.title})` : product.name,
          price: displayPrice,
          compare_at_price: displayComparePrice,
          images: slides,
          weight_grams: product.weight_grams,
        }}
        business={{ id: business.id, slug: business.slug, basePath, primary_color: color }}
        shippingCost={shippingCost}
        freeShippingThreshold={freeShippingThreshold}
        minOrderAmount={minOrderAmount}
        tiers={quantityTiers}
        customizationFields={pageSections.customization?.enabled ? pageSections.customization.fields : undefined}
        cartItems={cartItems}
        onCartConsumed={(liniiComandate) => {
          // Doar liniile care au intrat efectiv in comanda. Stergerea intregului
          // cos lasa pe dinafara linia produsului curent: ea nu e purtata in
          // comanda (el se comanda separat, cu cantitatea din formular), deci ar
          // fi disparut necomandata.
          if (!cos) return;
          cos.restoreCart(cosDupaComanda(cos.items, liniiComandate));
        }}
        fbtOffer={fbtOffer}
      />
      </>
      )}
    </>
  );
}
