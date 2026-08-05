"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientFacturare, eSistem, type SistemClient } from "@/lib/invoicing-context";
import { autoInvoiceTriggerMatches } from "@/lib/invoicing";
import { logError } from "@/lib/error-logger";
import { invoiceParty } from "@/lib/billing/invoice-party";
import { baniiAuIntrat } from "@/lib/billing/incasare";
import { mentiuneRefacturare, slotFacturare, type SlotFacturare } from "@/lib/billing/refacturare";
import { invoiceVat, numeCota } from "@/lib/billing/invoice-vat";
import { codSiNatura } from "@/lib/billing/invoice-lines";
import { fetchSkuMap, type SursaCoduri } from "@/lib/billing/sku-map";
import { liniiSmartbill, mesajRefuz, pretDeDocument, reconciliazaComanda } from "@/lib/billing/reconcile";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

import { isCardPaymentMethod, PAYMENT_METHOD_DEFAULT_LABELS, type PaymentMethodType } from "@/lib/payment-methods";
import {
  getMerchantSeries,
  getMerchantTaxes,
  createMerchantInvoice,
  createMerchantEstimate,
  reverseMerchantInvoice,
  getEstimateInvoices,
  sendMerchantDocumentEmail,
  type SmartbillConfig,
  type MerchantInvoiceProduct,
  type MerchantInvoiceParams,
} from "@/lib/smartbill";

// ─── Shared helpers ────────────────────────────────────────────────────────

async function getConfigForBiz(businessId: string): Promise<SmartbillConfig | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  // Tokenul se citeste cu SERVICE ROLE: pentru `authenticated`, vederea
  // store_settings nu mai decripteaza, deci pe clientul utilizatorului am fi
  // trimis catre SmartBill sirul `enc.v1.…` in loc de token. Proprietatea e deja
  // verificata mai sus, deci ocolirea RLS de aici nu deschide alt magazin.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("smartbill_config").eq("business_id", businessId).single();

  const config = settings?.smartbill_config as SmartbillConfig | null;
  if (!config?.enabled || !config.email || !config.token || !config.company_vat_code) {
    return { error: "SmartBill nu este configurat complet." };
  }
  return config;
}

type OrderItem = { name: string; price: number; quantity: number; product_id?: string };
type ShippingAddress = { county?: string; city?: string; address?: string; country?: string };

// Numele complet al tarii pentru factura (shipping_address.country e cod ISO-2,
// setat doar la comenzile internationale; lipsa = Romania).
function countryNameFor(code: string | null | undefined): string {
  if (!code?.trim()) return "Romania";
  const c = code.trim();
  if (c.length !== 2) return c;
  try {
    return new Intl.DisplayNames(["ro"], { type: "region" }).of(c.toUpperCase()) ?? c;
  } catch {
    return c;
  }
}

