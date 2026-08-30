// Thin authenticated REST wrapper over the About You Partner API v1.
// Auth: `X-API-Key` header (per-merchant BYO key). Base URL resolved per
// environment (production | sandbox). Everything write-side is async batch:
// POST/PUT return `{ batchRequestId }`, which is polled via `/results/*`.
//
// Responses are JSON; errors are normalised into a single shape so callers can
// branch with `isAboutYouError`. `cache: "no-store"` mirrors the OLX client
// (Vercel Data Cache returned 500s at runtime for small upstream calls).

import { asteaptaJetonImpartit, asteptareaCerutaDeEi, spunePauza } from "@/lib/marketplace/ritm-impartit";
import { createHash } from "node:crypto";
import { aboutyouBaseUrl } from "./auth";
import type {
  AboutYouAttributeGroup, AboutYouBatchAck, AboutYouBatchResult, AboutYouBrand,
  AboutYouCarrier, AboutYouCategory, AboutYouCountriesResponse, AboutYouEnvironment,
  AboutYouGetProductItem, AboutYouOrder, AboutYouOrderStatus, AboutYouProductItem,
  AboutYouRejectedProduct,
} from "./types";

export interface AboutYouAuth {
  apiKey: string;
  environment?: AboutYouEnvironment;
}

export type AboutYouResult<T> =
  | { data: T }
  | { error: string; status: number; details?: unknown };

export function isAboutYouError<T>(r: AboutYouResult<T>): r is { error: string; status: number; details?: unknown } {
  return "error" in r;
}

// Fara termen limita, un raspuns care nu mai vine tine functia ocupata pana o
// taie platforma, iar utilizatorul ramane cu rotita invartindu-se. Douazeci de
// secunde e mult peste orice raspuns normal al API-ului.
const TIMEOUT_MS = 20_000;

/**
 * Plafoanele lor, pe familie de rute.
 *
 * ═══ ⚠ NIMIC NU LE PAZEA (26.08.2026) ═══
 *
 * Sondarea comenzilor putea scoate pana la cinci statusuri × patruzeci de pagini = doua sute de
 * cereri pe magazin intr-o singura rulare, peste plafonul de o suta pe minut al rutei de comenzi.
 * Iar cererile RESPINSE se numara si ele in limita, deci depasirea se hraneste singura.
 *
 * ⚠ SE FOLOSESTE LIMITATORUL IMPARTIT AL CASEI, nu unul pe proces. Pe mai multe instante, un
 * contor local ar fi lasat fiecare instanta sa creada ca are tot bugetul — vezi nota de la
 * `spunePauza`: „un 429 il ia fiecare pe rand".
 */
/*
 * ═══ ⚠ PATRU GALETI ACOPEREAU RUTE CU PLAFOANE DIFERITE (27.08.2026) ═══
 *
 * `/orders` la 100 acoperea si `/orders/cancel` si `/orders/return`, iar `/products` la 100
 * acoperea si `/products/rejected` — ruta pentru care CHIAR COMENTARIUL NOSTRU din `sync.ts`
 * scria „limita rutei e 50 de cereri pe minut, de douazeci de ori mai stransa". Stiam si nu
 * pusesem numarul unde conteaza.
 *
 * ⚠ ORDINEA CONTEAZA: se ia PRIMA potrivire, deci rutele stramte stau INAINTEA familiei lor.
 *
 * ⚠ SE STRANGE, NU SE LARGESTE. Un plafon mai mic decat cel adevarat costa doar viteza pe rute
 * chemate rar; unul mai mare inseamna cereri respinse — si ele se numara in limita, deci
 * greseala se hraneste singura.
 */
