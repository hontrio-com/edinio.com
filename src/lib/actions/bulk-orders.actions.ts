"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import { maybeAutoInvoice } from "@/lib/actions/invoice-auto.actions";
import { generateOrderInvoice } from "@/lib/actions/smartbill.actions";
import { generateOblioInvoice } from "@/lib/actions/oblio.actions";
import { generateFgoInvoice } from "@/lib/actions/fgo.actions";
import { createCargusAwbAction } from "@/lib/actions/cargus.actions";
import { createSamedayAwbAction } from "@/lib/actions/sameday.actions";
import { createFanCourierAwbAction } from "@/lib/actions/fancourier.actions";
import { createDpdShipmentAction } from "@/lib/actions/dpd.actions";
import { greutateaColetului, idurileDeCantarit } from "@/lib/shipping/awb-weight";
import type { ProdusCotat } from "@/lib/shipping/cart-weight";
import type { SmartbillConfig } from "@/lib/smartbill";
import type { OblioConfig } from "@/lib/oblio";
import type { FgoConfig } from "@/lib/fgo";
import type { CargusConfig } from "@/lib/cargus";
import type { SamedayConfig } from "@/lib/sameday";
import type { FanCourierConfig } from "@/lib/fancourier";
import type { DpdConfig } from "@/lib/dpd";
import { ORDER_STATUS } from "@/lib/orders/status";

// Uniform result shape for every bulk operation, so the UI reports consistently.
export interface BulkResult {
  total: number;
  done: number;
  skipped: number;
  failed: number;
  errors: { order: string; message: string }[];
}

// The Orders page shows at most one page (ORDERS_PAGE_SIZE = 50), so selection is
// naturally bounded. We still cap defensively.
const MAX_BULK = 50;
// Invoices MUST be issued one at a time: providers assign sequential document
// numbers on a shared series, so concurrent issuance races and the API rejects
// the collisions (e.g. fGO returns 409 Conflict). AWBs are independent shipments
// (the courier assigns each number server-side), so a little concurrency is safe.
const INVOICE_CONCURRENCY = 1;
const AWB_CONCURRENCY = 3;

export type InvoiceProvider = "auto" | "smartbill" | "oblio" | "fgo";
export type BulkCourier = "auto" | "cargus" | "sameday" | "fancourier" | "dpd";
const SUPPORTED_COURIERS: Exclude<BulkCourier, "auto">[] = ["cargus", "sameday", "fancourier", "dpd"];

interface ShippingAddr {
  county?: string; city?: string; address?: string; street?: string; street_no?: string;
  postal_code?: string; courier?: string; delivery_type?: string; locker_id?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────────

async function guardBusiness(businessId: string): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };
  return { userId: user.id };
}

function cleanIds(orderIds: string[]): string[] {
  return [...new Set((orderIds ?? []).filter(Boolean))].slice(0, MAX_BULK);
}

// Concurrency-limited runner. JS is single-threaded, so the shared result object
// is mutated safely between awaits (no locks needed).
async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, size: number): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

function isErr(res: unknown): res is { error: string } {
  return !!res && typeof res === "object" && "error" in res;
}

/**
 * Greutatile produselor din comenzile date, intr-o singura interogare.
 *
 * O interogare per comanda ar fi insemnat 50 de dus-intorsuri la baza pentru o
 * generare in masa; catalogul se cere o data si se imparte intre toate.
 * `idurileDeCantarit` scoate liniile care nu sunt produse (optiunile de comanda
 * au `product_id` de forma `extra_ext_...`, 3 in productie) — trimise intr-un
 * `in()` pe o coloana uuid, ar fi rasturnat interogarea intreaga si toate
 * coletele ar fi plecat pe rezerva.
 */