async function buildInvoiceProducts(
  sursa: SursaCoduri,
  config: SmartbillConfig,
  order: {
    items: unknown;
    shipping_cost: unknown;
    discount_amount: unknown;
    discount_code: string | null;
    card_discount_amount?: unknown;
    cod_discount_amount?: unknown;
    cod_fee_amount?: unknown;
    vat_rate: unknown;
    total?: unknown;
    vat_amount?: unknown;
    order_number?: string | number;
    payment_status?: string | null;
  },
  pricesIncludeVat: boolean,
  vatEnabled: boolean,
  storeVatRate: number
): Promise<MerchantInvoiceProduct[] | { error: string }> {
  const items = (order.items as unknown as OrderItem[]) ?? [];
  const skus = await fetchSkuMap(sursa.supabase, sursa.businessId, items, (m) =>
    logError({ action: "billing.skuMap", message: m.message, details: { ...m.details, casa: "smartbill" }, severity: "warning" }));

  // Cota si regimul vin din regula COMUNA celor trei case de facturare, ca sa nu
  // mai raspunda fiecare altfel la aceeasi intrebare. Numele gol al cotei inseamna
  // „nu sunt platitor de TVA" si opreste taxarea, ca pana acum.
  const regim = invoiceVat(
    order,
    { vat_enabled: vatEnabled, vat_rate: storeVatRate, prices_include_vat: pricesIncludeVat },
    !!config.tax_name,
  );
  const { rate: effectiveVat, taxIncluded } = regim;

  // SmartBill cere NUMELE cotei, nu procentul, iar in configuratie sta doar numele:
  // procentul lui se afla abia din nomenclatorul contului. Numele se pastreaza cat
  // timp descrie chiar cota trimisa, altfel se cauta dupa procent. Pana acum numele
  // configurat castiga INTOTDEAUNA, deci pe o comanda veche la alta cota factura ar
  // fi plecat cu „Normala" scris langa procentul altei cote. Retea, best-effort.
  let taxName = config.tax_name;
  if (effectiveVat > 0) {
    const taxList = await getMerchantTaxes(config);
    if (!("error" in taxList) && taxList.length > 0) {
      const configurat = taxList.find(t => t.name === config.tax_name);
      // Un nume care nu e in cont n-are procent cunoscut, deci nu poate pretinde ca
      // se potriveste: -1 il trimite direct la cautarea dupa procent.
      taxName = numeCota(effectiveVat, { name: config.tax_name, percentage: configurat?.percentage ?? -1 }, taxList);
    }
  }

  const hasTax = effectiveVat > 0 && !!taxName;

  const taxFields = hasTax
    ? { taxName, taxPercentage: effectiveVat }
    : {};

  const products: MerchantInvoiceProduct[] = items.map(item => {
    // Extraoptiunile primesc cod si pleaca ca SERVICIU: ca linie de marfa fara cod
    // ele sunt chiar randul care nu exista in gestiune si blocheaza emiterea.
    const { code, esteServiciu } = codSiNatura(item, skus);
    return {
      name: item.name,
      ...(code ? { code } : {}),
      ...(esteServiciu ? { isService: true } : {}),
      measuringUnitName: "buc",
      currency: "RON",
      quantity: item.quantity,
      price: pretDeDocument(item.price),
      isTaxIncluded: taxIncluded,
      ...taxFields,
    };
  });

  if (Number(order.shipping_cost) > 0) {
    products.push({
      name: "Transport",
      code: "transport",
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: Number(order.shipping_cost),
      isTaxIncluded: taxIncluded,
      isService: true,
      ...taxFields,
    });
  }

  // Liniile de discount poarta aceleasi campuri de TVA ca produsele — altfel, la
  // platitorii de TVA cu preturi cu TVA inclus, SmartBill ar trata valoarea ca
  // neta (isTaxIncluded default false) si totalul facturii n-ar mai bate.
  if (Number(order.discount_amount) > 0) {
    products.push({
      isDiscount: true,
      name: `Discount${order.discount_code ? ` (${order.discount_code})` : ""}`,
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: 0,
      numberOfItems: products.length,
      discountType: 1,
      discountValue: -Math.abs(Number(order.discount_amount)),
      isTaxIncluded: taxIncluded,
      ...taxFields,
    });
  }

  // Reducerea la plata online e scazuta din orders.total la plasarea comenzii —
  // fara linia asta factura ar iesi mai mare decat suma platita de client.
  if (Number(order.card_discount_amount) > 0) {
    products.push({
      isDiscount: true,
      name: "Reducere plata online",
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: 0,
      numberOfItems: products.length,
      discountType: 1,
      discountValue: -Math.abs(Number(order.card_discount_amount)),
      isTaxIncluded: taxIncluded,
      ...taxFields,
    });
  }
  // Reducerea la plata ramburs — aceeasi logica, linie de discount separata.
  if (Number(order.cod_discount_amount) > 0) {
    products.push({
      isDiscount: true,
      name: "Reducere plata ramburs",
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: 0,
      numberOfItems: products.length,
      discountType: 1,
      discountValue: -Math.abs(Number(order.cod_discount_amount)),
      isTaxIncluded: taxIncluded,
      ...taxFields,
    });
  }
  // Taxa de ramburs e ADUNATA in orders.total, deci pe factura e o linie de
  // serviciu obisnuita, cu pret pozitiv — nu un discount. Trecuta ca discount cu
  // valoare negativa, ar fi aparut pe factura drept reducere de suma negativa.
  if (Number(order.cod_fee_amount) > 0) {
    products.push({
      name: "Taxa plata ramburs",
      // `code` si `isService` copiaza linia de Transport de mai sus, si nu din
      // simetrie: pe conturile SmartBill cu gestiune si „Foloseste cod produs"
      // activ, un rand de MARFA fara cod produs nu exista in gestiune si emiterea
      // esueaza. Pe calea automata esecul e mut (`maybeAutoGenerateInvoice`
      // intoarce false), deci comenzile cu taxa ar fi ramas tacut nefacturate.
      code: "taxa-ramburs",
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: Math.abs(Number(order.cod_fee_amount)),
      isTaxIncluded: taxIncluded,
      isService: true,
      ...taxFields,
    });
  }

  /*
   * Suma liniilor trebuie sa dea chiar `orders.total`.
   *
   * Nimeni nu punea intrebarea asta, iar `paymentAtIssue` trimite totalul comenzii
   * ca INCASARE: pe o comanda stricata, factura pleca cu o suma si incasarea cu
   * alta. Rotunjirea de pe document se ABSOARBE printr-o linie de ajustare; ce nu
   * se poate explica prin rotunjire opreste emiterea.
   */
  const rec = reconciliazaComanda(liniiSmartbill(products), order, regim);
  if (rec.fel === "refuz") {
    return { error: mesajRefuz(rec, order.order_number ?? "", order.payment_status === "paid") };
  }
  if (rec.fel === "ajustare") {
    products.push(rec.delta < 0 ? {
      // In MINUS, ajustarea merge pe acelasi tipar ca toate celelalte scaderi din
      // fisierul asta: `isDiscount` + `discountValue`. Un rand de marfa cu pret
      // negativ ar fi fost singurul din tot payload-ul, adica exact calea despre
      // care nimeni nu stie daca SmartBill o accepta — si e calea pe care cade
      // aproape orice comanda cu pachete.
      isDiscount: true,
      name: "Ajustare rotunjire",
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: 0,
      numberOfItems: products.length,
      discountType: 1,
      discountValue: rec.delta,
      isTaxIncluded: taxIncluded,
      ...taxFields,
    } : {
      name: "Ajustare rotunjire",
      // Cod si `isService`, ca Transportul: pe conturile cu „Foloseste cod produs"
      // activ, un rand de marfa fara cod nu exista in gestiune si emiterea esueaza.
      code: "ajustare",
      measuringUnitName: "buc",
      currency: "RON",
      quantity: 1,
      price: rec.delta,
      isTaxIncluded: taxIncluded,
      isService: true,
      ...taxFields,
    });
  }

  return products;
}

