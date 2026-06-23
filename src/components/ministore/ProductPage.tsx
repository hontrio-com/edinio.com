"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, ShieldCheck, Truck, RotateCcw,
  Star, ShoppingBag, ArrowLeft, Package, Plus, Minus, Eye, Calendar, Globe,
} from "lucide-react";
import { formatPrice, formatPriceRange } from "@/lib/utils/format";
import { cdnImage } from "@/lib/cdn-image";
import { getProductPriceRange } from "@/lib/utils/product-price";
import { OrderModal } from "./OrderModal";
import type { QuantityTier } from "./OrderModal";
import { NetopiaBadge } from "./NetopiaBadge";
import { EdinioCredit } from "./EdinioCredit";
import type { Database } from "@/types/database.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];
type StoreSettings = Database["public"]["Tables"]["store_settings"]["Row"];

/* ─── Page content types ──────────────────────────────────────────────────── */

interface TrustBadge { icon: string; title: string; desc: string; }
interface BenefitItem { title: string; desc: string; }
interface HowItWorksStep { title: string; desc: string; }
interface FaqItem { q: string; a: string; }
interface SpecItem { label: string; value: string; }

interface PageContent {
  announcement_bar?: { enabled: boolean; text: string; bg_color: string; speed?: number; };
  trust_badges_enabled?: boolean;
  trust_badges?: TrustBadge[];
  benefits_section?: { enabled: boolean; title: string; items: BenefitItem[]; };
  how_it_works_section?: { enabled: boolean; title: string; steps: HowItWorksStep[]; };
  faq_section?: { enabled: boolean; title: string; items: FaqItem[]; };
  image_zoom?: { enabled: boolean };
  delivery_estimate?: { enabled: boolean; min_days: number; max_days: number; text?: string };
  price_range_display?: { enabled: boolean };
  button_effect?: string;
  show_social_proof?: boolean;
  show_quality_badge?: boolean;
  footer_logo_size?: number;
  checkout_config?: {
    custom_fields?: Array<{ id: string; label: string; type: "text" | "textarea" | "select" | "checkbox"; options?: string; required: boolean; placeholder?: string; }>;
    extras?: Array<{ id: string; label: string; price: number; description?: string; }>;
  };
}

interface VariantCombo {
  id: string;
  title: string;
  price: string;
  compare_at_price: string;
  sku: string;
  stock_quantity: string;
  image: string;
  enabled: boolean;
}

interface CustomizationFieldDef {
  id: string;
  type: "text" | "textarea" | "image" | "select" | "color";
  label: string;
  placeholder?: string;
  required: boolean;
  max_length?: number;
  max_files?: number;
  max_file_size_mb?: number;
  options?: string[];
  default_color?: string;
  helper_text?: string;
}

interface PageSections {
  short_description?: string;
  specifications?: SpecItem[];
  quantity_tiers?: {
    enabled: boolean;
    mode?: "fixed" | "percent";
    tier2_price: number;
    tier2_percent?: number;
    tier2_badge: string;
    tier3_price: number;
    tier3_percent?: number;
    tier3_badge: string;
  };
  stock_status?: "in_stock" | "out_of_stock" | "preorder";
  dimensions?: { length: number; width: number; height: number };
  variants?: {
    enabled: boolean;
    options: { id: string; name: string; values: string[] }[];
    combinations: VariantCombo[];
  };
  customization?: {
    enabled: boolean;
    fields: CustomizationFieldDef[];
  };
}

/* ─── Default content ─────────────────────────────────────────────────────── */

/* ─── Sub-components ──────────────────────────────────────────────────────── */

function SocialProof({ count }: { count: number }) {
  return (
    <div className="inline-flex items-center gap-2 bg-white border border-gray-100 shadow-sm rounded-full px-4 py-2 text-sm">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
      <Eye size={14} className="text-gray-500" />
      <span className="font-medium text-gray-700">
        <span className="text-gray-900 font-bold">{count}</span> persoane se uita acum
      </span>
    </div>
  );
}

