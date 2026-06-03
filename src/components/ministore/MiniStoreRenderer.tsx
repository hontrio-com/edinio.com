"use client";

import { useState, createContext, useContext, useEffect, useTransition, useMemo } from "react";
import {
  ShoppingCart, X, Plus, Minus, Phone, Search,
  MapPin, Mail, Globe, ChevronRight, Package, User, Home, Loader2, Banknote, CreditCard,
  Truck, ShieldCheck, RotateCcw, Check,
} from "lucide-react";
import { formatPrice, whatsappLink } from "@/lib/utils/format";
import { placeCartOrder } from "@/lib/actions/order.actions";
import { fbTrack, ttqTrack, gtagEvent } from "@/lib/marketing";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

type Business = Database["public"]["Tables"]["businesses"]["Row"];
type Product = Database["public"]["Tables"]["products"]["Row"];
type StoreSettings = Database["public"]["Tables"]["store_settings"]["Row"];

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
  announcement_bar?: { enabled: boolean; text: string; bg_color: string };
  trust_badges_enabled?: boolean;
  trust_badges?: Array<{ icon: string; title: string; desc: string }>;
  show_trust_strip_on_store?: boolean;
  store_trust_badges?: Array<{ icon: string; title: string; desc: string }>;
  show_featured_section?: boolean;
  featured_section_title?: string;
  show_shipping_progress?: boolean;
  store_benefits_section?: { enabled: boolean; title: string; items: Array<{ title: string; desc: string }> };
  reviews_section?: { enabled: boolean; title: string; items: Array<{ name: string; rating: number; text: string; date: string }> };
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
  store_bg_color?: string;
}

interface StorePolicies {
  terms?: string;
  delivery?: string;
  return?: string;
  privacy?: string;
  gdpr?: string;
  cancellation?: string;
}

interface CartItem {
  productId: string;
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
}

const JUDETE = [
  "Municipiul Bucuresti","Alba","Arad","Arges","Bacau","Bihor","Bistrita-Nasaud","Botosani",
  "Braila","Brasov","Buzau","Calarasi","Cluj","Constanta","Covasna","Dambovita","Dolj",
  "Galati","Giurgiu","Gorj","Harghita","Hunedoara","Ialomita","Iasi","Ilfov","Maramures",
  "Mehedinti","Mures","Neamt","Olt","Prahova","Salaj","Satu Mare","Sibiu","Suceava",
  "Teleorman","Timis","Tulcea","Vaslui","Valcea","Vrancea",
];

const fieldCls = "flex-1 px-3 py-2.5 text-sm text-gray-800 bg-white placeholder:text-gray-400 focus:outline-none";

