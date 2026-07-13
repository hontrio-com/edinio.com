"use client";

import { useState, createContext, useContext, useEffect, useTransition, useMemo, useRef, useCallback, useDeferredValue, type ReactNode } from "react";
import Image from "next/image";
import {
  ShoppingCart, X, Plus, Minus, Phone, Search,
  MapPin, Mail, Globe, ChevronRight, ChevronLeft, ChevronDown, Layers, Package, User, Home, Loader2, Banknote, CreditCard,
  Truck, ShieldCheck, RotateCcw, Check, Filter, ArrowUpDown, Tag, BadgePercent,
} from "lucide-react";
import { formatPrice, formatPriceRange, whatsappLink } from "@/lib/utils/format";
import { cdnImage } from "@/lib/cdn-image";
import { getProductPriceRange } from "@/lib/utils/product-price";
import { placeCartOrder } from "@/lib/actions/order.actions";
import { getPublicStoreConfig } from "@/lib/actions/store.actions";
import { EU_COUNTRIES } from "@/lib/eu-countries";
import { trackAbandonedCart, getRecoverableCart } from "@/lib/actions/abandoned-cart.actions";
import { validateDiscount, type ValidatedDiscount } from "@/lib/actions/discount.actions";
import { getCartSessionId } from "@/lib/cart-session";
import { readBundleConfig } from "@/lib/bundles";
import { parseProductSections, resolveSectionProducts, type ProductSection } from "@/lib/store-sections";
import { buildProductSearchIndex, queryProductSearchIndex } from "@/lib/storefront/product-search";
import { fbTrack, ttqTrack, gtagEvent } from "@/lib/marketing";
import { CourierSelector, type CourierSelection } from "./CourierSelector";
import { StoreNavLinks, StoreNavHamburger } from "./StoreNav";
import { NetopiaBadge } from "./NetopiaBadge";
import { EdinioCredit } from "./EdinioCredit";
import type { MenuItem } from "@/lib/pages/menu";
import { resolveHref } from "@/lib/pages/href";
import type { Database } from "@/types/database.types";
import { computeCardDiscount, type PaymentMethodType, type CardDiscountConfig } from "@/lib/payment-methods";
import { OrderBump } from "./OrderBump";
import { CartRecommendations } from "./CartRecommendations";
import { getCheckoutBumps } from "@/lib/actions/offer.actions";
import type { ResolvedOffer } from "@/lib/offers/offer.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];
type Product = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "name" | "slug" | "description" | "price" | "compare_at_price" | "images" | "category" | "is_featured" | "is_active" | "is_bundle" | "track_inventory" | "stock_quantity" | "sort_order" | "created_at" | "business_id" | "page_sections" | "weight_grams"
>;
type StoreSettings = Pick<
  Database["public"]["Tables"]["store_settings"]["Row"],
  "id" | "business_id" | "page_content" | "store_policies" | "default_shipping_cost" | "free_shipping_threshold" | "min_order_amount"
>;

interface Social {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
}

interface Features {
  show_gallery?: boolean;
  show_about?: boolean;
  show_contact?: boolean;
  floating_whatsapp?: boolean;
  floating_call?: boolean;
}

interface PageContent {
  announcement_bar?: { enabled: boolean; text: string; bg_color: string; speed?: number };
  trust_badges_enabled?: boolean;
  trust_badges?: Array<{ icon: string; title: string; desc: string }>;
  show_trust_strip_on_store?: boolean;
  store_trust_badges?: Array<{ icon: string; title: string; desc: string }>;
  show_featured_section?: boolean;
  featured_section_title?: string;
  show_shipping_progress?: boolean;
  store_benefits_section?: { enabled: boolean; title: string; items: Array<{ title: string; desc: string }> };
  reviews_section?: { enabled: boolean; title: string; items: Array<{ name: string; rating: number; text: string; date: string; image?: string }> };
  checkout_config?: {
    custom_fields?: Array<{ id: string; label: string; type: "text" | "textarea" | "select" | "checkbox"; options?: string; required: boolean; placeholder?: string; }>;
    extras?: Array<{ id: string; label: string; price: number; description?: string; }>;
    hidden_fields?: string[];
    email_field?: { enabled: boolean; required: boolean };
  };
  show_announcement_on_store?: boolean;
  sort_options?: { enabled: boolean; default_sort?: "newest" | "price_asc" | "price_desc" | "popular" | "name_asc" };
  sticky_cart_bar?: { enabled: boolean };
  new_badge?: { enabled: boolean; days: number };
  price_range_display?: { enabled: boolean };
  store_bg_color?: string;
  logo_size?: number;
  footer_logo_size?: number;
  hero_show_content?: boolean;
  hero_banners?: string[];
  hero_banner_links?: string[];
  show_category_badges?: boolean;
  product_sections?: ProductSection[];
  menu?: MenuItem[];
}

interface PolicyValue {
  content?: string;
  enabled?: boolean;
}

interface StorePolicies {
  terms?: string | PolicyValue;
  delivery?: string | PolicyValue;
  return?: string | PolicyValue;
  privacy?: string | PolicyValue;
  gdpr?: string | PolicyValue;
  cancellation?: string | PolicyValue;
}

interface CartItem {
  productId: string;
  slug?: string;
  name: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  total: number;
  count: number;
  clear: () => void;
  restoreCart: (items: CartItem[]) => void;
  sessionId: string;
}

const JUDETE = [
  "Municipiul Bucuresti","Alba","Arad","Arges","Bacau","Bihor","Bistrita-Nasaud","Botosani",
  "Braila","Brasov","Buzau","Calarasi","Cluj","Constanta","Covasna","Dambovita","Dolj",
  "Galati","Giurgiu","Gorj","Harghita","Hunedoara","Ialomita","Iasi","Ilfov","Maramures",
  "Mehedinti","Mures","Neamt","Olt","Prahova","Salaj","Satu Mare","Sibiu","Suceava",
  "Teleorman","Timis","Tulcea","Vaslui","Valcea","Vrancea",
];

const fieldCls = "flex-1 px-3 py-2.5 text-sm text-foreground bg-surface placeholder:text-muted-foreground focus:outline-none";

