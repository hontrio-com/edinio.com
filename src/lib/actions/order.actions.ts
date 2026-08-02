"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { computeVat, vatBase } from "@/lib/utils/vat";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { parseNotificationsConfig, sendNewOrderEmail, sendOrderConfirmationToCustomer, sendOrderStatusToCustomer, sendCustomerMessage } from "@/lib/email";
import { getStoreEmailSender } from "@/lib/email/sender";
import { logError } from "@/lib/error-logger";
import { validateDiscount } from "@/lib/actions/discount.actions";
import { markCartConverted } from "@/lib/abandoned-cart";
import type { OrderSource } from "@/lib/storefront/attribution";
import { comboStockMap, enabledComboPriceMap } from "@/lib/storefront/variants";
import { construiesteTrepte, pretPeTrepte } from "@/lib/storefront/quantity-tiers";
import { verifyShippingQuote } from "@/lib/shipping/quote-token";
import { parseBillingCompany, type BillingCompany, type BillingCompanyInput } from "@/lib/billing/company";
import { verifyBillingCompany } from "@/lib/billing/verify";
import { expandBundleStock } from "@/lib/bundles";
import { applyBumpPricing, applyFbtPricing } from "@/lib/offers/offers";
import { enqueueGmcSyncMany } from "@/lib/google-merchant/queue";
import { sendGa4Purchase, sendGa4Refund } from "@/lib/google-analytics/mp";
import type { GoogleAnalyticsConfig } from "@/lib/google-analytics/types";
import { enqueueOlxSyncMany } from "@/lib/olx/queue";
import { enqueueAboutYouStockMany } from "@/lib/aboutyou/queue";
import { enqueueTrendyolInventoryMany } from "@/lib/trendyol/queue";
import { computeCardDiscount, computeCodDiscount, computeCodFee, normalizePaymentMethod, parseCardDiscountConfig, parseCodFeeConfig } from "@/lib/payment-methods";
import { sendSms } from "@/lib/smso";
import type { SmsoConfig } from "@/lib/smso";
import { maybeSendNoticeNotification, noticeTriggerForStatus, noticeTriggerForPayment } from "@/lib/notice-notify";
import { maybeSyncMailchimpSubscriber, maybeSyncMailchimpOrder, maybeMarkMailchimpOrderPaid, orderValueTag } from "@/lib/mailchimp-sync";
import { maybeSyncBrevoSubscriber, maybeSyncBrevoOrder, maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";
import { maybeSyncKlaviyoSubscriber, maybeTrackKlaviyoOrder } from "@/lib/klaviyo-sync";
import { formatPrice, formatDate } from "@/lib/utils/format";

// Base URL for building public store links used in notice.ro SMS templates ({store_url}/{url}).
const STORE_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ── Server-authoritative pricing ─────────────────────────────────────────────
// Customers are anonymous and prices arrive from the browser; they must NEVER be
// trusted. We reload the product and recompute every legitimate price from the
// product's own configuration, then match the submitted amount against it.

type OrderProduct = {
  id: string;
  price: number;
  is_active: boolean;
  business_id: string;
  page_sections: unknown;
};

/**
 * Preturile unitare legitime pentru produsul principal.
 *
 * Cand comanda numeste o varianta, singurul pret legitim e AL EI. Fara ingustarea
 * asta, orice pret de varianta activa trecea pentru orice varianta: se putea
 * comanda marimea scumpa la pretul celei ieftine, iar comerciantul vedea in
 * comanda numele corect si suma mica. Liniile din cos n-au avut niciodata
 * problema — acolo varianta se trimite explicit si se pretuieste din combinatii.
 */
function legitUnitPrices(product: OrderProduct, variantTitle?: string | null): number[] {
  if (variantTitle) {
    const pret = enabledComboPriceMap(product.page_sections, round2(product.price)).get(variantTitle);
    // Varianta necunoscuta sau dezactivata intre timp: nu cadem pe pretul de baza,
    // fiindca ar fi exact portita pe care o inchidem. Comanda e respinsa.
    return pret != null ? [round2(pret)] : [];
  }
  const set = new Set<number>([round2(product.price)]);
  const ps = (product.page_sections ?? {}) as {
    variants?: { enabled?: boolean; combinations?: Array<{ enabled?: boolean; price?: number | null }> };
  };
  if (ps.variants?.enabled && Array.isArray(ps.variants.combinations)) {
    for (const c of ps.variants.combinations) {
      // Doar preturi strict pozitive, ca in `comboUnitPrice`: zero inseamna
      // „fara pret propriu", si il pune si importul pentru combinatiile fara
      // `pret=` in CSV. Acceptat aici, ar fi lasat o comanda de 0 lei sa treaca
      // pe orice produs cu variante.
      const n = Number(c?.price);
      if (c?.enabled && Number.isFinite(n) && n > 0) set.add(round2(n));
    }
  }
  return [...set];
}

// Totalurile legitime pentru un pret unitar si o cantitate: pretul intreg si cel
// calculat de motorul de trepte. Amandoua raman valide — pretul intreg acopera
// clientii cu pagina veche in cache, care inca trimit `cantitate x pret`.
function legitBundleTotals(product: OrderProduct, unit: number, quantity: number): number[] {
  const intreg = round2(unit * quantity);
  const trepte = construiesteTrepte((product.page_sections as { quantity_tiers?: unknown } | null)?.quantity_tiers, unit);
  const cuPachete = round2(pretPeTrepte(trepte, quantity, unit).subtotal);
  return cuPachete === intreg ? [intreg] : [intreg, cuPachete];
}

// Returns the authoritative pre-discount subtotal, or null if the claimed unit
// price cannot be reconciled with any legitimate configuration.
function authoritativeSubtotal(
  product: OrderProduct,
  claimedUnit: number,
  quantity: number,
  variantTitle?: string | null,
): number | null {
  if (!Number.isFinite(claimedUnit) || quantity < 1) return null;
  const claimed = round2(claimedUnit * quantity);
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const unit of legitUnitPrices(product, variantTitle)) {
    for (const candidate of legitBundleTotals(product, unit, quantity)) {
      const d = Math.abs(candidate - claimed);
      if (d < bestDiff) { bestDiff = d; best = candidate; }
    }
  }
  // Tolerance absorbs rounding only; real tampering is orders of magnitude away.
  return best !== null && bestDiff <= 0.5 ? best : null;
}

/**
 * Costul de livrare pe care il acceptam, nu cel pe care il cere clientul.
 *
 * Transportul era singurul numar din comanda scris asa cum venea din browser:
 * cine trimitea zero primea livrare gratuita, iar comerciantul platea oricum
 * curierul. Acum se accepta doar doua lucruri: un pret pe care l-am cotat chiar
 * noi, dovedit cu semnatura de la `getShippingOptions`, sau tariful implicit al
 * magazinului, pentru cazul in care nu exista niciun curier de ales.
 *
 * Orice altceva cade pe tariful implicit. NU refuzam comanda: o cotatie pierduta
 * nu are voie sa coste o vanzare, iar tariful implicit e valoarea pe care
 * comerciantul a declarat-o oricum.
 *
 * Livrarea gratuita ramane unde era, dupa apelul asta: pragul de comanda si
 * codul de reducere se evalueaza server-side si pun transportul pe zero.
 */
function autoritativeShipping(
  businessId: string,
  cerut: number,
  token: string | null | undefined,
  dest: { county?: string | null; city?: string | null; country?: string | null; postCode?: string | null },
  tarifImplicit: number | null,
): number {
  const claimed = Math.max(0, round2(Number(cerut) || 0));
  if (verifyShippingQuote(businessId, dest, claimed, token)) return claimed;
  // Magazin fara tarif implicit configurat: n-avem cu ce compara, deci nu-i
  // taiem comerciantului transportul pe baza unei banuieli.
  if (tarifImplicit == null) return claimed;
  if (claimed === round2(tarifImplicit)) return claimed;
  logError({
    action: "placeOrder.shippingRejected",
    message: "Shipping cost not covered by a signed quote",
    details: { businessId, claimed, tarifImplicit, hasToken: !!token },
    severity: "warning",
  });
  return Math.max(0, round2(tarifImplicit));
}

type CheckoutExtra = { id: string; label: string; price: number };

// Load and validate the store-defined checkout extras (server-authoritative prices).
function validateExtras(
  pageContent: unknown,
  clientExtras: { id: string; label: string; price: number }[] | undefined,
): CheckoutExtra[] {
  const serverExtras = ((pageContent as { checkout_config?: { extras?: CheckoutExtra[] } } | null)?.checkout_config?.extras) ?? [];
  const byId = new Map(serverExtras.map((e) => [e.id, e]));
  return (clientExtras ?? [])
    .map((e) => byId.get(e.id))
    .filter((e): e is CheckoutExtra => !!e)
    .map((e) => ({ id: e.id, label: e.label, price: round2(Number(e.price)) }));
}

