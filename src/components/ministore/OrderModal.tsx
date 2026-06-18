"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, User, Phone, MapPin, Home, Loader2, Banknote, CreditCard,
  Minus, Plus, Check, Tag, Truck, BadgePercent, ChevronRight, Package, Mail,
  Upload, Palette,
} from "lucide-react";
import { placeOrder } from "@/lib/actions/order.actions";
import { validateDiscount, type ValidatedDiscount } from "@/lib/actions/discount.actions";
import { getPublicStoreConfig } from "@/lib/actions/store.actions";
import { trackAbandonedCart } from "@/lib/actions/abandoned-cart.actions";
import { getCartSessionId } from "@/lib/cart-session";
import { CourierSelector, type CourierSelection } from "./CourierSelector";
import { computeCardDiscount, type PaymentMethodType, type CardDiscountConfig } from "@/lib/payment-methods";

const JUDETE = [
  "Municipiul Bucuresti","Alba","Arad","Arges","Bacau","Bihor","Bistrita-Nasaud","Botosani",
  "Braila","Brasov","Buzau","Calarasi","Cluj","Constanta","Covasna","Dambovita","Dolj",
  "Galati","Giurgiu","Gorj","Harghita","Hunedoara","Ialomita","Iasi","Ilfov","Maramures",
  "Mehedinti","Mures","Neamt","Olt","Prahova","Salaj","Satu Mare","Sibiu","Suceava",
  "Teleorman","Timis","Tulcea","Vaslui","Valcea","Vrancea",
];

export interface QuantityTier {
  qty: number;
  price: number;   // total bundle price
  badge?: string;
}

export interface CustomizationFieldDef {
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

interface CheckoutConfig {
  custom_fields?: Array<{ id: string; label: string; type: "text" | "textarea" | "select" | "checkbox"; options?: string; required: boolean; placeholder?: string; }>;
  extras?: Array<{ id: string; label: string; price: number; description?: string; }>;
  hidden_fields?: string[];
  email_field?: { enabled: boolean; required: boolean };
}

interface Props {
  open: boolean;
  onClose: () => void;
  product: {
    id: string;
    name: string;
    price: number;
    compare_at_price?: number | null;
    images: string[];
  };
  business: {
    id: string;
    slug: string;
    basePath: string;
    primary_color: string;
  };
  shippingCost: number;
  freeShippingThreshold: number | null;
  minOrderAmount?: number | null;
  tiers?: QuantityTier[];
  customizationFields?: CustomizationFieldDef[];
}

const inputCls = "flex-1 px-3 py-2.5 text-sm text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none";

function IconInput({ icon: Icon, error, children }: {
  icon: React.ElementType; error?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`flex overflow-hidden rounded-lg border ${error ? "border-red-400" : "border-gray-200"} focus-within:border-gray-400 transition-colors`}>
      <span className="flex items-center justify-center w-10 shrink-0 bg-gray-50">
        <Icon size={15} className="text-gray-500" />
      </span>
      {children}
    </div>
  );
}