async function greutatileDinCatalog(
  admin: ReturnType<typeof createAdminClient>, businessId: string, itemsPerComanda: unknown[],
): Promise<ProdusCotat[]> {
  const ids = [...new Set(itemsPerComanda.flatMap((items) => idurileDeCantarit(items)))];
  if (ids.length === 0) return [];
  const { data, error } = await admin
    .from("products").select("id, weight_grams").eq("business_id", businessId).in("id", ids);
  // Cade interogarea, cad toate coletele pe un kilogram — exact bug-ul reparat.
  // Fara linia asta ar cadea tacut, ca pana acum.
  if (error) console.error("[awb] cautarea greutatilor a esuat:", error.message);
  return (data ?? []) as ProdusCotat[];
}

/**
 * Greutatea propusa in formularele de AWB din panou.
 *
 * Formularele sunt componente de client si primesc doar randul comenzii, nu si
 * catalogul, deci greutatea nu se poate calcula acolo. Toate sase porneau de la
 * `useState("1")`: masurat pe 2026-08-03, 4 din cele 50 de comenzi cu AWB emis
 * cantaresc peste un kilogram, iar eSAFE (Sameday + Woot pornite) are 267 de
 * produse active peste un kilogram, pana la 13,1 kg.
 *
 * Ramane o PROPUNERE, nu o impunere: comerciantul stie ambalajul, noi stim doar
 * marfa. De-aia se intoarce si `dinCatalog`, ca formularul sa spuna cand cifra e
 * doar o rezerva.
 */
export async function greutateaComenziiPentruAwb(
  businessId: string, orderId: string,
): Promise<{ kg: number; dinCatalog: boolean; liniiFaraGreutate: number } | { error: string }> {
  const g = await guardBusiness(businessId);
  if ("error" in g) return g;

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders").select("items").eq("business_id", businessId).eq("id", orderId).single();
  if (!order) return { error: "Comanda negasita." };

  const produse = await greutatileDinCatalog(admin, businessId, [order.items]);
  return greutateaColetului(order.items, produse);
}

// ── Bulk invoices ───────────────────────────────────────────────────────────────
// One invoice per order (never double-invoice), with the chosen provider or the
// highest-priority enabled one (SmartBill → Oblio → fGO) — mirrors auto-invoicing.
export async function bulkGenerateInvoices(
  businessId: string, orderIds: string[], provider: InvoiceProvider = "auto",
): Promise<BulkResult | { error: string }> {
  const g = await guardBusiness(businessId);
  if ("error" in g) return g;
  const ids = cleanIds(orderIds);
  if (ids.length === 0) return { error: "Nicio comanda selectata." };

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("smartbill_config, oblio_config, fgo_config").eq("business_id", businessId).single();
  const sb = settings?.smartbill_config as SmartbillConfig | null;
  const ob = settings?.oblio_config as OblioConfig | null;
  const fg = settings?.fgo_config as FgoConfig | null;
  const enabled = {
    smartbill: sb?.enabled === true,
    oblio: !!(ob?.enabled && ob?.client_id && ob?.cif && ob?.series_invoice),
    fgo: !!(fg?.enabled && fg?.cod_unic && fg?.private_key && fg?.serie),
  };
  const pick: "smartbill" | "oblio" | "fgo" | null =
    provider !== "auto"
      ? (enabled[provider] ? provider : null)
      : (enabled.smartbill ? "smartbill" : enabled.oblio ? "oblio" : enabled.fgo ? "fgo" : null);
  if (!pick) return { error: "Niciun furnizor de facturare activ pentru optiunea aleasa." };

  const { data: orders } = await admin
    .from("orders")
    .select("id, order_number, smartbill_invoice_number, oblio_invoice_number, fgo_invoice_number")
    .eq("business_id", businessId).in("id", ids);

  const result: BulkResult = { total: orders?.length ?? 0, done: 0, skipped: 0, failed: 0, errors: [] };

  await runPool(orders ?? [], async (o) => {
    const row = o as Record<string, unknown>;
    if (row.smartbill_invoice_number || row.oblio_invoice_number || row.fgo_invoice_number) { result.skipped++; return; }
    try {
      const res =
        pick === "smartbill" ? await generateOrderInvoice(businessId, o.id)
        : pick === "oblio" ? await generateOblioInvoice(businessId, o.id)
        : await generateFgoInvoice(businessId, o.id);
      if (isErr(res)) { result.failed++; result.errors.push({ order: o.order_number, message: res.error }); }
      else result.done++;
    } catch (e) {
      result.failed++;
      result.errors.push({ order: o.order_number, message: (e as Error).message });
    }
  }, INVOICE_CONCURRENCY);

  logError({ action: "bulkGenerateInvoices", message: `provider=${pick} done=${result.done} skipped=${result.skipped} failed=${result.failed}`, details: { businessId }, businessId, userId: g.userId, severity: "info" });
  revalidatePath("/dashboard/orders");
  return result;
}