type InvoiceableOrder = {
  // Campurile de care depinde garda de reconciliere: declarate, nu presupuse din
  // faptul ca toti apelantii de azi citesc comanda cu `select("*")`.
  total: unknown;
  vat_amount?: unknown;
  payment_status?: string | null;
  order_number: string | number;
  customer_name: string;
  customer_email: string | null;
  customer_phone?: string | null;
  payment_method?: string | null;
  shipping_address: unknown;
  items: unknown;
  shipping_cost: unknown;
  discount_amount: unknown;
  discount_code: string | null;
  card_discount_amount?: unknown;
  cod_discount_amount?: unknown;
  cod_fee_amount?: unknown;
  vat_rate: unknown;
};

async function buildInvoiceParams(
  sursa: SursaCoduri,
  config: SmartbillConfig,
  order: InvoiceableOrder,
  seriesName: string,
  pricesIncludeVat: boolean,
  vatEnabled: boolean,
  storeVatRate: number,
  /** Ce document desfiintat inlocuieste acesta. Vezi `billing/refacturare.ts`. */
  slot: SlotFacturare,
  extraParams?: Partial<MerchantInvoiceParams>
): Promise<MerchantInvoiceParams | { error: string }> {
  const address = order.shipping_address as ShippingAddress | null;
  const products = await buildInvoiceProducts(sursa, config, order, pricesIncludeVat, vatEnabled, storeVatRate);
  if ("error" in products) return products;
  const parte = invoiceParty(order, address);
  const today = new Date().toISOString().split("T")[0];

  // Scadenta optionala (zile de la emitere); fara ea SmartBill pune data emiterii.
  const dueDays = Math.floor(Number(config.due_days) || 0);
  const dueDate = dueDays > 0
    ? new Date(Date.now() + dueDays * 24 * 3600 * 1000).toISOString().split("T")[0]
    : undefined;

  const payLabel = PAYMENT_METHOD_DEFAULT_LABELS[order.payment_method as PaymentMethodType]
    ?? (order.payment_method || "");

  return {
    companyVatCode: config.company_vat_code,
    client: {
      name: parte.name,
      // La firma, codul fiscal real (cu „RO" doar daca e platitor de TVA).
      // La persoana fizica raman conditiile ANAF/e-Factura: CNP valid sau sir de
      // 0 — nu colectam CNP la checkout, iar modulul oficial trimite acelasi
      // fallback. Adresa si localitatea sunt obligatorii, "-" e acceptat.
      vatCode: parte.vatCode ?? "0000000000000",
      ...(parte.regCom ? { regCom: parte.regCom } : {}),
      // Tara vine din aceeasi sursa ca restul adresei: la firma, sediul fiscal
      // (romanesc, din registrul ANAF); la persoana fizica, adresa de livrare.
      country: countryNameFor(parte.country),
      address: parte.address || "-",
      city: parte.city || "-",
      county: parte.county ?? undefined,
      email: order.customer_email ?? undefined,
      phone: order.customer_phone ?? undefined,
      isTaxPayer: parte.vatPayer,
      saveToDb: false,
    },
    seriesName,
    currency: "RON",
    issueDate: today,
    ...(dueDate ? { dueDate } : {}),
    // Leaga documentul de comanda: mentions apare pe factura, observations doar
    // in rapoartele SmartBill. La reemiterea dupa storno, mentiunea e si singura
    // urma pe hartie a documentului desfiintat: randul comenzii pastreaza doar
    // documentul viu.
    mentions: mentiuneRefacturare(`Comanda #${order.order_number}${payLabel ? ` - plata: ${payLabel}` : ""}`, slot),
    observations: mentiuneRefacturare(`Comanda #${order.order_number}`, slot),
    products,
    isDraft: false,
    // Email is sent as a separate, non-blocking step after creation (see
    // trySendDocEmail), so a missing SmartBill email server can't fail invoicing.
    sendEmail: false,
    ...extraParams,
  };
}

