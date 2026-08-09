// About You order ingestion. About You collects payment and delegates fulfillment
// to the seller: orders flow back to us via the order.created webhook (primary)
// and a polling safety net. Each ingested order becomes a normal Edinio order
// (order_source.marketplace = "aboutyou", payment already "paid") plus an
// aboutyou_orders side row holding the About You-specific per-item integer IDs,
// statuses and tracking keys needed to ship/cancel/return in Faza 4.
//
// Ingestion is idempotent on the About You order number. It does NOT go through
// the storefront checkout, so it never triggers Edinio payment capture, courier
// AWB generation, or auto-invoicing — those stay opt-in for marketplace orders.
//
// NOTE: the exact shipping-address shape and money units are confirmed on the
// sandbox. Money integer fields are treated as minor units (cents). Parsing is
// tolerant so ingestion keeps working as the shape is pinned down.

import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "@/lib/error-logger";
import type { Database } from "@/types/database.types";
import type { AboutYouSyncContext } from "./sync";
import { getOrders, isAboutYouError } from "./client";
import { cancelOrderItems, returnOrderItems } from "./client";
import type { AboutYouOrder, AboutYouOrderStatus } from "./types";

type Db = SupabaseClient<Database>;

function num(v: unknown): number { return typeof v === "number" && Number.isFinite(v) ? v : 0; }
// About You integer money fields are minor units (cents) -> main unit.
function money(v: unknown): number { return Math.round(num(v)) / 100; }

// Map an About You order status onto an Edinio order status. Only terminal
// marketplace states are reflected onto an existing order (open/shipped stay as
// the merchant manages them in Edinio).
function edinioStatusFor(ayStatus: string | undefined): string {
  if (ayStatus === "cancelled") return "cancelled";
  if (ayStatus === "returned") return "refunded";
  return "pending";
}

/*
 * Tara comenzii. `GetOrderSchema` NU are `shop_country` — are `shop`, care e un
 * intreg (id-ul magazinului About You), si `shipping_country_code`. Codul citea
 * `shop_country` si scria mereu null, deci tara in care s-a vandut se pierdea.
 * Tara de livrare e informatia utila si o avem.
 */
function shopCountry(order: AboutYouOrder): string | null {
  const o = order as unknown as Record<string, unknown>;
  const c = o.shipping_country_code ?? o.billing_country_code;
  return typeof c === "string" && c !== "" ? c.toUpperCase() : null;
}

interface ParsedAddress { name: string; phone: string; email: string | null; raw: Record<string, unknown> }

/*
 * Adresa de livrare NU vine ca obiect.
 *
 * `GetOrderSchema` are campurile PLATE pe comanda: `shipping_street`,
 * `shipping_zip_code`, `shipping_city`, `shipping_country_code`,
 * `shipping_recipient_first_name`, `customer_phone`, `customer_email`. Codul
 * cauta un `shipping_address` care nu exista nicaieri in schema, gasea un obiect
 * gol si scria „Client About You" cu telefon gol pe fiecare comanda — adica
 * nimeni nu putea nici sa livreze, nici sa sune clientul.
 *
 * Cand adresa de livrare lipseste, cadem pe cea de facturare: e mai bine decat
 * o comanda fara adresa. Livrarea la punct de colectare (`easybox` si echivalente)
 * vine prin `shipping_collection_point_*` si o pastram in forma pe care restul
 * aplicatiei o citeste deja: `delivery_type` + `locker_id`.
 */
