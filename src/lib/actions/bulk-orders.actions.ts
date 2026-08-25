"use server";

import { revalidatePath } from "next/cache";
import { marketplaceCareTineComanda } from "@/lib/orders/origin";
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
import { createPostaAwbAction } from "@/lib/actions/posta.actions";
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
import { postaGata, type PostaConfig } from "@/lib/posta/client";
import { innoshipGata, type InnoshipConfig } from "@/lib/innoship/client";
import { createInnoshipAwbAction } from "@/lib/actions/innoship.actions";
import { createPacketaAwbAction } from "@/lib/actions/packeta.actions";
import { packetaGata, type PacketaConfig } from "@/lib/packeta/client";
import { createSmartshipAwbAction } from "@/lib/actions/smartship.actions";
import { smartshipGata, type SmartshipConfig } from "@/lib/smartship/client";
import { createShipoAwbAction } from "@/lib/actions/shipo.actions";
import { shipoGata, type ShipoConfig } from "@/lib/shipo/client";
import { createFedexAwbAction } from "@/lib/actions/fedex.actions";
import { fedexGata, type FedexConfig } from "@/lib/fedex/client";
import { createUpsAwbAction } from "@/lib/actions/ups.actions";
import { upsGata, type UpsConfig } from "@/lib/ups/client";
import { createDhlAwbAction } from "@/lib/actions/dhl.actions";
import { dhlGata, type DhlConfig } from "@/lib/dhl/client";
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
export type BulkCourier = "auto" | "cargus" | "sameday" | "fancourier" | "dpd" | "gls" | "pallex" | "posta" | "innoship" | "packeta" | "smartship" | "shipo" | "fedex" | "ups" | "dhl";
const SUPPORTED_COURIERS: Exclude<BulkCourier, "auto">[] = ["cargus", "sameday", "fancourier", "dpd", "gls", "pallex", "posta", "innoship", "packeta", "smartship", "shipo", "fedex", "ups", "dhl"];