// Incasare la emitere: factura iese direct incasata cand comanda a fost platita
// online cu cardul (opt-in per merchant). Tipul "Card online" e cel folosit de
// modulul WooCommerce oficial. Nu se aplica proformelor.
function paymentAtIssue(
  config: SmartbillConfig,
  order: { payment_method?: string | null; payment_status: string | null | undefined; total?: unknown }
): Pick<MerchantInvoiceParams, "payment"> | Record<string, never> {
  if (!config.mark_paid_online) return {};
  // „Au intrat banii?" e regula COMUNA celor trei case (`billing/incasare.ts`).
  // Aici era scrisa corect; la Oblio, gresit — metoda de plata raspundea in locul
  // starii platii si rambursul neplatit iesea incasat.
  if (!baniiAuIntrat(order)) return {};
  // Restul e specific SmartBill si NU e aceeasi intrebare: tipul trimis e „Card
  // online", deci se limiteaza la platile cu cardul, si ramane opt-in per magazin.
  if (!isCardPaymentMethod(order.payment_method)) return {};
  const value = Number(order.total);
  if (!Number.isFinite(value) || value <= 0) return {};
  return { payment: { value, type: "Card online", isCash: false } };
}

/**
 * Stornul se sterge odata cu factura pe care o desfiintase.
 *
 * Altfel a doua stornare ar fi blocata de propria ei garda („deja stornata"), iar
 * ecranul ar arata factura NOUA drept stornata prin nota de credit a celei vechi.
 * Randul comenzii tine documentul VIU, nu arhiva; perechea desfiintata pleaca in
 * mentiunile facturii noi, in jurnal, si ramane in contul SmartBill.
 */
const campuriStornoGolite = {
  smartbill_storno_number: null,
  smartbill_storno_series: null,
} as const;

/** Urma locala a perechii desfiintate, cand emiterea a fost o reemitere. */
async function jurnalRefacturare(
  businessId: string,
  orderId: string,
  orderNumber: string | number,
  slot: SlotFacturare,
  emis: { series: string; number: string },
): Promise<void> {
  if (!slot.poateEmite || !slot.inlocuieste) return;
  await logError({
    action: "smartbill.refacturareDupaStorno",
    message: `Comanda #${orderNumber}: factura ${emis.series}${emis.number} inlocuieste ${slot.inlocuieste.factura ?? "?"}, stornata prin ${slot.inlocuieste.storno}`,
    details: { orderId, ...slot.inlocuieste, facturaNoua: `${emis.series}${emis.number}` },
    businessId,
    severity: "info",
  });
}