// ── Bulk AWBs ────────────────────────────────────────────────────────────────────
// Supports the address-based couriers (Cargus, Sameday, FAN, DPD) that derive the
// service from weight/address server-side. Woot & Colete need the live checkout
// quote (service/location ids) and stay per-order — those get skipped here.
export async function bulkGenerateAwbs(
  businessId: string, orderIds: string[], courier: BulkCourier = "auto",
): Promise<BulkResult | { error: string }> {
  const g = await guardBusiness(businessId);
  if ("error" in g) return g;
  const ids = cleanIds(orderIds);
  if (ids.length === 0) return { error: "Nicio comanda selectata." };

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings")
    .select("cargus_config, sameday_config, fan_courier_config, dpd_config")
    .eq("business_id", businessId).single();
  const cg = settings?.cargus_config as CargusConfig | null;
  const sg = settings?.sameday_config as SamedayConfig | null;
  const fc = settings?.fan_courier_config as FanCourierConfig | null;
  const dg = settings?.dpd_config as DpdConfig | null;
  const enabled: Record<Exclude<BulkCourier, "auto">, boolean> = {
    cargus: !!(cg?.enabled && cg?.username && cg?.subscription_key && cg?.location_id),
    sameday: !!(sg?.enabled && sg?.username && sg?.pickup_point_id),
    fancourier: !!(fc?.enabled && fc?.username && fc?.client_id),
    dpd: !!(dg?.enabled && dg?.username && dg?.client_id),
  };

  if (courier !== "auto" && !enabled[courier]) return { error: "Curierul selectat nu este configurat." };
  if (courier === "auto" && !SUPPORTED_COURIERS.some((c) => enabled[c])) {
    return { error: "Niciun curier compatibil cu generarea in masa nu este conectat." };
  }

  const { data: orders } = await admin
    .from("orders")
    .select("id, order_number, customer_name, customer_phone, customer_email, total, subtotal, payment_method, payment_status, shipping_address, items, cargus_awb_number, sameday_awb_number, fan_courier_awb_number, dpd_shipment_id")
    .eq("business_id", businessId).in("id", ids);

  const result: BulkResult = { total: orders?.length ?? 0, done: 0, skipped: 0, failed: 0, errors: [] };

  // Greutatile intregii selectii, cerute o singura data. Generarea in masa nu are
  // niciun camp de corectat, deci ce se calculeaza aici pleaca direct pe colet.
  const produse = await greutatileDinCatalog(admin, businessId, (orders ?? []).map((o) => o.items));
  // Comenzile care n-au avut de unde sa afle greutatea. Se jurnalizeaza la
  // sfarsit, o singura linie: pana acum TOATE plecau pe un kilogram si nu se
  // vedea nicaieri.
  const peRezerva: string[] = [];

  // Map a stored checkout courier value to our supported set.
  const COURIER_ALIASES: Record<string, Exclude<BulkCourier, "auto">> = {
    cargus: "cargus", sameday: "sameday", fancourier: "fancourier", "fan-courier": "fancourier", "fan_courier": "fancourier", dpd: "dpd",
  };

  await runPool(orders ?? [], async (o) => {
    const addr = (o.shipping_address ?? {}) as ShippingAddr;
    // Resolve the target courier for this order.
    let target: Exclude<BulkCourier, "auto"> | null;
    if (courier === "auto") {
      target = COURIER_ALIASES[(addr.courier ?? "").toLowerCase().trim()] ?? null;
      if (!target || !enabled[target]) { result.skipped++; return; }
    } else {
      target = courier;
    }

    // Already has an AWB for this courier? Skip (idempotent).
    const row = o as Record<string, unknown>;
    const existing =
      target === "cargus" ? row.cargus_awb_number
      : target === "sameday" ? row.sameday_awb_number
      : target === "fancourier" ? row.fan_courier_awb_number
      : row.dpd_shipment_id;
    if (existing) { result.skipped++; return; }

    const greutate = greutateaColetului(o.items, produse);
    // Si cele PARTIALE, nu doar cele fara nicio greutate: acelea sunt cazul
    // periculos — un numar incomplet care pleaca la curier fara interventie
    // umana. `dinCatalog` e fals in amandoua situatiile.
    if (!greutate.dinCatalog) peRezerva.push(o.order_number);

    try {
      const res = await createAwbForOrder(target, businessId, o, greutate.kg);
      if (isErr(res)) { result.failed++; result.errors.push({ order: o.order_number, message: res.error }); }
      else result.done++;
    } catch (e) {
      result.failed++;
      result.errors.push({ order: o.order_number, message: (e as Error).message });
    }
  }, AWB_CONCURRENCY);

  if (peRezerva.length > 0) {
    logError({ action: "bulkGenerateAwbs", message: `${peRezerva.length} colete au plecat pe greutatea de rezerva (produse fara weight_grams): ${peRezerva.join(", ")}`, details: { businessId }, businessId, userId: g.userId, severity: "warning" });
  }
  logError({ action: "bulkGenerateAwbs", message: `courier=${courier} done=${result.done} skipped=${result.skipped} failed=${result.failed}`, details: { businessId }, businessId, userId: g.userId, severity: "info" });
  revalidatePath("/dashboard/orders");
  return result;
}