interface ShippingAddr {
  county?: string; city?: string; address?: string; street?: string; street_no?: string;
  postal_code?: string; country?: string; courier?: string; delivery_type?: string; locker_id?: string;
  /* Localitatea, judetul si codul postal ALE PUNCTULUI de ridicare. La livrarea
     in punct adresa de livrare e a lui, nu a clientului. */
  locker_city?: string; locker_county?: string; locker_post_code?: string;
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
    .select("cargus_config, sameday_config, fan_courier_config, dpd_config, gls_config, pallex_config, posta_config, innoship_config, packeta_config, smartship_config, shipo_config, fedex_config, ups_config, dhl_config")
    .eq("business_id", businessId).single();
  const cg = settings?.cargus_config as CargusConfig | null;
  const sg = settings?.sameday_config as SamedayConfig | null;
  const fc = settings?.fan_courier_config as FanCourierConfig | null;
  const dg = settings?.dpd_config as DpdConfig | null;
  const gl = settings?.gls_config as GlsConfig | null;
  const pe = settings?.pallex_config as PallExConfig | null;
  const po = settings?.posta_config as PostaConfig | null;
  const io = settings?.innoship_config as InnoshipConfig | null;
  const pk = settings?.packeta_config as PacketaConfig | null;
  const ss = settings?.smartship_config as SmartshipConfig | null;
  const sh = settings?.shipo_config as ShipoConfig | null;
  const fx = settings?.fedex_config as FedexConfig | null;
  const up = settings?.ups_config as UpsConfig | null;
  const dh = settings?.dhl_config as DhlConfig | null;
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
    /* Aceeasi regula ca in `configSiComanda` din posta.actions.ts, scrisa o
       singura data in `postaGata`. Include si `cod_trimitere`: fara el, lotul ar
       porni pe comenzi pe care actiunea per comanda le refuza oricum — adica 50
       de esecuri raportate unul cate unul, in loc de un mesaj limpede. */
    posta: postaGata(po),
    /* Aceeasi regula ca in `innoshipGata`: cheia de API si id-ul depozitului.
       Fara al doilea, fiecare comanda ar fi refuzata de actiune oricum. */
    innoship: innoshipGata(io),
    /* Aceeasi regula ca in `packetaGata`: parola API si eticheta de expeditor.
       ⚠ La Packeta lotul e mai delicat decat oriunde: API-ul lor nu are anulare,
       deci fiecare colet creat din greseala trebuie sters de mana din contul lor.
       De aia conditia include `eshop` — fara el actiunea refuza oricum fiecare
       comanda, si ar iesi 50 de esecuri in loc de un mesaj limpede. */
    packeta: packetaGata(pk),
    /* Aceeasi regula ca in `smartshipGata`: cheia de API SI adresa de ridicare cu
       id-ul ei de localitate. Fara ea, fiecare comanda ar fi refuzata de actiune
       oricum — adica 50 de esecuri in loc de un mesaj limpede. */
    smartship: smartshipGata(ss),
    /* Aceeasi regula ca in `shipoGata`: cheia de API SI adresa de ridicare. Fara
       ea, fiecare comanda ar fi refuzata de actiune oricum — adica 50 de esecuri
       in loc de un mesaj limpede. */
    shipo: shipoGata(sh),
    /* Aceeasi regula ca in `fedexGata`: amandoua credentialele, contul si adresa
       de expeditie. Fara ea, fiecare comanda ar fi refuzata de actiune oricum —
       adica 50 de esecuri in loc de un mesaj limpede. */
    fedex: fedexGata(fx),
    /* Aceeasi regula ca in `upsGata`: amandoua credentialele, contul de sase caractere
       si adresa de expeditie. Fara ea, fiecare comanda ar fi refuzata de actiune oricum
       — adica 50 de esecuri in loc de un mesaj limpede. */
    ups: upsGata(up),
    /* Aceeasi regula ca in `dhlGata`: utilizatorul, parola, numarul de cont si adresa
       de expeditie cu cod postal. Fara ea, fiecare comanda ar fi refuzata de actiune
       oricum — adica 50 de esecuri in loc de un mesaj limpede. */
    dhl: dhlGata(dh),
  };

  if (courier !== "auto" && !enabled[courier]) return { error: "Curierul selectat nu este configurat." };
  if (courier === "auto" && !SUPPORTED_COURIERS.some((c) => enabled[c])) {
    return { error: "Niciun curier compatibil cu generarea in masa nu este conectat." };
  }

  const { data: orders } = await admin
    .from("orders")
    /* ⚠ Coloana de AWB trebuie CERUTA aici, nu doar tratata in `existing` mai jos:
       ce nu se selecteaza vine `undefined`, iar verificarea de idempotenta ar trece
       pe langa — lotul ar reincerca emiterea pe comenzi care au deja AWB. Registrul
       ar prinde duplicatul, dar comanda ar fi numarata „generata" in loc de
       „sarita", si la Posta s-ar consuma cate un cod din plaja la fiecare rulare.
       Aceeasi lectie ca la `COURIER_FIELDS` din aboutyou/sync.ts. */
    .select("id, order_number, customer_name, customer_phone, customer_email, total, subtotal, payment_method, payment_status, shipping_address, items, cargus_awb_number, sameday_awb_number, fan_courier_awb_number, dpd_shipment_id, gls_awb_number, pallex_awb_number, posta_awb_number, innoship_awb_number, packeta_packet_id, smartship_awb_number, shipo_awb_number, fedex_awb_number, ups_awb_number, dhl_awb_number")
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
    posta: "posta", "posta-romana": "posta",
    innoship: "innoship",
    packeta: "packeta",
    smartship: "smartship",
    /* ⚠ O cheie lipsa aici NU cade la tsc (`Record<string, …>`): modul „AWB dupa
       client" ar sari TACUT peste comenzile Shipo si le-ar raporta drept „sarite",
       nu „esuate". */
    shipo: "shipo",
    fedex: "fedex",
    ups: "ups",
    /* ⚠ Cheia trebuie sa fie sir-cu-sir ce scrie checkout-ul in
       `shipping_address.courier` — vezi `CourierSelector`. Lipsa, modul „AWB dupa
       client" ar sari TACUT peste comenzile DHL si le-ar raporta „sarite". */
    dhl: "dhl",
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
      : target === "posta" ? row.posta_awb_number
      : target === "innoship" ? row.innoship_awb_number
      /* ⚠ Packeta n-are „awb_number", ci `packeta_packet_id`. Fara randul asta ar
         fi cazut pe `dpd_shipment_id` — adica un lot Packeta ar fi sarit comenzile
         care au AWB la DPD si ar fi reemis pe cele care au deja colet la Packeta.
         La un furnizor fara anulare, al doilea colet nu se mai poate sterge. */
      : target === "packeta" ? row.packeta_packet_id
      /* ⚠ Fara randul asta, un lot SmartShip ar fi cazut pe `dpd_shipment_id`:
         ar fi sarit comenzile cu AWB la DPD si ar fi reemis pe cele care au deja
         AWB la SmartShip — adica un al doilea transport platit pe aceeasi comanda.
         Registrul l-ar prinde, dar comanda ar fi numarata gresit. */
      : target === "smartship" ? row.smartship_awb_number
      : target === "shipo" ? row.shipo_awb_number
      : target === "fedex" ? row.fedex_awb_number
      : target === "ups" ? row.ups_awb_number
      /* ⚠ La DHL randul asta e mai scump decat oriunde: nu exista anulare de
         expediere in API-ul lor (`delete:` apare o singura data in toata
         specificatia, si aia pe ridicare). Cazut pe `dpd_shipment_id`, lotul ar
         reemite pe o comanda care are deja AWB la DHL — al doilea colet platit, pe
         care nimeni nu-l mai poate sterge. */
      : target === "dhl" ? row.dhl_awb_number
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
      /*
       * ⚠ Codul postal lipseste aproape mereu pe comenzile romanesti (checkout-ul
       * il cere doar la livrarea internationala). NU se opreste lotul pentru asta:
       * `createGlsAwbAction` il completeaza din punctele GLS ale aceluiasi oras si
       * scrie in avertismentele operatiei ca l-a pus el. Refuzul ramane doar
       * pentru localitatile in care GLS n-are niciun punct.
       */
      return createGlsAwbAction(businessId, o.id, {
        destinatar: {
          nume: o.customer_name,
          strada: street,
          /* Numarul se trimite separat cand exista: asa nu mai trebuie ghicit din
             text si nu se mai pierde la taierea strazii la 40 de caractere. */
          numar: streetNo || null,
          /* ⚠ La punct, localitatea, judetul si codul postal sunt ALE PUNCTULUI.
             Strada vine oricum de acolo (checkout-ul o scrie in comanda), deci
             amestecate cu orasul clientului ar da o adresa care nu exista.
             Aceeasi regula ca la FAN Courier. */
          oras: (laPunct ? addr.locker_city : "") || city,
          judet: ((laPunct ? addr.locker_county : "") || county) || null,
          codPostal: ((laPunct ? addr.locker_post_code : "") || zip) || null,
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
    case "packeta": {
      /*
       * ⚠ Adresa se compune EXACT ca in `PacketaAwbModal`: doua compuneri diferite
       * ar insemna ca aceeasi comanda pleaca cu adrese diferite dupa cum a fost
       * apasat butonul, iar la Packeta greseala nu se mai poate desface.
       *
       * ⚠ Destinatia (`addressId`) vine din alegerea cumparatorului. Cand comanda
       * n-are una, lotul NU ghiceste un curier: actiunea refuza comanda cu un
       * mesaj limpede. La un furnizor fara anulare, un colet trimis din presupunere
       * ar fi cea mai scumpa greseala cu putinta.
       */
      const laPunct = (addr.courier ?? "").toLowerCase().trim() === "packeta"
        && addr.delivery_type === "locker"
        && !!addr.locker_id;
      return createPacketaAwbAction(businessId, o.id, {
        destinatar: {
          nume: o.customer_name,
          strada: street,
          numar: streetNo || null,
          oras: (laPunct ? addr.locker_city : "") || city,
          judet: ((laPunct ? addr.locker_county : "") || county) || null,
          codPostal: ((laPunct ? addr.locker_post_code : "") || zip) || null,
          telefon: o.customer_phone,
          email,
        },
        greutateKg: weight,
        valoare: Number(o.total) || 0,
        ramburs: cod,
        addressId: laPunct ? (addr.locker_id ?? "") : "",
      });
    }

    case "posta": {
      /*
       * ⚠ Adresa se compune EXACT ca in `PostaAwbModal`, ca lotul si emiterea pe
       * bucata sa trimita acelasi text la Posta. Doua compuneri diferite ar
       * insemna ca aceeasi comanda pleaca cu adrese diferite dupa cum a fost
       * apasat butonul — si diferenta s-ar vedea abia pe eticheta tiparita.
       *
       * ⚠ Livrarea la OFICIU (post-restant) se recunoaste dupa alegerea din
       * checkout, la fel ca punctele GLS. Acolo `locker_id` e chiar `idOficiuPR`,
       * iar localitatea si judetul sunt ALE OFICIULUI, nu ale clientului.
       *
       * Data de prezentare se lasa NECOMPLETATA dinadins: actiunea o calculeaza
       * din configurarea magazinului, deci lotul si formularul cad pe aceleasi
       * valori implicite.
       */
      const laOficiu = (addr.courier ?? "").toLowerCase().trim() === "posta"
        && addr.delivery_type === "locker"
        && !!addr.locker_id;
      return createPostaAwbAction(businessId, o.id, {
        destinatar: {
          nume: o.customer_name,
          strada: street,
          numar: streetNo || null,
          oras: (laOficiu ? addr.locker_city : "") || city,
          judet: ((laOficiu ? addr.locker_county : "") || county) || null,
          codPostal: ((laOficiu ? addr.locker_post_code : "") || zip) || null,
          telefon: o.customer_phone,
          email,
        },
        greutateKg: weight,
        continut: content,
        ramburs: cod,
        valoareMarfa: Number(o.total) || 0,
        postRestant: laOficiu,
        idOficiuPR: laOficiu ? addr.locker_id : null,
      });
    }
    case "innoship": {
      /*
       * ⚠ Alegerea cumparatorului din checkout se duce INTREAGA, toate cele trei
       * parti ale cheii. Pastrat doar curierul, lotul ar emite pe alt serviciu
       * decat cel cotat si platit — iar diferenta o suporta comerciantul.
       *
       * Cand comanda n-are alegerea salvata (a fost facuta inainte de integrare,
       * sau pe alt curier), campurile pleaca goale: atunci `corpComanda` cade pe
       * serviciul implicit din configurare, iar Innoship alege singur curierul
       * dupa regulile contului.
       */
      const laPunct = (addr.courier ?? "").toLowerCase().trim() === "innoship"
        && addr.delivery_type === "locker"
        && !!addr.locker_id;
      const ales = addr as ShippingAddr & {
        innoship_courier_id?: number;
        innoship_service_id?: number;
        innoship_option_id?: string;
        innoship_courier_name?: string;
        innoship_service_name?: string;
      };

      return createInnoshipAwbAction(businessId, o.id, {
        destinatar: {
          nume: o.customer_name,
          persoanaContact: o.customer_name,
          strada: street,
          numar: streetNo || null,
          /* La punct, localitatea si judetul sunt ALE PUNCTULUI, nu ale clientului. */
          oras: (laPunct ? addr.locker_city : "") || city,
          judet: ((laPunct ? addr.locker_county : "") || county) || null,
          codPostal: ((laPunct ? addr.locker_post_code : "") || zip) || null,
          telefon: o.customer_phone,
          email,
        },
        greutateKg: weight,
        continut: content,
        ramburs: cod,
        valoareDeclarata: Number(o.total) || 0,
        felLivrare: laPunct ? "locker" : "domiciliu",
        fixedLocationId: laPunct ? addr.locker_id : null,
        courierId: ales.innoship_courier_id ?? null,
        serviceId: ales.innoship_service_id ?? null,
        optionId: ales.innoship_option_id ?? null,
        courierName: ales.innoship_courier_name ?? null,
        serviceName: ales.innoship_service_name ?? null,
      });
    }
    case "smartship": {
      /*
       * ⚠ Adresa se compune EXACT ca in `SmartshipAwbModal`, ca lotul si emiterea
       * pe bucata sa trimita acelasi text: doua compuneri diferite ar insemna ca
       * aceeasi comanda pleaca cu adrese diferite dupa cum a fost apasat butonul.
       *
       * ⚠ Si adresa ramane A CLIENTULUI chiar si la locker — pe dos fata de
       * Innoship si Posta de mai sus. SmartShip ruteaza dupa `locker_id`, iar
       * adresa e datele de contact ale destinatarului; inlocuita cu a lockerului,
       * curierul n-ar mai avea pe cine suna cand ceva nu merge.
       *
       * ⚠ Alegerea cumparatorului se duce INTREAGA: curierul SI contractul pe care
       * a fost cotata oferta. Pastrat doar curierul, lotul ar putea emite pe
       * celalalt contract — la alt pret decat cel platit de client.
       */
      const laLocker = (addr.courier ?? "").toLowerCase().trim() === "smartship"
        && addr.delivery_type === "locker"
        && !!addr.locker_id;
      const ales = addr as ShippingAddr & {
        smartship_courier_id?: number;
        smartship_courier_name?: string;
        smartship_own_contract?: boolean;
      };

      /*
       * ⚠ SmartShip cere `courier_id` la emitere — nu are „alege tu". Fara alegerea
       * clientului, lotul NU ghiceste un curier: actiunea refuza comanda cu un
       * mesaj limpede, si comerciantul o emite din modal, unde vede preturile.
       */
      return createSmartshipAwbAction(businessId, o.id, {
        destinatar: {
          nume: o.customer_name,
          strada: street,
          numar: streetNo || null,
          oras: city,
          judet: county || null,
          codPostal: zip || null,
          telefon: o.customer_phone,
          email,
        },
        greutateKg: weight,
        continut: content,
        ramburs: cod,
        valoareDeclarata: Number(o.total) || 0,
        felLivrare: laLocker ? "locker" : "domiciliu",
        lockerId: laLocker ? addr.locker_id : null,
        courierId: ales.smartship_courier_id ?? null,
        contractPropriu: ales.smartship_own_contract === true,
        courierName: ales.smartship_courier_name ?? null,
      });
    }
    case "shipo": {
      /*
       * ⚠ Adresa se compune EXACT ca in `ShipoAwbModal`, ca lotul si emiterea pe
       * bucata sa trimita acelasi text.
       *
       * ⚠ Si adresa ramane A CLIENTULUI chiar si la livrarea in punct: la Shipo
       * campurile de adresa nici nu se trimit atunci (`corpExpediere` le omite),
       * iar numele si telefonul sunt datele de contact ale destinatarului.
       *
       * ⚠ Lotul NU ghiceste serviciul. La Shipo `rate_id` e si identitatea
       * ofertei, si pretul: ales de noi, comanda ar putea pleca pe alt serviciu
       * decat cel platit de client — poate chiar la locker, unde adresa nu mai
       * inseamna nimic. Fara alegerea clientului, actiunea refuza comanda cu un
       * mesaj limpede si comerciantul o emite din modal, unde vede preturile.
       */
      const ales = addr as ShippingAddr & {
        shipo_rate_id?: number;
        shipo_courier_slug?: string;
        shipo_courier_name?: string;
        locker_name?: string;
      };
      const laPunct = (addr.courier ?? "").toLowerCase().trim() === "shipo"
        && addr.delivery_type === "locker"
        && !!addr.locker_id;

      return createShipoAwbAction(businessId, o.id, {
        destinatar: {
          nume: o.customer_name,
          strada: street,
          numar: streetNo || null,
          oras: city,
          judet: county || null,
          codPostal: zip || null,
          telefon: o.customer_phone,
          email,
        },
        greutateKg: weight,
        continut: content,
        ramburs: cod,
        valoareDeclarata: Number(o.total) || 0,
        felLivrare: laPunct ? "locker" : "domiciliu",
        punctId: laPunct ? Number(addr.locker_id) || null : null,
        punctNume: laPunct ? (ales.locker_name ?? null) : null,
        rateId: ales.shipo_rate_id ?? null,
        courierSlug: ales.shipo_courier_slug ?? null,
        courierName: ales.shipo_courier_name ?? null,
      });
    }
    case "fedex": {
      /*
       * ⚠ Adresa se compune EXACT ca in `FedexAwbModal`, ca lotul si emiterea pe
       * bucata sa trimita acelasi text.
       *
       * ⚠ CU RAMBURS NU SE EMITE, si asta se opreste aici, nu la ei: FedEx a retras
       * C.O.D. in iulie 2023. Actiunea ar refuza oricum comanda (`lipsuriExpediere`),
       * dar mesajul de acolo e o insiruire de lipsuri — aici iese un singur rand
       * limpede, si comerciantul stie imediat sa treaca comanda pe alt curier.
       *
       * ⚠ Si lotul NU ghiceste serviciul, ca la Shipo: `serviceType` e si identitatea
       * ofertei, si pretul. Ales de noi, comanda ar putea pleca pe FedEx First (cel
       * mai scump) in loc de FedEx Priority, iar diferenta o suporta comerciantul.
       * Fara alegerea clientului, `createFedexAwbAction` cade pe implicit — deci il
       * cerem explicit aici.
       */
      if (cod > 0) {
        return { error: "FedEx nu ofera ramburs. Comanda are plata la livrare — expediaz-o cu alt curier." };
      }

      const ales = addr as ShippingAddr & {
        fedex_service_type?: string;
        fedex_service_name?: string;
      };
      const serviciu = (ales.fedex_service_type ?? "").trim();
      if (!serviciu) {
        return {
          error:
            "Comanda n-are serviciul FedEx ales de client. Emite-o din pagina comenzii, "
            + "unde vezi preturile si termenele — lotul n-are voie sa aleaga in locul tau.",
        };
      }

      return createFedexAwbAction(businessId, o.id, {
        destinatar: {
          nume: o.customer_name,
          strada: street,
          numar: streetNo || null,
          oras: city,
          judet: county || null,
          codPostal: zip || null,
          telefon: o.customer_phone,
          email,
          tara: addr.country || "RO",
        },
        greutateKg: weight,
        continut: content,
        valoareComanda: Number(o.total) || 0,
        serviceType: serviciu,
        serviceName: ales.fedex_service_name ?? null,
      });
    }
    case "ups": {
      /*
       * ⚠ Adresa se compune EXACT ca in `UpsAwbModal`, ca lotul si emiterea pe bucata sa
       * trimita acelasi text.
       *
       * ⚠ Si lotul NU ghiceste serviciul, ca la Shipo si FedEx. La UPS asta e mai
       * scump decat oriunde: `Service.Code` lipsa nu produce nicio eroare, produce o
       * factura. Ghidul lor romanesc, verbatim: „Daca nicio optiune de serviciu nu este
       * selectata de dvs., atunci expedierea se va efectua si **factura automat prin UPS
       * Express**" — cel mai scump produs al lor. Fara alegerea clientului, comanda se
       * emite din pagina ei, unde comerciantul vede preturile.
       *
       * ⚠ RAMBURSUL, in schimb, NU se opreste aici — spre deosebire de FedEx. UPS il
       * ofera (la nivel de EXPEDIERE, doar cu origine in Uniunea Europeana), iar cand
       * contul comerciantului nu-l suporta, `createUpsAwbAction` raspunde cu motivul lor.
       */
      const ales = addr as ShippingAddr & {
        ups_service_code?: string;
        ups_service_name?: string;
      };

      /*
       * ⚠ COMANDA CU RIDICARE DIN PUNCT NU SE EMITE IN LOT, si asta e o poarta, nu o
       * comoditate.
       *
       * `AlternateDeliveryAddress` cere NUMELE si ADRESA punctului, nu doar id-ul lui —
       * iar in lot avem din `shipping_address` doar `locker_id` si cateva campuri.
       * Emisa fara containerul acela, expedierea pleaca la adresa CUMPARATORULUI: nu
       * cade nimic, nimeni nu afla, iar omul isi asteapta coletul intr-un punct in care
       * nu ajunge niciodata. E chiar clasa de defecte pe care o evitam peste tot.
       */
      if (ales.delivery_type === "locker" || (ales.locker_id ?? "").trim()) {
        return {
          error:
            "Comanda are livrare intr-un punct UPS Access Point. Emite-o din pagina comenzii: "
            + "lotul n-are adresa punctului, iar fara ea coletul ar pleca la adresa clientului.",
        };
      }

      const serviciu = (ales.ups_service_code ?? "").trim();
      if (!serviciu) {
        return {
          error:
            "Comanda n-are serviciul UPS ales de client. Emite-o din pagina comenzii, unde vezi preturile "
            + "si termenele — lotul n-are voie sa aleaga in locul tau, iar UPS factureaza implicit cel mai "
            + "scump serviciu cand nu i se cere unul anume.",
        };
      }

      return createUpsAwbAction(businessId, o.id, {
        destinatar: {
          nume: o.customer_name,
          strada: street,
          numar: streetNo || null,
          oras: city,
          judet: county || null,
          codPostal: zip || null,
          telefon: o.customer_phone,
          email,
          tara: addr.country || "RO",
        },
        greutateKg: weight,
        continut: content,
        ramburs: cod,
        valoareComanda: Number(o.total) || 0,
        serviceCode: serviciu,
        serviceName: ales.ups_service_name ?? null,
        /*
         * ⚠ Punctul de ridicare NU se ia din lot.
         *
         * `AlternateDeliveryAddress` cere numele, adresa si id-ul punctului, iar in lot
         * avem doar `locker_id` din `shipping_address` — nu si adresa lui. O emitere fara
         * adresa punctului ar cadea la ei, sau (mai rau) ar livra la adresa
         * cumparatorului o comanda pe care el o astepta intr-un punct.
         */
        punct: null,
      });
    }
    case "dhl": {
      /*
       * ⚠ Adresa se compune EXACT ca in `DhlAwbModal`, ca lotul si emiterea pe bucata
       * sa trimita acelasi text.
       *
       * ⚠⚠ CU RAMBURS NU SE EMITE, si asta se opreste aici, nu la ei: DHL Express NU
       * vinde plata la livrare din Romania. In checkout optiunea DHL nici nu apare pe
       * comenzile cu ramburs — dar o comanda poate ajunge aici si pe alt drum (curier
       * schimbat din panou, sau lot pornit EXPLICIT pe „DHL" peste o selectie mixta).
       * Fara randul asta, cererea ar pleca la DHL fara ramburs si coletul ar fi livrat
       * FARA sa se incaseze banii de la cumparator — adica marfa data pe gratis, nu o
       * eroare vizibila.
       */
      if (cod > 0) {
        return {
          error:
            "DHL Express nu ofera plata la livrare din Romania. Comanda are ramburs de incasat — "
            + "expediaz-o cu alt curier, altfel coletul pleaca fara sa se incaseze nimic.",
        };
      }

      /*
       * ⚠⚠ Si lotul NU ghiceste produsul. La DHL asta nu e o chestiune de pret, ca la
       * UPS: `productCode` e in `required` la `POST /shipments`, deci DHL REFUZA
       * cererea, nu o factureaza pe cel mai scump. Iar la livrarile interne mai cere si
       * `localProductCode` — care NU se compune niciodata de noi, se copiaza LITERAL din
       * cotare (documentatia lor se contrazice pe latimea lui: schema zice 1-3
       * caractere, exemplele scriu unul singur, codurile publicate de DHL UK au trei).
       *
       * Amandoua se pastreaza pe comanda la checkout (`dhl_product_code` /
       * `dhl_local_product_code`), din cotarea pe care a vazut-o clientul. Cand
       * lipsesc, comanda se emite din pagina ei, unde comerciantul vede preturile si
       * termenele.
       *
       * ⚠ NU exista caz de „livrare in punct" la DHL: `onDemandDelivery` cere un
       * `servicePointId` pe care DHL il da doar prin managerul de cont, deci DHL nu
       * apare deloc in checkout ca livrare in punct. De aia lipseste garda de locker
       * pe care o are UPS mai sus.
       */
      const ales = addr as ShippingAddr & {
        dhl_product_code?: string;
        dhl_product_name?: string;
        dhl_local_product_code?: string;
      };
      const produs = (ales.dhl_product_code ?? "").trim();
      if (!produs) {
        return {
          error:
            "Comanda n-are produsul DHL ales de client. Emite-o din pagina comenzii, unde vezi "
            + "preturile si termenele: la DHL codul produsului e obligatoriu la emitere, iar fara "
            + "el cererea e refuzata, nu ghicita.",
        };
      }

      return createDhlAwbAction(businessId, o.id, {
        destinatar: {
          nume: o.customer_name,
          strada: street,
          numar: streetNo || null,
          oras: city,
          judet: county || null,
          codPostal: zip || null,
          telefon: o.customer_phone,
          email,
          tara: addr.country || "RO",
        },
        greutateKg: weight,
        continut: content,
        valoareComanda: Number(o.total) || 0,
        productCode: produs,
        productName: ales.dhl_product_name ?? null,
        localProductCode: (ales.dhl_local_product_code ?? "").trim() || null,
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
): Promise<{ updated: number; esuate?: number; sarite?: number } | { error: string }> {
  const g = await guardBusiness(businessId);
  if ("error" in g) return g;
  if (!(status in ORDER_STATUS)) return { error: "Status invalid." };
  const idsCerute = cleanIds(orderIds);
  if (idsCerute.length === 0) return { error: "Nicio comanda selectata." };

  const admin = createAdminClient();

  /*
   * ═══ ⚠ COMENZILE TINUTE DE MARKETPLACE SE SAR (25.08.2026) ═══
   *
   * Lotul mergea direct in acelasi RPC ca panoul, fara sa se uite la origine. Deci o
   * anulare in masa care prindea si comenzi eMAG elibera stocul unor comenzi VII la ei —
   * marfa deja vanduta se reoferea in magazinul propriu — iar un „livrata" in masa putea
   * emite factura fiscala inainte de termen. Statusul se indrepta la urmatoarea citire;
   * factura, nu.
   *
   * ⚠ SE SAR, NU SE REFUZA TOT LOTUL. Selectia amestecata e cazul obisnuit: 20 din magazin
   * si 10 de la ei. Refuzand tot, omul ar fi ramas fara nicio cale de a le muta pe ale lui.
   *
   * ⚠ SI SE SPUNE CATE. Un „20 comenzi → Livrat" pentru 30 selectate, fara nicio vorba
   * despre celelalte zece, e chiar felul de tacere pe care il reparam peste tot.
   */
  const { data: origini, error: eOrigini } = await admin.from("orders")
    .select("id, order_source").eq("business_id", businessId).in("id", idsCerute);
  if (eOrigini) return { error: `Comenzile nu s-au putut citi: ${eOrigini.message}` };

  const tinuteDeEi = new Set(
    ((origini ?? []) as { id: string; order_source: unknown }[])
      .filter((o) => marketplaceCareTineComanda(o.order_source))
      .map((o) => o.id),
  );
  const ids = idsCerute.filter((id) => !tinuteDeEi.has(id));
  if (ids.length === 0) {
    return { error: "Toate comenzile selectate vin dintr-un marketplace care le ține starea. Schimb-o din contul de acolo." };
  }
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
  return {
    updated: reusite.length,
    ...(cazute.length ? { esuate: cazute.length } : {}),
    /* ⚠ Numai cand chiar s-a sarit ceva: un camp mereu prezent ar fi pus UI-ul sa
       spuna „0 sarite" la fiecare lot obisnuit. */
    ...(tinuteDeEi.size ? { sarite: tinuteDeEi.size } : {}),
  };
}