function FieldWrap({ icon: Icon, error, children }: { icon: React.ElementType; error?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex overflow-hidden rounded-lg border ${error ? "border-red-400" : "border-border"} focus-within:border-foreground/40 transition-colors`}>
      <span className="flex items-center justify-center w-10 shrink-0 bg-muted/40">
        <Icon size={15} className="text-muted-foreground" />
      </span>
      {children}
    </div>
  );
}

const TRUST_ICONS: Record<string, React.ElementType> = {
  truck: Truck,
  shield: ShieldCheck,
  "rotate-ccw": RotateCcw,
  phone: Phone,
};

const CartContext = createContext<CartContextValue | null>(null);

function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}

function CartProvider({ children, slug }: { children: React.ReactNode; slug: string }) {
  const STORAGE_KEY = `cart_${slug}`;
  const [items, setItems] = useState<CartItem[]>([]);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(JSON.parse(stored));
    } catch {}
    setSessionId(getCartSessionId(slug));
  }, [STORAGE_KEY, slug]);

  function save(next: CartItem[]) {
    setItems(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function addItem(item: Omit<CartItem, "quantity">) {
    setItems((prev) => {
      const exists = prev.find((i) => i.productId === item.productId);
      const next = exists
        ? prev.map((i) => i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev, { ...item, quantity: 1 }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function removeItem(productId: string) {
    save(items.filter((i) => i.productId !== productId));
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) { removeItem(productId); return; }
    save(items.map((i) => i.productId === productId ? { ...i, quantity: qty } : i));
  }

  function clear() { save([]); }
  function restoreCart(next: CartItem[]) { save(next); }

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, total, count, clear, restoreCart, sessionId }}>
      {children}
    </CartContext.Provider>
  );
}

interface VatConfig {
  vat_enabled: boolean;
  vat_rate: number;
  prices_include_vat: boolean;
  show_vat_breakdown: boolean;
}

function CartCheckoutModal({
  open, onClose, color, basePath, businessId, shippingCost, freeShippingThreshold, emailFieldConfig, initialDiscountCode, productWeights,
}: {
  open: boolean; onClose: () => void; color: string; basePath: string; businessId: string;
  shippingCost: number; freeShippingThreshold: number | null;
  emailFieldConfig: { enabled: boolean; required: boolean };
  initialDiscountCode?: string | null;
  productWeights?: Record<string, number>;
}) {
  const { items, total, clear, sessionId } = useCart();
  const [checkoutConfig, setCheckoutConfig] = useState<PageContent["checkout_config"]>(
    { email_field: emailFieldConfig } as PageContent["checkout_config"]
  );
  const [newsletterOffer, setNewsletterOffer] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [vatConfig, setVatConfig] = useState<VatConfig>({ vat_enabled: false, vat_rate: 19, prices_include_vat: true, show_vat_breakdown: true });
  const [paymentMethods, setPaymentMethods] = useState<{ type: PaymentMethodType; label: string }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>("cash_on_delivery");
  const [cardDiscountConfig, setCardDiscountConfig] = useState<CardDiscountConfig>({ enabled: false, type: "percent", value: 0 });
  const customFields = checkoutConfig?.custom_fields ?? [];
  const extras = checkoutConfig?.extras ?? [];
  // Discount code is OFF by default — same semantics as the editor toggle and OrderModal.
  const hiddenFields = checkoutConfig?.hidden_fields ?? ["discount"];
  const emailField = checkoutConfig?.email_field ?? emailFieldConfig;
  const [selectedExtras, setSelectedExtras] = useState<Record<string, boolean>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [courierSelection, setCourierSelection] = useState<CourierSelection | null>(null);
  const [hasCouriers, setHasCouriers] = useState(false);
  const [bumps, setBumps] = useState<ResolvedOffer[]>([]);
  const [acceptedBumps, setAcceptedBumps] = useState<Set<string>>(new Set());
  const [appliedDiscount, setAppliedDiscount] = useState<ValidatedDiscount | null>(null);
  const [discountInput, setDiscountInput] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  // Collapsed by default — a visible coupon field depresses conversion (shoppers
  // leave to hunt for codes). Revealed on demand via "Ai un cod?".
  const [showDiscountField, setShowDiscountField] = useState(false);
  // Accepted order bumps add their discounted product to the goods value. `goodsTotal`
  // mirrors the server's bump-inclusive subtotal and drives every money computation
  // below (VAT, card discount, free shipping, grand total).
  const acceptedBumpOffers = bumps.filter((o) => acceptedBumps.has(o.id) && o.pricing && o.products[0]);
  const bumpSubtotal = acceptedBumpOffers.reduce((s, o) => s + o.pricing!.price, 0);
  const goodsTotal = Math.round((total + bumpSubtotal) * 100) / 100;
  const extrasTotal = extras.filter(e => selectedExtras[e.id]).reduce((s, e) => s + e.price, 0);
  const baseShippingCost = courierSelection ? courierSelection.price : shippingCost;
  const discountAmount = appliedDiscount ? Math.min(appliedDiscount.discountAmount, goodsTotal) : 0;
  const isFreeShippingDiscount = appliedDiscount?.type === "free_shipping";
  const shipping = (isFreeShippingDiscount || (freeShippingThreshold && goodsTotal >= freeShippingThreshold)) ? 0 : baseShippingCost;

  // VAT calculation
  const vatBase = goodsTotal + extrasTotal;
  const vatAmount = vatConfig.vat_enabled
    ? vatConfig.prices_include_vat
      ? Math.round((vatBase - vatBase / (1 + vatConfig.vat_rate / 100)) * 100) / 100
      : Math.round(vatBase * (vatConfig.vat_rate / 100) * 100) / 100
    : 0;
  const vatAddOn = vatConfig.vat_enabled && !vatConfig.prices_include_vat ? vatAmount : 0;
  // Card-payment discount (mirrors the server): only for online card methods, on
  // the goods value after promo. Shown live as the customer switches payment method.
  const cardDiscountAmount = computeCardDiscount(cardDiscountConfig, paymentMethod, goodsTotal + extrasTotal - discountAmount);
  // Round to 2 decimals (cents): float subtraction like 199.29 - 19.93 would
  // otherwise surface as 179.35999999999999 in the total/button/confirm URL.
  const grandTotal = Math.max(0, Math.round((goodsTotal + extrasTotal - discountAmount - cardDiscountAmount + shipping + vatAddOn) * 100) / 100);

  const [form, setForm] = useState({ name: "", phone: "", email: "", county: "", city: "", address: "", country: "RO", postCode: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [intlEnabled, setIntlEnabled] = useState(false);
  const [dpdUseWeight, setDpdUseWeight] = useState(false);
  const isIntl = intlEnabled && form.country !== "RO";
  // Total cart weight (kg) from per-product weights; used for the live intl quote.
  const totalWeightKg = items.reduce((s, i) => s + ((productWeights?.[i.productId] ?? 0) * i.quantity), 0) / 1000;
  // DPD international services don't support cash-on-delivery — EU orders pay online.
  const availablePaymentMethods = isIntl
    ? paymentMethods.filter((m) => m.type !== "cash_on_delivery")
    : paymentMethods;
  useEffect(() => {
    if (isIntl && paymentMethod === "cash_on_delivery") {
      setPaymentMethod(availablePaymentMethods[0]?.type ?? "cash_on_delivery");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntl]);

  // Auto-apply a recovery discount code passed via the restore link (?code=).
  useEffect(() => {
    if (!open || !initialDiscountCode) return;
    let cancelled = false;
    validateDiscount(initialDiscountCode, businessId, goodsTotal).then((r) => {
      if (!cancelled) setAppliedDiscount(r.valid ? r.discount : null);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDiscountCode, businessId]);

  // Re-validate silently when the cart total changes (min_order_amount may no longer be met).
  useEffect(() => {
    if (!appliedDiscount) return;
    (async () => {
      const result = await validateDiscount(appliedDiscount.code, businessId, goodsTotal);
      if (!result.valid) {
        setAppliedDiscount(null);
        setDiscountError(result.error);
      } else {
        setAppliedDiscount(result.discount);
        setDiscountError("");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goodsTotal]);

  async function handleApplyDiscount() {
    if (!discountInput.trim()) return;
    setIsValidatingDiscount(true);
    setDiscountError("");
    const result = await validateDiscount(discountInput.trim(), businessId, goodsTotal);
    setIsValidatingDiscount(false);
    if (!result.valid) {
      setDiscountError(result.error);
      setAppliedDiscount(null);
    } else {
      setAppliedDiscount(result.discount);
      setDiscountError("");
    }
  }

  function handleRemoveDiscount() {
    setAppliedDiscount(null);
    setDiscountInput("");
    setDiscountError("");
  }

  function toggleBump(offer: ResolvedOffer, checked: boolean) {
    setAcceptedBumps((prev) => {
      const next = new Set(prev);
      if (checked) next.add(offer.id); else next.delete(offer.id);
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    getPublicStoreConfig(businessId).then((data) => {
      if (!data) return;
      if (data.page_content) {
        const pc = data.page_content as { checkout_config?: PageContent["checkout_config"] };
        setCheckoutConfig(prev => ({ ...prev, ...pc.checkout_config }));
      }
      setNewsletterOffer(data.mailchimp_newsletter === true || data.brevo_newsletter === true || data.klaviyo_newsletter === true);
      setVatConfig({
        vat_enabled: data.vat_enabled,
        vat_rate: data.vat_rate,
        prices_include_vat: data.prices_include_vat,
        show_vat_breakdown: data.show_vat_breakdown,
      });
      const methods = data.payment_methods ?? [];
      setPaymentMethods(methods);
      setPaymentMethod((prev) => (methods.some((m) => m.type === prev) ? prev : methods[0]?.type ?? "cash_on_delivery"));
      setCardDiscountConfig(data.card_discount);
      // Check if any courier is enabled in shipping_zones (Settings > Livrare)
      const zones = data.shipping_zones as Record<string, { enabled?: boolean }> | null;
      const anyEnabled = zones && Object.values(zones).some((z) => z?.enabled);
      setHasCouriers(!!anyEnabled);
      setIntlEnabled(data.international_shipping === true);
      setDpdUseWeight(data.dpd_use_weight === true);
    });
  }, [open, businessId]);

  // Order-bump offers applicable to the cart (checkout surface).
  useEffect(() => {
    if (!open || items.length === 0) return;
    let cancelled = false;
    getCheckoutBumps(businessId, items.map((i) => i.productId)).then((b) => { if (!cancelled) setBumps(b ?? []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, businessId, items]);

  // Abandoned-cart capture: debounced, fire-and-forget. The server ignores it
  // unless the store opted in. Only fires once a contact channel is present.
  const trackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open || !sessionId || items.length === 0) return;
    const phoneDigits = form.phone.replace(/\D/g, "");
    const hasContact = form.email.includes("@") || phoneDigits.length >= 6;
    if (!hasContact) return;
    if (trackTimer.current) clearTimeout(trackTimer.current);
    trackTimer.current = setTimeout(() => {
      void trackAbandonedCart({
        businessId,
        sessionId,
        source: "cart",
        name: form.name.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.replace(/[\s\-().]/g, "") || undefined,
        items: items.map(i => ({ product_id: i.productId, name: i.name, price: i.price, quantity: i.quantity, image_url: i.imageUrl })),
      });
    }, 1500);
    return () => { if (trackTimer.current) clearTimeout(trackTimer.current); };
  }, [open, sessionId, businessId, form.name, form.phone, form.email, items]);

  function validate() {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = "Minim 3 caractere";
    const phoneDigits = form.phone.replace(/[\s\-().]/g, "");
    const phoneOk = isIntl ? /^\+?\d{6,15}$/.test(phoneDigits) : /^(\+?40|0)7\d{8}$/.test(phoneDigits);
    if (!phoneOk) e.phone = "Numar de telefon invalid";
    // DPD requires the recipient email for international shipments.
    if ((emailField.enabled || isIntl) && (emailField.required || isIntl) && !form.email.trim()) e.email = "Email obligatoriu";
    else if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Email invalid";
    if (isIntl) {
      if (form.postCode.trim().length < 3) e.postCode = "Introduceti codul postal";
    } else {
      if (!form.county) e.county = "Selectati judetul";
    }
    if (form.city.trim().length < 2) e.city = "Introduceti orasul";
    if (form.address.trim().length < 5 && !(courierSelection?.deliveryType === "locker")) e.address = "Minim 5 caractere";
    if (hasCouriers && !courierSelection) e.courier = "Selecteaza o metoda de livrare";
    if (courierSelection?.deliveryType === "locker" && !courierSelection.lockerId) e.courier = "Selecteaza un locker";
    for (const field of customFields) {
      if (field.required) {
        if (field.type === "checkbox" && customValues[field.id] !== "da") {
          e[field.id] = "Camp obligatoriu";
        } else if (field.type !== "checkbox" && !customValues[field.id]?.trim()) {
          e[field.id] = "Camp obligatoriu";
        }
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    startTransition(async () => {
      const allItems = [
        ...items.map(i => ({ product_id: i.productId, name: i.name, price: i.price, quantity: i.quantity })),
        ...acceptedBumpOffers.map((o) => ({ product_id: o.products[0]!.id, name: o.products[0]!.name, price: o.pricing!.price, quantity: 1 })),
      ];
      const result = await placeCartOrder({
        business_id: businessId,
        cart_session_id: sessionId || undefined,
        items: allItems,
        accepted_offer_ids: acceptedBumpOffers.length > 0 ? acceptedBumpOffers.map((o) => o.id) : undefined,
        shipping_cost: shipping,
        discount_code: appliedDiscount?.code,
        discount_amount: discountAmount,
        customer_name: form.name,
        customer_phone: form.phone.replace(/[\s\-().]/g, ""),
        customer_email: form.email.trim() || undefined,
        newsletter_opt_in: newsletterOffer && newsletterOptIn && !!form.email.trim(),
        customer_county: form.county,
        customer_city: form.city,
        customer_country: isIntl ? form.country : undefined,
        customer_postal_code: isIntl ? form.postCode.trim() : undefined,
        customer_address: courierSelection?.deliveryType === "locker" && courierSelection.lockerAddress
          ? courierSelection.lockerAddress
          : form.address,
        extras: extras.filter(ex => selectedExtras[ex.id]).map(ex => ({ id: ex.id, label: ex.label, price: ex.price })),
        custom_fields: Object.keys(customValues).length > 0 ? customValues : undefined,
        vat_amount: vatAmount,
        vat_rate: vatConfig.vat_enabled ? vatConfig.vat_rate : 0,
        payment_method: paymentMethod,
        selected_courier: courierSelection?.courier,
        courier_label: courierSelection?.courierLabel,
        delivery_type: courierSelection?.deliveryType,
        locker_id: courierSelection?.lockerId,
        locker_name: courierSelection?.lockerName,
        locker_address: courierSelection?.lockerAddress,
        locker_city: courierSelection?.lockerCity,
        locker_county: courierSelection?.lockerCounty,
        woot_service_id: courierSelection?.wootServiceId,
        woot_courier_name: courierSelection?.wootCourierName,
        woot_service_name: courierSelection?.wootServiceName,
        colete_service_id: courierSelection?.coleteServiceId,
        colete_service_name: courierSelection?.coleteServiceName,
      });
      if ("error" in result) { setErrors({ _: result.error as string }); return; }

      const orderId = (result as { orderId: string }).orderId;

      if (paymentMethod !== "cash_on_delivery") {
        const endpoint = paymentMethod === "stripe" ? "/api/stripe/order-checkout"
          : paymentMethod === "netopia" ? "/api/netopia/start"
          : "/api/ipay/start";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, businessId }),
        });
        let data: { url?: string; redirectUrl?: string; error?: string } = {};
        try { data = await res.json(); } catch { /* non-JSON response (e.g. error page) — show generic error below */ }
        const redirect = data.url ?? data.redirectUrl;
        if (redirect) { clear(); window.location.href = redirect; return; }
        setErrors({ _: data.error ?? "Eroare la initierea platii cu cardul." });
        return;
      }

      clear();
      onClose();
      window.location.href = `${basePath}/confirm?orderId=${orderId}&name=${encodeURIComponent(form.name)}&total=${grandTotal}`;
    });
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-[60] w-full md:max-w-md max-h-[94vh] overflow-y-auto bg-surface"
        style={{ borderRadius: "21px 21px 0 0", boxShadow: "rgba(0,0,0,0.5) 0px 4px 24px", border: `3px solid ${color}` }}
      >
        <div className="md:hidden flex justify-center pt-3">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <div className="flex-1 text-center">
            <h2 className="text-lg font-bold text-foreground tracking-tight">Finalizeaza comanda</h2>
          </div>
          <button type="button" aria-label="Inchide formularul" onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0">
            <X className="h-[17px] w-[17px] text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 pt-4 pb-6 space-y-4">
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.productId} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40">
                {item.imageUrl && (
                  <Image src={item.imageUrl} alt={item.name} width={48} height={48} className="rounded-lg object-cover border border-border shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.quantity} buc &times; {item.price} lei</p>
                </div>
                <p className="text-sm font-bold shrink-0" style={{ color }}>{item.price * item.quantity} lei</p>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1">Nume complet <span className="text-red-500">*</span></label>
            <FieldWrap icon={User} error={!!errors.name}>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Prenume Nume" className={fieldCls} />
            </FieldWrap>
            {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1">Numar de telefon <span className="text-red-500">*</span></label>
            <FieldWrap icon={Phone} error={!!errors.phone}>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07XXXXXXXX" type="tel" className={fieldCls} />
            </FieldWrap>
            {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
          </div>
          {(emailField.enabled || isIntl) && (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">
                Email{" "}
                {(emailField.required || isIntl)
                  ? <span className="text-red-500">*</span>
                  : <span className="text-xs font-normal text-muted-foreground">(optional — pentru confirmare comanda)</span>
                }
              </label>
              <FieldWrap icon={Mail} error={!!errors.email}>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="adresa@email.ro" type="email" className={fieldCls} />
              </FieldWrap>
              {errors.email && <p className="text-xs text-red-500 mt-0.5">{errors.email}</p>}
              {newsletterOffer && (
                <label className="flex items-start gap-2 mt-2 cursor-pointer select-none">
                  <input type="checkbox" checked={newsletterOptIn} onChange={e => setNewsletterOptIn(e.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ accentColor: color }} />
                  <span className="text-xs text-muted-foreground">Vreau sa primesc oferte si noutati pe email.</span>
                </label>
              )}
            </div>
          )}
          {intlEnabled && (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">Tara <span className="text-red-500">*</span></label>
              <FieldWrap icon={MapPin}>
                <select aria-label="Tara" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className={`${fieldCls} bg-surface`}>
                  <option value="RO">Romania</option>
                  {EU_COUNTRIES.map(c => <option key={c.iso2} value={c.iso2}>{c.name}</option>)}
                </select>
              </FieldWrap>
            </div>
          )}
          {isIntl ? (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">Cod postal <span className="text-red-500">*</span></label>
              <FieldWrap icon={MapPin} error={!!errors.postCode}>
                <input value={form.postCode} onChange={e => setForm(f => ({ ...f, postCode: e.target.value }))} placeholder="Cod postal" className={fieldCls} />
              </FieldWrap>
              {errors.postCode && <p className="text-xs text-red-500 mt-0.5">{errors.postCode}</p>}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">Judet <span className="text-red-500">*</span></label>
              <FieldWrap icon={MapPin} error={!!errors.county}>
                <select aria-label="Judet" value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value }))} className={`${fieldCls} bg-surface`}>
                  <option value="">Selecteaza judetul</option>
                  {JUDETE.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </FieldWrap>
              {errors.county && <p className="text-xs text-red-500 mt-0.5">{errors.county}</p>}
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1">Oras <span className="text-red-500">*</span></label>
            <FieldWrap icon={MapPin} error={!!errors.city}>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Oras / Localitate" className={fieldCls} />
            </FieldWrap>
            {errors.city && <p className="text-xs text-red-500 mt-0.5">{errors.city}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1">Adresa <span className="text-red-500">*</span></label>
            <FieldWrap icon={Home} error={!!errors.address}>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Strada, nr., bloc, ap." className={fieldCls} />
            </FieldWrap>
            {errors.address && <p className="text-xs text-red-500 mt-0.5">{errors.address}</p>}
          </div>
          {/* Courier selection */}
          {hasCouriers && (
            <CourierSelector
              businessId={businessId}
              county={form.county}
              city={form.city}
              color={color}
              country={isIntl ? form.country : undefined}
              postCode={isIntl ? form.postCode : undefined}
              weightKg={isIntl && dpdUseWeight && totalWeightKg > 0 ? totalWeightKg : undefined}
              cod={paymentMethod === "cash_on_delivery" ? total : 0}
              onSelect={setCourierSelection}
            />
          )}
          {errors.courier && <p className="text-xs text-red-500 mt-0.5">{errors.courier}</p>}
          {/* Custom fields */}
          {customFields.map(field => (
            <div key={field.id}>
              <label className="block text-sm font-semibold text-foreground mb-1">
                {field.label || "Camp"} {field.required && <span className="text-red-500">*</span>}
              </label>
              {field.type === "text" && (
                <FieldWrap icon={Package} error={!!errors[field.id]}>
                  <input value={customValues[field.id] ?? ""} placeholder={field.placeholder ?? ""}
                    onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.value }))}
                    className={fieldCls} />
                </FieldWrap>
              )}
              {field.type === "textarea" && (
                <textarea value={customValues[field.id] ?? ""} rows={3}
                  placeholder={field.placeholder ?? ""}
                  onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm text-foreground bg-surface border border-border rounded-lg focus:outline-none focus:border-foreground/40 resize-none" />
              )}
              {field.type === "select" && (
                <FieldWrap icon={Package} error={!!errors[field.id]}>
                  <select aria-label={field.label} value={customValues[field.id] ?? ""}
                    onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.value }))}
                    className={`${fieldCls} bg-surface`}>
                    <option value="">Selecteaza...</option>
                    {(field.options ?? "").split(",").map(opt => opt.trim()).filter(Boolean).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </FieldWrap>
              )}
              {field.type === "checkbox" && (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={customValues[field.id] === "da"}
                    onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.checked ? "da" : "nu" }))}
                    className="w-4 h-4 rounded" style={{ accentColor: color }} />
                  <span className="text-sm text-foreground">{field.placeholder || field.label}</span>
                </label>
              )}
              {errors[field.id] && <p className="text-xs text-red-500 mt-0.5">{errors[field.id]}</p>}
            </div>
          ))}

          {/* Order bumps — a real discounted product added with one tap */}
          <OrderBump bumps={bumps} color={color} acceptedIds={acceptedBumps} onToggle={toggleBump} />

          {/* Extras */}
          {extras.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Optiuni suplimentare</p>
              {extras.map(extra => {
                const checked = !!selectedExtras[extra.id];
                return (
                  <button key={extra.id} type="button"
                    onClick={() => setSelectedExtras(s => ({ ...s, [extra.id]: !s[extra.id] }))}
                    className="w-full text-left rounded-xl border-2 border-dashed p-3.5 transition-all"
                    style={checked
                      ? { borderColor: color, backgroundColor: `${color}08` }
                      : { borderColor: "var(--color-border)", backgroundColor: "transparent" }}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors"
                          style={checked ? { borderColor: color, backgroundColor: color } : { borderColor: "var(--color-border)" }}>
                          {checked && (
                            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-tight">{extra.label}</p>
                          {extra.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{extra.description}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-bold flex-shrink-0" style={{ color }}>+{extra.price} lei</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Discount code — collapsed behind a link until needed */}
          {!hiddenFields.includes("discount") && (appliedDiscount || showDiscountField ? <div>
            <label className="block text-sm font-semibold text-foreground mb-1">
              Cod discount
            </label>
            {appliedDiscount ? (
              /* Applied discount banner */
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border-2" style={{ borderColor: `${color}55`, backgroundColor: `${color}12` }}>
                {appliedDiscount.type === "free_shipping"
                  ? <Truck size={15} className="flex-shrink-0" style={{ color }} />
                  : <BadgePercent size={15} className="flex-shrink-0" style={{ color }} />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold font-mono" style={{ color }}>{appliedDiscount.code}</p>
                  <p className="text-xs text-muted-foreground">
                    {appliedDiscount.type === "percent" && `${appliedDiscount.value}% reducere`}
                    {appliedDiscount.type === "fixed" && `${appliedDiscount.value} lei reducere`}
                    {appliedDiscount.type === "free_shipping" && "Transport gratuit aplicat"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveDiscount}
                  className="p-1 rounded-full hover:bg-muted transition-colors flex-shrink-0"
                >
                  <X size={14} style={{ color }} />
                </button>
              </div>
            ) : (
              /* Input + Apply button */
              <div className="flex gap-2">
                <div className="flex flex-1 overflow-hidden rounded-lg border border-border focus-within:border-foreground/40 transition-colors">
                  <span className="flex items-center justify-center w-10 shrink-0 bg-muted/40">
                    <Tag size={15} className="text-muted-foreground" />
                  </span>
                  <input
                    value={discountInput}
                    onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(""); }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleApplyDiscount(); } }}
                    placeholder="COD DISCOUNT"
                    className="flex-1 px-3 py-2.5 text-sm text-foreground bg-surface placeholder:text-muted-foreground focus:outline-none font-mono tracking-widest"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyDiscount}
                  disabled={isValidatingDiscount || !discountInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
                  style={{ backgroundColor: color }}
                >
                  {isValidatingDiscount
                    ? <Loader2 size={14} className="animate-spin" />
                    : <ChevronRight size={14} />}
                  Aplica
                </button>
              </div>
            )}
            {discountError && <p className="text-xs text-red-500 mt-1">{discountError}</p>}
          </div> : (
            <button type="button" onClick={() => setShowDiscountField(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <Tag size={14} /> Ai un cod de reducere?
            </button>
          ))}

          <div className="rounded-xl p-3 space-y-1.5 text-sm bg-muted/40 border border-border">
            <div className="flex justify-between text-muted-foreground">
              <span>Produse</span>
              <span className="font-medium text-foreground">{total} lei</span>
            </div>
            {acceptedBumpOffers.map((o) => (
              <div key={o.id} className="flex justify-between" style={{ color }}>
                <span className="truncate pr-2">+ {o.products[0]!.name}</span>
                <span className="font-medium whitespace-nowrap">{o.pricing!.price} lei</span>
              </div>
            ))}
            {extrasTotal > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Optiuni extra</span>
                <span className="font-medium text-foreground">+{extrasTotal} lei</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Transport</span>
              <span className={shipping === 0 ? "font-medium" : "font-medium text-foreground"} style={shipping === 0 ? { color } : undefined}>
                {shipping === 0 ? "Gratuit" : `${shipping} lei`}
              </span>
            </div>
            {vatConfig.vat_enabled && vatConfig.show_vat_breakdown && vatAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>TVA ({vatConfig.vat_rate}%){vatConfig.prices_include_vat ? " inclus" : ""}</span>
                <span className="font-medium text-foreground">{vatAmount.toFixed(2)} lei</span>
              </div>
            )}
            {appliedDiscount && (discountAmount > 0 || isFreeShippingDiscount) && (
              <div className="flex justify-between" style={{ color }}>
                <span>Reducere ({appliedDiscount.code})</span>
                <span className="font-medium">{isFreeShippingDiscount && discountAmount === 0 ? "Transport gratuit" : `-${discountAmount} lei`}</span>
              </div>
            )}
            {cardDiscountAmount > 0 && (
              <div className="flex justify-between" style={{ color }}>
                <span>Reducere plata cu cardul</span>
                <span className="font-medium">-{cardDiscountAmount} lei</span>
              </div>
            )}
            {freeShippingThreshold && goodsTotal < freeShippingThreshold && (
              <p className="text-xs text-muted-foreground">
                Mai adauga <strong>{freeShippingThreshold - goodsTotal} lei</strong> pentru livrare gratuita
              </p>
            )}
            <div className="flex justify-between font-bold text-base border-t border-border pt-2">
              <span>Total</span>
              <span style={{ color }}>{grandTotal} lei</span>
            </div>
          </div>
          {/* Payment method toggle */}
          {availablePaymentMethods.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Metoda de plata</p>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(availablePaymentMethods.length, 3)}, minmax(0, 1fr))` }}>
                {availablePaymentMethods.map((m) => (
                  <button key={m.type} type="button" onClick={() => setPaymentMethod(m.type)}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
                    style={paymentMethod === m.type
                      ? { borderColor: color, backgroundColor: `${color}12`, color: "var(--color-foreground)" }
                      : { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)", color: "var(--color-muted-foreground)" }}>
                    {m.type === "cash_on_delivery" ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {errors._ && <p className="text-sm text-red-500 text-center">{errors._}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-3 py-4 font-bold text-base text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
            style={{ backgroundColor: color, boxShadow: `0px 2px 12px ${color}55` }}
          >
            {isPending
              ? <><Loader2 className="h-[18px] w-[18px] animate-spin" />Se proceseaza...</>
              : paymentMethod === "cash_on_delivery"
                ? <><Banknote className="h-5 w-5" />Plata la livrare - {grandTotal} lei</>
                : <><CreditCard className="h-5 w-5" />{paymentMethods.find((m) => m.type === paymentMethod)?.label ?? "Plateste"} - {grandTotal} lei</>
            }
          </button>
          <p className="text-center text-xs text-muted-foreground">
            {paymentMethod === "cash_on_delivery"
              ? "Platesti cash curierului - Fara card necesar"
              : "Vei fi redirectionat pentru plata securizata"}
          </p>
        </form>
      </div>
    </>
  );
}

function CartDrawer({
  open, onClose, color, basePath, businessId, onCheckout, shippingCost, freeShippingThreshold, minOrderAmount,
}: {
  open: boolean; onClose: () => void; color: string; basePath: string; businessId: string; onCheckout: () => void;
  shippingCost: number; freeShippingThreshold: number | null; minOrderAmount: number | null;
}) {
  const { items, addItem, removeItem, updateQty, total, count } = useCart();
  const shipping = freeShippingThreshold && total >= freeShippingThreshold ? 0 : shippingCost;
  const grandTotal = total + shipping;
  const belowMinOrder = minOrderAmount !== null && total < minOrderAmount;
  const progressPct = freeShippingThreshold && total < freeShippingThreshold
    ? Math.round((total / freeShippingThreshold) * 100)
    : 100;

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-background z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground">Cosul tau</h2>
            <p className="text-xs text-muted-foreground">{count} {count === 1 ? "produs" : "produse"}</p>
          </div>
          <button
            aria-label="Inchide cosul"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {freeShippingThreshold && (
          <div className="px-5 py-3 bg-muted/40 border-b border-border">
            {total >= freeShippingThreshold ? (
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color }}>
                <Check className="h-3.5 w-3.5" /> Ai obtinut livrare gratuita!
              </p>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Mai adauga <strong className="text-foreground">{formatPrice(freeShippingThreshold - total)}</strong> pentru livrare gratuita
                </p>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Cosul este gol</p>
              <p className="text-xs text-muted-foreground">Adauga produse pentru a continua</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const href = item.slug ? `${basePath}/product/${item.slug}` : null;
                const thumbCls = "relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-muted border border-border";
                const thumb = item.imageUrl ? (
                  <Image src={item.imageUrl} alt={item.name} fill sizes="64px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                );
                return (
                <div key={item.productId} className="flex items-start gap-3">
                  {href ? (
                    <a href={href} onClick={onClose} className={thumbCls}>{thumb}</a>
                  ) : (
                    <div className={thumbCls}>{thumb}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    {href ? (
                      <a href={href} onClick={onClose} className="block">
                        <p className="text-sm font-medium text-foreground leading-snug truncate hover:opacity-70 transition-opacity">{item.name}</p>
                      </a>
                    ) : (
                      <p className="text-sm font-medium text-foreground leading-snug truncate">{item.name}</p>
                    )}
                    <p className="text-sm font-semibold mt-0.5" style={{ color }}>{formatPrice(item.price)}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button type="button" aria-label="Scade cantitatea" onClick={() => updateQty(item.productId, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-semibold w-5 text-center tabular-nums">{item.quantity}</span>
                      <button type="button" aria-label="Creste cantitatea" onClick={() => updateQty(item.productId, item.quantity + 1)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <button type="button" aria-label="Sterge produsul" onClick={() => removeItem(item.productId)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors mt-0.5 rounded-md hover:bg-muted">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <CartRecommendations businessId={businessId} color={color} basePath={basePath}
            cartProductIds={items.map((i) => i.productId)}
            onAdd={(p) => addItem({ productId: p.id, slug: p.slug ?? undefined, name: p.name, price: p.price, imageUrl: p.imageUrl })} />
        )}

        {items.length > 0 && (
          <div className="px-5 py-5 border-t border-border space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-medium text-foreground">{formatPrice(total)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Livrare</span>
                <span className={shipping === 0 ? "font-medium" : "font-medium text-foreground"} style={shipping === 0 ? { color } : undefined}>
                  {shipping === 0 ? "Gratuita" : formatPrice(shipping)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-base text-foreground pt-2 border-t border-border">
                <span>Total</span>
                <span style={{ color }}>{formatPrice(grandTotal)}</span>
              </div>
            </div>
            {belowMinOrder && (
              <p className="text-xs text-center text-muted-foreground">
                Comanda minima este <strong className="text-foreground">{formatPrice(minOrderAmount!)}</strong>. Mai adauga <strong className="text-foreground">{formatPrice(minOrderAmount! - total)}</strong> pentru a finaliza.
              </p>
            )}
            <button type="button" onClick={onCheckout} disabled={belowMinOrder}
              className="flex items-center justify-center gap-2 w-full py-3.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
              style={{ backgroundColor: color }}>
              Finalizeaza comanda
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function ProductCard({ product, color, basePath, onAddToCart, isAdded, newBadgeDays, outOfStock, showCategoryBadge = true, priority = false, priceLowestOnly = false }: {
  product: Product; color: string; basePath: string; onAddToCart: () => void; isAdded: boolean; newBadgeDays: number; outOfStock?: boolean; showCategoryBadge?: boolean; priority?: boolean; priceLowestOnly?: boolean;
}) {
  const images = Array.isArray(product.images) ? product.images : [];
  const imageUrl = images[0] ? String(images[0]) : null;
  const isNew = newBadgeDays > 0 && (Date.now() - new Date(product.created_at).getTime()) < newBadgeDays * 86400000;
  // Produs variabil cu preturi diferite -> afiseaza interval ("De la X – Y") sau doar minimul.
  const priceRange = getProductPriceRange(Number(product.price), product.page_sections);
  const showPriceRange = priceRange.hasRange && !priceLowestOnly;
  const hasDiscount = !priceRange.hasRange && product.compare_at_price && Number(product.compare_at_price) > Number(product.price);
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : 0;
  const isOutOfStock = outOfStock ?? (product.track_inventory && product.stock_quantity === 0);

  return (
    <div className="group bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col">
      <a href={`${basePath}/product/${product.slug}`} className="block">
        <div className="relative aspect-square bg-muted/40 overflow-hidden">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={product.name}
              fill
              priority={priority}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-contain p-2 group-hover:scale-[1.04] transition-transform duration-500 ease-out"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-10 w-10 text-muted-foreground/40" />
            </div>
          )}

          {/* Top badges */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
            {product.is_bundle && (
              <span className="bg-foreground text-background text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-sm inline-flex items-center gap-1">
                <Layers className="h-3 w-3" /> Pachet
              </span>
            )}
            {hasDiscount && (
              <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-sm">
                -{discountPct}%
              </span>
            )}
            {product.is_featured && !hasDiscount && (
              <span className="text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-sm"
                style={{ backgroundColor: color }}>
                Popular
              </span>
            )}
            {isNew && !hasDiscount && !product.is_featured && (
              <span className="text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-sm" style={{ backgroundColor: color }}>
                Nou
              </span>
            )}
          </div>

          {/* Category chip bottom */}
          {showCategoryBadge && product.category && (
            <div className="absolute bottom-2 left-2">
              <span className="bg-black/55 backdrop-blur-sm text-white text-[10px] font-medium px-2.5 py-0.5 rounded-full">
                {product.category}
              </span>
            </div>
          )}

          {isOutOfStock && (
            <div className="absolute inset-0 bg-surface/75 backdrop-blur-[2px] flex items-center justify-center">
              <span className="text-xs font-semibold text-muted-foreground bg-surface border border-border px-3 py-1.5 rounded-full shadow-sm">
                Stoc epuizat
              </span>
            </div>
          )}
        </div>
      </a>

      <div className="p-3 sm:p-4 flex flex-col flex-1">
        <a href={`${basePath}/product/${product.slug}`} className="flex-1">
          <h3 className="font-semibold text-foreground text-sm leading-snug mb-1.5 line-clamp-2 hover:opacity-70 transition-opacity">
            {product.name}
          </h3>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="font-bold text-lg" style={{ color }}>
              {showPriceRange
                ? formatPriceRange(priceRange.min, priceRange.max)
                : formatPrice(priceRange.min)}
            </span>
            {hasDiscount && (
              <span className="text-sm text-muted-foreground line-through">{formatPrice(Number(product.compare_at_price))}</span>
            )}
          </div>
        </a>
        <button
          type="button"
          onClick={onAddToCart}
          disabled={isOutOfStock}
          className="w-full py-2.5 text-sm font-bold text-white rounded-xl transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-foreground/30"
          style={{
            backgroundColor: color,
            boxShadow: isAdded ? `0 0 0 3px ${color}33` : `0 2px 8px ${color}40`,
          }}
        >
          {isAdded ? (
            <>
              <Check className="h-4 w-4" strokeWidth={3} />
              Adaugat!
            </>
          ) : (
            <>
              <ShoppingCart className="h-4 w-4" />
              Adauga in cos
            </>
          )}
        </button>
      </div>
    </div>
  );
}

const POLICY_LINKS = [
  { slug: "termeni", label: "Termeni si conditii" },
  { slug: "livrare", label: "Politica de livrare" },
  { slug: "retur", label: "Politica de retur" },
  { slug: "confidentialitate", label: "Politica de confidentialitate" },
  { slug: "gdpr", label: "GDPR" },
  { slug: "anulare", label: "Politica de anulare" },
] as const;

type CategoryNode = { id: string; name: string; parent_id: string | null; image_url: string | null; sort_order: number };

interface Props {
  business: Business;
  products: Product[];
  storeSettings: StoreSettings | null;
  basePath?: string;
  categories?: CategoryNode[];
  initialPage?: number;
}

// Hero banners. One banner keeps the molded look (complete image, any ratio).
// Two to five render as a swipeable carousel with dots, auto-advance and arrows.
function HeroBanners({ banners, links, alt, basePath }: { banners: string[]; links?: (string | undefined)[]; alt: string; basePath: string }) {
  if (banners.length === 0) return null;
  if (banners.length === 1) {
    const href = links?.[0] ? resolveHref(links[0], basePath) : null;
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={cdnImage(banners[0], 1600)} alt={alt} fetchPriority="high"
        className="block mx-auto w-full h-auto md:w-auto md:max-w-full md:max-h-[60vh] md:rounded-2xl" />
    );
    return (
      <section className="relative overflow-hidden md:pt-6">
        <div className="mx-auto md:max-w-6xl md:px-4">
          {href ? <a href={href} className="block">{img}</a> : img}
        </div>
      </section>
    );
  }
  return <BannerCarousel banners={banners} links={links} alt={alt} basePath={basePath} />;
}

function BannerCarousel({ banners, links, alt, basePath }: { banners: string[]; links?: (string | undefined)[]; alt: string; basePath: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });
  const paused = useRef(false);
  const [index, setIndex] = useState(0);
  const count = banners.length;

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  }, []);

  const goTo = useCallback((i: number) => {
    const el = ref.current;
    if (!el) return;
    const target = ((i % count) + count) % count;
    el.scrollTo({ left: el.clientWidth * target, behavior: "smooth" });
  }, [count]);

  useEffect(() => {
    const id = setInterval(() => {
      if (paused.current) return;
      const el = ref.current;
      if (!el) return;
      const cur = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      el.scrollTo({ left: el.clientWidth * ((cur + 1) % count), behavior: "smooth" });
    }, 5000);
    return () => clearInterval(id);
  }, [count]);

  const arrow =
    "hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full items-center justify-center bg-black/35 text-white hover:bg-black/55 transition-colors";

  return (
    <section
      className="relative overflow-hidden md:pt-6"
      onPointerEnter={() => { paused.current = true; }}
      onPointerLeave={() => { paused.current = false; }}
    >
      <div className="mx-auto md:max-w-6xl md:px-4">
        <div className="relative md:rounded-2xl md:overflow-hidden">
          <div
            ref={ref}
            onScroll={onScroll}
            className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide select-none md:cursor-grab"
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") return;
              const el = ref.current;
              if (!el) return;
              drag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
            }}
            onPointerMove={(e) => {
              if (e.pointerType !== "mouse" || !drag.current.down) return;
              const el = ref.current;
              if (!el) return;
              const dx = e.clientX - drag.current.startX;
              if (Math.abs(dx) > 4) drag.current.moved = true;
              el.scrollLeft = drag.current.startLeft - dx;
            }}
            onPointerUp={(e) => { if (e.pointerType === "mouse") drag.current.down = false; }}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") drag.current.down = false; }}
          >
            {banners.map((src, i) => {
              const href = links?.[i] ? resolveHref(links[i], basePath) : null;
              const img = (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cdnImage(src, 1600)} alt={alt} draggable={false} fetchPriority={i === 0 ? "high" : "low"} loading={i === 0 ? "eager" : "lazy"} className="w-full h-full object-cover" />
              );
              return (
                <div key={i} className="shrink-0 w-full snap-center aspect-[16/9] bg-muted">
                  {href ? (
                    <a href={href} className="block w-full h-full" onClick={(e) => { if (drag.current.moved) e.preventDefault(); }}>{img}</a>
                  ) : img}
                </div>
              );
            })}
          </div>

          <button type="button" aria-label="Banner anterior" onClick={() => goTo(index - 1)} className={`${arrow} left-2`}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Banner urmator" onClick={() => goTo(index + 1)} className={`${arrow} right-2`}>
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
            {banners.map((_, i) => (
              <button key={i} type="button" aria-label={`Mergi la banner ${i + 1}`} onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-surface" : "w-1.5 bg-surface/60 hover:bg-surface/80"}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// Horizontal category strip with desktop affordances: mouse drag-to-scroll
// (gated to pointerType="mouse" so mobile keeps native touch scroll) + prev/next
// arrows shown on md+ when there's more to scroll.
function CategoryScroller({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  // Arrows are shown only when the strip overflows; both slots stay present while
  // it does (the inactive one just fades) so scrolling never shifts the layout.
  const hasOverflow = canLeft || canRight;
  const arrowBtn =
    "hidden md:flex shrink-0 w-8 h-8 rounded-full items-center justify-center border border-border bg-surface transition-opacity";

  return (
    <div className={className}>
      <div className="flex items-center md:gap-1.5">
        {hasOverflow && (
          <button type="button" aria-label="Categorii anterioare" disabled={!canLeft}
            onClick={() => ref.current?.scrollBy({ left: -240, behavior: "smooth" })}
            className={`${arrowBtn} ${canLeft ? "opacity-100 hover:bg-muted" : "opacity-30 pointer-events-none"}`}>
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
        )}
        <div
          ref={ref}
          className="flex-1 min-w-0 overflow-x-auto scrollbar-hide select-none -mx-4 px-4 md:mx-0 md:px-0 md:cursor-grab"
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse") return;
            const el = ref.current;
            if (!el) return;
            drag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
          }}
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse" || !drag.current.down) return;
            const el = ref.current;
            if (!el) return;
            const dx = e.clientX - drag.current.startX;
            if (Math.abs(dx) > 4) drag.current.moved = true;
            el.scrollLeft = drag.current.startLeft - dx;
          }}
          onPointerUp={(e) => { if (e.pointerType === "mouse") drag.current.down = false; }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") drag.current.down = false; }}
          onClickCapture={(e) => {
            if (drag.current.moved) { e.preventDefault(); e.stopPropagation(); drag.current.moved = false; }
          }}
        >
          {children}
        </div>
        {hasOverflow && (
          <button type="button" aria-label="Categorii urmatoare" disabled={!canRight}
            onClick={() => ref.current?.scrollBy({ left: 240, behavior: "smooth" })}
            className={`${arrowBtn} ${canRight ? "opacity-100 hover:bg-muted" : "opacity-30 pointer-events-none"}`}>
            <ChevronRight className="h-4 w-4 text-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

function StoreContent({ business, products, storeSettings, basePath: basePathProp, categories, initialPage = 1 }: Props) {
  const basePath = basePathProp ?? `/${business.slug}`;
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [recoverDiscountCode, setRecoverDiscountCode] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("toate");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
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
  function isProductOutOfStock(p: Product): boolean {
    if (p.is_bundle) {
      const cfg = readBundleConfig(p.page_sections);
      if (!cfg || cfg.items.length === 0) return false;
      return cfg.items.some((it) => {
        const comp = productById.get(it.product_id);
        return !!(comp && comp.track_inventory && (comp.stock_quantity ?? 0) < it.quantity);
      });
    }
    return !!(p.track_inventory && p.stock_quantity === 0);
  }

  // Product filters (price range, variant options, on-sale, in-stock)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);

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
  }
  const activeFilterCount =
    (priceMin.trim() || priceMax.trim() ? 1 : 0) +
    Object.values(selectedOptions).reduce((s, v) => s + v.length, 0) +
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

  const pageContent = (storeSettings?.page_content as PageContent) ?? {};
  const menu = pageContent.menu ?? [];
  const storePolicies = (storeSettings?.store_policies as StorePolicies) ?? {};
  const social = (business.social as Social) ?? {};
  const gallery = Array.isArray(business.gallery) ? (business.gallery as string[]) : [];
  const features = (business.features as Features) ?? {};

  const showGallery = features.show_gallery !== false && gallery.length > 0;
  const showAbout = features.show_about !== false && !!business.description;
  const showContact = features.show_contact !== false && !!(business.phone || business.email || business.store_address);
  const showWhatsApp = features.floating_whatsapp !== false && !!business.whatsapp;
  const showCall = features.floating_call === true && !!business.phone;

  const showTrustStrip = pageContent.show_trust_strip_on_store === true && (pageContent.store_trust_badges?.length ?? 0) > 0;
  const storeBenefits = pageContent.store_benefits_section;
  const reviewsSection = pageContent.reviews_section;
  const showFeaturedSection = pageContent.show_featured_section === true;
  const featuredTitle = pageContent.featured_section_title || "Recomandate";
  const showShippingProgress = pageContent.show_shipping_progress === true && freeShippingThreshold !== null;

  const showAnnouncementOnStore = pageContent.show_announcement_on_store !== false && pageContent.announcement_bar?.enabled === true;
  const announcementBar = pageContent.announcement_bar;

  const showStickyCartBar = pageContent.sticky_cart_bar?.enabled !== false;

  const newBadgeDays = pageContent.new_badge?.enabled !== false ? (pageContent.new_badge?.days ?? 7) : 0;

  // Produse variabile: interval de pret implicit; doar pretul minim daca e dezactivat din editor.
  const priceLowestOnly = pageContent.price_range_display?.enabled === false;

  // Sorting is a standard storefront feature — always shown. Honour the saved
  // default sort if present, otherwise newest-first.
  const defaultSort = pageContent.sort_options?.default_sort ?? "newest";
  const [sort, setSort] = useState<string>(defaultSort);
  // While a search is active and no sort was explicitly chosen, results order
  // by relevance — surfaced as a visible "Relevanta" option in the dropdown.
  const [sortTouched, setSortTouched] = useState(false);
  const showSort = true;

  // Banner source: up to 5 hero_banners (page_content), else the legacy single
  // cover_url. Each banner can carry an optional click link (hero_banner_links,
  // aligned by index); banners + links are filtered together to stay aligned.
  const { heroBanners, heroBannerLinks } = (() => {
    const raw = pageContent.hero_banners;
    const linksRaw = pageContent.hero_banner_links;
    const pairs = (Array.isArray(raw) ? raw : [])
      .map((url, i) => ({ url, link: Array.isArray(linksRaw) ? linksRaw[i] : undefined }))
      .filter((p): p is { url: string; link: string | undefined } => typeof p.url === "string" && !!p.url)
      .slice(0, 5);
    if (pairs.length === 0 && business.cover_url) {
      return { heroBanners: [business.cover_url], heroBannerLinks: [undefined as string | undefined] };
    }
    return { heroBanners: pairs.map((p) => p.url), heroBannerLinks: pairs.map((p) => p.link) };
  })();
  const hasHero = heroBanners.length > 0 || !!business.tagline;
  // By default a banner shows on its own (molded, no overlay); the merchant can
  // opt in to overlaying logo/name/tagline/button.
  const heroImageOnly = heroBanners.length > 0 && pageContent.hero_show_content !== true;
  const showCategoryBadges = pageContent.show_category_badges !== false; // category chip on product cards

  // Category hierarchy — built from the categories table (parent_id) + product
  // assignments. Only categories whose subtree contains products are shown.
  const catTree = useMemo(() => {
    type Item = { key: string; id: string | null; name: string; image: string | null; hasChildren: boolean };
    const list = categories ?? [];
    const productCatNames = new Set<string>();
    products.forEach(p => { if (p.category) productCatNames.add(p.category); });

    const byId = new Map(list.map(c => [c.id, c]));
    const childrenOf = new Map<string, CategoryNode[]>();
    for (const c of list) {
      if (c.parent_id) {
        const arr = childrenOf.get(c.parent_id) ?? [];
        arr.push(c);
        childrenOf.set(c.parent_id, arr);
      }
    }
    for (const arr of childrenOf.values()) arr.sort((a, b) => a.sort_order - b.sort_order);

    const subtreeNames = (c: CategoryNode): string[] => {
      const out = [c.name];
      for (const ch of childrenOf.get(c.id) ?? []) out.push(...subtreeNames(ch));
      return out;
    };
    const hasProducts = (c: CategoryNode): boolean => subtreeNames(c).some(n => productCatNames.has(n));
    const toItem = (c: CategoryNode): Item => ({
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
  }, [categories, products]);

  const [drillParentId, setDrillParentId] = useState<string | null>(null);
  const drillParent = drillParentId ? catTree.byId.get(drillParentId) ?? null : null;
  const currentItems = drillParentId ? (catTree.childItemsById[drillParentId] ?? []) : catTree.topItems;
  const hasCategories = catTree.topItems.length > 0;
  const hasAnyCategoryImage = catTree.hasAnyImage;

  function selectCategoryItem(item: { id: string | null; name: string; hasChildren: boolean }) {
    // Drill into a category that has subcategories; otherwise just filter by it.
    if (item.hasChildren && item.id) setDrillParentId(item.id);
    setCategoryFilter(item.name);
  }
  function resetCategory() {
    setCategoryFilter("toate");
    setDrillParentId(null);
  }
  function goBackCategory() {
    const backTo = drillParent?.parent_id ?? null;
    setDrillParentId(backTo);
    setCategoryFilter(backTo ? (catTree.byId.get(backTo)?.name ?? "toate") : "toate");
  }

  // Featured products
  const featuredProducts = useMemo(() => products.filter(p => p.is_featured), [products]);

  // Custom product sections — curated rows shown above the main catalog. Resolved
  // from the already-loaded product list (no extra queries); empty ones are dropped.
  const productSections = useMemo(() => {
    return parseProductSections(pageContent.product_sections)
      .filter(s => s.enabled)
      .map(section => ({ section, items: resolveSectionProducts(section, products, catTree.subtreeByName) }))
      .filter(x => x.items.length > 0);
  }, [pageContent.product_sections, products, catTree.subtreeByName]);

  function viewAllCategory(category: string) {
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
    for (const p of products) {
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
  }, [products]);

  // Search engine — diacritics-insensitive + typo-tolerant, ranked by
  // relevance (see @/lib/storefront/product-search). Deferred so results
  // recompute off the urgent keystroke render.
  const deferredSearch = useDeferredValue(search);
  const searchIdx = useMemo(() => buildProductSearchIndex(products.map((p) => {
    const ps = p.page_sections as { variants?: { enabled?: boolean; options?: { name: string; values: string[] }[] } } | null;
    const optionValues = ps?.variants?.enabled
      ? (ps.variants.options ?? []).flatMap((o) => (Array.isArray(o?.values) ? o.values.map(String) : []))
      : undefined;
    return { id: p.id, name: p.name, category: p.category, description: p.description, optionValues };
  })), [products]);
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
    const list = products.filter(p => {
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
      return matchesSearch && matchesCategory && matchesPrice && matchesSale && matchesStock && matchesOptions;
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
  }, [products, searchMatches, categoryFilter, effectiveSort, priceMin, priceMax, selectedOptions, onSaleOnly, inStockOnly]);

  // Shared filter fields — reused by the desktop inline panel and the mobile sheet.
  const filterFields = (
    <>
      <div>
        <p className="text-xs font-semibold text-foreground mb-2">Pret (lei)</p>
        <div className="flex items-center gap-2">
          <input type="number" inputMode="numeric" min={0} placeholder={`De la ${facets.priceMin}`}
            value={priceMin} onChange={(e) => setPriceMin(e.target.value)}
            className="w-28 px-3 py-2 text-sm border border-border rounded-xl bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
          <span className="text-muted-foreground">-</span>
          <input type="number" inputMode="numeric" min={0} placeholder={`Pana la ${facets.priceMax}`}
            value={priceMax} onChange={(e) => setPriceMax(e.target.value)}
            className="w-28 px-3 py-2 text-sm border border-border rounded-xl bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
        </div>
      </div>

      {facets.options.map((opt) => (
        <div key={opt.name}>
          <p className="text-xs font-semibold text-foreground mb-2">{opt.name}</p>
          <div className="flex flex-wrap gap-2">
            {opt.values.map((v) => {
              const active = (selectedOptions[opt.name] ?? []).includes(v);
              return (
                <button key={v} type="button" onClick={() => toggleOption(opt.name, v)}
                  className="px-3 py-1.5 rounded-full text-sm border transition-colors"
                  style={active
                    ? { backgroundColor: color, color: "white", borderColor: color }
                    : { backgroundColor: "transparent", color: "var(--color-foreground)", borderColor: "var(--color-border)" }}>
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" onClick={() => setOnSaleOnly((v) => !v)}
          className="px-3 py-1.5 rounded-full text-sm border transition-colors"
          style={onSaleOnly ? { backgroundColor: color, color: "white", borderColor: color } : { backgroundColor: "transparent", color: "var(--color-foreground)", borderColor: "var(--color-border)" }}>
          Doar reduceri
        </button>
        <button type="button" onClick={() => setInStockOnly((v) => !v)}
          className="px-3 py-1.5 rounded-full text-sm border transition-colors"
          style={inStockOnly ? { backgroundColor: color, color: "white", borderColor: color } : { backgroundColor: "transparent", color: "var(--color-foreground)", borderColor: "var(--color-border)" }}>
          Doar in stoc
        </button>
      </div>
    </>
  );

  const PRODUCTS_PER_PAGE = 20;
  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * PRODUCTS_PER_PAGE,
    currentPage * PRODUCTS_PER_PAGE,
  );

  // Reset to page 1 when filters change — but not on the initial mount, which
  // would clobber a page restored from the URL.
  const filtersInitRef = useRef(true);
  useEffect(() => {
    if (filtersInitRef.current) { filtersInitRef.current = false; return; }
    goToPage(1);
  }, [search, categoryFilter, effectiveSort, priceMin, priceMax, selectedOptions, onSaleOnly, inStockOnly, goToPage]);

  function handleAddToCart(product: Product) {
    const images = Array.isArray(product.images) ? product.images : [];
    addItem({
      productId: product.id,
      slug: product.slug ?? undefined,
      name: product.name,
      price: Number(product.price),
      imageUrl: images[0] ? String(images[0]) : null,
    });
    fbTrack("AddToCart", { value: Number(product.price), currency: "RON", content_name: product.name, content_ids: [product.id], content_type: "product" });
    ttqTrack("AddToCart", { value: Number(product.price), currency: "RON", contents: [{ content_id: product.id, content_type: "product", content_name: product.name, price: Number(product.price), quantity: 1 }] });
    gtagEvent("add_to_cart", { currency: "RON", value: Number(product.price), items: [{ item_id: product.id, item_name: product.name, price: Number(product.price), quantity: 1 }] });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1500);
  }

  // Has any policy text
  const hasPolicies = Object.values(storePolicies).some(v => {
    if (!v) return false;
    if (typeof v === "string") return v.trim().length > 0;
    return typeof v === "object" && !!v.content && v.enabled !== false;
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: pageContent.store_bg_color || "var(--color-background)" }}>
      {/* Announcement bar */}
      {showAnnouncementOnStore && announcementBar && (
        <div className="h-9 overflow-hidden flex items-center sticky top-0 z-40"
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

      {/* Sticky header */}
      <header className={`sticky ${showAnnouncementOnStore ? "top-9" : "top-0"} z-30 bg-background/95 backdrop-blur-md border-b border-border`}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <StoreNavHamburger items={menu} basePath={basePath} color={color} logoUrl={business.logo_url} storeName={business.store_name ?? business.business_name} />
          <a href="#" className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity">
            {business.logo_url ? (
              /* Free logo: full image at any ratio, merchant-set height, no box/crop. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cdnImage(business.logo_url, 320)} alt={business.store_name ?? business.business_name}
                style={{ height: pageContent.logo_size ?? 36, maxWidth: (pageContent.logo_size ?? 36) * 4.2 }}
                className="w-auto object-contain flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ backgroundColor: color }}>
                {(business.store_name ?? business.business_name)[0]?.toUpperCase()}
              </div>
            )}
          </a>

          <StoreNavLinks items={menu} basePath={basePath} color={color} className="flex-1 justify-center" />

          <div className="flex items-center gap-2 ml-auto">
            {showCall && (
              <a href={`tel:${business.phone}`}
                className="hidden sm:flex items-center justify-center hover:opacity-80 transition-opacity">
                <svg viewBox="0 0 64 64" className="h-9 w-9" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="32" cy="32" r="32" fill={color}/>
                  <svg x="16" y="16" width="32" height="32" viewBox="0 0 24 24">
                    <path fill="white" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                  </svg>
                </svg>
              </a>
            )}
            {showWhatsApp && (
              <a href={whatsappLink(business.whatsapp!)} target="_blank" rel="noopener noreferrer"
                className="hidden sm:flex items-center justify-center hover:opacity-80 transition-opacity">
                <svg viewBox="0 0 64 64" className="h-9 w-9" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="32" cy="32" r="32" fill="#25D366"/>
                  <svg x="15" y="13" width="34" height="38" viewBox="0 0 448 512">
                    <path fill="white" d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/>
                  </svg>
                </svg>
              </a>
            )}
            <button type="button" aria-label="Deschide cosul de cumparaturi" onClick={() => setCartOpen(true)}
              className="relative flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-surface hover:bg-muted transition-colors">
              <ShoppingCart className="h-4 w-4 text-foreground" />
              {count > 0 ? (
                <span className="text-sm font-semibold text-foreground tabular-nums">{count}</span>
              ) : (
                <span className="hidden sm:inline text-sm text-muted-foreground">Cos</span>
              )}
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: color }}>
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Exactly one H1 per page: hidden when the overlay hero already shows one. */}
      {(heroImageOnly || !hasHero) && (
        <h1 className="sr-only">
          {business.store_name ?? business.business_name}
          {business.tagline ? ` - ${business.tagline}` : ""}
        </h1>
      )}

      {/* Hero */}
      {heroImageOnly ? (
        <HeroBanners banners={heroBanners} links={heroBannerLinks} alt={business.store_name ?? business.business_name} basePath={basePath} />
      ) : hasHero ? (
        <section className="relative overflow-hidden">
          <div className="absolute inset-0" style={{ backgroundColor: color }} />
          {heroBanners[0] && (
            <Image src={heroBanners[0]} alt="" fill className="object-cover" sizes="100vw" priority />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/70" />
          <div className="relative z-10 max-w-3xl mx-auto px-4 py-20 sm:py-28 text-center text-white">
            {business.logo_url && (
              <Image src={business.logo_url} alt={business.store_name ?? business.business_name}
                width={72} height={72}
                className="rounded-2xl object-cover mx-auto mb-5 border-2 border-white/20 shadow-2xl" />
            )}
            <h1 className="text-3xl sm:text-4xl font-bold mb-3 drop-shadow-sm tracking-tight">
              {business.store_name ?? business.business_name}
            </h1>
            {business.tagline && (
              <p className="text-lg text-white/85 mb-8 leading-relaxed max-w-xl mx-auto">{business.tagline}</p>
            )}
            <a href="#produse"
              className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-bold rounded-2xl shadow-lg transition-all hover:scale-105 active:scale-[0.98]"
              style={{ backgroundColor: color, color: "white", boxShadow: `0 4px 20px ${color}88` }}>
              <ShoppingCart className="h-4 w-4" />
              Cumpara acum
            </a>
          </div>
        </section>
      ) : null}

      {/* Trust strip */}
      {showTrustStrip && pageContent.store_trust_badges && (
        <section className="border-b border-border bg-surface">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {pageContent.store_trust_badges.map((badge, i) => {
                const Icon = TRUST_ICONS[badge.icon] ?? ShieldCheck;
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: `${color}15`, color }}>
                      <Icon className="h-4.5 w-4.5" size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{badge.title}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight truncate">{badge.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* Search + Sort + Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Cauta produse..."
              value={search}
              onChange={(e) => {
                const v = e.target.value;
                // A fresh search starts back on relevance ordering.
                if (search === "" && v !== "") setSortTouched(false);
                setSearch(v);
              }}
              className="w-full pl-10 pr-4 py-3 text-sm border border-border rounded-2xl bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            />
          </div>
          {showSort && (
            <div className="relative w-full md:w-auto shrink-0">
              <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <select aria-label="Sorteaza produsele" value={effectiveSort}
                onChange={e => {
                  const v = e.target.value;
                  if (v === "relevance") setSortTouched(false);
                  else { setSort(v); setSortTouched(true); }
                }}
                style={{ WebkitAppearance: "none", MozAppearance: "none" }}
                className="h-[46px] w-full md:w-auto appearance-none cursor-pointer pl-10 pr-9 text-sm border border-border rounded-2xl bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                {searchMatches != null && <option value="relevance">Relevanta</option>}
                <option value="newest">Cele mai noi</option>
                <option value="price_asc">Pret crescator</option>
                <option value="price_desc">Pret descrescator</option>
                <option value="popular">Populare</option>
                <option value="name_asc">Alfabetic A-Z</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="h-[46px] px-4 w-full md:w-auto justify-center inline-flex items-center gap-2 text-sm border border-border rounded-2xl bg-surface hover:bg-muted transition-colors"
            style={filtersOpen || activeFilterCount > 0 ? { borderColor: color, color } : { color: "var(--color-foreground)" }}
          >
            <Filter className="h-4 w-4" />
            Filtre
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters — desktop: inline panel */}
        {filtersOpen && (
          <div className="hidden md:block mb-6 rounded-2xl border border-border bg-surface p-4 space-y-4">
            {filterFields}
            {activeFilterCount > 0 && (
              <button type="button" onClick={resetFilters}
                className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2">
                Reseteaza filtrele
              </button>
            )}
          </div>
        )}

        {/* Filters — mobile: bottom sheet */}
        {filtersOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/40" onClick={() => setFiltersOpen(false)} />
            <div className="relative bg-surface rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <p className="text-base font-semibold text-foreground">
                  Filtre{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </p>
                <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Inchide"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {filterFields}
              </div>
              <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
                <button type="button" onClick={resetFilters}
                  className="px-4 py-2.5 text-sm font-medium border border-border rounded-xl text-foreground hover:bg-muted transition-colors">
                  Reseteaza
                </button>
                <button type="button" onClick={() => setFiltersOpen(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-opacity hover:opacity-90"
                  style={{ backgroundColor: color }}>
                  Vezi {filteredProducts.length} {filteredProducts.length === 1 ? "produs" : "produse"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Category filters — pills (no category images), hierarchy-aware.
            Single horizontally-scrollable row (carousel) so a long list of
            categories doesn't sprawl into many wrapped rows. */}
        {hasCategories && !hasAnyCategoryImage && (
          <CategoryScroller className="mb-6">
            <div className="flex items-center gap-2 pb-1 w-max mx-auto">
              {drillParentId ? (
                <button
                  type="button"
                  onClick={goBackCategory}
                  className="flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium transition-all inline-flex items-center gap-1"
                  style={{ backgroundColor: "transparent", color: "var(--color-muted-foreground)", border: "1px solid var(--color-border)" }}
                >
                  <ChevronLeft size={14} /> {drillParent?.name ?? "Inapoi"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resetCategory}
                  className="flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium transition-all"
                  style={categoryFilter === "toate"
                    ? { backgroundColor: color, color: "white" }
                    : { backgroundColor: "transparent", color: "var(--color-muted-foreground)", border: "1px solid var(--color-border)" }}
                >
                  Toate
                </button>
              )}
              {currentItems.map(item => {
                const active = categoryFilter === item.name;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => selectCategoryItem(item)}
                    className="flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium transition-all inline-flex items-center gap-1"
                    style={active
                      ? { backgroundColor: color, color: "white" }
                      : { backgroundColor: "transparent", color: "var(--color-muted-foreground)", border: "1px solid var(--color-border)" }}
                  >
                    {item.name}{item.hasChildren && <ChevronRight size={13} className="opacity-70" />}
                  </button>
                );
              })}
            </div>
          </CategoryScroller>
        )}

        {/* Category image carousel — circles, hierarchy-aware (drill into subcategories) */}
        {hasCategories && hasAnyCategoryImage && (
          <CategoryScroller className="mb-6">
            <div className="flex gap-4 pb-1 w-max mx-auto">
              {/* Leading control: Toate (top level) or Inapoi (drilled into a category) */}
              {drillParentId ? (
                <button
                  type="button"
                  onClick={goBackCategory}
                  className="flex flex-col items-center gap-2 flex-shrink-0 group"
                >
                  <div
                    className="w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all border-2"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-muted)" }}
                  >
                    <ChevronLeft className="w-6 h-6" style={{ color: "var(--color-muted-foreground)" }} />
                  </div>
                  <span className="text-xs font-medium text-center leading-tight w-[84px] break-words min-h-[30px]"
                    style={{ color: "var(--color-muted-foreground)" }}>
                    {drillParent?.name ?? "Inapoi"}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resetCategory}
                  className="flex flex-col items-center gap-2 flex-shrink-0 group"
                >
                  <div
                    className="w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all border-2"
                    style={{
                      borderColor: categoryFilter === "toate" ? color : "var(--color-border)",
                      backgroundColor: categoryFilter === "toate" ? `${color}15` : "var(--color-muted)",
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6" style={{ color: categoryFilter === "toate" ? color : "var(--color-muted-foreground)" }}>
                      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-center leading-tight w-[84px] break-words min-h-[30px]"
                    style={{ color: categoryFilter === "toate" ? color : "var(--color-muted-foreground)" }}>
                    Toate
                  </span>
                </button>
              )}
              {currentItems.map(item => {
                const active = categoryFilter === item.name;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => selectCategoryItem(item)}
                    className="flex flex-col items-center gap-2 flex-shrink-0 group"
                  >
                    <div
                      className="relative w-[72px] h-[72px] rounded-full overflow-hidden transition-all border-2"
                      style={{
                        borderColor: active ? color : "var(--color-border)",
                        boxShadow: active ? `0 0 0 2px ${color}40` : "none",
                      }}
                    >
                      {item.image ? (
                        <Image src={item.image} alt={item.name} fill sizes="72px" className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"
                          style={{ backgroundColor: active ? `${color}15` : "var(--color-muted)" }}>
                          <span className="text-lg font-bold" style={{ color: active ? color : "var(--color-muted-foreground)" }}>
                            {item.name[0]?.toUpperCase()}
                          </span>
                        </div>
                      )}
                      {item.hasChildren && (
                        <span className="absolute bottom-0.5 right-0.5 rounded-full bg-surface/95 p-0.5 shadow-sm flex items-center justify-center" style={{ color }}>
                          <Layers className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-center leading-tight w-[84px] break-words min-h-[30px]"
                      style={{ color: active ? color : "var(--color-muted-foreground)" }}>
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </CategoryScroller>
        )}

        {/* Shipping progress bar */}
        {showShippingProgress && freeShippingThreshold && (
          <ShippingProgressBanner color={color} threshold={freeShippingThreshold} />
        )}

        {/* Featured section */}
        {showFeaturedSection && featuredProducts.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold text-foreground">{featuredTitle}</h2>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {featuredProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  color={color}
                  basePath={basePath}
                  onAddToCart={() => handleAddToCart(product)}
                  isAdded={addedId === product.id}
                  newBadgeDays={newBadgeDays}
                  outOfStock={isProductOutOfStock(product)}
                  showCategoryBadge={showCategoryBadges}
                  priceLowestOnly={priceLowestOnly}
                />
              ))}
            </div>
          </section>
        )}

        {/* Custom product sections (curated rows above the main catalog) */}
        {productSections.map(({ section, items }) => (
          <section key={section.id} className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-bold text-foreground">{section.title || "Produse"}</h2>
              <div className="h-px flex-1 bg-border" />
              {section.mode === "category" && section.category && (
                <button type="button" onClick={() => viewAllCategory(section.category!)}
                  className="flex items-center gap-1 text-xs font-semibold whitespace-nowrap transition-opacity hover:opacity-70"
                  style={{ color }}>
                  Vezi toate
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {section.layout === "carousel" ? (
              <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
                {items.map(product => (
                  <div key={product.id} className="snap-start shrink-0 w-[44%] sm:w-[30%] lg:w-[23%]">
                    <ProductCard
                      product={product}
                      color={color}
                      basePath={basePath}
                      onAddToCart={() => handleAddToCart(product)}
                      isAdded={addedId === product.id}
                      newBadgeDays={newBadgeDays}
                      outOfStock={isProductOutOfStock(product)}
                      showCategoryBadge={showCategoryBadges}
                      priceLowestOnly={priceLowestOnly}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {items.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    color={color}
                    basePath={basePath}
                    onAddToCart={() => handleAddToCart(product)}
                    isAdded={addedId === product.id}
                    newBadgeDays={newBadgeDays}
                    outOfStock={isProductOutOfStock(product)}
                    showCategoryBadge={showCategoryBadges}
                    priceLowestOnly={priceLowestOnly}
                  />
                ))}
              </div>
            )}
          </section>
        ))}

        {/* Products */}
        <section id="produse" className="mb-16">
          {!hasHero && !showFeaturedSection && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">Produse</h2>
            </div>
          )}
          {showFeaturedSection && featuredProducts.length > 0 && filteredProducts.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-base font-bold text-foreground">Toate produsele</h2>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          {filteredProducts.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-2xl">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <ShoppingCart className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground mb-1">
                {search || categoryFilter !== "toate" ? "Niciun produs gasit" : "Niciun produs disponibil"}
              </p>
              <p className="text-sm text-muted-foreground">
                {search || categoryFilter !== "toate" ? "Incearca alta cautare sau categorie." : "Reveniti curand pentru produse noi."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {paginatedProducts.map((product, i) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    color={color}
                    basePath={basePath}
                    onAddToCart={() => handleAddToCart(product)}
                    isAdded={addedId === product.id}
                    newBadgeDays={newBadgeDays}
                    outOfStock={isProductOutOfStock(product)}
                    showCategoryBadge={showCategoryBadges}
                    priority={i < 4}
                    priceLowestOnly={priceLowestOnly}
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => { goToPage(Math.max(1, currentPage - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm rounded-lg border border-border disabled:opacity-30 hover:bg-muted transition-colors"
                  >
                    Inapoi
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | "dots")[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("dots");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "dots" ? (
                        <span key={`dots-${i}`} className="px-1 text-muted-foreground">...</span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => { goToPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                          className="min-w-[36px] h-9 text-sm rounded-lg border transition-colors"
                          style={currentPage === p
                            ? { backgroundColor: color, borderColor: color, color: "#fff" }
                            : { borderColor: "var(--color-border)" }}
                        >
                          {p}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => { goToPage(Math.min(totalPages, currentPage + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm rounded-lg border border-border disabled:opacity-30 hover:bg-muted transition-colors"
                  >
                    Inainte
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Store benefits */}
        {storeBenefits?.enabled && storeBenefits.items.length > 0 && (
          <section className="mb-16">
            <h2 className="text-xl font-semibold text-foreground mb-6">{storeBenefits.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {storeBenefits.items.map((item, i) => (
                <div key={i} className="flex gap-4 p-5 bg-surface border border-border rounded-2xl">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm text-white"
                    style={{ backgroundColor: color }}>
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm mb-1">{item.title}</p>
                    <p className="text-muted-foreground text-xs leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Reviews */}
        {reviewsSection?.enabled && reviewsSection.items.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center gap-2 mb-6">
              <h2 className="text-xl font-semibold text-foreground">{reviewsSection.title}</h2>
              <div className="h-px flex-1 bg-border" />
              <div className="flex items-center gap-1">
                {[1,2,3,4,5].map(s => (
                  <svg key={s} viewBox="0 0 20 20" className="h-4 w-4" fill="#FBBF24">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
                <span className="text-xs font-semibold text-foreground ml-1">
                  {(reviewsSection.items.reduce((s, r) => s + r.rating, 0) / reviewsSection.items.length).toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">({reviewsSection.items.length})</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {reviewsSection.items.map((review, i) => (
                <div key={i} className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(s => (
                      <svg key={s} viewBox="0 0 20 20" className="h-3.5 w-3.5"
                        fill={s <= review.rating ? "#FBBF24" : "none"}
                        stroke={s <= review.rating ? "#FBBF24" : "#D1D5DB"} strokeWidth="1.5">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  {review.text && (
                    <p className="text-sm text-foreground leading-relaxed flex-1">
                      &ldquo;{review.text}&rdquo;
                    </p>
                  )}
                  <div className="flex items-center gap-2.5 pt-1 border-t border-border">
                    {review.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={review.image} alt={review.name || "Client"}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-border" />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: color }}>
                        {review.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{review.name || "Anonim"}</p>
                      {review.date && (
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(review.date).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Gallery */}
        {showGallery && (
          <section className="mb-16">
            <h2 className="text-xl font-semibold text-foreground mb-6">Galerie foto</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {gallery.map((url, i) => (
                <button key={i} type="button" onClick={() => setLightboxUrl(url)}
                  aria-label={`Deschide imaginea ${i + 1} din galerie`}
                  className="relative aspect-square rounded-2xl overflow-hidden bg-muted border border-border hover:scale-[1.02] hover:shadow-md transition-all duration-200">
                  <Image src={url} alt={`Galerie ${i + 1}`} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* About */}
        {showAbout && (
          <section className="mb-16">
            <h2 className="text-xl font-semibold text-foreground mb-4">Despre noi</h2>
            <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8">
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{business.description}</p>
            </div>
          </section>
        )}

        {/* Contact */}
        {showContact && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-foreground mb-4">Contact</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {business.phone && (
                <a href={`tel:${business.phone}`}
                  className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:border-primary/30 hover:bg-primary/5 transition-all">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}20`, color }}>
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Telefon</p>
                    <p className="text-sm font-semibold text-foreground">{business.phone}</p>
                  </div>
                </a>
              )}
              {business.email && (
                <a href={`mailto:${business.email}`}
                  className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl hover:border-primary/30 hover:bg-primary/5 transition-all">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}20`, color }}>
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                    <p className="text-sm font-semibold text-foreground truncate">{business.email}</p>
                  </div>
                </a>
              )}
              {business.store_address && (
                <div className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}20`, color }}>
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Adresa</p>
                    <p className="text-sm font-semibold text-foreground">
                      {business.store_address}{business.store_city ? `, ${business.store_city}` : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-[#0A0A0A] text-white">
        <div className="max-w-6xl mx-auto px-5 pt-10 pb-6 sm:pt-12">
          {/* Top row: brand + social */}
          <div className="flex items-center justify-between gap-4 pb-8">
            <div className="flex items-center gap-3 min-w-0">
              {business.logo_url ? (
                /* Free logo at the merchant-set footer size — matches the header (no box/crop). */
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
            </div>
            {(social.instagram || social.facebook || social.tiktok || social.website) && (
              <div className="flex items-center gap-1.5 shrink-0">
                {social.instagram && (
                  <a href={social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                    className="w-8 h-8 rounded-lg bg-surface/[0.06] hover:bg-surface/[0.12] flex items-center justify-center transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                    </svg>
                  </a>
                )}
                {social.facebook && (
                  <a href={social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                    className="w-8 h-8 rounded-lg bg-surface/[0.06] hover:bg-surface/[0.12] flex items-center justify-center transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
                    </svg>
                  </a>
                )}
                {social.tiktok && (
                  <a href={social.tiktok} target="_blank" rel="noopener noreferrer" aria-label="TikTok"
                    className="w-8 h-8 rounded-lg bg-surface/[0.06] hover:bg-surface/[0.12] flex items-center justify-center transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.82a8.16 8.16 0 004.77 1.52V6.9a4.85 4.85 0 01-1-.21z"/>
                    </svg>
                  </a>
                )}
                {social.website && (
                  <a href={social.website} target="_blank" rel="noopener noreferrer" aria-label="Website"
                    className="w-8 h-8 rounded-lg bg-surface/[0.06] hover:bg-surface/[0.12] flex items-center justify-center transition-colors">
                    <Globe className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-surface/[0.06]" />

          {/* Middle: policies + consumer protection side by side on desktop, stacked on mobile */}
          <div className="py-6 sm:py-8 flex flex-col sm:flex-row sm:items-start gap-8 sm:gap-16">
            {/* Policies */}
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Informatii legale</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {/* Funcția de retragere din contract — obligatorie conform OUG 18/2026 */}
                <a href={`${basePath}/retur`}
                  className="text-[13px] text-white/70 hover:text-white transition-colors font-medium">
                  Retrage-te din contract
                </a>
                {POLICY_LINKS.map(({ slug: pSlug, label }) => (
                  <a key={pSlug} href={`${basePath}/politici/${pSlug}`}
                    className="text-[13px] text-white/50 hover:text-white transition-colors">
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {/* SAL / SOL */}
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
          <div className="h-px bg-surface/[0.06]" />

          {/* Bottom: copyright */}
          <div className="pt-5 flex items-center justify-between gap-3">
            <p className="text-[11px] text-white/25">
              &copy; {new Date().getFullYear()} {business.store_name ?? business.business_name}
            </p>
            <EdinioCredit businessId={business.id} color={color} className="text-[11px] text-white/25" />
          </div>
        </div>
      </footer>

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
          <button type="button" onClick={() => setCartOpen(true)}
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
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        color={color}
        basePath={basePath}
        businessId={business.id}
        onCheckout={() => {
          setCartOpen(false); setCheckoutOpen(true);
          fbTrack("InitiateCheckout", { value: total, currency: "RON", num_items: count, content_type: "product", content_ids: cartItemsForTracking.map((i) => i.productId) });
          ttqTrack("InitiateCheckout", { value: total, currency: "RON", contents: cartItemsForTracking.map((i) => ({ content_id: i.productId, content_type: "product", content_name: i.name, price: i.price, quantity: i.quantity })) });
          gtagEvent("begin_checkout", { currency: "RON", value: total, items: cartItemsForTracking.map((i) => ({ item_id: i.productId, item_name: i.name, price: i.price, quantity: i.quantity })) });
        }}
        shippingCost={shippingCost}
        freeShippingThreshold={freeShippingThreshold}
        minOrderAmount={minOrderAmount}
      />

      {/* Checkout modal */}
      <CartCheckoutModal
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

      {/* Gallery lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}>
          <button type="button" aria-label="Inchide galeria" onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-surface/10 flex items-center justify-center text-white hover:bg-surface/20 transition-colors">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="Imagine galerie marita"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function ShippingProgressBanner({ color, threshold }: { color: string; threshold: number }) {
  const { total } = useCart();
  const isFree = total >= threshold;
  const pct = Math.min(100, Math.round((total / threshold) * 100));

  return (
    <div className="mb-6 p-3.5 rounded-2xl border border-border bg-surface">
      {isFree ? (
        <div className="flex items-center gap-2" style={{ color }}>
          <Check className="h-4 w-4 flex-shrink-0" strokeWidth={3} />
          <span className="text-sm font-semibold">Felicitari! Ai obtinut livrare gratuita.</span>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              {total > 0
                ? <>Mai adauga <strong className="text-foreground">{formatPrice(threshold - total)}</strong> pentru livrare gratuita</>
                : <>Livrare gratuita la comenzi peste <strong className="text-foreground">{formatPrice(threshold)}</strong></>
              }
            </span>
            <Truck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function MiniStoreRenderer(props: Props) {
  return (
    <CartProvider slug={props.business.slug}>
      <StoreContent {...props} />
    </CartProvider>
  );
}
