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
import { impingeStoculPeCeleLalteCanale } from "@/lib/marketplace/stoc-pe-canale";
import { logError } from "@/lib/error-logger";
import { randCitit, randuriCitite } from "@/lib/supabase/rand-citit";
import type { Database } from "@/types/database.types";
import { cuLotDurabil, type AboutYouSyncContext } from "./sync";
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

/**
 * Scrie liniile intoarse, ca sa poata fi repuse in stoc de mana.
 *
 * ⚠ SE FOLOSESTE `ignoreDuplicates`, nu un upsert care rescrie: `repus_in_stoc_la` e pe randul
 * asta, iar o recitire a comenzii de la ei l-ar fi sters — si marfa ar fi intrat in stoc a doua
 * oara la urmatoarea apasare. La ei statusul liniei nu se mai schimba dupa retur, deci n-avem
 * ce actualiza.
 *
 * ═══ ⚠ ERA „BEST EFFORT", SI TEMEIUL NU STATEA IN PICIOARE (27.08.2026) ═══
 *
 * Scria: „NU OPRESTE INGESTUL daca pica: o comanda citita fara randul de retur e mai buna decat
 * una necitita". Presupunerea de dedesubt — ca o aruncare PIERDE comanda — e falsa: `pollOrders`
 * prinde fiecare comanda separat si INGHEATA cursorul la prima picata, deci o aruncare AMANA, nu
 * pierde. Verificat in `pollOrders`, unde `cazutStatus` opreste inaintarea cursorului.
 *
 * Iar pretul tacerii e mare si ireversibil: cand comanda ajunge complet `returned`, ea iese din
 * ferestrele de aducere si din reintrebarea comenzilor deschise. Randul de retur nelipsit atunci
 * nu se mai scrie NICIODATA, deci marfa intoarsa nu mai are pe unde sa se intoarca pe raft — cu
 * atat mai grav de cand repunerea automata e oprita dinadins.
 *
 * ⚠ ARUNCA, si scrie `critical` inainte: o aruncare care se repeta tine cursorul pe loc, deci
 * trebuie sa se VADA, nu sa incetineasca magazinul in tacere.
 */