type BulkOrderRow = {
  id: string; order_number: string; customer_name: string; customer_phone: string;
  customer_email: string | null; total: number; payment_method: string | null;
  // De starea platii atarna rambursul. Nedeclarata, ar fi fost mereu `undefined`,
  // deci orice comanda ar fi plecat cu ramburs, inclusiv cele deja platite.
  payment_status: string | null;
  shipping_address: unknown; items: unknown;
};

// Build a courier-specific default AWB input from the order and call the existing
// per-order action (which derives lockers / PUDO / declared value server-side).
//
// `weightKg` e parametru OBLIGATORIU, nu optional cu implicit 1: asa `tsc`
// enumera apelantii daca mai apare unul, in loc sa-l lase sa mosteneasca tacut
// kilogramul fix care era chiar defectul.
async function createAwbForOrder(
  courier: Exclude<BulkCourier, "auto">, businessId: string, order: unknown, weightKg: number,
): Promise<{ error: string } | Record<string, unknown>> {
  const o = order as BulkOrderRow;
  const addr = (o.shipping_address ?? {}) as ShippingAddr;
  const items = Array.isArray(o.items) ? (o.items as { name?: string }[]) : [];
  const content = (items.map((i) => i?.name).filter(Boolean).join(", ").slice(0, 100)) || o.order_number;
  // Ramburs dupa BANI, nu dupa metoda — aceeasi regula ca in formularele de AWB.
  // Aici conteaza mai mult decat oriunde: generarea in masa nu are camp de
  // corectat, deci ce iese de aici pleaca direct pe colet.
  const cod = rambursDeIncasat(o);

  const county = (addr.county ?? "").trim();
  const city = (addr.city ?? "").trim();
  const street = (addr.street ?? addr.address ?? "").trim();
  const streetNo = (addr.street_no ?? "").trim();
  const addressLine = (addr.address ?? addr.street ?? "").trim();
  const zip = (addr.postal_code ?? "").trim();
  const email = o.customer_email ?? "";
  // Greutatea calculata din produsele comenzii (`greutateaColetului`). Pana la
  // 2026-08-03 aici sta un `const weight = 1` fix: cotatia cerea pretul pe
  // greutatea reala, iar coletul pleca declarat pe un kilogram, deci curierul
  // refactura banda adevarata si diferenta o platea comerciantul, nevazuta.
  const weight = weightKg;

  switch (courier) {
    case "cargus":
      return createCargusAwbAction(businessId, o.id, {
        recipientName: o.customer_name, recipientPhone: o.customer_phone, recipientEmail: email,
        recipientCounty: county, recipientCity: city, recipientAddress: addressLine, recipientPostalCode: zip,
        parcels: 1, envelopes: 0, totalWeightKg: weight, cashRepayment: cod, openPackage: false, saturdayDelivery: false,
        observations: "", packageContent: content, customString: o.order_number, parcelsDetails: [{ weight }],
      });
    case "sameday":
      return createSamedayAwbAction(businessId, o.id, {
        recipientName: o.customer_name, recipientPhone: o.customer_phone,
        recipientCounty: county, recipientCity: city, recipientAddress: addressLine, recipientPostalCode: zip,
        packageType: 0, packageNumber: 1, weightKg: weight, cashOnDelivery: cod, insuredValue: 0,
        observation: "", clientInternalReference: o.order_number,
      });
    case "fancourier": {
      const isFanbox = (addr.courier ?? "").toLowerCase().includes("fan") && addr.delivery_type === "locker" && !!addr.locker_id;
      return createFanCourierAwbAction(businessId, o.id, {
        recipientName: o.customer_name, recipientPhone: o.customer_phone, recipientEmail: email,
        recipientCounty: county, recipientLocality: city, recipientStreet: street, recipientStreetNo: streetNo,
        recipientZipCode: zip, parcels: 1, weightKg: weight, cod, content, observation: "",
        fanboxId: isFanbox ? addr.locker_id : undefined,
      });
    }
    case "dpd":
      return createDpdShipmentAction(businessId, o.id, {
        recipientName: o.customer_name, recipientPhone: o.customer_phone, recipientEmail: email,
        recipientCity: city, recipientCounty: county || undefined, recipientStreet: street, recipientStreetNo: streetNo,
        recipientAddressNote: "", weightKg: weight, cashOnDelivery: cod, ref1: o.order_number, shipmentNote: "", content,
      });
    default:
      return { error: "Curier nesuportat." };
  }
}