/**
 * Datele de facturare pe firma, hotarate de SERVER.
 *
 * Trei filtre, in ordinea asta, si toate trei sunt necesare:
 *
 *   1. COMUTATORUL. Se citeste din `page_content`, nu din ce a trimis browserul.
 *      Actiunile astea sunt exporturi dintr-un modul `"use server"`, adica
 *      endpointuri publice: pe un magazin cu reglajul stins, oricine ar putea
 *      atasa oricarei comenzi date de firma pe care comerciantul nu le-a cerut
 *      niciodata. Acelasi principiu ca la `validateExtras`, care nu crede
 *      preturile venite de la client.
 *   2. FORMA. `parseBillingCompany` taie sirurile, verifica cifra de control a
 *      CUI-ului si respinge blocul daca lipseste denumirea — o factura fara ele
 *      e mai rea decat lipsa facturii.
 *   3. ADEVARUL. `verifyBillingCompany` reintreaba ANAF, cu doua secunde de
 *      rabdare, si ia de acolo denumirea, numarul de la registrul comertului si
 *      statutul de platitor de TVA. Cifra de control prinde greselile de tastare,
 *      nu si un CUI real trimis cu o denumire inventata.
 *
 * CAND ANAF SPUNE CA ACEL CUI NU EXISTA, comanda nu trece. Alternativa — sa o
 * salvam tacut ca persoana fizica — ar fi fost mai rea decat pare: clientul a
 * cerut explicit factura pe firma, ar fi apasat „Trimite comanda", ar fi vazut
 * pagina de confirmare si ar fi aflat abia peste cateva zile, de pe factura, ca
 * datele lui n-au ajuns nicaieri. Un mesaj sub campul de CUI se repara in zece
 * secunde. Filtrul 1 si 2 intorc insa `null`, nu eroare: acolo nu e nimic de
 * reparat de catre client.
 */
type BillingResolution = { company: BillingCompany | null } | { error: string };

async function resolveBillingCompany(
  pageContent: unknown,
  input: unknown,
): Promise<BillingResolution> {
  const pornit = (pageContent as { checkout_config?: { company_fields?: { enabled?: boolean } } } | null)
    ?.checkout_config?.company_fields?.enabled === true;
  if (!pornit) return { company: null };

  const curatat = parseBillingCompany(input);
  if (!curatat) return { company: null };

  const confirmat = await verifyBillingCompany(curatat);
  if (!confirmat) {
    return { error: "CUI-ul introdus nu exista in registrul ANAF. Verifica-l si incearca din nou." };
  }
  return { company: confirmat };
}

async function buildOrderNumber(supabase: SupabaseClient, businessId: string): Promise<string> {
  const { data: settings } = await supabase
    .from("store_settings")
    .select("order_number_format")
    .eq("business_id", businessId)
    .single();

  if (settings?.order_number_format === "sequential") {
    const { data: counter } = await supabase.rpc("next_order_number", { p_business_id: businessId });
    const n = (counter as number) ?? 1;
    return `#${String(n).padStart(4, "0")}`;
  }

  return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

// Merge client-captured attribution with the server-side user-agent into the
// stored order_source (null when there's nothing to record).
function buildOrderSource(source: OrderSource | undefined, userAgent: string | undefined): OrderSource | null {
  if (!source && !userAgent) return null;
  return { ...(source ?? {}), ...(userAgent ? { user_agent: userAgent } : {}) };
}

// Fire a server-side GA4 event (Measurement Protocol) for an order — purchase at
// checkout, refund on cancel/refund. Fire-and-forget: loads the store's GA config
// and never throws into the caller.
async function ga4OrderEvent(
  businessId: string,
  kind: "purchase" | "refund",
  o: { transactionId: string; value: number; clientId?: string; items: { product_id?: string; name: string; price: number; quantity: number }[] },
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("store_settings").select("google_analytics_config").eq("business_id", businessId).single();
    const cfg = (data?.google_analytics_config as GoogleAnalyticsConfig | null) ?? null;
    if (!cfg?.measurement_id || !cfg?.api_secret) return;
    const mp = { measurementId: cfg.measurement_id, apiSecret: cfg.api_secret };
    const items = o.items.map((i) => ({ item_id: i.product_id, item_name: i.name, price: i.price, quantity: i.quantity }));
    const payload = { transactionId: o.transactionId, value: o.value, clientId: o.clientId, items };
    if (kind === "purchase") await sendGa4Purchase(mp, payload);
    else await sendGa4Refund(mp, payload);
  } catch {
    // best-effort
  }
}

/**
 * Prima linie care cere mai mult decat stocul declarat al variantei ei, spusa
 * pe romaneste. `null` cand totul e in regula.
 *
 * Sta aici, intr-un singur loc, fiindca sunt DOUA cai de comanda: formularul de
 * comanda directa din pagina de produs (`placeOrder`) si finalizarea cosului
 * (`placeCartOrder`). Verificarea exista doar pe a doua, asa ca o marime pusa pe
 * zero se putea totusi comanda din formular, care e chiar calea cea mai
 * folosita. Doua copii ale regulii ar fi apucat-o iar pe drumuri diferite.
 *
 * Combinatiile fara stoc completat nu sunt in harta: pentru ele nu se schimba
 * nimic, ramane stocul produsului intreg. Acelasi produs poate aparea pe mai
 * multe linii, deci cantitatile se aduna inainte de comparatie.
 */
function eroareStocPeVarianta(
  stocPeProdus: Map<string, Map<string, number>>,
  linii: { product_id: string; variant_title?: string | null; quantity: number }[],
): string | null {
  const cerut = new Map<string, { titlu: string; productId: string; cantitate: number }>();
  for (const l of linii) {
    if (!l.variant_title) continue;
    const cheie = `${l.product_id}::${l.variant_title}`;
    const dejaCerut = cerut.get(cheie)?.cantitate ?? 0;
    const cantitate = Math.max(1, Math.floor(Number(l.quantity) || 1));
    cerut.set(cheie, {
      titlu: l.variant_title,
      productId: l.product_id,
      cantitate: dejaCerut + cantitate,
    });
  }
  for (const { titlu, productId, cantitate } of cerut.values()) {
    const disponibil = stocPeProdus.get(productId)?.get(titlu);
    if (disponibil === undefined || cantitate <= disponibil) continue;
    return disponibil <= 0
      ? `Varianta „${titlu}" nu mai este in stoc. Alege alta optiune.`
      : `Din varianta „${titlu}" au mai ramas ${disponibil} bucati.`;
  }
  return null;
}

/**
 * Scade stocul declarat al fiecarei variante vandute.
 *
 * Pana acum se scadea numai `products.stock_quantity`, adica stocul produsului
 * intreg. Numarul de pe fiecare marime era o declaratie pe care comerciantul o
 * tinea de mana: oprea vanzarea cand scria el zero, dar o marime cu cinci bucati
 * ramanea cinci oricat s-ar fi vandut din ea, iar verificarea de mai sus n-avea
 * ce sa apere.
 *
 * Toata socoteala se face in baza de date, sub lock (`decrement_variant_stock_batch`).
 * Citita aici, modificata si scrisa inapoi, doua comenzi in aceeasi clipa ar
 * citi amandoua cinci si ar scrie amandoua patru, iar o bucata s-ar pierde.
 *
 * Se cheama DUPA ce comanda a intrat, la fel ca scaderea stocului de produs: o
 * comanda respinsa n-are voie sa consume stoc.
 */
async function scadeStoculVariantelor(
  admin: SupabaseClient<Database>,
  linii: { product_id: string; variant_title?: string | null; quantity: number }[],
): Promise<void> {
  const items = linii
    .filter((l) => l.variant_title)
    .map((l) => ({
      product_id: l.product_id,
      variant_title: l.variant_title as string,
      quantity: Math.max(1, Math.floor(Number(l.quantity) || 1)),
    }));
  if (items.length === 0) return;
  await admin.rpc("decrement_variant_stock_batch" as never, { p_items: items } as never);
}

