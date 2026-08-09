"use server";

import { after } from "next/server";
import { scrieStatisticiOferte } from "@/lib/offers/statistici";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
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
import { comboStockMap, enabledComboPriceMap, parseVariants } from "@/lib/storefront/variants";
import { construiesteTrepte, pretPeTrepte } from "@/lib/storefront/quantity-tiers";
import {
  planificaAdaugarea,
  recalculeazaTotal,
  slabesteVariante,
  sumaExtraoptiunilor,
  type CatalogEdit,
  type VarianteSlim,
} from "@/lib/orders/edit-pricing";
import { verifyShippingQuote } from "@/lib/shipping/quote-token";
import { parseBillingCompany, type BillingCompany, type BillingCompanyInput } from "@/lib/billing/company";
import { verifyBillingCompany } from "@/lib/billing/verify";
import { expandBundleStock } from "@/lib/bundles";
import { stocRezervat } from "@/lib/orders/stoc-rezervat";
import { interpreteazaRevendicarea, type Revendicare } from "@/lib/orders/verdict-stoc";
import { applyOfferPricing, type RezultatOferte } from "@/lib/offers/offers";
import { cantitateCeruta, mesajCantitate } from "@/lib/orders/quantity";
import { eroareVarianta, pretulLiniei } from "@/lib/orders/variant-guard";
import { invoiceVat } from "@/lib/billing/invoice-vat";
import { enqueueGmcSyncMany } from "@/lib/google-merchant/queue";
import { sendGa4Purchase, sendGa4Refund } from "@/lib/google-analytics/mp";
import type { GoogleAnalyticsConfig } from "@/lib/google-analytics/types";
import { enqueueOlxSyncMany } from "@/lib/olx/queue";
import { enqueueAboutYouStockMany } from "@/lib/aboutyou/queue";
import { enqueueTrendyolInventoryMany } from "@/lib/trendyol/queue";
import { computeCardDiscount, computeCodDiscount, computeCodFee, verificaMetodaPlata, isCodPaymentMethod, parseCardDiscountConfig, parseCodFeeConfig } from "@/lib/payment-methods";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import { ORDER_STATUS } from "@/lib/orders/status";
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

/**
 * Ofertele refuzate la re-evaluare, scrise in jurnal cu clientul ADMIN.
 *
 * `logError` scrie prin clientul de cerere, iar comenzile magazinului sunt
 * anonime: politicile RLS taie insertul, deci pe calea publica un jurnal gol nu
 * dovedeste ca nu s-a intamplat nimic. Aici avem nevoie exact de dovada aceea:
 * daca dupa lansare apar des refuzuri cu motivul „declansator" sau „suprafata",
 * inseamna ca re-evaluarea difera de magazin undeva unde n-am prevazut, si
 * clienti adevarati raman cu comanda blocata.
 */
async function jurnalizeazaOfertele(
  admin: SupabaseClient<Database>, businessId: string, rez: RezultatOferte,
): Promise<void> {
  // Se scrie DOAR cand comanda chiar s-a oprit. Asta e singurul semnal care
  // trebuie urmarit, si tot asta tine jurnalul mic: apelul vine dintr-un
  // endpoint public anonim, deci fiecare rand scris e un rand pe care il poate
  // cere oricine (limitat de cele 10 incercari pe minut si pe IP).
  if (!rez.error) return;
  try {
    await admin.from("error_logs").insert({
      action: "applyOfferPricing.rejected",
      message: "Comanda oprita: oferta revendicata nu se mai justifica",
      details: { rejected: rez.rejected, applied: rez.applied } as never,
      business_id: businessId,
      severity: "warning",
    });
  } catch {
    // Jurnalul nu are voie sa pice o comanda.
  }
}

// ── Server-authoritative pricing ─────────────────────────────────────────────
// Customers are anonymous and prices arrive from the browser; they must NEVER be
// trusted. We reload the product and recompute every legitimate price from the
// product's own configuration, then match the submitted amount against it.