export function OrderModal({ open, onClose, product, business, shippingCost, freeShippingThreshold, minOrderAmount, tiers, customizationFields }: Props) {
  const color = business.primary_color;
  const hasTiers = tiers && tiers.length > 0;
  const hasCustomization = customizationFields && customizationFields.length > 0;
  const [liveCheckoutConfig, setLiveCheckoutConfig] = useState<CheckoutConfig | undefined>(undefined);
  const [paymentMethods, setPaymentMethods] = useState<{ type: PaymentMethodType; label: string }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>("cash_on_delivery");
  const [cardDiscountConfig, setCardDiscountConfig] = useState<CardDiscountConfig>({ enabled: false, type: "percent", value: 0 });
  const customFields = liveCheckoutConfig?.custom_fields ?? [];
  const extras = liveCheckoutConfig?.extras ?? [];
  const hiddenFields = liveCheckoutConfig?.hidden_fields ?? [];
  const emailField = liveCheckoutConfig?.email_field ?? { enabled: true, required: false };

  const [selectedTierIdx, setSelectedTierIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [form, setForm] = useState({ name: "", phone: "", email: "", county: "", city: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [selectedExtras, setSelectedExtras] = useState<Record<string, boolean>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [courierSelection, setCourierSelection] = useState<CourierSelection | null>(null);
  const [hasCouriers, setHasCouriers] = useState(false);

  // Customization state
  const [custValues, setCustValues] = useState<Record<string, string | string[]>>({});
  const [custUploading, setCustUploading] = useState<Record<string, boolean>>({});

  // Discount state
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<ValidatedDiscount | null>(null);
  const [discountError, setDiscountError] = useState("");
  const [isValidating, setIsValidating] = useState(false);

  // Derive effective qty and raw subtotal (before discount)
  const effectiveQty = hasTiers ? tiers![selectedTierIdx].qty : quantity;
  const subtotal = hasTiers ? tiers![selectedTierIdx].price : product.price * quantity;
  const extrasTotal = extras.filter(e => selectedExtras[e.id]).reduce((s, e) => s + e.price, 0);

  // Apply discount to subtotal
  const discountAmount = appliedDiscount ? appliedDiscount.discountAmount : 0;
  const discountedSubtotal = subtotal - discountAmount;

  // Shipping: courier price > flat rate fallback; free_shipping discount overrides
  const baseShippingCost = courierSelection ? courierSelection.price : shippingCost;
  const isFreeShipping = appliedDiscount?.type === "free_shipping";
  const shipping = isFreeShipping
    ? 0
    : freeShippingThreshold && subtotal >= freeShippingThreshold
      ? 0
      : baseShippingCost;

  // Card-payment discount (mirrors the server): only for online card methods, on
  // the goods value after promo. Updates live as the customer switches method.
  const cardDiscountAmount = computeCardDiscount(cardDiscountConfig, paymentMethod, discountedSubtotal + extrasTotal);
  const total = discountedSubtotal + extrasTotal + shipping - cardDiscountAmount;

  // Minimum order value is checked against the pre-discount subtotal (mirrors the server guard).
  const belowMinOrder = minOrderAmount != null && subtotal < minOrderAmount;

  // Abandoned-cart capture (buy-now / single product). Server ignores it unless
  // the store opted in; debounced + fire-and-forget.
  const [sessionId, setSessionId] = useState("");
  useEffect(() => { setSessionId(getCartSessionId(business.slug)); }, [business.slug]);

  const trackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open || !sessionId) return;
    const phoneDigits = form.phone.replace(/\D/g, "");
    if (!form.email.includes("@") && phoneDigits.length < 6) return;
    const unit = effectiveQty > 0 ? Math.round((subtotal / effectiveQty) * 100) / 100 : product.price;
    if (trackTimer.current) clearTimeout(trackTimer.current);
    trackTimer.current = setTimeout(() => {
      void trackAbandonedCart({
        businessId: business.id,
        sessionId,
        source: "buy_now",
        name: form.name.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.replace(/[\s\-().]/g, "") || undefined,
        items: [{ product_id: product.id, name: product.name, price: unit, quantity: effectiveQty, image_url: product.images?.[0] ?? null }],
      });
    }, 1500);
    return () => { if (trackTimer.current) clearTimeout(trackTimer.current); };
  }, [open, sessionId, business.id, business.slug, form.name, form.phone, form.email, subtotal, effectiveQty, product.id, product.name, product.price, product.images]);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setSelectedTierIdx(0);
    setQuantity(1);
    setErrors({});
    setDiscountInput("");
    setAppliedDiscount(null);
    setDiscountError("");
    setCourierSelection(null);
    setHasCouriers(false);
    setCustValues(() => {
      const defaults: Record<string, string | string[]> = {};
      for (const f of customizationFields ?? []) {
        if (f.type === "color") defaults[f.id] = f.default_color ?? "#000000";
        else if (f.type === "image") defaults[f.id] = [];
        else defaults[f.id] = "";
      }
      return defaults;
    });
    setCustUploading({});
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Fetch checkout config fresh when modal opens — via a secret-free server action.
  useEffect(() => {
    if (!open) return;
    getPublicStoreConfig(business.id).then((data) => {
      if (!data) return;
      if (data.page_content) {
        const pc = data.page_content as { checkout_config?: CheckoutConfig };
        setLiveCheckoutConfig(pc.checkout_config);
      }
      const methods = data.payment_methods ?? [];
      setPaymentMethods(methods);
      setPaymentMethod((prev) => (methods.some((m) => m.type === prev) ? prev : methods[0]?.type ?? "cash_on_delivery"));
      setCardDiscountConfig(data.card_discount);
      // Check if any courier is enabled in shipping_zones (Settings > Livrare)
      const zones = data.shipping_zones as Record<string, { enabled?: boolean }> | null;
      const anyEnabled = zones && Object.values(zones).some((z) => z?.enabled);
      setHasCouriers(!!anyEnabled);
    });
  }, [open, business.id]);

  // Re-validate discount when quantity/tier changes (min_order_amount may no longer be met)
  useEffect(() => {
    if (appliedDiscount) {
      // If subtotal changed and discount was fixed/percent, re-derive discountAmount
      // Re-validate silently — if it fails, remove the discount
      (async () => {
        const result = await validateDiscount(appliedDiscount.code, business.id, subtotal);
        if (!result.valid) {
          setAppliedDiscount(null);
          setDiscountError(result.error);
        } else {
          setAppliedDiscount(result.discount);
          setDiscountError("");
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  async function handleApplyDiscount() {
    if (!discountInput.trim()) return;
    setIsValidating(true);
    setDiscountError("");
    const result = await validateDiscount(discountInput.trim(), business.id, subtotal);
    setIsValidating(false);
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

  function validate() {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = "Minim 3 caractere";
    if (!/^(\+?40|0)7\d{8}$/.test(form.phone.replace(/[\s\-().]/g, ""))) e.phone = "Numar de telefon invalid";
    if (emailField.enabled && emailField.required && !form.email.trim()) e.email = "Email obligatoriu";
    if (emailField.enabled && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Format email invalid";
    if (!form.county) e.county = "Selectati judetul";
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
    // Customization field validation
    for (const field of customizationFields ?? []) {
      if (field.required) {
        const val = custValues[field.id];
        if (field.type === "image") {
          if (!val || (Array.isArray(val) && val.length === 0)) e[`cust_${field.id}`] = "Incarca cel putin o imagine";
        } else if (!val || (typeof val === "string" && !val.trim())) {
          e[`cust_${field.id}`] = "Camp obligatoriu";
        }
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const unitPrice = hasTiers ? tiers![selectedTierIdx].price / tiers![selectedTierIdx].qty : product.price;
    startTransition(async () => {
      // Build customization payload
      const customizationPayload = hasCustomization
        ? Object.fromEntries(
            (customizationFields ?? []).map(f => [
              f.id,
              { type: f.type, label: f.label, value: custValues[f.id] ?? (f.type === "image" ? [] : "") },
            ])
          )
        : undefined;

      const result = await placeOrder({
        business_id: business.id,
        cart_session_id: sessionId || undefined,
        product_id: product.id,
        product_name: product.name,
        product_price: unitPrice,
        quantity: effectiveQty,
        shipping_cost: shipping,
        customer_name: form.name,
        customer_phone: form.phone.replace(/[\s\-().]/g, ""),
        customer_email: form.email.trim() || undefined,
        customer_county: form.county,
        customer_city: form.city,
        customer_address: courierSelection?.deliveryType === "locker" && courierSelection.lockerAddress
          ? courierSelection.lockerAddress
          : form.address,
        discount_id: appliedDiscount?.id,
        discount_code: appliedDiscount?.code,
        discount_amount: discountAmount,
        extras: extras.filter(ex => selectedExtras[ex.id]).map(ex => ({ id: ex.id, label: ex.label, price: ex.price })),
        custom_fields: Object.keys(customValues).length > 0 ? customValues : undefined,
        customization: customizationPayload,
        payment_method: paymentMethod,
        selected_courier: courierSelection?.courier,
        courier_label: courierSelection?.courierLabel,
        delivery_type: courierSelection?.deliveryType,
        locker_id: courierSelection?.lockerId,
        locker_name: courierSelection?.lockerName,
        woot_service_id: courierSelection?.wootServiceId,
        woot_courier_name: courierSelection?.wootCourierName,
        woot_service_name: courierSelection?.wootServiceName,
      });
      if (result.error) { setErrors({ _: result.error }); return; }

      if (paymentMethod !== "cash_on_delivery") {
        const endpoint = paymentMethod === "stripe" ? "/api/stripe/order-checkout"
          : paymentMethod === "netopia" ? "/api/netopia/start"
          : "/api/ipay/start";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: result.orderId, businessId: business.id }),
        });
        const data = await res.json() as { url?: string; redirectUrl?: string; error?: string };
        const redirect = data.url ?? data.redirectUrl;
        if (redirect) { window.location.href = redirect; return; }
        setErrors({ _: data.error ?? "Eroare la initierea platii cu cardul." });
        return;
      }

      onClose();
      window.location.href = `${business.basePath}/confirm?orderId=${result.orderId}&name=${encodeURIComponent(form.name)}&total=${total}`;
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-50 w-full md:max-w-md max-h-[94vh] overflow-y-auto bg-white"
            style={{ borderRadius: "21px 21px 0 0", boxShadow: "rgba(0,0,0,0.5) 0px 4px 24px", border: `3px solid ${color}` }}
          >
            {/* Mobile handle */}
            <div className="md:hidden flex justify-center pt-3">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
              <div className="flex-1 text-center">
                <h2 className="text-lg font-black text-gray-900 tracking-tight">Finalizeaza comanda</h2>
              </div>
              <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors shrink-0">
                <X size={17} className="text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 pt-4 pb-6 space-y-4">

              {/* Quantity tiers OR simple product summary */}
              {hasTiers ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Alege cantitatea</p>
                  {tiers!.map((tier, i) => {
                    const selected = selectedTierIdx === i;
                    const unitPrice = tier.price / tier.qty;
                    const baseTotal = product.price * tier.qty;
                    const savings = baseTotal - tier.price;
                    return (
                      <button key={i} type="button" onClick={() => setSelectedTierIdx(i)}
                        className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 transition-all text-left"
                        style={{ borderColor: selected ? color : "#E5E7EB", background: selected ? `${color}12` : "#fff" }}
                      >
                        {product.images[0] && (
                          <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 bg-gray-50">
                            <Image src={product.images[0]} alt="" fill sizes="48px" className="object-contain p-1" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-gray-900">
                            {tier.qty} {tier.qty === 1 ? "bucata" : "bucati"}
                          </p>
                          {tier.badge ? (
                            <span className="inline-block mt-0.5 text-white text-[10px] font-black px-2 py-0.5 rounded"
                              style={{ backgroundColor: color }}>
                              {tier.badge}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">{unitPrice.toFixed(0)} lei / buc</span>
                          )}
                          {savings > 0 && (
                            <p className="text-[10px] text-green-600 font-semibold mt-0.5">Economisesti {savings.toFixed(0)} lei</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 mr-1">
                          <p className="font-black text-base text-gray-900">{tier.price} lei</p>
                          {savings > 0 && (
                            <p className="text-xs text-gray-400 line-through">{baseTotal} lei</p>
                          )}
                        </div>
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                          style={selected
                            ? { borderColor: color, backgroundColor: color }
                            : { borderColor: "#D1D5DB", backgroundColor: "#fff" }}>
                          {selected && <Check size={10} className="text-white" strokeWidth={3} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                  {product.images[0] && (
                    <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200 shrink-0 bg-gray-50 flex-shrink-0">
                      <Image src={product.images[0]} alt={product.name} fill sizes="56px" className="object-contain p-1" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 truncate">{product.name}</p>
                    <p className="text-sm font-black mt-0.5" style={{ color }}>{product.price} lei</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors">
                      <Minus size={12} />
                    </button>
                    <span className="w-5 text-center text-sm font-bold tabular-nums">{quantity}</span>
                    <button type="button" onClick={() => setQuantity(q => q + 1)}
                      className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors">
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* Customization fields */}
              {hasCustomization && (
                <div className="space-y-3 border border-gray-200 rounded-xl p-3.5 bg-gray-50/50">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Palette size={13} />
                    Personalizeaza produsul
                  </p>
                  {customizationFields!.map(field => (
                    <div key={field.id}>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        {field.label || "Camp"} {field.required && <span className="text-red-500">*</span>}
                      </label>

                      {field.type === "text" && (
                        <input
                          value={(custValues[field.id] as string) ?? ""}
                          onChange={e => setCustValues(v => ({ ...v, [field.id]: e.target.value }))}
                          placeholder={field.placeholder ?? ""}
                          maxLength={field.max_length}
                          className="w-full px-3 py-2.5 text-sm text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
                        />
                      )}

                      {field.type === "textarea" && (
                        <div>
                          <textarea
                            value={(custValues[field.id] as string) ?? ""}
                            onChange={e => setCustValues(v => ({ ...v, [field.id]: e.target.value }))}
                            placeholder={field.placeholder ?? ""}
                            maxLength={field.max_length}
                            rows={3}
                            className="w-full px-3 py-2.5 text-sm text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 resize-none"
                          />
                          {field.max_length && (
                            <p className="text-[11px] text-gray-400 mt-0.5 text-right">
                              {((custValues[field.id] as string) ?? "").length}/{field.max_length}
                            </p>
                          )}
                        </div>
                      )}

                      {field.type === "image" && (
                        <div className="space-y-2">
                          {/* Uploaded thumbnails */}
                          {Array.isArray(custValues[field.id]) && (custValues[field.id] as string[]).length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {(custValues[field.id] as string[]).map((url, imgIdx) => (
                                <div key={imgIdx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-white group">
                                  <img src={url} alt={`Upload ${imgIdx + 1}`} className="w-full h-full object-cover" />
                                  <button type="button" onClick={() => {
                                    const current = (custValues[field.id] as string[]).filter((_, i) => i !== imgIdx);
                                    setCustValues(v => ({ ...v, [field.id]: current }));
                                  }} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Upload button */}
                          {(!Array.isArray(custValues[field.id]) || (custValues[field.id] as string[]).length < (field.max_files ?? 5)) && (
                            <label className="flex items-center gap-2 px-3 py-2.5 bg-white border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
                              {custUploading[field.id]
                                ? <Loader2 size={16} className="text-gray-500 animate-spin" />
                                : <Upload size={16} className="text-gray-500" />}
                              <span className="text-sm text-gray-600">
                                {custUploading[field.id] ? "Se incarca..." : "Incarca imagine"}
                              </span>
                              <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                                const files = e.target.files;
                                if (!files?.length) return;
                                setCustUploading(u => ({ ...u, [field.id]: true }));
                                const maxSize = (field.max_file_size_mb ?? 10) * 1024 * 1024;
                                const maxFiles = field.max_files ?? 5;
                                const current = (custValues[field.id] as string[]) ?? [];
                                const remaining = maxFiles - current.length;
                                const toUpload = Array.from(files).slice(0, remaining);
                                const urls: string[] = [];
                                for (const f of toUpload) {
                                  if (f.size > maxSize) continue;
                                  const fd = new FormData();
                                  fd.append("file", f);
                                  fd.append("business_id", business.id);
                                  const res = await fetch("/api/upload-customization", { method: "POST", body: fd });
                                  const data = await res.json() as { url?: string; error?: string };
                                  if (data.url) urls.push(data.url);
                                }
                                setCustValues(v => ({ ...v, [field.id]: [...(v[field.id] as string[] ?? []), ...urls] }));
                                setCustUploading(u => ({ ...u, [field.id]: false }));
                                e.target.value = "";
                              }} />
                            </label>
                          )}
                          <p className="text-[11px] text-gray-400">
                            Max {field.max_files ?? 5} imagini, {field.max_file_size_mb ?? 10}MB/fisier
                          </p>
                        </div>
                      )}

                      {field.type === "select" && (
                        <select
                          aria-label={field.label}
                          value={(custValues[field.id] as string) ?? ""}
                          onChange={e => setCustValues(v => ({ ...v, [field.id]: e.target.value }))}
                          className="w-full px-3 py-2.5 text-sm text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
                        >
                          <option value="">Selecteaza...</option>
                          {(field.options ?? []).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}

                      {field.type === "color" && (
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={(custValues[field.id] as string) ?? field.default_color ?? "#000000"}
                            onChange={e => setCustValues(v => ({ ...v, [field.id]: e.target.value }))}
                            className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
                          />
                          <span className="text-sm text-gray-600 font-mono">
                            {(custValues[field.id] as string) ?? field.default_color ?? "#000000"}
                          </span>
                        </div>
                      )}

                      {field.helper_text && (
                        <p className="text-[11px] text-gray-400 mt-0.5">{field.helper_text}</p>
                      )}
                      {errors[`cust_${field.id}`] && (
                        <p className="text-xs text-red-500 mt-0.5">{errors[`cust_${field.id}`]}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Customer fields */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Nume complet <span className="text-red-500">*</span>
                </label>
                <IconInput icon={User} error={!!errors.name}>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Prenume Nume" className={inputCls} />
                </IconInput>
                {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Numar de telefon <span className="text-red-500">*</span>
                </label>
                <IconInput icon={Phone} error={!!errors.phone}>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="07XXXXXXXX" type="tel" className={inputCls} />
                </IconInput>
                {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
              </div>

              {emailField.enabled && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Email {emailField.required ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">(optional)</span>}
                  </label>
                  <IconInput icon={Mail} error={!!errors.email}>
                    <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="adresa@email.com" type="email" className={inputCls} />
                  </IconInput>
                  {errors.email && <p className="text-xs text-red-500 mt-0.5">{errors.email}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Judet <span className="text-red-500">*</span>
                </label>
                <IconInput icon={MapPin} error={!!errors.county}>
                  <select value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value }))}
                    className={`${inputCls} bg-white`}>
                    <option value="">Selecteaza judetul</option>
                    {JUDETE.map(j => <option key={j} value={j}>{j}</option>)}
                  </select>
                </IconInput>
                {errors.county && <p className="text-xs text-red-500 mt-0.5">{errors.county}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Oras <span className="text-red-500">*</span>
                </label>
                <IconInput icon={MapPin} error={!!errors.city}>
                  <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Oras / Localitate" className={inputCls} />
                </IconInput>
                {errors.city && <p className="text-xs text-red-500 mt-0.5">{errors.city}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Adresa <span className="text-red-500">*</span>
                </label>
                <IconInput icon={Home} error={!!errors.address}>
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Strada, nr., bloc, ap." className={inputCls} />
                </IconInput>
                {errors.address && <p className="text-xs text-red-500 mt-0.5">{errors.address}</p>}
              </div>

              {/* Courier selection */}
              {hasCouriers && (
                <CourierSelector
                  businessId={business.id}
                  county={form.county}
                  city={form.city}
                  color={color}
                  cod={paymentMethod === "cash_on_delivery" ? subtotal : 0}
                  onSelect={setCourierSelection}
                />
              )}
              {errors.courier && <p className="text-xs text-red-500 mt-0.5">{errors.courier}</p>}

              {/* Custom fields */}
              {customFields.map(field => (
                <div key={field.id}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    {field.label || "Camp"} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  {field.type === "text" && (
                    <IconInput icon={Package} error={!!errors[field.id]}>
                      <input value={customValues[field.id] ?? ""} placeholder={field.placeholder ?? ""}
                        onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.value }))}
                        className={inputCls} />
                    </IconInput>
                  )}
                  {field.type === "textarea" && (
                    <textarea value={customValues[field.id] ?? ""} rows={3}
                      placeholder={field.placeholder ?? ""}
                      onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.value }))}
                      className="w-full px-3 py-2.5 text-sm text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 resize-none" />
                  )}
                  {field.type === "select" && (
                    <IconInput icon={Package} error={!!errors[field.id]}>
                      <select aria-label={field.label} value={customValues[field.id] ?? ""}
                        onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.value }))}
                        className={`${inputCls} bg-white`}>
                        <option value="">Selecteaza...</option>
                        {(field.options ?? "").split(",").map(opt => opt.trim()).filter(Boolean).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </IconInput>
                  )}
                  {field.type === "checkbox" && (
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={customValues[field.id] === "da"}
                        onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.checked ? "da" : "nu" }))}
                        className="w-4 h-4 rounded accent-green-600" />
                      <span className="text-sm text-gray-700">{field.placeholder || field.label}</span>
                    </label>
                  )}
                  {errors[field.id] && <p className="text-xs text-red-500 mt-0.5">{errors[field.id]}</p>}
                </div>
              ))}

              {/* Extras */}
              {extras.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">Optiuni suplimentare</p>
                  {extras.map(extra => {
                    const checked = !!selectedExtras[extra.id];
                    return (
                      <button key={extra.id} type="button"
                        onClick={() => setSelectedExtras(s => ({ ...s, [extra.id]: !s[extra.id] }))}
                        className="w-full text-left rounded-xl border-2 border-dashed p-3.5 transition-all"
                        style={checked
                          ? { borderColor: color, backgroundColor: `${color}08` }
                          : { borderColor: "#D1D5DB", backgroundColor: "transparent" }}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors"
                              style={checked ? { borderColor: color, backgroundColor: color } : { borderColor: "#D1D5DB" }}>
                              {checked && (
                                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 leading-tight">{extra.label}</p>
                              {extra.description && (
                                <p className="text-xs text-gray-500 mt-0.5">{extra.description}</p>
                              )}
                            </div>
                          </div>
                          <span className="text-sm font-black flex-shrink-0" style={{ color }}>+{extra.price} lei</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Discount code */}
              {!hiddenFields.includes("discount") && <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Cod discount (optional)
                </label>
                {appliedDiscount ? (
                  /* Applied discount banner */
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 border-green-300 bg-green-50">
                    {appliedDiscount.type === "free_shipping"
                      ? <Truck size={15} className="text-green-600 flex-shrink-0" />
                      : <BadgePercent size={15} className="text-green-600 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-green-700 font-mono">{appliedDiscount.code}</p>
                      <p className="text-xs text-green-600">
                        {appliedDiscount.type === "percent" && `${appliedDiscount.value}% reducere`}
                        {appliedDiscount.type === "fixed" && `${appliedDiscount.value} lei reducere`}
                        {appliedDiscount.type === "free_shipping" && "Transport gratuit aplicat"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveDiscount}
                      className="p-1 rounded-full hover:bg-green-100 transition-colors flex-shrink-0"
                    >
                      <X size={14} className="text-green-600" />
                    </button>
                  </div>
                ) : (
                  /* Input + Apply button */
                  <div className="flex gap-2">
                    <div className="flex flex-1 overflow-hidden rounded-lg border border-gray-200 focus-within:border-gray-400 transition-colors">
                      <span className="flex items-center justify-center w-10 shrink-0 bg-gray-50">
                        <Tag size={15} className="text-gray-500" />
                      </span>
                      <input
                        value={discountInput}
                        onChange={e => { setDiscountInput(e.target.value.toUpperCase()); setDiscountError(""); }}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleApplyDiscount(); } }}
                        placeholder="COD DISCOUNT"
                        className="flex-1 px-3 py-2.5 text-sm text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none font-mono tracking-widest"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyDiscount}
                      disabled={isValidating || !discountInput.trim()}
                      className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                      style={{ backgroundColor: color }}
                    >
                      {isValidating
                        ? <Loader2 size={14} className="animate-spin" />
                        : <ChevronRight size={14} />}
                      Aplica
                    </button>
                  </div>
                )}
                {discountError && <p className="text-xs text-red-500 mt-1">{discountError}</p>}
              </div>}

              {/* Order summary */}
              <div className="rounded-xl p-3 space-y-1.5 text-sm bg-gray-50 border border-gray-200">
                <div className="flex justify-between text-gray-500">
                  <span>Produs ({effectiveQty} buc)</span>
                  <span className="font-medium text-gray-900">{subtotal} lei</span>
                </div>
                {extrasTotal > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Optiuni extra</span>
                    <span className="font-medium text-gray-900">+{extrasTotal} lei</span>
                  </div>
                )}
                {appliedDiscount && discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount ({appliedDiscount.code})</span>
                    <span className="font-semibold">-{discountAmount.toFixed(2)} lei</span>
                  </div>
                )}
                {cardDiscountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Reducere plata cu cardul</span>
                    <span className="font-semibold">-{cardDiscountAmount.toFixed(2)} lei</span>
                  </div>
                )}
                {appliedDiscount?.type === "free_shipping" && (
                  <div className="flex justify-between text-green-600">
                    <span>Transport gratuit ({appliedDiscount.code})</span>
                    <span className="font-semibold">-{shippingCost} lei</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span>Transport</span>
                  <span className={shipping === 0 ? "font-medium text-green-600" : "font-medium text-gray-900"}>
                    {shipping === 0 ? "Gratuit" : `${shipping} lei`}
                  </span>
                </div>
                <div className="flex justify-between font-black text-base border-t border-gray-200 pt-2">
                  <span>Total</span>
                  <span style={{ color }}>{total.toFixed(2).replace(".00", "")} lei</span>
                </div>
              </div>

              {/* Payment method */}
              {paymentMethods.length > 1 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">Metoda de plata</p>
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(paymentMethods.length, 3)}, minmax(0, 1fr))` }}>
                    {paymentMethods.map((m) => (
                      <button key={m.type} type="button" onClick={() => setPaymentMethod(m.type)}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all"
                        style={paymentMethod === m.type
                          ? { borderColor: color, backgroundColor: `${color}12`, color: "#111" }
                          : { borderColor: "#E5E7EB", backgroundColor: "#fff", color: "#6B7280" }}>
                        {m.type === "cash_on_delivery" ? <Banknote size={16} /> : <CreditCard size={16} />}
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {errors._ && <p className="text-sm text-red-500 text-center">{errors._}</p>}

              {belowMinOrder && (
                <p className="text-sm text-center text-gray-500">
                  Comanda minima este <strong className="text-gray-800">{minOrderAmount} lei</strong>. Mai adauga <strong className="text-gray-800">{(minOrderAmount! - subtotal).toFixed(2).replace(".00", "")} lei</strong> pentru a comanda.
                </p>
              )}

              {/* Submit */}
              <button type="submit" disabled={isPending || belowMinOrder}
                className="w-full flex items-center justify-center gap-3 py-4 font-bold text-base text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: color, boxShadow: `0px 2px 12px ${color}55` }}>
                {isPending
                  ? <><Loader2 size={18} className="animate-spin" />Se proceseaza...</>
                  : belowMinOrder
                    ? <>Comanda minima {minOrderAmount} lei</>
                    : paymentMethod === "cash_on_delivery"
                      ? <><Banknote size={20} />Plata la livrare - {total.toFixed(2).replace(".00", "")} lei</>
                      : <><CreditCard size={20} />{paymentMethods.find((m) => m.type === paymentMethod)?.label ?? "Plateste"} - {total.toFixed(2).replace(".00", "")} lei</>
                }
              </button>

              <p className="text-center text-xs text-gray-400">
                {paymentMethod === "cash_on_delivery"
                  ? "Platesti cash curierului - Fara card necesar"
                  : "Vei fi redirectionat pentru plata securizata"}
              </p>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
