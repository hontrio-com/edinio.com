import { cerereEasySales, type ContextEasySales, type Raspuns } from "./client";
import { abonarileDin } from "./abonari-lista";
import type {
  AbonareEasySales, ComandaEasySales, WebsiteEasySales,
} from "./tipuri";
import type { CorpProdus } from "./mapare-produs";

/**
 * Rutele easySales folosite de integrare, fiecare scrisa dupa colectie.
 *
 * ⚠ CE NU E AICI NU SE CHEAMA. Proba de contract (`contractul-api.test.ts`) cere ca fiecare
 * functie de mai jos sa aiba perechea (metoda, cale) in schema derivata din colectie, si ca
 * fiecare functie exportata sa aiba cel putin un test de contract.
 *
 * ⚠ `website_token` merge numai unde il arata exemplele colectiei: Add, Save, Update la comenzi
 * (si, in E3, la produse, categorii, caracteristici, stoc, preturi). Abonarile, anularea si
 * metadatele nu-l au in exemple.
 */

// ── Cont si website-uri ─────────────────────────────────────────────────────

/** `GET /api/v2/account` [A: company_name, vat_id, has_active_subscription, is_trial, expire_date...]. */
export function citesteContul(ctx: ContextEasySales): Promise<Raspuns<Record<string, unknown>>> {
  return cerereEasySales(ctx, { metoda: "GET", cale: "/account" });
}

/** `GET /api/v2/websites/list` [A: name, url, module_version, status; fara id si fara token]. */
export function listaWebsiteuri(ctx: ContextEasySales): Promise<Raspuns<WebsiteEasySales[]>> {
  return cerereEasySales(ctx, { metoda: "GET", cale: "/websites/list" });
}

/** `GET /api/v2/marketplaces/list` [A]. Daca arata canalele CONTULUI sau tot catalogul lor e M-MKT-1. */
export function listaMarketplaceuri(ctx: ContextEasySales): Promise<Raspuns<{ id?: unknown; name?: string | null }[]>> {
  return cerereEasySales(ctx, { metoda: "GET", cale: "/marketplaces/list" });
}

/** `GET /api/v2/delivery-statuses` [A: 1 Ready ... 7 Canceled]. Proba de contract la conectare. */
export function statusuriLivrare(ctx: ContextEasySales): Promise<Raspuns<{ description?: string | null; value?: unknown }[]>> {
  return cerereEasySales(ctx, { metoda: "GET", cale: "/delivery-statuses" });
}

// ── Webhook-uri ─────────────────────────────────────────────────────────────

/**
 * `GET /api/v2/webhooks`, intors ca lista PLATA de abonari, fiecare cu `webhook: {slug, name, group}`.
 * ⚠ La ei raspunsul e GRUPAT pe tipul de webhook (masurat pe 14.10.2026): vezi `abonarileDin`.
 */
export async function listaAbonari(ctx: ContextEasySales): Promise<Raspuns<AbonareEasySales[]>> {
  const r = await cerereEasySales<unknown>(ctx, { metoda: "GET", cale: "/webhooks" });
  return { ...r, date: r.ok ? abonarileDin(r.date) : null };
}

/**
 * `POST /api/v2/webhooks/{slug}` [A] cu `url`, `http_method` si secretul.
 *
 * ⚠ NUMELE CAMPULUI SECRETULUI E NECONFIRMAT: exemplul colectiei scrie `seccret`, ghidul `secret`
 * (M-WH-1). Apelantul alege; daca prima livrare iese „secret nepreluat", abonarile se refac cu
 * celalalt nume (planul, §6.7).
 */
export function aboneaza(
  ctx: ContextEasySales, slug: string, url: string, secret: string, campSecret: "secret" | "seccret",
): Promise<Raspuns<{ id?: unknown; url?: string | null }>> {
  return cerereEasySales(ctx, {
    metoda: "POST", cale: "/webhooks/{slug}", parametri: { slug },
    corp: { url, http_method: "post", [campSecret]: secret },
  });
}

/** `PUT /api/v2/webhooks/{id}` [A: corpul are numai `url`]. Ce face cu secretul e nedocumentat (M-WH-1). */
export function schimbaAdresaAbonarii(ctx: ContextEasySales, id: string, url: string): Promise<Raspuns<unknown>> {
  return cerereEasySales(ctx, { metoda: "PUT", cale: "/webhooks/{id}", parametri: { id }, corp: { url } });
}

/** `DELETE /api/v2/webhooks/{id}` [A]. */
export function dezaboneaza(ctx: ContextEasySales, id: string): Promise<Raspuns<unknown>> {
  return cerereEasySales(ctx, { metoda: "DELETE", cale: "/webhooks/{id}", parametri: { id } });
}