function FAQItem({ faq, isOpen, onToggle }: { faq: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button type="button" onClick={onToggle} aria-expanded={isOpen}
        className="w-full flex items-start gap-4 py-5 text-left hover:text-gray-700 transition-colors">
        <span className="mt-0.5 shrink-0 w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center">
          {isOpen ? <Minus size={12} className="text-gray-900" /> : <Plus size={12} className="text-gray-500" />}
        </span>
        <span className="font-semibold text-gray-900 text-base pr-4">{faq.q}</span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden">
            <p className="text-gray-500 text-sm leading-relaxed pb-5 pl-10 pr-4">{faq.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── CTA Button with effects ─────────────────────────────────────────────── */

const BTN_CLS = "w-full py-4 text-base font-bold text-white rounded-xl hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 uppercase tracking-wide";

function CTAButton({ color, isOutOfStock, isPreorder, needsVariant, hasCardPayment, effect, onClick }: {
  color: string; isOutOfStock: boolean; isPreorder: boolean; needsVariant: boolean; hasCardPayment: boolean; effect: string; onClick: () => void;
}) {
  // Drop the "- Plata la livrare" suffix when card payment is available.
  const codSuffix = hasCardPayment ? "" : " - Plata la livrare";
  const label = (
    <>
      <ShoppingBag size={18} />
      {isOutOfStock ? "Stoc epuizat"
        : needsVariant ? "Selecteaza optiunile"
        : isPreorder ? `Precomanda${codSuffix}`
        : `Comanda acum${codSuffix}`}
    </>
  );
  const base = { backgroundColor: color, boxShadow: `0px 4px 16px ${color}55` };

  const disabled = isOutOfStock || needsVariant;

  if (effect === "pulse") return (
    <div className="relative">
      <motion.div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{ backgroundColor: color }}
        animate={{ opacity: [0.7, 0], scale: [1, 1.15] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
      />
      <button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS} style={base}>{label}</button>
    </div>
  );

  if (effect === "shake") return (
    <motion.button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS} style={base}
      animate={{ x: [0, -5, 5, -5, 5, 0] }}
      transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}>
      {label}
    </motion.button>
  );

  if (effect === "bounce") return (
    <motion.button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS} style={base}
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}>
      {label}
    </motion.button>
  );

  if (effect === "glow") return (
    <motion.button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS}
      style={{ backgroundColor: color }}
      animate={{ boxShadow: [`0px 4px 16px ${color}44`, `0px 4px 36px ${color}CC`, `0px 4px 16px ${color}44`] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}>
      {label}
    </motion.button>
  );

  if (effect === "heartbeat") return (
    <motion.button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS} style={base}
      animate={{ scale: [1, 1.06, 1, 1.06, 1] }}
      transition={{ duration: 1, repeat: Infinity, repeatDelay: 1.5 }}>
      {label}
    </motion.button>
  );

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={BTN_CLS + " transition-all"} style={base}>
      {label}
    </button>
  );
}

interface Social { facebook?: string; instagram?: string; tiktok?: string; youtube?: string; website?: string; }

const POLICY_LINKS = [
  { slug: "termeni", label: "Termeni si conditii" },
  { slug: "livrare", label: "Politica de livrare" },
  { slug: "retur", label: "Politica de retur" },
  { slug: "confidentialitate", label: "Politica de confidentialitate" },
  { slug: "gdpr", label: "GDPR" },
  { slug: "anulare", label: "Politica de anulare" },
] as const;

/* ─── Main component ──────────────────────────────────────────────────────── */