export async function placeOrder(data: {
  business_id: string;
  cart_session_id?: string;
  product_id: string;
  product_name: string;
  product_price: number;
  /** Combinatia de varianta aleasa, cand produsul are variante. */
  variant_title?: string;
  quantity: number;
  shipping_cost: number;
  /** Semnatura cotatiei de transport (vezi `quote-token.ts`). */
  shipping_token?: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  newsletter_opt_in?: boolean;
  customer_county: string;
  customer_city: string;
  customer_address: string;
  customer_country?: string;
  customer_postal_code?: string;
  /** Date de facturare pe firma. Serverul le recitesc si le reverifica; vezi `resolveBillingCompany`. */
  billing_company?: BillingCompanyInput;
  discount_id?: string;
  discount_code?: string;
  discount_amount?: number;
  vat_amount?: number;
  vat_rate?: number;
  extras?: { id: string; label: string; price: number }[];
  custom_fields?: Record<string, string>;
  customization?: Record<string, { type: string; label: string; value: string | string[] }>;
  /** Items carried over from the storefront cart (priced server-side; variant lines
   *  are re-priced from the product's enabled combination, base otherwise). */
  additional_items?: { product_id: string; name: string; quantity: number; variant_title?: string }[];
  /** Ids of order-bump offers the customer accepted — re-priced server-side (never trusted). */
  accepted_offer_ids?: string[];
  payment_method?: string;
  selected_courier?: string;
  courier_label?: string;
  delivery_type?: string;
  locker_id?: string;
  locker_name?: string;
  locker_address?: string;
  locker_city?: string;
  locker_county?: string;
  woot_service_id?: number;
  woot_courier_name?: string;
  woot_service_name?: string;
  colete_service_id?: number;
  colete_service_name?: string;
  /** First-touch attribution captured client-side (utm / referrer / ad click id). */
  source?: OrderSource;
}) {
  // Anti-abuse: order creation is anonymous and triggers SMS/email (real cost).
  // Throttle per IP so a script can't drain SMS credit or spam the merchant.
  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  const userAgent = hdrs.get("user-agent")?.slice(0, 300) || undefined;
  if (!rateLimit(`placeOrder:${ip}`, 10, 60_000)) {
    return { error: "Prea multe incercari. Te rugam asteapta un minut si incearca din nou." };
  }

  // Use admin client for order creation — customers are anonymous, RLS requires service role
  const admin = createAdminClient();

  // Reload product + store config and recompute every price server-side.
  const [{ data: product }, { data: cfgRow }] = await Promise.all([
    admin.from("products")
      .select("id, price, is_active, business_id, page_sections")
      .eq("id", data.product_id)
      .eq("business_id", data.business_id)
      .single(),
    admin.from("store_settings")
      .select("page_content, free_shipping_threshold, min_order_amount, card_discount_config, cod_discount_config, cod_fee_config, vat_enabled, vat_rate, prices_include_vat, default_shipping_cost")
      .eq("business_id", data.business_id)
      .single(),
  ]);

  if (!product || !product.is_active) {
    return { error: "Produsul nu mai este disponibil. Reincarca pagina." };
  }

  const mainSubtotal = authoritativeSubtotal(product as OrderProduct, data.product_price, data.quantity, data.variant_title);
  if (mainSubtotal === null) {
    logError({ action: "placeOrder.priceRejected", message: "Client price did not match any legitimate configuration", details: { businessId: data.business_id, productId: data.product_id, claimedUnit: data.product_price, quantity: data.quantity }, severity: "warning" });
    return { error: "Pretul comenzii nu este valid. Reincarca pagina si incearca din nou." };
  }

  // Items carried over from the cart (product-page "Comanda" with a non-empty cart).
  // Priced server-side at the product's current base price — never trusted from the
  // client (same model as placeCartOrder). The current product is excluded to avoid
  // double-counting, and unavailable/inactive items are dropped.
  let cartItems: { product_id: string; name: string; price: number; quantity: number }[] = [];
  // Stocul declarat pe fiecare combinatie, pentru produsul comandat si pentru
  // tot ce vine din cos odata cu el. Se verifica dupa ce se stiu toate liniile.
  const stocPeVarianta = new Map<string, Map<string, number>>([
    [product.id, comboStockMap(product.page_sections)],
  ]);
  const liniiCuVarianta: { product_id: string; variant_title?: string | null; quantity: number }[] = [
    { product_id: data.product_id, variant_title: data.variant_title, quantity: data.quantity },
  ];
  if (data.additional_items?.length) {
    const ids = [...new Set(data.additional_items.map((i) => i.product_id))].filter((id) => id !== data.product_id);
    if (ids.length > 0) {
      const { data: extraProducts } = await admin.from("products").select("id, name, price, is_active, page_sections").in("id", ids).eq("business_id", data.business_id);
      const extraMap = new Map((extraProducts ?? []).filter((p) => p.is_active).map((p) => {
        const base = round2(Number(p.price));
        stocPeVarianta.set(p.id, comboStockMap(p.page_sections));
        return [p.id, {
          name: String(p.name),
          price: base,
          combos: enabledComboPriceMap(p.page_sections, base),
          tiers: (p.page_sections as { quantity_tiers?: unknown } | null)?.quantity_tiers,
        }];
      }));
      // Lista filtrata se tine intr-o variabila, ca stocul si preturile sa se uite
      // la EXACT aceleasi linii. Repetat, filtrul ar putea ajunge sa difere.
      const liniiDinCos = data.additional_items
        .filter((i) => i.product_id !== data.product_id && extraMap.has(i.product_id) && i.quantity > 0);
      liniiCuVarianta.push(...liniiDinCos);
      cartItems = liniiDinCos
        .map((i) => {
          const meta = extraMap.get(i.product_id)!;
          // Named variant priced from its enabled combination; unknown/disabled
          // variants and simple products fall back to the product's base price.
          const variantPrice = i.variant_title ? meta.combos.get(i.variant_title) : undefined;
          const unitPrice = variantPrice != null ? round2(variantPrice) : meta.price;
          // Treptele se aplica si liniilor purtate din cos in comanda directa,
          // cu acelasi motor. Altfel cosul arata pretul de pachet, iar comanda
          // plecata din formularul de produs il pierde pe drum.
          const cantitate = Math.floor(i.quantity);
          const linie = pretPeTrepte(construiesteTrepte(meta.tiers, unitPrice), cantitate, unitPrice);
          return {
            product_id: i.product_id,
            name: i.variant_title ? `${meta.name} (${i.variant_title})` : meta.name,
            price: linie.unitPrice,
            quantity: cantitate,
          };
        });
    }
  }
  /*
   * Stocul declarat al fiecarei variante cerute, inainte sa se scrie ceva.
   *
   * Calea asta n-avea verificarea deloc, desi finalizarea cosului o are de mult:
   * o marime pusa pe zero de comerciant se putea comanda linistit din formularul
   * de pe pagina de produs, iar el afla din comanda pe care n-o putea onora.
   */
  const eroareStoc = eroareStocPeVarianta(stocPeVarianta, liniiCuVarianta);
  if (eroareStoc) return { error: eroareStoc };

  // Order bumps: re-price accepted bump lines at the offer's authoritative discounted
  // price (server-side; the client can't forge it). No-op without accepted_offer_ids.
  if (data.accepted_offer_ids?.length) {
    const bumped = await applyBumpPricing(admin, data.business_id, data.accepted_offer_ids, cartItems);
    cartItems = bumped.items;
    // FBT: distribute the "bought together" set discount across the companion lines.
    // Anchor priced at the product's BASE price — matches the set pricing the storefront
    // showed (resolveProductOffers uses the base price), so preview and charge agree.
    const fbt = await applyFbtPricing(admin, data.business_id, data.accepted_offer_ids, data.product_id, round2(Number(product.price)), cartItems);
    cartItems = fbt.items;
  }
  const cartSubtotal = round2(cartItems.reduce((s, i) => s + i.price * i.quantity, 0));
  const subtotal = round2(mainSubtotal + cartSubtotal);

  // Enforce the merchant's minimum order value (Setari > Livrare) against the authoritative subtotal.
  const minOrder = cfgRow?.min_order_amount != null ? Number(cfgRow.min_order_amount) : null;
  if (minOrder !== null && subtotal < minOrder) {
    return { error: `Comanda minima este de ${minOrder} lei. Mai adauga produse pentru a finaliza comanda.` };
  }

  const validatedExtras = validateExtras(cfgRow?.page_content, data.extras);
  const billingResolution = await resolveBillingCompany(cfgRow?.page_content, data.billing_company);
  if ("error" in billingResolution) return { error: billingResolution.error };
  const billingCompany = billingResolution.company;
  const extrasTotal = validatedExtras.reduce((s, e) => s + e.price, 0);

  // Re-validate the discount server-side against the authoritative subtotal.
  let discountAmount = 0;
  let validDiscountId: string | undefined;
  let isFreeShipping = false;
  if (data.discount_code) {
    const dres = await validateDiscount(data.discount_code, data.business_id, subtotal);
    if (dres.valid) {
      discountAmount = Math.min(dres.discount.discountAmount, subtotal);
      validDiscountId = dres.discount.id;
      isFreeShipping = dres.discount.type === "free_shipping";
    }
  }

  // Card-payment discount: applies only to online card methods, on the goods
  // value (subtotal + extras, after any promo), never on shipping. Computed
  // server-side and baked into total so the card processor charges the right sum.
  // O SINGURA citire a metodei de plata, folosita si la calcule, si la inserare.
  // Vezi `normalizePaymentMethod` pentru ce se rupea cand erau doua implicite.
  const metodaPlata = normalizePaymentMethod(data.payment_method);

  const cardDiscount = computeCardDiscount(
    parseCardDiscountConfig(cfgRow?.card_discount_config),
    metodaPlata,
    subtotal + extrasTotal - discountAmount,
  );
  // Ramburs (cash-on-delivery) discount — mutually exclusive with the card discount
  // (an order has a single payment method), computed on the same goods base.
  const codDiscount = computeCodDiscount(
    parseCardDiscountConfig(cfgRow?.cod_discount_config),
    metodaPlata,
    subtotal + extrasTotal - discountAmount,
  );

  // Taxa de ramburs — acelasi declansator ca reducerea de mai sus, semn invers.
  // Se calculeaza AICI, inaintea TVA-ului, fiindca intra in baza lui: e o suma
  // purtatoare de TVA, ca extraoptiunile, nu ca transportul.
  const vatCfgTaxa = {
    vat_enabled: cfgRow?.vat_enabled ?? false,
    vat_rate: Number(cfgRow?.vat_rate ?? 19),
    prices_include_vat: cfgRow?.prices_include_vat ?? true,
  };
  const codFee = computeCodFee(
    parseCodFeeConfig(cfgRow?.cod_fee_config),
    metodaPlata,
    subtotal + extrasTotal - discountAmount,
    vatCfgTaxa,
  );

  // Shipping clamped non-negative; zeroed when free-shipping rules apply.
  const freeThreshold = cfgRow?.free_shipping_threshold != null ? Number(cfgRow.free_shipping_threshold) : null;
  let shipping = autoritativeShipping(
    data.business_id,
    data.shipping_cost,
    data.shipping_token,
    { county: data.customer_county, city: data.customer_city, country: data.customer_country, postCode: data.customer_postal_code },
    cfgRow?.default_shipping_cost != null ? Number(cfgRow.default_shipping_cost) : null,
  );
  if (isFreeShipping || (freeThreshold !== null && subtotal >= freeThreshold)) shipping = 0;

  // VAT: recomputed server-side (mirrors placeCartOrder + the storefront) so single-
  // product / One-Product-Store orders collect VAT too. Base is the PRE-discount
  // goods+extras; only VAT-exclusive pricing adds VAT on top of the total.
  const vatEnabled = cfgRow?.vat_enabled ?? false;
  const vatRate = Number(cfgRow?.vat_rate ?? 19);
  const pricesIncludeVat = cfgRow?.prices_include_vat ?? true;
  // Baza: marfa si extraoptiunile DUPA toate reducerile, plus taxa de ramburs.
  // Formula sta in `vatBase`, folosita si de cele doua formulare din magazin, ca
  // ce vede clientul sa fie ce se incaseaza.
  const { vatAmount, vatAddOn } = computeVat(
    vatBase({ goods: subtotal, extras: extrasTotal, discount: discountAmount, cardDiscount, codDiscount, codFee }),
    { vat_enabled: vatEnabled, vat_rate: vatRate, prices_include_vat: pricesIncludeVat },
  );

  const total = Math.max(0, round2(subtotal + extrasTotal - discountAmount - cardDiscount - codDiscount + codFee + shipping + vatAddOn));

  // Bundle-aware stock: expand a bundle into its components + validate availability
  // before creating the order (prevents overselling components).
  const stockExp = await expandBundleStock(admin, data.business_id, [
    { product_id: data.product_id, quantity: data.quantity },
    ...cartItems.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
  ]);
  if ("error" in stockExp) return { error: stockExp.error };

  const order_number = await buildOrderNumber(admin, data.business_id);

  const unitPrice = round2(mainSubtotal / data.quantity);
  const allItems = [
    {
      product_id: data.product_id,
      name: data.product_name,
      price: unitPrice,
      quantity: data.quantity,
      ...(data.customization && { customization: data.customization }),
    },
    ...cartItems,
    ...validatedExtras.map(e => ({ product_id: `extra_${e.id}`, name: e.label, price: e.price, quantity: 1 })),
  ];

  /*
   * Utilizarea cuponului se revendica ATOMIC, chiar inainte de inserare.
   *
   * Pana acum limita se verifica la validare si contorul crestea dupa ce comanda
   * era deja creata: doua comenzi simultane treceau amandoua de verificare si
   * depaseau limita. `claim_discount_use` face verificarea si incrementul in
   * aceeasi instructiune, deci a doua cerere nu mai gaseste randul.
   *
   * Revendicam aici, nu mai devreme: intre validarea cuponului si punctul asta
   * mai exista pasi care pot iesi cu eroare, iar o utilizare arsa degeaba ar
   * scadea din numarul pe care comerciantul l-a pus la vanzare.
   */
  if (validDiscountId) {
    const { data: revendicat } = await admin.rpc("claim_discount_use" as never, { p_discount_id: validDiscountId } as never);
    if (revendicat === false) {
      return { error: "Codul a atins limita maxima de utilizari. Reincarca pagina si incearca fara el." };
    }
  }

  const { data: order, error } = await admin.from("orders").insert({
    business_id: data.business_id,
    order_number,
    customer_name: data.customer_name.trim(),
    customer_phone: data.customer_phone.trim(),
    customer_email: data.customer_email?.trim() || null,
    shipping_address: {
      county: data.customer_county,
      city: data.customer_city.trim(),
      address: data.customer_address.trim(),
      ...(data.customer_country && data.customer_country !== "RO" && {
        country: data.customer_country,
        postal_code: data.customer_postal_code?.trim() || "",
      }),
      ...(data.selected_courier && {
        courier: data.selected_courier,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
      }),
      ...(data.locker_id && {
        locker_id: data.locker_id,
        locker_name: data.locker_name,
        locker_address: data.locker_address,
        locker_city: data.locker_city,
        locker_county: data.locker_county,
      }),
      ...(data.woot_service_id && {
        woot_service_id: data.woot_service_id,
        woot_courier_name: data.woot_courier_name,
        woot_service_name: data.woot_service_name,
      }),
      ...(data.colete_service_id && {
        colete_service_id: data.colete_service_id,
        colete_service_name: data.colete_service_name,
      }),
    },
    items: allItems,
    subtotal,
    shipping_cost: shipping,
    discount_code: validDiscountId ? data.discount_code : null,
    discount_amount: discountAmount,
    card_discount_amount: cardDiscount,
    cod_discount_amount: codDiscount,
    cod_fee_amount: codFee,
    total,
    vat_amount: vatAmount,
    vat_rate: vatEnabled ? vatRate : 0,
    notes: data.custom_fields && Object.keys(data.custom_fields).length > 0 ? data.custom_fields as unknown as string : null,
    payment_method: metodaPlata,
    payment_status: "unpaid",
    status: "pending",
    order_source: buildOrderSource(data.source, userAgent) as never,
    billing_company: (billingCompany ?? null) as never,
  }).select("id, order_number").single();

  if (error) {
    // Comanda n-a intrat, deci utilizarea revendicata se da inapoi.
    if (validDiscountId) await admin.rpc("release_discount_use" as never, { p_discount_id: validDiscountId } as never);
    logError({ action: "placeOrder", message: error.message, details: { code: error.code, hint: error.hint, businessId: data.business_id }, severity: "critical" });
    return { error: "Eroare la plasarea comenzii. Incearca din nou." };
  }

  // Atomic stock decrement — bundle components when ordering a bundle, else the product itself.
  await admin.rpc("decrement_stock_batch" as never, { p_items: stockExp.decrements } as never);
  // Si stocul marimii vandute, nu doar al produsului intreg. `liniiCuVarianta`
  // e aceeasi lista pe care a verificat-o `eroareStocPeVarianta` mai sus, deci
  // ce s-a masurat se si scade.
  await scadeStoculVariantelor(admin, liniiCuVarianta);

  // Reflect stock/availability changes in Google Merchant + OLX (if connected).
  void enqueueGmcSyncMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), data.product_id, ...cartItems.map((i) => i.product_id)]);
  void enqueueOlxSyncMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), data.product_id, ...cartItems.map((i) => i.product_id)]);
  void enqueueAboutYouStockMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), data.product_id, ...cartItems.map((i) => i.product_id)]);
  void enqueueTrendyolInventoryMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), data.product_id, ...cartItems.map((i) => i.product_id)]);

  // Server-side GA4 purchase (Measurement Protocol) — deduped with the gtag event
  // by transaction_id; captures the conversion even when the browser tag is blocked.
  void ga4OrderEvent(data.business_id, "purchase", { transactionId: order.id, value: total, clientId: data.source?.ga_client_id, items: allItems });

  // Close the matching abandoned cart (if any) so it leaves the abandoned set
  // and counts as recovered when a recovery message had been sent.
  await markCartConverted(admin, data.business_id, {
    sessionId: data.cart_session_id,
    email: data.customer_email?.trim() || null,
    phone: data.customer_phone.trim(),
    orderId: order.id,
  });

  // Send emails
  try {
    const { data: settings } = await admin
      .from("store_settings")
      .select("notifications_config, businesses(business_name, store_name, user_id, slug)")
      .eq("business_id", data.business_id)
      .single();
    if (settings) {
      const config = parseNotificationsConfig(
        (settings.notifications_config as Record<string, unknown>) ?? {}
      );
      const biz = settings.businesses as unknown as { business_name: string; store_name: string | null; user_id: string; slug: string | null } | null;
      // Customer-facing emails use the public store name, falling back to the legal/account name.
      const businessName = biz?.store_name || biz?.business_name || "";

      let notifyEmail = config.notification_email;
      if (!notifyEmail && biz?.user_id) {
        const { data: authData } = await admin.auth.admin.getUserById(biz.user_id);
        notifyEmail = authData?.user?.email ?? "";
      }

      const emailPayload = {
        order_number: order.order_number,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        total,
        subtotal,
        items: allItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        shipping_cost: shipping,
        discount_code: data.discount_code,
        discount_amount: (data.discount_amount ?? 0) > 0 ? (data.discount_amount ?? 0) : undefined,
        card_discount_amount: cardDiscount > 0 ? cardDiscount : undefined,
        cod_discount_amount: codDiscount > 0 ? codDiscount : undefined,
        cod_fee_amount: codFee > 0 ? codFee : undefined,
        payment_method: metodaPlata,
        business_name: businessName,
        store_url: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order_id: order.id,
        address: data.customer_address,
        city: data.customer_city,
        county: data.customer_county,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
        locker_name: data.locker_name,
        custom_fields: data.custom_fields,
        billing_company: billingCompany,
      };
      const emailSender = await getStoreEmailSender(admin, data.business_id);
      await Promise.all([
        config.new_order !== false && notifyEmail
          ? sendNewOrderEmail(notifyEmail, emailPayload, emailSender)
          : null,
        data.customer_email
          ? sendOrderConfirmationToCustomer(data.customer_email, emailPayload, emailSender)
          : null,
      ].filter(Boolean));

      // notice.ro — new-order SMS (Procesare comanda / pending), opt-in per store. Fire-and-forget.
      void maybeSendNoticeNotification({
        businessId: data.business_id,
        orderId: order.id,
        triggerKey: "pending",
        phone: data.customer_phone,
        vars: {
          order: order.order_number, name: data.customer_name, total: formatPrice(total),
          awb: "", store: businessName,
          phone: data.customer_phone, email: data.customer_email ?? "",
          address: data.customer_address, city: data.customer_city, region: data.customer_county,
          payment_method: metodaPlata,
          shipping_method: data.courier_label ?? "",
          store_url: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : "",
          date_added: formatDate(new Date()),
        },
      });

      // Mailchimp — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncMailchimpSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          tags: [data.customer_county, orderValueTag(total)].filter(Boolean),
        });
      }

      // Brevo — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncBrevoSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          county: data.customer_county,
          orderValue: total,
        });
      }

      // Klaviyo — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncKlaviyoSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          county: data.customer_county,
          orderValue: total,
        });
      }

      // Mailchimp e-commerce — sync the order (revenue attribution + purchase segmentation + retargeting). Fire-and-forget.
      void maybeSyncMailchimpOrder({
        businessId: data.business_id,
        storeName: businessName,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          name: data.customer_name,
          currency: "RON",
          total,
          financial_status: "pending",
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });

      // Brevo e-commerce — sync the order (revenue attribution + purchase segmentation + retargeting). Fire-and-forget.
      void maybeSyncBrevoOrder({
        businessId: data.business_id,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          total,
          status: "pending",
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });

      // Klaviyo e-commerce — "Placed Order" event (revenue + purchase segmentation + flows). Fire-and-forget.
      void maybeTrackKlaviyoOrder({
        businessId: data.business_id,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          name: data.customer_name,
          total,
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });
    }
  } catch (e) { logError({ action: "placeOrder.emails", message: (e as Error).message ?? "Email send failed", details: { businessId: data.business_id }, severity: "warning" }); }

  revalidatePath("/dashboard/orders");
  return { success: true, orderId: order.id, orderNumber: order.order_number };
}