function parseAddress(order: AboutYouOrder): ParsedAddress {
  const o = order as unknown as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" && o[k] !== "" ? (o[k] as string) : undefined);

  const nume = [str("shipping_recipient_first_name"), str("shipping_recipient_last_name")].filter(Boolean).join(" ")
    || [str("billing_recipient_first_name"), str("billing_recipient_last_name")].filter(Boolean).join(" ")
    || "Client About You";

  const strada = [str("shipping_street"), str("shipping_additional")].filter(Boolean).join(", ")
    || [str("billing_street"), str("billing_additional")].filter(Boolean).join(", ")
    || "";

  const punctColectare = str("shipping_collection_point_key");
  const raw: Record<string, unknown> = {
    address: strada,
    city: str("shipping_city") ?? str("billing_city") ?? "",
    postal_code: str("shipping_zip_code") ?? str("billing_zip_code") ?? "",
    country: str("shipping_country_code") ?? str("billing_country_code") ?? "",
    ...(punctColectare
      ? {
        delivery_type: "locker",
        locker_id: punctColectare,
        locker_name: str("shipping_collection_point_description") ?? null,
        collection_point_type: str("shipping_collection_point_type") ?? null,
      }
      : {}),
  };

  return {
    name: nume,
    phone: str("customer_phone") ?? "",
    email: str("customer_email") ?? null,
    raw,
  };
}

function toAyItems(order: AboutYouOrder) {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  return items.map((it) => ({
    order_item_id: it.id,
    sku: it.sku,
    status: it.status,
    price_with_tax: it.price_with_tax,
    price_without_tax: it.price_without_tax,
    vat: it.vat,
    shipment_tracking_key: it.shipment_tracking_key ?? null,
    return_tracking_key: it.return_tracking_key ?? null,
  }));
}