export function ProductPage({ business, product, storeSettings, basePath: basePathProp, hasCardPayment = false, bundleComponents = [], altMap = {} }: {
  business: Business;
  product: Product;
  storeSettings: StoreSettings | null;
  basePath?: string;
  hasCardPayment?: boolean;
  bundleComponents?: { id: string; name: string; slug: string | null; price: number; image_url: string | null; quantity: number; out_of_stock: boolean }[];
  altMap?: Record<string, string>;
}) {
  const basePath = basePathProp ?? `/${business.slug}`;
  const images = Array.isArray(product.images) ? product.images.map(String).filter(Boolean) : [];
  // SEO alt text from the Media Library, falling back to the product name.
  const imgAlt = (src: string, i: number) => altMap[src] || `${product.name} ${i + 1}`;

  const color = business.primary_color ?? "#1AB554";
  const social = (business.social as Social) ?? {};

  const shippingCost = Number(storeSettings?.default_shipping_cost ?? 20);
  const freeShippingThreshold = storeSettings?.free_shipping_threshold
    ? Number(storeSettings.free_shipping_threshold) : null;
  const minOrderAmount = storeSettings?.min_order_amount
    ? Number(storeSettings.min_order_amount) : null;

  const pageContent = (storeSettings?.page_content as PageContent) ?? {};
  const pageSections = (product.page_sections as PageSections) ?? {};

  // Short description = blurb under the title; long description = "Descriere" section.
  const shortDesc = (pageSections.short_description ?? "").trim();
  const hasShortDesc = shortDesc !== "" && shortDesc !== "<p></p>";
  const hasLongDesc = !!product.description && product.description !== "<p></p>";
  const topBlurb = hasShortDesc ? shortDesc : (hasLongDesc ? product.description : null);

  const announcementBar = pageContent.announcement_bar;
  const trustBadgesEnabled = pageContent.trust_badges_enabled !== false;
  const benefitsSection = pageContent.benefits_section;
  const howItWorksSection = pageContent.how_it_works_section;
  const faqSection = pageContent.faq_section;
  const buttonEffect = pageContent.button_effect ?? "none";
  const imageZoomEnabled = pageContent.image_zoom?.enabled !== false;
  const deliveryEstimate = pageContent.delivery_estimate;
  const viewerCount = useRef(18 + Math.floor(Math.random() * 10)).current;
  const showSocialProof = pageContent.show_social_proof === true; // fake live-viewers counter — off unless enabled
  const showQualityBadge = pageContent.show_quality_badge !== false; // "Calitate verificata" badge — on unless removed

  // Variants
  const variantsData = pageSections.variants?.enabled ? pageSections.variants : null;
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  const selectedComboTitle = useMemo(() => {
    if (!variantsData) return null;
    const parts = variantsData.options.map(o => selectedOptions[o.name] ?? "");
    if (parts.some(p => !p)) return null;
    return parts.join(" / ");
  }, [variantsData, selectedOptions]);

  const selectedCombo = useMemo(() => {
    if (!variantsData || !selectedComboTitle) return null;
    return variantsData.combinations.find(c => c.title === selectedComboTitle && c.enabled) ?? null;
  }, [variantsData, selectedComboTitle]);

  // Title reflects the selected variation(s) live (e.g. "Saltea - 80*180").
  const displayName = useMemo(() => {
    if (!variantsData) return product.name;
    const selected = variantsData.options.map(o => selectedOptions[o.name]).filter(Boolean);
    return selected.length > 0 ? `${product.name} - ${selected.join(" / ")}` : product.name;
  }, [variantsData, selectedOptions, product.name]);

  // Check if a variant value leads to any available combination
  function isValueAvailable(optionName: string, value: string): boolean {
    if (!variantsData) return true;
    const otherSels = Object.entries(selectedOptions)
      .filter(([k, v]) => k !== optionName && v)
      .map(([, v]) => v);
    return variantsData.combinations.some(c => {
      if (!c.enabled) return false;
      const parts = c.title.split(" / ");
      return parts.includes(value) && otherSels.every(s => parts.includes(s));
    });
  }

  // Display images — prepend variant image if available
  const displayImages = useMemo(() => {
    if (selectedCombo?.image) {
      return [selectedCombo.image, ...images.filter(img => img !== selectedCombo.image)];
    }
    return images;
  }, [selectedCombo?.image, images]);

  const slides = displayImages.length > 0 ? displayImages : [];

  // Price — use variant price if set
  const basePrice = Number(product.price);
  const displayPrice = selectedCombo?.price ? Number(selectedCombo.price) : basePrice;
  const displayComparePrice = selectedCombo?.compare_at_price
    ? Number(selectedCombo.compare_at_price)
    : product.compare_at_price ? Number(product.compare_at_price) : null;

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
  const needsVariant = !!variantsData && !selectedComboTitle;

  // Specifications — auto-append dimensions if present
  const dimensions = pageSections.dimensions;
  const specRows = pageSections.specifications ?? [];
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
  // Cart carried over from the storefront (localStorage) so ordering from a product
  // page includes what the customer already added. Current product excluded to avoid
  // duplication; read once on mount (storefront cart is built before reaching here).
  const [cartItems] = useState<{ productId: string; name: string; price: number; imageUrl: string | null; quantity: number }[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(`cart_${business.slug}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((i) => i?.productId && i.productId !== product.id) : [];
    } catch { return []; }
  });
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [zoomPos] = useState<{x: number; y: number} | null>(null);
  const touchStartX = useRef<number>(0);

  const deliveryDates = useMemo(() => {
    if (!deliveryEstimate?.enabled) return null;
    const now = new Date();
    const minDate = new Date(now);
    minDate.setDate(minDate.getDate() + (deliveryEstimate.min_days ?? 2));
    const maxDate = new Date(now);
    maxDate.setDate(maxDate.getDate() + (deliveryEstimate.max_days ?? 4));
    const fmt = (d: Date) => d.toLocaleDateString("ro-RO", { day: "numeric", month: "long" });
    return { min: fmt(minDate), max: fmt(maxDate) };
  }, [deliveryEstimate]);

  // Reset slide when variant image changes
  useEffect(() => { setActiveSlide(0); }, [selectedCombo?.image]);

  const goTo = useCallback((idx: number) => {
    setActiveSlide((idx + Math.max(slides.length, 1)) % Math.max(slides.length, 1));
  }, [slides.length]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(dx) > 40) goTo(activeSlide + (dx > 0 ? 1 : -1));
  };

  function Gallery({ mobile }: { mobile: boolean }) {
    return (
      <div className="relative w-full overflow-hidden rounded-2xl bg-gray-50 shadow-lg"
        style={{ aspectRatio: "1/1" }}
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {slides.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-20 w-20 text-gray-200" />
          </div>
        ) : mobile ? (
          <div className="flex h-full transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(-${activeSlide * 100}%)` }}>
            {slides.map((src, i) => (
              <div key={i} className="relative w-full h-full flex-shrink-0">
                <Image src={src} alt={imgAlt(src, i)} fill sizes="100vw"
                  className="object-contain p-2" priority={i === 0} />
              </div>
            ))}
          </div>
        ) : (
          slides.map((src, i) => (
            <div key={i} className="absolute inset-0 transition-opacity duration-700 overflow-hidden"
              style={{ opacity: i === activeSlide ? 1 : 0 }}>
              <Image src={src} alt={imgAlt(src, i)} fill sizes="50vw"
                className="object-contain p-2" priority={i === 0} />
            </div>
          ))
        )}

        {slides.length > 1 && (
          <>
            <button type="button" aria-label="Imaginea anterioara" onClick={e => { e.stopPropagation(); goTo(activeSlide - 1); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-md z-10 hover:bg-white transition-colors">
              <ChevronLeft size={16} className="text-gray-700" />
            </button>
            <button type="button" aria-label="Imaginea urmatoare" onClick={e => { e.stopPropagation(); goTo(activeSlide + 1); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-md z-10 hover:bg-white transition-colors">
              <ChevronRight size={16} className="text-gray-700" />
            </button>
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
              {slides.map((_, i) => (
                <button key={i} type="button" aria-label={`Imaginea ${i + 1}`} onClick={() => goTo(i)}
                  className="rounded-full transition-all duration-300"
                  style={i === activeSlide
                    ? { width: 24, height: 8, backgroundColor: color }
                    : { width: 8, height: 8, backgroundColor: "rgba(255,255,255,0.6)" }} />
              ))}
            </div>
            <div className="absolute top-3 left-3 bg-black/30 backdrop-blur-sm text-white text-[10px] font-medium px-2.5 py-1 rounded-full z-10">
              {activeSlide + 1} / {slides.length}
            </div>
          </>
        )}

        {hasDiscount && (
          <div className="absolute top-3 right-3 bg-amber-400 text-black text-xs font-black px-3 py-1.5 rounded-full shadow-md z-10">
            -{discountPct}%
          </div>
        )}
      </div>
    );
  }

  function Content({ mobile }: { mobile: boolean }) {
    return (
      <div className={`flex flex-col ${mobile ? "gap-3" : "gap-4"}`}>
        {/* Rating */}
        {showQualityBadge && (
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 w-fit">
            <div className="flex">{[1,2,3,4,5].map(i => <Star key={i} size={11} className="text-amber-400 fill-amber-400" />)}</div>
            <span className="text-[11px] font-semibold text-amber-800">Calitate verificata</span>
          </div>
        )}

        {/* Title */}
        <h1 className={`tracking-tight font-black text-gray-900 leading-tight ${mobile ? "text-2xl" : "text-3xl lg:text-4xl"}`}>
          {displayName}
        </h1>

        {topBlurb && (
          <div
            className={`policy-content text-gray-500 leading-relaxed ${mobile ? "text-sm" : "text-base"}`}
            // Sanitized server-side (see product route) before reaching the client.
            dangerouslySetInnerHTML={{ __html: topBlurb }}
          />
        )}

        {/* Price */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`tracking-tight font-black text-gray-900 ${mobile ? "text-3xl" : "text-4xl"}`}>
            {showPriceRange
              ? formatPriceRange(priceRange.min, priceRange.max, priceLowestOnly)
              : formatPrice(displayPrice)}
          </span>
          {hasDiscount && (
            <>
              <span className="text-lg text-gray-400 line-through">{formatPrice(displayComparePrice!)}</span>
              <span className="bg-amber-400 text-black text-xs font-black px-2.5 py-1 rounded-full">-{discountPct}%</span>
            </>
          )}
          {pageSections.customization?.enabled && pageSections.customization.fields.length > 0 && (
            <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2.5 py-1 rounded-full">Personalizabil</span>
          )}
        </div>

        {/* Bundle contents — shown prominently in the buy box */}
        {product.is_bundle && bundleComponents.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Pachetul conține</p>

            {/* Mobile: clean stacked list (full names, no truncation) */}
            <div className="space-y-1.5 sm:hidden">
              {bundleComponents.map((c) => (
                <div key={c.id} className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-lg p-1.5">
                  <div className="relative w-9 h-9 rounded-md overflow-hidden bg-gray-50 shrink-0">
                    {c.image_url
                      ? <Image src={c.image_url} alt={c.name} fill sizes="36px" className="object-contain p-0.5" />
                      : <div className="w-full h-full flex items-center justify-center"><Package size={14} className="text-gray-300" /></div>}
                  </div>
                  <span className="text-sm text-gray-800 leading-snug flex-1 min-w-0">
                    {c.quantity > 1 && <span className="font-bold">{c.quantity}× </span>}{c.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Desktop: inline "A + B + C" chips */}
            <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
              {bundleComponents.map((c, i) => (
                <div key={c.id} className="flex items-center gap-1.5">
                  {i > 0 && <Plus size={14} className="text-gray-400 shrink-0" />}
                  <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg pl-1 pr-2 py-1">
                    <div className="relative w-7 h-7 rounded-md overflow-hidden bg-gray-50 shrink-0">
                      {c.image_url
                        ? <Image src={c.image_url} alt={c.name} fill sizes="28px" className="object-contain" />
                        : <div className="w-full h-full flex items-center justify-center"><Package size={12} className="text-gray-300" /></div>}
                    </div>
                    <span className="text-xs font-medium text-gray-800 max-w-[160px] truncate">{c.quantity > 1 ? `${c.quantity}× ` : ""}{c.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {deliveryDates && (
          <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-3.5 py-2.5">
            <Calendar size={16} className="text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">
                {deliveryEstimate?.text || "Estimare livrare"}
              </p>
              <p className="text-xs text-green-600">{deliveryDates.min} - {deliveryDates.max}</p>
            </div>
          </div>
        )}

        {variantsData && variantsData.options.length > 0 && (
          <div className="space-y-4">
            {variantsData.options.map(option => (
              <div key={option.id}>
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  {option.name}
                  {selectedOptions[option.name] && (
                    <span className="font-normal text-gray-500 ml-2">- {selectedOptions[option.name]}</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {option.values.map(val => {
                    const isSelected = selectedOptions[option.name] === val;
                    const available = isValueAvailable(option.name, val);
                    return (
                      <button key={val} type="button"
                        onClick={() => setSelectedOptions(prev => ({
                          ...prev,
                          [option.name]: isSelected ? "" : val,
                        }))}
                        disabled={!available}
                        className="px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all"
                        style={isSelected
                          ? { borderColor: color, backgroundColor: `${color}18`, color: "#111" }
                          : available
                          ? { borderColor: "#e5e7eb", color: "#374151" }
                          : { borderColor: "#f3f4f6", color: "#d1d5db", textDecoration: "line-through", cursor: "not-allowed" }
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
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-blue-700">Produs in precomanda</span>
          </div>
        )}
        {!isOutOfStock && !isPreorder && product.track_inventory && product.stock_quantity !== null && product.stock_quantity > 0 && product.stock_quantity <= 10 && (
          <motion.div className="flex items-center gap-2"
            animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 2, repeat: Infinity }}>
            <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-red-600">
              Doar {product.stock_quantity} {product.stock_quantity === 1 ? "bucata ramasa" : "bucati ramase"} in stoc
            </span>
          </motion.div>
        )}

        {/* CTA */}
        <CTAButton color={color} isOutOfStock={isOutOfStock} isPreorder={isPreorder} needsVariant={needsVariant} hasCardPayment={hasCardPayment} effect={buttonEffect} onClick={() => setModalOpen(true)} />

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
                <span className="text-[11px] text-gray-500 font-medium leading-tight">{text}</span>
              </div>
            ))}
          </div>
        )}

        {!mobile && showSocialProof && <SocialProof count={viewerCount} />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Announcement bar */}
      {announcementBar?.enabled && (
        <div className="h-9 overflow-hidden flex items-center fixed top-0 left-0 right-0 z-50"
          style={{ background: announcementBar.bg_color || color }}>
          <div className="flex whitespace-nowrap">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="inline-block text-xs font-medium tracking-wide text-white"
                style={{ animation: `marquee ${[80, 50, 30, 18, 10][(announcementBar.speed ?? 3) - 1]}s linear infinite` }}>
                {announcementBar.text}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`fixed left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm transition-all ${announcementBar?.enabled ? "top-9" : "top-0"}`}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center gap-3">
          <a href={basePath || "/"} aria-label="Inapoi la magazin"
            onClick={(e) => {
              try {
                const p = sessionStorage.getItem(`store_page_${business.slug}`);
                if (p && Number(p) > 1) { e.preventDefault(); window.location.href = `${basePath || "/"}?page=${p}`; }
              } catch {}
            }}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors shrink-0">
            <ArrowLeft size={16} />
            <span>Magazin</span>
          </a>
          <span className="text-gray-300">/</span>
          <span className="font-bold text-sm text-gray-900 truncate">{business.store_name ?? business.business_name}</span>
        </div>
      </header>

      {/* MOBILE hero */}
      <div className="lg:hidden" style={{ paddingTop: announcementBar?.enabled ? "100px" : "64px" }}>
        <div className="px-4 pb-2">
          <Gallery mobile />
        </div>
        <div className="px-4 pt-4 pb-36">
          <Content mobile />
        </div>
      </div>

      {/* DESKTOP hero */}
      <div className="hidden lg:block px-6" style={{ paddingTop: announcementBar?.enabled ? "148px" : "80px", paddingBottom: "64px" }}>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-start">
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <Gallery mobile={false} />
            {slides.length > 1 && (
              <div className="flex gap-2 mt-3">
                {slides.map((src, i) => (
                  <button key={i} type="button" aria-label={`Selecteaza imaginea ${i + 1}`} onClick={() => goTo(i)}
                    className="relative flex-1 rounded-lg overflow-hidden transition-all"
                    style={{ aspectRatio: "1/1", border: `2px solid ${i === activeSlide ? color : "transparent"}`, opacity: i === activeSlide ? 1 : 0.55 }}>
                    <Image src={src} alt={imgAlt(src, i)} fill sizes="120px" className="object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            <Content mobile={false} />
          </motion.div>
        </div>
      </div>

      {/* Benefits */}
      {benefitsSection?.enabled && benefitsSection.items.length > 0 && (
        <section className="py-20 md:py-28 px-4 md:px-6 bg-[#FAFAFA]">
          <div className="max-w-6xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-14">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-mono mb-3">De ce sa alegi</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">{benefitsSection.title}</h2>
            </motion.div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
              {benefitsSection.items.map((b, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${color}20` }}>
                    <span className="text-lg font-black" style={{ color }}>{i + 1}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 text-base mb-2">{b.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{b.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* How it works */}
      {howItWorksSection?.enabled && howItWorksSection.steps.length > 0 && (
        <section className="py-20 md:py-28 px-4 md:px-6 bg-white">
          <div className="max-w-6xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-16">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-mono mb-3">Simplu de folosit</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">{howItWorksSection.title}</h2>
            </motion.div>
            {/* Mobile */}
            <div className="md:hidden flex flex-col gap-3">
              {howItWorksSection.steps.map((step, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-black text-lg text-white"
                    style={{ backgroundColor: color }}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm mb-0.5">{step.title}</h3>
                    <p className="text-gray-500 text-xs leading-relaxed">{step.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
            {/* Desktop */}
            <div className="hidden md:grid md:grid-cols-3 gap-8 relative">
              <div className="absolute top-12 left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-px bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200" />
              {howItWorksSection.steps.map((step, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.15 }}
                  className="flex flex-col items-center text-center relative">
                  <div className="w-24 h-24 rounded-full bg-white border-2 border-gray-100 shadow-sm flex flex-col items-center justify-center mb-6 z-10">
                    <span className="font-black text-xl" style={{ color }}>{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 text-xl mb-3">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed max-w-xs">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Long description */}
      {hasShortDesc && hasLongDesc && (
        <section className="py-20 md:py-28 px-4 md:px-6 bg-white">
          <div className="max-w-3xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">Descriere</h2>
            </motion.div>
            <div className="policy-content text-gray-600 leading-relaxed text-base"
              dangerouslySetInnerHTML={{ __html: product.description ?? "" }} />
          </div>
        </section>
      )}

      {/* Bundle contents */}
      {product.is_bundle && bundleComponents.length > 0 && (
        <section className="py-16 md:py-24 px-4 md:px-6 bg-white">
          <div className="max-w-4xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-12">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-mono mb-3">Pachet</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">Ce conține pachetul</h2>
            </motion.div>
            <div className="grid sm:grid-cols-2 gap-3">
              {bundleComponents.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white shadow-sm">
                  <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-50 border border-gray-100 shrink-0">
                    {c.image_url
                      ? <Image src={c.image_url} alt={c.name} fill sizes="56px" className="object-contain p-1" />
                      : <div className="w-full h-full flex items-center justify-center"><Package className="h-5 w-5 text-gray-300" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{c.quantity > 1 ? `${c.quantity}x ` : ""}{c.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatPrice(c.price)}{c.out_of_stock ? " · indisponibil" : ""}</p>
                  </div>
                </div>
              ))}
            </div>
            {Number(product.compare_at_price) > Number(product.price) && (
              <p className="text-center text-sm text-gray-600 mt-6">
                Cumpărate separat: <span className="line-through">{formatPrice(Number(product.compare_at_price))}</span>
                {" · "}în pachet plătești <span className="font-bold" style={{ color }}>{formatPrice(Number(product.price))}</span>
              </p>
            )}
          </div>
        </section>
      )}

      {/* Specifications */}
      {specifications.length > 0 && (
        <section className="py-20 md:py-28 px-4 md:px-6 bg-[#FAFAFA]">
          <div className="max-w-4xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-14">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-mono mb-3">Detalii tehnice</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">Specificatii</h2>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
              className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
              {specifications.map((spec, i) => (
                <div key={i}
                  className={`flex items-start sm:items-center gap-4 px-6 py-4 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} ${i !== specifications.length - 1 ? "border-b border-gray-100" : ""}`}>
                  <span className="text-sm text-gray-500 w-44 shrink-0 font-medium">{spec.label}</span>
                  <span className="text-sm font-semibold text-gray-900">{spec.value}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </section>
      )}

      {/* FAQ */}
      {faqSection?.enabled && faqSection.items.length > 0 && (
        <section className="py-20 md:py-28 px-4 md:px-6 bg-white">
          <div className="max-w-3xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center mb-14">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-mono mb-3">Intrebari frecvente</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">{faqSection.title}</h2>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
              className="bg-white border border-gray-100 rounded-xl shadow-sm px-4 md:px-8">
              {faqSection.items.map((faq, i) => (
                <FAQItem key={i} faq={faq} isOpen={openFaq === i}
                  onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
              ))}
            </motion.div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="bg-[#0A0A0A] text-white">
        <div className="max-w-6xl mx-auto px-5 pt-10 pb-6 sm:pt-12">
          {/* Top row: brand + social */}
          <div className="flex items-center justify-between gap-4 pb-8">
            <div className="flex items-center gap-3 min-w-0">
              {business.logo_url ? (
                /* Free logo: full image at any ratio, merchant-set height, no box/crop. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cdnImage(business.logo_url, 320)} alt={business.store_name ?? business.business_name}
                  style={{ height: pageContent.footer_logo_size ?? 36, maxWidth: (pageContent.footer_logo_size ?? 36) * 4.2 }}
                  className="w-auto object-contain shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ backgroundColor: color }}>
                  {(business.store_name ?? business.business_name)[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-sm text-white truncate">{business.store_name ?? business.business_name}</p>
                {business.store_city && <p className="text-[11px] text-white/40">{business.store_city}</p>}
              </div>
            </div>
            {(social.instagram || social.facebook || social.tiktok || social.website) && (
              <div className="flex items-center gap-1.5 shrink-0">
                {social.instagram && (
                  <a href={social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                    className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                    </svg>
                  </a>
                )}
                {social.facebook && (
                  <a href={social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                    className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
                    </svg>
                  </a>
                )}
                {social.tiktok && (
                  <a href={social.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok"
                    className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.82a8.16 8.16 0 004.77 1.52V6.9a4.85 4.85 0 01-1-.21z"/>
                    </svg>
                  </a>
                )}
                {social.website && (
                  <a href={social.website} target="_blank" rel="noopener noreferrer" aria-label="Website"
                    className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                    <Globe className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.06]" />

          {/* Middle: policies + consumer protection */}
          <div className="py-6 sm:py-8 flex flex-col sm:flex-row sm:items-start gap-8 sm:gap-16">
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Informatii legale</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {POLICY_LINKS.map(({ slug: pSlug, label }) => (
                  <a key={pSlug} href={`${basePath}/politici/${pSlug}`}
                    className="text-[13px] text-white/50 hover:text-white transition-colors">
                    {label}
                  </a>
                ))}
              </div>
            </div>
            <div className="shrink-0">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Protectia consumatorilor</p>
              <div className="flex items-center gap-3">
                <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity" title="SAL - Solutionarea Alternativa a Litigiilor">
                  <Image src="/anpc-sal.avif" alt="ANPC SAL - Solutionarea Alternativa a Litigiilor" width={98} height={40} className="rounded-md" />
                </a>
                <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity" title="SOL - Solutionarea Online a Litigiilor">
                  <Image src="/anpc-sol.avif" alt="ANPC SOL - Solutionarea Online a Litigiilor" width={98} height={40} className="rounded-md" />
                </a>
              </div>
            </div>

            {/* Plata securizata (Netopia) — badge obligatoriu cand plata cu cardul e activa */}
            <NetopiaBadge businessId={business.id} />
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.06]" />

          {/* Bottom: copyright */}
          <div className="pt-5 flex items-center justify-between gap-3">
            <p className="text-[11px] text-white/25">
              &copy; {new Date().getFullYear()} {business.store_name ?? business.business_name}
            </p>
            <EdinioCredit businessId={business.id} color={color} className="text-[11px] text-white/25" />
          </div>
        </div>
      </footer>

      {/* Sticky bottom bar (mobile) */}
      {!modalOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white border-t border-gray-100 shadow-2xl px-4 py-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 truncate">
                {displayName}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-gray-900">
                  {showPriceRange
                    ? formatPriceRange(priceRange.min, priceRange.max, priceLowestOnly)
                    : formatPrice(displayPrice)}
                </span>
                {hasDiscount && (
                  <span className="text-xs text-gray-400 line-through">{formatPrice(displayComparePrice!)}</span>
                )}
              </div>
            </div>
            <button type="button" onClick={() => setModalOpen(true)} disabled={isOutOfStock || needsVariant}
              className="flex items-center gap-2 px-5 py-3 text-sm font-bold text-white rounded-xl flex-shrink-0 disabled:opacity-40 uppercase tracking-wide hover:opacity-90 active:scale-[0.98]"
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
        onClose={() => setModalOpen(false)}
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
        onCartConsumed={() => { try { localStorage.removeItem(`cart_${business.slug}`); } catch {} }}
      />
    </div>
  );
}