// ── Bulk status ──────────────────────────────────────────────────────────────────
// Single UPDATE for the whole selection, then fire auto-invoicing per order (the
// dispatcher still guarantees one invoice/order). No customer emails/SMS here — a
// bulk status change should not silently mass-message customers.
export async function bulkUpdateOrderStatus(
  businessId: string, orderIds: string[], status: string,
): Promise<{ updated: number } | { error: string }> {
  const g = await guardBusiness(businessId);
  if ("error" in g) return g;
  if (!(status in ORDER_STATUS)) return { error: "Status invalid." };
  const ids = cleanIds(orderIds);
  if (ids.length === 0) return { error: "Nicio comanda selectata." };

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("orders")
    .update({ status: status as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId).in("id", ids)
    .select("id, payment_status");
  if (error) {
    logError({ action: "bulkUpdateOrderStatus", message: error.message, details: { businessId, status }, businessId, userId: g.userId });
    return { error: "Eroare la actualizarea statusului." };
  }

  for (const row of updated ?? []) {
    void maybeAutoInvoice(businessId, row.id, status, (row.payment_status as string) ?? "");
    /*
     * Utilizarea cuponului se elibereaza si de AICI, nu doar din `updateOrder`.
     *
     * Masurat: din cele 8 comenzi online anulate din productie, SASE au fost
     * anulate in lot — se vad dupa `updated_at` identic la microsecunda. Adica
     * exact populatia constatarii 27 pleaca pe calea asta, iar cronul nu le
     * prinde nici el (el cere `status = pending`, astea sunt `cancelled`).
     * RPC-ul e idempotent: marcajul si contorul se ating in aceeasi instructiune.
     */
    if (status === "cancelled" || status === "refunded") {
      void admin.rpc("release_order_discount" as never, { p_order_id: row.id } as never);
    }
  }
  revalidatePath("/dashboard/orders");
  return { updated: (updated ?? []).length };
}