const STATUS_SMS_LABELS: Record<string, string> = {
  pending: "in asteptare",
  confirmed: "confirmata",
  processing: "in procesare",
  shipped: "expediata",
  delivered: "livrata",
  cancelled: "anulata",
  refunded: "rambursata",
};

// Short transactional SMS for an order status change (auto-notify, opt-in per store).
function defaultStatusSms(status: string, opts: { orderNumber: string; businessName: string; awb?: string }): string {
  const biz = opts.businessName;
  switch (status) {
    case "confirmed":
      return `Comanda ${opts.orderNumber} a fost confirmata. Multumim! ${biz}`;
    case "shipped":
      return `Comanda ${opts.orderNumber} a fost expediata${opts.awb ? `, AWB ${opts.awb}` : ""}. ${biz}`;
    case "delivered":
      return `Comanda ${opts.orderNumber} a fost livrata. Iti multumim! ${biz}`;
    default:
      return `Comanda ${opts.orderNumber}: ${STATUS_SMS_LABELS[status] ?? status}. ${biz}`;
  }
}

export async function updateOrder(orderId: string, data: { status: string; payment_status: string; awb?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: order } = await supabase
    .from("orders")
    .select("business_id, order_number, customer_name, customer_email, customer_phone, total, status, payment_status, shipping_address, payment_method, created_at, items, order_source")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id, business_name, store_name, slug").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };
  const storeName = biz.store_name || biz.business_name;

  const { error } = await supabase.from("orders")
    .update({ status: data.status as never, payment_status: data.payment_status as never })
    .eq("id", orderId);

  if (error) {
    logError({ action: "updateOrder", message: error.message, details: { code: error.code, hint: error.hint, orderId }, userId: user.id });
    return { error: "Eroare la actualizare." };
  }

  const statusChanged = data.status !== (order.status as string);
  const paymentChanged = data.payment_status !== (order.payment_status as string);

  // Server-side GA4 refund (Measurement Protocol) when the sale is reversed —
  // refunds can't be tracked from the customer's browser. Offset by transaction_id.
  const GA4_REVERSAL = new Set(["refunded", "cancelled"]);
  if (statusChanged && GA4_REVERSAL.has(data.status) && !GA4_REVERSAL.has(order.status as string)) {
    const refundItems = Array.isArray(order.items) ? (order.items as { product_id?: string; name: string; price: number; quantity: number }[]) : [];
    const gaClientId = (order.order_source as { ga_client_id?: string } | null)?.ga_client_id;
    void ga4OrderEvent(order.business_id, "refund", { transactionId: orderId, value: order.total ?? 0, clientId: gaClientId, items: refundItems });
  }

  // Send status change email to customer
  if (statusChanged && order.customer_email) {
    const emailSender = await getStoreEmailSender(createAdminClient(), order.business_id);
    sendOrderStatusToCustomer(order.customer_email, {
      order_number: order.order_number,
      customer_name: order.customer_name,
      total: order.total,
      status: data.status,
      business_name: storeName,
      awb: data.awb,
      store_url: biz.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
    }, emailSender).catch(() => {});
  }

  // Send status change SMS to customer (opt-in per store via SMSO)
  if (statusChanged && order.customer_phone) {
    const { data: st } = await supabase
      .from("store_settings")
      .select("smso_config")
      .eq("business_id", order.business_id)
      .single();
    const smso = st?.smso_config as (SmsoConfig & { notify_status_change?: boolean }) | null;
    if (smso?.enabled && smso.api_key && smso.sender_id && smso.notify_status_change) {
      void sendSms(smso.api_key, {
        to: order.customer_phone,
        sender: smso.sender_id,
        body: defaultStatusSms(data.status, {
          orderNumber: order.order_number,
          businessName: storeName,
          awb: data.awb,
        }),
        type: "transactional",
      });
    }
  }

  // Auto-generate an invoice with whichever provider has auto-invoicing enabled
  // (SmartBill / Oblio / fGO) — at most one per order. Fire-and-forget.
  if (statusChanged || paymentChanged) {
    import("@/lib/actions/invoice-auto.actions").then(({ maybeAutoInvoice }) => {
      void maybeAutoInvoice(order.business_id, orderId, data.status, data.payment_status);
    }).catch(() => {});
  }

  // notice.ro SMS — transactional notification on a status / payment change, using
  // the merchant's chosen template per trigger (opt-in). Fire-and-forget.
  if (order.customer_phone && (statusChanged || paymentChanged)) {
    const ship = (order.shipping_address ?? {}) as {
      address?: string; city?: string; county?: string; postcode?: string; country?: string; courier_label?: string;
    };
    const noticeVars = {
      order: order.order_number,
      name: order.customer_name,
      total: formatPrice(Number(order.total)),
      awb: data.awb ?? "",
      store: storeName,
      phone: order.customer_phone ?? "",
      email: order.customer_email ?? "",
      address: ship.address ?? "",
      city: ship.city ?? "",
      region: ship.county ?? "",
      postcode: ship.postcode ?? "",
      country: ship.country ?? "",
      payment_method: (order.payment_method as string | null) ?? "",
      shipping_method: ship.courier_label ?? "",
      store_url: biz.slug ? `${STORE_BASE_URL}/${biz.slug}` : "",
      date_added: order.created_at ? formatDate(order.created_at as string) : "",
    };
    if (statusChanged) {
      const tk = noticeTriggerForStatus(data.status);
      if (tk) void maybeSendNoticeNotification({ businessId: order.business_id, orderId, triggerKey: tk, phone: order.customer_phone, vars: noticeVars });
    }
    if (paymentChanged) {
      const tk = noticeTriggerForPayment(data.payment_status);
      if (tk) void maybeSendNoticeNotification({ businessId: order.business_id, orderId, triggerKey: tk, phone: order.customer_phone, vars: noticeVars });
      if (data.payment_status === "paid") { void maybeMarkMailchimpOrderPaid(orderId); void maybeMarkBrevoOrderPaid(orderId); }
    }
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true };
}