async function getStoreVatSettings(businessId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("store_settings")
    .select("prices_include_vat, vat_enabled, vat_rate")
    .eq("business_id", businessId)
    .single();
  return {
    pricesIncludeVat: data?.prices_include_vat ?? false,
    vatEnabled: data?.vat_enabled ?? false,
    vatRate: Number(data?.vat_rate ?? 0),
  };
}

// Best-effort document email. SmartBill sends the PDF using the merchant's OWN
// email server; if that's not configured it fails — but the document is already
// created, so we never block on it. Returns a warning string the UI can surface.
async function trySendDocEmail(
  config: SmartbillConfig,
  customerEmail: string | null,
  type: "invoice" | "estimate",
  seriesName: string,
  number: string,
): Promise<string | null> {
  if (!config.send_email || !customerEmail) return null;
  const label = type === "invoice" ? "Factura" : "Proforma";
  try {
    const res = await sendMerchantDocumentEmail(config, {
      companyVatCode: config.company_vat_code,
      type, seriesName, number, to: customerEmail,
    });
    if ("error" in res) {
      return `${label} a fost generata, dar emailul catre client nu a putut fi trimis: ${res.error}. Configureaza serverul de email in SmartBill sau opreste trimiterea pe email din integrare.`;
    }
    return null;
  } catch {
    return `${label} a fost generata, dar emailul catre client nu a putut fi trimis.`;
  }
}

// ─── Public actions ────────────────────────────────────────────────────────

export async function testSmartbillConnection(
  businessId: string
): Promise<{ series: { name: string; type: string; nextNumber?: string }[]; taxes: string[] } | { error: string }> {
  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const [seriesResult, taxResult] = await Promise.all([
    getMerchantSeries(config),
    getMerchantTaxes(config),
  ]);

  if ("error" in seriesResult) return seriesResult;

  return {
    series: seriesResult,
    taxes: "error" in taxResult ? [] : taxResult.map(t => `${t.name} (${t.percentage}%)`),
  };
}

// Fetch the VAT rates defined in the merchant's SmartBill account, so the config
// UI can offer them as a dropdown (the taxName sent to SmartBill must match one of
// these names exactly). Works while still configuring (no `enabled` gate).
export async function getSmartbillTaxes(
  businessId: string
): Promise<{ taxes: { name: string; percentage: number }[] } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  // Tokenul se citeste cu service role (vezi `getConfigForBiz`): clientul
  // utilizatorului primeste `enc.v1.…`, iar nomenclatorul de cote s-ar fi intors
  // gol cu „credentiale invalide". Proprietarul e verificat mai sus.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("smartbill_config").eq("business_id", businessId).single();
  const config = settings?.smartbill_config as SmartbillConfig | null;
  if (!config?.email || !config.token || !config.company_vat_code) {
    return { error: "Completeaza email, token si CUI, apoi salveaza." };
  }

  const res = await getMerchantTaxes(config);
  if ("error" in res) return res;
  return { taxes: res };
}

export async function generateOrderInvoice(
  businessId: string,
  orderId: string
): Promise<{ number: string; series: string; emailWarning?: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda nu a fost gasita." };
  // Slotul e ocupat doar cat timp exista o factura FARA storno. Dupa storno,
  // factura e desfiintata fiscal si comanda e din nou facturabila. Vezi
  // `billing/refacturare.ts` pentru cele 7 comenzi blocate definitiv din productie.
  const slot = slotFacturare({
    casa: "SmartBill",
    factura: order.smartbill_invoice_number,
    storno: order.smartbill_storno_number,
  });
  if (!slot.poateEmite) return { error: slot.mesaj };

  const { pricesIncludeVat, vatEnabled, vatRate } = await getStoreVatSettings(businessId);
  const params = await buildInvoiceParams(
    { supabase, businessId }, config, order, config.series_name, pricesIncludeVat, vatEnabled, vatRate,
    slot, paymentAtIssue(config, order),
  );
  // Comanda care nu se reconciliaza NU se factureaza: mesajul spune numerele si
  // pasul urmator, si ajunge in interfata.
  if ("error" in params) return params;
  const result = await createMerchantInvoice(config, params);
  if ("error" in result) return result;

  await supabase.from("orders").update({
    smartbill_invoice_number: result.number,
    smartbill_invoice_series: result.series,
    smartbill_invoice_url: result.documentUrl ?? null,
    ...campuriStornoGolite,
  }).eq("id", orderId);

  await jurnalRefacturare(businessId, orderId, order.order_number, slot, result);
  const emailWarning = await trySendDocEmail(config, order.customer_email, "invoice", result.series, result.number);
  return { number: result.number, series: result.series, ...(emailWarning ? { emailWarning } : {}) };
}

