"use client";

import { useState, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import Image from "next/image";
import {
  ChevronUp, ChevronDown, ChevronRight, Check, Package, Plus, Minus,
  Calendar, ShoppingCart, CreditCard, Truck, RotateCcw, ShieldCheck, MessageCircle, Phone,
} from "lucide-react";
import { formatPrice, formatPriceRange } from "@/lib/utils/format";
import { fbTrack, ttqTrack, gtagEvent } from "@/lib/marketing";
import { disponibilitatePachet } from "@/lib/bundles";
import type { BundleComponent } from "@/lib/storefront/product-data";
import { getProductPriceRange } from "@/lib/utils/product-price";
import { vatLabel } from "@/lib/utils/vat";
import {
  parseVariants, comboTitle, findCombo, isValueAvailable, comboUnitPrice, comboCompareAtPrice,
  comboEpuizat, comboStock, toateCombinatiileEpuizate, pozePeValoare, VARIANT_TITLE_SEP,
} from "@/lib/storefront/variants";
import { OrderModal } from "@/components/ministore/OrderModal";
import type { QuantityTier } from "@/components/ministore/OrderModal";
import { construiesteTrepte } from "@/lib/storefront/quantity-tiers";
import { ProductOffers } from "@/components/ministore/ProductOffers";
import type { ResolvedOffer, OfferProduct } from "@/lib/offers/offer.types";
import { distributeFbtSavings } from "@/lib/offers/offer.types";
import { useCartOptional } from "@/components/storefront/cart/CartProvider";
import { trackAddToCart } from "@/lib/storefront/cart/track-add";
import { cosDupaComanda } from "@/lib/storefront/cart/consume";
import { hrefCategorie, radacinaMagazin } from "@/lib/storefront/category-href";
import { useStoreChromeOptional } from "@/components/storefront/StorefrontProvider";
import type {
  Business, Product, StoreSettings, PageContent, PageSections,
} from "./_shared/product-page.types";
import {
  abonareMiscareRedusa, citesteMiscareRedusa, hashSir,
  SocialProof, FAQItem, CTAButton,
} from "./_shared/pieces";

/**
 * Pagina de produs, varianta „Detaliat".
 *
 * Modelul e magazinul de electronice: informatia bate atmosfera. Fata de
 * `classic`, care ii da produsului o pagina de vanzare cu o singura chemare la
 * actiune, aici cumparatorul primeste tot ce stie magazinul despre produs
 * inainte sa deruleze — cod, categorie, etichete, livrare estimata — plus doua
 * actiuni separate: pune in cos ca sa mai caute, sau comanda pe loc.
 *
 * Ce arata in plus fata de classic, DIN DATE CARE EXISTAU DEJA si nu se vedeau
 * nicaieri: codul produsului, EAN-ul si brandul (din atributele de marketplace),
 * categoria si etichetele, si treptele de cantitate — pana acum ajungeau doar in
 * formularul de comanda, desi sunt chiar argumentul de a cumpara mai multe.
 */

/* ─── Galerie cu sina verticala ───────────────────────────────────────────── */

/** Acelasi `sizes` pe telefon si pe desktop, din acelasi motiv ca la classic. */
const SIZES_GALERIE = "(min-width: 1024px) 560px, 100vw";
/** Cate miniaturi incap in sina inainte sa aiba nevoie de derulare. */
const MINIATURI_VIZIBILE = 5;
/**
 * Cate specificatii urca langa galerie, ca rezumat.
 * Restul raman in fila lor: sase randuri echilibreaza coloanele, un tabel
 * intreg ar impinge din nou pagina in gol, doar in cealalta parte.
 */
const SPECIFICATII_LANGA_GALERIE = 6;

function Galerie({ slides, activ, mergiLa, imgAlt, hasDiscount, discountPct, color, miniaturiInStanga }: {
  slides: string[];
  activ: number;
  mergiLa: (i: number) => void;
  imgAlt: (src: string, i: number) => string;
  hasDiscount: boolean;
  discountPct: number;
  color: string;
  /** Sina verticala langa imagine, sau rand sub ea. Pe telefon e mereu jos. */
  miniaturiInStanga: boolean;
}) {
  // Sagetile pot duce activul in afara ferestrei de derulare a sinei; fara
  // asta, dupa cateva apasari miniatura curenta nu se mai vede deloc.
  const miniaturaActiva = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    miniaturaActiva.current?.scrollIntoView({ block: "nearest" });
  }, [activ]);

  if (slides.length === 0) {
    return (
      <div className="aspect-square rounded-md border border-border bg-muted/20 flex items-center justify-center">
        <Package size={64} className="text-muted-foreground/40" />
      </div>
    );
  }

  const cuSina = slides.length > 1;
  const cuSinaLaterala = cuSina && miniaturiInStanga;

  return (
    <div className="flex gap-3">
      {/* Sina verticala, doar pe desktop: pe telefon miniaturile ar manca
          latimea imaginii, care e singurul lucru pentru care s-a deschis pagina. */}
      {cuSinaLaterala && (
        <div className="hidden lg:flex flex-col items-center gap-2 shrink-0">
          <button type="button" aria-label="Imaginea anterioara"
            onClick={() => mergiLa(activ - 1)}
            className="w-8 h-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <ChevronUp size={14} />
          </button>
          <div className="flex flex-col gap-2 overflow-y-auto"
            style={{ maxHeight: `${MINIATURI_VIZIBILE * 5.5}rem` }}>
            {slides.map((src, i) => (
              <button key={src + i} type="button" onClick={() => mergiLa(i)}
                aria-label={`Vezi imaginea ${i + 1}`} aria-current={i === activ}
                ref={i === activ ? miniaturaActiva : undefined}
                className="relative w-[4.5rem] h-[4.5rem] shrink-0 rounded-md overflow-hidden bg-muted/20 transition-all"
                style={{ border: `2px solid ${i === activ ? color : "transparent"}`, opacity: i === activ ? 1 : 0.6 }}>
                <Image src={src} alt={imgAlt(src, i)} fill sizes="72px" className="object-contain p-1" />
              </button>
            ))}
          </div>
          <button type="button" aria-label="Imaginea urmatoare"
            onClick={() => mergiLa(activ + 1)}
            className="w-8 h-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <ChevronDown size={14} />
          </button>
        </div>
      )}

      <div className="relative flex-1 min-w-0">
        {/* Panou deschis in spatele produsului, ca in modelul de referinta: pune
            in valoare fotografiile decupate pe fundal alb. */}
        <div className="relative aspect-square rounded-md border border-border bg-muted/20 overflow-hidden">
          {slides.map((src, i) => (
            <div key={src + i}
              aria-hidden={i !== activ}
              className="absolute inset-0 transition-opacity duration-300"
              style={{ opacity: i === activ ? 1 : 0, pointerEvents: i === activ ? "auto" : "none" }}>
              <Image src={src} alt={imgAlt(src, i)} fill sizes={SIZES_GALERIE}
                className="object-contain p-6" priority={i === 0} loading={i === 0 ? undefined : "lazy"} />
            </div>
          ))}
          {hasDiscount && (
            <span className="absolute top-3 left-3 px-2 py-1 rounded-sm text-[11px] font-bold text-white tracking-wide"
              style={{ backgroundColor: color }}>
              -{discountPct}%
            </span>
          )}
        </div>

        {/* Pe telefon miniaturile trec dedesubt, pe un rand derulabil. */}
        {cuSina && (
          <div className={miniaturiInStanga ? "flex lg:hidden gap-2 mt-3 overflow-x-auto pb-1" : "flex gap-2 mt-3 overflow-x-auto pb-1"}>
            {slides.map((src, i) => (
              <button key={src + i} type="button" onClick={() => mergiLa(i)}
                aria-label={`Vezi imaginea ${i + 1}`} aria-current={i === activ}
                className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted/20 transition-all"
                style={{ border: `2px solid ${i === activ ? color : "transparent"}`, opacity: i === activ ? 1 : 0.6 }}>
                <Image src={src} alt={imgAlt(src, i)} fill sizes="64px" className="object-contain p-1" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Negrul celei de-a doua actiuni.
 *
 * Modelul are chemarea principala in culoarea magazinului si comanda directa in
 * negru, ca sa se distinga una de alta fara sa se bata cap in cap. Nu e o
 * variabila de tema: e parte din designul acestei variante, la fel ca muchiile
 * drepte, si nu trebuie sa se schimbe cu paleta magazinului.
 */
const NEGRU = "#111111";

/* ─── Bucati mici ale coloanei de cumparare ──────────────────────────────── */

function RandMeta({ eticheta, children }: { eticheta: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <span className="text-muted-foreground shrink-0">{eticheta}:</span>
      <span className="text-foreground font-medium min-w-0">{children}</span>
    </div>
  );
}

function Stepper({ valoare, seteaza, maxim }: { valoare: number; seteaza: (n: number) => void; maxim: number | null }) {
  const laLimita = maxim !== null && valoare >= maxim;
  return (
    <div className="flex items-center rounded-md border border-border h-12 shrink-0">
      <button type="button" aria-label="Scade cantitatea" onClick={() => seteaza(Math.max(1, valoare - 1))}
        disabled={valoare <= 1}
        className="w-11 h-full flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
        <Minus size={15} />
      </button>
      <span aria-live="polite" className="w-9 text-center font-semibold text-foreground tabular-nums">{valoare}</span>
      <button type="button" aria-label="Creste cantitatea" onClick={() => seteaza(valoare + 1)}
        disabled={laLimita}
        className="w-11 h-full flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
        <Plus size={15} />
      </button>
    </div>
  );
}

/* ─── Pagina ─────────────────────────────────────────────────────────────── */

type FilaActiva = "descriere" | "specificatii" | "intrebari";

export function ProductPageDetailed({
  business,
  product,
  storeSettings,
  basePath: basePathProp,
  hasCardPayment = false,
  bundleComponents = [],
  altMap = {},
  isHome = false,
  productOffers = [],
  setari = {},
  demo = false,
}: {
  business: Business;
  product: Product;
  storeSettings: StoreSettings | null;
  basePath?: string;
  hasCardPayment?: boolean;
  bundleComponents?: BundleComponent[];
  altMap?: Record<string, string>;
  isHome?: boolean;
  productOffers?: ResolvedOffer[];
  /** Reglajele variantei, din `design.product.page.settings`. Vezi registry. */
  setari?: Record<string, unknown>;
  /** Miniatura din catalogul de design-uri: pagina se randeaza inerta. Vezi `classic`. */
  demo?: boolean;
}) {
  const basePath = basePathProp ?? `/${business.slug}`;
  const images = useMemo(
    () => (Array.isArray(product.images) ? product.images.map(String).filter(Boolean) : []),
    [product.images],
  );

  const productId = product.id;
  const productName = product.name;
  // Pretul raportat pixelilor e cel pe care il poate cumpara clientul: pe un
  // produs variabil, pretul de baza poate sa nu existe ca oferta.
  const priceRange = getProductPriceRange(Number(product.price) || 0, product.page_sections);
  const productPrice = priceRange.min;
  useEffect(() => {
    if (demo) return;
    gtagEvent("view_item", { currency: "RON", value: productPrice, items: [{ item_id: productId, item_name: productName, price: productPrice, quantity: 1 }] });
    fbTrack("ViewContent", { content_ids: [productId], content_name: productName, content_type: "product", value: productPrice, currency: "RON" });
    ttqTrack("ViewContent", { value: productPrice, currency: "RON", contents: [{ content_id: productId, content_type: "product", content_name: productName, price: productPrice, quantity: 1 }] });
  }, [demo, productId, productName, productPrice]);

  const imgAlt = (src: string, i: number) => altMap[src] || `${product.name} ${i + 1}`;
  const color = business.primary_color ?? "#1AB554";

  const shippingCost = Number(storeSettings?.default_shipping_cost ?? 20);
  const freeShippingThreshold = storeSettings?.free_shipping_threshold
    ? Number(storeSettings.free_shipping_threshold) : null;
  const minOrderAmount = storeSettings?.min_order_amount
    ? Number(storeSettings.min_order_amount) : null;
  // Eticheta de langa pret: „(TVA inclus)" sau „(fara TVA)". Textul se deduce din
  // setarea de preturi, nu se scrie separat nicaieri; `null` cand magazinul nu e
  // platitor de TVA sau comerciantul a stins-o din Setari > Taxe.
  const eticheta = vatLabel({
    vat_enabled: storeSettings?.vat_enabled ?? false,
    prices_include_vat: storeSettings?.prices_include_vat ?? true,
    show_vat_label: storeSettings?.show_vat_label ?? true,
  });

  const pageContent = (storeSettings?.page_content as PageContent) ?? {};
  const pageSections = (product.page_sections as PageSections) ?? {};

  const shortDesc = (pageSections.short_description ?? "").trim();
  const hasShortDesc = shortDesc !== "" && shortDesc !== "<p></p>";
  const hasLongDesc = !!product.description && product.description !== "<p></p>";

  const trustBadgesEnabled = pageContent.trust_badges_enabled !== false;
  const benefitsSection = pageContent.benefits_section;
  const howItWorksSection = pageContent.how_it_works_section;
  const faqSection = pageContent.faq_section;
  const reduceMotion = useSyncExternalStore(abonareMiscareRedusa, citesteMiscareRedusa, () => false);
  const buttonEffect = demo || reduceMotion ? "none" : (pageContent.button_effect ?? "none");
  const deliveryEstimate = pageContent.delivery_estimate;
  const viewerCount = demo ? 23 : 18 + (hashSir(product.id) % 10);
  const showSocialProof = pageContent.show_social_proof === true;

  /* Variante — aceiasi helperi ca in grila, ca pretul afisat sa fie acelasi pe
     care il accepta serverul la plasarea comenzii. */
  const variantsData = useMemo(() => parseVariants(product.page_sections), [product.page_sections]);
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

  const variantImage = useMemo(() => {
    if (!variantsData) return null;
    let candidate: string | null = null;
    if (selectedCombo?.image) {
      candidate = selectedCombo.image;
    } else {
      const chosen = variantsData.options.map((o) => selectedOptions[o.name]).filter(Boolean) as string[];
      if (chosen.length === 0) return null;
      const imgs = new Set<string>();
      for (const c of variantsData.combinations) {
        if (!c.enabled || !c.image) continue;
        const parts = c.title.split(VARIANT_TITLE_SEP);
        if (chosen.every((s) => parts.includes(s))) imgs.add(c.image);
      }
      if (imgs.size !== 1) return null;
      candidate = [...imgs][0];
    }
    // O imagine de varianta care nu e in galerie e invechita: ar aparea dublata.
    return candidate && images.includes(candidate) ? candidate : null;
  }, [variantsData, selectedCombo, selectedOptions, images]);

  const slides = useMemo(
    () => (variantImage ? [variantImage, ...images.filter((img) => img !== variantImage)] : images),
    [variantImage, images],
  );

  // Cand o valoare de optiune se alege din fotografie si cand din cuvant: vezi
  // `pozePeValoare`. Regula sta acolo fiindca e o decizie, nu o randare, si are
  // teste.
  const pozeOptiuni = useMemo(() => pozePeValoare(variantsData, images), [variantsData, images]);

  const basePrice = Number(product.price);
  const displayPrice = comboUnitPrice(selectedCombo, basePrice);
  const displayComparePrice = comboCompareAtPrice(
    selectedCombo,
    product.compare_at_price ? Number(product.compare_at_price) : null,
  );

  const priceLowestOnly = pageContent.price_range_display?.enabled === false;
  /*
   * Pe produsele cu variante, pretul dinainte de alegere iese INTOTDEAUNA din
   * interval, nu doar cand variantele au preturi diferite.
   *
   * Cu `hasRange` in conditie, un produs ale carui marimi costa toate la fel
   * cadea pe pretul de BAZA — iar baza nu e de vanzare: ANTIFOANE INT UF REFILL
   * are baza 156,80 si singura combinatie activa 438,00, deci pagina promitea cu
   * 281,20 lei mai putin decat se incaseaza. `formatPriceRange` colapseaza singur
   * cand min si max sunt egale, deci nu e nevoie de a doua ramura.
   */
  const showPriceRange = !selectedCombo && !!variantsData;

  // Reducerea se raporteaza la pretul de pe ecran. Pana la prima bifa acela e
  // minimul vandabil, nu baza — altfel cardul de catalog scria „-12%" si pagina
  // produsului nu confirma nicio reducere.
  const pretDeComparat = selectedCombo ? displayPrice : priceRange.min;
  const aratamInterval = showPriceRange && priceRange.hasRange;
  const hasDiscount = !aratamInterval && !!displayComparePrice && displayComparePrice > pretDeComparat;
  const discountPct = hasDiscount ? Math.round((1 - pretDeComparat / displayComparePrice!) * 100) : 0;

  const stockStatus = pageSections.stock_status ?? "in_stock";
  const isOutOfStock = stockStatus === "out_of_stock"
    || (product.track_inventory && product.stock_quantity !== null && product.stock_quantity === 0)
    // Varianta aleasa si-a terminat stocul declarat, sau toate s-au terminat.
    // Prima nu s-ar putea alege din interfata, fiindca optiunile epuizate sunt
    // taiate, dar o selectie ramasa de dinainte tot ajunge aici.
    || comboEpuizat(selectedCombo)
    || toateCombinatiileEpuizate(variantsData)
    /*
     * Pachetul e indisponibil cand oricare componenta lipseste sau s-a terminat.
     *
     * Pana acum pagina de produs calcula disponibilitatea din campurile
     * produsului insusi — dar un pachet se scrie cu `track_inventory: false`,
     * deci conditiile de deasupra sunt TOATE false pe orice pachet. Cardul din
     * catalog stia asta si scria „Stoc epuizat"; pagina deschidea butonul
     * Comanda, iar comanda cadea la ultimul pas. Acum amandoua trec prin aceeasi
     * regula ca verificarea de la comanda.
     */
    || (product.is_bundle && !disponibilitatePachet(bundleComponents).inStock);
  const isPreorder = !isOutOfStock && stockStatus === "preorder";
  // Nu doar „titlul e complet", ci si „combinatia exista si e activa": altfel
  // linia intra in cos cu pretul de baza, iar serverul o respinge la comanda.
  const needsVariant = !!variantsData && !selectedCombo;
  const combinatieIndisponibila = !!variantsData && !!selectedComboTitle && !selectedCombo;
  /*
   * Cate bucati mai sunt: din varianta aleasa daca ea isi tine socoteala,
   * altfel din produs.
   *
   * Pana acum scria mereu stocul produsului INTREG. Pe un produs cu 40 de bucati
   * in total, marimea cu 2 ramase spunea linistit „In stoc", iar pasul de
   * cantitate lasa sa se puna 40 in cos din ea.
   */
  const stocRamas = comboStock(selectedCombo)
    ?? (product.track_inventory ? product.stock_quantity : null);

  const dimensions = pageSections.dimensions;
  const specRows = useMemo(() => pageSections.specifications ?? [], [pageSections.specifications]);
  const specifications = useMemo(() => {
    const rows = [...specRows];
    if (dimensions) {
      if (dimensions.length > 0) rows.push({ label: "Lungime", value: `${dimensions.length} cm` });
      if (dimensions.width > 0) rows.push({ label: "Latime", value: `${dimensions.width} cm` });
      if (dimensions.height > 0) rows.push({ label: "Inaltime", value: `${dimensions.height} cm` });
    }
    if (product.weight_grams) rows.push({ label: "Greutate", value: `${product.weight_grams} g` });
    return rows;
  }, [specRows, dimensions, product.weight_grams]);

  const tierConfig = pageSections.quantity_tiers;
  // Treptele vin din motorul comun, nu dintr-o copie locala. Formula era scrisa
  // de trei ori — aici, in cealalta pagina de produs si in `construiesteTrepte` —
  // desi docstring-ul motorului sustinea deja ca exista un singur loc. Copiile
  // se pot desincroniza tacit de motorul care chiar incaseaza.
  const quantityTiers: QuantityTier[] | undefined = construiesteTrepte(tierConfig, displayPrice);

  /* Atribute de marketplace: brandul si EAN-ul stau in `page_sections.google`,
     nu in coloane, si pana acum nu se vedeau nicaieri pe magazin. */
  const brand = (pageSections.google?.brand ?? "").trim();
  const ean = (pageSections.google?.gtin ?? "").trim();
  const etichete = useMemo(
    () => (Array.isArray(product.tags) ? product.tags.map(String).map((t) => t.trim()).filter(Boolean) : []),
    [product.tags],
  );

  const [activeSlide, setActiveSlide] = useState(0);

  /**
   * Alegerea unei valori duce galeria inapoi la prima imagine.
   *
   * Imaginea combinatiei trece pe pozitia 0, deci fara asta galeria ar ramane pe
   * cadrul vechi si alegerea culorii ar parea ca n-a facut nimic. Resetul sta in
   * actiune, nu intr-un efect pe `variantImage`: efectul ar fi o randare in plus
   * dupa fiecare apasare, pentru un lucru pe care il stim deja cand se apasa.
   */
  function alegeValoare(optiune: string, valoare: string) {
    setSelectedOptions((prev) => ({ ...prev, [optiune]: valoare }));
    setActiveSlide(0);
  }
  const [modalOpen, setModalOpen] = useState(false);
  const [cantitate, setCantitate] = useState(1);
  /*
   * Cantitatea coboara singura cand treci pe o marime cu mai putine bucati.
   *
   * Alegi 8 dintr-o marime care are 10, treci pe una care are 3: butonul „+" se
   * blocheaza, dar 8 ramanea scris si comanda pleca doar ca sa fie respinsa de
   * server. Ajustarea se face IN TIMPUL randarii, nu intr-un efect, ca sa nu
   * existe niciun cadru in care scrie 8 langa „Doar 3 bucati ramase" (vezi
   * regula `set-state-in-effect` din proiect).
   */
  if (stocRamas !== null && stocRamas > 0 && cantitate > stocRamas) {
    setCantitate(stocRamas);
  }
  const [fila, setFila] = useState<FilaActiva>(hasLongDesc ? "descriere" : "specificatii");
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const fileRef = useRef<HTMLDivElement | null>(null);
  const [adaugat, setAdaugat] = useState(false);
  const [fbtOffer, setFbtOffer] = useState<{ id: string; items: { product_id: string; name: string; imageUrl: string | null; price: number; quantity: number }[] } | undefined>(undefined);

  const cos = useCartOptional();
  const chrome = useStoreChromeOptional();
  // In magazinul cu un singur produs cosul e ascuns peste tot: fara header, fara
  // sertar, fara pagina. Un buton „Adauga in cos" ar confirma o actiune care nu
  // duce nicaieri. In miniatura din catalog nu exista chrome, dar butonul
  // trebuie sa se vada — el e jumatate din designul ales.
  const arataButonCos = setari.showAddToCart !== false && (demo || chrome?.cartMode !== "hidden");
  const miniaturiInStanga = setari.galleryThumbs !== "bottom";
  const arataDetalii = setari.showDetails !== false;
  const arataRezumatSpec = setari.showSpecsSummary !== false;
  const cateSpecificatii = Number(setari.specsCount) > 0 ? Number(setari.specsCount) : SPECIFICATII_LANGA_GALERIE;
  const arataTrepte = setari.showTiers !== false;
  const arataContact = setari.showContact !== false;
  // Liniile purtate in comanda: tot cosul in afara produsului curent, care se
  // comanda separat, cu cantitatea din formular.
  const cartItems = useMemo(
    () => (demo || !cos ? [] : cos.items.filter((i) => i.productId !== product.id)),
    [demo, cos, product.id],
  );

  const mergiLa = useCallback((i: number) => {
    setActiveSlide((prev) => {
      const n = slides.length;
      if (n === 0) return prev;
      return ((i % n) + n) % n;
    });
  }, [slides.length]);

  function adaugaInCos() {
    if (demo || !cos || isOutOfStock || needsVariant) return;
    const imagine = selectedCombo?.image || slides[0] || null;
    cos.addItem({
      productId: product.id,
      slug: product.slug ?? undefined,
      // Numele ramane SIMPLU, combinatia sta in `variantTitle`: asa cheia de
      // linie iese identica cu cea din grila si acelasi produs creste in
      // cantitate in loc sa se dubleze.
      name: product.name,
      price: displayPrice,
      imageUrl: imagine,
      variantTitle: selectedComboTitle ?? undefined,
      variantSku: selectedCombo?.sku || undefined,
    }, cantitate);
    trackAddToCart({ productId: product.id, name: product.name, price: displayPrice, cantitate });
    setAdaugat(true);
    setTimeout(() => setAdaugat(false), 1800);
  }

  function addOfferProductToCart(p: OfferProduct) {
    if (demo || !cos) return;
    cos.addItem({
      productId: p.id,
      // Fara slug, linia din cos nu mai are link catre pagina produsului.
      slug: p.slug ?? undefined,
      name: p.name,
      price: Number(p.price),
      imageUrl: p.imageUrl,
    });
    trackAddToCart({ productId: p.id, name: p.name, price: Number(p.price) });
  }

  function handleBuyTogether(offer: ResolvedOffer) {
    if (!offer.pricing) return;
    const distributed = distributeFbtSavings(offer.products.map((p) => p.price), offer.pricing.savings, displayPrice);
    setFbtOffer({
      id: offer.id,
      items: offer.products.map((p, idx) => ({
        product_id: p.id, name: p.name, imageUrl: p.imageUrl, price: distributed[idx], quantity: 1,
      })),
    });
    setModalOpen(true);
  }

  /* Estimarea de livrare, ancorata in fusul de la Bucuresti ca sa nu difere
     intre server si browser. */
  const dateLivrare = useMemo(() => {
    if (!deliveryEstimate?.enabled) return null;
    const fmt = (zile: number) => {
      const d = new Date();
      d.setDate(d.getDate() + zile);
      return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", timeZone: "Europe/Bucharest" });
    };
    return { de: fmt(deliveryEstimate.min_days), pana: fmt(deliveryEstimate.max_days) };
  }, [deliveryEstimate]);

  /*
   * Radacina catalogului, nu a magazinului: firimiturile si linkurile de
   * categorie duc la produse, iar produsele nu stau neaparat la radacina.
   *
   * Miniatura din catalogul de design-uri randeaza pagina fara chrome, deci
   * acolo se cade pe valoarea derivata din `basePath` — exact cea de dinainte.
   */
  const radacinaCatalog = chrome?.catalogRoot ?? radacinaMagazin(basePath);

  // Catalogul isi tine pagina curenta in sessionStorage tocmai ca intoarcerea
  // de pe pagina de produs sa nu arunce clientul inapoi la pagina 1.
  function laMagazin(e: React.MouseEvent) {
    try {
      const p = sessionStorage.getItem(`store_page_${business.slug}`);
      if (p && Number(p) > 1) { e.preventDefault(); window.location.href = `${radacinaCatalog}?page=${p}`; }
    } catch {}
  }

  const categorie = (product.category ?? "").trim();
  const codProdus = (selectedCombo?.sku || product.sku || "").trim();
  // Blocul de detalii se randeaza doar daca are macar un rand de aratat: un
  // chenar cu titlu si nimic dedesubt arata a eroare, nu a informatie.
  const areDetalii = !!dateLivrare || codProdus !== "" || ean !== "" || categorie !== ""
    || etichete.length > 0 || !!product.weight_grams;

  const insigneIncredere = [
    { icon: Truck, text: "Livrare rapida" },
    { icon: RotateCcw, text: "Retur in 14 zile" },
    { icon: ShieldCheck, text: "Plata securizata" },
  ];

  const file: { id: FilaActiva; eticheta: string; areContinut: boolean }[] = [
    { id: "descriere", eticheta: "Descriere", areContinut: hasLongDesc },
    { id: "specificatii", eticheta: "Specificatii", areContinut: specifications.length > 0 },
    { id: "intrebari", eticheta: "Intrebari frecvente", areContinut: !!faqSection?.enabled && (faqSection.items?.length ?? 0) > 0 },
  ];
  const fileVizibile = file.filter((f) => f.areContinut);
  const filaCurenta = fileVizibile.some((f) => f.id === fila) ? fila : fileVizibile[0]?.id;

  return (
    <>
      {/* ─── Firimituri ─────────────────────────────────────────────────── */}
      {!isHome && setari.showBreadcrumb !== false && (
        <nav aria-label="Firimituri" className="max-w-6xl mx-auto px-4 lg:px-6 pt-4 pb-1">
          <ol className="flex items-center gap-1.5 text-[13px] text-muted-foreground overflow-x-auto">
            <li className="shrink-0">
              <a href={radacinaCatalog} onClick={laMagazin}
                className="hover:text-foreground transition-colors">Magazin</a>
            </li>
            {categorie !== "" && (
              <>
                <li aria-hidden="true" className="shrink-0"><ChevronRight size={13} /></li>
                <li className="shrink-0">
                  <a href={hrefCategorie(radacinaCatalog, categorie, chrome?.categoriiPePagina)} className="hover:text-foreground transition-colors">{categorie}</a>
                </li>
              </>
            )}
            <li aria-hidden="true" className="shrink-0"><ChevronRight size={13} /></li>
            <li className="text-foreground font-medium truncate">{product.name}</li>
          </ol>
        </nav>
      )}

      {/* ─── Galerie + coloana de cumparare ─────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 lg:px-6 pt-3 pb-8 lg:pt-5 lg:pb-14">
        {/* Doua randuri pe desktop: galeria sus-stanga, datele sub ea, iar
            coloana de cumparare intinsa peste amandoua. Pe telefon grila are o
            singura coloana si totul curge in ordinea din marcaj. */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-6 lg:items-start">
          <div className="lg:col-start-1 lg:row-start-1">
            <Galerie slides={slides} activ={activeSlide} mergiLa={mergiLa} imgAlt={imgAlt}
              hasDiscount={!!hasDiscount} discountPct={discountPct} color={color}
              miniaturiInStanga={miniaturiInStanga} />
          </div>

          <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 flex flex-col gap-4">
            <h1 className="text-[26px] lg:text-[32px] font-normal text-foreground leading-tight tracking-tight">
              {product.name}
            </h1>

            {brand !== "" && (
              <p className="text-[13px] text-muted-foreground -mt-2">
                Brand: <span className="font-semibold" style={{ color }}>{brand}</span>
              </p>
            )}

            {hasShortDesc && (
              <div className="policy-content text-sm text-muted-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: shortDesc }} />
            )}

            {showSocialProof && <div><SocialProof count={viewerCount} color={color} /></div>}

            <hr className="border-border" />

            {/* Pret */}
            <div className="flex items-end gap-3 flex-wrap">
              {showPriceRange ? (
                <span className="text-[32px] font-semibold text-foreground tabular-nums leading-none">
                  {formatPriceRange(priceRange.min, priceRange.max, priceLowestOnly)}
                </span>
              ) : (
                <>
                  <span className="text-[32px] font-semibold text-foreground tabular-nums leading-none">{formatPrice(displayPrice)}</span>
                  {hasDiscount && (
                    <span className="text-lg text-muted-foreground line-through mb-0.5">{formatPrice(displayComparePrice!)}</span>
                  )}
                </>
              )}
              {eticheta && (
                <span className="text-sm text-muted-foreground mb-0.5">({eticheta})</span>
              )}
            </div>

            {/*
              Eticheta a fost mutata LANGA pret (mai sus, in randul pretului):
              ca rand separat sub el, se citea ca o nota de subsol si se pierdea.
              Aici a ramas doar comutatorul care o stinge.
            */}

            {/* Variante */}
            {variantsData && (
              <div className="flex flex-col gap-4 pt-1">
                {variantsData.options.map((optiune) => (
                  <div key={optiune.id ?? optiune.name}>
                    <p className="text-[13px] text-muted-foreground mb-2">
                      {optiune.name}:{" "}
                      {selectedOptions[optiune.name]
                        ? <span className="text-foreground font-medium">{selectedOptions[optiune.name]}</span>
                        : <span className="italic">alege</span>}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {optiune.values.map((valoare) => {
                        const ales = selectedOptions[optiune.name] === valoare;
                        const disponibil = isValueAvailable(variantsData, selectedOptions, optiune.name, valoare);
                        const poza = pozeOptiuni.get(optiune.name)?.get(valoare);
                        const alege = () => alegeValoare(optiune.name, valoare);

                        // Optiunea care poarta fotografii se alege din fotografii,
                        // ca in model: culoarea se vede, nu se citeste.
                        if (poza) return (
                          <button key={valoare} type="button" disabled={!disponibil}
                            aria-pressed={ales} aria-label={valoare} title={valoare} onClick={alege}
                            className="relative w-16 h-16 rounded-md overflow-hidden bg-muted/20 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{ border: `2px solid ${ales ? color : "var(--color-border)"}` }}>
                            <Image src={poza} alt="" fill sizes="64px" className="object-contain p-1" />
                          </button>
                        );

                        return (
                          <button key={valoare} type="button" disabled={!disponibil}
                            aria-pressed={ales} onClick={alege}
                            className="min-w-[76px] px-4 py-2.5 rounded-md border text-sm font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:line-through"
                            style={ales
                              ? { borderColor: color, color, backgroundColor: `${color}0F` }
                              : { borderColor: "var(--color-border)" }}>
                            {valoare}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {Object.keys(selectedOptions).length > 0 && (
                  <button type="button" onClick={() => { setSelectedOptions({}); setActiveSlide(0); }}
                    className="self-start text-[13px] text-muted-foreground underline hover:text-foreground transition-colors">
                    Sterge selectia
                  </button>
                )}
              </div>
            )}

            {/* Stoc */}
            <div className="text-sm">
              {isOutOfStock ? (
                <span className="font-medium text-muted-foreground">Stoc epuizat</span>
              ) : isPreorder ? (
                <span className="font-medium" style={{ color }}>Disponibil la precomanda</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-medium" style={{ color }}>
                  <Check size={15} />
                  {stocRamas === null || stocRamas <= 0 || stocRamas > 10
                    ? "In stoc"
                    : stocRamas === 1
                      ? "Ultima bucata in stoc"
                      : `Ultimele ${stocRamas} bucati in stoc`}
                </span>
              )}
            </div>

            {combinatieIndisponibila && (
              <p role="status" className="text-sm text-muted-foreground">
                Aceasta combinatie nu este disponibila.
              </p>
            )}

            {/* Cantitate + cele doua actiuni */}
            <div className="flex flex-col gap-2.5 pt-1">
              <div className="flex items-stretch gap-2.5">
                <Stepper valoare={cantitate} seteaza={setCantitate}
                  maxim={stocRamas !== null && stocRamas > 0 ? stocRamas : null} />
                {arataButonCos && (
                  <button type="button" onClick={adaugaInCos}
                    disabled={isOutOfStock || needsVariant || (!demo && !cos)}
                    className="flex-1 min-w-0 h-12 px-4 rounded-md font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
                    style={{ backgroundColor: color }}>
                    {adaugat ? <Check size={17} /> : <ShoppingCart size={17} />}
                    <span className="truncate">{adaugat ? "Adaugat in cos" : "Adauga in cos"}</span>
                  </button>
                )}
              </div>

              {/* Perechea din model: cosul poarta culoarea magazinului, comanda
                  directa e neagra. Butonul comun ii da si efectele alese de
                  comerciant, doar forma difera. */}
              <CTAButton color={NEGRU} isOutOfStock={isOutOfStock} isPreorder={isPreorder}
                needsVariant={needsVariant} hasCardPayment={hasCardPayment} effect={buttonEffect}
                onClick={() => { setFbtOffer(undefined); setModalOpen(true); }}
                clase="w-full h-12 text-sm font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
                eticheta={
                  <>
                    <CreditCard size={18} />
                    {isOutOfStock ? "Stoc epuizat"
                      : needsVariant ? "Selecteaza optiunile"
                      : isPreorder ? "Precomanda acum"
                      : "Comanda acum"}
                  </>
                } />
              <p aria-live="polite" className="sr-only">{adaugat ? "Produsul a fost adaugat in cos" : ""}</p>
            </div>

            {/* Trepte de cantitate: existau in date, dar se vedeau abia in
                formularul de comanda — adica dupa ce clientul decisese cate ia.
                Preturile de treapta le onoreaza doar comanda directa, deci
                fiecare rand duce acolo, cu numarul lui de bucati: altfel ar sta
                langa un buton de cos care le ignora. */}
            {arataTrepte && quantityTiers && quantityTiers.length > 1 && (
              <div className="rounded-md border border-border overflow-hidden mt-1">
                <p className="px-4 py-2.5 text-sm font-semibold text-foreground bg-muted/40 border-b border-border">
                  Cumperi mai multe, platesti mai putin
                </p>
                <ul>
                  {quantityTiers.slice(1).map((treapta) => (
                    <li key={treapta.qty} className="border-b border-border last:border-0">
                      <button type="button" disabled={isOutOfStock || needsVariant}
                        onClick={() => { setCantitate(treapta.qty); setFbtOffer(undefined); setModalOpen(true); }}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        <span className="text-sm text-foreground">
                          <span className="font-semibold">{treapta.qty} bucati</span>
                          {treapta.badge ? <span className="text-muted-foreground"> · {treapta.badge}</span> : null}
                        </span>
                        <span className="text-sm font-bold shrink-0" style={{ color }}>{formatPrice(treapta.price)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Intrebari: telefonul si WhatsApp-ul magazinului, cand exista */}
            {arataContact && (business.phone || business.whatsapp) && (
              <div className="flex items-center gap-4 flex-wrap text-[13px] pt-1">
                <span className="text-muted-foreground">Ai intrebari despre produs?</span>
                {business.phone && (
                  <a href={`tel:${business.phone}`} className="inline-flex items-center gap-1.5 font-medium hover:opacity-70 transition-opacity" style={{ color }}>
                    <Phone size={14} /> {business.phone}
                  </a>
                )}
                {business.whatsapp && (
                  <a href={`https://wa.me/${String(business.whatsapp).replace(/[^0-9]/g, "")}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium hover:opacity-70 transition-opacity" style={{ color }}>
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>

          {/*
            Datele produsului stau SUB galerie pe desktop, nu in coloana de
            cumparare: coloana aceea e de doua ori mai inalta decat o imagine
            patrata, deci sub galerie ramanea un gol cat jumatate din ecran.
            Aici e un singur bloc, asezat din grila (`row-start-2`), nu doua
            copii ascunse pe rand — pe telefon coloana e una singura si blocul
            cade oricum dupa butoane, unde ii e locul.
          */}
          <div className="lg:col-start-1 lg:row-start-2 flex flex-col gap-4">
            {/* Un magazin poate sa nu fi completat niciunul dintre randuri: un
                chenar cu titlu si nimic sub el arata a eroare, nu a informatie. */}
            {arataDetalii && areDetalii && (
            <div className="rounded-md border border-border divide-y divide-border">
              <p className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-foreground bg-muted/40">
                Detalii produs
              </p>
              <div className="flex flex-col gap-2 px-4 py-3.5">
                {dateLivrare && (
                  <RandMeta eticheta={deliveryEstimate?.text || "Livrare estimata"}>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={13} className="text-muted-foreground" />
                      {dateLivrare.de} - {dateLivrare.pana}
                    </span>
                  </RandMeta>
                )}
                {codProdus !== "" && <RandMeta eticheta="Cod produs">{codProdus}</RandMeta>}
                {ean !== "" && <RandMeta eticheta="Cod EAN">{ean}</RandMeta>}
                {categorie !== "" && (
                  <RandMeta eticheta="Categorie">
                    <a href={hrefCategorie(radacinaCatalog, categorie, chrome?.categoriiPePagina)} className="underline hover:opacity-70 transition-opacity">{categorie}</a>
                  </RandMeta>
                )}
                {etichete.length > 0 && <RandMeta eticheta="Etichete">{etichete.join(", ")}</RandMeta>}
                {product.weight_grams ? <RandMeta eticheta="Greutate">{product.weight_grams} g</RandMeta> : null}
              </div>
            </div>
            )}

            {/* Primele specificatii urca aici, langa imagine: pe o pagina care
                se lauda ca e „detaliata", tabelul complet nu poate incepe abia
                dupa doua ecrane de derulare. */}
            {arataRezumatSpec && specifications.length > 0 && (
              <div className="rounded-md border border-border divide-y divide-border">
                <p className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-foreground bg-muted/40">
                  Pe scurt
                </p>
                <dl className="flex flex-col gap-2 px-4 py-3.5">
                  {specifications.slice(0, cateSpecificatii).map((spec, i) => (
                    <div key={`${spec.label}-${i}`} className="flex flex-col sm:flex-row gap-0.5 sm:gap-3 text-[13px]">
                      <dt className="sm:w-36 sm:shrink-0 text-muted-foreground">{spec.label}</dt>
                      <dd className="text-foreground font-medium min-w-0">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
                {specifications.length > SPECIFICATII_LANGA_GALERIE && (
                  <button type="button" onClick={() => { setFila("specificatii"); fileRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                    className="w-full px-4 py-2.5 text-[13px] font-semibold text-left hover:bg-muted/30 transition-colors" style={{ color }}>
                    Vezi toate specificatiile
                  </button>
                )}
              </div>
            )}

            {trustBadgesEnabled && (
              <ul className="rounded-md border border-border divide-y divide-border">
                {insigneIncredere.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-muted-foreground">
                    <Icon size={15} style={{ color }} />
                    {text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Miniatura din catalog se opreste aici: restul paginii trece de 3000 px
          si, micsorata intr-un card, ar deveni o banda ilizibila. */}
      {demo ? null : (
        <>
          {/* ─── File ────────────────────────────────────────────────────── */}
          {fileVizibile.length > 0 && (
            <div ref={fileRef} className="max-w-6xl mx-auto px-4 lg:px-6 pb-12 scroll-mt-24">
              <div className="border-b border-border flex gap-6 overflow-x-auto">
                {fileVizibile.map((f) => (
                  <button key={f.id} type="button" onClick={() => setFila(f.id)}
                    aria-current={filaCurenta === f.id}
                    className="shrink-0 pb-3 text-xs font-bold uppercase tracking-widest border-b-2 -mb-px transition-colors"
                    style={filaCurenta === f.id
                      ? { borderColor: color, color: "var(--color-foreground)" }
                      : { borderColor: "transparent", color: "var(--color-muted-foreground)" }}>
                    {f.eticheta}
                  </button>
                ))}
              </div>

              {/*
                Filele ascunse raman in HTML, ascunse cu `hidden`, nu scoase din
                el. Randate conditionat, specificatiile si intrebarile frecvente
                nu ajungeau deloc in pagina servita: Google vedea o pagina de
                produs fara niciun detaliu, tocmai la varianta care se numeste
                „Detaliat".
              */}
              <div className="pt-6">
                {hasLongDesc && (
                  <div hidden={filaCurenta !== "descriere"}
                    className="policy-content text-muted-foreground leading-relaxed text-sm max-w-3xl"
                    dangerouslySetInnerHTML={{ __html: product.description! }} />
                )}

                {specifications.length > 0 && (
                  <dl hidden={filaCurenta !== "specificatii"} className="max-w-3xl divide-y divide-border">
                    {specifications.map((spec, i) => (
                      <div key={`${spec.label}-${i}`} className="flex flex-col sm:flex-row gap-1 sm:gap-4 py-2.5 text-sm">
                        <dt className="sm:w-40 sm:shrink-0 text-muted-foreground">{spec.label}</dt>
                        <dd className="text-foreground font-medium min-w-0">{spec.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {faqSection?.enabled && (
                  <div hidden={filaCurenta !== "intrebari"} className="max-w-3xl">
                    {(faqSection.items ?? []).map((faq, i) => (
                      <FAQItem key={i} faq={faq} isOpen={faqOpen === i}
                        onToggle={() => setFaqOpen(faqOpen === i ? null : i)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Continutul pachetului ───────────────────────────────────── */}
          {product.is_bundle && bundleComponents.length > 0 && (
            <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-12">
              <h2 className="text-lg font-bold text-foreground mb-4">Pachetul conține</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bundleComponents.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                    <div className="relative w-14 h-14 shrink-0 rounded-md overflow-hidden bg-muted/20">
                      {c.image_url
                        ? <Image src={c.image_url} alt={c.name} fill sizes="56px" className="object-contain p-1" />
                        : <Package size={20} className="text-muted-foreground/40 absolute inset-0 m-auto" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.quantity} buc.</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ─── Merge bine cu ───────────────────────────────────────────── */}
          {productOffers.length > 0 && (
            <ProductOffers offers={productOffers} basePath={basePath} color={color}
              anchor={{ name: product.name, price: displayPrice, imageUrl: slides[0] ?? null }}
              ancoraIndisponibila={isOutOfStock ? { motiv: "Stoc epuizat" } : needsVariant ? { motiv: "Selecteaza optiunile" } : null}
              onBuyTogether={handleBuyTogether} onAddToCart={addOfferProductToCart} />
          )}

          {/* ─── Beneficii ───────────────────────────────────────────────── */}
          {benefitsSection?.enabled && (benefitsSection.items?.length ?? 0) > 0 && (
            <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-12">
              <h2 className="text-lg font-bold text-foreground mb-4">{benefitsSection.title}</h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {benefitsSection.items.map((b, i) => (
                  <li key={i} className="rounded-md border border-border p-4">
                    <p className="font-semibold text-foreground text-sm mb-1">{b.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ─── Cum functioneaza ────────────────────────────────────────── */}
          {howItWorksSection?.enabled && (howItWorksSection.steps?.length ?? 0) > 0 && (
            <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-12">
              <h2 className="text-lg font-bold text-foreground mb-4">{howItWorksSection.title}</h2>
              <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {howItWorksSection.steps.map((s, i) => (
                  <li key={i} className="rounded-md border border-border p-4">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white mb-2"
                      style={{ backgroundColor: color }}>{i + 1}</span>
                    <p className="font-semibold text-foreground text-sm mb-1">{s.title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* ─── Bara lipita jos, pe telefon ─────────────────────────────── */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border px-4 py-3 flex items-center gap-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground truncate">{product.name}</p>
              <p className="text-base font-bold text-foreground">
                {showPriceRange
                  ? formatPriceRange(priceRange.min, priceRange.max, priceLowestOnly)
                  : formatPrice(displayPrice)}
              </p>
            </div>
            {arataButonCos && (
              <button type="button" onClick={adaugaInCos}
                disabled={isOutOfStock || needsVariant || (!demo && !cos)}
                aria-label={adaugat ? "Adaugat in cos" : "Adauga in cos"}
                className="w-12 h-12 shrink-0 rounded-md flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
                style={{ backgroundColor: color }}>
                {adaugat ? <Check size={18} /> : <ShoppingCart size={18} />}
              </button>
            )}
            <button type="button" onClick={() => { setFbtOffer(undefined); setModalOpen(true); }}
              disabled={isOutOfStock || needsVariant}
              className="shrink-0 px-5 h-12 rounded-md text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-90"
              style={{ backgroundColor: NEGRU }}>
              {isOutOfStock ? "Epuizat" : isPreorder ? "Precomanda" : "Comanda"}
            </button>
          </div>

          <OrderModal
            open={modalOpen}
            onClose={() => { setModalOpen(false); setFbtOffer(undefined); }}
            product={{
              id: product.id,
              name: selectedComboTitle ? `${product.name} (${selectedComboTitle})` : product.name,
              price: displayPrice,
              compare_at_price: displayComparePrice,
              images: slides,
              variantTitle: selectedComboTitle ?? undefined,
            }}
            business={{ id: business.id, slug: business.slug, basePath, primary_color: color }}
            shippingCost={shippingCost}
            freeShippingThreshold={freeShippingThreshold}
            minOrderAmount={minOrderAmount}
            tiers={quantityTiers}
            initialQuantity={cantitate}
            customizationFields={pageSections.customization?.enabled ? pageSections.customization.fields : undefined}
            cartItems={cartItems}
            onCartConsumed={(liniiComandate) => {
              // Doar liniile purtate in comanda ies din cos. Produsul curent nu
              // e printre ele (se comanda separat, cu cantitatea din formular),
              // deci linia lui, daca exista, ramane vizibila in loc sa dispara.
              if (!cos) return;
              cos.restoreCart(cosDupaComanda(cos.items, liniiComandate));
            }}
            onCartLineChange={(key, qty) => {
              // Sectiunea „Din cosul tau" arata cosul real, deci editarea din
              // formular il modifica pe el, nu doar afisajul.
              if (demo || !cos) return;
              if (qty <= 0) cos.removeItem(key);
              else cos.updateQty(key, qty);
            }}
            fbtOffer={fbtOffer}
          />
        </>
      )}
    </>
  );
}