// ── Order editing (merchant fixes customer mistakes) ────────────────────────
// Deliberately SEPARATE from updateOrder: editing customer data / address /
// items must never fire the status & payment hooks (customer email, SMS,
// notice.ro, auto-invoicing) that updateOrder triggers.

export async function searchOrderProducts(businessId: string, query: string): Promise<
  { products: { id: string; name: string; price: number; stock_quantity: number | null; track_inventory: boolean; is_bundle: boolean }[] } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  let q = supabase.from("products")
    .select("id, name, price, stock_quantity, track_inventory, is_bundle")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name")
    .limit(20);
  const term = query.trim();
  if (term) q = q.ilike("name", `%${term}%`);
  const { data: rows, error } = await q;
  if (error) return { error: "Eroare la cautarea produselor." };
  return {
    products: (rows ?? []).map((p) => ({
      id: p.id as string,
      name: String(p.name),
      price: round2(Number(p.price)),
      stock_quantity: p.stock_quantity as number | null,
      track_inventory: !!p.track_inventory,
      is_bundle: !!p.is_bundle,
    })),
  };
}

export async function updateOrderDetails(orderId: string, data: {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  address: string;
  city: string;
  county: string;
  postal_code?: string;
  /** Products to append to the order; re-priced server-side from the live catalog. */
  added_items?: { product_id: string; quantity: number }[];
}): Promise<{ success: true; newTotal: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, business_id, status, items, subtotal, total, shipping_address, shipping_cost, discount_amount, card_discount_amount, cod_discount_amount, cod_fee_amount")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  if (order.status === "cancelled" || order.status === "refunded") {
    return { error: "Comenzile anulate sau rambursate nu pot fi editate." };
  }

  const name = data.customer_name.trim();
  const phone = data.customer_phone.trim();
  const address = data.address.trim();
  const city = data.city.trim();
  const county = data.county.trim();
  if (!name || !phone) return { error: "Numele si telefonul clientului sunt obligatorii." };
  if (!address || !city || !county) return { error: "Adresa, orasul si judetul sunt obligatorii." };

  // Merge duplicate additions; integer quantities only.
  const wanted = new Map<string, number>();
  for (const it of data.added_items ?? []) {
    const qty = Math.floor(Number(it.quantity));
    if (!it.product_id || !Number.isFinite(qty) || qty <= 0) continue;
    wanted.set(it.product_id, Math.min(999, (wanted.get(it.product_id) ?? 0) + qty));
  }

  // Re-price added products from the live catalog (never trust the client) and
  // validate stock bundle-aware, exactly like order placement does.
  const admin = createAdminClient();
  let newItems: { product_id: string; name: string; price: number; quantity: number }[] = [];
  let decrements: { product_id: string; quantity: number }[] = [];
  if (wanted.size > 0) {
    const ids = [...wanted.keys()];
    const { data: products } = await admin.from("products")
      .select("id, name, price, is_active")
      .in("id", ids)
      .eq("business_id", order.business_id);
    const live = new Map((products ?? []).filter((p) => p.is_active).map((p) => [p.id as string, p]));
    if (ids.some((id) => !live.has(id))) {
      return { error: "Unul dintre produsele adaugate nu mai este disponibil. Reincarca pagina si incearca din nou." };
    }

    const stockExp = await expandBundleStock(admin, order.business_id, ids.map((id) => ({ product_id: id, quantity: wanted.get(id)! })));
    if ("error" in stockExp) return { error: stockExp.error };
    decrements = stockExp.decrements;

    newItems = ids.map((id) => ({
      product_id: id,
      name: String(live.get(id)!.name),
      price: round2(Number(live.get(id)!.price)),
      quantity: wanted.get(id)!,
    }));
  }

  const addedSum = round2(newItems.reduce((s, i) => s + i.price * i.quantity, 0));
  const newSubtotal = round2(Number(order.subtotal) + addedSum);

  /*
   * Totalul se RECALCULEAZA din componente, nu se aduna peste cel vechi.
   *
   * Adunarea simpla lasa TVA-ul in urma: la magazinele cu preturi fara TVA,
   * liniile adaugate de comerciant plecau nefacturate cu TVA, deci se incasa mai
   * putin decat trebuia. Iar `vat_amount` ramanea cel vechi la TOATE magazinele,
   * si el se vede in panou si in emailul comenzii.
   *
   * Reducerea promotionala si cea de card raman cele stabilite la plasare: au
   * fost convenite pe cosul de atunci, iar comerciantul adauga produse ulterior.
   * Pragul de livrare gratuita se reevalueaza, fiindca adaugarea poate sa il
   * treaca. Cu zero linii adaugate, formula da exact totalul dinainte.
   */
  const { data: cfgRow } = await supabase
    .from("store_settings")
    .select("vat_enabled, vat_rate, prices_include_vat, free_shipping_threshold")
    .eq("business_id", order.business_id)
    .single();

  // Extraoptiunile stau in `items` ca linii `extra_*` si NU intra in `subtotal`.
  const extrasTotal = round2(
    (order.items as { product_id?: string; price?: number; quantity?: number }[] | null ?? [])
      .filter((i) => typeof i?.product_id === "string" && i.product_id.startsWith("extra_"))
      .reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0),
  );

  // Aceeasi baza ca la plasare (vezi `vatBase`): reducerile convenite atunci raman
  // cele de atunci, iar taxa de ramburs se pastreaza — scoasa de aici, TVA-ul
  // recalculat ar iesi mai mic decat cel incasat.
  const { vatAmount, vatAddOn } = computeVat(
    vatBase({
      goods: newSubtotal,
      extras: extrasTotal,
      discount: Number(order.discount_amount) || 0,
      cardDiscount: Number(order.card_discount_amount) || 0,
      codDiscount: Number(order.cod_discount_amount) || 0,
      codFee: Number(order.cod_fee_amount) || 0,
    }),
    {
      vat_enabled: cfgRow?.vat_enabled ?? false,
      vat_rate: Number(cfgRow?.vat_rate ?? 19),
      // `true`, ca la plasare. Nu misca nimic azi (coloana e NOT NULL si
      // `vat_enabled` scurtcircuiteaza), dar doua rezerve diferite pentru acelasi
      // camp sunt o capcana pusa la pastrare.
      prices_include_vat: cfgRow?.prices_include_vat ?? true,
    },
  );

  const pragTransport = cfgRow?.free_shipping_threshold != null ? Number(cfgRow.free_shipping_threshold) : null;
  let newShipping = Math.max(0, round2(Number(order.shipping_cost) || 0));
  if (pragTransport !== null && newSubtotal >= pragTransport) newShipping = 0;

  const newTotal = Math.max(0, round2(
    newSubtotal
    + extrasTotal
    - (Number(order.discount_amount) || 0)
    - (Number(order.card_discount_amount) || 0)
    - (Number(order.cod_discount_amount) || 0)
    // Taxa de ramburs se pastreaza asa cum a fost incasata: editarea comenzii
    // schimba marfa, nu metoda de plata, deci nici motivul taxei.
    + (Number(order.cod_fee_amount) || 0)
    + newShipping
    + vatAddOn,
  ));

  // Merge the address into shipping_address WITHOUT touching courier/locker/
  // service keys — those belong to the checkout choice and the AWB flow.
  const prevShip = (order.shipping_address ?? {}) as Record<string, unknown>;
  const newShip = {
    ...prevShip,
    county,
    city,
    address,
    ...(data.postal_code?.trim() ? { postal_code: data.postal_code.trim() } : {}),
  };

  // Refuse to touch a row whose items are not the expected array — appending
  // onto a corrupt value would silently replace the customer's original items.
  if (!Array.isArray(order.items)) {
    logError({ action: "updateOrderDetails", message: "orders.items is not an array", details: { orderId }, userId: user.id, severity: "warning" });
    return { error: "Structura comenzii nu permite editarea. Contacteaza suportul." };
  }
  const prevItems = order.items as unknown[];

  const { error } = await supabase.from("orders").update({
    customer_name: name,
    customer_phone: phone,
    customer_email: data.customer_email?.trim() || null,
    shipping_address: newShip,
    items: [...prevItems, ...newItems],
    subtotal: newSubtotal,
    shipping_cost: newShipping,
    vat_amount: vatAmount,
    total: newTotal,
    updated_at: new Date().toISOString(),
  } as never).eq("id", orderId);

  if (error) {
    logError({ action: "updateOrderDetails", message: error.message, details: { code: error.code, hint: error.hint, orderId }, userId: user.id });
    return { error: "Eroare la salvarea modificarilor." };
  }

  // Stock decrement + Google Merchant availability sync for the added items
  // (mirrors placeOrder; runs only after the order update committed).
  if (decrements.length > 0) {
    await admin.rpc("decrement_stock_batch" as never, { p_items: decrements } as never);
    void enqueueGmcSyncMany(order.business_id, [...new Set([...decrements.map((d) => d.product_id), ...newItems.map((i) => i.product_id)])]);
    void enqueueOlxSyncMany(order.business_id, [...new Set([...decrements.map((d) => d.product_id), ...newItems.map((i) => i.product_id)])]);
    void enqueueAboutYouStockMany(order.business_id, [...new Set([...decrements.map((d) => d.product_id), ...newItems.map((i) => i.product_id)])]);
    void enqueueTrendyolInventoryMany(order.business_id, [...new Set([...decrements.map((d) => d.product_id), ...newItems.map((i) => i.product_id)])]);
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true, newTotal };
}

