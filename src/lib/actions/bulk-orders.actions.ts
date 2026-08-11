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
import { createGlsAwbAction } from "@/lib/actions/gls.actions";
import { createPallexAwbAction } from "@/lib/actions/pallex.actions";
import { greutateaColetului, idurileDeCantarit } from "@/lib/shipping/awb-weight";
import type { ProdusCotat } from "@/lib/shipping/cart-weight";
import type { SmartbillConfig } from "@/lib/smartbill";
import type { OblioConfig } from "@/lib/oblio";
import type { FgoConfig } from "@/lib/fgo";
import type { CargusConfig } from "@/lib/cargus";
import type { SamedayConfig } from "@/lib/sameday";
import type { FanCourierConfig } from "@/lib/fancourier";
import type { DpdConfig } from "@/lib/dpd";
import type { GlsConfig } from "@/lib/gls/client";
import { pallexGata, type PallExConfig } from "@/lib/pallex/client";
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
export type BulkCourier = "auto" | "cargus" | "sameday" | "fancourier" | "dpd" | "gls" | "pallex";
const SUPPORTED_COURIERS: Exclude<BulkCourier, "auto">[] = ["cargus", "sameday", "fancourier", "dpd", "gls", "pallex"];

interface ShippingAddr {
  county?: string; city?: string; address?: string; street?: string; street_no?: string;
  postal_code?: string; country?: string; courier?: string; delivery_type?: string; locker_id?: string;
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
// Supports the address-based couriers (Cargus, Sameday, FAN, DPD, GLS, Pall-Ex) that
// derive the service from weight/address server-side. Woot, Colete & eColet need the
// live checkout quote (service/location ids) and stay per-order — those get skipped.
//
// ⚠ eColet e exclus si dintr-un al doilea motiv, propriu lui: emiterea e
// ASINCRONA. `send-order` da doar un `order_to_send_id`, iar AWB-ul apare mai
// tarziu — deci un lot ar raporta „gata" pentru zeci de comenzi care inca n-au
// niciun numar, si nimeni n-ar sti care au reusit.
//
// GLS intra aici desi are livrare la punct: spre deosebire de Woot si Colete, nu
// are nevoie de cotatia din checkout ca sa emita. Punctul ales de client sta deja
// pe comanda, in `shipping_address.locker_id`, si devine parametrul serviciului PSD.
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
    .select("cargus_config, sameday_config, fan_courier_config, dpd_config, gls_config, pallex_config")
    .eq("business_id", businessId).single();
  const cg = settings?.cargus_config as CargusConfig | null;
  const sg = settings?.sameday_config as SamedayConfig | null;
  const fc = settings?.fan_courier_config as FanCourierConfig | null;
  const dg = settings?.dpd_config as DpdConfig | null;
  const gl = settings?.gls_config as GlsConfig | null;
  const pe = settings?.pallex_config as PallExConfig | null;
  const enabled: Record<Exclude<BulkCourier, "auto">, boolean> = {
    cargus: !!(cg?.enabled && cg?.username && cg?.subscription_key && cg?.location_id),
    sameday: !!(sg?.enabled && sg?.username && sg?.pickup_point_id),
    fancourier: !!(fc?.enabled && fc?.username && fc?.client_id),
    dpd: !!(dg?.enabled && dg?.username && dg?.client_id),
    /*
     * ⚠ Aceeasi lista de campuri ca in `configSiComanda` din gls.actions.ts. Daca
     * aici ar lipsi `client_number`, lotul ar porni pe comenzi pe care actiunea
     * per comanda le refuza oricum — adica 50 de esecuri raportate una cate una,
     * in loc de un singur mesaj limpede „GLS nu e configurat".
     */
    gls: !!(gl?.enabled && gl?.username && gl?.password && gl?.client_number),
    /* Aceeasi regula ca in `configSiComanda` din pallex.actions.ts, scrisa o
       singura data in `pallexGata` — vezi comentariul de acolo. */
    pallex: pallexGata(pe),
  };

  if (courier !== "auto" && !enabled[courier]) return { error: "Curierul selectat nu este configurat." };
  if (courier === "auto" && !SUPPORTED_COURIERS.some((c) => enabled[c])) {
    return { error: "Niciun curier compatibil cu generarea in masa nu este conectat." };
  }

