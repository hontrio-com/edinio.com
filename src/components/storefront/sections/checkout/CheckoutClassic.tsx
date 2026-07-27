"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import Image from "next/image";
import {
  X, Phone,
  MapPin, Mail, ChevronRight, Package, User, Home, Loader2, Banknote, CreditCard,
  Truck, Tag, BadgePercent,
} from "lucide-react";
import { computeVat, type VatConfig } from "@/lib/utils/vat";
import { placeCartOrder } from "@/lib/actions/order.actions";
import { getAttribution } from "@/lib/storefront/attribution";
import { getPublicStoreConfig } from "@/lib/actions/store.actions";
import { EU_COUNTRIES } from "@/lib/eu-countries";
import { trackAbandonedCart } from "@/lib/actions/abandoned-cart.actions";
import { validateDiscount, type ValidatedDiscount } from "@/lib/actions/discount.actions";
import { gtagEvent } from "@/lib/marketing";
import { CourierSelector, type CourierSelection } from "@/components/ministore/CourierSelector";
import { computeCardDiscount, computeCodDiscount, type PaymentMethodType, type CardDiscountConfig } from "@/lib/payment-methods";
import { OrderBump } from "@/components/ministore/OrderBump";
import { getCheckoutBumps } from "@/lib/actions/offer.actions";
import type { ResolvedOffer } from "@/lib/offers/offer.types";
import { lineKey, useCart } from "@/components/storefront/cart/CartProvider";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { type CheckoutPreview } from "./checkout-preview";

/**
 * Formularul de finalizare a comenzii din cos, varianta classic.
 *
 * Mutat din MiniStoreRenderer fara nicio schimbare: aceleasi campuri, aceleasi
 * calcule si acelasi continut trimis catre server. E calea prin care intra
 * banii, deci mutarea a fost literala; de aici pornesc variantele de design.
 *
 * Singura adaugire e "preview": formularul se randeaza in fluxul paginii, cu
 * date demonstrative, fara niciun apel catre server si fara sa poata fi trimis.
 * Din magazin nu se trimite niciodata, deci calea reala ramane neatinsa.
 */
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