export async function generateOrderEstimate(
  businessId: string,
  orderId: string
): Promise<{ number: string; series: string; emailWarning?: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;
  if (!config.estimate_series_name?.trim()) {
    return { error: "Seria pentru proforma nu este configurata. Adaug-o in setarile SmartBill." };
  }

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda nu a fost gasita." };
  if (order.smartbill_estimate_number) return { error: "Proforma a fost deja generata pentru aceasta comanda." };

  const { pricesIncludeVat, vatEnabled, vatRate } = await getStoreVatSettings(businessId);
  // Proforma nu se storneaza, deci nu inlocuieste vreun document desfiintat.
  const params = await buildInvoiceParams({ supabase, businessId }, config, order, config.estimate_series_name, pricesIncludeVat, vatEnabled, vatRate, { poateEmite: true });
  if ("error" in params) return params;
  const result = await createMerchantEstimate(config, params);
  if ("error" in result) return result;

  await supabase.from("orders").update({
    smartbill_estimate_number: result.number,
    smartbill_estimate_series: result.series,
    smartbill_estimate_url: result.documentUrl ?? null,
  }).eq("id", orderId);

  const emailWarning = await trySendDocEmail(config, order.customer_email, "estimate", result.series, result.number);
  return { number: result.number, series: result.series, ...(emailWarning ? { emailWarning } : {}) };
}

export async function convertEstimateToInvoice(
  businessId: string,
  orderId: string
): Promise<{ number: string; series: string; emailWarning?: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda nu a fost gasita." };
  if (!order.smartbill_estimate_number || !order.smartbill_estimate_series) {
    return { error: "Nu exista proforma pentru aceasta comanda." };
  }
  // Aceeasi regula ca la emiterea directa: stornata inseamna slot liber.
  const slot = slotFacturare({
    casa: "SmartBill",
    factura: order.smartbill_invoice_number,
    storno: order.smartbill_storno_number,
  });
  if (!slot.poateEmite) return { error: slot.mesaj };

  const estimateRef = {
    seriesName: order.smartbill_estimate_series as string,
    number: order.smartbill_estimate_number as string,
  };

  // Proforma poate fi facturata si manual, din SmartBill Cloud — daca s-a
  // intamplat, adoptam factura existenta in loc sa emitem una dubla.
  const status = await getEstimateInvoices(config, {
    cif: config.company_vat_code,
    seriesName: estimateRef.seriesName,
    number: estimateRef.number,
  });
  if (!("error" in status) && status.invoiced) {
    // Dupa un storno, SmartBill raporteaza in continuare proforma ca facturata — cu
    // chiar factura desfiintata. Adoptata orbeste, ea ar reinvia numarul mort pe
    // rand si comanda ar ramane blocata a doua oara. Se adopta doar un document
    // DIFERIT de cel inlocuit, adica unul pe care l-a emis intre timp comerciantul.
    const inlocuita = slot.inlocuieste?.factura ?? null;
    const existing = status.invoices.find((i) => i.number !== inlocuita);
    if (!existing) {
      return inlocuita
        ? { error: `Proforma e legata in SmartBill de factura ${inlocuita}, cea pe care ai stornat-o. Emite factura direct din comanda (butonul Factura), nu din proforma.` }
        : { error: "Proforma a fost deja facturata in SmartBill (factura e inca ciorna). Finalizeaz-o din contul SmartBill." };
    }
    await supabase.from("orders").update({
      smartbill_invoice_number: existing.number,
      smartbill_invoice_series: existing.series,
      // Linkul se GOLESTE, nu se pastreaza. Pana acum ramura asta era accesibila
      // doar cand nu exista factura, deci nici link; de cand e accesibila si dupa
      // un storno, `smartbill_invoice_url` tine adresa facturii DESFIINTATE —
      // ecranul ar scrie numarul cel nou langa un buton care deschide stornoul.
      // `getEstimateInvoices` nu intoarce adresa, deci null e valoarea onesta.
      smartbill_invoice_url: null,
      ...campuriStornoGolite,
    }).eq("id", orderId);
    await jurnalRefacturare(businessId, orderId, order.order_number, slot, existing);
    return { number: existing.number, series: existing.series };
  }

  // La emiterea pe baza de proforma, exemplul oficial trimite DOAR referinta
  // proformei — clientul si produsele se preiau din ea; nu le retrimitem.
  const params: MerchantInvoiceParams = {
    companyVatCode: config.company_vat_code,
    seriesName: config.series_name,
    issueDate: new Date().toISOString().split("T")[0],
    isDraft: false,
    sendEmail: false,
    useEstimateDetails: true,
    estimate: estimateRef,
    // Doar la reemitere: pe drumul obisnuit mentiunile se preiau din proforma, si
    // n-are rost sa le suprascriem cu acelasi text.
    ...(slot.inlocuieste ? { mentions: mentiuneRefacturare(`Comanda #${order.order_number}`, slot) } : {}),
    ...paymentAtIssue(config, order),
  };

  const result = await createMerchantInvoice(config, params);
  if ("error" in result) return result;

  await supabase.from("orders").update({
    smartbill_invoice_number: result.number,
    smartbill_invoice_series: result.series,
    smartbill_invoice_url: result.documentUrl ?? null,
    ...campuriStornoGolite,
  }).eq("id", orderId);

  await jurnalRefacturare(businessId, orderId, order.order_number, slot, result);
  const emailWarning = await trySendDocEmail(config, order.customer_email, "invoice", result.series, result.number);
  return { number: result.number, series: result.series, ...(emailWarning ? { emailWarning } : {}) };
}