  const { data: orders } = await admin
    .from("orders")
    .select("id, order_number, customer_name, customer_phone, customer_email, total, subtotal, payment_method, payment_status, shipping_address, items, cargus_awb_number, sameday_awb_number, fan_courier_awb_number, dpd_shipment_id, gls_awb_number, pallex_awb_number")
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
    gls: "gls",
    pallex: "pallex", "pall-ex": "pallex",
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
      : target === "gls" ? row.gls_awb_number
      : target === "pallex" ? row.pallex_awb_number
      : row.dpd_shipment_id;
    if (existing) { result.skipped++; return; }

    const greutate = greutateaColetului(o.items, produse);
    // Si cele PARTIALE, nu doar cele fara nicio greutate: acelea sunt cazul
    // periculos — un numar incomplet care pleaca la curier fara interventie
    // umana. `dinCatalog` e fals in amandoua situatiile.
    //
    // ⚠ GLS e scutit, si nu din neglijenta: MyGLS NU primeste greutatea la
    // emitere (vezi `ColetGls` din lib/gls/client.ts — nu are camp de greutate),
    // coletul se cantareste la depozit. Semnalat aici, ar fi umplut logurile cu
    // avertismente despre o cifra care nu pleaca nicaieri — iar un avertisment
    // care striga mereu degeaba il face pe comerciant sa nu-l mai citeasca nici
    // cand e adevarat, la ceilalti curieri.
    if (target !== "gls" && !greutate.dinCatalog) peRezerva.push(o.order_number);

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
    case "gls": {
      /*
       * ⚠ GLS NU primeste greutatea: `ColetGls` n-are camp pentru ea, coletul se
       * cantareste la depozit. De aia `weight` nu apare mai jos — nu e o omisiune.
       *
       * ⚠ Strada se compune EXACT ca in `GlsAwbModal`, ca lotul si emiterea pe
       * bucata sa trimita acelasi text la curier. Doua compuneri diferite ar
       * insemna ca aceeasi comanda pleaca cu adrese diferite dupa cum a fost
       * apasat butonul — si diferenta s-ar vedea abia pe eticheta tiparita.
       */
      const laPunct = (addr.courier ?? "").toLowerCase().trim() === "gls"
        && addr.delivery_type === "locker"
        && !!addr.locker_id;
      return createGlsAwbAction(businessId, o.id, {
        destinatar: {
          nume: o.customer_name,
          strada: [street, streetNo].filter(Boolean).join(" ").trim(),
          oras: city,
          judet: county || null,
          codPostal: zip || null,
          tara: addr.country || "RO",
          telefon: o.customer_phone,
          email,
        },
        numarColete: 1,
        ramburs: cod,
        continut: content,
        servicii: laPunct ? { parcelShopId: addr.locker_id } : undefined,
      });
    }
    case "pallex": {
      /*
       * ⚠⚠ COMENZILE CU BANI NEINCASATI NU PLEACA IN LOT.
       *
       * Pall-Ex nu are ramburs, deloc. Pe bucata, formularul ii cere
       * comerciantului sa confirme explicit ca trimite oricum; in lot nu exista
       * niciun camp de confirmat si nimeni nu se uita la fiecare comanda.
       *
       * Trecute tacut, ar insemna zeci de paleti plecati cu marfa neplatita si
       * fara nicio cale de incasare — o greseala pe care n-o mai repara nimeni a
       * doua zi. Aici iese ca EROARE, cu numele comenzii, si comerciantul o
       * termina din formularul ei.
       */
      if (cod > 0) {
        return {
          error:
            `Comanda are ${cod.toFixed(2)} lei neincasati, iar Pall-Ex nu incaseaza la livrare. `
            + "Emite partida din comanda, unde poti confirma explicit.",
        };
      }
      /*
       * ⚠ Strada, judetul si codul postal se compun EXACT ca in `PallexAwbModal`,
       * ca lotul si emiterea pe bucata sa trimita acelasi text la curier. Doua
       * compuneri diferite ar insemna ca aceeasi comanda pleaca cu adrese diferite
       * dupa cum a fost apasat butonul.
       *
       * Datele si ferestrele orare se lasa NECOMPLETATE dinadins: actiunea le
       * calculeaza din configurarea magazinului, deci lotul si formularul cad pe
       * aceleasi valori implicite.
       */
      return createPallexAwbAction(businessId, o.id, {
        destinatar: {
          nume: o.customer_name,
          strada: [street, streetNo].filter(Boolean).join(" ").trim() || addressLine,
          oras: city,
          judet: county || null,
          codPostal: zip || null,
          telefon: o.customer_phone,
        },
        numarPaleti: 1,
        greutateKg: weight,
        observatii: content.slice(0, 100),
      });
    }
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
): Promise<{ updated: number; esuate?: number } | { error: string }> {
  const g = await guardBusiness(businessId);
  if ("error" in g) return g;
  if (!(status in ORDER_STATUS)) return { error: "Status invalid." };
  const ids = cleanIds(orderIds);
  if (ids.length === 0) return { error: "Nicio comanda selectata." };

  const admin = createAdminClient();
  /*
   * FIECARE COMANDA TRECE PRIN ACEEASI TRANZACTIE CA IN PANOU.
   *
   * Pana acum lotul facea un UPDATE peste tot, apoi umbla pe rand la cupon si la
   * stoc, si NU se uita la eroarea niciunui RPC. Pe 50 de comenzi puteai ajunge
   * la 50 de statusuri corecte si 3 inventare gresite, raportate ca „50
   * actualizate" — iar anularea in lot e chiar calea pe care pleaca majoritatea
   * anularilor (sase din opt, masurat).
   *
   * Un apel pe comanda in loc de un UPDATE peste tot: lotul e o actiune din
   * panou, pe zeci de comenzi, nu o cale fierbinte. Corectitudinea per comanda
   * face mai mult decat un dus-intors economisit.
   */
  const reusite: { id: string; payment_status: string }[] = [];
  const cazute: string[] = [];
  for (const id of ids) {
    const { data: t, error: eT } = await admin.rpc("aplica_tranzitia_comenzii", {
      p_order_id: id, p_status: status, p_payment_status: null,
      // Limita de magazin: fara ea, un POST direct pe actiune cu id-uri din ALT
      // magazin le-ar fi mutat statusul si le-ar fi eliberat stocul. Interogarea
      // veche o avea (`.eq("business_id", ...)`), apelul per comanda a pierdut-o.
      p_business_id: businessId,
    });
    const r = t as unknown as {
      gasit?: boolean; plata_veche?: string; cupon?: string; stoc?: string; negative?: unknown[];
    } | null;
    if (eT || r?.gasit !== true) {
      // Comanda asta n-a fost mutata deloc — nici statusul, nici stocul. Se
      // numara separat si NU intra in „actualizate": un lot care raporteaza mai
      // mult decat a facut e mai rau decat unul care raporteaza un esec.
      cazute.push(id);
      await logError({ action: "bulkUpdateOrderStatus", message: eT?.message ?? "tranzitie fara raspuns valid", details: { orderId: id, status, raspuns: r }, businessId, userId: g.userId, severity: "critical" });
      continue;
    }
    reusite.push({ id, payment_status: r.plata_veche ?? "" });
    if (r.stoc === "necunoscut") {
      logError({ action: "bulkUpdateOrderStatus.stoc", message: "Comanda e dinainte de inregistrarea stocului rezervat; stocul NU s-a dat inapoi automat.", details: { orderId: id }, businessId, userId: g.userId, severity: "warning" });
    }
    if (Array.isArray(r.negative) && r.negative.length > 0) {
      logError({ action: "bulkUpdateOrderStatus.stoc", message: "Reactivarea comenzii a dus stocul sub zero: marfa s-a vandut altcuiva intre timp.", details: { orderId: id, negative: r.negative }, businessId, userId: g.userId, severity: "warning" });
    }
    if (r.cupon === "plin") {
      logError({ action: "bulkUpdateOrderStatus.cupon", message: "Cuponul si-a atins limita intre anulare si reactivare; comanda ramane cu reducerea, necontorizata.", details: { orderId: id }, businessId, userId: g.userId, severity: "warning" });
    }
  }

  // Facturarea automata ramane in afara tranzactiei, deliberat: e o chemare la un
  // furnizor din afara, care poate dura sau pica, si n-are voie sa tina lacatul pe
  // comanda — nici s-o dea inapoi daca esueaza.
  for (const row of reusite) {
    void maybeAutoInvoice(businessId, row.id, status, row.payment_status);
  }

  revalidatePath("/dashboard/orders");
  return { updated: reusite.length, ...(cazute.length ? { esuate: cazute.length } : {}) };
}