export async function ingestOrder(admin: Db, ctx: AboutYouSyncContext, order: AboutYouOrder): Promise<"created" | "updated" | "skipped"> {
  const ayNumber = typeof order.order_number === "string" ? order.order_number : undefined;
  if (!ayNumber) return "skipped";
  const now = new Date().toISOString();
  const ayItems = toAyItems(order);

  // Idempotency: an already-ingested order only refreshes its side-row (item
  // statuses + tracking); it is never recreated.
  const { data: existing } = await admin
    .from("aboutyou_orders").select("id, order_id")
    .eq("business_id", ctx.businessId).eq("aboutyou_order_number", ayNumber).maybeSingle();
  if (existing) {
    const ex = existing as { id: string; order_id: string | null };
    await admin.from("aboutyou_orders")
      .update({ items: ayItems as never, status: order.status ?? "open", last_synced_at: now, updated_at: now } as never)
      .eq("id", ex.id);
    // Reflect terminal marketplace states (cancelled/returned) onto the order.
    if (ex.order_id && (order.status === "cancelled" || order.status === "returned")) {
      await admin.from("orders")
        .update({ status: edinioStatusFor(order.status), updated_at: now } as never)
        .eq("id", ex.order_id).eq("business_id", ctx.businessId);
    }
    return "updated";
  }

  // Resolve product names from SKU (variant -> product) for a readable order.
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const skus = [...new Set(items.map((it) => it.sku).filter(Boolean))];
  const info = new Map<string, { productId: string | null; name: string; variantTitle: string | null }>();
  if (skus.length > 0) {
    const { data: vs } = await admin
      .from("aboutyou_variants").select("sku, product_id, variant_title" as never).eq("business_id", ctx.businessId).in("sku", skus);
    // `as never` pe select: coloana vine din migratia `2026-08-19-stoc-marketplace`
    // si nu apare inca in tipurile generate.
    const randuri = (vs ?? []) as unknown as { sku: string; product_id: string | null; variant_title: string | null }[];
    const prodIds = [...new Set(randuri.map((v) => v.product_id).filter(Boolean) as string[])];
    const prodName = new Map<string, string>();
    if (prodIds.length > 0) {
      const { data: ps } = await admin.from("products").select("id, name").in("id", prodIds);
      for (const p of ps ?? []) prodName.set(p.id, p.name);
    }
    for (const v of randuri) {
      info.set(v.sku, {
        productId: v.product_id,
        name: v.product_id ? (prodName.get(v.product_id) ?? "Produs About You") : "Produs About You",
        variantTitle: v.variant_title ?? null,
      });
    }
  }

  /*
   * Articolele anulate si returnate NU intra nici in total, nici in stoc.
   *
   * `GET /orders/` intoarce comanda cu toate liniile ei, inclusiv cele pe care
   * clientul le-a anulat sau returnat. Numarate, comanda arata o valoare pe care
   * nimeni n-a platit-o (raportarile ies umflate) si scadeam din stoc marfa care
   * s-a intors pe raft.
   */
  const activeItems = items.filter((it) => it.status !== "cancelled" && it.status !== "returned");

  const qtyByProduct = new Map<string, number>();
  const qtyByVariant = new Map<string, { product_id: string; variant_title: string; quantity: number }>();
  const edinioItems = items.map((it) => {
    const meta = info.get(it.sku);
    const q = (it as { quantity?: number }).quantity;
    const qty = typeof q === "number" ? q : 1;
    const activ = it.status !== "cancelled" && it.status !== "returned";
    if (activ && meta?.productId) {
      qtyByProduct.set(meta.productId, (qtyByProduct.get(meta.productId) ?? 0) + qty);
      if (meta.variantTitle) {
        const k = `${meta.productId}::${meta.variantTitle}`;
        const e = qtyByVariant.get(k);
        if (e) e.quantity += qty;
        else qtyByVariant.set(k, { product_id: meta.productId, variant_title: meta.variantTitle, quantity: qty });
      }
    }
    return {
      product_id: meta?.productId ?? null,
      name: meta?.name ?? `SKU ${it.sku}`,
      sku: it.sku,
      price: money(it.price_with_tax),
      quantity: qty,
      ...(activ ? {} : { status: it.status }),
    };
  });

  const subtotal = money(activeItems.reduce((s, it) => s + num(it.price_without_tax), 0));
  const total = money(activeItems.reduce((s, it) => s + num(it.price_with_tax), 0));
  const vatAmount = Math.round((total - subtotal) * 100) / 100;
  const addr = parseAddress(order);
  // Comenzile de pe About You sunt in EURO, iar `orders.total` e citit peste tot
  // ca lei. Marcam moneda in `order_source` ca sa nu para o comanda de 40 de lei.
  const moneda = typeof (order as unknown as Record<string, unknown>).currency_code === "string"
    ? ((order as unknown as Record<string, unknown>).currency_code as string).toUpperCase()
    : "EUR";

  const { data: created, error } = await admin.from("orders").insert({
    business_id: ctx.businessId,
    order_number: `AY-${ayNumber}`,
    customer_name: addr.name,
    customer_phone: addr.phone,
    customer_email: addr.email,
    shipping_address: { ...addr.raw, source: "aboutyou", shop_country: shopCountry(order) } as never,
    items: edinioItems as never,
    // Ce stoc a consumat comanda, ca anularea sau returul sa poata da INAPOI.
    // Din `items` nu se poate deduce: combinatia nu apare acolo deloc.
    stoc_rezervat: {
      produse: [...qtyByProduct.entries()].map(([product_id, quantity]) => ({ product_id, quantity })),
      variante: [...qtyByVariant.values()],
    } as never,
    subtotal,
    total,
    vat_amount: vatAmount,
    payment_method: "aboutyou",
    payment_status: "paid",
    status: edinioStatusFor(order.status),
    order_source: { marketplace: "aboutyou", order_number: ayNumber, currency: moneda } as never,
  } as never).select("id").single();

  /*
   * Recuperare dintr-un ingest partial: `order_number` e unic per magazin, deci
   * un insert cazut pe duplicat inseamna ca ordinea exista deja — ne legam de ea
   * si sarim scaderea de stoc, aplicata o data.
   *
   * ORICE ALT ESEC insa (retea, timeout, constrangere) nu inseamna „exista deja".
   * Inainte, si acolo raspundeam „skipped": comanda se pierdea definitiv, pentru
   * ca `pollOrders` avanseaza fereastra si nu se mai intoarce dupa ea. Acum
   * aruncam, iar apelantul o reia la urmatoarea trecere.
   */
  let orderId: string;
  let isNew = true;
  if (error || !created) {
    const { data: found } = await admin.from("orders").select("id")
      .eq("business_id", ctx.businessId).eq("order_number", `AY-${ayNumber}`).maybeSingle();
    if (!found) {
      throw new Error(`Comanda About You ${ayNumber} nu a putut fi salvată: ${error?.message ?? "motiv necunoscut"}`);
    }
    orderId = (found as { id: string }).id;
    isNew = false;
  } else {
    orderId = (created as { id: string }).id;
  }

  await admin.from("aboutyou_orders").upsert({
    business_id: ctx.businessId,
    order_id: orderId,
    aboutyou_order_number: ayNumber,
    shop_country: shopCountry(order),
    fulfillment_type: (typeof order.fulfillment_type === "string" ? order.fulfillment_type : null),
    status: order.status ?? "open",
    items: ayItems as never,
    last_synced_at: now,
  } as never, { onConflict: "business_id,aboutyou_order_number" });

  // Unified inventory: reflect the marketplace sale in Edinio stock (only on a
  // genuinely new order, never when recovering/re-linking an existing one).
  if (isNew) {
    const produse = [...qtyByProduct.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
    const variante = [...qtyByVariant.values()];
    if (produse.length > 0 || variante.length > 0) {
      // `{ error }`, nu `try/catch`: clientul Supabase nu arunca la eroare de SQL,
      // deci vechiul `catch` nu prindea nimic si stocul ramanea neatins, in tacere.
      const { data: rez, error } = await admin.rpc("consuma_stoc_marketplace" as never, {
        p_produse: produse, p_variante: variante,
      } as never);
      if (error) {
        await logError({
          action: "aboutyou/orders", message: `Stocul NU s-a scazut pentru comanda de marketplace: ${error.message}`,
          details: { produse, variante }, businessId: ctx.businessId, severity: "critical",
        });
      } else {
        const raspuns = rez as { lipsa?: unknown[]; consumat?: unknown } | null;
        /*
         * `stoc_rezervat` se REscrie cu ce s-a consumat CU ADEVARAT.
         *
         * Pe marketplace se plafoneaza (vanzarea s-a facut deja, n-o putem
         * refuza), deci „cerut" si „luat" chiar difera: o comanda de 2 dintr-o
         * marime care avea 1 consuma 1. Scris cu cererea, anularea ar fi pus
         * inapoi 2 — adica ar fi INVENTAT o bucata. Dovedit pe date sintetice
         * inainte de reparatie: marimea revenea la 2 dintr-un stoc initial de 1.
         */
        if (raspuns?.consumat) {
          const { error: eRez } = await admin.from("orders")
            .update({ stoc_rezervat: raspuns.consumat } as never)
            .eq("id", orderId);
          if (eRez) {
            await logError({
              action: "aboutyou/orders", message: `stoc_rezervat NU s-a putut corecta: ${eRez.message}`,
              details: { orderId }, businessId: ctx.businessId, severity: "critical",
            });
          }
        }
        const lipsa = raspuns?.lipsa ?? [];
        if (Array.isArray(lipsa) && lipsa.length > 0) {
          await logError({
            action: "aboutyou/orders",
            message: "Comanda de marketplace a cerut mai mult stoc decat exista; s-a scazut cat s-a putut.",
            details: { lipsa }, businessId: ctx.businessId, severity: "warning",
          });
        }
      }
    }
  }
  return isNew ? "created" : "updated";
}

/**
 * Aduce o comanda dupa numarul ei si o ingereaza (calea de webhook).
 *
 * NU arunca: ruta de webhook trebuie sa raspunda 200 orice s-ar intampla, altfel
 * About You reincearca din ora in ora, doua zile. O comanda care nu s-a putut
 * salva ramane oricum pe seama cronului, care intreaba direct `GET /orders/`.
 */
export async function ingestOrderByNumber(admin: Db, ctx: AboutYouSyncContext, orderNumber: string): Promise<void> {
  const res = await getOrders(ctx.auth, { order_number: orderNumber, per_page: 5 });
  if (isAboutYouError(res)) return;
  const order = (res.data?.items ?? []).find((o) => o.order_number === orderNumber) ?? res.data?.items?.[0];
  if (!order) return;
  try {
    await ingestOrder(admin, ctx, order);
  } catch (e) {
    console.error("[aboutyou] ingest comanda esuat", orderNumber, e instanceof Error ? e.message : e);
  }
}

/*
 * Aduce comenzile unui magazin (plasa de siguranta pentru webhookuri pierdute).
 *
 * DOUA CORECTURI FATA DE VARIANTA ANTERIOARA:
 *
 * 1. Se cer TOATE statusurile, nu doar `open`. Cerand doar comenzile deschise, o
 *    anulare sau un retur nu ajungeau niciodata in Edinio: comanda ramanea „in
 *    asteptare" pentru totdeauna, comerciantul o pregatea si o expedia degeaba.
 *
 * 2. `ok` devine `false` si cand paginarea s-a oprit inainte de ultima pagina.
 *    Apelantul avanseaza fereastra doar pe `ok`, iar inainte o avansa si dupa o
 *    parcurgere incompleta: comenzile din paginile neatinse nu mai erau cerute
 *    niciodata.
 */
// 40 x 50 = 2000 de comenzi per status intr-o singura trecere. Plafonul vechi de
// 5 pagini (250) putea bloca fereastra LA NESFARSIT: peste el, `ok` ramanea fals,
// filigranul nu avansa, si la minutul urmator se cereau exact aceleasi comenzi.
const MAX_PAGINI_COMENZI = 40;
const STATUSURI_DE_ADUS: AboutYouOrderStatus[] = ["open", "shipped", "cancelled", "returned", "mixed"];

export async function pollOrders(admin: Db, ctx: AboutYouSyncContext, since?: string): Promise<{ ingested: number; ok: boolean }> {
  let ingested = 0;
  let ok = true;

  for (const status of STATUSURI_DE_ADUS) {
    for (let page = 1; page <= MAX_PAGINI_COMENZI; page++) {
      const res = await getOrders(ctx.auth, { order_status: status, orders_from: since, page, per_page: 50 });
      if (isAboutYouError(res)) { ok = false; break; }
      const orders = res.data?.items ?? [];
      if (orders.length === 0) break;
      for (const o of orders) {
        try {
          if ((await ingestOrder(admin, ctx, o)) === "created") ingested++;
        } catch {
          // O comanda care nu s-a putut salva nu are voie sa mute fereastra.
          ok = false;
        }
      }
      const total = Number((res.data?.pagination as { pages?: number } | undefined)?.pages ?? 1);
      if (page >= total) break;
      if (page === MAX_PAGINI_COMENZI && total > MAX_PAGINI_COMENZI) {
        // Peste 2000 de comenzi intr-o fereastra: nu blocam filigranul (l-am
        // bloca pentru totdeauna), dar lasam urma in jurnal.
        console.warn("[aboutyou] fereastra de comenzi depaseste plafonul de pagini", { status, total });
      }
    }
    // Un status cazut NU-i mai opreste pe ceilalti: inainte, un esec pe „open"
    // insemna ca anularile si retururile nu se mai cereau deloc in tura aceea.
  }
  return { ingested, ok };
}

/*
 * Anulare si retur pornite din Edinio.
 *
 * Existau in API (`POST /orders/cancel`, `POST /orders/return`) dar nu erau
 * implementate nicaieri: comerciantul care nu mai avea marfa era nevoit sa intre
 * in Seller Center, iar Edinio ramanea cu o comanda pe care o credea in lucru.
 */
export async function cancelOrderNow(
  admin: Db, ctx: AboutYouSyncContext, orderId: string,
): Promise<{ ok: true; batchRequestId?: string } | { ok: false; error: string }> {
  const ids = await idsArticoleActive(admin, ctx, orderId);
  if ("error" in ids) return { ok: false, error: ids.error };
  const res = await cancelOrderItems(ctx.auth, ids.ids.map((id) => ({ id })));
  if (isAboutYouError(res)) return { ok: false, error: res.error };
  await marcheazaSideRow(admin, ctx, orderId, "cancel_pending");
  return { ok: true, batchRequestId: res.data?.batchRequestId };
}

export async function returnOrderNow(
  admin: Db, ctx: AboutYouSyncContext, orderId: string, returnTrackingKey: string,
): Promise<{ ok: true; batchRequestId?: string } | { ok: false; error: string }> {
  const cheie = returnTrackingKey.trim();
  if (!cheie) return { ok: false, error: "Completează numărul AWB de retur." };
  const ids = await idsArticoleActive(admin, ctx, orderId);
  if ("error" in ids) return { ok: false, error: ids.error };
  const res = await returnOrderItems(ctx.auth, [{ order_items: ids.ids, return_tracking_key: cheie }]);
  if (isAboutYouError(res)) return { ok: false, error: res.error };
  await marcheazaSideRow(admin, ctx, orderId, "return_pending");
  return { ok: true, batchRequestId: res.data?.batchRequestId };
}

async function idsArticoleActive(
  admin: Db, ctx: AboutYouSyncContext, orderId: string,
): Promise<{ ids: number[] } | { error: string }> {
  const { data } = await admin
    .from("aboutyou_orders").select("items")
    .eq("business_id", ctx.businessId).eq("order_id", orderId).maybeSingle();
  if (!data) return { error: "Comanda nu este o comandă About You." };
  const items = Array.isArray((data as { items?: unknown }).items)
    ? ((data as { items: { order_item_id?: number; status?: string }[] }).items)
    : [];
  const ids = items
    .filter((i) => i.status !== "cancelled" && i.status !== "returned")
    .map((i) => i.order_item_id)
    .filter((x): x is number => typeof x === "number");
  if (ids.length === 0) return { error: "Comanda nu mai are articole active." };
  return { ids };
}

async function marcheazaSideRow(admin: Db, ctx: AboutYouSyncContext, orderId: string, status: string): Promise<void> {
  const now = new Date().toISOString();
  await admin.from("aboutyou_orders")
    .update({ status, last_synced_at: now, updated_at: now } as never)
    .eq("business_id", ctx.businessId).eq("order_id", orderId);
}

/*
 * Numarul comenzii dintr-un webhook.
 *
 * Plicul About You e `{id, event, timestamp, message, subscription_id}` — sarcina
 * utila sta in `message`, nu in `data`. Codul citea `data`, nu gasea nimic, cadea
 * pe plic si nici acolo nu gasea `order_number`: nicio comanda nu a intrat
 * vreodata pe calea webhook. Se salva doar cronul, care intreaba direct
 * `GET /orders/`, cu intarzierea lui de pana la un minut.
 *
 * `data` si radacina raman ca alternative: nu costa nimic si ne acopera daca
 * plicul difera de spec la vreun eveniment.
 */
export function extractOrderNumber(event: unknown): string | undefined {
  const e = (event ?? {}) as Record<string, unknown>;
  const candidati = [e.message, e.data, e].filter((x): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x));
  for (const c of candidati) {
    const n = c.order_number ?? c.orderNumber;
    if (typeof n === "string" && n !== "") return n;
  }
  return undefined;
}