export async function stornoOrderInvoice(
  businessId: string,
  orderId: string
): Promise<{ stornoNumber?: string; stornoSeries?: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda nu a fost gasita." };
  if (!order.smartbill_invoice_number || !order.smartbill_invoice_series) {
    return { error: "Nu exista factura pentru aceasta comanda." };
  }
  if (order.smartbill_storno_number) return { error: "Factura a fost deja stornata." };

  // Stornare reala (POST /invoice/reverse) — nu anulare. Daca SmartBill nu
  // returneaza numarul stornoului (exemplul oficial il are gol), pastram
  // referinta facturii originale ca marcaj "stornata".
  const result = await reverseMerchantInvoice(config, {
    cif: config.company_vat_code,
    seriesName: order.smartbill_invoice_series as string,
    number: order.smartbill_invoice_number as string,
  });

  if ("error" in result) return result;

  await supabase.from("orders").update({
    smartbill_storno_number: result.stornoNumber ?? order.smartbill_invoice_number,
    smartbill_storno_series: result.stornoSeries ?? order.smartbill_invoice_series,
  }).eq("id", orderId);

  return {
    stornoNumber: result.stornoNumber,
    stornoSeries: result.stornoSeries,
  };
}

export async function resendSmartbillEmail(
  businessId: string,
  orderId: string,
  toEmail: string,
  docType: "invoice" | "estimate"
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const config = await getConfigForBiz(businessId);
  if ("error" in config) return config;

  const { data: order } = await supabase
    .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
  if (!order) return { error: "Comanda nu a fost gasita." };

  let seriesName: string;
  let number: string;

  if (docType === "invoice") {
    if (!order.smartbill_invoice_number || !order.smartbill_invoice_series) {
      return { error: "Nu exista factura pentru aceasta comanda." };
    }
    seriesName = order.smartbill_invoice_series as string;
    number = order.smartbill_invoice_number as string;
  } else {
    if (!order.smartbill_estimate_number || !order.smartbill_estimate_series) {
      return { error: "Nu exista proforma pentru aceasta comanda." };
    }
    seriesName = order.smartbill_estimate_series as string;
    number = order.smartbill_estimate_number as string;
  }

  return sendMerchantDocumentEmail(config, {
    companyVatCode: config.company_vat_code,
    type: docType,
    seriesName,
    number,
    to: toEmail.trim(),
  });
}

// ─── Auto-invoice (called internally from order.actions.ts) ────────────────