export async function deleteOrder(orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: order } = await supabase.from("orders").select("business_id").eq("id", orderId).single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) {
    logError({ action: "deleteOrder", message: error.message, details: { code: error.code, orderId }, userId: user.id });
    return { error: "Eroare la stergerea comenzii." };
  }

  revalidatePath("/dashboard/orders");
  return { success: true };
}

export async function sendCustomerNotification(orderId: string, subject: string, message: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  if (!subject.trim() || !message.trim()) return { error: "Completeaza subiectul si mesajul." };

  const { data: order } = await supabase
    .from("orders")
    .select("business_id, order_number, customer_email")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("business_name, store_name").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  if (!order.customer_email) return { error: "Clientul nu a lasat o adresa de email." };

  const emailSender = await getStoreEmailSender(createAdminClient(), order.business_id);
  const res = await sendCustomerMessage(order.customer_email, {
    subject: subject.trim(),
    message: message.trim(),
    businessName: biz.store_name || biz.business_name,
    orderNumber: order.order_number,
  }, emailSender);
  if ("error" in res) return { error: res.error };
  return { success: true };
}

export async function sendCustomerSms(orderId: string, message: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  if (!message.trim()) return { error: "Scrie mesajul SMS." };

  const { data: order } = await supabase
    .from("orders")
    .select("business_id, customer_phone")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  if (!order.customer_phone) return { error: "Clientul nu a lasat un numar de telefon." };

  const { data: st } = await supabase
    .from("store_settings")
    .select("smso_config")
    .eq("business_id", order.business_id)
    .single();
  const smso = st?.smso_config as SmsoConfig | null;
  if (!smso?.enabled || !smso.api_key || !smso.sender_id) {
    return { error: "SMSO nu este activat. Conecteaza-l din Integrari." };
  }

  const res = await sendSms(smso.api_key, {
    to: order.customer_phone,
    sender: smso.sender_id,
    body: message.trim(),
    type: "transactional",
  });
  if (!res.success) return { error: res.error ?? "Eroare la trimiterea SMS-ului." };
  return { success: true };
}