/**
 * `POST /api/v2/webhooks/{id}/trigger` [A: „may be used for testing"], fara corp.
 *
 * ⚠ 200 arata doar primirea cererii (IPOTEZA, M-WH-4); livrarea se dovedeste prin randul din inbox.
 */
export function declanseazaAbonarea(ctx: ContextEasySales, id: string): Promise<Raspuns<unknown>> {
  return cerereEasySales(ctx, { metoda: "POST", cale: "/webhooks/{id}/trigger", parametri: { id } });
}

// ── Comenzi ─────────────────────────────────────────────────────────────────

/**
 * `POST /api/v2/orders/save` [A]: „created or updated", cu `{website_token, source, order}`.
 *
 * ⚠ Cheia de potrivire a lui Save nu e scrisa (IPOTEZA, M-COM-1), iar exemplul raspunsului e
 * copiat de la Add. Deci un Save nu se reia orb: dupa un timp expirat se cauta intai comanda.
 */
export function salveazaComanda(ctx: ContextEasySales, order: Record<string, unknown>): Promise<Raspuns<ComandaEasySales>> {
  return cerereEasySales(ctx, {
    metoda: "POST", cale: "/orders/save", cuWebsiteToken: true,
    corp: { source: "api", order },
  });
}

/** `GET /api/v2/orders/{internal_id}` [A]. `internal_id` e id-ul LOR, obligatoriu pe toate rutele `/orders/{id}`. */
export function citesteComanda(ctx: ContextEasySales, internalId: string): Promise<Raspuns<ComandaEasySales>> {
  return cerereEasySales(ctx, { metoda: "GET", cale: "/orders/{id}", parametri: { id: internalId } });
}

export interface FiltreComenzi {
  order_display_id?: string;
  /** Comenzile care contin SKU-ul [A: filtrul `product_sku`]; deriva stocului (E4). */
  product_sku?: string;
  website?: string;
  modified_after?: string;
  page?: number;
  per_page?: number;
}

/** `GET /api/v2/orders` [A: paginat, `per_page` 1-100, filtrele documentate]. */
export function listaComenzi(
  ctx: ContextEasySales, f: FiltreComenzi,
): Promise<Raspuns<ComandaEasySales[]>> {
  return cerereEasySales(ctx, {
    metoda: "GET", cale: "/orders",
    interogare: { ...f, per_page: f.per_page ?? 100, page: f.page ?? 1 },
  });
}

/** `PATCH /api/v2/orders/{internal_id}/cancel` cu `{reason}` [A]. */
export function anuleazaComandaLaEi(ctx: ContextEasySales, internalId: string, motiv: string): Promise<Raspuns<ComandaEasySales>> {
  return cerereEasySales(ctx, {
    metoda: "PATCH", cale: "/orders/{id}/cancel", parametri: { id: internalId },
    corp: { reason: motiv.slice(0, 191) },
  });
}

/** `POST /api/v2/orders/{internal_id}/metadata` [A: chei si valori de cel mult 191 de caractere]. */
export function adaugaMetadate(
  ctx: ContextEasySales, internalId: string, metadate: { key: string; value: string }[],
): Promise<Raspuns<unknown>> {
  return cerereEasySales(ctx, {
    metoda: "POST", cale: "/orders/{id}/metadata", parametri: { id: internalId },
    corp: { metadata: metadate.map((m) => ({ key: m.key.slice(0, 191), value: m.value.slice(0, 191) })) },
  });
}

// ── Produse (citire) ────────────────────────────────────────────────────────

export interface FiltreProduse {
  website?: string;
  sku?: string;
  page?: number;
}

/**
 * `GET /api/v2/products` [A: filtrele `website`, `sku`, `updated_after`, pagina de 50].
 *
 * ⚠ Strictetea filtrului `?website=` NU e documentata (M-PROD-7): raspunsul se refiltreaza local.
 */
export function listaProduse(ctx: ContextEasySales, f: FiltreProduse): Promise<Raspuns<Record<string, unknown>[]>> {
  return cerereEasySales(ctx, { metoda: "GET", cale: "/products", interogare: { ...f, page: f.page ?? 1 } });
}

// ── Catalog (E3) si stoc (E4) ───────────────────────────────────────────────
//
// ⚠ Toate poarta `website_token` la radacina, ca in exemplele colectiei: SKU-ul e unic numai pe
// website [A: „SKUs are unique only per website, so the target website is resolved from the
// request's website_token"].

export interface CategorieTrimisa { category_website_id: number; name: string }
export interface CaracteristicaTrimisa { characteristic_website_id: number; name: string }