export async function maybeAutoGenerateInvoice(
  businessId: string,
  orderId: string,
  newStatus: string,
  newPaymentStatus: string,
  sistem?: SistemClient,
): Promise<boolean> {
  try {
    // Cu `sistem` dat de un apelant server (confirmare de plata), citirile trec
    // peste RLS; fara el ramane clientul cu sesiune, ca pana acum. Vezi
    // `invoicing-context.ts`.
    const supabase = await clientFacturare(sistem);
    /*
     * Pe calea manuala, proprietarul se verifica AICI — nu „la apelant".
     *
     * Functia e exportata dintr-un modul „use server", deci e ea insasi o actiune
     * apelabila din browser, cu orice `businessId`. Cat timp configuratia se citea
     * cu clientul utilizatorului, RLS raspundea in locul nostru; de cand citirea de
     * mai jos ocoleste RLS, un apel direct ar incarca tokenul ALTUI comerciant in
     * memoria serverului. Azi nu pleaca nicaieri (comanda se citeste tot pe clientul
     * cu sesiune si iese `false`), dar garantia nu are voie sa atarne de ordinea
     * randurilor de mai jos. Acelasi tipar ca in oblio.actions.ts / fgo.actions.ts.
     */
    if (!eSistem(sistem)) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data: biz } = await supabase
        .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
      if (!biz) return false;
    }
    // Configuratia se citeste cu SERVICE ROLE pe AMANDOUA caile: pe cea manuala
    // `clientFacturare` intoarce clientul utilizatorului, iar acela nu mai
    // primeste tokenul decriptat, ci `enc.v1.…` — factura ar pleca spre SmartBill
    // cu o parola care nu e parola. Proprietarul e verificat chiar mai sus (calea
    // manuala) sau e serverul insusi (calea automata).
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("store_settings").select("smartbill_config").eq("business_id", businessId).single();

    const config = settings?.smartbill_config as SmartbillConfig | null;
    if (!config?.enabled || !config.auto_invoice) return false;
    if (!config.email || !config.token || !config.company_vat_code || !config.series_name) return false;

    if (!autoInvoiceTriggerMatches(config.auto_invoice_trigger, newStatus, newPaymentStatus)) return false;

    // Check order doesn't already have invoice
    const { data: order } = await supabase
      .from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single();
    if (!order) return false;
    /*
     * Aceeasi regula ca pe calea manuala, ca sa nu existe doua raspunsuri la „se
     * poate emite?". In practica azi nu se ajunge aici cu o comanda stornata:
     * dispecerul (`invoice-auto.actions.ts`) iese mai devreme la orice numar de
     * factura setat, indiferent de storno. Reemiterea ramane deci o actiune
     * DELIBERATA, din buton — ce si vrem: o comanda stornata nu are voie sa-si
     * refaca singura factura la urmatoarea schimbare de stare.
     */
    const slot = slotFacturare({
      casa: "SmartBill",
      factura: order.smartbill_invoice_number,
      storno: order.smartbill_storno_number,
    });
    if (!slot.poateEmite) return false;

    const { data: storeSettings } = await supabase
      .from("store_settings").select("prices_include_vat, vat_enabled, vat_rate").eq("business_id", businessId).single();

    const pricesIncludeVat = storeSettings?.prices_include_vat ?? false;
    const vatEnabled = storeSettings?.vat_enabled ?? false;
    const vatRate = Number(storeSettings?.vat_rate ?? 0);

    const params = await buildInvoiceParams(
      { supabase, businessId }, config, order, config.series_name, pricesIncludeVat, vatEnabled, vatRate,
      slot, paymentAtIssue(config, order),
    );
    /*
     * Pe calea automata esecul e MUT (`return false`, iar dispecerul inghite), deci
     * o comanda care nu se reconciliaza ar ramane tacit nefacturata.
     *
     * Se scrie prin `logError`, nu cu un insert propriu — vezi explicatia din
     * fgo.actions.ts: motivul invocat inainte („logError merge pe clientul de
     * cerere, deci RLS l-ar taia") nu mai e adevarat, iar insertul direct era
     * ultimul care avea nevoie de politica INSERT deschisa pe error_logs.
     */
    if ("error" in params) {
      await logError({
        action: "smartbill.reconcileRefuzat",
        message: params.error,
        details: { orderId },
        businessId,
        severity: "critical",
      });
      return false;
    }
    const result = await createMerchantInvoice(config, params);
    if ("error" in result) return false;

    await supabase.from("orders").update({
      smartbill_invoice_number: result.number,
      smartbill_invoice_series: result.series,
      smartbill_invoice_url: result.documentUrl ?? null,
      ...campuriStornoGolite,
    }).eq("id", orderId);
    await jurnalRefacturare(businessId, orderId, order.order_number, slot, result);
    // Best-effort email — never affects the already-created invoice.
    await trySendDocEmail(config, order.customer_email, "invoice", result.series, result.number);
    return true;
  } catch {
    // Fire-and-forget: never throw, never block order update
    return false;
  }
}
