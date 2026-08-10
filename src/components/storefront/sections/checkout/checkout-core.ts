"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { computeVat, vatBase, type VatConfig } from "@/lib/utils/vat";
import { placeCartOrder } from "@/lib/actions/order.actions";
import { getAttribution } from "@/lib/storefront/attribution";
import { getPublicStoreConfig } from "@/lib/actions/store.actions";
import { trackAbandonedCart } from "@/lib/actions/abandoned-cart.actions";
import { validateDiscount, type ValidatedDiscount } from "@/lib/actions/discount.actions";
import { gtagEvent } from "@/lib/marketing";
import type { CourierSelection } from "@/components/ministore/CourierSelector";
import { computeCardDiscount, computeCodDiscount, computeCodFee, DEFAULT_COD_FEE, type PaymentMethodType, type CardDiscountConfig, type CodFeeConfig } from "@/lib/payment-methods";
import { getCheckoutBumps } from "@/lib/actions/offer.actions";
import type { ResolvedOffer } from "@/lib/offers/offer.types";
import { useCart } from "@/components/storefront/cart/CartProvider";
import type { StorePageContent } from "@/lib/storefront/store-content.types";
import { useCompanyBilling } from "@/components/ministore/CompanyFields";
import { type CheckoutPreview } from "./checkout-preview";

/**
 * Motorul finalizarii comenzii: toata starea, toate apelurile catre server si
 * trimiterea comenzii, fara nicio bucata de marcaj.
 *
 * Exista pentru ca acelasi flux trebuie desenat in doua feluri — ca modal peste
 * magazin si ca pagina cu doua coloane — iar o a doua copie a lui ar insemna doua
 * formule de TVA, doua liste de campuri trimise la server si, in cateva luni,
 * doua comportamente la plata. Aici e o singura sursa; modelele decid doar cum
 * arata.
 *
 * Nimic nu s-a schimbat fata de forma dinainte: acelasi payload catre
 * `placeCartOrder`, aceleasi rotunjiri, acelasi `placedRef` care impiedica o a
 * doua comanda la reincercarea unei plati esuate.
 */
export interface CheckoutOrderInput {
  open: boolean; onClose: () => void; color: string; basePath: string; businessId: string;
  shippingCost: number; freeShippingThreshold: number | null;
  emailFieldConfig: { enabled: boolean; required: boolean };
  initialDiscountCode?: string | null;
  /**
   * Miniatura din catalogul de design-uri: formularul se randeaza in fluxul
   * paginii, cu datele astea in loc de cele de la server, si nu iese in retea
   * deloc. Din magazin nu se trimite niciodata.
   */
  preview?: CheckoutPreview | null;
  /**
   * Unde e desenat formularul.
   *
   * Un modal opreste derularea paginii din spate si se inchide cu Escape; o
   * PAGINA nu are voie sa faca niciuna dintre astea — ar bloca exact pagina pe
   * care sta clientul, iar formularul trece de o inaltime de ecran, deci butonul
   * de comanda ar deveni inaccesibil.
   */
  suprafata?: "modal" | "pagina";
}