export function CheckoutClassic({
  open, onClose, color, basePath, businessId, shippingCost, freeShippingThreshold, emailFieldConfig, initialDiscountCode, productWeights,
  preview = null,
}: {
  open: boolean; onClose: () => void; color: string; basePath: string; businessId: string;
  shippingCost: number; freeShippingThreshold: number | null;
  emailFieldConfig: { enabled: boolean; required: boolean };
  initialDiscountCode?: string | null;
  productWeights?: Record<string, number>;
  /**
   * Miniatura din catalogul de design-uri: formularul se randeaza in fluxul
   * paginii, cu datele astea in loc de cele de la server, si nu iese in retea
   * deloc. Din magazin nu se trimite niciodata.
   */
  preview?: CheckoutPreview | null;
}) {
  const { items, total, clear, sessionId } = useCart();
  const [checkoutConfig, setCheckoutConfig] = useState<StorePageContent["checkout_config"]>(
    preview ? preview.checkoutConfig : ({ email_field: emailFieldConfig } as StorePageContent["checkout_config"])
  );
  const [newsletterOffer, setNewsletterOffer] = useState(preview?.newsletterOffer ?? false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [vatConfig, setVatConfig] = useState<VatConfig>(preview?.vatConfig ?? { vat_enabled: false, vat_rate: 19, prices_include_vat: true, show_vat_breakdown: true });
  const [paymentMethods, setPaymentMethods] = useState<{ type: PaymentMethodType; label: string }[]>(preview?.paymentMethods ?? []);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(preview?.paymentMethods[0]?.type ?? "cash_on_delivery");
  const [cardDiscountConfig, setCardDiscountConfig] = useState<CardDiscountConfig>(preview?.cardDiscount ?? { enabled: false, type: "percent", value: 0 });
  const [codDiscountConfig, setCodDiscountConfig] = useState<CardDiscountConfig>(preview?.codDiscount ?? { enabled: false, type: "percent", value: 0 });
  const customFields = checkoutConfig?.custom_fields ?? [];
  const extras = checkoutConfig?.extras ?? [];
  // Discount code is OFF by default — same semantics as the editor toggle and OrderModal.
  const hiddenFields = checkoutConfig?.hidden_fields ?? ["discount"];
  const emailField = checkoutConfig?.email_field ?? emailFieldConfig;
  const [selectedExtras, setSelectedExtras] = useState<Record<string, boolean>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [courierSelection, setCourierSelection] = useState<CourierSelection | null>(null);
  const [hasCouriers, setHasCouriers] = useState(!!preview);
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

  // VAT (shared helper — identical formula on server + OrderModal).
  const vatBase = goodsTotal + extrasTotal;
  const { vatAmount, vatAddOn } = computeVat(vatBase, vatConfig);
  // Card-payment discount (mirrors the server): only for online card methods, on
  // the goods value after promo. Shown live as the customer switches payment method.
  const cardDiscountAmount = computeCardDiscount(cardDiscountConfig, paymentMethod, goodsTotal + extrasTotal - discountAmount);
  // Ramburs discount (mirrors the server): only when the customer picks cash on delivery.
  const codDiscountAmount = computeCodDiscount(codDiscountConfig, paymentMethod, goodsTotal + extrasTotal - discountAmount);
  // Round to 2 decimals (cents): float subtraction like 199.29 - 19.93 would
  // otherwise surface as 179.35999999999999 in the total/button/confirm URL.
  const grandTotal = Math.max(0, Math.round((goodsTotal + extrasTotal - discountAmount - cardDiscountAmount - codDiscountAmount + shipping + vatAddOn) * 100) / 100);

  const [form, setForm] = useState(preview?.form ?? { name: "", phone: "", email: "", county: "", city: "", address: "", country: "RO", postCode: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  // Order created by a previous identical submit (e.g. retry after the card
  // processor errored) — reused so the retry doesn't place a duplicate order
  // and re-send merchant/customer notifications.
  const placedRef = useRef<{ payloadKey: string; orderId: string } | null>(null);
  const [intlEnabled, setIntlEnabled] = useState(preview?.intlEnabled ?? false);
  const [dpdUseWeight, setDpdUseWeight] = useState(false);
  const isIntl = intlEnabled && form.country !== "RO";
  // Total cart weight (kg) from per-product weights; used for the live intl quote.
  const totalWeightKg = items.reduce((s, i) => s + ((productWeights?.[i.productId] ?? 0) * i.quantity), 0) / 1000;
  // DPD international services don't support cash-on-delivery — EU orders pay online.
  // Klarna is hardcoded to RO/RON (the store currency); Klarna requires the consumer
  // country to match the currency, so it can't serve non-RO orders — exclude it abroad.
  const availablePaymentMethods = isIntl
    ? paymentMethods.filter((m) => m.type !== "cash_on_delivery" && m.type !== "klarna")
    : paymentMethods;
  // Fiecare efect de mai jos incepe cu garda de preview, INAINTE de orice
  // ascultator sau scriere pe `document`: pusa mai jos, functia de curatare n-ar
  // mai rula si magazinul real ar ramane cu scroll-ul blocat.
  useEffect(() => {
    if (preview) return;
    if (isIntl && !availablePaymentMethods.some((m) => m.type === paymentMethod)) {
      setPaymentMethod(availablePaymentMethods[0]?.type ?? "cash_on_delivery");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntl]);

  // Auto-apply a recovery discount code passed via the restore link (?code=).
  useEffect(() => {
    if (preview || !open || !initialDiscountCode) return;
    let cancelled = false;
    validateDiscount(initialDiscountCode, businessId, goodsTotal).then((r) => {
      if (!cancelled) setAppliedDiscount(r.valid ? r.discount : null);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDiscountCode, businessId]);

  // Re-validate silently when the cart total changes (min_order_amount may no longer be met).
  useEffect(() => {
    if (preview || !appliedDiscount) return;
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
    if (preview || !open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [preview, open, onClose]);

  useEffect(() => {
    if (preview || !open) return;
    getPublicStoreConfig(businessId).then((data) => {
      if (!data) return;
      if (data.page_content) {
        const pc = data.page_content as { checkout_config?: StorePageContent["checkout_config"] };
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
      setCodDiscountConfig(data.cod_discount);
      // Check if any courier is enabled in shipping_zones (Settings > Livrare)
      const zones = data.shipping_zones as Record<string, { enabled?: boolean }> | null;
      const anyEnabled = zones && Object.values(zones).some((z) => z?.enabled);
      setHasCouriers(!!anyEnabled);
      setIntlEnabled(data.international_shipping === true);
      setDpdUseWeight(data.dpd_use_weight === true);
    });
  }, [preview, open, businessId]);

  // Order-bump offers applicable to the cart (checkout surface).
  useEffect(() => {
    if (preview || !open || items.length === 0) return;
    let cancelled = false;
    getCheckoutBumps(businessId, items.map((i) => i.productId)).then((b) => { if (!cancelled) setBumps(b ?? []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [preview, open, businessId, items]);

  // Abandoned-cart capture: debounced, fire-and-forget. The server ignores it
  // unless the store opted in. Only fires once a contact channel is present.
  const trackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (preview || !open || !sessionId || items.length === 0) return;
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
        items: items.map(i => ({ product_id: i.productId, name: i.variantTitle ? `${i.name} (${i.variantTitle})` : i.name, price: i.price, quantity: i.quantity, image_url: i.imageUrl })),
      });
    }, 1500);
    return () => { if (trackTimer.current) clearTimeout(trackTimer.current); };
  }, [preview, open, sessionId, businessId, form.name, form.phone, form.email, items]);

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
        ...items.map(i => ({ product_id: i.productId, name: i.name, price: i.price, quantity: i.quantity, variant_title: i.variantTitle })),
        ...acceptedBumpOffers.map((o) => ({ product_id: o.products[0]!.id, name: o.products[0]!.name, price: o.pricing!.price, quantity: 1 })),
      ];
      const payload = {
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
        source: getAttribution() ?? undefined,
      };
      const payloadKey = JSON.stringify(payload);
      let orderId = placedRef.current?.payloadKey === payloadKey ? placedRef.current.orderId : null;
      if (!orderId) {
        // GA4 funnel: shipping + payment info captured once, right before the order
        // is created (single-page checkout; retries reuse placedRef so no re-fire).
        const gaItems = items.map((i) => ({ item_id: i.productId, item_name: i.name, price: i.price, quantity: i.quantity }));
        gtagEvent("add_shipping_info", { currency: "RON", value: grandTotal, shipping_tier: courierSelection?.courierLabel, items: gaItems });
        gtagEvent("add_payment_info", { currency: "RON", value: grandTotal, payment_type: paymentMethod, items: gaItems });
        const result = await placeCartOrder(payload);
        if ("error" in result) { setErrors({ _: result.error as string }); return; }
        orderId = (result as { orderId: string }).orderId;
        placedRef.current = { payloadKey, orderId };
      }

      if (paymentMethod !== "cash_on_delivery") {
        const endpoint = paymentMethod === "stripe" ? "/api/stripe/order-checkout"
          : paymentMethod === "netopia" ? "/api/netopia/start"
          : paymentMethod === "klarna" ? "/api/klarna/start"
          : paymentMethod === "revolut" ? "/api/revolut/start"
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
      {!preview && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" onClick={onClose} />}
      {/* Sirul de clase e scris intreg pe fiecare ramura, nu compus din parte
          fixa si parte variabila: reordonarea claselor ar aparea ca diferenta la
          compararea marcajului cu productia, desi CSS-ul e acelasi.
          In miniatura panoul iese din pozitionarea fixa, care raportata la
          fereastra cadrului l-ar face sa-si confirme singur o inaltime gresita.
          Primeste in schimb o inaltime proprie, cu ce depaseste TAIAT, nu pus pe
          derulare: formularul intreg trece de 1800 px la latime de telefon, iar
          un card atat de inalt pentru fiecare design ar face galeria de
          nefolosit. Se vede partea de sus, exact cum arata livrata. */}
      <div
        className={preview
          ? "relative mx-auto w-full md:max-w-md h-[900px] overflow-hidden bg-surface"
          : "fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-[60] w-full md:max-w-md max-h-[94vh] overflow-y-auto bg-surface"}
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
        <form onSubmit={preview ? (e) => e.preventDefault() : handleSubmit} className="px-5 pt-4 pb-6 space-y-4">
          <div className="space-y-2">
            {items.map((item) => (
              <div key={lineKey(item)} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40">
                {item.imageUrl && (
                  <Image src={item.imageUrl} alt={item.name} width={48} height={48} className="rounded-lg object-cover border border-border shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground truncate">{item.name}</p>
                  {item.variantTitle && <p className="text-xs text-muted-foreground truncate">{item.variantTitle}</p>}
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
              cart={items.map((i) => ({ productId: i.productId, quantity: i.quantity }))}
              subtotal={Math.max(0, goodsTotal - discountAmount)}
              onSelect={setCourierSelection}
              optiuniDemo={preview?.courierOptions}
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
            {codDiscountAmount > 0 && (
              <div className="flex justify-between" style={{ color }}>
                <span>Reducere plata ramburs</span>
                <span className="font-medium">-{codDiscountAmount} lei</span>
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