const LIMITE_AY: { potrivire: RegExp; limita: number; nume: string }[] = [
  /* Rutele de actionare pe comanda sunt mult mai stramte decat citirea comenzilor. */
  { potrivire: /^\/orders\/(cancel|return)/, limita: 50, nume: "orders-actiuni" },
  { potrivire: /^\/orders/, limita: 100, nume: "orders" },
  { potrivire: /^\/products\/(stock|price)/, limita: 200, nume: "stock-price" },
  { potrivire: /^\/products\/rejected/, limita: 50, nume: "products-rejected" },
  { potrivire: /^\/products/, limita: 100, nume: "products" },
  /* Nomenclatoarele nu se cheama des, deci o galeata stramta nu costa nimic. */
  /*
   * ⚠ Rutele de rezultate cadeau pe „altele" — plafonul de rezerva, tot 100. Aceeasi cifra, dar
   * scrisa: sunt cele mai chemate rute din integrare (fiecare lot deschis, la fiecare minut), deci
   * merita sa se vada in tabela, nu sa se afle citind implicitul.
   */
  { potrivire: /^\/results/, limita: 100, nume: "results" },
  { potrivire: /^\/(brands|colors|sizes|materials)/, limita: 50, nume: "taxonomie-mica" },
  { potrivire: /^\/(categories|attributes|countries)/, limita: 100, nume: "taxonomie" },
];

/**
 * Plafoane STRANSE dupa ce ne-au spus ei, prin `X-RateLimit-Limit`.
 *
 * ⚠ NUMAI IN JOS. Antetul lor e adevarul, dar citit gresit in sus ar deschide robinetul peste
 * ce ingaduie ei — iar cererile respinse se numara si ele. Strans, cel mai rau caz e sa mergem
 * mai incet decat am putea.
 *
 * ⚠ E pe proces, nu in baza: galeata insasi e impartita (`asteaptaJetonImpartit`), dar plafonul
 * il afla fiecare instanta din primul raspuns pe care il primeste. Se aliniaza singure.
 */
const plafoaneAflate = new Map<string, number>();