function FieldWrap({ icon: Icon, error, children }: { icon: React.ElementType; error?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex overflow-hidden rounded-lg border ${error ? "border-red-400" : "border-gray-200"} focus-within:border-gray-400 transition-colors`}>
      <span className="flex items-center justify-center w-10 shrink-0 bg-gray-50">
        <Icon size={15} className="text-gray-500" />
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(JSON.parse(stored));
    } catch {}
  }, [STORAGE_KEY]);

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

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQty, total, count, clear }}>
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
  open, onClose, color, basePath, businessId, shippingCost, freeShippingThreshold, emailFieldConfig,
}: {
  open: boolean; onClose: () => void; color: string; basePath: string; businessId: string;
  shippingCost: number; freeShippingThreshold: number | null;
  emailFieldConfig: { enabled: boolean; required: boolean };
}) {
  const { items, total, clear } = useCart();
  const [checkoutConfig, setCheckoutConfig] = useState<PageContent["checkout_config"]>(
    { email_field: emailFieldConfig } as PageContent["checkout_config"]
  );
  const [vatConfig, setVatConfig] = useState<VatConfig>({ vat_enabled: false, vat_rate: 19, prices_include_vat: true, show_vat_breakdown: true });
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [netopiaEnabled, setNetopiaEnabled] = useState(false);
  const [netopiaTitle, setNetopiaTitle] = useState("Card online (Netopia)");
  const [paymentMethod, setPaymentMethod] = useState<"cash_on_delivery" | "stripe" | "netopia">("cash_on_delivery");
  const customFields = checkoutConfig?.custom_fields ?? [];
  const extras = checkoutConfig?.extras ?? [];
  const hiddenFields = checkoutConfig?.hidden_fields ?? [];
  const emailField = checkoutConfig?.email_field ?? emailFieldConfig;
  const [selectedExtras, setSelectedExtras] = useState<Record<string, boolean>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const extrasTotal = extras.filter(e => selectedExtras[e.id]).reduce((s, e) => s + e.price, 0);
  const shipping = freeShippingThreshold && total >= freeShippingThreshold ? 0 : shippingCost;

  // VAT calculation
  const vatBase = total + extrasTotal;
  const vatAmount = vatConfig.vat_enabled
    ? vatConfig.prices_include_vat
      ? Math.round((vatBase - vatBase / (1 + vatConfig.vat_rate / 100)) * 100) / 100
      : Math.round(vatBase * (vatConfig.vat_rate / 100) * 100) / 100
    : 0;
  const vatAddOn = vatConfig.vat_enabled && !vatConfig.prices_include_vat ? vatAmount : 0;
  const grandTotal = total + extrasTotal + shipping + vatAddOn;

  const [form, setForm] = useState({ name: "", phone: "", email: "", county: "", city: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase
      .from("store_settings")
      .select("page_content, vat_enabled, vat_rate, prices_include_vat, show_vat_breakdown, stripe_config, netopia_config")
      .eq("business_id", businessId)
      .single()
      .then(({ data }) => {
        if (data?.page_content) {
          const pc = data.page_content as { checkout_config?: PageContent["checkout_config"] };
          setCheckoutConfig(prev => ({ ...prev, ...pc.checkout_config }));
        }
        setVatConfig({
          vat_enabled: data?.vat_enabled ?? false,
          vat_rate: Number(data?.vat_rate ?? 19),
          prices_include_vat: data?.prices_include_vat ?? true,
          show_vat_breakdown: data?.show_vat_breakdown ?? true,
        });
        const sc = data?.stripe_config as { enabled?: boolean; charges_enabled?: boolean; account_id?: string } | null;
        const stripeOk = !!(sc?.enabled && sc?.charges_enabled && sc?.account_id);
        setStripeEnabled(stripeOk);
        const nc = data?.netopia_config as { enabled?: boolean; pos_signature?: string; title?: string; api_key?: string } | null;
        const netopiaOk = !!(nc?.enabled && nc?.pos_signature && nc?.api_key);
        setNetopiaEnabled(netopiaOk);
        if (nc?.title) setNetopiaTitle(nc.title);
        if (!stripeOk) setPaymentMethod("cash_on_delivery");
      });
  }, [open, businessId]);

  function validate() {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = "Minim 3 caractere";
    if (!/^(\+?40|0)7\d{8}$/.test(form.phone.replace(/[\s\-().]/g, ""))) e.phone = "Numar de telefon invalid";
    if (emailField.enabled && emailField.required && !form.email.trim()) e.email = "Email obligatoriu";
    else if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Email invalid";
    if (!form.county) e.county = "Selectati judetul";
    if (form.city.trim().length < 2) e.city = "Introduceti orasul";
    if (form.address.trim().length < 10) e.address = "Minim 10 caractere";
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
      const result = await placeCartOrder({
        business_id: businessId,
        items: items.map(i => ({ product_id: i.productId, name: i.name, price: i.price, quantity: i.quantity })),
        shipping_cost: shipping,
        customer_name: form.name,
        customer_phone: form.phone.replace(/[\s\-().]/g, ""),
        customer_email: form.email.trim() || undefined,
        customer_county: form.county,
        customer_city: form.city,
        customer_address: form.address,
        extras: extras.filter(ex => selectedExtras[ex.id]).map(ex => ({ id: ex.id, label: ex.label, price: ex.price })),
        custom_fields: Object.keys(customValues).length > 0 ? customValues : undefined,
        vat_amount: vatAmount,
        vat_rate: vatConfig.vat_enabled ? vatConfig.vat_rate : 0,
        payment_method: paymentMethod,
      });
      if ("error" in result) { setErrors({ _: result.error as string }); return; }

      const orderId = (result as { orderId: string }).orderId;

      if (paymentMethod === "stripe") {
        const res = await fetch("/api/stripe/order-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, businessId }),
        });
        const data = await res.json() as { url?: string; error?: string };
        if (data.url) { clear(); window.location.href = data.url; return; }
        setErrors({ _: data.error ?? "Eroare la initierea platii cu cardul." });
        return;
      }

      if (paymentMethod === "netopia") {
        const res = await fetch("/api/netopia/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, businessId }),
        });
        const np = await res.json() as { redirectUrl?: string; error?: string };
        if (np.redirectUrl) {
          clear();
          window.location.href = np.redirectUrl;
          return;
        }
        setErrors({ _: np.error ?? "Eroare la initierea platii Netopia." });
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
        className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-[60] w-full md:max-w-md max-h-[94vh] overflow-y-auto bg-white"
        style={{ borderRadius: "21px 21px 0 0", boxShadow: "rgba(0,0,0,0.5) 0px 4px 24px", border: `3px solid ${color}` }}
      >
        <div className="md:hidden flex justify-center pt-3">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex-1 text-center">
            <h2 className="text-lg font-black text-gray-900 tracking-tight">Finalizeaza comanda</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors shrink-0">
            <X className="h-[17px] w-[17px] text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 pt-4 pb-6 space-y-4">
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.productId} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                {item.imageUrl && (
                  <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.quantity} buc &times; {item.price} lei</p>
                </div>
                <p className="text-sm font-black shrink-0" style={{ color }}>{item.price * item.quantity} lei</p>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Nume complet <span className="text-red-500">*</span></label>
            <FieldWrap icon={User} error={!!errors.name}>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Prenume Nume" className={fieldCls} />
            </FieldWrap>
            {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Numar de telefon <span className="text-red-500">*</span></label>
            <FieldWrap icon={Phone} error={!!errors.phone}>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07XXXXXXXX" type="tel" className={fieldCls} />
            </FieldWrap>
            {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
          </div>
          {emailField.enabled && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Email{" "}
                {emailField.required
                  ? <span className="text-red-500">*</span>
                  : <span className="text-xs font-normal text-gray-400">(optional — pentru confirmare comanda)</span>
                }
              </label>
              <FieldWrap icon={Mail} error={!!errors.email}>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="adresa@email.ro" type="email" className={fieldCls} />
              </FieldWrap>
              {errors.email && <p className="text-xs text-red-500 mt-0.5">{errors.email}</p>}
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Judet <span className="text-red-500">*</span></label>
            <FieldWrap icon={MapPin} error={!!errors.county}>
              <select value={form.county} onChange={e => setForm(f => ({ ...f, county: e.target.value }))} className={`${fieldCls} bg-white`}>
                <option value="">Selecteaza judetul</option>
                {JUDETE.map(j => <option key={j} value={j}>{j}</option>)}
              </select>
            </FieldWrap>
            {errors.county && <p className="text-xs text-red-500 mt-0.5">{errors.county}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Oras <span className="text-red-500">*</span></label>
            <FieldWrap icon={MapPin} error={!!errors.city}>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Oras / Localitate" className={fieldCls} />
            </FieldWrap>
            {errors.city && <p className="text-xs text-red-500 mt-0.5">{errors.city}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Adresa <span className="text-red-500">*</span></label>
            <FieldWrap icon={Home} error={!!errors.address}>
              <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Strada, nr., bloc, ap." className={fieldCls} />
            </FieldWrap>
            {errors.address && <p className="text-xs text-red-500 mt-0.5">{errors.address}</p>}
          </div>
          {/* Custom fields */}
          {customFields.map(field => (
            <div key={field.id}>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
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
                  className="w-full px-3 py-2.5 text-sm text-gray-800 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 resize-none" />
              )}
              {field.type === "select" && (
                <FieldWrap icon={Package} error={!!errors[field.id]}>
                  <select value={customValues[field.id] ?? ""}
                    onChange={e => setCustomValues(v => ({ ...v, [field.id]: e.target.value }))}
                    className={`${fieldCls} bg-white`}>
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

          <div className="rounded-xl p-3 space-y-1.5 text-sm bg-gray-50 border border-gray-200">
            <div className="flex justify-between text-gray-500">
              <span>Produse</span>
              <span className="font-medium text-gray-900">{total} lei</span>
            </div>
            {extrasTotal > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Optiuni extra</span>
                <span className="font-medium text-gray-900">+{extrasTotal} lei</span>
              </div>
            )}
            <div className="flex justify-between text-gray-500">
              <span>Transport</span>
              <span className={shipping === 0 ? "font-medium text-green-600" : "font-medium text-gray-900"}>
                {shipping === 0 ? "Gratuit" : `${shipping} lei`}
              </span>
            </div>
            {vatConfig.vat_enabled && vatConfig.show_vat_breakdown && vatAmount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>TVA ({vatConfig.vat_rate}%){vatConfig.prices_include_vat ? " inclus" : ""}</span>
                <span className="font-medium text-gray-900">{vatAmount.toFixed(2)} lei</span>
              </div>
            )}
            {freeShippingThreshold && total < freeShippingThreshold && (
              <p className="text-xs text-gray-400">
                Mai adauga <strong>{freeShippingThreshold - total} lei</strong> pentru livrare gratuita
              </p>
            )}
            <div className="flex justify-between font-black text-base border-t border-gray-200 pt-2">
              <span>Total</span>
              <span style={{ color }}>{grandTotal} lei</span>
            </div>
          </div>
          {/* Payment method toggle */}
          {(stripeEnabled || netopiaEnabled) && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700">Metoda de plata</p>
              <div className={`grid gap-2 ${stripeEnabled && netopiaEnabled ? "grid-cols-3" : "grid-cols-2"}`}>
                <button type="button" onClick={() => setPaymentMethod("cash_on_delivery")}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all"
                  style={paymentMethod === "cash_on_delivery"
                    ? { borderColor: color, backgroundColor: `${color}12`, color: "#111" }
                    : { borderColor: "#E5E7EB", backgroundColor: "#fff", color: "#6B7280" }}>
                  <Banknote className="h-4 w-4" />
                  Ramburs
                </button>
                {stripeEnabled && (
                  <button type="button" onClick={() => setPaymentMethod("stripe")}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all"
                    style={paymentMethod === "stripe"
                      ? { borderColor: "#635bff", backgroundColor: "#635bff12", color: "#111" }
                      : { borderColor: "#E5E7EB", backgroundColor: "#fff", color: "#6B7280" }}>
                    <CreditCard className="h-4 w-4" />
                    Stripe
                  </button>
                )}
                {netopiaEnabled && (
                  <button type="button" onClick={() => setPaymentMethod("netopia")}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all"
                    style={paymentMethod === "netopia"
                      ? { borderColor: "#e63946", backgroundColor: "#e6394612", color: "#111" }
                      : { borderColor: "#E5E7EB", backgroundColor: "#fff", color: "#6B7280" }}>
                    <CreditCard className="h-4 w-4" />
                    {netopiaTitle}
                  </button>
                )}
              </div>
            </div>
          )}

          {errors._ && <p className="text-sm text-red-500 text-center">{errors._}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-3 py-4 font-bold text-base text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            style={paymentMethod === "stripe"
              ? { backgroundColor: "#635bff", boxShadow: "0px 2px 12px #635bff55" }
              : paymentMethod === "netopia"
                ? { backgroundColor: "#e63946", boxShadow: "0px 2px 12px #e6394655" }
                : { backgroundColor: color, boxShadow: `0px 2px 12px ${color}55` }}
          >
            {isPending
              ? <><Loader2 className="h-[18px] w-[18px] animate-spin" />Se proceseaza...</>
              : paymentMethod === "stripe"
                ? <><CreditCard className="h-5 w-5" />Plateste cu Stripe - {grandTotal} lei</>
                : paymentMethod === "netopia"
                  ? <><CreditCard className="h-5 w-5" />{netopiaTitle} - {grandTotal} lei</>
                  : <><Banknote className="h-5 w-5" />Plata la livrare - {grandTotal} lei</>
            }
          </button>
          <p className="text-center text-xs text-gray-400">
            {paymentMethod === "stripe"
              ? "Vei fi redirectionat catre Stripe pentru plata securizata"
              : paymentMethod === "netopia"
                ? "Vei fi redirectionat catre Netopia pentru plata securizata"
                : "Platesti cash curierului - Fara card necesar"}
          </p>
        </form>
      </div>
    </>
  );
}

function CartDrawer({
  open, onClose, color, onCheckout, shippingCost, freeShippingThreshold,
}: {
  open: boolean; onClose: () => void; color: string; onCheckout: () => void;
  shippingCost: number; freeShippingThreshold: number | null;
}) {
  const { items, removeItem, updateQty, total, count } = useCart();
  const shipping = freeShippingThreshold && total >= freeShippingThreshold ? 0 : shippingCost;
  const grandTotal = total + shipping;
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
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {freeShippingThreshold && (
          <div className="px-5 py-3 bg-muted/40 border-b border-border">
            {total >= freeShippingThreshold ? (
              <p className="text-xs font-semibold text-green-600 flex items-center gap-1.5">
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
              {items.map((item) => (
                <div key={item.productId} className="flex items-start gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-muted border border-border">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug truncate">{item.name}</p>
                    <p className="text-sm font-semibold mt-0.5" style={{ color }}>{formatPrice(item.price)}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <button type="button" onClick={() => updateQty(item.productId, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-semibold w-5 text-center tabular-nums">{item.quantity}</span>
                      <button type="button" onClick={() => updateQty(item.productId, item.quantity + 1)}
                        className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeItem(item.productId)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors mt-0.5 rounded-md hover:bg-muted">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="px-5 py-5 border-t border-border space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-medium text-foreground">{formatPrice(total)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Livrare</span>
                <span className={shipping === 0 ? "text-green-600 font-medium" : "font-medium text-foreground"}>
                  {shipping === 0 ? "Gratuita" : formatPrice(shipping)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-base text-foreground pt-2 border-t border-border">
                <span>Total</span>
                <span style={{ color }}>{formatPrice(grandTotal)}</span>
              </div>
            </div>
            <button type="button" onClick={onCheckout}
              className="flex items-center justify-center gap-2 w-full py-3.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
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

function ProductCard({ product, color, basePath, onAddToCart, isAdded, newBadgeDays }: {
  product: Product; color: string; basePath: string; onAddToCart: () => void; isAdded: boolean; newBadgeDays: number;
}) {
  const images = Array.isArray(product.images) ? product.images : [];
  const imageUrl = images[0] ? String(images[0]) : null;
  const isNew = newBadgeDays > 0 && (Date.now() - new Date(product.created_at).getTime()) < newBadgeDays * 86400000;
  const hasDiscount = product.compare_at_price && Number(product.compare_at_price) > Number(product.price);
  const discountPct = hasDiscount
    ? Math.round((1 - Number(product.price) / Number(product.compare_at_price)) * 100)
    : 0;
  const isOutOfStock = product.track_inventory && product.stock_quantity === 0;

  return (
    <div className="group bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
      <a href={`${basePath}/product/${product.id}`} className="block">
        <div className="relative aspect-square bg-gray-50 overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.name}
              className="w-full h-full object-contain p-2 group-hover:scale-[1.04] transition-transform duration-500 ease-out"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-10 w-10 text-gray-200" />
            </div>
          )}

          {/* Top badges */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
            {hasDiscount && (
              <span className="bg-red-500 text-white text-[11px] font-black px-2 py-0.5 rounded-lg shadow-sm">
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
              <span className="bg-blue-500 text-white text-[11px] font-black px-2 py-0.5 rounded-lg shadow-sm">
                Nou
              </span>
            )}
          </div>

          {/* Category chip bottom */}
          {product.category && (
            <div className="absolute bottom-2 left-2">
              <span className="bg-black/55 backdrop-blur-sm text-white text-[10px] font-medium px-2.5 py-0.5 rounded-full">
                {product.category}
              </span>
            </div>
          )}

          {isOutOfStock && (
            <div className="absolute inset-0 bg-white/75 backdrop-blur-[2px] flex items-center justify-center">
              <span className="text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-full shadow-sm">
                Stoc epuizat
              </span>
            </div>
          )}
        </div>
      </a>

      <div className="p-3 sm:p-4">
        <a href={`${basePath}/product/${product.id}`}>
          <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-1.5 line-clamp-2 hover:opacity-70 transition-opacity">
            {product.name}
          </h3>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="font-black text-lg" style={{ color }}>{formatPrice(Number(product.price))}</span>
            {hasDiscount && (
              <span className="text-sm text-gray-400 line-through">{formatPrice(Number(product.compare_at_price))}</span>
            )}
          </div>
        </a>
        <button
          type="button"
          onClick={onAddToCart}
          disabled={isOutOfStock}
          className="w-full py-2.5 text-sm font-bold text-white rounded-xl transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{
            backgroundColor: isAdded ? "#16a34a" : color,
            boxShadow: isAdded ? "0 0 0 3px rgba(22,163,74,0.2)" : `0 2px 8px ${color}40`,
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

interface Props {
  business: Business;
  products: Product[];
  storeSettings: StoreSettings | null;
  basePath?: string;
}

function StoreContent({ business, products, storeSettings, basePath: basePathProp }: Props) {
  const basePath = basePathProp ?? `/${business.slug}`;
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("toate");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const { addItem, count, total } = useCart();

  const color = business.primary_color ?? "#1AB554";
  const shippingCost = Number(storeSettings?.default_shipping_cost ?? 20);
  const freeShippingThreshold = storeSettings?.free_shipping_threshold
    ? Number(storeSettings.free_shipping_threshold)
    : null;

  const pageContent = (storeSettings?.page_content as PageContent) ?? {};
  const storePolicies = (storeSettings?.store_policies as StorePolicies) ?? {};
  const social = (business.social as Social) ?? {};
  const gallery = Array.isArray(business.gallery) ? (business.gallery as string[]) : [];
  const features = (business.features as Features) ?? {};

  const showGallery = features.show_gallery !== false && gallery.length > 0;
  const showAbout = features.show_about !== false && !!business.description;
  const showContact = features.show_contact !== false && !!(business.phone || business.email || business.address);
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

  const sortOption = pageContent.sort_options?.enabled
    ? (pageContent.sort_options.default_sort ?? "newest")
    : null;
  const [sort, setSort] = useState<string>(sortOption ?? "newest");
  const showSort = pageContent.sort_options?.enabled !== false;

  const hasCoverOrTagline = !!(business.cover_url || business.tagline);

  // Categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [products]);

  const hasCategories = categories.length > 0;

  // Featured products
  const featuredProducts = useMemo(() => products.filter(p => p.is_featured), [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let list = products.filter(p => {
      const matchesSearch = search === "" ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "toate" || p.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
    // Sort
    switch (sort) {
      case "price_asc": list.sort((a, b) => Number(a.price) - Number(b.price)); break;
      case "price_desc": list.sort((a, b) => Number(b.price) - Number(a.price)); break;
      case "popular": list.sort((a, b) => (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0)); break;
      case "name_asc": list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "newest": default: list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
    }
    return list;
  }, [products, search, categoryFilter, sort]);

  function handleAddToCart(product: Product) {
    const images = Array.isArray(product.images) ? product.images : [];
    addItem({
      productId: product.id,
      name: product.name,
      price: Number(product.price),
      imageUrl: images[0] ? String(images[0]) : null,
    });
    fbTrack("AddToCart", { value: Number(product.price), currency: "RON", content_name: product.name, content_ids: [product.id], content_type: "product" });
    ttqTrack("AddToCart", { value: Number(product.price), currency: "RON", content_id: product.id, content_name: product.name, content_type: "product" });
    gtagEvent("add_to_cart", { currency: "RON", value: Number(product.price), items: [{ item_id: product.id, item_name: product.name, price: Number(product.price), quantity: 1 }] });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1500);
  }

  // Has any policy text
  const hasPolicies = Object.values(storePolicies).some(v => v && v.trim().length > 0);

  return (
    <div className="min-h-screen" style={{ backgroundColor: pageContent.store_bg_color || "var(--color-background)" }}>
      {/* Announcement bar */}
      {showAnnouncementOnStore && announcementBar && (
        <div className="h-9 overflow-hidden flex items-center sticky top-0 z-40"
          style={{ background: announcementBar.bg_color || color }}>
          <div className="flex whitespace-nowrap">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className="inline-block text-xs font-medium tracking-wide animate-marquee text-white">
                {announcementBar.text}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sticky header */}
      <header className={`sticky ${showAnnouncementOnStore ? "top-9" : "top-0"} z-30 bg-background/95 backdrop-blur-md border-b border-border`}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <a href="#" className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity">
            {business.logo_url ? (
              <img src={business.logo_url} alt={business.store_name ?? business.business_name}
                className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ backgroundColor: color }}>
                {(business.store_name ?? business.business_name)[0]?.toUpperCase()}
              </div>
            )}
            <span className="font-semibold text-sm text-foreground truncate hidden sm:block">{business.store_name ?? business.business_name}</span>
          </a>

          <div className="flex items-center gap-2">
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
            <button type="button" onClick={() => setCartOpen(true)}
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

      {/* Hero */}
      {hasCoverOrTagline && (
        <section className="relative overflow-hidden">
          <div className="absolute inset-0" style={{ backgroundColor: color }} />
          {business.cover_url && (
            <div className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${business.cover_url})` }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/70" />
          <div className="relative z-10 max-w-3xl mx-auto px-4 py-20 sm:py-28 text-center text-white">
            {business.logo_url && (
              <img src={business.logo_url} alt={business.store_name ?? business.business_name}
                className="w-18 h-18 rounded-2xl object-cover mx-auto mb-5 border-2 border-white/20 shadow-2xl"
                style={{ width: 72, height: 72 }} />
            )}
            <h1 className="text-3xl sm:text-4xl font-black mb-3 drop-shadow-sm tracking-tight">
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
      )}

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
        {/* Search + Sort */}
        <div className="flex items-center gap-3 mb-5 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Cauta produse..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 text-sm border border-border rounded-2xl bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            />
          </div>
          {showSort && (
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="h-[46px] px-3 text-sm border border-border rounded-2xl bg-surface text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option value="newest">Cele mai noi</option>
              <option value="price_asc">Pret crescator</option>
              <option value="price_desc">Pret descrescator</option>
              <option value="popular">Populare</option>
              <option value="name_asc">Alfabetic A-Z</option>
            </select>
          )}
        </div>

        {/* Category filters */}
        {hasCategories && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <button
              type="button"
              onClick={() => setCategoryFilter("toate")}
              className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-all"
              style={categoryFilter === "toate"
                ? { backgroundColor: color, color: "white" }
                : { backgroundColor: "transparent", color: "var(--color-muted-foreground)", border: "1px solid var(--color-border)" }}
            >
              Toate
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-all"
                style={categoryFilter === cat
                  ? { backgroundColor: color, color: "white" }
                  : { backgroundColor: "transparent", color: "var(--color-muted-foreground)", border: "1px solid var(--color-border)" }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Shipping progress bar */}
        {showShippingProgress && freeShippingThreshold && (
          <ShippingProgressBanner color={color} threshold={freeShippingThreshold} />
        )}

        {/* Featured section */}
        {showFeaturedSection && featuredProducts.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-black text-foreground">{featuredTitle}</h2>
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
                />
              ))}
            </div>
          </section>
        )}

        {/* Products */}
        <section id="produse" className="mb-16">
          {!hasCoverOrTagline && !showFeaturedSection && (
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  color={color}
                  basePath={basePath}
                  onAddToCart={() => handleAddToCart(product)}
                  isAdded={addedId === product.id}
                  newBadgeDays={newBadgeDays}
                />
              ))}
            </div>
          )}
        </section>

        {/* Store benefits */}
        {storeBenefits?.enabled && storeBenefits.items.length > 0 && (
          <section className="mb-16">
            <h2 className="text-xl font-semibold text-foreground mb-6">{storeBenefits.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {storeBenefits.items.map((item, i) => (
                <div key={i} className="flex gap-4 p-5 bg-surface border border-border rounded-2xl">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm text-white"
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
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: color }}>
                      {review.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
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
                  className="aspect-square rounded-2xl overflow-hidden bg-muted border border-border hover:scale-[1.02] hover:shadow-md transition-all duration-200">
                  <img src={url} alt={`Galerie ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
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
              {business.address && (
                <div className="flex items-center gap-3 p-4 bg-surface border border-border rounded-2xl">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}20`, color }}>
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Adresa</p>
                    <p className="text-sm font-semibold text-foreground">
                      {business.address}{business.city ? `, ${business.city}` : ""}
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
                <img src={business.logo_url} alt={business.store_name ?? business.business_name}
                  className="w-9 h-9 rounded-lg object-cover border border-white/10 shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ backgroundColor: color }}>
                  {(business.store_name ?? business.business_name)[0]?.toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-sm text-white truncate">{business.store_name ?? business.business_name}</p>
                {business.city && <p className="text-[11px] text-white/40">{business.city}</p>}
              </div>
            </div>
            {(social.instagram || social.facebook || social.tiktok || social.website) && (
              <div className="flex items-center gap-1.5 shrink-0">
                {social.instagram && (
                  <a href={social.instagram} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                    </svg>
                  </a>
                )}
                {social.facebook && (
                  <a href={social.facebook} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/>
                    </svg>
                  </a>
                )}
                {social.tiktok && (
                  <a href={social.tiktok} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.82a8.16 8.16 0 004.77 1.52V6.9a4.85 4.85 0 01-1-.21z"/>
                    </svg>
                  </a>
                )}
                {social.website && (
                  <a href={social.website} target="_blank" rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors">
                    <Globe className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.06]" />

          {/* Middle: policies + consumer protection side by side on desktop, stacked on mobile */}
          <div className="py-6 sm:py-8 flex flex-col sm:flex-row sm:items-start gap-8 sm:gap-16">
            {/* Policies */}
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

            {/* SAL / SOL */}
            <div className="shrink-0">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Protectia consumatorilor</p>
              <div className="flex items-center gap-3">
                <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity" title="SAL - Solutionarea Alternativa a Litigiilor">
                  <img src="/anpc-sal.avif" alt="SAL" className="h-10 w-auto rounded-md" />
                </a>
                <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity" title="SOL - Solutionarea Online a Litigiilor">
                  <img src="/anpc-sol.avif" alt="SOL" className="h-10 w-auto rounded-md" />
                </a>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/[0.06]" />

          {/* Bottom: copyright */}
          <div className="pt-5 flex items-center justify-between gap-3">
            <p className="text-[11px] text-white/25">
              &copy; {new Date().getFullYear()} {business.store_name ?? business.business_name}
            </p>
            <p className="text-[11px] text-white/25">
              Creat cu <span className="font-semibold" style={{ color }}>Edinio</span>
            </p>
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
        <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white border-t border-gray-200 shadow-2xl px-4 py-3"
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
        onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); fbTrack("InitiateCheckout", { value: total, currency: "RON", num_items: count }); ttqTrack("InitiateCheckout", { value: total, currency: "RON" }); gtagEvent("begin_checkout", { currency: "RON", value: total }); }}
        shippingCost={shippingCost}
        freeShippingThreshold={freeShippingThreshold}
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
        emailFieldConfig={pageContent.checkout_config?.email_field ?? { enabled: false, required: false }}
      />

      {/* Gallery lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}>
          <button type="button" onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
            <X className="h-5 w-5" />
          </button>
          <img src={lightboxUrl} alt="Galerie"
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
        <div className="flex items-center gap-2 text-green-600">
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
