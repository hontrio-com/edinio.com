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
import { recordBatch, type AboutYouSyncContext } from "./sync";
import { getOrders, isAboutYouError } from "./client";
import { cancelOrderItems, returnOrderItems } from "./client";
import type { AboutYouOrder, AboutYouOrderStatus } from "./types";
import { tranzitieComandaMarketplace } from "@/lib/orders/tranzitie-marketplace";

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

/**
 * Consuma stocul comenzii, o singura data, si ARUNCA daca n-a reusit.
 *
 * Chemat de AMANDOUA ramurile — si la comanda noua, si la una existenta. A doua
 * chemare e reparatia: `consuma_stoc_comanda_marketplace` e idempotenta prin
 * marcajul `stoc_marketplace_la`, deci o prima incercare picata se duce la capat
 * la sincronizarea urmatoare, iar una reusita nu se repeta (`deja: true`).
 *
 * Arunca fiindca `pollOrders` prinde si pune `ok = false`: un ingest neterminat
 * NU are voie sa mute fereastra.
 */
async function consumaStoculComenzii(
  admin: Db, ctx: AboutYouSyncContext, orderId: string,
  qtyByProduct: Map<string, number>,
  qtyByVariant: Map<string, { product_id: string; variant_title: string; quantity: number }>,
): Promise<void> {
  const produse = [...qtyByProduct.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
  const variante = [...qtyByVariant.values()];
  const { data: rez, error } = await admin.rpc("consuma_stoc_comanda_marketplace", {
    p_order_id: orderId, p_business_id: ctx.businessId,
    p_produse: produse, p_variante: variante,
  });
  const r = rez as { gasit?: boolean; deja?: boolean; lipsa?: unknown[] } | null;
  if (error || r?.gasit !== true) {
    await logError({
      action: "aboutyou/orders", message: error?.message ?? "consumul de stoc n-a raspuns valid",
      details: { orderId, raspuns: r }, businessId: ctx.businessId, severity: "critical",
    });
    throw new Error(error?.message ?? "consumul de stoc n-a raspuns valid");
  }
  if (!r.deja && Array.isArray(r.lipsa) && r.lipsa.length > 0) {
    await logError({
      action: "aboutyou/orders",
      message: "Comanda de marketplace a cerut mai mult stoc decat exista; s-a scazut cat s-a putut.",
      details: { orderId, lipsa: r.lipsa }, businessId: ctx.businessId, severity: "warning",
    });
  }
}

export async function ingestOrder(admin: Db, ctx: AboutYouSyncContext, order: AboutYouOrder): Promise<"created" | "updated" | "skipped"> {
  const ayNumber = typeof order.order_number === "string" ? order.order_number : undefined;
  if (!ayNumber) return "skipped";
  const now = new Date().toISOString();
  const ayItems = toAyItems(order);

  // Idempotency: an already-ingested order only refreshes its side-row (item
  // statuses + tracking); it is never recreated.
  // Resolve product names from SKU (variant -> product) for a readable order.
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const skus = [...new Set(items.map((it) => it.sku).filter(Boolean))];
  const info = new Map<string, { productId: string | null; name: string; variantTitle: string | null }>();
  if (skus.length > 0) {
    const { data: vs, error: eVar } = await admin
      .from("aboutyou_variants").select("sku, product_id, variant_title").eq("business_id", ctx.businessId).in("sku", skus);
    /*
     * „Nu exista mapare" si „n-am putut CITI maparea" sunt doua lucruri diferite.
     * Fara verificare, o citire picata dadea harta goala -> `product_id` null ->
     * comanda intra fara sa scada stoc, si nu se mai repara niciodata.
     */
    if (eVar) {
      await logError({
        action: "aboutyou/orders", message: `maparea SKU nu s-a putut citi: ${eVar.message}`,
        details: { ayNumber }, businessId: ctx.businessId, severity: "critical",
      });
      /*
       * ARUNCA, nu „skipped".
       *
       * `pollOrders` prinde exceptiile si pune `ok = false`, deci fereastra NU
       * avanseaza — dar `skipped` nu era socotit esec, iar marcajul trecea peste o
       * comanda pe care n-am reusit s-o citim. Dupa ce iesea din fereastra, se
       * pierdea definitiv. Comentariul de mai sus spunea corect ca „nu exista
       * mapare" si „n-am putut citi maparea" sunt lucruri diferite; fluxul nu-l
       * respecta.
       */
      throw new Error(`maparea SKU nu s-a putut citi: ${eVar.message}`);
    }
    const randuri = vs ?? [];
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
  const { data: existing } = await admin
    .from("aboutyou_orders").select("id, order_id")
    .eq("business_id", ctx.businessId).eq("aboutyou_order_number", ayNumber).maybeSingle();
  if (existing) {
    const ex = existing as { id: string; order_id: string | null };
    await admin.from("aboutyou_orders")
      .update({ items: ayItems as never, status: order.status ?? "open", last_synced_at: now, updated_at: now } as never)
      .eq("id", ex.id);
    /*
     * Starile terminale trec prin motorul comun: o anulare sau un retur trebuie sa
     * ELIBEREZE stocul, nu doar sa schimbe eticheta. Vezi `tranzitie-marketplace`.
     */
    /*
     * ⚠ REZULTATUL TRANZITIEI SE CITESTE — vezi geamana din `trendyol/orders.ts`.
     *
     * O tranzitie picata lasa statusul vechi si stocul REZERVAT, dar ingestul
     * iesea „updated" si `pollOrders` muta fereastra. Aici nu exista suprapunere
     * deloc (`orders_synced_at` se scrie direct la „acum"), deci pierderea era
     * definitiva de la rularea urmatoare.
     *
     * Semnalul se da prin ARUNCARE, nu prin valoare de retur: acesta e protocolul
     * fisierului (vezi `consumaStoculComenzii`), iar `pollOrders` prinde exceptiile
     * si pune `ok = false`. `ingestOrder` nici n-are „failed" in semnatura, si un
     * `return` largit ar trece nevazut prin `pollOrders`, care testeaza doar
     * `=== "created"`.
     */
    let reiaTranzitia = false;
    if (ex.order_id && (order.status === "cancelled" || order.status === "returned")) {
      const t = await tranzitieComandaMarketplace(admin, {
        orderId: ex.order_id, businessId: ctx.businessId,
        status: edinioStatusFor(order.status), sursa: "aboutyou",
      });
      // `definitiv` NU blocheaza fereastra: ar ingheta magazinul intreg pentru o
      // singura comanda imposibila.
      if (t === "reincearca") reiaTranzitia = true;
    }
    /*
     * ⚠ RANDUL LATERAL EXISTA NU INSEAMNA CA INGESTUL S-A TERMINAT.
     *
     * Se intorcea „updated" imediat, deci nu se mai ajungea niciodata la consumul
     * de stoc — iar tocmai consumul poate pica singur. Functia din baza e
     * reparabila prin marcajul `stoc_marketplace_la`; apelantul sarea reparatia.
     */
    if (ex.order_id) {
      await consumaStoculComenzii(admin, ctx, ex.order_id, qtyByProduct, qtyByVariant);
    }
    /*
     * Aruncarea vine DUPA consumul de stoc, nu inaintea lui: altfel s-ar sari
     * peste reparatia unui consum picat anterior — o comanda cu
     * `stoc_marketplace_la` NULL n-ar mai fi dusa la capat niciodata.
     */
    if (reiaTranzitia) {
      throw new Error(`Tranzitia comenzii About You ${ayNumber} nu s-a aplicat; fereastra ramane pe loc.`);
    }
    return "updated";
  }

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
    /*
     * `stoc_rezervat` NU se scrie aici — il scrie
     * `consuma_stoc_comanda_marketplace`, cu ce s-a luat CU ADEVARAT. Vezi Trendyol.
     */
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
  // Acelasi drum ca pe ramura „exista deja": un singur loc care consuma.
  await consumaStoculComenzii(admin, ctx, orderId, qtyByProduct, qtyByVariant);

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

/**
 * Momentul comenzii, in milisecunde, sau `null` daca nu se poate citi.
 *
 * Cursorul se construieste NUMAI din campul dupa care se si filtreaza fereastra
 * (`orders_from` merge pe `created_at`). Pe alt camp ar sari comenzi.
 */
function candFacuta(order: AboutYouOrder): number | null {
  const c = (order as unknown as Record<string, unknown>).created_at;
  if (typeof c !== "string") return null;
  const t = Date.parse(c);
  return Number.isFinite(t) ? t : null;
}

/** Sursa paginilor, injectabila ca sa se poata proba bucla fara reteaua About You. */
export type AducePaginaAy = (p: { status: AboutYouOrderStatus; page: number; since?: string }) =>
  Promise<{ items: AboutYouOrder[]; pages?: number } | { eroare: true }>;

export async function pollOrders(
  admin: Db, ctx: AboutYouSyncContext, since?: string,
  deps?: {
    aduPagina?: AducePaginaAy;
    ingereaza?: (o: AboutYouOrder) => Promise<"created" | "updated" | "skipped">;
  },
): Promise<{ ingested: number; ok: boolean; cursorMs?: number }> {
  let ingested = 0;
  let ok = true;
  /*
   * ═══ CURSORUL, CU O DEOSEBIRE FATA DE TRENDYOL ═══
   *
   * Acolo cerem noi sortarea (`orderByDirection: ASC`) si ne putem baza pe ea.
   * Aici API-ul About You NU are parametru de sortare, deci ordinea paginilor e
   * o presupunere — iar un cursor construit peste o ordine gresita ar SARI
   * comenzi, adica exact ce vrem sa inchidem.
   *
   * Asa ca ordinea se VERIFICA la rulare: cat timp comenzile chiar vin crescator
   * dupa `created_at`, cursorul creste odata cu ele; la prima comanda mai veche
   * decat precedenta, cursorul se anuleaza si nu se mai foloseste deloc. Atunci
   * fereastra ramane pe loc si se striga — blocaj, dar zgomotos, in loc de
   * pierdere tacuta. Nicio presupunere despre API nu ramane netestata.
   */
  let cursorMs: number | undefined;
  let cursorValid = true;
  let ultimul = -Infinity;

  for (const status of STATUSURI_DE_ADUS) {
    /*
     * Fiecare status e o serie proprie, deci ordinea se urmareste de la capat —
     * altfel a doua serie ar parea „mai veche" si ar anula cursorul degeaba.
     * Cursorul retinut e MINIMUL peste statusuri: e singurul punct pana la care
     * s-a citit tot, pe toate seriile.
     */
    ultimul = -Infinity;
    let cursorStatus: number | undefined;
    /*
     * ⚠ DOUA CAUZE DIFERITE, DOUA STEAGURI DIFERITE.
     *
     * `cazutStatus` = ceva ce trebuia citit n-a mers (pagina cu eroare, comanda
     *   care a aruncat). Asta blocheaza ORICE avans, pe orice status.
     * `ordineBuna` = comenzile chiar vin crescator dupa `created_at`. Asta
     *   conteaza NUMAI pe un status trunchiat, fiindca doar acolo cursorul lui e
     *   folosit. Pe un status citit COMPLET, ordinea nu constrange nimic.
     *
     * Amestecate intr-un singur steag, o singura comanda fara `created_at` intr-un
     * status complet stergea cursorul statusului trunchiat — si atunci marcajul nu
     * se mai scria DELOC. Mai rau decat inainte: fereastra ramanea „tot istoricul",
     * deci nici comenzile NOI nu mai intrau, iar cronul recitea la infinit aceleasi
     * pagini. Reprodus pe bucla reala inainte de reparatie.
     */
    let ordineBuna = true;
    let cazutStatus = false;
    let trunchiat = false;

    for (let page = 1; page <= MAX_PAGINI_COMENZI; page++) {
      const pagina = deps?.aduPagina
        ? await deps.aduPagina({ status, page, since })
        : await (async () => {
          const res = await getOrders(ctx.auth, { order_status: status, orders_from: since, page, per_page: 50 });
          if (isAboutYouError(res)) return { eroare: true as const };
          return { items: res.data?.items ?? [], pages: Number((res.data?.pagination as { pages?: number } | undefined)?.pages ?? 1) };
        })();
      if ("eroare" in pagina) { ok = false; cazutStatus = true; break; }
      const orders = pagina.items;
      if (orders.length === 0) break;
      for (const o of orders) {
        let cazut = false;
        try {
          const rez = deps?.ingereaza ? await deps.ingereaza(o) : await ingestOrder(admin, ctx, o);
          if (rez === "created") ingested++;
        } catch {
          // O comanda care nu s-a putut salva nu are voie sa mute fereastra.
          ok = false;
          cazut = true;
        }
        // Cursorul se opreste la prima comanda nereusita si nu mai porneste.
        if (cazut) cazutStatus = true;
        if (!cazutStatus && ordineBuna) {
          const t = candFacuta(o);
          if (t == null || t < ultimul) ordineBuna = false;
          else { ultimul = t; cursorStatus = t; }
        }
      }
      const total = Number(pagina.pages ?? 1);
      if (page >= total) break;
      if (page === MAX_PAGINI_COMENZI && total > MAX_PAGINI_COMENZI) {
        /*
         * Peste 2.000 de comenzi intr-o fereastra.
         *
         * Pana acum marcajul sarea totusi la „acum", deci paginile necitite se
         * pierdeau DEFINITIV. `ok = false` singur ar fi produs blocaj permanent —
         * fereastra ramane aceeasi, deci la minutul urmator se citesc exact
         * aceleasi pagini si se blocheaza iar.
         *
         * Cu cursorul de mai sus, `ok = false` inseamna acum „nu sari la acum,
         * muta marcajul pana unde am ajuns", deci progresul e garantat. Cand
         * cursorul NU s-a putut construi (ordine neasteptata de la API, comanda
         * fara `created_at`), ramane blocajul — dar zgomotos, cu randul de mai jos.
         */
        ok = false;
        trunchiat = true;
        await logError({
          action: "aboutyou/orders",
          message: ordineBuna && !cazutStatus && cursorStatus != null
            ? `Fereastra „${status}" are peste ${MAX_PAGINI_COMENZI} pagini: restul se preia la rularile urmatoare, de la cursor.`
            : `Fereastra „${status}" are peste ${MAX_PAGINI_COMENZI} pagini SI nu s-a putut construi un cursor (ordinea comenzilor nu e crescatoare dupa created_at): fereastra ramane pe loc.`,
          details: { status, total, cursorStatus, ordineBuna, cazutStatus },
          businessId: ctx.businessId, severity: "critical",
        });
      }
    }
    /*
     * ═══ CE CONSTRANGE CURSORUL GENERAL, SI CE NU ═══
     *
     * Un status care s-a citit COMPLET nu constrange nimic: pe seria lui am luat
     * tot ce era in fereastra, deci marcajul poate trece peste el oricat.
     *
     * Doar un status TRUNCHIAT constrange, si atunci pana la ultima lui comanda
     * citita — de aceea cursorul general e MINIMUL peste statusurile trunchiate.
     *
     * ⚠ Prima forma anula cursorul cand un status n-avea `cursorStatus`. Testul a
     * prins-o imediat: patru din cele cinci statusuri sunt de obicei GOALE, iar
     * „gol" inseamna „citit tot", nu „n-am putut citi". Cursorul iesea intotdeauna
     * `undefined` si mecanismul era, iar, cod mort.
     */
    if (cazutStatus) {
      // Ceva ce trebuia citit n-a mers: nu se avanseaza nicaieri.
      cursorValid = false;
      cursorMs = undefined;
    } else if (trunchiat && cursorValid) {
      if (!ordineBuna || cursorStatus == null) {
        cursorValid = false;
        cursorMs = undefined;
      } else {
        cursorMs = cursorMs == null ? cursorStatus : Math.min(cursorMs, cursorStatus);
      }
    }
    // Un status cazut NU-i mai opreste pe ceilalti: inainte, un esec pe „open"
    // insemna ca anularile si retururile nu se mai cereau deloc in tura aceea.
  }

  /*
   * Cursorul trebuie sa CREASCA peste marcajul curent, altfel fereastra urmatoare
   * ar fi identica si s-ar reciti la nesfarsit acelasi lot.
   */
  const marcajMs = since ? Date.parse(since) : NaN;
  if (cursorMs != null && Number.isFinite(marcajMs) && cursorMs <= marcajMs) {
    await logError({
      action: "aboutyou/orders",
      message: "Cursorul de sincronizare nu a avansat peste marcajul curent; fereastra ramane pe loc.",
      details: { cursorMs, marcajMs }, businessId: ctx.businessId, severity: "critical",
    });
    cursorMs = undefined;
  }

  return { ingested, ok, cursorMs: cursorValid ? cursorMs : undefined };
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
  /*
   * Lotul se INREGISTREAZA, altfel „in curs de anulare" e o stare fara ieșire.
   *
   * `batchRequestId` se intorcea apelantului si nu-l scria nimeni nicaieri, iar
   * `getCancelBatchResults` nu era chemata din niciun loc din tot repo-ul. Deci
   * comanda rămânea `cancel_pending` la nesfarsit: nu se afla niciodata daca About
   * You a acceptat anularea, si nimeni n-o relua. Exact defectul care fusese
   * reparat la expediere, ramas aici.
   */
  const id = res.data?.batchRequestId;
  if (id) await recordBatch(admin, ctx.businessId, id, "cancel", [orderId]);
  return { ok: true, batchRequestId: id };
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
  // Ca la anulare: fara inregistrare, „in curs de retur" nu se inchide niciodata.
  const id = res.data?.batchRequestId;
  if (id) await recordBatch(admin, ctx.businessId, id, "return", [orderId]);
  return { ok: true, batchRequestId: id };
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