/** `POST /api/v2/categories/save/bulk` cu `{website_token, categories}` [A]. Raspunsul are `data: null`. */
export function salveazaCategoriile(ctx: ContextEasySales, categorii: CategorieTrimisa[]): Promise<Raspuns<unknown>> {
  return cerereEasySales(ctx, {
    metoda: "POST", cale: "/categories/save/bulk", cuWebsiteToken: true, inBloc: true, corp: { categories: categorii },
  });
}

/** `POST /api/v2/characteristics/save/bulk` cu `{website_token, characteristics}` [A]. Raspunsul are `data: null`. */
export function salveazaCaracteristicile(ctx: ContextEasySales, caracteristici: CaracteristicaTrimisa[]): Promise<Raspuns<unknown>> {
  return cerereEasySales(ctx, {
    metoda: "POST", cale: "/characteristics/save/bulk", cuWebsiteToken: true, inBloc: true, corp: { characteristics: caracteristici },
  });
}

/**
 * `POST /api/v2/products/save` cu `{website_token, product}` [A]: „created or updated".
 *
 * ⚠ `data.id` din raspuns e numai o rezerva pentru id-ul lor intern: exemplul e copiat de la Add, iar
 * documentatia nu spune ce e (planul, §5.4.2). Id-ul se ia din citirea de verificare.
 */
export function salveazaProdusul(ctx: ContextEasySales, product: CorpProdus): Promise<Raspuns<Record<string, unknown>>> {
  return cerereEasySales(ctx, { metoda: "POST", cale: "/products/save", cuWebsiteToken: true, corp: { product } });
}

/**
 * `POST /api/v2/products/save/bulk` cu `{website_token, products}` [A].
 *
 * ⚠ UN LOT TERMINAT NU INSEAMNA REUSITA: raspunsul are `data: null` [A], deci nu spune ce a intrat.
 * Ce face un lot cu un element invalid (422 pe tot, sau 200 cu prelucrare partiala tacuta) nu e
 * documentat (M-PROD-2): verificarea citeste lista lor dupa.
 */
export function salveazaProdusele(ctx: ContextEasySales, products: CorpProdus[]): Promise<Raspuns<unknown>> {
  return cerereEasySales(ctx, { metoda: "POST", cale: "/products/save/bulk", cuWebsiteToken: true, inBloc: true, corp: { products } });
}

export interface RezultatPeSku {
  result?: { success?: unknown; errors?: unknown; error_messages?: unknown } | null;
  products?: unknown;
}

/**
 * `PATCH /api/v2/products/prices/bulk` cu `{website_token, data: [{sku, prices: {sale_price, full_price}}]}`,
 * cel mult 100 [A]. Preturile pleaca CU TVA [A: „Product sale price with vat"]; rezultatul vine pe SKU,
 * in `data.result.success` si `data.result.errors`.
 */
export function actualizeazaPreturile(
  ctx: ContextEasySales, preturi: { sku: string; sale_price: number; full_price: number }[],
): Promise<Raspuns<RezultatPeSku>> {
  return cerereEasySales(ctx, {
    metoda: "PATCH", cale: "/products/prices/bulk", cuWebsiteToken: true, inBloc: true,
    corp: { data: preturi.map((p) => ({ sku: p.sku, prices: { sale_price: p.sale_price, full_price: p.full_price } })) },
  });
}

/**
 * `PATCH /api/v2/products/archive/bulk` cu `{website_token, skus}` (1-50) [A]. Fiecare SKU iese in
 * `archived`, `not_found` sau `blocked` (comenzi active); potrivirea SKU-ului e fara majuscule [A].
 *
 * ⚠ Arhivarea dezactiveaza si dezleaga ofertele pe toate canalele [A], iar API-ul n-are restaurare.
 */
export function arhiveazaProdusele(
  ctx: ContextEasySales, skus: string[],
): Promise<Raspuns<{ archived?: unknown; not_found?: unknown; blocked?: unknown }>> {
  return cerereEasySales(ctx, { metoda: "PATCH", cale: "/products/archive/bulk", cuWebsiteToken: true, corp: { skus } });
}

/**
 * `PATCH /api/v2/stocks/bulk` cu `{website_token, data: [{sku, stock}]}`, cel mult 100 [A]. Rezultatul
 * pe SKU: `success`, `errors` si `error_messages` („Product not found"), plus `products[].stock` si
 * `reserved_stock`.
 */
export function actualizeazaStocul(
  ctx: ContextEasySales, stocuri: { sku: string; stock: number }[],
): Promise<Raspuns<RezultatPeSku>> {
  return cerereEasySales(ctx, {
    metoda: "PATCH", cale: "/stocks/bulk", cuWebsiteToken: true, inBloc: true,
    corp: { data: stocuri.map((s) => ({ sku: s.sku, stock: s.stock })) },
  });
}