export function useCheckoutOrder({
  open, onClose, basePath, businessId, shippingCost, freeShippingThreshold, emailFieldConfig, initialDiscountCode,
  preview = null,
  suprafata = "modal",
}: CheckoutOrderInput) {
  const { items, total, clear, sessionId, hydrated, lineUnit } = useCart();
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
  const [codFeeConfig, setCodFeeConfig] = useState<CodFeeConfig>(preview?.codFee ?? DEFAULT_COD_FEE);
  const customFields = checkoutConfig?.custom_fields ?? [];
  const extras = checkoutConfig?.extras ?? [];
  // Discount code is OFF by default — same semantics as the editor toggle and OrderModal.
  const hiddenFields = checkoutConfig?.hidden_fields ?? ["discount"];
  const emailField = checkoutConfig?.email_field ?? emailFieldConfig;
  // Comenzi pe firma. Implicit oprit: un magazin care nu a pornit reglajul arata
  // exact formularul de pana acum, fara niciun camp in plus.
  const companyFieldsOn = checkoutConfig?.company_fields?.enabled === true;
  const [selectedExtras, setSelectedExtras] = useState<Record<string, boolean>>({});
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [courierSelection, setCourierSelection] = useState<CourierSelection | null>(null);
  const [hasCouriers, setHasCouriers] = useState(!!preview);
  const [bumps, setBumps] = useState<ResolvedOffer[]>([]);
  const [acceptedBumps, setAcceptedBumps] = useState<Set<string>>(new Set());
  // Comanda minima a comerciantului (Setari > Livrare). Vine din aceeasi
  // configuratie publica citita mai jos, deci nu costa niciun apel in plus.
  // Fara ea, pe pagina de finalizare — adresa publica, in care se intra si
  // direct din linkul de recuperare a cosului — clientul afla de prag abia de
  // la server, dupa ce a completat tot formularul.
  const [minOrderAmount, setMinOrderAmount] = useState<number | null>(null);
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
  // Pragul se masoara pe aceeasi valoare ca la server (`subtotal`, cu bump-urile
  // acceptate incluse), ca butonul sa nu ramana blocat pe o comanda pe care
  // serverul ar accepta-o.
  const belowMinOrder = minOrderAmount !== null && goodsTotal < minOrderAmount;
  const extrasTotal = extras.filter(e => selectedExtras[e.id]).reduce((s, e) => s + e.price, 0);
  const baseShippingCost = courierSelection ? courierSelection.price : shippingCost;
  const discountAmount = appliedDiscount ? Math.min(appliedDiscount.discountAmount, goodsTotal) : 0;
  const isFreeShippingDiscount = appliedDiscount?.type === "free_shipping";
  const shipping = (isFreeShippingDiscount || (freeShippingThreshold && goodsTotal >= freeShippingThreshold)) ? 0 : baseShippingCost;

  // Card-payment discount (mirrors the server): only for online card methods, on
  // the goods value after promo. Shown live as the customer switches payment method.
  const cardDiscountAmount = computeCardDiscount(cardDiscountConfig, paymentMethod, goodsTotal + extrasTotal - discountAmount);
  // Ramburs discount (mirrors the server): only when the customer picks cash on delivery.
  const codDiscountAmount = computeCodDiscount(codDiscountConfig, paymentMethod, goodsTotal + extrasTotal - discountAmount);
  // Taxa de ramburs (oglinda serverului): se calculeaza INAINTEA TVA-ului, fiindca
  // intra in baza lui alaturi de marfa si extraoptiuni.
  const codFeeAmount = computeCodFee(codFeeConfig, paymentMethod, goodsTotal + extrasTotal - discountAmount, vatConfig);
  // VAT: aceeasi baza si acelasi helper ca serverul si ca formularul de comanda
  // directa — marfa, extraoptiunile si TRANSPORTUL, dupa toate reducerile, plus taxa de ramburs.
  const bazaTva = vatBase({
    goods: goodsTotal,
    extras: extrasTotal,
    shipping,
    discount: discountAmount,
    cardDiscount: cardDiscountAmount,
    codDiscount: codDiscountAmount,
    codFee: codFeeAmount,
  });
  const { vatAmount, vatAddOn } = computeVat(bazaTva, vatConfig);
  // Round to 2 decimals (cents): float subtraction like 199.29 - 19.93 would
  // otherwise surface as 179.35999999999999 in the total/button/confirm URL.
  const grandTotal = Math.max(0, Math.round((goodsTotal + extrasTotal - discountAmount - cardDiscountAmount - codDiscountAmount + codFeeAmount + shipping + vatAddOn) * 100) / 100);

  const [form, setForm] = useState(preview?.form ?? { name: "", phone: "", email: "", county: "", city: "", address: "", country: "RO", postCode: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  // Order created by a previous identical submit (e.g. retry after the card
  // processor errored) — reused so the retry doesn't place a duplicate order
  // and re-send merchant/customer notifications.
  const placedRef = useRef<{ payloadKey: string; orderId: string } | null>(null);
  const [intlEnabled, setIntlEnabled] = useState(preview?.intlEnabled ?? false);
  const isIntl = intlEnabled && form.country !== "RO";
  // Comenzile din afara tarii NU primesc blocul de firma: cifra de control a
  // CUI-ului e un algoritm strict romanesc, deci orice cod de TVA european ar fi
  // respins ca „invalid" si ar bloca trimiterea formularului. Facturarea B2B
  // intracomunitara e alta discutie, cu taxare inversa cu tot.
  const companyEnabled = companyFieldsOn && !isIntl;
  // Starea si cautarea ANAF stau in acelasi carlig si pentru modalul „cumpara
  // acum", ca regulile de validare a CUI-ului sa nu poata diverge intre cele doua
  // formulare. Chemat neconditionat: pornit sau nu, e acelasi numar de carlige.
  const companyBilling = useCompanyBilling(companyEnabled);
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
  //
  // Se asteapta cosul: pe pagina de comanda formularul e „deschis" din prima
  // randare, iar cosul vine din localStorage abia dupa aceea. Validat pe zero
  // lei, un cod cu prag minim ar fi respins si pierdut in tacere, iar clientul
  // ar plati pretul intreg fara sa afle de ce.
  useEffect(() => {
    if (preview || !open || !initialDiscountCode || !hydrated) return;
    let cancelled = false;
    validateDiscount(initialDiscountCode, businessId, goodsTotal).then((r) => {
      if (!cancelled) setAppliedDiscount(r.valid ? r.discount : null);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, open, hydrated, initialDiscountCode, businessId]);

  // Re-validate silently when the cart total changes (min_order_amount may no longer be met).
  useEffect(() => {
    if (preview || !appliedDiscount) return;
    (async () => {
      const result = await validateDiscount(appliedDiscount.code, businessId, goodsTotal);
      if (!result.valid) {
        setAppliedDiscount(null);
        setDiscountError(result.error);
        // Banner-ul reducerii tocmai a disparut si, cu campul pliat, mesajul
        // n-ar avea unde sa apara: totalul ar creste fara nicio explicatie.
        setShowDiscountField(true);
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

  // Escape si blocarea derularii sunt purtari de MODAL. Pe pagina, blocarea ar
  // opri derularea documentului insusi si clientul n-ar mai ajunge la butonul de
  // comanda, iar Escape n-ar avea ce sa inchida.
  useEffect(() => {
    if (preview || !open || suprafata === "pagina") return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [preview, suprafata, open, onClose]);

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
      setCodFeeConfig(data.cod_fee);
      setMinOrderAmount(data.min_order_amount);
      // Check if any courier is enabled in shipping_zones (Settings > Livrare)
      const zones = data.shipping_zones as Record<string, { enabled?: boolean }> | null;
      const anyEnabled = zones && Object.values(zones).some((z) => z?.enabled);
      setHasCouriers(!!anyEnabled);
      setIntlEnabled(data.international_shipping === true);
    });
  }, [preview, open, businessId]);

  // Order-bump offers applicable to the cart (checkout surface).
  useEffect(() => {
    if (preview || !open || items.length === 0) return;
    let cancelled = false;
    // Pe esec lista se GOLESTE, nu ramane cea veche: serverul re-evalueaza acum
    // ofertele la plasarea comenzii, iar un bump bifat dintr-o lista invechita
    // i-ar opri comanda din cauza unei erori de retea.
    getCheckoutBumps(businessId, items.map((i) => i.productId))
      .then((b) => { if (!cancelled) setBumps(b ?? []); })
      .catch(() => { if (!cancelled) setBumps([]); });
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

  /**
   * Verifica formularul si intoarce cheia PRIMULUI camp gresit, sau null cand e
   * totul in regula. Cheia, nu doar un boolean: pe pagina formularul trece de o
   * inaltime de ecran, iar butonul e la capat, deci fara o mutare de focus
   * clientul apasa si nu vede nimic intamplandu-se.
   * Cheile sunt in ordinea campurilor, iar `Object.keys` o pastreaza.
   */
  function validate(): string | null {
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
    // Campurile de firma stau in formular imediat dupa adresa, deci si erorile
    // lor intra aici: `Object.keys` pastreaza ordinea, iar dupa prima cheie se
    // muta focusul.
    Object.assign(e, companyBilling.validateCompany());
    if (hasCouriers && !courierSelection) e.courier = "Selecteaza o metoda de livrare";
    if (courierSelection?.deliveryType === "locker" && !courierSelection.lockerId) e.courier = "Selecteaza un locker";
    /*
     * ⚠ Livrarea la punct GLS cere emailul, chiar daca magazinul l-a facut
     * optional.
     *
     * MyGLS il cere obligatoriu la serviciul PSD, si pe buna dreptate: coletul
     * ajunge la un ghiseu, iar cumparatorul trebuie sa AFLE ca il poate ridica.
     * Fara instiintare, coletul sta pana expira termenul si se intoarce la
     * comerciant, care plateste si dusul, si intorsul.
     *
     * Cerut aici, la alegere, nu la emiterea AWB-ului: acolo comanda e deja
     * plasata, iar comerciantul ar ramane cu un colet pe care nu-l poate expedia
     * si fara nicio cale de a mai obtine emailul de la client.
     */
    if (courierSelection?.courier === "gls" && courierSelection?.deliveryType === "locker" && !form.email.trim()) {
      e.email = "Emailul e obligatoriu pentru livrarea la punct GLS";
    }
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
    return Object.keys(e)[0] ?? null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formular = e.currentTarget as HTMLFormElement;
    const primulGresit = validate();
    if (primulGresit) {
      // Campurile poarta `name` egal cu cheia erorii. Selectorul de curier nu e
      // un camp, deci pentru el nu se muta nimic — mesajul lui e anuntat de
      // `role="alert"`.
      const camp = formular.elements.namedItem(primulGresit);
      if (camp instanceof HTMLElement) {
        camp.scrollIntoView({ block: "center", behavior: "smooth" });
        camp.focus({ preventScroll: true });
      }
      return;
    }
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
        shipping_token: courierSelection?.token,
        // Vezi `placeCartOrder`: doar pentru masurare, nu pentru decizie.
        cod_declarat: paymentMethod === "cash_on_delivery" ? total : 0,
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
        // Datele de pe factura, cand clientul a ales persoana juridica. `undefined`
        // altfel — comanda ramane exact ce era. NU atinge adresa de livrare de mai
        // sus: pretul transportului e semnat pe destinatia aceea.
        billing_company: companyBilling.billingPayload() ?? undefined,
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
      // Cheia de reluare e payload-ul INTREG, metoda de plata inclusa.
      //
      // Scoaterea metodei ar rezolva cazul „am incercat cu cardul, a esuat, trec
      // pe ramburs": s-ar refolosi aceeasi comanda in loc sa se creeze a doua.
      // Dar comanda deja inserata ramane in baza cu metoda veche, cu reducerea de
      // card aplicata si cu alt total decat cel afisat clientului — adica exact
      // datele dupa care comerciantul incaseaza. Intre o comanda in plus si o
      // comanda cu bani gresiti, prima se vede si se anuleaza; a doua nu.
      //
      // Reparatia adevarata e o cheie de idempotenta generata la deschiderea
      // formularului si trimisa lui `placeCartOrder`, care sa actualizeze comanda
      // in loc sa insereze alta. Cere o schimbare pe server, deci nu se face aici.
      const payloadKey = JSON.stringify(payload);
      let orderId = placedRef.current?.payloadKey === payloadKey ? placedRef.current.orderId : null;
      if (!orderId) {
        // GA4 funnel: shipping + payment info captured once, right before the order
        // is created (single-page checkout; retries reuse placedRef so no re-fire).
        // Acelasi pret ca in `value`: cel de la server, nu cel din localStorage.
        const gaItems = items.map((i) => ({ item_id: i.productId, item_name: i.name, price: lineUnit(i), quantity: i.quantity }));
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
      // Doar `orderId`: numele si totalul sunt oricum citite din comanda pe
      // pagina de confirmare, iar acolo se incarca pixelii de marketing, care
      // trimit adresa completa a paginii. Numele clientului n-are ce cauta in
      // `page_location`-ul GA4, in istoricul browserului si in Referer.
      window.location.href = `${basePath}/confirm?orderId=${orderId}`;
    });
  }


  return {
    acceptedBumpOffers,
    acceptedBumps,
    appliedDiscount,
    availablePaymentMethods,
    belowMinOrder,
    bumps,
    cardDiscountAmount,
    codDiscountAmount,
    codFeeAmount,
    companyBilling,
    companyEnabled,
    customFields,
    customValues,
    discountAmount,
    discountError,
    discountInput,
    emailField,
    errors,
    extras,
    extrasTotal,
    form,
    goodsTotal,
    grandTotal,
    handleApplyDiscount,
    handleRemoveDiscount,
    handleSubmit,
    hasCouriers,
    hiddenFields,
    intlEnabled,
    isFreeShippingDiscount,
    isIntl,
    isPending,
    isValidatingDiscount,
    items,
    minOrderAmount,
    newsletterOffer,
    newsletterOptIn,
    paymentMethod,
    paymentMethods,
    selectedExtras,
    setCourierSelection,
    setCustomValues,
    setDiscountError,
    setDiscountInput,
    setForm,
    setNewsletterOptIn,
    setPaymentMethod,
    setSelectedExtras,
    setShowDiscountField,
    shipping,
    showDiscountField,
    toggleBump,
    total,
    vatAmount,
    vatConfig,
  };
}

/** Tot ce ofera motorul catre marcaj. Derivat, ca sa nu poata ramane in urma. */
export type CheckoutEngine = ReturnType<typeof useCheckoutOrder>;