async function scrieRetururile(
  admin: Db, ctx: AboutYouSyncContext, ayNumber: string, orderId: string | null,
  intoarse: {
    linie_cheie: string; sku: string; product_id: string | null;
    variant_title: string | null; nume_produs: string | null; quantity: number;
  }[],
): Promise<void> {
  if (intoarse.length === 0) return;
  const { error } = await admin.from("aboutyou_retururi").upsert(
    intoarse.map((r) => ({
      business_id: ctx.businessId, aboutyou_order_number: ayNumber, order_id: orderId,
      linie_cheie: r.linie_cheie,
      sku: r.sku, product_id: r.product_id, variant_title: r.variant_title,
      nume_produs: r.nume_produs, quantity: r.quantity,
    })) as never,
    /* ⚠ Pe BUCATA, nu pe SKU: doua bucati din acelasi SKU sunt doua randuri. */
    { onConflict: "business_id,aboutyou_order_number,linie_cheie", ignoreDuplicates: true },
  );
  if (error) {
    await logError({
      action: "aboutyou/retururi",
      message: `liniile intoarse nu s-au putut scrie: ${error.message}`,
      details: { ayNumber, cate: intoarse.length, orderId },
      businessId: ctx.businessId, severity: "critical",
    });
    throw new Error(`Liniile intoarse ale comenzii ${ayNumber} nu s-au putut scrie: ${error.message}`);
  }
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

/**
 * Ce se face cu comanda din Edinio cand About You ne da liniile din nou.
 *
 * Scoasa din `ingestOrder` ca sa poata fi PROBATA fara retea si fara baza: e o hotarare, nu o
 * scriere. Tiparul e al casei — vezi `rutaDeTrimitere` si `stareLot`.
 *
 * ⚠ „facturata" NU inseamna „nu s-a schimbat nimic": inseamna ca schimbarea nu se face TACUT.
 * De aceea sunt trei raspunsuri, nu doua.
 */
export type HotarareaActualizarii = "scrie" | "doar-jurnal" | "nimic";

/**
 * Acelasi continut, oricum ar fi asezate cheile.
 *
 * ═══ ⚠ `JSON.stringify` NU POATE COMPARA CEVA CITIT DIN `jsonb` (27.08.2026) ═══
 *
 * `orders.items` e `jsonb`, iar Postgres REASEAZA cheile obiectelor: intai dupa lungime, apoi
 * alfabetic. Probat pe baza: linia scrisa de noi ca
 * `{product_id, name, sku, price, quantity}` se intoarce `{sku, name, price, quantity,
 * product_id}`. Doua siruri diferite pentru acelasi lucru — deci comparatia iesea „s-a schimbat"
 * la FIECARE trecere, si tocmai scrierea pe care paza trebuia s-o opreasca se facea de fiecare
 * data.
 *
 * ⚠ SI PROBA MEA A TRECUT PE LANGA. Amandoua partile veneau din acelasi obiect din JavaScript,
 * deci nu treceau niciodata prin `jsonb`. O proba verde care apara chiar defectul.
 *
 * ⚠ Si banii se rotunjesc la doi zecimali: `19.90` scris se intoarce `19.9`, iar o zecimala de
 * plutire n-are voie sa treaca drept stire.
 */
function canonic(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonic);
  if (typeof v === "number") return Math.round(v * 100) / 100;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.keys(o).sort().reduce<Record<string, unknown>>((acc, k) => {
      /* `undefined` nu ajunge niciodata in `jsonb`: lipsa si `undefined` sunt acelasi lucru. */
      if (o[k] !== undefined) acc[k] = canonic(o[k]);
      return acc;
    }, {});
  }
  return v;
}
export function acelasiContinut(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonic(a ?? null)) === JSON.stringify(canonic(b ?? null));
}
export function hotarareaActualizarii(a: {
  facturata: boolean;
  itemsVechi: unknown; totalVechi: number | null;
  itemsNoi: unknown; totalNou: number;
}): HotarareaActualizarii {
  /* ⚠ Pe continut CANONIC, nu pe siruri: vezi `acelasiContinut`. */
  const schimbat = !acelasiContinut(a.itemsVechi, a.itemsNoi)
    /* Banii se compara cu o toleranta: sunt socotiti din intregi, dar tin virgula. */
    || Math.abs(num(a.totalVechi) - a.totalNou) > 0.001;
  if (!schimbat) return "nimic";
  return a.facturata ? "doar-jurnal" : "scrie";
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

/**
 * Elibereaza stocul liniilor ANULATE, o singura data pe linie.
 *
 * ⚠ ARUNCA la esec, ca `consumaStoculComenzii`: e protocolul fisierului, iar `pollOrders` prinde
 * si pune `ok = false`. O eliberare picata NU are voie sa mute fereastra — altfel linia anulata
 * ramane cu stocul consumat pentru totdeauna, si nimeni nu mai afla.
 *
 * ⚠ IDEMPOTENTA STA IN BAZA, nu aici: functia tine minte ce linii a eliberat deja, in aceeasi
 * tranzactie in care elibereaza. Vezi `aboutyou_elibereaza_anulari`.
 */
async function elibereazaAnularile(
  admin: Db, ctx: AboutYouSyncContext, ayNumber: string,
  linii: { linie_cheie: string; product_id: string | null; variant_title: string | null; quantity: number }[],
): Promise<void> {
  if (linii.length === 0) return;
  const { data, error } = await admin.rpc("aboutyou_elibereaza_anulari", {
    p_business_id: ctx.businessId, p_order_number: ayNumber, p_linii: linii as never,
  });
  const r = data as { stare?: string; eliberate?: number } | null;
  if (error || !r?.stare) {
    await logError({
      action: "aboutyou/orders", severity: "critical",
      message: `eliberarea stocului pentru liniile anulate a picat: ${error?.message ?? "raspuns nevalid"}`,
      details: { ayNumber, linii: linii.length }, businessId: ctx.businessId,
    });
    throw new Error(error?.message ?? "eliberarea anularilor n-a raspuns valid");
  }
  if (r.stare === "acoperit-de-comanda") {
    /*
     * ⚠ Plasa din baza a oprit o dublare. Ajunge aici numai daca saritura de la apelant n-a
     * prins cazul — deci merita scris: inseamna ca mai exista un drum la care nu m-am gandit.
     */
    await logError({
      action: "aboutyou/orders", severity: "warning",
      message: "liniile anulate erau deja acoperite de eliberarea intregii comenzi: nu s-a mai eliberat nimic",
      details: { ayNumber, linii: linii.length }, businessId: ctx.businessId,
    });
  }
  if ((r.eliberate ?? 0) > 0) {
    await logError({
      action: "aboutyou/orders", severity: "info",
      message: `anulare partiala: s-a eliberat stocul pentru ${r.eliberate} ${r.eliberate === 1 ? "linie" : "linii"}`,
      details: { ayNumber }, businessId: ctx.businessId,
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
      /* ⚠ Strict: inghitita, pana scria „Produs About You" pe linii dintr-o comanda adevarata. */
      const ps = randuriCitite<{ id: string; name: string }>("aboutyou.numeleProduselor",
        await admin.from("products").select("id, name").in("id", prodIds) as never);
      for (const p of ps) prodName.set(p.id, p.name);
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

  /*
   * ⚠ LINIILE INTOARSE SE TIN MINTE, ca sa aiba omul ce apasa.
   *
   * Statusul lor sta pe LINIE la About You (nu exista un serviciu de retururi ca la Trendyol),
   * deci se citeste chiar de aici. Fara asta, oprirea repunerii automate ar fi insemnat ca
   * marfa intoarsa nu mai ajunge NICIODATA in stoc — o paguba mai mare decat cea reparata.
   */
  /*
   * ═══ ⚠ LA EI, O LINIE DE COMANDA INSEAMNA O BUCATA (26.08.2026) ═══
   *
   * `AboutYouOrderItem` n-are camp de cantitate, si tot fisierul socoteste asa: `qty = 1` pe
   * element, iar totalul se aduna ca suma preturilor, fara inmultire. Deci o comanda cu 2 x
   * „ABC" vine ca DOUA elemente cu acelasi `sku`, cu `id`-uri diferite.
   *
   * ⚠ CHEIA ERA PE `sku`, si le stringea intr-un singur rand. Comerciantul apasa „Am primit
   * marfa si e buna", intra o bucata in stoc, randul se marcheaza rezolvat — iar a doua bucata
   * nu se mai putea repune NICIODATA: `ignoreDuplicates` o taia pe conflict cu randul deja
   * rezolvat, deci nici macar nu aparea pe ecran. Stoc real 2, stoc in Edinio 1, tacut.
   *
   * ⚠ SI E CU ATAT MAI GRAV CU CAT chiar azi s-a oprit repunerea automata: ecranul asta e
   * SINGURA cale prin care marfa intoarsa mai ajunge inapoi pe raft.
   *
   * ⚠ CHEIA E `id`-UL LINIEI, cu o rezerva pe indice cand nu ni-l dau — determinista, ca a doua
   * citire a aceleiasi comenzi sa nimereasca acelasi rand, nu unul nou.
   */
  const intoarse = items
    .map((it, indice) => ({ it, indice }))
    .filter(({ it }) => it.status === "returned")
    .map(({ it, indice }) => {
      const meta = info.get(it.sku);
      return {
        linie_cheie: it.id != null ? String(it.id) : `sku:${it.sku}:${indice}`,
        sku: it.sku,
        product_id: meta?.productId ?? null,
        variant_title: meta?.variantTitle ?? null,
        nume_produs: meta?.name ?? null,
        /* ⚠ Mereu 1: la ei o linie E o bucata. Vezi nota de sus. */
        quantity: 1,
      };
    });

  /*
   * ═══ ⚠ ANULAREA UNEI SINGURE LINII (26.08.2026) ═══
   *
   * La ei statusul sta pe LINIE; comanda devine `mixed` cand liniile nu spun acelasi lucru. Poarta
   * de mai jos se deschide numai cand TOATA comanda ajunge `cancelled` sau `returned`, deci o
   * anulare partiala nu elibera nimic — iar `consuma_stoc_comanda_marketplace` e idempotenta prin
   * `stoc_marketplace_la`, deci consumul nu se mai reface niciodata. Stocul liniei anulate ramanea
   * consumat pentru totdeauna, pentru marfa care n-a plecat nicaieri.
   *
   * ⚠ Se aduna aici, dar se ELIBEREAZA dupa ce stim `order_id` — si numai prin functia din baza,
   * care face eliberarea si marcarea in acelasi pas. Vezi `aboutyou_elibereaza_anulari`.
   */
  const anulate = items
    .map((it, indice) => ({ it, indice }))
    .filter(({ it }) => it.status === "cancelled")
    .map(({ it, indice }) => {
      const meta = info.get(it.sku);
      const q = (it as { quantity?: number }).quantity;
      return {
        /* ⚠ Aceeasi cheie ca la retururi: id-ul liniei, cu rezerva determinista pe indice. */
        linie_cheie: it.id != null ? String(it.id) : `sku:${it.sku}:${indice}`,
        product_id: meta?.productId ?? null,
        variant_title: meta?.variantTitle ?? null,
        quantity: typeof q === "number" ? q : 1,
      };
    })
    .filter((l) => l.product_id);

  const subtotal = money(activeItems.reduce((s, it) => s + num(it.price_without_tax), 0));
  /* ⚠ Socotite AICI, nu mai jos: le foloseste si calea de ACTUALIZARE, care trebuie sa rescrie
     totalul cand About You anuleaza o linie. Vezi nota de la actualizarea comenzii. */
  const total = money(activeItems.reduce((s, it) => s + num(it.price_with_tax), 0));
  const vatAmount = Math.round((total - subtotal) * 100) / 100;
  /*
   * ⚠ STRICT. „Randul lateral nu exista" trimite pe calea de CREARE, adica la un `insert` in
   * `orders` pentru o comanda care e deja la noi. Ne salveaza indexul unic
   * `orders_order_number_business_unique` — dar asta e o plasa a bazei, nu o hotarare a codului,
   * si nu se sprijina nimeni pe ea.
   */
  const existing = randCitit<{ id: string; order_id: string | null }>("aboutyou.randulLateral", await admin
    .from("aboutyou_orders").select("id, order_id")
    .eq("business_id", ctx.businessId).eq("aboutyou_order_number", ayNumber).maybeSingle());
  if (existing) {
    const ex = existing;
    /* ⚠ Si raspunsul BRUT, ca sa se poata raspunde la intrebari pe care schema noastra nu le
       cunoaste inca. Vezi migratia 2026-11-24. */
    const { error: eLateralAct } = await admin.from("aboutyou_orders")
      .update({
        items: ayItems as never, status: order.status ?? "open",
        raw: order as never, last_synced_at: now, updated_at: now,
      } as never)
      .eq("id", ex.id);
    /*
     * ═══ ⚠ RANDUL LATERAL PUTEA RAMANE VECHI, SI TOT SE MERGEA MAI DEPARTE (27.08.2026) ═══
     *
     * Rezultatul nu se citea. Din `items` de aici se socoteste TOT ce urmeaza: ce linii se pot
     * expedia, ce se poate anula, ce se poate returna, si care comenzi se reintreaba. Ramas la
     * starea de ieri, ecranul arata butoane pentru linii care nu mai sunt in starea aia, iar
     * expedierea ar pleca pe id-uri vechi.
     *
     * ⚠ SE ARUNCA INAINTE de tranzitia terminala si de consumul de stoc: reluarea reface totul de
     * la capat, si amandoua sunt idempotente. Asa nu ramane nimic pe jumatate.
     */
    if (eLateralAct) {
      throw new Error(`Randul About You al comenzii ${ayNumber} nu s-a putut actualiza: ${eLateralAct.message}`);
    }
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
      const stareNoua = edinioStatusFor(order.status);
      const t = await tranzitieComandaMarketplace(admin, {
        orderId: ex.order_id, businessId: ctx.businessId,
        status: stareNoua, sursa: "aboutyou",
        /*
         * ═══ ⚠ UN RETUR NU PUNE MARFA INAPOI PE RAFT SINGUR (26.08.2026) ═══
         *
         * A treia si ultima integrare cu aceeasi scapare — la eMAG s-a taiat pe 25.08, la
         * Trendyol pe 26.08. Aici a ramas o zi fiindca taiata FARA inlocuitor, marfa intoarsa
         * n-ar mai fi ajuns niciodata inapoi in stoc.
         *
         * ⚠ CE FACEA: fara `elibereazaStoc`, implicitul din baza e `true`, deci statusul
         * „returned" de la ei punea AUTOMAT toata comanda inapoi pe raft. Marfa intoarsa vine
         * insa desfacuta, zgariata, incompleta, sau pur si simplu alta — iar stocul umflat se
         * vinde, si se vinde ce nu exista.
         *
         * ⚠ ANULARILE ELIBEREAZA MAI DEPARTE, si e o deosebire de fond: la o anulare marfa
         * n-a plecat nicaieri, deci e chiar pe raft.
         *
         * Inlocuitorul e ecranul de retururi: omul apasa „Am primit marfa si e buna" pe linia
         * lui, dupa ce se uita la ce a primit. Vezi `aboutyou_retururi`.
         */
        elibereazaStoc: stareNoua !== "refunded",
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
    /*
     * ═══ ⚠ COMANDA DIN EDINIO NU SE SCHIMBA DELOC LA O ANULARE PARTIALA (27.08.2026) ═══
     *
     * Pe calea de actualizare se scria numai randul lateral. `orders` ramanea cu liniile si
     * totalul de la CREARE — inclusiv linia pe care clientul a anulat-o intre timp. Deci:
     *
     *   - raportarile arata o valoare pe care nimeni n-a platit-o;
     *   - fisa comenzii ii arata comerciantului un produs care nu se mai trimite;
     *   - iar el il poate pregati si expedia degeaba.
     *
     * Calea de CREARE socoteste deja corect, si se scrie exact aceeasi socoteala: `edinioItems`
     * PASTREAZA liniile anulate, dar le pune un `status` pe ele (deci omul vede ce s-a anulat,
     * nu-i dispare din fisa), iar `subtotal`/`total`/`vat_amount` numara doar `activeItems`.
     * Asta tine si la o comanda anulata in intregime: liniile raman scrise, totalul cade la 0.
     *
     * ⚠ SI NU SE ATINGE O COMANDA DEJA FACTURATA. Un document fiscal emis nu se corecteaza
     * schimband tacut totalul dedesubt: se STORNEAZA, si aia e hotararea comerciantului, nu a
     * mea. Cand exista factura, se scrie in jurnal si se lasa asa.
     *
     * ⚠ SI NU SE SCRIE CAND N-A SCHIMBAT NIMIC. Ingestul trece peste aceleasi comenzi la
     * fiecare reconciliere; o scriere neconditionata ar impinge `updated_at` inainte de fiecare
     * data, adica fiecare comanda ar parea „atinsa acum" in liste sortate dupa el.
     */
    if (ex.order_id) {
      const comanda = randCitit<{
        smartbill_invoice_number: string | null;
        oblio_invoice_number: string | null;
        fgo_invoice_number: string | null;
        items: unknown;
        total: number | null;
      }>("aboutyou.comandaDeActualizat", await admin
        .from("orders")
        .select("smartbill_invoice_number, oblio_invoice_number, fgo_invoice_number, items, total")
        .eq("id", ex.order_id).eq("business_id", ctx.businessId).maybeSingle());

      /* ⚠ Comanda necitibila NU se rescrie orbeste: fara ea nu stim daca are factura. */
      const hotarare = comanda == null ? "nimic" : hotarareaActualizarii({
        facturata: !!(comanda.smartbill_invoice_number
          ?? comanda.oblio_invoice_number ?? comanda.fgo_invoice_number),
        itemsVechi: comanda.items, totalVechi: comanda.total,
        itemsNoi: edinioItems, totalNou: total,
      });

      if (hotarare === "doar-jurnal") {
        await logError({
          action: "aboutyou/orders", severity: "warning",
          message: "comanda are factura emisa, iar la About You s-au schimbat liniile: totalul din Edinio ramane neschimbat",
          details: { ayNumber, orderId: ex.order_id, anulate: anulate.length, totalLaEi: total },
          businessId: ctx.businessId,
        });
      } else if (hotarare === "scrie") {
        const { error: eComanda } = await admin.from("orders")
          .update({
            items: edinioItems as never,
            subtotal, total, vat_amount: vatAmount,
            updated_at: now,
          } as never)
          .eq("id", ex.order_id).eq("business_id", ctx.businessId);
        if (eComanda) {
          await logError({
            action: "aboutyou/orders", severity: "warning",
            message: `liniile comenzii nu s-au putut actualiza: ${eComanda.message}`,
            details: { ayNumber }, businessId: ctx.businessId,
          });
        }
      }
    }

    await scrieRetururile(admin, ctx, ayNumber, ex.order_id, intoarse);
    if (ex.order_id) {
      await consumaStoculComenzii(admin, ctx, ex.order_id, qtyByProduct, qtyByVariant);
      /*
       * ⚠ DUPA consum, nu inainte: consumul e cel care aseaza `stoc_marketplace_la`, iar
       * eliberarea unei linii anulate n-are sens inaintea lui. Vezi nota de la `anulate`.
       *
       * ═══ ⚠ SI NU LA O ANULARE TOTALA (27.08.2026) ═══
       *
       * Cand About You trece comanda intreaga pe `cancelled`, tranzitia de mai sus a eliberat deja
       * REZERVAREA INTREAGA. Chemat si aici, stocul crestea de DOUA ori cu cantitatea anulata —
       * masurat pe productie: 120 la inceput, 122 dupa tranzitie, 124 dupa liniile anulate.
       *
       * ⚠ PAZA ADEVARATA E IN BAZA (`stoc_eliberat_la`, vezi migratia 2026-11-25), fiindca acolo
       * se intalnesc cele doua cai si tine oricare ar fi ordinea chemarilor. Saritura de aici e
       * economie, nu siguranta — si asa scrie, ca sa nu se creada invers.
       */
      if (order.status !== "cancelled") {
        await elibereazaAnularile(admin, ctx, ayNumber, anulate);
      }

    /*
     * ⚠ SI PE CELELALTE CANALE. Stocul tocmai s-a schimbat, iar eMAG, Trendyol si restul inca il au
     * pe cel vechi si continua sa-l vanda. Vezi `impingeStoculPeCeleLalteCanale`:
     * fara pasul asta, „un singur inventar" e adevarat doar cat timp se vinde pe un
     * singur canal.
     */
      await impingeStoculPeCeleLalteCanale(ctx.businessId, [...qtyByProduct.keys()], "aboutyou");
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
    /* ⚠ Strict: inghitita, o pana aici ar fi ascuns motivul ADEVARAT sub cel de la `insert`. */
    const found = randCitit<{ id: string }>("aboutyou.comandaDupaNumar", await admin
      .from("orders").select("id")
      .eq("business_id", ctx.businessId).eq("order_number", `AY-${ayNumber}`).maybeSingle());
    if (!found) {
      throw new Error(`Comanda About You ${ayNumber} nu a putut fi salvată: ${error?.message ?? "motiv necunoscut"}`);
    }
    orderId = found.id;
    isNew = false;
  } else {
    orderId = (created as { id: string }).id;
  }

  /*
   * ═══ ⚠ RANDUL LATERAL PUTEA LIPSI DE PE O COMANDA DEJA CREATA (27.08.2026) ═══
   *
   * Rezultatul upsertului nu se citea. Iesea asa:
   *
   *   `orders` scrisa ✅ · stocul consumat ✅ · `aboutyou_orders` ❌
   *
   * si ingestul raporta „created". De-acolo se pierd id-urile articolelor lor, deci nu se mai
   * poate nici expedia, nici anula, nici returna. Mai rau: `reconciliazaComenzile` PORNESTE
   * chiar din `aboutyou_orders`, deci comanda iese din singurul mecanism care ar fi reparat-o.
   *
   * ⚠ SE ARUNCA INAINTE DE CONSUMUL DE STOC. Reluarea reface totul de la capat, iar consumul e
   * idempotent prin `stoc_marketplace_la`; asa nu ramane nimic pe jumatate.
   */
  const { error: eLateral } = await admin.from("aboutyou_orders").upsert({
    business_id: ctx.businessId,
    order_id: orderId,
    aboutyou_order_number: ayNumber,
    shop_country: shopCountry(order),
    fulfillment_type: (typeof order.fulfillment_type === "string" ? order.fulfillment_type : null),
    status: order.status ?? "open",
    items: ayItems as never,
    /* ⚠ Vezi migratia 2026-11-24: ce nu pastram nu se mai poate intreba niciodata. */
    raw: order as never,
    last_synced_at: now,
  } as never, { onConflict: "business_id,aboutyou_order_number" });
  if (eLateral) {
    throw new Error(`Randul About You al comenzii ${ayNumber} nu s-a putut scrie: ${eLateral.message}`);
  }

  /*
   * ⚠ SI AICI, NU DOAR PE RAMURA „EXISTA DEJA" (26.08.2026).
   *
   * `scrieRetururile` se chema numai cand comanda era deja la noi. Dar o comanda poate sosi
   * PRIMA DATA cu linii deja `returned` — ei tin comenzile pana la doua saptamani, iar noi
   * citim ferestre. Ingerata asa, liniile ei intoarse se pierdeau tacut: nu se scriau nicaieri,
   * deci comerciantul n-avea ce apasa, iar marfa nu se mai intorcea pe raft niciodata.
   *
   * ⚠ E cu atat mai grav cu cat chiar azi s-a oprit repunerea automata.
   */
  await scrieRetururile(admin, ctx, ayNumber, orderId, intoarse);

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
/**
 * Starile de LINIE din care o comanda nu mai are ce sa ne spuna.
 *
 * ⚠ SE NUMESC CELE INCHEIATE, nu cele vii — aceeasi hotarare ca la retururile Trendyol, si din
 * acelasi motiv: o lista de „stari vii" lasa pe dinafara tot ce nu cunoastem, iar `status`-ul
 * liniei poate primi valori noi fara sa ne intrebe.
 *
 * ⚠ `shipped` NU e incheiata: de-acolo se poate ajunge la `returned`.
 */
const LINII_INCHEIATE_AY = new Set(["cancelled", "returned"]);

/** Cate comenzi se reintreaba intr-o trecere. */
const COMENZI_DE_REINTREBAT = 20;

/**
 * De la ce vechime o comanda neincheiata trece pe banda a doua.
 *
 * ═══ ⚠ ERA O TAIETURA, SI COMENZILE VECHI DISPAREAU DE TOT (27.08.2026) ═══
 *
 * `gte("created_at", acum - 60 de zile)` scotea din reconciliere orice comanda mai veche. Teama
 * scrisa atunci — „bazinul creste la nesfarsit, iar cele vii ar astepta dupa ele" — nu se
 * verifica: ordonarea e dupa `reintrebat_la` crescator, cu `nullsFirst`, deci o comanda NOUA
 * intra mereu prima. Nimeni nu asteapta dupa nimeni.
 *
 * ⚠ IAR O COMANDA DESCHISA DE 90 DE ZILE E SUSPECTA TOCMAI DE-AIA, deci ultimul lucru de facut e
 * s-o uitam. Poate fi marfa rezervata degeaba, sau o expediere care n-a fost niciodata confirmata.
 *
 * ⚠ CE RAMANE: doua benzi. Cele din ultimele 60 de zile se intreaba la fiecare trecere; cele mai
 * vechi umplu locurile ramase, deci se intreaba mai rar, dar NU dispar niciodata.
 */
const ZILE_BANDA_INTAI_AY = 60;

/**
 * Reintreaba comenzile care nu s-au incheiat, pe NUMAR.
 *
 * ═══ ⚠ FEREASTRA FILTREAZA DUPA DATA CREARII, DECI NU VEDE O SCHIMBARE TARZIE ═══
 *
 * Scrie chiar in `candFacuta`: „`orders_from` merge pe `created_at`". Deci o comanda facuta acum
 * trei saptamani care se anuleaza AZI nu mai reintra in nicio fereastra — marcajul a trecut demult
 * de data crearii ei.
 *
 * ⚠ Webhook-ul e calea rapida, dar nu e o garantie: daca ruta noastra e indisponibila cat timp ei
 * reincearca, evenimentul se pierde definitiv, iar sondarea nu-l poate recupera.
 *
 * ⚠ NU MUTA NICIUN MARCAJ. E o reconciliere, nu o aducere: n-are fereastra, deci n-are ce pierde
 * si n-are ce avansa. Cele doua cai sunt despartite anume.
 */
export async function reconciliazaComenzile(
  admin: Db, ctx: AboutYouSyncContext,
): Promise<{ verificate: number }> {
  const deLa = new Date(Date.now() - ZILE_BANDA_INTAI_AY * 24 * 3600_000).toISOString();
  const citeste = async (recente: boolean, cate: number) => {
    let q = admin.from("aboutyou_orders").select("aboutyou_order_number, items")
      .eq("business_id", ctx.businessId);
    q = recente ? q.gte("created_at", deLa) : q.lt("created_at", deLa);
    return randuriCitite<{ aboutyou_order_number: string; items: unknown }>(
      recente ? "aboutyou.comenziNeincheiate" : "aboutyou.comenziVechiNeincheiate",
      /* ⚠ Cele mai demult atinse intai, ca sa nu ramana niciuna in urma. */
      await q.order("reintrebat_la", { ascending: true, nullsFirst: true })
        .limit(cate) as never);
  };

  /*
   * ⚠ DOUA BENZI, si ordinea lor e chiar regula. Vezi nota de la `ZILE_BANDA_INTAI_AY`: comenzile
   * din ultimele saizeci de zile au prioritate, iar cele mai vechi umplu ce ramane. Asa nu se mai
   * pierde niciuna, dar nici nu tin locul celor vii.
   */
  const recente = await citeste(true, COMENZI_DE_REINTREBAT);
  const randuri = recente.length >= COMENZI_DE_REINTREBAT
    ? recente
    : [...recente, ...await citeste(false, COMENZI_DE_REINTREBAT - recente.length)];

  /*
   * ⚠ Taierea pe stari se face AICI, nu in interogare: starea adevarata sta pe LINII, in `items`,
   * si nu se poate filtra pe ea din SQL fara sa desfacem jsonb-ul. Bazinul e deja marginit la
   * `COMENZI_DE_REINTREBAT`, deci costul e o citire, nu o scanare.
   */
  const deIntrebat = randuri.filter((r) => {
    const linii = Array.isArray(r.items) ? (r.items as { status?: string }[]) : [];
    if (linii.length === 0) return true; // nu stim nimic despre ea: se intreaba
    return linii.some((l) => !l.status || !LINII_INCHEIATE_AY.has(l.status));
  });

  let verificate = 0;
  let picate = 0;
  for (const r of deIntrebat) {
    /*
     * ═══ ⚠ O COMANDA PICATA NU ARE VOIE SA TINA ROATA PE LOC (27.08.2026) ═══
     *
     * `ingestOrderByNumber` a inceput sa ARUNCE azi — corect, ca sa nu mai marcheze evenimente de
     * webhook drept prelucrate degeaba. Dar aici bucla n-avea nicio plasa: prima comanda picata
     * oprea si restul lotului, SI sarea peste scrierea lui `reintrebat_la` de mai jos. Adica
     * exact aceleasi douazeci de comenzi reveneau la fiecare trecere, la nesfarsit, si niciuna
     * dintre celelalte nu mai era reintrebata vreodata.
     *
     * ⚠ SE PRINDE PE FIECARE, ca la `pollOrders`. Reconcilierea e o PLASA, nu calea principala:
     * o comanda care nu se poate citi acum se reintreaba peste o tura, dupa ce roata s-a invartit.
     */
    try {
      await ingestOrderByNumber(admin, ctx, r.aboutyou_order_number);
      verificate++;
    } catch (e) {
      picate++;
      await logError({
        action: "aboutyou/reconciliere", severity: "warning",
        message: `comanda ${r.aboutyou_order_number} nu s-a putut reciti: ${e instanceof Error ? e.message : String(e)}`,
        details: { ayNumber: r.aboutyou_order_number }, businessId: ctx.businessId,
      });
    }
  }
  if (picate > 0 && verificate === 0 && deIntrebat.length > 0) {
    /*
     * ⚠ TOATE au picat: nu e o comanda proasta, e o cauza comuna (cheie invalidata, pana la ei).
     * Se scrie o data, la nivelul potrivit, ca sa nu se piarda printre avertismentele de mai sus.
     */
    await logError({
      action: "aboutyou/reconciliere", severity: "critical",
      message: `niciuna din cele ${deIntrebat.length} comenzi reintrebate nu s-a putut reciti`,
      details: { cate: deIntrebat.length }, businessId: ctx.businessId,
    });
  }

  /*
   * ⚠ ROATA SE INVARTE PE TOATE CELE CITITE, nu doar pe cele reintrebate. O comanda incheiata
   * ramasa in bazin (mai noua de 60 de zile) ar fi mereu prima in rand si le-ar tine pe celelalte
   * pe loc — chiar infometarea pe care rotatia o inlatura.
   */
  if (randuri.length > 0) {
    const { error } = await admin.from("aboutyou_orders")
      .update({ reintrebat_la: new Date().toISOString() } as never)
      .eq("business_id", ctx.businessId)
      .in("aboutyou_order_number", randuri.map((r) => r.aboutyou_order_number));
    if (error) {
      await logError({
        action: "aboutyou/reconciliere", severity: "warning",
        message: `roata reconcilierii comenzilor nu s-a putut invarti: ${error.message}`,
        details: { cate: randuri.length }, businessId: ctx.businessId,
      });
    }
  }
  return { verificate };
}

/**
 * ═══ ⚠ EVENIMENTUL PAREA PRELUCRAT DESI NU SE INTAMPLASE NIMIC (27.08.2026) ═══
 *
 * Functia inghitea toate cele trei feluri de a nu reusi: cererea catre ei picata, comanda
 * negasita, si ingestul cazut. Iesea linistita, `prelucreazaEveniment` parea reusit, iar
 * `reiaEvenimenteleNeprelucrate` scria `prelucrat_la` pe randul din inbox.
 *
 * Adica exact ce inbox-ul fusese facut sa impiedice: o expediere sau o anulare marcata drept
 * prelucrata, fara sa se fi intamplat. Si nu se mai reia niciodata, fiindca randul e „gata".
 *
 * ⚠ ARUNCA acum pe TOATE trei, inclusiv pe „negasita". Ar fi fost tentant s-o iau drept un
 * raspuns bun — le-am cerut, au zis ca n-o au — dar o lista goala poate veni si dintr-o clipa in
 * care comanda inca nu s-a asezat la ei. Reincercarea e marginita: `MAX_INCERCARI_INBOX`
 * incercari, apoi randul se abandoneaza ZGOMOTOS, cu `critical` in jurnal.
 */
export async function ingestOrderByNumber(admin: Db, ctx: AboutYouSyncContext, orderNumber: string): Promise<void> {
  const res = await getOrders(ctx.auth, { order_number: orderNumber, per_page: 5 });
  if (isAboutYouError(res)) {
    throw new Error(`Comanda ${orderNumber} nu s-a putut citi de la About You: ${res.error}`);
  }
  const order = (res.data?.items ?? []).find((o) => o.order_number === orderNumber) ?? res.data?.items?.[0];
  if (!order) {
    throw new Error(`About You nu a intors comanda ${orderNumber}.`);
  }
  /* Fara `catch`: cine cheama trebuie sa afle. Vezi nota de mai sus. */
  await ingestOrder(admin, ctx, order);
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
/*
 * ═══ ⚠ NIMENI NU CHEAMA `cancelOrderNow` SI `returnOrderNow` (26.08.2026) ═══
 *
 * Cautat in tot depozitul, fara excluderi: singurele aparitii sunt chiar definitiile lor. Nu
 * exista nici actiune de server, nici buton. Deci anularea si returul pornite DIN EDINIO nu
 * exista in practica, oricat de complet ar arata codul de dedesubt.
 *
 * ⚠ SE SCRIE AICI, NU SE STERG. Amandoua sunt scrise cu grija — inregistreaza lotul, ca „in curs
 * de anulare" sa nu fie o stare fara iesire — si azi li s-au strans si filtrele de stare (`open`
 * pentru anulare, `shipped` pentru retur). Sterse, munca asta s-ar pierde; lasate nemarcate, cine
 * citeste fisierul crede ca fluxul merge.
 *
 * ⚠ CE LIPSESTE E O HOTARARE DE ECRAN, nu cod: care linii se aleg, ce confirmare cere o anulare
 * (e ireversibila), si de unde vine AWB-ul de retur — `returnOrderNow` il cere ca argument, iar
 * din cei 17 curieri unul singur are azi asa ceva. Alea sunt hotarari ale comerciantului, nu ale
 * mele, deci nu le iau in locul lui.
 */
export async function cancelOrderNow(
  admin: Db, ctx: AboutYouSyncContext, orderId: string,
): Promise<{ ok: true; batchRequestId?: string } | { ok: false; error: string }> {
  /* ⚠ Anularea merge NUMAI pe liniile `open`: una deja expediata nu se mai anuleaza. */
  const ids = await idsArticoleInStarea(admin, ctx, orderId, "open");
  if ("error" in ids) return { ok: false, error: ids.error };
  /*
   * ⚠ Prin `cuLotDurabil`: urma se scrie INAINTE de cerere. O anulare pentru care About You a
   * raspuns iar noi n-am tinut minte nimic e cea mai urata forma — nu se poate relua orbeste
   * (s-ar anula de doua ori) si nu se poate uita.
   */
  /*
   * ⚠ UN SINGUR FOC: NU SE RELUA ORBESTE. „Ei au primit-o si noi n-am putut lega id-ul" nu e
   * acelasi lucru cu „a picat" — o retrimitere de-acolo ar face fapta de doua ori. Se opreste si
   * se cere un om; randul de intentie ramane deschis, iar `alarmaIntentiiDeschise` il scoate la
   * lumina cu tot ce trebuie pentru o verificare in Seller Center.
   */
  const lot = await cuLotDurabil(admin, ctx.businessId, "cancel", [orderId],
    () => cancelOrderItems(ctx.auth, ids.ids.map((id) => ({ id }))));
  if (lot.fel === "intentie-nescrisa") {
    return { ok: false, error: "Nu am putut ține evidența anulării; încearcă din nou." };
  }
  if (lot.fel === "neurmarit") {
    return {
      ok: false,
      error: "Am trimis cererea la About You, dar nu știm dacă a fost primită."
        + " Verifică în Seller Center înainte de a încerca din nou.",
    };
  }
  const res = lot.res;
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
  return { ok: true, batchRequestId: id };
}

export async function returnOrderNow(
  admin: Db, ctx: AboutYouSyncContext, orderId: string, returnTrackingKey: string,
): Promise<{ ok: true; batchRequestId?: string } | { ok: false; error: string }> {
  const cheie = returnTrackingKey.trim();
  if (!cheie) return { ok: false, error: "Completează numărul AWB de retur." };
  /* ⚠ Returul merge NUMAI pe liniile `shipped`: una care n-a plecat inca n-are ce sa se intoarca. */
  const ids = await idsArticoleInStarea(admin, ctx, orderId, "shipped");
  if ("error" in ids) return { ok: false, error: ids.error };
  /*
   * ⚠ UN SINGUR FOC: NU SE RELUA ORBESTE. „Ei au primit-o si noi n-am putut lega id-ul" nu e
   * acelasi lucru cu „a picat" — o retrimitere de-acolo ar face fapta de doua ori. Se opreste si
   * se cere un om; randul de intentie ramane deschis, iar `alarmaIntentiiDeschise` il scoate la
   * lumina cu tot ce trebuie pentru o verificare in Seller Center.
   */
  const lot = await cuLotDurabil(admin, ctx.businessId, "return", [orderId],
    () => returnOrderItems(ctx.auth, [{ order_items: ids.ids, return_tracking_key: cheie }]));
  if (lot.fel === "intentie-nescrisa") {
    return { ok: false, error: "Nu am putut ține evidența returului; încearcă din nou." };
  }
  if (lot.fel === "neurmarit") {
    return {
      ok: false,
      error: "Am trimis cererea la About You, dar nu știm dacă a fost primită."
        + " Verifică în Seller Center înainte de a încerca din nou.",
    };
  }
  const res = lot.res;
  if (isAboutYouError(res)) return { ok: false, error: res.error };
  await marcheazaSideRow(admin, ctx, orderId, "return_pending");
  // Ca la anulare: fara inregistrare, „in curs de retur" nu se inchide niciodata.
  const id = res.data?.batchRequestId;
  return { ok: true, batchRequestId: id };
}

/**
 * Liniile comenzii care sunt intr-o anume stare la ei.
 *
 * ═══ ⚠ FIECARE OPERATIE ARE STAREA EI, SI NU E „ORICE IN AFARA DE DOUA" (26.08.2026) ═══
 *
 * Documentatia lor cere:
 *
 *     expediere   numai liniile `open`
 *     anulare     numai liniile `open`
 *     retur       numai liniile `shipped`
 *
 * Aici se filtra `!== "cancelled" && !== "returned"`, adica se lasau sa treaca si `open`, si
 * `shipped`, si orice stare noua pe care ei ar introduce-o. Deci o anulare putea include o linie
 * deja EXPEDIATA, iar un retur putea include una care n-a plecat inca — cereri pe care ei le
 * resping, sau, mai rau, le accepta partial si starile noastre se despart de ale lor.
 *
 * ⚠ SE NUMESC STARILE CERUTE, NU CELE OPRITE. O lista de „ce se opreste" lasa pe dinafara tot ce
 * nu cunoastem, iar `AboutYouOrderItem.status` poate primi valori noi fara sa ne intrebe. E
 * aceeasi hotarare pe care am luat-o azi la retururile Trendyol, din acelasi motiv.
 */
async function idsArticoleInStarea(
  admin: Db, ctx: AboutYouSyncContext, orderId: string, ceruta: "open" | "shipped",
): Promise<{ ids: number[] } | { error: string }> {
  /*
   * ⚠ `data: null` dintr-o pana se citea ca „nu e comanda About You". Aceeasi clasa reparata azi
   * in `queue.ts`: o citire picata nu are voie sa devina o hotarare.
   */
  const rand = randCitit<{ items: unknown }>("aboutyou.liniileComenzii", await admin
    .from("aboutyou_orders").select("items")
    .eq("business_id", ctx.businessId).eq("order_id", orderId).maybeSingle());
  if (!rand) return { error: "Comanda nu este o comandă About You." };
  const items = Array.isArray(rand.items)
    ? (rand.items as { order_item_id?: number; status?: string }[])
    : [];
  const ids = items
    .filter((i) => i.status === ceruta)
    .map((i) => i.order_item_id)
    .filter((x): x is number => typeof x === "number");
  if (ids.length === 0) {
    return {
      error: ceruta === "open"
        ? "Comanda nu mai are articole deschise."
        : "Comanda nu are articole expediate, deci nu se poate cere retur.",
    };
  }
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