/** Ce plafon ne-au spus ei, daca ne-au spus. */
function plafonDinAntet(h: Headers): number | null {
  for (const nume of ["x-ratelimit-limit", "ratelimit-limit"]) {
    const v = h.get(nume);
    if (!v) continue;
    /* `RateLimit-Limit` poate veni si ca „100, 100;w=60"; ne trebuie primul numar. */
    const n = Number.parseInt(v.trim().split(/[,;\s]/)[0] ?? "", 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Amprenta cheii API, pentru chei de galeata. Nu poarta nimic din secret.
 *
 * ⚠ Se taie la 16 caractere hexa: destul ca doua conturi sa nu se ciocneasca, si nici pe departe
 * de ajuns ca sa se intoarca la cheie.
 */
function amprentaCheii(apiKey: string | undefined): string {
  return createHash("sha256").update((apiKey ?? "").trim()).digest("hex").slice(0, 16);
}

/** Familia de rute si plafonul ei. Ce nu se potriveste primeste cel mai strans plafon. */
function galeata(auth: AboutYouAuth, path: string): { cheie: string; limita: number } {
  const g = LIMITE_AY.find((x) => x.potrivire.test(path));
  /*
   * ⚠ Cheia poarta si MEDIUL: sandbox si productie au bugete deosebite, iar amestecate una ar
   * manca-o pe cealalta. Si cheia contului, nu magazinul: plafonul e pe cheia API.
   *
   * ⚠ SE IA AMPRENTA, NU O BUCATA DIN SECRET (27.08.2026). Erau ultimele opt caractere ale
   * cheii API, puse intr-o cheie de galeata care ajunge in baza si in loguri. N-ar fi de ajuns ca
   * sa reconstruiesti cheia, dar o bucata dintr-un secret intr-un loc operational nu are ce cauta:
   * o amprenta face aceeasi treaba — aceeasi cheie da acelasi sir — fara sa poarte nimic din el.
   */
  const cont = `${auth.environment ?? "production"}:${amprentaCheii(auth.apiKey)}`;
  return { cheie: `aboutyou:${cont}:${g?.nume ?? "altele"}`, limita: g?.limita ?? 100 };
}

async function call<T>(
  auth: AboutYouAuth,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
): Promise<AboutYouResult<T>> {
  if (!auth?.apiKey) return { error: "Cheia API About You lipsește.", status: 0 };
  // O cheie ajunsa aici necriptata sau cu spatii ar produce un 401 pe care nimeni
  // nu l-ar lega de sursa lui. Mai bine spunem exact ce e in neregula.
  const apiKey = auth.apiKey.trim();
  if (apiKey.startsWith("enc.v1.")) {
    return { error: "Cheia API About You a fost citită criptat (eroare internă). Reconectează contul.", status: 0 };
  }

  /*
   * ⚠ SE ASTEAPTA UN JETON INAINTE DE ORICE CERERE. Cand nu vine in bugetul limitatorului, NU se
   * trimite: se intoarce ca o cauza trecatoare (status 0), pe care cronul o stie deja sa n-o puna
   * in contul elementului. Trimisa oricum, ar fi fost inca o cerere respinsa numarata in limita.
   */
  const { cheie, limita } = galeata(auth, path);
  /* ⚠ Daca ei ne-au spus un plafon mai mic, al lor conteaza. Vezi `plafoaneAflate`. */
  const plafon = Math.min(limita, plafoaneAflate.get(cheie) ?? limita);
  if (!await asteaptaJetonImpartit(cheie, plafon, 60_000, "aboutyou")) {
    return { error: "Limita de cereri About You e atinsă; se reia la trecerea următoare.", status: 0 };
  }

  try {
    const res = await fetch(`${aboutyouBaseUrl(auth.environment)}${path}`, {
      method,
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    /*
     * ⚠ CE SPUN EI BATE SOCOTEALA NOASTRA. Un `429` inseamna sigur ca am trecut de limita,
     * indiferent ce credea galeata; iar `Retry-After` spune cat, si o spune TUTUROR instantelor
     * prin `spunePauza`. Fara asta, prima instanta se opreste si celelalte continua sa bata la
     * aceeasi usa — iar cererile respinse se numara si ele in limita.
     */
    if (res.status === 429) {
      await spunePauza(cheie, asteptareaCerutaDeEi(res.headers, 30_000), "aboutyou");
    }

    /*
     * ⚠ SE INVATA DIN ANTETUL LOR, si numai in jos. Tabela de mai sus e cea mai buna presupunere
     * a noastra; `X-RateLimit-Limit` e chiar raspunsul lor. Cand al lor e mai mic, il tinem minte
     * pentru galeata asta si urmatoarele cereri il respecta.
     */
    const spusDeEi = plafonDinAntet(res.headers);
    if (spusDeEi != null && spusDeEi < (plafoaneAflate.get(cheie) ?? limita)) {
      plafoaneAflate.set(cheie, spusDeEi);
    }

    if (res.status === 204) return { data: undefined as T };
    const text = await res.text();
    let json: unknown = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!res.ok) {
      const obj = (json ?? {}) as Record<string, unknown>;
      const detail =
        (typeof obj.message === "string" && obj.message) ||
        (typeof obj.error === "string" && obj.error) ||
        (typeof obj.detail === "string" && obj.detail) ||
        `HTTP ${res.status}`;
      return { error: detail, status: res.status, details: json };
    }
    return { data: json as T };
  } catch (e) {
    const expirat = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      error: expirat ? "About You nu a răspuns la timp. Încearcă din nou." : "Eroare de rețea către About You.",
      status: 0,
    };
  }
}

/**
 * Mesaj pentru comerciant, pornind de la esecul real.
 *
 * Are voie sa arate si textul venit de la About You: fara el, „nu a mers" e tot
 * ce afla omul, iar noi nu avem cum sa aflam mai tarziu ce s-a intamplat.
 */
export function mesajEroare(ce: string, error: string, status: number): string {
  if (status === 401 || status === 403) {
    return "Cheia API About You nu mai este validă sau nu are permisiunile necesare. Reconectează contul.";
  }
  if (status === 429) return "About You a limitat temporar cererile. Încearcă din nou peste un minut.";
  if (status === 0) return error;
  return `${ce} (About You: ${error})`;
}

// ── Connection test ───────────────────────────────────────────────────────────
// The lightest documented authenticated read: GET the product list. A 2xx means
// the key is valid; 401/403 means it is not.
export async function testConnection(
  auth: AboutYouAuth,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const res = await call<unknown>(auth, "GET", "/products/");
  if (!isAboutYouError(res)) return { ok: true };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Cheia API About You este invalidă sau nu are permisiuni.", status: res.status };
  }
  if (res.status === 0) {
    return { ok: false, error: "Nu am putut contacta About You. Verifică rețeaua și reîncearcă.", status: 0 };
  }
  return { ok: false, error: res.error || `Eroare About You (HTTP ${res.status}).`, status: res.status };
}

// ── Products (async batch) ────────────────────────────────────────────────────
export function upsertProducts(auth: AboutYouAuth, items: AboutYouProductItem[]) {
  return call<AboutYouBatchAck>(auth, "POST", "/products/", { items });
}
export function getProductBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult<AboutYouProductItem>>(
    auth, "GET", `/results/products?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}
// Read products back for status reconciliation + rejection reasons.
export function getProducts(
  auth: AboutYouAuth,
  params: { status?: string; style_key?: string; sku?: string; page?: number; per_page?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.style_key) q.set("style_key", params.style_key);
  if (params.sku) q.set("sku", params.sku);
  if (params.page != null) q.set("page", String(params.page));
  if (params.per_page != null) q.set("per_page", String(params.per_page));
  const qs = q.toString();
  return call<{ items: AboutYouGetProductItem[]; pagination?: Record<string, unknown> }>(auth, "GET", `/products/${qs ? `?${qs}` : ""}`);
}

/*
 * Motivele de respingere au ENDPOINT PROPRIU.
 *
 * `GET /products/` intoarce statusul, dar schema lui (GetProductItemSchema) nu
 * are nici `rejection_reasons`, nici `rejection_message` — campurile alea exista
 * doar aici si in webhookul `product_master.status_updated`. Reconcilierea le
 * citea de pe `/products/`, primea `undefined` si scria peste ele lista goala,
 * la fiecare trecere: comerciantul vedea „respins" fara sa afle vreodata de ce.
 * Limita de rata e mult mai stransa decat la /products/ (50/min fata de 1000).
 */
export function getRejectedProducts(
  auth: AboutYouAuth, params: { style_key?: string; page?: number; per_page?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.style_key) q.set("style_key", params.style_key);
  if (params.page != null) q.set("page", String(params.page));
  if (params.per_page != null) q.set("per_page", String(params.per_page));
  const qs = q.toString();
  return call<{ items: AboutYouRejectedProduct[]; pagination?: Record<string, unknown> }>(
    auth, "GET", `/products/rejected${qs ? `?${qs}` : ""}`);
}

// Update Product Status (and publish). Settable statuses: published | inactive | draft.
export function updateProductStatus(auth: AboutYouAuth, items: { style_key: string; status: "published" | "inactive" | "draft" }[]) {
  return call<AboutYouBatchAck>(auth, "PUT", "/products/status", { items });
}
export function getStatusBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/status?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}

// ── Stock & prices (async batch) ──────────────────────────────────────────────
export function updateStock(auth: AboutYouAuth, items: { sku: string; quantity: number; valid_at?: string | null }[]) {
  return call<AboutYouBatchAck>(auth, "PUT", "/products/stocks", { items });
}
export function getStockBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/stocks?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}
export function updatePrice(
  auth: AboutYouAuth,
  items: { sku: string; price: { country_code: string; retail_price?: number | null; sale_price?: number | null }; valid_at?: string | null }[],
) {
  return call<AboutYouBatchAck>(auth, "PUT", "/products/prices", { items });
}
export function getPriceBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/prices?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}

// ── Orders & shipment ─────────────────────────────────────────────────────────
export function getOrders(
  auth: AboutYouAuth,
  params: { order_number?: string; order_status?: AboutYouOrderStatus; orders_from?: string; orders_to?: string; page?: number; per_page?: number; cursor?: string } = {},
) {
  const q = new URLSearchParams();
  if (params.order_number) q.set("order_number", params.order_number);
  if (params.order_status) q.set("order_status", params.order_status);
  if (params.orders_from) q.set("orders_from", params.orders_from);
  if (params.orders_to) q.set("orders_to", params.orders_to);
  if (params.page != null) q.set("page", String(params.page));
  if (params.per_page != null) q.set("per_page", String(params.per_page));
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return call<{ items: AboutYouOrder[]; pagination?: Record<string, unknown> }>(auth, "GET", `/orders/${qs ? `?${qs}` : ""}`);
}
export function shipOrderItems(
  auth: AboutYouAuth,
  items: { order_items: number[]; carrier_key: string; shipment_tracking_key: string; return_tracking_key?: string }[],
) {
  return call<AboutYouBatchAck>(auth, "POST", "/orders/ship", { items });
}
export function getShipBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/ship-orders?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}

// Anulare / retur pornite din Edinio. Existau in API, dar nu erau folosite:
// comerciantul trebuia sa intre in Seller Center, iar Edinio ramanea cu o comanda
// pe care o credea in lucru.
// ATENTIE la diferenta fata de retur: `CancelOrderItemSchema` cere `{ id }` — un
// articol per intrare — pe cand `ReturnItemSchema` cere `{ order_items, return_tracking_key }`.
export function cancelOrderItems(auth: AboutYouAuth, items: { id: number }[]) {
  return call<AboutYouBatchAck>(auth, "POST", "/orders/cancel", { items });
}
export function getCancelBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/cancel-orders?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}
export function returnOrderItems(
  auth: AboutYouAuth, items: { order_items: number[]; return_tracking_key: string }[],
) {
  return call<AboutYouBatchAck>(auth, "POST", "/orders/return", { items });
}
export function getReturnBatchResults(auth: AboutYouAuth, batchRequestId: string) {
  return call<AboutYouBatchResult>(auth, "GET", `/results/return-orders?batch_request_id=${encodeURIComponent(batchRequestId)}`);
}

/*
 * Documentele comenzii: factura si documentul de livrare.
 *
 * Amandouă intorc BINAR (PDF), nu JSON, deci nu trec prin `call()` — acela citeste
 * si interpreteaza corpul. Limita lor e mult mai stransa decat la restul: 10
 * cereri pe minut la facturi.
 *
 * About You e cel care emite factura catre cumparator (el detine checkout-ul si
 * incasarea), iar comerciantul are nevoie de ea pentru contabilitate. Pana acum nu
 * exista nicio cale sa o ia din Edinio.
 */
export async function getOrderDocument(
  auth: AboutYouAuth, orderNumber: string, fel: "invoices" | "delivery-document",
): Promise<AboutYouResult<{ continut: ArrayBuffer; tip: string }>> {
  const apiKey = auth?.apiKey?.trim();
  if (!apiKey) return { error: "Cheia API About You lipsește.", status: 0 };
  if (apiKey.startsWith("enc.v1.")) {
    return { error: "Cheia API About You a fost citită criptat (eroare internă). Reconectează contul.", status: 0 };
  }
  /*
   * ⚠ `delivery_document` cu UNDERSCORE, nu cu cratima.
   *
   * E singura cale din tot API-ul lor care foloseste underscore, iar tabelul lor
   * de limite o listeaza gresit, cu cratima — de acolo pare copiata. Eticheta
   * noastra ramane cu cratima (e valoare de interfata), dar calea reala se ia din
   * tabelul de mai jos. Cu cratima, raspunsul e 404, iar `getAboutYouOrderDocument`
   * traduce 404 in „nu s-a emis inca": o minciuna la fiecare apel.
   */
  const CAI = { invoices: "invoices", "delivery-document": "delivery_document" } as const;
  const cale = `/orders/${encodeURIComponent(orderNumber)}/${CAI[fel]}`;
  try {
    const res = await fetch(`${aboutyouBaseUrl(auth.environment)}${cale}`, {
      method: "GET",
      // Corpul e BINAR, deci nu cerem si nu interpretam JSON — de aceea nu trece
      // prin `call()`.
      headers: { "X-API-Key": apiKey, Accept: "application/pdf" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detaliu = `HTTP ${res.status}`;
      try {
        const obj = JSON.parse(text) as Record<string, unknown>;
        detaliu = (typeof obj.message === "string" && obj.message)
          || (typeof obj.detail === "string" && obj.detail) || detaliu;
      } catch { /* raspuns nestructurat: ramane codul HTTP */ }
      return { error: detaliu, status: res.status };
    }
    return {
      data: {
        continut: await res.arrayBuffer(),
        tip: res.headers.get("content-type") ?? "application/pdf",
      },
    };
  } catch (e) {
    const expirat = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      error: expirat ? "About You nu a răspuns la timp. Încearcă din nou." : "Eroare de rețea către About You.",
      status: 0,
    };
  }
}

// ── Webhooks (subscription management) ────────────────────────────────────────
/*
 * Introspectia abonamentelor. Existau in specificatie si nu erau folosite: puteam
 * doar sa CREAM si sa STERGEM un abonament, deci nu se putea afla daca cel din baza
 * mai traieste, nici ce evenimente acopera. Un abonament rupt tacea la nesfarsit.
 */
export interface AboutYouWebhookSubscription {
  id?: number | string | null;
  events?: string[];
  url?: string;
  /** Comutatorul LOR de activare. Oprit, abonamentul exista dar nu livreaza nimic. */
  enabled?: boolean;
  description?: string | null;
}
export function listWebhookSubscriptions(auth: AboutYouAuth) {
  return call<AboutYouWebhookSubscription[]>(auth, "GET", "/webhooks/");
}
export function getWebhookSubscription(auth: AboutYouAuth, id: string) {
  return call<AboutYouWebhookSubscription>(auth, "GET", `/webhooks/${encodeURIComponent(id)}`);
}

export function createWebhookSubscription(
  auth: AboutYouAuth,
  body: { events: string[]; url: string; description?: string },
) {
  return call<{ id?: number | string | null; client_secret?: string }>(auth, "POST", "/webhooks/", body);
}
export function deleteWebhookSubscription(auth: AboutYouAuth, id: string) {
  return call<undefined>(auth, "DELETE", `/webhooks/${encodeURIComponent(id)}`);
}

// ── Nomenclature (countries / brands / categories / attribute groups) ─────────
export function listCountries(auth: AboutYouAuth) {
  return call<AboutYouCountriesResponse>(auth, "GET", "/countries/");
}
export function listBrands(auth: AboutYouAuth) {
  return call<AboutYouBrand[]>(auth, "GET", "/brands/");
}
export function listCategories(
  auth: AboutYouAuth,
  params: { query?: string; parent_category?: number; page?: number; per_page?: number } = {},
) {
  const q = new URLSearchParams();
  if (params.query) q.set("query", params.query);
  if (params.parent_category != null) q.set("parent_category", String(params.parent_category));
  if (params.page != null) q.set("page", String(params.page));
  if (params.per_page != null) q.set("per_page", String(params.per_page));
  const qs = q.toString();
  return call<{ items: AboutYouCategory[]; pagination?: Record<string, unknown> }>(auth, "GET", `/categories/${qs ? `?${qs}` : ""}`);
}
export function listAttributeGroups(auth: AboutYouAuth, categoryId: number) {
  return call<AboutYouAttributeGroup[]>(auth, "GET", `/categories/${categoryId}/attribute-groups`);
}
// `per_page` implicit e 20, iar lista reala are peste atat (fiecare curier x
// fiecare tara). Fara el, jumatate din curieri lipseau din dropdown si comanda
// nu se putea expedia cu ei.
export function getCarriers(auth: AboutYouAuth, params: { page?: number; per_page?: number } = {}) {
  const q = new URLSearchParams();
  q.set("per_page", String(params.per_page ?? 100));
  if (params.page != null) q.set("page", String(params.page));
  return call<{ items: AboutYouCarrier[]; pagination?: Record<string, unknown> }>(
    auth, "GET", `/orders/carriers/?${q.toString()}`);
}