export async function placeCartOrder(data: {
  business_id: string;
  cart_session_id?: string;
  items: { product_id: string; name: string; price: number; quantity: number; variant_title?: string }[];
  shipping_cost: number;
  /** Semnatura cotatiei de transport (vezi `quote-token.ts`). */
  shipping_token?: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  newsletter_opt_in?: boolean;
  customer_county: string;
  customer_city: string;
  customer_address: string;
  customer_country?: string;
  customer_postal_code?: string;
  /** Date de facturare pe firma. Serverul le recitesc si le reverifica; vezi `resolveBillingCompany`. */
  billing_company?: BillingCompanyInput;
  discount_id?: string;
  discount_code?: string;
  discount_amount?: number;
  extras?: { id: string; label: string; price: number }[];
  custom_fields?: Record<string, string>;
  vat_amount?: number;
  vat_rate?: number;
  accepted_offer_ids?: string[];
  payment_method?: string;
  selected_courier?: string;
  courier_label?: string;
  delivery_type?: string;
  locker_id?: string;
  locker_name?: string;
  locker_address?: string;
  locker_city?: string;
  locker_county?: string;
  woot_service_id?: number;
  woot_courier_name?: string;
  woot_service_name?: string;
  colete_service_id?: number;
  colete_service_name?: string;
  /** First-touch attribution captured client-side (utm / referrer / ad click id). */
  source?: OrderSource;
}) {
  // Anti-abuse: anonymous + triggers SMS/email (real cost). Throttle per IP.
  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  const userAgent = hdrs.get("user-agent")?.slice(0, 300) || undefined;
  if (!rateLimit(`placeCartOrder:${ip}`, 10, 60_000)) {
    return { error: "Prea multe incercari. Te rugam asteapta un minut si incearca din nou." };
  }
  // An empty cart passes every check below (`some` on [] is false, subtotal 0),
  // so a direct call would insert a phantom order, send both emails and burn a
  // discount use. Only the UI guarded this; the action must guard it too.
  if (!data.items?.length) return { error: "Cosul este gol." };

  // Use admin client — customers are anonymous
  const admin = createAdminClient();

  // Reload every product + store config; recompute all prices server-side.
  const productIds = [...new Set(data.items.map((i) => i.product_id))];
  const [{ data: dbProducts }, { data: cfgRow }] = await Promise.all([
    admin.from("products")
      .select("id, price, is_active, page_sections")
      .in("id", productIds)
      .eq("business_id", data.business_id),
    admin.from("store_settings")
      .select("page_content, free_shipping_threshold, min_order_amount, vat_enabled, vat_rate, prices_include_vat, card_discount_config, cod_discount_config, cod_fee_config, default_shipping_cost")
      .eq("business_id", data.business_id)
      .single(),
  ]);

  const activeProducts = (dbProducts ?? []).filter((p) => p.is_active);
  const priceMap = new Map(activeProducts.map((p) => [p.id, round2(Number(p.price))]));
  // Per-product map of enabled variant title -> authoritative unit price. A cart
  // line that names a variant is re-priced from this, never from the browser.
  const comboMap = new Map(
    activeProducts.map((p) => [p.id, enabledComboPriceMap(p.page_sections, round2(Number(p.price)))]),
  );
  if (data.items.some((i) => !priceMap.has(i.product_id))) {
    logError({ action: "placeCartOrder.itemUnavailable", message: "Cart item missing/inactive for business", details: { businessId: data.business_id, productIds }, severity: "warning" });
    return { error: "Unul dintre produse nu mai este disponibil. Reincarca cosul." };
  }
  // A named variant that no longer maps to an enabled combination (merchant
  // disabled or renamed it) must not silently fall back to the base price.
  if (data.items.some((i) => i.variant_title && !comboMap.get(i.product_id)?.has(i.variant_title))) {
    logError({ action: "placeCartOrder.variantUnavailable", message: "Cart variant no longer enabled", details: { businessId: data.business_id, productIds }, severity: "warning" });
    return { error: "O varianta din cos nu mai este disponibila. Reincarca cosul." };
  }
  /*
   * Stocul DECLARAT pe combinatie.
   *
   * Pana acum se verifica doar stocul produsului, deci un produs cu 40 de bucati
   * in total lasa sa se comande marimea S si cand marimea S avea zero, iar
   * comerciantul afla din comanda pe care n-o putea onora. Combinatiile fara
   * numar completat nu intra in harta, deci pentru ele nu se schimba nimic.
   *
   * Aceeasi regula, acelasi ajutor ca la comanda directa. Scrisa de doua ori, a
   * si apucat-o pe drumuri diferite: calea cealalta n-a avut-o niciodata.
   */
  const eroareStoc = eroareStocPeVarianta(
    new Map(activeProducts.map((p) => [p.id, comboStockMap(p.page_sections)])),
    data.items,
  );
  if (eroareStoc) return { error: eroareStoc };

  // Configuratia de trepte a fiecarui produs. `page_sections` e deja incarcat mai
  // sus pentru variante si stoc, deci treptele nu costa nicio interogare in plus.
  const trepteMap = new Map(
    activeProducts.map((p) => [p.id, (p.page_sections as { quantity_tiers?: unknown } | null)?.quantity_tiers]),
  );

  let validatedItems = data.items.map((i) => {
    const variantPrice = i.variant_title ? comboMap.get(i.product_id)!.get(i.variant_title) : undefined;
    const unitPrice = variantPrice != null ? round2(variantPrice) : priceMap.get(i.product_id)!;
    // Treptele de cantitate se aplica si pe calea cosului, cu ACELASI motor pe
    // care il foloseste pagina de produs. Pana acum le onora doar comanda
    // directa: pagina promitea „3 bucati 250 lei", iar clientul care punea 3 in
    // cos platea 269,97.
    //
    // Pretul unitar ramane NEROTUNJIT (250 / 3 = 83,3333...), ca `pret x cantitate`
    // sa dea exact totalul pachetului. Rotunjit la ban, linia ar iesi 249,99 si
    // clientul ar plati alt total decat cel din cos. E acelasi lucru pe care il
    // trimite deja calea comenzii directe.
    const linie = pretPeTrepte(construiesteTrepte(trepteMap.get(i.product_id), unitPrice), i.quantity, unitPrice);
    return {
      product_id: i.product_id,
      name: i.variant_title ? `${i.name} (${i.variant_title})` : i.name,
      price: linie.unitPrice,
      quantity: i.quantity,
    };
  });
  // Order bumps: re-price accepted bump lines at the offer's authoritative discounted
  // price (server-side; the client can't forge it). No-op without accepted_offer_ids.
  if (data.accepted_offer_ids?.length) {
    const bumped = await applyBumpPricing(admin, data.business_id, data.accepted_offer_ids, validatedItems);
    validatedItems = bumped.items;
  }
  const subtotal = round2(validatedItems.reduce((s, i) => s + i.price * i.quantity, 0));

  // Enforce the merchant's minimum order value (Setari > Livrare) against the authoritative subtotal.
  const minOrder = cfgRow?.min_order_amount != null ? Number(cfgRow.min_order_amount) : null;
  if (minOrder !== null && subtotal < minOrder) {
    return { error: `Comanda minima este de ${minOrder} lei. Mai adauga produse pentru a finaliza comanda.` };
  }

  const validatedExtras = validateExtras(cfgRow?.page_content, data.extras);
  const billingResolution = await resolveBillingCompany(cfgRow?.page_content, data.billing_company);
  if ("error" in billingResolution) return { error: billingResolution.error };
  const billingCompany = billingResolution.company;
  const extrasTotal = validatedExtras.reduce((s, e) => s + e.price, 0);

  // Re-validate discount server-side (guard even though cart has no discount UI today).
  let discountAmount = 0;
  let validDiscountId: string | undefined;
  let isFreeShipping = false;
  if (data.discount_code) {
    const dres = await validateDiscount(data.discount_code, data.business_id, subtotal);
    if (dres.valid) {
      discountAmount = Math.min(dres.discount.discountAmount, subtotal);
      validDiscountId = dres.discount.id;
      isFreeShipping = dres.discount.type === "free_shipping";
    }
  }

  // Recompute VAT from store config (mirrors MiniStoreRenderer) so it cannot be forged.
  const vatEnabled = cfgRow?.vat_enabled ?? false;
  const vatRate = Number(cfgRow?.vat_rate ?? 19);
  const pricesIncludeVat = cfgRow?.prices_include_vat ?? true;

  // Card-payment discount: only for online card methods, on the goods value
  // (subtotal + extras, after promo), never on shipping/VAT. Baked into total.
  // O SINGURA citire a metodei de plata, folosita si la calcule, si la inserare.
  // Vezi `normalizePaymentMethod` pentru ce se rupea cand erau doua implicite.
  const metodaPlata = normalizePaymentMethod(data.payment_method);

  const cardDiscount = computeCardDiscount(
    parseCardDiscountConfig(cfgRow?.card_discount_config),
    metodaPlata,
    subtotal + extrasTotal - discountAmount,
  );
  // Ramburs (cash-on-delivery) discount — mutually exclusive with the card discount.
  const codDiscount = computeCodDiscount(
    parseCardDiscountConfig(cfgRow?.cod_discount_config),
    metodaPlata,
    subtotal + extrasTotal - discountAmount,
  );

  // Taxa de ramburs — acelasi declansator ca reducerea de mai sus, semn invers.
  // Se calculeaza AICI, inaintea TVA-ului, fiindca intra in baza lui: e o suma
  // purtatoare de TVA, ca extraoptiunile, nu ca transportul.
  const vatCfgTaxa = {
    vat_enabled: cfgRow?.vat_enabled ?? false,
    vat_rate: Number(cfgRow?.vat_rate ?? 19),
    prices_include_vat: cfgRow?.prices_include_vat ?? true,
  };
  const codFee = computeCodFee(
    parseCodFeeConfig(cfgRow?.cod_fee_config),
    metodaPlata,
    subtotal + extrasTotal - discountAmount,
    vatCfgTaxa,
  );

  // Aceeasi baza ca la comanda directa si ca in magazin: marfa si extraoptiunile
  // DUPA toate reducerile, plus taxa de ramburs. Vezi `vatBase`.
  const { vatAmount, vatAddOn } = computeVat(
    vatBase({ goods: subtotal, extras: extrasTotal, discount: discountAmount, cardDiscount, codDiscount, codFee }),
    { vat_enabled: vatEnabled, vat_rate: vatRate, prices_include_vat: pricesIncludeVat },
  );

  const freeThreshold = cfgRow?.free_shipping_threshold != null ? Number(cfgRow.free_shipping_threshold) : null;
  let shipping = autoritativeShipping(
    data.business_id,
    data.shipping_cost,
    data.shipping_token,
    { county: data.customer_county, city: data.customer_city, country: data.customer_country, postCode: data.customer_postal_code },
    cfgRow?.default_shipping_cost != null ? Number(cfgRow.default_shipping_cost) : null,
  );
  if (isFreeShipping || (freeThreshold !== null && subtotal >= freeThreshold)) shipping = 0;

  const total = Math.max(0, round2(subtotal + extrasTotal - discountAmount - cardDiscount - codDiscount + codFee + shipping + vatAddOn));

  // Bundle-aware stock: expand any bundle into its components + validate availability
  // before creating the order (prevents overselling components).
  const stockExp = await expandBundleStock(admin, data.business_id, validatedItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })));
  if ("error" in stockExp) return { error: stockExp.error };

  const order_number = await buildOrderNumber(admin, data.business_id);

  const allItems = [
    ...validatedItems,
    ...validatedExtras.map((e) => ({ product_id: `extra_${e.id}`, name: e.label, price: e.price, quantity: 1 })),
  ];

  /*
   * Utilizarea cuponului se revendica ATOMIC, chiar inainte de inserare.
   *
   * Pana acum limita se verifica la validare si contorul crestea dupa ce comanda
   * era deja creata: doua comenzi simultane treceau amandoua de verificare si
   * depaseau limita. `claim_discount_use` face verificarea si incrementul in
   * aceeasi instructiune, deci a doua cerere nu mai gaseste randul.
   *
   * Revendicam aici, nu mai devreme: intre validarea cuponului si punctul asta
   * mai exista pasi care pot iesi cu eroare, iar o utilizare arsa degeaba ar
   * scadea din numarul pe care comerciantul l-a pus la vanzare.
   */
  if (validDiscountId) {
    const { data: revendicat } = await admin.rpc("claim_discount_use" as never, { p_discount_id: validDiscountId } as never);
    if (revendicat === false) {
      return { error: "Codul a atins limita maxima de utilizari. Reincarca pagina si incearca fara el." };
    }
  }

  const { data: order, error } = await admin.from("orders").insert({
    business_id: data.business_id,
    order_number,
    customer_name: data.customer_name.trim(),
    customer_phone: data.customer_phone.trim(),
    customer_email: data.customer_email?.trim() || null,
    shipping_address: {
      county: data.customer_county,
      city: data.customer_city.trim(),
      address: data.customer_address.trim(),
      ...(data.customer_country && data.customer_country !== "RO" && {
        country: data.customer_country,
        postal_code: data.customer_postal_code?.trim() || "",
      }),
      ...(data.selected_courier && {
        courier: data.selected_courier,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
      }),
      ...(data.locker_id && {
        locker_id: data.locker_id,
        locker_name: data.locker_name,
        locker_address: data.locker_address,
        locker_city: data.locker_city,
        locker_county: data.locker_county,
      }),
      ...(data.woot_service_id && {
        woot_service_id: data.woot_service_id,
        woot_courier_name: data.woot_courier_name,
        woot_service_name: data.woot_service_name,
      }),
      ...(data.colete_service_id && {
        colete_service_id: data.colete_service_id,
        colete_service_name: data.colete_service_name,
      }),
    },
    items: allItems,
    subtotal,
    shipping_cost: shipping,
    discount_code: validDiscountId ? data.discount_code : null,
    discount_amount: discountAmount,
    card_discount_amount: cardDiscount,
    cod_discount_amount: codDiscount,
    cod_fee_amount: codFee,
    total,
    vat_amount: vatAmount,
    vat_rate: vatEnabled ? vatRate : 0,
    notes: data.custom_fields && Object.keys(data.custom_fields).length > 0 ? data.custom_fields as unknown as string : null,
    payment_method: metodaPlata,
    payment_status: "unpaid",
    status: "pending",
    order_source: buildOrderSource(data.source, userAgent) as never,
    billing_company: (billingCompany ?? null) as never,
  }).select("id, order_number, total").single();

  if (error) {
    // Comanda n-a intrat, deci utilizarea revendicata se da inapoi.
    if (validDiscountId) await admin.rpc("release_discount_use" as never, { p_discount_id: validDiscountId } as never);
    logError({ action: "placeCartOrder", message: error.message, details: { code: error.code, hint: error.hint, businessId: data.business_id, itemCount: data.items.length }, severity: "critical" });
    return { error: "Eroare la plasarea comenzii. Incearca din nou." };
  }

  // Atomic batch stock decrement — bundle components expanded; non-bundles as-is.
  await admin.rpc("decrement_stock_batch" as never, { p_items: stockExp.decrements } as never);
  // Si stocul marimii vandute, pe aceleasi linii pe care le-a verificat
  // `eroareStocPeVarianta` la intrare.
  await scadeStoculVariantelor(admin, data.items);

  // Reflect stock/availability changes in Google Merchant + OLX (if connected).
  void enqueueGmcSyncMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);
  void enqueueOlxSyncMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);
  void enqueueAboutYouStockMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);
  void enqueueTrendyolInventoryMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);

  // Server-side GA4 purchase (Measurement Protocol) — deduped with the gtag event
  // by transaction_id; captures the conversion even when the browser tag is blocked.
  void ga4OrderEvent(data.business_id, "purchase", { transactionId: order.id, value: total, clientId: data.source?.ga_client_id, items: allItems });

  // Close the matching abandoned cart (if any) so it leaves the abandoned set
  // and counts as recovered when a recovery message had been sent.
  await markCartConverted(admin, data.business_id, {
    sessionId: data.cart_session_id,
    email: data.customer_email?.trim() || null,
    phone: data.customer_phone.trim(),
    orderId: order.id,
  });

  // Send emails
  try {
    const { data: settings } = await admin
      .from("store_settings")
      .select("notifications_config, businesses(business_name, store_name, user_id, slug)")
      .eq("business_id", data.business_id)
      .single();
    if (settings) {
      const config = parseNotificationsConfig(
        (settings.notifications_config as Record<string, unknown>) ?? {}
      );
      const biz = settings.businesses as unknown as { business_name: string; store_name: string | null; user_id: string; slug: string | null } | null;
      // Customer-facing emails use the public store name, falling back to the legal/account name.
      const businessName = biz?.store_name || biz?.business_name || "";

      let notifyEmail = config.notification_email;
      if (!notifyEmail && biz?.user_id) {
        const { data: authData } = await admin.auth.admin.getUserById(biz.user_id);
        notifyEmail = authData?.user?.email ?? "";
      }

      const emailPayload = {
        order_number: order.order_number,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        total,
        subtotal,
        items: allItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        shipping_cost: shipping,
        discount_code: data.discount_code,
        discount_amount: (data.discount_amount ?? 0) > 0 ? (data.discount_amount ?? 0) : undefined,
        card_discount_amount: cardDiscount > 0 ? cardDiscount : undefined,
        cod_discount_amount: codDiscount > 0 ? codDiscount : undefined,
        cod_fee_amount: codFee > 0 ? codFee : undefined,
        payment_method: metodaPlata,
        business_name: businessName,
        store_url: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order_id: order.id,
        address: data.customer_address,
        city: data.customer_city,
        county: data.customer_county,
        courier_label: data.courier_label,
        delivery_type: data.delivery_type,
        locker_name: data.locker_name,
        custom_fields: data.custom_fields,
        billing_company: billingCompany,
      };
      const emailSender = await getStoreEmailSender(admin, data.business_id);
      await Promise.all([
        config.new_order !== false && notifyEmail
          ? sendNewOrderEmail(notifyEmail, emailPayload, emailSender)
          : null,
        data.customer_email
          ? sendOrderConfirmationToCustomer(data.customer_email, emailPayload, emailSender)
          : null,
      ].filter(Boolean));

      // notice.ro — new-order SMS (Procesare comanda / pending), opt-in per store. Fire-and-forget.
      void maybeSendNoticeNotification({
        businessId: data.business_id,
        orderId: order.id,
        triggerKey: "pending",
        phone: data.customer_phone,
        vars: {
          order: order.order_number, name: data.customer_name, total: formatPrice(total),
          awb: "", store: businessName,
          phone: data.customer_phone, email: data.customer_email ?? "",
          address: data.customer_address, city: data.customer_city, region: data.customer_county,
          payment_method: metodaPlata,
          shipping_method: data.courier_label ?? "",
          store_url: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : "",
          date_added: formatDate(new Date()),
        },
      });

      // Mailchimp — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncMailchimpSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          tags: [data.customer_county, orderValueTag(total)].filter(Boolean),
        });
      }

      // Brevo — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncBrevoSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          county: data.customer_county,
          orderValue: total,
        });
      }

      // Klaviyo — sync the customer as a subscriber when they opted in at checkout. Fire-and-forget.
      if (data.newsletter_opt_in && data.customer_email) {
        void maybeSyncKlaviyoSubscriber({
          businessId: data.business_id,
          source: "checkout",
          email: data.customer_email,
          name: data.customer_name,
          phone: data.customer_phone,
          county: data.customer_county,
          orderValue: total,
        });
      }

      // Mailchimp e-commerce — sync the order (revenue attribution + purchase segmentation + retargeting). Fire-and-forget.
      void maybeSyncMailchimpOrder({
        businessId: data.business_id,
        storeName: businessName,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          name: data.customer_name,
          currency: "RON",
          total,
          financial_status: "pending",
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });

      // Brevo e-commerce — sync the order (revenue attribution + purchase segmentation + retargeting). Fire-and-forget.
      void maybeSyncBrevoOrder({
        businessId: data.business_id,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          total,
          status: "pending",
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });

      // Klaviyo e-commerce — "Placed Order" event (revenue + purchase segmentation + flows). Fire-and-forget.
      void maybeTrackKlaviyoOrder({
        businessId: data.business_id,
        storeUrl: biz?.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
        order: {
          id: order.id,
          email: data.customer_email,
          name: data.customer_name,
          total,
          items: allItems
            .filter((i) => !i.product_id.startsWith("extra_"))
            .map((i) => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity })),
        },
      });
    }
  } catch (e) { logError({ action: "placeOrder.emails", message: (e as Error).message ?? "Email send failed", details: { businessId: data.business_id }, severity: "warning" }); }

  revalidatePath("/dashboard/orders");
  return { success: true, orderId: order.id, orderNumber: order.order_number };
}