type OrderProduct = {
  id: string;
  name: string;
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
  // Produsul cu variante NU are pret legitim fara o varianta aleasa. `pretulLiniei`
  // opreste comanda inainte sa se ajunga aici; randul asta e a doua incuietoare,
  // ca o cale noua sa nu poata reintra pe portita.
  if (parseVariants(product.page_sections) !== null) return [];
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
  // `Number.isFinite` si pe CANTITATE, nu doar pe pret: `round2` inghite NaN in
  // zero (`Number(NaN) || 0`), deci o cantitate nenumerica facea si suma ceruta,
  // si toate totalurile legitime sa fie 0,00 — se potriveau perfect intre ele si
  // produsul principal pleca pe gratis. `NaN < 1` e fals, deci poarta veche o lasa.
  if (!Number.isFinite(claimedUnit) || !Number.isFinite(quantity) || quantity < 1) return null;
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
  /**
   * Optiunea aleasa de client. Semnatura o acopera, deci trebuie confruntata.
   *
   * `ramburs` NU vine de la client: se pune de apelant din metoda de plata deja
   * validata fata de ce ofera magazinul (`verificaMetodaPlata`). Asta e tot
   * rostul lui — la cotare regimul a fost declarat de browser, aici e confruntat
   * cu ce se intampla de fapt.
   */
  optiune: { courier?: string | null; deliveryType?: string | null; courierLabel?: string | null; ramburs: boolean },
  /** `shipping_zones` al magazinului: spune doar DACA are curieri de ales. */
  zone: Record<string, { enabled?: boolean; price?: number }> | null,
  /**
   * Serverul a hotarat deja ca livrarea e gratuita (prag atins sau cupon).
   *
   * Atunci nu e nimic de verificat: browserul trimite zero, dar tokenul lui e
   * semnat pe pretul COTAT al curierului, deci nicio semnatura n-are cum sa
   * bata. Fara scurtatura asta, clientul care tocmai a trecut pragul de livrare
   * gratuita nu putea comanda deloc — si zece din cincisprezece magazine cu
   * curieri activi au prag, deci ar fi cazut exact comenzile mari.
   */
  esteGratuit: boolean,
): number {
  if (esteGratuit) return 0;

  const claimed = Math.max(0, round2(Number(cerut) || 0));
  if (verifyShippingQuote(businessId, dest, claimed, token, optiune)) return claimed;

  /*
   * REZERVA e tariful implicit al magazinului, si NIMIC ales de client.
   *
   * Am incercat sa o leg de curierul ales, citind `shipping_zones[courier].price`.
   * Era gresit din radacina: `selected_courier` vine din browser, deci clientul
   * isi alegea singur rezerva. Trimitand `pickup` fara niciun token se obtinea
   * zero — inclusiv pe o comanda internationala, unde „Ridicare personala" nici
   * macar nu e o optiune ofertabila. Rezerva trebuie sa fie un numar pe care
   * l-a scris comerciantul si pe care clientul nu-l poate misca.
   */
  if (tarifImplicit == null) return claimed;

  /*
   * Magazin fara niciun curier de ales, care cere exact tariful implicit: e
   * cazul normal, nu unul de semnalat.
   *
   * Ramura asta NU strange nimic si nu trebuie citita ca o intarire: numeric da
   * acelasi rezultat ca ramura de mai jos, fiindca `max(claimed, tarifImplicit)`
   * e chiar `claimed` cand cele doua sunt egale. Singurul ei rost e sa nu umple
   * jurnalul cu avertismente pentru magazinele care n-au curieri configurati.
   *
   * Cine chiar apara banii e `max`-ul de mai jos. Si nici el nu acopera tot:
   * magazinul okxi are si `default_shipping_cost` 0,00 si pretul zonei Sameday
   * 0, cu tarif live, deci acolo nu exista niciun numar declarat sub care sa nu
   * se poata cobori. Tocmai de aceea amprenta trebuie sa lege TOT ce a produs
   * pretul, nu doar destinatia: pe okxi, o cotatie stricata nu costa nimic.
   * Regimul de ramburs e legat (vezi `QuoteOption.ramburs`); greutatea inca nu —
   * ea se calculeaza server-side, dar din lista de produse DECLARATA de client.
   */
  const areCurieri = Object.values(zone ?? {}).some((z) => z?.enabled);
  if (!areCurieri && claimed === round2(tarifImplicit)) return claimed;

  logError({
    action: "placeOrder.shippingRejected",
    message: "Shipping cost not covered by a signed quote",
    // `ramburs` e in jurnal fiindca e singura parte a amprentei pe care clientul
    // nu o trimite: cand semnatura cade fara motiv vizibil, aici se vede daca
    // regimul cerut la cotare a fost altul decat cel al comenzii.
    details: { businessId, claimed, tarifImplicit, courier: optiune.courier, deliveryType: optiune.deliveryType, ramburs: optiune.ramburs, hasToken: !!token },
    severity: "warning",
  });

  /*
   * Cel mai MARE dintre suma ceruta si tariful implicit — niciodata comanda
   * oprita.
   *
   * Oprirea ar fi fost curata pe hartie, dar cade pe capul clientilor cinstiti
   * la fiecare deploy care schimba amprenta si la fiecare rotire a cheii, cand
   * toate cotatiile aflate in circulatie devin invalide deodata.
   *
   * `max` scoate insa castigul din stricarea semnaturii: mai jos de tariful
   * implicit nu se poate cobori oricum. Iar clientul caruia i-a expirat cotatia
   * plateste ce a vazut pe ecran, nu un tarif mai mic — asa comerciantul nu mai
   * ramane dator, cum ramanea cand se cadea sec pe tariful implicit.
   */
  return Math.max(claimed, Math.max(0, round2(tarifImplicit)));
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
    const { data: counter, error } = await supabase.rpc("next_order_number", { p_business_id: businessId });
    /*
     * `?? 1` era o GHICITURA, si mereu aceeasi.
     *
     * La o eroare de RPC iesea `#0001` — adica numarul primei comenzi a
     * magazinului. Constrangerea de unicitate opreste duplicatul, deci nu se
     * corupe nimic, dar comerciantul primeste o eroare de checkout care nu spune
     * nimic, iar cauza adevarata (contorul n-a raspuns) nu se vede nicaieri.
     *
     * Mai bine se arunca: apelantul stie sa opreasca comanda, iar jurnalul spune
     * de ce. Un numar de comanda ghicit nu e un numar de comanda.
     */
    if (error || typeof counter !== "number") {
      logError({
        action: "nextOrderNumber",
        message: error?.message ?? "contorul n-a intors un numar",
        details: { businessId, raspuns: counter },
        businessId,
        severity: "critical",
      });
      throw new Error("Nu s-a putut genera numarul comenzii.");
    }
    return `#${String(counter).padStart(4, "0")}`;
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

/*
 * ═══ AICI ERA `scadeStoculVariantelor`, SI A FOST STEARSA ═══
 *
 * Scadea marimile cu `decrement_variant_stock_batch`, care PLAFONEAZA la zero in
 * loc sa refuze. Era chemata doar pe calea de rezerva, cand `revendica_stoc_complet`
 * nu raspundea — iar acea cale REDESCHIDEA supravanzarea pe care o inchisesem cu o
 * zi inainte: sistemul de siguranta cadea, aplicatia mergea mai departe, si mergea
 * pe purtarea nesigura.
 *
 * De la 19.08 nu mai exista cale de rezerva: cand verdictul nu se poate da,
 * comanda NU intra. Functia a fost stearsa, nu doar lasata nechemata — cod mort
 * care poarta algoritmul gresit se recheama, la a doua citire, de cineva care
 * vede doar ca „exista deja o functie pentru asta".
 *
 * Scaderea care plafoneaza mai traieste in baza, in `revendica_stoc_comanda`
 * (reactivarea unei comenzi anulate), unde plafonarea E purtarea corecta:
 * comerciantul a decis deja, iar un refuz i-ar lasa comanda intr-o stare
 * imposibila. Vezi `scade_variante_raportat`, care macar o raporteaza.
 */


/**
 * Cate comenzi pe minut si pe acelasi magazin mai sunt trafic si nu rafala.
 *
 * NU e un plafon dur si nu trebuie facut unul: un plafon dur pe magazin se
 * intoarce impotriva comerciantului — atacatorul ii umple cota si comenzile REALE
 * nu mai intra (vezi comentariul de la `submitPageForm`, page.actions.ts). Peste
 * pragul asta comanda se salveaza in continuare si se vede in panou; se opresc
 * doar instiintarile. Cel mai incarcat magazin din productie n-a trecut niciodata
 * de o comanda pe minut, deci 30 lasa loc si unei campanii adevarate.
 */
const PRAG_RAFALA_MAGAZIN = 30;

/**
 * Si pe ORA, nu doar pe minut.
 *
 * Cu o singura fereastra de un minut, pragul se ocoleste tinand ritmul sub el:
 * 29 de comenzi pe minut nu-l ating NICIODATA si fac totusi 1.740 de comenzi pe
 * ora, adica 1.740 de SMS-uri din creditul comerciantului si de doua ori pe atat
 * emailuri. Iar comentariul de mai sus spune chiar el ca asta e frana care ramane
 * dupa ce plafonul pe IP e ocolit cu o lista de proxy-uri — deci trebuie sa tina
 * si la ritm constant, nu doar la rafala.
 *
 * 600 e de zece ori peste cel mai incarcat magazin masurat (o comanda pe minut),
 * deci o campanie adevarata incape; si ramane sub pragul de minut inmultit cu 60,
 * deci fereastra scurta continua sa prinda varfurile.
 */
const PRAG_ORAR_MAGAZIN = 600;

/**
 * Magazinul asta primeste chiar acum o rafala de comenzi?
 *
 * Peste prag nu mai pleaca nici emailul catre comerciant, nici cel catre client,
 * nici SMS-ul — care se plateste din creditul comerciantului. Plafonul pe IP se
 * ocoleste cu o lista de proxy-uri, si atunci asta e singura frana care ramane:
 * fara ea, fiecare comanda falsa mai ardea un SMS si mai ingropa o comanda reala
 * in casuta comerciantului.
 *
 * Cele doua numarari pleaca IMPREUNA: a doua fereastra nu adauga nicio
 * intarziere pe drumul raspunsului, doar inca o cerere in paralel.
 */
async function pesteRafalaMagazinului(
  admin: SupabaseClient<Database>, businessId: string, actiune: string,
): Promise<boolean> {
  const acum = Date.now();
  const numara = async (deLa: number) => {
    const { count } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .gte("created_at", new Date(acum - deLa).toISOString());
    return count ?? 0;
  };
  const [peMinut, peOra] = await Promise.all([numara(60_000), numara(3_600_000)]);
  const pesteMinut = peMinut > PRAG_RAFALA_MAGAZIN;
  const pesteOra = peOra > PRAG_ORAR_MAGAZIN;
  if (!pesteMinut && !pesteOra) return false;
  /*
   * Alerta se scrie doar pe trecerea pragului, nu la fiecare comanda de dupa.
   *
   * Peste prag ajung AICI toate comenzile urmatoare — la fereastra de o ora,
   * sute — si un rand de fiecare ar umple `error_logs` cu copii ale aceleiasi
   * stiri. Banda de trei valori, nu una singura: cu inserari in paralel
   * numaratoarea poate sari peste exact prag+1.
   */
  const laTrecere = (n: number, prag: number) => n > prag && n <= prag + 3;
  if (laTrecere(peMinut, PRAG_RAFALA_MAGAZIN) || laTrecere(peOra, PRAG_ORAR_MAGAZIN)) {
    logError({
      action: `${actiune}.rafalaMagazin`,
      message: pesteMinut
        ? `${peMinut} comenzi intr-un minut pe acelasi magazin — emailurile si SMS-ul s-au oprit`
        : `${peOra} comenzi intr-o ora pe acelasi magazin — emailurile si SMS-ul s-au oprit`,
      details: { businessId, peMinut, peOra },
      severity: "warning",
    });
  }
  return true;
}

// `Revendicare` si regula „numai {ok:true} trece" stau in `lib/orders/verdict-stoc.ts`,
// unde pot fi TESTATE — sub `"use server"` n-ar putea fi.

/**
 * Verdictul de stoc si scaderea lui, in ACEEASI instructiune din baza.
 *
 * Pana acum erau doua drumuri: `expandBundleStock` citea stocul si compara in
 * aplicatie, iar `decrement_stock_batch` scadea abia DUPA ce comanda era scrisa —
 * si scadea cu `greatest(0, ...)`, deci supravanzarea nu lasa nici macar urma unui
 * numar negativ. Intre citire si scadere incap trei-patru dus-intorsuri la baza,
 * adica sute de milisecunde: cinci cereri in aceeasi clipa treceau toate cinci de
 * verificare si vindeau toate acelasi ultim produs.
 *
 * `revendica_stoc_batch` incuie randurile, da verdictul peste tot si abia apoi
 * scade: ori rezerva tot, ori nu atinge nimic si spune care produs a picat. Se
 * cheama INAINTE de inserarea comenzii, iar la esecul insertului stocul se da
 * inapoi cu `elibereazaStocul` — acelasi model ca la cupoane
 * (`claim_discount_use` / `release_discount_use`).
 *
 * `expandBundleStock` ramane inaintea ei si nu se scoate: ea desface pachetele in
 * componente si formuleaza mesajele omenesti („scoate pachetul din cos"), pe care
 * un verdict venit din baza nu le poate da.
 *
 * ═══ SI VARIANTELE, DE LA 18.08 ═══
 *
 * Variantele nu treceau pe aici deloc: se verificau in aplicatie
 * (`eroareStocPeVarianta`, o citire) si se scadeau DUPA insert, cu o functie care
 * plafoneaza la zero in loc sa refuze. Verificarea de produs nu acoperea gaura,
 * fiindca `products.stock_quantity` e SUMA combinatiilor: pe un produs cu 94 de
 * marimi si 993.313 bucati, o cursa pe marimea cu 2 bucati trecea de fiecare data.
 *
 * Dovedit pe productie inainte de reparatie, pe „Pique Polo" / „verde sticla 4XL"
 * (stoc 2): pe calea veche a doua cerere primea `{ok:true}` si vindea a treia
 * bucata; pe cea noua primeste `{ok:false, varianta, disponibil:0}`. Iar plafonarea
 * facea ca baza sa nu ramana negativa, deci supravanzarea nu lasa nicio urma.
 *
 * Consecinta pentru apelanti: scaderea variantelor S-A MUTAT INAINTE de insert,
 * impreuna cu cea de produs. `scadeStoculVariantelor` ramane DOAR pentru cazul
 * `nerevendicat` (functia din baza inca nu exista) — chemata si dupa o revendicare
 * reusita, ar scadea a doua oara.
 */
async function revendicaStocul(
  admin: SupabaseClient<Database>,
  decrements: { product_id: string; quantity: number }[],
  liniiVarianta: { product_id: string; variant_title?: string | null; quantity: number }[] = [],
): Promise<Revendicare> {
  const variante = liniiVarianta
    .filter((l) => l.variant_title)
    .map((l) => ({
      product_id: l.product_id,
      variant_title: l.variant_title as string,
      // Aceeasi normalizare ca `stocRezervat` si ca fosta `scadeStoculVariantelor`:
      // ce se rezerva trebuie sa fie exact ce se scrie pe comanda, altfel anularea
      // da inapoi alt numar decat s-a luat.
      quantity: Math.max(1, Math.floor(Number(l.quantity) || 1)),
    }));
  if (decrements.length === 0 && variante.length === 0) return { fel: "revendicat" };
  const { data, error } = await admin.rpc(
    "revendica_stoc_complet" as never,
    { p_produse: decrements, p_variante: variante } as never,
  );
  /*
   * ⚠ CAND FUNCTIA NU RASPUNDE, COMANDA NU INTRA.
   *
   * Aici scria pana la 19.08 exact pe dos: „comanda MERGE MAI DEPARTE pe drumul
   * vechi", cu justificarea ca migratia poate sa nu fie inca aplicata. Migratia e
   * aplicata, iar drumul vechi plafona in loc sa refuze — adica supravanzarea pe
   * marimi se redeschidea singura ori de cate ori RPC-ul pica: schema cache
   * stricat, `REVOKE` gresit, deploy ajuns inaintea migratiei.
   *
   * Un checkout oprit doua minute e incomparabil mai ieftin decat marfa vanduta de
   * doua ori. Regula sta acum in `interpreteazaRevendicarea`, cu teste: numai
   * `{ok: true}` lasa comanda sa treaca.
   *
   * Jurnalul ramane `critical`: daca ramura asta apare in `/admin/logs`,
   * checkout-ul chiar e oprit si trebuie umblat la baza, nu la cod.
   */
  if (error) {
    logError({
      action: "revendicaStocul", message: error.message,
      details: { code: error.code, hint: error.hint, produse: decrements.length, variante: variante.length },
      severity: "critical",
    });
  }
  const verdict = interpreteazaRevendicarea(data, error);
  if (verdict.fel === "esuat" && !error) {
    logError({ action: "revendicaStocul", message: "raspuns de forma neasteptata", details: { produse: decrements.length, raspuns: data }, severity: "critical" });
  }
  return verdict;
}

/**
 * Da inapoi stocul revendicat cand comanda nu mai intra. Perechea lui
 * `revendicaStocul`, ca `release_discount_use` pentru cupon.
 *
 * DA INAPOI SI VARIANTELE. De cand revendicarea le ia inainte de insert, o
 * eliberare doar pe produse ar lasa marimea consumata pentru o comanda care nu
 * exista — adica exact gaura pe care mutarea o repara, doar pe calea de eroare.
 * Amandoua intr-un singur apel: doua apeluri separate pot reusi pe jumatate.
 */
async function elibereazaStocul(
  admin: SupabaseClient<Database>,
  decrements: { product_id: string; quantity: number }[],
  liniiVarianta: { product_id: string; variant_title?: string | null; quantity: number }[] = [],
): Promise<void> {
  const variante = liniiVarianta
    .filter((l) => l.variant_title)
    .map((l) => ({
      product_id: l.product_id,
      variant_title: l.variant_title as string,
      quantity: Math.max(1, Math.floor(Number(l.quantity) || 1)),
    }));
  if (decrements.length === 0 && variante.length === 0) return;
  const { error } = await admin.rpc(
    "elibereaza_stoc_complet" as never,
    { p_produse: decrements, p_variante: variante } as never,
  );
  if (error) {
    // Marfa ramane rezervata pentru o comanda care nu exista. Se repara de mana,
    // deci trebuie sa se vada: fara jurnal, stocul scade in gol si nimeni nu stie.
    logError({ action: "elibereazaStocul", message: error.message, details: { code: error.code, produse: decrements.length, variante: variante.length }, severity: "critical" });
  }
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
  /** Rambursul pentru care s-a cerut cotatia. Doar pentru masurare. */
  cod_declarat?: number;
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
  /**
   * NU SE CITESC. `discount_id` n-a fost citit niciodata, iar `discount_amount`
   * a plecat pe 2026-08-04 din singurul loc care il folosea (payload-ul de
   * email). Cuponul se re-valideaza integral pe server din `discount_code`, si
   * doar ce iese de acolo ajunge si in `orders`, si in emailuri.
   *
   * Raman declarate fiindca `OrderModal.tsx` si `checkout-core.ts` inca le
   * trimit; scoase de aici, `tsc` ar pica pe ele. Cine le sterge, sa le stearga
   * si de la apelanti — dar sa nu le RECITEASCA: un numar de reducere venit de
   * la browser nu are ce cauta langa un total calculat de server.
   */
  discount_id?: string;
  discount_amount?: number;
  /** Singurul camp de cupon citit: se re-valideaza cu `validateDiscount`. */
  discount_code?: string;
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
  /*
   * Al doilea strat, DURABIL. Cel de deasupra e o harta in memoria instantei:
   * limita reala se inmulteste cu numarul de instante calde de pe Vercel si se
   * pierde la fiecare deploy, deci pe hartie sunt 10 pe minut si in fapt nu e
   * niciun plafon. Contorul asta sta in Postgres, deci e unul singur pentru toate
   * instantele. Cheia e comuna celor doua cai de comanda: altfel se comuta intre
   * formularul de produs si cos si se ia plafonul de doua ori.
   */
  if (!(await consumaLimita(`comanda:ip:${ip}`, 40, 3600)).permis) {
    return { error: "Prea multe comenzi trimise de pe aceasta conexiune. Te rugam incearca mai tarziu." };
  }

  // Use admin client for order creation — customers are anonymous, RLS requires service role
  const admin = createAdminClient();

  /*
   * Numele clientului, TAIAT la 120 de caractere.
   *
   * Venea din browser doar cu `.trim()`, adica nelimitat, iar actiunea e export
   * „use server", deci endpoint public. Acelasi sir ajunge in `orders`, in
   * subiectul emailului catre comerciant („Comanda noua X - NUME"), in SMS si mai
   * departe pe AWB si pe factura. Numele de produs sunt de mult taiate la fel;
   * asta era singurul camp de text al comenzii ramas fara plafon.
   *
   * Se taie o singura data, aici, si se foloseste peste tot: plafonat doar la
   * inserare, emailul ar fi plecat in continuare cu sirul intreg.
   */
  const numeClient = data.customer_name.trim().slice(0, 120);

  // Reload product + store config and recompute every price server-side.
  const [{ data: product, error: eroareProdus }, { data: cfgRow, error: eroareCfg }] = await Promise.all([
    admin.from("products")
      .select("id, name, price, is_active, business_id, page_sections")
      .eq("id", data.product_id)
      .eq("business_id", data.business_id)
      .single(),
    admin.from("store_settings")
      .select("payment_methods, stripe_config, netopia_config, ipay_config, klarna_config, revolut_config, page_content, free_shipping_threshold, min_order_amount, card_discount_config, cod_discount_config, cod_fee_config, vat_enabled, vat_rate, prices_include_vat, default_shipping_cost, shipping_zones")
      .eq("business_id", data.business_id)
      .single(),
  ]);

  // O interogare cazuta nu inseamna „produsul nu mai e disponibil": reincarcarea
  // nu repara o pana, deci raspunsul corect e sa mai incerce. `.single()` fara rand
  // intoarce tot eroare, deci se verifica intai produsul lipsa, care e altceva.
  if (eroareProdus && product === null && eroareProdus.code !== "PGRST116") {
    logError({ action: "placeOrder.productUnavailable", message: eroareProdus.message, details: { businessId: data.business_id, productId: data.product_id }, severity: "error" });
    return { error: "Nu am putut verifica produsul. Te rugam incearca din nou in cateva momente." };
  }
  if (!product || !product.is_active) {
    return { error: "Produsul nu mai este disponibil. Reincarca pagina." };
  }
  if (eroareCfg && cfgRow === null && eroareCfg.code !== "PGRST116") {
    logError({ action: "placeOrder.configUnavailable", message: eroareCfg.message, details: { businessId: data.business_id }, severity: "error" });
    return { error: "Nu am putut verifica setarile magazinului. Te rugam incearca din nou in cateva momente." };
  }

  /*
   * Metoda de plata, verificata fata de ce ofera CHIAR magazinul.
   *
   * Pana acum se normaliza doar sirul primit din browser, deci trecea orice cod
   * cunoscut, indiferent daca magazinul il ofera sau nu. De metoda atarna insa
   * trei sume — reducerea de card, reducerea de ramburs si taxa de ramburs — plus
   * baza de TVA: cine trimitea „stripe" pe un magazin care are doar ramburs lua
   * reducerea de card si scapa de taxa, iar comanda ramanea neplatita.
   *
   * Garda sta AICI, inaintea oricarei scrieri (jurnalul ofertelor scrie deja in
   * `error_logs` mai jos), si nu corecteaza in tacere: comanda se opreste, iar
   * formularul isi reface lista de metode la reincarcare, deci refuzul se repara.
   */
  const metoda = verificaMetodaPlata(data.payment_method, cfgRow);
  if ("error" in metoda) {
    logError({ action: "placeOrder.paymentMethodRejected", message: "Payment method not offered by the store", details: { businessId: data.business_id, cerut: String(data.payment_method ?? "").slice(0, 40) }, severity: "warning" });
    return { error: metoda.error };
  }
  const metodaPlata = metoda.metoda;

  /*
   * Cantitatea comandata, judecata o singura data si folosita peste tot.
   *
   * Era singurul numar din comanda care nu trecea prin nicio plafonare: liniile
   * din cos si editarea din panou se opresc de mult la 999, formularul de produs
   * nu se oprea nicaieri. Iar `Math.floor` pe ce vine din browser nu e de ajuns,
   * fiindca `quantity` poate sosi si nenumeric.
   *
   * Peste plafon se REFUZA, nu se rescrie: plafonata in tacere, cantitatea intra
   * apoi in motorul de trepte, deci cine cere 5000 primeste si TREAPTA lui 999,
   * adica alt pret unitar decat cel de pe ecran.
   */
  const ceruta = cantitateCeruta(data.quantity);
  if (ceruta.fel !== "ok") return { error: mesajCantitate(ceruta) };
  const cantitate = ceruta.cantitate;

  /*
   * Produsul din formular trebuie sa aiba varianta aleasa, si aceea sa fie de
   * vanzare.
   *
   * `legitUnitPrices` refuza deja o varianta necunoscuta, dar ramura FARA
   * varianta intorcea pretul de baza plus toate preturile combinatiilor: adica un
   * produs cu variante trimis fara nicio marime trecea la pretul de baza. Pe
   * ANTIFOANE, 156,80 in loc de 438,00, si o linie pe factura fara marime, pe
   * care comerciantul n-are cum sa o expedieze. Formularul nu lasa asta sa se
   * intample, dar actiunea e export „use server", adica endpoint public.
   */
  const linieP = pretulLiniei(
    { name: String((product as OrderProduct).name ?? ""), price: round2(Number(product.price)), page_sections: product.page_sections },
    data.variant_title,
  );
  if (linieP.fel === "eroare") {
    logError({ action: "placeOrder.variantRejected", message: linieP.error, details: { businessId: data.business_id, productId: data.product_id, variant: String(data.variant_title ?? "").slice(0, 80) }, severity: "warning" });
    return { error: linieP.error };
  }

  const mainSubtotal = authoritativeSubtotal(product as OrderProduct, data.product_price, cantitate, data.variant_title);
  if (mainSubtotal === null) {
    logError({ action: "placeOrder.priceRejected", message: "Client price did not match any legitimate configuration", details: { businessId: data.business_id, productId: data.product_id, claimedUnit: data.product_price, quantity: data.quantity, cantitate }, severity: "warning" });
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
    { product_id: data.product_id, variant_title: data.variant_title, quantity: cantitate },
  ];
  if (data.additional_items?.length) {
    const ids = [...new Set(data.additional_items.map((i) => i.product_id))].filter((id) => id !== data.product_id);
    if (ids.length > 0) {
      const { data: extraProducts, error: eroareExtra } = await admin.from("products").select("id, name, price, is_active, page_sections").in("id", ids).eq("business_id", data.business_id);
      // O interogare cazuta arunca TOT cosul purtat, in tacere: clientul ar primi
      // o comanda doar cu produsul din formular, la un total pe care nu l-a vazut.
      if (eroareExtra) {
        logError({ action: "placeOrder.cartItemsUnavailable", message: eroareExtra.message, details: { businessId: data.business_id, ids }, severity: "error" });
        return { error: "Nu am putut verifica produsele din cos. Te rugam incearca din nou in cateva momente." };
      }
      const extraMap = new Map((extraProducts ?? []).filter((p) => p.is_active).map((p) => {
        const base = round2(Number(p.price));
        stocPeVarianta.set(p.id, comboStockMap(p.page_sections));
        return [p.id, {
          name: String(p.name),
          price: base,
          pageSections: p.page_sections,
          tiers: (p.page_sections as { quantity_tiers?: unknown } | null)?.quantity_tiers,
        }];
      }));
      /*
       * Lista filtrata se tine intr-o variabila, ca stocul si preturile sa se uite
       * la EXACT aceleasi linii. Repetat, filtrul ar putea ajunge sa difere.
       *
       * Cantitatea se PLAFONEAZA aici, o singura data, si tot de aici o iau si
       * verificarea de stoc, si pretul. `placeOrder` e export dintr-un modul
       * „use server", adica endpoint public, iar `Math.floor` primea pur si simplu
       * ce trimitea browserul; calea de editare plafoneaza de mult la 999.
       * Plafonata doar la pret, s-ar fi scazut din stoc un numar si s-ar fi
       * incasat altul.
       */
      const cerute = data.additional_items
        .filter((i) => i.product_id !== data.product_id && extraMap.has(i.product_id))
        .map((i) => ({ linie: i, ceruta: cantitateCeruta(i.quantity) }));
      // O cantitate imposibila OPRESTE comanda, nu scoate linia in tacere: scoasa,
      // clientul plateste restul cosului fara sa afle ca a pierdut un produs — si
      // aici pot fi si bump-uri acceptate, nu doar linii de cos.
      const respinsa = cerute.find((c) => c.ceruta.fel !== "ok");
      if (respinsa) {
        const r = respinsa.ceruta as Exclude<typeof respinsa.ceruta, { fel: "ok" }>;
        // Cantitatea bruta e valoare JSON arbitrara dintr-un endpoint public, deci
        // se taie inainte de jurnal, ca `payment_method` cateva randuri mai sus.
        // Iar mesajul numeste produsul cu numele din CATALOG: pe calea asta comanda
        // foloseste oricum numele autoritar, tocmai fiindca cel de la client nu e
        // de incredere si poate veni si gol.
        logError({ action: "placeOrder.cantitateRespinsa", message: r.fel, details: { businessId: data.business_id, productId: respinsa.linie.product_id, quantity: String(respinsa.linie.quantity).slice(0, 40) }, severity: "warning" });
        return { error: mesajCantitate(r, extraMap.get(respinsa.linie.product_id)?.name) };
      }
      // Varianta ceruta trebuie sa existe, iar un produs cu variante nu poate
      // veni fara niciuna. Pana acum calea asta cadea pe pretul de baza in
      // amandoua cazurile, spre deosebire de calea cosului, care refuza.
      // Aceleasi linii pe care le pretuieste blocul de mai jos, nu un filtru scris
      // a doua oara: chiar comentariul de deasupra avertizeaza ca doua filtre
      // repetate ajung sa difere.
      const eroareVar = eroareVarianta(
        new Map([...extraMap].map(([id, m]) => [id, { name: m.name, price: m.price, page_sections: m.pageSections }])),
        cerute.map((c) => c.linie),
      );
      if (eroareVar) {
        logError({ action: "placeOrder.variantUnavailable", message: eroareVar, details: { businessId: data.business_id, ids }, severity: "warning" });
        return { error: eroareVar };
      }
      const liniiDinCos = cerute.map((c) => ({ ...c.linie, quantity: (c.ceruta as { cantitate: number }).cantitate }));
      liniiCuVarianta.push(...liniiDinCos);
      cartItems = liniiDinCos
        .map((i) => {
          const meta = extraMap.get(i.product_id)!;
          // Pretul si numele vin din ACEEASI functie care a dat verdictul mai sus.
          // Aici era portita: o varianta dezactivata intre timp cadea pe pretul de
          // BAZA si intra in comanda purtandu-i numele.
          const rezolvata = pretulLiniei(
            { name: meta.name, price: meta.price, page_sections: meta.pageSections },
            i.variant_title,
          );
          const unitPrice = rezolvata.fel === "ok" ? rezolvata.unitPrice : meta.price;
          // Treptele se aplica si liniilor purtate din cos in comanda directa,
          // cu acelasi motor. Altfel cosul arata pretul de pachet, iar comanda
          // plecata din formularul de produs il pierde pe drum.
          const linie = pretPeTrepte(construiesteTrepte(meta.tiers, unitPrice), i.quantity, unitPrice);
          return {
            product_id: i.product_id,
            name: rezolvata.fel === "ok" ? rezolvata.nume : meta.name,
            price: linie.unitPrice,
            quantity: i.quantity,
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

  /*
   * Ofertele acceptate, RE-EVALUATE de la zero pe server: declansatorul,
   * suprafata, setul pe care magazinul l-ar fi aratat si abia apoi pretul.
   *
   * Ancora se paseaza cu pretul ei unitar REAL, adica al variantei alese, nu cu
   * pretul de baza al produsului. Cardul din pagina imparte economia setului
   * folosind pretul afisat, deci pe un produs cu variante cele doua numere
   * spuneau lucruri diferite.
   */
  const oferte = await applyOfferPricing(admin, data.business_id, data.accepted_offer_ids, cartItems, {
    anchor: {
      productId: data.product_id,
      basePrice: round2(Number(product.price)),
      // Aici ROTUNJIT, spre deosebire de linia care se scrie in comanda: numarul
      // asta nu ajunge in `items`, ci imparte economia setului intre companioni,
      // iar cardul din pagina o imparte folosind pretul AFISAT. Nerotunjit, cele
      // doua ar da preturi diferite pe aceiasi companioni.
      unitPrice: round2(mainSubtotal / cantitate),
    },
    // Liniile cu varianta aleasa vin sigur din cos, nu de la o oferta: ofertele
    // adauga produsul dintr-o apasare, deci nu pot alege o marime.
    cuVariantaAleasa: new Set((data.additional_items ?? []).filter((i) => i.variant_title).map((i) => i.product_id)),
  });
  await jurnalizeazaOfertele(admin, data.business_id, oferte);
  if (oferte.error) return { error: oferte.error };
  cartItems = oferte.items;
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
    /*
     * Cuponul respins OPRESTE comanda, nu se scoate in tacere.
     *
     * Fara ramura asta, un cupon devenit invalid intre completarea formularului
     * si trimitere (si-a atins limita, a expirat, l-a stins comerciantul, sau
     * marfa repretuita a cazut sub pragul lui) lasa `discountAmount` pe zero si
     * comanda intra cu totalul INTREG. Ecranul scria 350, curierul incasa 500.
     * Aceeasi situatie prinsa mai jos, la revendicare, intoarce deja eroare.
     */
    if (!dres.valid) return { error: dres.error };
      discountAmount = Math.min(dres.discount.discountAmount, subtotal);
      validDiscountId = dres.discount.id;
      isFreeShipping = dres.discount.type === "free_shipping";
  }

  // Card-payment discount: applies only to online card methods, on the goods
  // value (subtotal + extras, after any promo), never on shipping. Computed
  // server-side and baked into total so the card processor charges the right sum.

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
  // Livrarea gratuita se hotaraste INAINTE de verificare: browserul trimite zero,
  // dar tokenul lui e semnat pe pretul cotat al curierului, deci n-are cum sa bata.
  const esteGratuit = isFreeShipping || (freeThreshold !== null && subtotal >= freeThreshold);
  const shipping = autoritativeShipping(
    data.business_id,
    data.shipping_cost,
    data.shipping_token,
    { county: data.customer_county, city: data.customer_city, country: data.customer_country, postCode: data.customer_postal_code },
    cfgRow?.default_shipping_cost != null ? Number(cfgRow.default_shipping_cost) : null,
    {
      courier: data.selected_courier,
      deliveryType: data.delivery_type,
      courierLabel: data.courier_label,
      // Din METODA validata mai sus, nu din vreun numar trimis de browser.
      // Formularul cere cotatia cu `cod = totalul` cand plata e ramburs si cu 0
      // altfel, deci steagul lui e chiar asta. Egalitatea ar cadea doar pe o
      // comanda de 0,00 lei platita ramburs; in productie sunt 0 din 96.
      ramburs: isCodPaymentMethod(metodaPlata),
    },
    (cfgRow?.shipping_zones ?? null) as Record<string, { enabled?: boolean; price?: number }> | null,
    esteGratuit,
  );

  // VAT: recomputed server-side (mirrors placeCartOrder + the storefront) so single-
  // product / One-Product-Store orders collect VAT too. Only VAT-exclusive pricing
  // adds VAT on top of the total.
  const vatEnabled = cfgRow?.vat_enabled ?? false;
  const vatRate = Number(cfgRow?.vat_rate ?? 19);
  const pricesIncludeVat = cfgRow?.prices_include_vat ?? true;
  // Baza: marfa, extraoptiunile si TRANSPORTUL, dupa toate reducerile, plus taxa de ramburs.
  // Formula sta in `vatBase`, folosita si de cele doua formulare din magazin si de
  // cos, ca ce vede clientul sa fie ce se incaseaza.
  const { vatAmount, vatAddOn } = computeVat(
    vatBase({ goods: subtotal, extras: extrasTotal, shipping, discount: discountAmount, cardDiscount, codDiscount, codFee }),
    { vat_enabled: vatEnabled, vat_rate: vatRate, prices_include_vat: pricesIncludeVat },
  );

  const total = Math.max(0, round2(subtotal + extrasTotal - discountAmount - cardDiscount - codDiscount + codFee + shipping + vatAddOn));

  /*
   * Cat de mult a subdeclarat clientul rambursul la cotare — masurat, nu blocat.
   *
   * Semnatura leaga STEAGUL de ramburs, nu suma: suma nu se poate reconstrui,
   * fiindca e chiar totalul care contine transportul pe care tocmai il verificam.
   * La FAN Courier atat ajunge (pretul lui comuta pe un boolean), dar la ceilalti
   * cinci curieri comisionul iese din SUMA — deci cine cere cotatia cu `cod: 0.01`
   * si comanda apoi 5000 de lei pastreaza steagul, iar diferenta de comision o
   * plateste comerciantul.
   *
   * NU se refuza si NU se cade pe tariful implicit: asta ar repretui tacit o
   * comanda buna ori de cate ori clientul isi schimba cosul intre cotatie si
   * trimitere — adica exact defectul „ecranul spune una, se incaseaza alta" pe
   * care il vaneaza tot auditul. Se scrie in jurnal, ca sa se poata masura cat
   * costa cu adevarat inainte de a alege o garda mai dura.
   */
  /*
   * Se compara MARFA cu MARFA, nu marfa cu totalul.
   *
   * Amandoua formularele cer cotatia cu suma marfii, nu cu totalul: `OrderModal`
   * trimite subtotalul, iar checkout-ul totalul cosului, care nu contine
   * transportul. Comparat cu totalul final, pragul s-ar fi aprins pe aproape orice
   * comanda cu transport platit — 49 din 51 de comenzi ramburs din ultimele 30 de
   * zile — si jurnalul ar fi masurat propria noastra nepotrivire de unitati in loc
   * de subdeclarare.
   */
  const marfaIncasata = round2(subtotal + extrasTotal - discountAmount - cardDiscount - codDiscount);
  if (isCodPaymentMethod(metodaPlata) && Number(data.cod_declarat) > 0
      && marfaIncasata - round2(Number(data.cod_declarat)) > 1) {
    logError({
      action: "placeOrder.rambursSubdeclarat",
      message: `Cotatie ceruta pentru ${round2(Number(data.cod_declarat)).toFixed(2)} lei ramburs, marfa comenzii e ${marfaIncasata.toFixed(2)}`,
      details: { businessId: data.business_id, declarat: round2(Number(data.cod_declarat)), marfa: marfaIncasata, total: round2(total) },
      severity: "warning",
    });
  }


  // Bundle-aware stock: expand a bundle into its components + validate availability
  // before creating the order (prevents overselling components).
  const stockExp = await expandBundleStock(admin, data.business_id, [
    { product_id: data.product_id, quantity: cantitate },
    ...cartItems.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
  ]);
  if ("error" in stockExp) {
    // Singurele respingeri din checkout fara jurnal: „Pachet Femei" e nevandabil
    // de o saptamana, publicat, si nimeni n-avea de unde sti.
    logError({ action: "placeOrder.bundleStock", message: stockExp.motiv, details: { businessId: data.business_id, productId: data.product_id, componenta: stockExp.componenta }, severity: "warning" });
    return { error: stockExp.error };
  }

  /*
   * Prins aici, nu lasat sa iasa: o actiune de server care arunca ii da clientului
   * un ecran de eroare opac („An error occurred in the Server Components render"),
   * in loc de un mesaj din care sa inteleaga ca poate reincerca.
   *
   * Se cheama INAINTE de revendicarea stocului, deci o picare aici nu lasa marfa
   * rezervata pentru o comanda care n-a intrat.
   */
  let order_number: string;
  try {
    order_number = await buildOrderNumber(admin, data.business_id);
  } catch {
    return { error: "Nu am putut genera numarul comenzii. Reincearca peste cateva momente." };
  }

  // NEROTUNJIT, deliberat: `subtotal` si `total` stau pe `mainSubtotal`, deci
  // pretul unitar trebuie sa fie exact acela care, inmultit cu cantitatea, il da
  // inapoi. Rotunjit la ban, un pachet de 2 bucati la 13,41 pleca cu 6,71 pe
  // linie, adica 13,42 — suma liniilor nu mai dadea totalul comenzii, si asta pe
  // documentul dupa care se factureaza si se restituie banii.
  //
  // Celelalte doua cai care scriu linii faceau deja asa: cosul (`placeCartOrder`)
  // si editarea din panou (`edit-pricing.ts`, care chiar VERIFICA pretul unitar
  // nerotunjit — vezi `estePretAutoritar`). Rotunjirea de aici era singura
  // exceptie, si tocmai ea rupea contopirea liniilor la editare.
  //
  // Documentul primeste oricum doi bani: cele trei case rotunjesc pretul unitar
  // la trimitere, iar garda din `reconcile.ts` modeleaza exact acea rotunjire si
  // absoarbe diferenta cu o linie de ajustare.
  const unitPrice = mainSubtotal / cantitate;
  const allItems = [
    {
      product_id: data.product_id,
      // Numele din CATALOG, cu marimea coapta de noi. Venea de la client, iar
      // `orders.items` nu retine `variant_title` nicaieri: numele e SINGURA urma
      // a marimii vandute, si pleaca netaiat pe factura la toate trei casele. Cu
      // `variant_title: "S"` si `product_name: "GEACA (XXL)"`, pretul era al lui S
      // si comanda scria XXL.
      name: linieP.nume,
      price: unitPrice,
      quantity: cantitate,
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
    /*
     * `error` VERIFICAT, si verdictul cerut EXPLICIT `true`.
     *
     * Era `const { data } = ...` cu `if (data === false)`. La o eroare de RPC,
     * `data` e `null`, iar `null === false` e FALS — deci checkout-ul mergea mai
     * departe, clientul primea reducerea, si utilizarea NU se revendica. Pe un
     * cupon cu `max_uses = 100`, o serie de erori il duce peste limita fara ca
     * nimic sa se vada.
     *
     * Acum orice altceva decat `true` opreste comanda. O reducere neacordata
     * pentru cateva secunde e o suparare; o campanie de 100 care serveste 130 e o
     * paguba, si una pe care o afli abia la socoteala.
     */
    const { data: revendicat, error: eCupon } = await admin.rpc("claim_discount_use" as never, { p_discount_id: validDiscountId } as never);
    if (eCupon) {
      logError({ action: "claimDiscountUse", message: eCupon.message, details: { code: eCupon.code, discountId: validDiscountId }, severity: "critical" });
      return { error: "Nu putem valida codul de reducere chiar acum. Reincearca peste cateva momente." };
    }
    if (revendicat !== true) {
      return { error: "Codul a atins limita maxima de utilizari. Reincarca pagina si incearca fara el." };
    }
  }

  // Si stocul se revendica atomic, tot inainte de inserare — `expandBundleStock`
  // de mai sus a citit doar, iar intre citire si scaderea de dupa insert incapeau
  // patru cereri paralele care vindeau toate acelasi ultim produs. Vezi
  // `revendicaStocul`.
  const stoc = await revendicaStocul(admin, stockExp.decrements, liniiCuVarianta);
  /*
   * `!== "revendicat"`, nu doar `=== "refuzat"`.
   *
   * „Refuzat" inseamna „nu mai e marfa" — un raspuns adevarat. „Esuat" inseamna
   * „n-am putut afla", si e nou: pana acum se numea `nerevendicat` si LASA comanda
   * sa treaca mai departe, pe algoritmul vechi. Amandoua opresc acum comanda si
   * dau cuponul inapoi; doar textul difera.
   */
  if (stoc.fel !== "revendicat") {
    if (validDiscountId) await admin.rpc("release_discount_use" as never, { p_discount_id: validDiscountId } as never);
    return { error: stoc.error };
  }

  const { data: order, error } = await admin.from("orders").insert({
    business_id: data.business_id,
    order_number,
    customer_name: numeClient,
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
    // Reducerea data de oferte sta DEJA in pretul liniilor; coloana o inregistreaza
    // ca sa existe o pista de audit. Fara ea, o reducere de oferta nu se poate
    // deosebi in `items` de o schimbare ulterioara a pretului de catalog, si nici
    // nu se putea dovedi ca nu s-a abuzat de vreo oferta.
    offer_discount_amount: oferte.savings,
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
    /*
     * Id-ul cuponului revendicat, scris PE COMANDA — nu doar codul lui.
     *
     * Utilizarea revendicata mai sus trebuie sa se poata da inapoi cand comanda
     * nu se mai face (anulata, returnata, stearsa, plata online abandonata).
     * Codul ca text nu ajunge: comerciantul poate redenumi cuponul intre timp, si
     * atunci comanda ar arata catre un cod inexistent — sau, mai rau, catre un
     * cupon nou cu acelasi nume. Coloana vine din migratia
     * `2026-08-04-eliberare-cupon.sql`.
     *
     * `as never` ca la `order_source` si `billing_company`: coloana e in baza,
     * dar inca nu si in tipurile generate.
     */
    discount_id: (validDiscountId ?? null) as never,
    /* Ce s-a rezervat, ca sa se poata da inapoi intocmai la anulare. `as never`
     * ca la `discount_id`: coloana e noua si tipurile generate n-o stiu inca. */
    stoc_rezervat: stocRezervat(stockExp.decrements, liniiCuVarianta) as never,
  }).select("id, order_number").single();

  if (error) {
    // Comanda n-a intrat, deci utilizarea revendicata si stocul rezervat se dau
    // inapoi. Fara a doua linie, marfa ramanea scazuta pentru o comanda care nu
    // exista nicaieri — adica exact pe dos fata de cursa pe care o repara.
    if (validDiscountId) await admin.rpc("release_discount_use" as never, { p_discount_id: validDiscountId } as never);
    if (stoc.fel === "revendicat") await elibereazaStocul(admin, stockExp.decrements, liniiCuVarianta);
    logError({ action: "placeOrder", message: error.message, details: { code: error.code, hint: error.hint, businessId: data.business_id }, severity: "critical" });
    return { error: "Eroare la plasarea comenzii. Incearca din nou." };
  }

  /*
   * Acceptarile de oferta intra in contor ABIA ACUM, cand comanda chiar exista.
   *
   * Numarate in `applyOfferPricing`, cum erau, treceau in contor si comenzile
   * care picau mai jos — comanda minima, ANAF, cupon respins, stoc pierdut,
   * insert cazut — iar clientul care corecta si retrimitea mai adauga una.
   * `after` scoate scrierea de pe drumul raspunsului: nicio comanda nu asteapta
   * dupa o statistica.
   */
  if (oferte.applied.length > 0) {
    try {
      after(() => scrieStatisticiOferte(admin, oferte.applied.map((id) => ({
        offerId: id, conversions: 1, revenue: oferte.venitPeOferta[id] ?? 0,
      }))));
    } catch { /* fara context de cerere (scripturi, teste) */ }
  }


  // Stocul — si de produs, si de marime — e DEJA scazut, odata cu verdictul,
  // inainte de insert. Nu mai exista nicio a doua cale.

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

  // Peste pragul moale pe magazin comanda ramane scrisa si vizibila in panou, dar
  // instiintarile nu mai pleaca: plafonul pe IP se ocoleste cu proxy-uri, iar
  // fiecare comanda falsa mai arde un SMS din creditul comerciantului si mai
  // ingroapa o comanda reala in casuta lui. Vezi `pesteRafalaMagazinului`.
  const pesteRafala = await pesteRafalaMagazinului(admin, data.business_id, "placeOrder");

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
        customer_name: numeClient,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        total,
        subtotal,
        // Liniile pleaca CU `product_id`: dupa prefixul `extra_` isi recunoaste
        // emailul extraoptiunile, iar fara ele „Subtotal" din emailul
        // comerciantului nu se aduna cu lista de deasupra lui. Vezi `BaniComanda`.
        items: allItems.map(i => ({ product_id: i.product_id, name: i.name, quantity: i.quantity, price: i.price })),
        shipping_cost: shipping,
        /*
         * Reducerea si codul sunt ALE SERVERULUI: exact ce s-a scris in `orders`
         * mai sus, aceleasi doua expresii.
         *
         * Pana acum plecau `data.discount_amount` si `data.discount_code`, adica
         * numerele din cererea browserului, desi vecinele lor (`total`,
         * `cardDiscount`, `codFee`) erau recalculate de server. Baza si emailul
         * puteau deci sa se contrazica pe aceeasi comanda.
         *
         * Expunere MASURATA 2026-08-04: zero comenzi din 96 au `discount_amount`
         * peste zero, iar singurul cupon folosit vreodata (tonel-beauty #0003,
         * „PRIMA") e de tip `free_shipping`, adica are `discount_amount` 0 prin
         * constructie — deci si clientul si serverul duceau acelasi 0, si emailul
         * nu tiparea niciun rand. Nu s-a contrazis nimic pana acum.
         *
         * Varianta ostila era mai rea: `placeOrder` e export „use server" cu
         * adresa de destinatie aleasa de apelant, deci un `discount_amount:
         * 100000` fabricat tiparea „Reducere -100.000,00 lei" intr-un email
         * purtand numele unui magazin real.
         *
         * `data.discount_amount` si `data.discount_id` nu mai sunt citite acum
         * NICAIERI; raman in semnatura doar fiindca `OrderModal.tsx` si
         * `checkout-core.ts` inca le trimit.
         */
        discount_code: validDiscountId ? data.discount_code : undefined,
        discount_amount: discountAmount,
        card_discount_amount: cardDiscount,
        cod_discount_amount: codDiscount,
        cod_fee_amount: codFee,
        // TVA-ul si REGIMUL de preturi: emailul trebuie sa stie nu doar cifra, ci
        // si daca ea se aduna in coloana. La preturi cu TVA inclus e portiunea
        // extrasa din incasare — adunata, ducea coloana peste Total.
        vat_amount: vatAmount,
        vat_rate: vatEnabled ? vatRate : 0,
        vat_enabled: vatEnabled,
        prices_include_vat: pricesIncludeVat,
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
      // `!pesteRafala` pe amandoua: sub rafala comanda ramane scrisa, doar
      // instiintarile tac. Alternativa — sa refuzam comanda — ar fi facut din
      // rafala o negare de serviciu asupra vanzarilor comerciantului.
      const emailSender = await getStoreEmailSender(admin, data.business_id);
      await Promise.all([
        !pesteRafala && config.new_order !== false && notifyEmail
          ? sendNewOrderEmail(notifyEmail, emailPayload, emailSender)
          : null,
        !pesteRafala && data.customer_email
          ? sendOrderConfirmationToCustomer(data.customer_email, emailPayload, emailSender)
          : null,
      ].filter(Boolean));

      // notice.ro — new-order SMS (Procesare comanda / pending), opt-in per store. Fire-and-forget.
      // Se opreste primul sub rafala: se plateste din creditul comerciantului.
      if (!pesteRafala) void maybeSendNoticeNotification({
        businessId: data.business_id,
        orderId: order.id,
        triggerKey: "pending",
        phone: data.customer_phone,
        vars: {
          order: order.order_number, name: numeClient, total: formatPrice(total),
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
          name: numeClient,
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
          name: numeClient,
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
          name: numeClient,
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
          name: numeClient,
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
          name: numeClient,
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

/*
 * Instiintarile de schimbare de stare — plafonate. Schimbarea de stare, NU.
 *
 * `sendCustomerNotification` si `sendCustomerSms` si-au primit plafoanele, dar
 * `updateOrder` trimite pe EXACT aceleasi doua canale si n-avea niciunul: emailul
 * de stare pleaca tot pe domeniul PLATFORMEI cand magazinul n-are SMTP propriu,
 * SMS-ul tot pe cheia magazinului, iar destinatarul e tot cel scris in comanda —
 * pe care apelantul si-l alege singur cu `updateOrderDetails`. Plimbata intre
 * doua stari valide (`pending` <-> `confirmed`), aceeasi comanda trimitea la
 * nesfarsit, si inca cu o bucata de text ales de apelant in mesaj: `awb` intra si
 * in corpul SMS-ului, si in email. Fara plafonul asta, cel de la mesajele manuale
 * se ocolea pur si simplu schimband functia apelata.
 *
 * Se opreste DOAR instiintarea: starea se salveaza oricum, facturarea automata si
 * marcarea „platit" in Mailchimp/Brevo nu se ating. Un plafon care refuza
 * actualizarea i-ar fi luat comerciantului panoul in loc sa apere pe cineva —
 * aceeasi regula ca la pragul de rafala pe magazin.
 *
 * Bugete separate de cele ale mesajelor manuale si mult mai largi: o comanda
 * adevarata trece prin cateva stari, nu prin douazeci, iar un comerciant care
 * bifeaza comenzi una cate una din panou nu ajunge la 200 pe ora. Cel pe comanda
 * e cel care taie bucla; cel pe cont opreste plimbarea intre comenzi.
 */
const STARI_PE_ORA = 200;
const STARI_PE_COMANDA = 20;

async function poateInstiintaStarea(userId: string, orderId: string): Promise<boolean> {
  const peOra = await consumaLimita(`stare-mesaj:${userId}`, STARI_PE_ORA, 3600);
  const peComanda = peOra.permis
    ? await consumaLimita(`stare-comanda:${orderId}`, STARI_PE_COMANDA, 86400)
    : { permis: false };
  if (peOra.permis && peComanda.permis) return true;
  // Alerta, de cel mult trei ori pe ora si pe cont: peste plafon ajung aici toate
  // incercarile urmatoare, si un rand de fiecare ar umple jurnalul.
  if ((await consumaLimita(`alerta-stare:${userId}`, 3, 3600)).permis) {
    logError({
      action: "updateOrder.instiintariOprite",
      message: "Plafon atins: starea s-a salvat, instiintarea catre client nu a mai plecat",
      details: { orderId, peOra: peOra.permis, peComanda: peComanda.permis },
      userId,
      severity: "warning",
    });
  }
  return false;
}

export async function updateOrder(orderId: string, data: { status: string; payment_status: string; awb?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  /*
   * Statusul se verifica pe lista, si AWB-ul se taie: amandoua ajung in TEXTUL
   * mesajelor care pleaca spre client.
   *
   * `defaultStatusSms` scrie `STATUS_SMS_LABELS[status] ?? status`, deci un status
   * nerecunoscut se copiaza ca atare in corpul SMS-ului; `awb` intra si in SMS, si
   * in emailul de stare, si nu-l trimite NICIUN apelant din panou — vine doar
   * dintr-un POST direct pe actiune. Adica exact cele doua bucati de text pe care
   * si le-ar alege cineva care vrea sa foloseasca instiintarile ca releu.
   * `bulkUpdateOrderStatus` verifica statusul de mult, pe aceeasi lista.
   */
  if (!(data.status in ORDER_STATUS)) return { error: "Status invalid." };
  const awb = data.awb?.trim().slice(0, 64) || undefined;

  const { data: order } = await supabase
    .from("orders")
    .select("business_id, order_number, customer_name, customer_email, customer_phone, total, status, payment_status, shipping_address, payment_method, created_at, items, order_source, discount_code")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id, business_name, store_name, slug").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };
  const storeName = biz.store_name || biz.business_name;

  /*
   * STATUSUL, CUPONUL SI STOCUL — INTR-O SINGURA TRANZACTIE.
   *
   * Erau trei drumuri separate la baza: un UPDATE, apoi `release_order_discount`,
   * apoi `elibereaza_stoc_comanda`. Fiecare putea sa pice singur, iar apelul de
   * aici nici nu se uita la eroare (`const { data: fel } = await ...`, fara
   * `error`). Rezultatul unei picari: comanda anulata, marfa inca rezervata,
   * raspuns de SUCCES si NICIO urma nicaieri.
   *
   * Regulile („vanzarea se intoarce", „vanzarea se reia") au plecat si ele in
   * baza. Se calculau aici din statusul citit cu cateva dus-intorsuri inainte, iar
   * intre citire si scriere statusul se putea schimba din panou, dintr-un lot sau
   * dintr-un webhook de plata — si atunci se elibera stoc pentru o intoarcere care
   * nu mai avea loc. Acum se citesc sub `for update`, langa scriere.
   *
   * Autorizarea RAMANE aici: functia e `security definer` si se cheama abia dupa
   * ce `businesses ... eq(user_id)` de mai sus a confirmat ca magazinul e al lui.
   */
  const adminTranzitie = createAdminClient();
  const { data: tranzitie, error } = await adminTranzitie.rpc("aplica_tranzitia_comenzii" as never, {
    p_order_id: orderId,
    p_status: data.status,
    p_payment_status: data.payment_status,
    // Apartenenta e deja verificata mai sus, cu clientul utilizatorului sub RLS.
    // Se trimite si aici fiindca nu costa nimic si inchide drumul daca vreodata
    // verificarea de deasupra se muta sau se pierde la o refactorizare.
    p_business_id: order.business_id,
  } as never);

  if (error) {
    logError({ action: "updateOrder", message: error.message, details: { code: error.code, hint: error.hint, orderId }, userId: user.id, severity: "critical" });
    return { error: "Eroare la actualizare." };
  }

  const t = tranzitie as unknown as {
    gasit?: boolean; status_vechi?: string; plata_veche?: string;
    status_schimbat?: boolean; plata_schimbata?: boolean;
    cupon?: string; stoc?: string; negative?: unknown[];
  } | null;

  /*
   * Raspuns de alta forma inseamna ca NU stim ce s-a intamplat — nici macar daca
   * s-a scris ceva. Se opreste aici, cu jurnal: mai departe ar pleca emailuri si
   * SMS-uri catre client despre o schimbare care poate n-a avut loc.
   */
  if (!t || t.gasit !== true) {
    logError({ action: "updateOrder", message: t?.gasit === false ? "comanda a disparut intre verificare si scriere" : "raspuns de forma neasteptata la tranzitie", details: { orderId, raspuns: t }, businessId: order.business_id, userId: user.id, severity: "critical" });
    return { error: "Eroare la actualizare." };
  }

  const statusVechi = t.status_vechi ?? (order.status as string);
  const statusChanged = t.status_schimbat === true;
  const paymentChanged = t.plata_schimbata === true;

  // „necunoscut" = comanda plasata inainte sa existe `stoc_rezervat`. Nu se
  // ghiceste din `items` (pachetele nu-si scriu componentele acolo), deci ramane
  // o urma in loguri si comerciantul poate corecta de mana.
  if (t.stoc === "necunoscut") {
    logError({ action: "updateOrder.elibereazaStoc", message: "Comanda e dinainte de inregistrarea stocului rezervat; stocul NU s-a dat inapoi automat.", details: { orderId }, businessId: order.business_id, userId: user.id, severity: "warning" });
  }
  if (Array.isArray(t.negative) && t.negative.length > 0) {
    logError({ action: "updateOrder.revendicaStoc", message: "Reactivarea comenzii a dus stocul sub zero: marfa s-a vandut altcuiva intre timp.", details: { orderId, negative: t.negative }, businessId: order.business_id, userId: user.id, severity: "warning" });
  }
  // „plin" = intre timp cuponul si-a atins limita: comanda ramane valida, dar
  // peste limita, si asta trebuie sa se vada undeva.
  if (t.cupon === "plin") {
    logError({ action: "updateOrder.reclaimDiscount", message: "Cuponul si-a atins limita intre anulare si reactivare; comanda ramane cu reducerea, necontorizata.", details: { orderId, code: order.discount_code }, businessId: order.business_id, userId: user.id, severity: "warning" });
  }

  /*
   * GA4: rambursarea se raporteaza pe statusul VECHI intors de baza, nu pe cel
   * citit mai sus. Sunt aceleasi in cazul obisnuit, dar cand nu sunt, cel din
   * baza e cel adevarat — si atunci evenimentul ar fi plecat pentru o intoarcere
   * care nu s-a produs, sau ar fi lipsit pentru una care s-a produs.
   */
  const GA4_REVERSAL = new Set(["refunded", "cancelled"]);
  if (statusChanged && GA4_REVERSAL.has(data.status) && !GA4_REVERSAL.has(statusVechi)) {
    const refundItems = Array.isArray(order.items) ? (order.items as { product_id?: string; name: string; price: number; quantity: number }[]) : [];
    const gaClientId = (order.order_source as { ga_client_id?: string } | null)?.ga_client_id;
    void ga4OrderEvent(order.business_id, "refund", { transactionId: orderId, value: order.total ?? 0, clientId: gaClientId, items: refundItems });
  }

  /*
   * Bugetul instiintarilor se consuma o singura data pe apel, si numai cand chiar
   * ar pleca ceva: o comanda fara email si fara telefon n-are de ce sa arda din
   * el, iar un apel care nu schimba nimic nu trimite oricum nimic.
   */
  const poateInstiinta = (statusChanged || paymentChanged) && (order.customer_email || order.customer_phone)
    ? await poateInstiintaStarea(user.id, orderId)
    : false;

  // Send status change email to customer
  if (poateInstiinta && statusChanged && order.customer_email) {
    const emailSender = await getStoreEmailSender(createAdminClient(), order.business_id);
    sendOrderStatusToCustomer(order.customer_email, {
      order_number: order.order_number,
      customer_name: order.customer_name,
      total: order.total,
      status: data.status,
      business_name: storeName,
      awb,
      store_url: biz.slug ? `${STORE_BASE_URL}/${biz.slug}` : undefined,
    }, emailSender).catch(() => {});
  }

  // Send status change SMS to customer (opt-in per store via SMSO)
  if (poateInstiinta && statusChanged && order.customer_phone) {
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
          awb,
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
      awb: awb ?? "",
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
    // `poateInstiinta` doar pe SMS-urile platite; marcarea „platit" din
    // Mailchimp/Brevo de mai jos NU e o instiintare si ramane neatinsa.
    if (statusChanged) {
      const tk = noticeTriggerForStatus(data.status);
      if (poateInstiinta && tk) void maybeSendNoticeNotification({ businessId: order.business_id, orderId, triggerKey: tk, phone: order.customer_phone, vars: noticeVars });
    }
    if (paymentChanged) {
      const tk = noticeTriggerForPayment(data.payment_status);
      if (poateInstiinta && tk) void maybeSendNoticeNotification({ businessId: order.business_id, orderId, triggerKey: tk, phone: order.customer_phone, vars: noticeVars });
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

export interface ProdusPentruEditare {
  id: string;
  name: string;
  price: number;
  stock_quantity: number | null;
  track_inventory: boolean;
  is_bundle: boolean;
  /** `null` cand produsul nu e variabil; altfel optiunile si combinatiile active. */
  variante: VarianteSlim | null;
  /** Configuratia bruta de trepte, ca panoul sa arate acelasi pachet ca magazinul. */
  trepte: unknown;
}

export async function searchOrderProducts(businessId: string, query: string): Promise<
  { products: ProdusPentruEditare[] } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  let q = supabase.from("products")
    // `page_sections` intra ca sa se poata alege o VARIANTA din panou. Nu pleaca
    // spre browser: se slabeste mai jos la titlu + pret + stoc (vreo doua sute
    // de octeti in loc de o mie cinci sute pe produs).
    .select("id, name, price, stock_quantity, track_inventory, is_bundle, page_sections")
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
      variante: slabesteVariante(p.page_sections, round2(Number(p.price))),
      trepte: (p.page_sections as { quantity_tiers?: unknown } | null)?.quantity_tiers ?? null,
    })),
  };
}

/**
 * Reglajele de care are nevoie previzualizarea din modalul de editare.
 *
 * Fara ele, modalul isi facea propria socoteala — `order.total + suma adaugata` —
 * si numea alt numar decat cel pe care il scria serverul: pe comanda #0065 arata
 * 193,00 acolo unde serverul scria 173,00, fiindca adaugarea trecea pragul de
 * livrare gratuita. Cifra aia nu e decorativa: pe ea scria „diferenta de X nu se
 * incaseaza automat", iar rambursul de pe AWB se ia din totalul serverului.
 *
 * Aceeasi verificare de proprietate ca la `searchOrderProducts`: sunt reglajele
 * magazinului propriu, pe care comerciantul le vede oricum in Setari.
 */
export async function getOrderEditContext(businessId: string): Promise<
  {
    vat_enabled: boolean;
    vat_rate: number;
    prices_include_vat: boolean;
    free_shipping_threshold: number | null;
    cod_fee_config: unknown;
  } | { error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase.from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  const { data: cfg } = await supabase
    .from("store_settings")
    .select("vat_enabled, vat_rate, prices_include_vat, free_shipping_threshold, cod_fee_config")
    .eq("business_id", businessId)
    .single();

  return {
    vat_enabled: cfg?.vat_enabled ?? false,
    vat_rate: Number(cfg?.vat_rate ?? 19),
    prices_include_vat: cfg?.prices_include_vat ?? true,
    free_shipping_threshold: cfg?.free_shipping_threshold != null ? Number(cfg.free_shipping_threshold) : null,
    cod_fee_config: cfg?.cod_fee_config ?? null,
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
  added_items?: { product_id: string; variant_title?: string | null; quantity: number }[];
  /**
   * Transportul re-cotat din panou, cand comerciantul schimba destinatia.
   * Acceptat DOAR insotit de semnatura primita de la `getShippingOptions`.
   */
  shipping_cost?: number;
  shipping_token?: string;
  /** Eticheta cotatiei re-cerute. Face parte din semnatura, deci se confrunta. */
  courier_label?: string;
}): Promise<{ success: true; newTotal: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, business_id, status, payment_status, payment_method, customer_name, billing_company, items, subtotal, total, shipping_address, shipping_cost, discount_amount, card_discount_amount, cod_discount_amount, cod_fee_amount, vat_rate, smartbill_invoice_number, oblio_invoice_number, fgo_invoice_number, woot_awb_number, sameday_awb_number, cargus_awb_number, dpd_awb_number, fan_courier_awb_number, colete_awb_number")
    .eq("id", orderId)
    .single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  if (order.status === "cancelled" || order.status === "refunded") {
    return { error: "Comenzile anulate sau rambursate nu pot fi editate." };
  }

  /*
   * Numele clientului, taiat la 120 — dar NUMAI cand chiar se schimba.
   *
   * Ambele cai de comanda il taie de la intrare (vezi `placeOrder`); aici era
   * singura scriere ramasa fara plafon, si de aici numele pleaca mai departe pe
   * AWB, pe factura si in emailuri, exact ca de acolo.
   *
   * Conditia nu e cosmetica: taiat neconditionat, un nume vechi de peste 120 de
   * caractere ar fi fost SCURTAT tacit pe o comanda careia comerciantul ii repara
   * doar telefonul — si scurtat exact pe comenzile cu factura Oblio, unde garda de
   * mai jos exista tocmai ca titularul sa nu se schimbe. Nemiscat, se scrie
   * inapoi aceeasi valoare; miscat, se scrie una plafonata.
   */
  const numeCerut = data.customer_name.trim();
  const name = numeCerut === order.customer_name ? numeCerut : numeCerut.slice(0, 120);
  const phone = data.customer_phone.trim();
  const address = data.address.trim();
  const city = data.city.trim();
  const county = data.county.trim();
  if (!name || !phone) return { error: "Numele si telefonul clientului sunt obligatorii." };
  if (!address || !city || !county) return { error: "Adresa, orasul si judetul sunt obligatorii." };

  /*
   * COMANDA FACTURATA: datele se pot corecta, BANII nu.
   *
   * Documentul fiscal a plecat deja spre client si spre contabilitate cu un
   * total anume. Pana acum functia nici nu citea numerele de factura, deci se
   * putea adauga marfa peste o factura emisa si aceasta ramanea la vechiul
   * total, in tacere.
   *
   * Blocarea NU e totala, si asta e deliberat: 42 din cele 47 de comenzi
   * facturate din productie sunt deja expediate, iar acolo corectarea unui
   * telefon gresit e chiar lucrul care salveaza livrarea. Se blocheaza numai ce
   * misca banii — adaugarea de produse si schimbarea transportului.
   *
   * Proformele nu intra: nu sunt documente fiscale.
   */
  const numarFactura = order.smartbill_invoice_number || order.oblio_invoice_number || order.fgo_invoice_number;
  const cereProduse = (data.added_items ?? []).some((i) => i?.product_id && Number(i.quantity) > 0);
  const cereTransport = data.shipping_cost != null;
  if (numarFactura && (cereProduse || cereTransport)) {
    return { error: `Comanda are factura ${numarFactura}. Suma facturata nu se mai poate schimba din panou. Emite storno la furnizorul de facturare, apoi fa o comanda noua pentru diferenta.` };
  }
  // `stornoOblioInvoice` reconstruieste titularul din randul VIU al comenzii,
  // deci nota de credit ar iesi pe alt nume decat factura pe care o storneaza.
  // Pe comenzile PE FIRMA titularul e firma, nu persoana de contact, deci acolo
  // numele se poate corecta linistit — altfel o litera gresita in numele celui
  // care a comandat ar fi blocat si corectarea adresei.
  if (order.oblio_invoice_number && !order.billing_company && name !== order.customer_name) {
    return { error: `Comanda are factura Oblio ${order.oblio_invoice_number}. Numele clientului nu se mai poate schimba, altfel stornarea ar iesi pe alt titular.` };
  }
  if (numarFactura) {
    logError({
      action: "updateOrderDetails.editedInvoiced",
      message: "Order with a fiscal invoice was edited (customer data only)",
      details: { orderId, numarFactura },
      userId: user.id,
      severity: "warning",
    });
  }

  // Refuse to touch a row whose items are not the expected array — appending
  // onto a corrupt value would silently replace the customer's original items.
  if (!Array.isArray(order.items)) {
    logError({ action: "updateOrderDetails", message: "orders.items is not an array", details: { orderId }, userId: user.id, severity: "warning" });
    return { error: "Structura comenzii nu permite editarea. Contacteaza suportul." };
  }
  const prevItems = order.items as unknown[];

  const admin = createAdminClient();

  /*
   * Produsele adaugate se repretuiesc din catalogul VIU, prin ACELEASI motoare
   * pe care le folosesc cele doua cai de comanda: combinatiile pentru variante
   * si treptele pentru pachete. Pana acum functia citea doar `price`, deci un
   * produs variabil intra la pretul de baza, fara marime, iar treptele nu
   * existau deloc.
   */
  const ids = [...new Set((data.added_items ?? []).map((i) => i?.product_id).filter((x): x is string => !!x))];
  let plan: { items: unknown[]; deltaSubtotal: number; adaugate: { product_id: string; variant_title: string | null; quantity: number }[] } = {
    items: prevItems, deltaSubtotal: 0, adaugate: [],
  };
  let decrements: { product_id: string; quantity: number }[] = [];

  if (ids.length > 0) {
    const { data: products } = await admin.from("products")
      .select("id, name, price, is_active, is_bundle, page_sections")
      .in("id", ids)
      .eq("business_id", order.business_id);
    const live = new Map((products ?? []).filter((p) => p.is_active).map((p) => [p.id as string, p]));
    if (ids.some((id) => !live.has(id))) {
      return { error: "Unul dintre produsele adaugate nu mai este disponibil. Reincarca pagina si incearca din nou." };
    }

    const catalog = new Map<string, CatalogEdit>(
      [...live.entries()].map(([id, p]) => [id, {
        name: String(p.name),
        price: round2(Number(p.price)),
        is_bundle: !!p.is_bundle,
        variante: slabesteVariante(p.page_sections, round2(Number(p.price))),
        trepte: (p.page_sections as { quantity_tiers?: unknown } | null)?.quantity_tiers ?? null,
      }]),
    );

    const rezultat = planificaAdaugarea(prevItems, data.added_items ?? [], catalog);
    if ("error" in rezultat) return { error: rezultat.error };
    plan = rezultat;

    // Stocul DECLARAT pe combinatie, cu acelasi ajutor ca ambele cai de comanda.
    const eroareStoc = eroareStocPeVarianta(
      new Map([...live.entries()].map(([id, p]) => [id, comboStockMap(p.page_sections)])),
      plan.adaugate,
    );
    if (eroareStoc) return { error: eroareStoc };

    // Stocul de produs se verifica si se scade DOAR pe cantitatea adaugata, si
    // dupa contopire: altfel componentele pachetelor s-ar scadea a doua oara.
    const stockExp = await expandBundleStock(admin, order.business_id, plan.adaugate.map((a) => ({ product_id: a.product_id, quantity: a.quantity })));
    if ("error" in stockExp) {
      logError({ action: "updateOrderDetails.bundleStock", message: stockExp.motiv, details: { businessId: order.business_id, componenta: stockExp.componenta }, severity: "warning" });
      return { error: stockExp.error };
    }
    decrements = stockExp.decrements;
  }

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
    .select("vat_enabled, vat_rate, prices_include_vat, free_shipping_threshold, cod_fee_config")
    .eq("business_id", order.business_id)
    .single();

  // Subtotalul se muta cu DIFERENTA, nu se recalculeaza din linii. `placeOrder`
  // scrie acum pretul unitar nerotunjit, ca si celelalte doua cai, deci pe
  // comenzile noi suma liniilor da chiar subtotalul — dar comenzile de dinainte
  // poarta in continuare pretul rotunjit si difera cu un ban. Si oricum, o linie
  // de oferta nu se poate re-deriva din catalog. Cu diferenta, zero adaugari
  // inseamna exact zero schimbare.
  const newSubtotal = round2(Number(order.subtotal) + plan.deltaSubtotal);

  // Extraoptiunile stau in `items` ca linii `extra_*` si NU intra in `subtotal`.
  const extrasTotal = sumaExtraoptiunilor(prevItems);

  const vatCfg = {
    vat_enabled: cfgRow?.vat_enabled ?? false,
    /*
     * Cota INGHETATA la vanzare, cand comanda are una.
     *
     * Coloana `orders.vat_rate` exista tocmai ca sa tina cota de atunci. Luata
     * din setarile de azi, o comanda vanduta cu 19% ar fi capatat 21% pentru ca
     * s-a schimbat legea sau pentru ca si-a corectat comerciantul o cifra —
     * si-ar fi capatat-o cand cineva intra doar sa repare un numar de telefon.
     * Aceeasi regula ca la facturare, chemata din acelasi loc (`invoiceVat`):
     * cota comenzii, altfel a magazinului. Scrisa aici a doua oara, ar fi apucat
     * pe alt drum — s-a mai intamplat de trei ori in proiectul asta.
     */
    vat_rate: invoiceVat(order, {
      vat_enabled: cfgRow?.vat_enabled ?? false,
      vat_rate: cfgRow?.vat_rate ?? 19,
      // Regimul comenzii, nu al facturii: aici se recalculeaza TOTALUL comenzii,
      // deci `taxIncluded` de la `invoiceVat` NU are ce cauta mai jos.
      prices_include_vat: cfgRow?.prices_include_vat ?? true,
    }).rate,
    // `true`, ca la plasare. Nu misca nimic azi (coloana e NOT NULL si
    // `vat_enabled` scurtcircuiteaza), dar doua rezerve diferite pentru acelasi
    // camp sunt o capcana pusa la pastrare.
    prices_include_vat: cfgRow?.prices_include_vat ?? true,
  };

  /*
   * Taxa de ramburs PROCENTUALA se recalculeaza; cea fixa se pastreaza.
   *
   * Baza taxei e chiar marfa care tocmai s-a schimbat, deci lasata inghetata ea
   * ar fi ramas procentul din cosul de acum o saptamana. Suma fixa, in schimb,
   * nu depinde de marfa: recitita din setari, ar fi schimbat tacit o suma pe
   * care clientul a acceptat-o la plasare.
   *
   * Cota se ia DIN COMANDA, nu din setarile de azi: taxa se scaleaza cu baza,
   * pastrand exact procentul convenit atunci. Recitita din configuratie, ar fi
   * fost procentul de acum — iar comerciantul care si-a urcat taxa de la 2% la
   * 5% intre timp ar fi taxat retroactiv o comanda veche, sau, oprind-o, ar fi
   * sters o taxa pe care clientul o acceptase deja.
   *
   * Baza scade DOAR cuponul, ca la plasare — nu se foloseste `vatBase`, care
   * scade si reducerea de card, si pe cea de ramburs.
   *
   * Trei conditii inainte de a misca ceva: marfa chiar s-a schimbat, comanda
   * chiar avea o taxa, si baza veche e pozitiva. Asa taxa nu poate nici sa
   * apara pe o comanda care n-a avut-o, nici sa dispara de pe una care a avut-o.
   * Comenzile din marketplace nu sunt atinse: n-au avut niciodata taxa de
   * ramburs, oricat de „cash_on_delivery" ar parea metoda lor de plata.
   */
  const cfgTaxa = parseCodFeeConfig(cfgRow?.cod_fee_config);
  const taxaVeche = round2(Number(order.cod_fee_amount) || 0);
  const bazaVeche = round2(Number(order.subtotal) + extrasTotal - (Number(order.discount_amount) || 0));
  const bazaNoua = round2(newSubtotal + extrasTotal - (Number(order.discount_amount) || 0));
  const codFee = cfgTaxa.type === "percent" && plan.deltaSubtotal !== 0 && taxaVeche > 0 && bazaVeche > 0
    ? round2(taxaVeche * (bazaNoua / bazaVeche))
    : taxaVeche;

  /*
   * Transportul re-cotat, cand comerciantul muta comanda in alt judet.
   *
   * Nu se re-coteaza aici: ar insemna un apel la API-ul curierului exact in
   * pasul cu banii, iar niciuna din cele sase biblioteci de curieri nu stie de
   * `AbortSignal`. Cotatia se cere din panou, cu acelasi endpoint public pe care
   * il foloseste magazinul, si vine inapoi SEMNATA. Fara semnatura valabila
   * pentru noua destinatie, ramane costul de azi — adica purtarea de pana acum.
   */
  const prevShip = (order.shipping_address ?? {}) as Record<string, unknown>;
  const areAwb = !!(order.woot_awb_number || order.sameday_awb_number || order.cargus_awb_number
    || order.dpd_awb_number || order.fan_courier_awb_number || order.colete_awb_number);
  let shippingDeBaza = Math.max(0, round2(Number(order.shipping_cost) || 0));
  let etichetaNoua: string | null = null;
  if (data.shipping_cost != null) {
    const cerut = Math.max(0, round2(Number(data.shipping_cost)));
    /*
     * Semnatura acopera optiunea INTREAGA, deci se confrunta cu ea intreaga.
     *
     * Eticheta face parte din amprenta, si ea nu e niciodata goala la semnare
     * („Livrare prin Cargus", „Sameday EasyBox (locker)", „DPD International
     * (Germania)"). Verificata fara ea, partea a noua a amprentei iesea sir gol
     * si semnatura nu batea NICIODATA: re-cotarea din panou se arunca tacit la
     * fiecare incercare, iar comerciantul vedea „Comanda a fost actualizata"
     * peste transportul vechi.
     *
     * Vine de la client fara grija: fiind semnata, o eticheta nepotrivita nu
     * poate decat sa strice verificarea. NU se deduce din comanda — eticheta
     * salvata e a destinatiei VECHI, iar o mutare in alta tara ar compara
     * „Livrare prin DPD" cu „DPD International (Germania)".
     */
    const semnaturaBuna = verifyShippingQuote(order.business_id, { county, city }, cerut, data.shipping_token, {
      courier: typeof prevShip.courier === "string" ? prevShip.courier : undefined,
      deliveryType: prevShip.delivery_type === "locker" ? "locker" : "address",
      courierLabel: data.courier_label,
      /*
       * Aceeasi intrebare ca la checkout, dar din alta sursa — si trebuie sa fie
       * ACEEASI sursa ca la cerere, altfel re-cotarea din panou moare tacit, cum
       * a mai murit o data cand se verifica fara eticheta.
       *
       * Panoul cere cotatia cu `cod: rambursDeIncasat(...)`, adica dupa BANI, nu
       * dupa metoda: o comanda cu card ramasa neplatita pleaca oricum cu ramburs
       * la curier. Deci si aici se raspunde cu acelasi ajutor, nu cu
       * `isCodPaymentMethod`. `order.total` in loc de totalul nou: steagul e doar
       * „> 0", iar `sePoateAplica` de mai jos cere oricum o comanda neplatita.
       */
      ramburs: rambursDeIncasat({ payment_status: order.payment_status, total: order.total }) > 0,
    });
    const sePoateAplica = semnaturaBuna
      && order.payment_status !== "paid"
      && !areAwb
      && !numarFactura
      // Transport zero inseamna livrare gratuita deja acordata (prag sau cupon):
      // comanda nu retine steagul, deci nu i-l putem lua inapoi pe ghicite.
      && shippingDeBaza > 0;
    if (sePoateAplica) {
      shippingDeBaza = cerut;
      // Eticheta insoteste pretul: mutata in alta tara, comanda ar fi ramas cu
      // „Livrare prin DPD" peste o expediere „DPD International (Germania)".
      etichetaNoua = data.courier_label?.trim() || null;
    } else {
      logError({
        action: "updateOrderDetails.shippingRejected",
        message: "Re-quoted shipping refused",
        details: { orderId, cerut, semnaturaBuna, paid: order.payment_status === "paid", areAwb, areFactura: !!numarFactura, shippingVechi: shippingDeBaza },
        userId: user.id,
        severity: "warning",
      });
    }
  }

  // Aceeasi formula, si aici si in previzualizarea din modal.
  const { total: newTotal, vatAmount, shipping: newShipping } = recalculeazaTotal({
    subtotal: newSubtotal,
    extras: extrasTotal,
    discount: Number(order.discount_amount) || 0,
    cardDiscount: Number(order.card_discount_amount) || 0,
    codDiscount: Number(order.cod_discount_amount) || 0,
    codFee,
    shipping: shippingDeBaza,
    freeShippingThreshold: cfgRow?.free_shipping_threshold != null ? Number(cfgRow.free_shipping_threshold) : null,
    vat: vatCfg,
  });

  // Merge the address into shipping_address WITHOUT touching courier/locker/
  // service keys — those belong to the checkout choice and the AWB flow.
  const newShip = {
    ...prevShip,
    county,
    city,
    address,
    ...(data.postal_code?.trim() ? { postal_code: data.postal_code.trim() } : {}),
    ...(etichetaNoua ? { courier_label: etichetaNoua } : {}),
  };

  // Stocul liniilor adaugate se revendica atomic INAINTE de scriere, ca la ambele
  // cai de comanda: `expandBundleStock` de mai sus doar citeste, iar scaderea de
  // dupa update lasa aceeasi fereastra — doi comercianti care adauga in acelasi
  // timp acelasi ultim produs treceau amandoi. Vezi `revendicaStocul`.
  const stoc = await revendicaStocul(admin, decrements, plan.adaugate);
  if (stoc.fel !== "revendicat") return { error: stoc.error };

  /*
   * ═══ MODIFICAREA SI REZERVAREA, INTR-O SINGURA TRANZACTIE ═══
   *
   * Erau doua scrieri: `UPDATE orders` cu liniile si totalurile noi, apoi
   * `adauga_stoc_rezervat`. Daca a doua pica, prima ramanea — stocul scazut,
   * liniile noi pe comanda, dar `stoc_rezervat` CEL VECHI, deci la anulare
   * liniile adaugate nu se mai puteau da inapoi. Si se raspundea `success: true`.
   *
   * Calculele raman in aplicatie; functia scrie doar ce a hotarat ea.
   */
  const { data: ed, error } = await admin.rpc("editeaza_comanda_atomic" as never, {
    p_order_id: orderId,
    p_business_id: order.business_id,
    p_patch: {
      customer_name: name,
      customer_phone: phone,
      customer_email: data.customer_email?.trim() || "",
      shipping_address: newShip,
      items: plan.items,
      subtotal: newSubtotal,
      shipping_cost: newShipping,
      cod_fee_amount: codFee,
      vat_amount: vatAmount,
      // Cota, nu doar suma. Fara ea, o comanda cu `vat_rate = 0` primea un
      // `vat_amount > 0` peste o cota ramasa zero, iar SmartBill o citea in
      // continuare ca „istorica". Aceeasi expresie ca la plasare.
      vat_rate: vatCfg.vat_enabled ? vatCfg.vat_rate : 0,
      total: newTotal,
    },
    p_produse: stoc.fel === "revendicat" ? decrements : [],
    p_variante: stoc.fel === "revendicat" ? stocRezervat([], plan.adaugate).variante : [],
  } as never);

  const rezEd = ed as { gasit?: boolean; stoc_cunoscut?: boolean } | null;
  if (error || rezEd?.gasit !== true) {
    // Comanda n-a fost salvata, deci stocul rezervat pentru liniile adaugate se
    // da inapoi — altfel marfa ramane scazuta pentru linii care nu exista.
    if (stoc.fel === "revendicat") await elibereazaStocul(admin, decrements, plan.adaugate);
    logError({ action: "updateOrderDetails", message: error?.message ?? "editarea n-a raspuns valid", details: { code: error?.code, orderId, raspuns: rezEd }, businessId: order.business_id, userId: user.id, severity: "critical" });
    return { error: "Eroare la salvarea modificarilor." };
  }
  if (rezEd.stoc_cunoscut === false && stoc.fel === "revendicat") {
    // Comanda e dinainte de coloana `stoc_rezervat`: stocul s-a scazut, dar la
    // anulare nu se va putea da inapoi automat. Se vede, se corecteaza de mana.
    logError({ action: "updateOrderDetails.stocRezervat", message: "Comanda e dinainte de inregistrarea stocului rezervat; liniile adaugate NU se vor da inapoi automat la anulare.", details: { orderId }, businessId: order.business_id, userId: user.id, severity: "warning" });
  }


  // Google Merchant availability sync for the added items (mirrors placeOrder).
  // Stocul de produs SI cel de marime sunt deja scazute de revendicare.
  if (plan.adaugate.length > 0) {
    const atinse = [...new Set([...decrements.map((d) => d.product_id), ...plan.adaugate.map((a) => a.product_id)])];
    void enqueueGmcSyncMany(order.business_id, atinse);
    void enqueueOlxSyncMany(order.business_id, atinse);
    void enqueueAboutYouStockMany(order.business_id, atinse);
    void enqueueTrendyolInventoryMany(order.business_id, atinse);
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true, newTotal };
}

export async function deleteOrder(orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: order } = await supabase.from("orders").select("business_id, discount_code").eq("id", orderId).single();
  if (!order) return { error: "Comanda negasita" };

  const { data: biz } = await supabase.from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  /*
   * CUPONUL, STOCUL SI STERGEREA — ORI TOT, ORI NIMIC.
   *
   * Ordinea de pana acum era corecta ca intentie si periculoasa ca rezultat:
   *
   *     elibereaza cupon  -> reuseste
   *     elibereaza stoc   -> reuseste
   *     DELETE order      -> ESUEAZA
   *
   * si ramaneai cu o comanda care exista si al carei stoc fusese deja pus inapoi
   * pe raft — adica supravanzare, din chiar incercarea de a nu pierde marfa. Nu
   * se repara inversand ordinea: dupa DELETE nu mai stii CE sa dai inapoi
   * (`discount_id` si `stoc_rezervat` pleaca odata cu randul). Se repara punand
   * tot intr-o tranzactie.
   *
   * Si stergerea insasi era oarba in celalalt sens: un DELETE care nu prinde
   * niciun rand sub RLS NU intoarce eroare, deci `if (error)` nu se aprindea si
   * comanda ramanea, raportata ca stearsa. Functia spune daca a gasit-o.
   *
   * Autorizarea ramane mai sus (`businesses ... eq(user_id)`), inainte de orice
   * apel cu drepturi de serviciu.
   */
  const { data: sters, error } = await createAdminClient()
    .rpc("sterge_comanda" as never, { p_order_id: orderId, p_business_id: order.business_id } as never);
  if (error) {
    logError({ action: "deleteOrder", message: error.message, details: { code: error.code, orderId }, businessId: order.business_id, userId: user.id, severity: "critical" });
    return { error: "Eroare la stergerea comenzii." };
  }
  if ((sters as { gasit?: boolean } | null)?.gasit !== true) {
    logError({ action: "deleteOrder", message: "comanda n-a fost gasita la stergere", details: { orderId, raspuns: sters }, businessId: order.business_id, userId: user.id, severity: "warning" });
    return { error: "Comanda negasita" };
  }

  revalidatePath("/dashboard/orders");
  return { success: true };
}

/*
 * Plafoanele mesajelor catre client — email si SMS.
 *
 * Destinatarul e ales de apelant: comanda ii apartine, iar `updateOrderDetails`
 * ii rescrie `customer_email` cu ce vrea. Fara plafon, un cont nou isi publica un
 * magazin, isi plaseaza singur o comanda si trimite in bucla emailuri arbitrare
 * catre orice adresa — semnate SPF/DKIM de domeniul PLATFORMEI, fiindca fara SMTP
 * propriu se pleaca pe Resend-ul nostru. Reputatia arsa nu-l atinge pe el, ci
 * trimite in spam emailurile reale ale tuturor celorlalti comercianti. Exact
 * abuzul pentru care s-a inasprit /api/notifications/test („ERA UN RELEU DE EMAIL
 * DESCHIS"), doar ca acolo destinatarul e fixat si aici nu poate fi.
 *
 * Doua chei, nu una: pe UTILIZATOR se plafoneaza volumul, pe COMANDA se opreste
 * tinta unica — o comanda reala nu are nevoie de zeci de mesaje, iar altfel se
 * comuta intre comenzi si plafonul pe utilizator ramane singurul zid.
 */
const MESAJE_PE_ORA = 50;
const MESAJE_PE_COMANDA = 10;

export async function sendCustomerNotification(orderId: string, subject: string, message: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  // Prima linie, in memorie: taie bucla fara sa atinga baza. Cheia e pe cont, deci
  // cine o consuma se opreste singur pe el.
  if (!rateLimit(`mesajClient:${user.id}`, 10, 60_000)) {
    return { error: "Prea multe mesaje trimise. Asteapta un minut si incearca din nou." };
  }

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

  /*
   * Plafoanele durabile se consuma DUPA verificarea de proprietate.
   *
   * Puse mai sus, oricine putea arde contorul unei comenzi straine trimitand
   * cereri pe id-uri care nu-i apartin, si comerciantul adevarat ramanea fara
   * dreptul de a-si anunta clientul.
   */
  if (!(await consumaLimita(`mesaj-client:${user.id}`, MESAJE_PE_ORA, 3600)).permis) {
    return { error: "Ai trimis prea multe mesaje in ultima ora. Incearca mai tarziu." };
  }
  if (!(await consumaLimita(`mesaj-comanda:${orderId}`, MESAJE_PE_COMANDA, 86400)).permis) {
    return { error: "Prea multe mesaje pe aceasta comanda. Incearca maine." };
  }

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
  // Aceeasi prima linie ca la mesajul pe email, si acelasi buget pe cont mai jos:
  // numarul destinatarului vine tot dintr-o comanda pe care apelantul si-o poate
  // face singur, iar fiecare SMS pleaca pe cheia SMSO a magazinului.
  if (!rateLimit(`mesajClient:${user.id}`, 10, 60_000)) {
    return { error: "Prea multe mesaje trimise. Asteapta un minut si incearca din nou." };
  }

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

  // Plafoanele durabile, dupa verificarea de proprietate — vezi
  // `sendCustomerNotification`. Bugetul pe cont e COMUN celor doua canale: cine
  // il consuma pe email nu trebuie sa mai aiba unul intreg pe SMS.
  if (!(await consumaLimita(`mesaj-client:${user.id}`, MESAJE_PE_ORA, 3600)).permis) {
    return { error: "Ai trimis prea multe mesaje in ultima ora. Incearca mai tarziu." };
  }
  if (!(await consumaLimita(`sms-comanda:${orderId}`, MESAJE_PE_COMANDA, 86400)).permis) {
    return { error: "Prea multe SMS-uri pe aceasta comanda. Incearca maine." };
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
  /** Rambursul pentru care s-a cerut cotatia. Doar pentru masurare. */
  cod_declarat?: number;
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
  /**
   * NU SE CITESC. `discount_id` n-a fost citit niciodata, iar `discount_amount`
   * a plecat pe 2026-08-04 din singurul loc care il folosea (payload-ul de
   * email). Cuponul se re-valideaza integral pe server din `discount_code`, si
   * doar ce iese de acolo ajunge si in `orders`, si in emailuri.
   *
   * Raman declarate fiindca `OrderModal.tsx` si `checkout-core.ts` inca le
   * trimit; scoase de aici, `tsc` ar pica pe ele. Cine le sterge, sa le stearga
   * si de la apelanti — dar sa nu le RECITEASCA: un numar de reducere venit de
   * la browser nu are ce cauta langa un total calculat de server.
   */
  discount_id?: string;
  discount_amount?: number;
  /** Singurul camp de cupon citit: se re-valideaza cu `validateDiscount`. */
  discount_code?: string;
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
  // Al doilea strat, DURABIL, pe ACEEASI cheie ca la comanda din formular: vezi
  // `placeOrder`. Cele doua cai duc amandoua la aceleasi doua emailuri si acelasi
  // SMS platit, deci n-au voie sa aiba doua bugete separate.
  if (!(await consumaLimita(`comanda:ip:${ip}`, 40, 3600)).permis) {
    return { error: "Prea multe comenzi trimise de pe aceasta conexiune. Te rugam incearca mai tarziu." };
  }
  // An empty cart passes every check below (`some` on [] is false, subtotal 0),
  // so a direct call would insert a phantom order, send both emails and burn a
  // discount use. Only the UI guarded this; the action must guard it too.
  if (!data.items?.length) return { error: "Cosul este gol." };

  // Use admin client — customers are anonymous
  const admin = createAdminClient();

  // Numele clientului, taiat la 120 de caractere ca pe calea directa — acelasi
  // sir ajunge in baza, in subiectul emailului si in SMS. Vezi `placeOrder`.
  const numeClient = data.customer_name.trim().slice(0, 120);

  // Reload every product + store config; recompute all prices server-side.
  const productIds = [...new Set(data.items.map((i) => i.product_id))];
  const [{ data: dbProducts, error: eroareProduse }, { data: cfgRow, error: eroareCfg }] = await Promise.all([
    admin.from("products")
      // `name` se cere ca linia sa poarte numele din CATALOG, nu sirul din browser.
      .select("id, name, price, is_active, page_sections")
      .in("id", productIds)
      .eq("business_id", data.business_id),
    admin.from("store_settings")
      .select("payment_methods, stripe_config, netopia_config, ipay_config, klarna_config, revolut_config, page_content, free_shipping_threshold, min_order_amount, vat_enabled, vat_rate, prices_include_vat, card_discount_config, cod_discount_config, cod_fee_config, default_shipping_cost, shipping_zones")
      .eq("business_id", data.business_id)
      .single(),
  ]);

  // O interogare cazuta nu inseamna „produsul nu mai e disponibil": fara `error`
  // citit, orice pana de o secunda ii spunea clientului sa reincarce cosul, iar
  // reincarcarea nu repara nimic. Raspunsul corect e sa mai incerce.
  if (eroareProduse) {
    logError({ action: "placeCartOrder.productsUnavailable", message: eroareProduse.message, details: { businessId: data.business_id, productIds }, severity: "error" });
    return { error: "Nu am putut verifica produsele din cos. Te rugam incearca din nou in cateva momente." };
  }

  // Fara setari nu se poate spune ce metode ofera magazinul, iar garda de mai jos
  // ar refuza tocmai platile online — deci o pana de o secunda ar arata ca „metoda
  // nu mai e disponibila", si reincarcarea n-ar repara nimic.
  if (eroareCfg && cfgRow === null && eroareCfg.code !== "PGRST116") {
    logError({ action: "placeCartOrder.configUnavailable", message: eroareCfg.message, details: { businessId: data.business_id }, severity: "error" });
    return { error: "Nu am putut verifica setarile magazinului. Te rugam incearca din nou in cateva momente." };
  }

  // Aceeasi garda ca la comanda directa: metoda de plata se verifica fata de ce
  // ofera magazinul, nu doar fata de tabelul de coduri. Vezi `verificaMetodaPlata`.
  const metoda = verificaMetodaPlata(data.payment_method, cfgRow);
  if ("error" in metoda) {
    logError({ action: "placeCartOrder.paymentMethodRejected", message: "Payment method not offered by the store", details: { businessId: data.business_id, cerut: String(data.payment_method ?? "").slice(0, 40) }, severity: "warning" });
    return { error: metoda.error };
  }
  const metodaPlata = metoda.metoda;

  const activeProducts = (dbProducts ?? []).filter((p) => p.is_active);
  const priceMap = new Map(activeProducts.map((p) => [p.id, round2(Number(p.price))]));
  if (data.items.some((i) => !priceMap.has(i.product_id))) {
    logError({ action: "placeCartOrder.itemUnavailable", message: "Cart item missing/inactive for business", details: { businessId: data.business_id, productIds }, severity: "warning" });
    return { error: "Unul dintre produse nu mai este disponibil. Reincarca cosul." };
  }
  // Varianta ceruta trebuie sa existe SI produsul cu variante trebuie sa aiba una
  // aleasa. Verificarea sta acum in `pretulLiniei`, langa pret, ca sa nu mai poata
  // exista o cale prin care linia trece de poarta si se pretuieste altfel.
  const catalogLinii = new Map(activeProducts.map((p) => [p.id,
    { name: String(p.name ?? ""), price: round2(Number(p.price)), page_sections: p.page_sections }]));
  const eroareVar = eroareVarianta(catalogLinii, data.items);
  if (eroareVar) {
    logError({ action: "placeCartOrder.variantUnavailable", message: eroareVar, details: { businessId: data.business_id, productIds }, severity: "warning" });
    return { error: eroareVar };
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
  /*
   * Cantitatea se judeca AICI, o singura data, si de aici o iau toate cele trei
   * locuri: verificarea de stoc, pretul si scaderea stocului pe marime.
   * Endpointul e public, iar fara plafon orice defect de pret se inmulteste cu un
   * numar ales de client; plafonata doar la pret, s-ar fi scazut din stoc un
   * numar si s-ar fi incasat altul.
   *
   * Ce nu se incadreaza OPRESTE comanda. Filtrata, poarta se inchidea numai cand
   * picau TOATE liniile: cu trei in cos si una stricata, comanda pleca cu doua,
   * iar clientul n-avea de unde afla — pagina de confirmare randeaza ce a intrat,
   * iar cosul e golit imediat dupa.
   */
  const cerute = data.items.map((i) => ({ linie: i, ceruta: cantitateCeruta(i.quantity) }));
  const respinsa = cerute.find((c) => c.ceruta.fel !== "ok");
  if (respinsa) {
    const r = respinsa.ceruta as Exclude<typeof respinsa.ceruta, { fel: "ok" }>;
    logError({ action: "placeCartOrder.cantitateRespinsa", message: r.fel, details: { businessId: data.business_id, productId: respinsa.linie.product_id, quantity: String(respinsa.linie.quantity).slice(0, 40) }, severity: "warning" });
    // Aici numele autoritar nu e la indemana (interogarea nu cere coloana, si
    // numele clientului ajunge oricum in `orders.items`), deci se taie doar.
    return { error: mesajCantitate(r, String(respinsa.linie.name ?? "").slice(0, 60) || undefined) };
  }
  const liniiCerute = cerute.map((c) => ({ ...c.linie, quantity: (c.ceruta as { cantitate: number }).cantitate }));
  if (liniiCerute.length === 0) return { error: "Cosul este gol." };

  const eroareStoc = eroareStocPeVarianta(
    new Map(activeProducts.map((p) => [p.id, comboStockMap(p.page_sections)])),
    liniiCerute,
  );
  if (eroareStoc) return { error: eroareStoc };

  // Configuratia de trepte a fiecarui produs. `page_sections` e deja incarcat mai
  // sus pentru variante si stoc, deci treptele nu costa nicio interogare in plus.
  const trepteMap = new Map(
    activeProducts.map((p) => [p.id, (p.page_sections as { quantity_tiers?: unknown } | null)?.quantity_tiers]),
  );

  let validatedItems = liniiCerute.map((i) => {
    // Acelasi ajutor care a dat verdictul mai sus da si pretul: verificat si
    // pretuit de doua functii diferite, cele doua ajungeau sa nu mai spuna
    // acelasi lucru — chiar asta era defectul.
    const rezolvata = pretulLiniei(catalogLinii.get(i.product_id)!, i.variant_title);
    const unitPrice = rezolvata.fel === "ok" ? rezolvata.unitPrice : priceMap.get(i.product_id)!;
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
      // Numele din CATALOG, nu cel din browser: pana acum `orders.items[].name`
      // era un sir liber de la client, purtat mai departe pe factura si in
      // emailuri. Calea comenzii directe folosea de mult numele autoritar.
      name: rezolvata.fel === "ok" ? rezolvata.nume : String(i.name ?? "").slice(0, 200),
      price: linie.unitPrice,
      quantity: i.quantity,
    };
  });
  // Aceeasi re-evaluare ca la comanda directa, fara ancora: „cumparate frecvent
  // impreuna" se vinde numai din pagina produsului, deci un id de FBT revendicat
  // aici n-a fost niciodata aratat.
  const oferte = await applyOfferPricing(admin, data.business_id, data.accepted_offer_ids, validatedItems, {
    anchor: null,
    cuVariantaAleasa: new Set(liniiCerute.filter((i) => i.variant_title).map((i) => i.product_id)),
  });
  await jurnalizeazaOfertele(admin, data.business_id, oferte);
  if (oferte.error) return { error: oferte.error };
  validatedItems = oferte.items;
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
    /*
     * Cuponul respins OPRESTE comanda, nu se scoate in tacere.
     *
     * Fara ramura asta, un cupon devenit invalid intre completarea formularului
     * si trimitere (si-a atins limita, a expirat, l-a stins comerciantul, sau
     * marfa repretuita a cazut sub pragul lui) lasa `discountAmount` pe zero si
     * comanda intra cu totalul INTREG. Ecranul scria 350, curierul incasa 500.
     * Aceeasi situatie prinsa mai jos, la revendicare, intoarce deja eroare.
     */
    if (!dres.valid) return { error: dres.error };
      discountAmount = Math.min(dres.discount.discountAmount, subtotal);
      validDiscountId = dres.discount.id;
      isFreeShipping = dres.discount.type === "free_shipping";
  }

  // Recompute VAT from store config (mirrors MiniStoreRenderer) so it cannot be forged.
  const vatEnabled = cfgRow?.vat_enabled ?? false;
  const vatRate = Number(cfgRow?.vat_rate ?? 19);
  const pricesIncludeVat = cfgRow?.prices_include_vat ?? true;

  // Card-payment discount: only for online card methods, on the goods value
  // (subtotal + extras, after promo), never on shipping/VAT. Baked into total.

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

  const freeThreshold = cfgRow?.free_shipping_threshold != null ? Number(cfgRow.free_shipping_threshold) : null;
  // Livrarea gratuita se hotaraste INAINTE de verificare: browserul trimite zero,
  // dar tokenul lui e semnat pe pretul cotat al curierului, deci n-are cum sa bata.
  const esteGratuit = isFreeShipping || (freeThreshold !== null && subtotal >= freeThreshold);
  const shipping = autoritativeShipping(
    data.business_id,
    data.shipping_cost,
    data.shipping_token,
    { county: data.customer_county, city: data.customer_city, country: data.customer_country, postCode: data.customer_postal_code },
    cfgRow?.default_shipping_cost != null ? Number(cfgRow.default_shipping_cost) : null,
    {
      courier: data.selected_courier,
      deliveryType: data.delivery_type,
      courierLabel: data.courier_label,
      // Ca la comanda directa: regimul iese din metoda validata, nu din `cod`.
      ramburs: isCodPaymentMethod(metodaPlata),
    },
    (cfgRow?.shipping_zones ?? null) as Record<string, { enabled?: boolean; price?: number }> | null,
    esteGratuit,
  );

  // Aceeasi baza ca la comanda directa si ca in magazin: marfa, extraoptiunile si
  // TRANSPORTUL, dupa toate reducerile, plus taxa de ramburs. Vezi `vatBase`.
  // Blocul asta statea mai sus, INAINTE ca transportul sa fie calculat; de cand
  // transportul intra in baza, ordinea corecta e taxa de ramburs, transport, TVA.
  const { vatAmount, vatAddOn } = computeVat(
    vatBase({ goods: subtotal, extras: extrasTotal, shipping, discount: discountAmount, cardDiscount, codDiscount, codFee }),
    { vat_enabled: vatEnabled, vat_rate: vatRate, prices_include_vat: pricesIncludeVat },
  );

  const total = Math.max(0, round2(subtotal + extrasTotal - discountAmount - cardDiscount - codDiscount + codFee + shipping + vatAddOn));

  /*
   * Cat de mult a subdeclarat clientul rambursul la cotare — masurat, nu blocat.
   *
   * Semnatura leaga STEAGUL de ramburs, nu suma: suma nu se poate reconstrui,
   * fiindca e chiar totalul care contine transportul pe care tocmai il verificam.
   * La FAN Courier atat ajunge (pretul lui comuta pe un boolean), dar la ceilalti
   * cinci curieri comisionul iese din SUMA — deci cine cere cotatia cu `cod: 0.01`
   * si comanda apoi 5000 de lei pastreaza steagul, iar diferenta de comision o
   * plateste comerciantul.
   *
   * NU se refuza si NU se cade pe tariful implicit: asta ar repretui tacit o
   * comanda buna ori de cate ori clientul isi schimba cosul intre cotatie si
   * trimitere — adica exact defectul „ecranul spune una, se incaseaza alta" pe
   * care il vaneaza tot auditul. Se scrie in jurnal, ca sa se poata masura cat
   * costa cu adevarat inainte de a alege o garda mai dura.
   */
  /*
   * Se compara MARFA cu MARFA, nu marfa cu totalul.
   *
   * Amandoua formularele cer cotatia cu suma marfii, nu cu totalul: `OrderModal`
   * trimite subtotalul, iar checkout-ul totalul cosului, care nu contine
   * transportul. Comparat cu totalul final, pragul s-ar fi aprins pe aproape orice
   * comanda cu transport platit — 49 din 51 de comenzi ramburs din ultimele 30 de
   * zile — si jurnalul ar fi masurat propria noastra nepotrivire de unitati in loc
   * de subdeclarare.
   */
  const marfaIncasata = round2(subtotal + extrasTotal - discountAmount - cardDiscount - codDiscount);
  if (isCodPaymentMethod(metodaPlata) && Number(data.cod_declarat) > 0
      && marfaIncasata - round2(Number(data.cod_declarat)) > 1) {
    logError({
      action: "placeCartOrder.rambursSubdeclarat",
      message: `Cotatie ceruta pentru ${round2(Number(data.cod_declarat)).toFixed(2)} lei ramburs, marfa comenzii e ${marfaIncasata.toFixed(2)}`,
      details: { businessId: data.business_id, declarat: round2(Number(data.cod_declarat)), marfa: marfaIncasata, total: round2(total) },
      severity: "warning",
    });
  }


  // Bundle-aware stock: expand any bundle into its components + validate availability
  // before creating the order (prevents overselling components).
  const stockExp = await expandBundleStock(admin, data.business_id, validatedItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })));
  if ("error" in stockExp) {
    logError({ action: "placeCartOrder.bundleStock", message: stockExp.motiv, details: { businessId: data.business_id, componenta: stockExp.componenta }, severity: "warning" });
    return { error: stockExp.error };
  }

  /*
   * Prins aici, nu lasat sa iasa: o actiune de server care arunca ii da clientului
   * un ecran de eroare opac („An error occurred in the Server Components render"),
   * in loc de un mesaj din care sa inteleaga ca poate reincerca.
   *
   * Se cheama INAINTE de revendicarea stocului, deci o picare aici nu lasa marfa
   * rezervata pentru o comanda care n-a intrat.
   */
  let order_number: string;
  try {
    order_number = await buildOrderNumber(admin, data.business_id);
  } catch {
    return { error: "Nu am putut genera numarul comenzii. Reincearca peste cateva momente." };
  }

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
    /*
     * `error` VERIFICAT, si verdictul cerut EXPLICIT `true`.
     *
     * Era `const { data } = ...` cu `if (data === false)`. La o eroare de RPC,
     * `data` e `null`, iar `null === false` e FALS — deci checkout-ul mergea mai
     * departe, clientul primea reducerea, si utilizarea NU se revendica. Pe un
     * cupon cu `max_uses = 100`, o serie de erori il duce peste limita fara ca
     * nimic sa se vada.
     *
     * Acum orice altceva decat `true` opreste comanda. O reducere neacordata
     * pentru cateva secunde e o suparare; o campanie de 100 care serveste 130 e o
     * paguba, si una pe care o afli abia la socoteala.
     */
    const { data: revendicat, error: eCupon } = await admin.rpc("claim_discount_use" as never, { p_discount_id: validDiscountId } as never);
    if (eCupon) {
      logError({ action: "claimDiscountUse", message: eCupon.message, details: { code: eCupon.code, discountId: validDiscountId }, severity: "critical" });
      return { error: "Nu putem valida codul de reducere chiar acum. Reincearca peste cateva momente." };
    }
    if (revendicat !== true) {
      return { error: "Codul a atins limita maxima de utilizari. Reincarca pagina si incearca fara el." };
    }
  }

  // Ca la comanda din formular: stocul se revendica atomic inainte de inserare,
  // fiindca `expandBundleStock` doar citeste. Vezi `revendicaStocul`.
  const stoc = await revendicaStocul(admin, stockExp.decrements, liniiCerute);
  /*
   * `!== "revendicat"`, nu doar `=== "refuzat"`.
   *
   * „Refuzat" inseamna „nu mai e marfa" — un raspuns adevarat. „Esuat" inseamna
   * „n-am putut afla", si e nou: pana acum se numea `nerevendicat` si LASA comanda
   * sa treaca mai departe, pe algoritmul vechi. Amandoua opresc acum comanda si
   * dau cuponul inapoi; doar textul difera.
   */
  if (stoc.fel !== "revendicat") {
    if (validDiscountId) await admin.rpc("release_discount_use" as never, { p_discount_id: validDiscountId } as never);
    return { error: stoc.error };
  }

  const { data: order, error } = await admin.from("orders").insert({
    business_id: data.business_id,
    order_number,
    customer_name: numeClient,
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
    // Reducerea data de oferte sta DEJA in pretul liniilor; coloana o inregistreaza
    // ca sa existe o pista de audit. Fara ea, o reducere de oferta nu se poate
    // deosebi in `items` de o schimbare ulterioara a pretului de catalog, si nici
    // nu se putea dovedi ca nu s-a abuzat de vreo oferta.
    offer_discount_amount: oferte.savings,
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
    /* Vezi `placeOrder`: id-ul cuponului revendicat, ca utilizarea sa se poata da
     * inapoi cand comanda nu se mai face. `as never` din acelasi motiv. */
    discount_id: (validDiscountId ?? null) as never,
    /*
     * CU `variante` — si aici a stat o gaura, din chiar ziua reparatiei.
     *
     * Comentariul de dinainte spunea „fara variante: calea asta scade doar stocul
     * de PRODUS (nu cheama `scadeStoculVariantelor`)". Nu era adevarat: linia
     * exista cateva randuri mai jos si scadea marimile. Deci coada consuma XL, iar
     * `stoc_rezervat` nu-l pomenea — si la anulare `elibereaza_stoc_comanda` punea
     * inapoi produsul si NICIODATA marimea.
     *
     * Calea directa avea argumentul de la inceput; pe cea a cosului l-am uitat si
     * mi-am justificat omisiunea intr-un comentariu care era deja fals cand l-am
     * scris. Un comentariu gresit e mai rau decat lipsa lui: opreste pe urmatorul
     * din a se mai uita.
     */
    stoc_rezervat: stocRezervat(stockExp.decrements, liniiCerute) as never,
  }).select("id, order_number, total").single();

  if (error) {
    // Comanda n-a intrat: se dau inapoi si utilizarea cuponului, si stocul
    // rezervat. Vezi `placeOrder`.
    if (validDiscountId) await admin.rpc("release_discount_use" as never, { p_discount_id: validDiscountId } as never);
    if (stoc.fel === "revendicat") await elibereazaStocul(admin, stockExp.decrements, liniiCerute);
    logError({ action: "placeCartOrder", message: error.message, details: { code: error.code, hint: error.hint, businessId: data.business_id, itemCount: data.items.length }, severity: "critical" });
    return { error: "Eroare la plasarea comenzii. Incearca din nou." };
  }

  // Acelasi motiv ca pe calea directa: contorul se misca abia dupa ce comanda a
  // intrat cu adevarat.
  if (oferte.applied.length > 0) {
    try {
      after(() => scrieStatisticiOferte(admin, oferte.applied.map((id) => ({
        offerId: id, conversions: 1, revenue: oferte.venitPeOferta[id] ?? 0,
      }))));
    } catch { /* fara context de cerere (scripturi, teste) */ }
  }

  // Stocul — de produs si de marime — e deja scazut inainte de insert.

  // Reflect stock/availability changes in Google Merchant + OLX (if connected).
  void enqueueGmcSyncMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);
  void enqueueOlxSyncMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);
  void enqueueAboutYouStockMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);
  void enqueueTrendyolInventoryMany(data.business_id, [...stockExp.decrements.map((d) => d.product_id), ...data.items.map((i) => i.product_id)]);
  // Acelasi prag moale pe magazin ca la comanda din formular: peste el comanda se
  // salveaza, dar emailurile si SMS-ul nu mai pleaca. Vezi `pesteRafalaMagazinului`.
  const pesteRafala = await pesteRafalaMagazinului(admin, data.business_id, "placeCartOrder");

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
        customer_name: numeClient,
        customer_phone: data.customer_phone,
        customer_email: data.customer_email,
        total,
        subtotal,
        // Liniile pleaca CU `product_id`: dupa prefixul `extra_` isi recunoaste
        // emailul extraoptiunile, iar fara ele „Subtotal" din emailul
        // comerciantului nu se aduna cu lista de deasupra lui. Vezi `BaniComanda`.
        items: allItems.map(i => ({ product_id: i.product_id, name: i.name, quantity: i.quantity, price: i.price })),
        shipping_cost: shipping,
        /*
         * Reducerea si codul sunt ALE SERVERULUI: exact ce s-a scris in `orders`
         * mai sus, aceleasi doua expresii.
         *
         * Pana acum plecau `data.discount_amount` si `data.discount_code`, adica
         * numerele din cererea browserului, desi vecinele lor (`total`,
         * `cardDiscount`, `codFee`) erau recalculate de server. Baza si emailul
         * puteau deci sa se contrazica pe aceeasi comanda.
         *
         * Expunere MASURATA 2026-08-04: zero comenzi din 96 au `discount_amount`
         * peste zero, iar singurul cupon folosit vreodata (tonel-beauty #0003,
         * „PRIMA") e de tip `free_shipping`, adica are `discount_amount` 0 prin
         * constructie — deci si clientul si serverul duceau acelasi 0, si emailul
         * nu tiparea niciun rand. Nu s-a contrazis nimic pana acum.
         *
         * Varianta ostila era mai rea: `placeOrder` e export „use server" cu
         * adresa de destinatie aleasa de apelant, deci un `discount_amount:
         * 100000` fabricat tiparea „Reducere -100.000,00 lei" intr-un email
         * purtand numele unui magazin real.
         *
         * `data.discount_amount` si `data.discount_id` nu mai sunt citite acum
         * NICAIERI; raman in semnatura doar fiindca `OrderModal.tsx` si
         * `checkout-core.ts` inca le trimit.
         */
        discount_code: validDiscountId ? data.discount_code : undefined,
        discount_amount: discountAmount,
        card_discount_amount: cardDiscount,
        cod_discount_amount: codDiscount,
        cod_fee_amount: codFee,
        // TVA-ul si REGIMUL de preturi: emailul trebuie sa stie nu doar cifra, ci
        // si daca ea se aduna in coloana. La preturi cu TVA inclus e portiunea
        // extrasa din incasare — adunata, ducea coloana peste Total.
        vat_amount: vatAmount,
        vat_rate: vatEnabled ? vatRate : 0,
        vat_enabled: vatEnabled,
        prices_include_vat: pricesIncludeVat,
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
      // `!pesteRafala` pe amandoua: sub rafala comanda ramane scrisa, doar
      // instiintarile tac. Alternativa — sa refuzam comanda — ar fi facut din
      // rafala o negare de serviciu asupra vanzarilor comerciantului.
      const emailSender = await getStoreEmailSender(admin, data.business_id);
      await Promise.all([
        !pesteRafala && config.new_order !== false && notifyEmail
          ? sendNewOrderEmail(notifyEmail, emailPayload, emailSender)
          : null,
        !pesteRafala && data.customer_email
          ? sendOrderConfirmationToCustomer(data.customer_email, emailPayload, emailSender)
          : null,
      ].filter(Boolean));

      // notice.ro — new-order SMS (Procesare comanda / pending), opt-in per store. Fire-and-forget.
      // Se opreste primul sub rafala: se plateste din creditul comerciantului.
      if (!pesteRafala) void maybeSendNoticeNotification({
        businessId: data.business_id,
        orderId: order.id,
        triggerKey: "pending",
        phone: data.customer_phone,
        vars: {
          order: order.order_number, name: numeClient, total: formatPrice(total),
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
          name: numeClient,
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
          name: numeClient,
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
          name: numeClient,
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
          name: numeClient,
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
          name: numeClient,
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
