import { cerereEasySales, type ContextEasySales, type Raspuns } from "./client";
import type {
  AbonareEasySales, ComandaEasySales, WebsiteEasySales,
} from "./tipuri";

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

/** `GET /api/v2/webhooks` [A]: abonarile, fiecare cu `url`, `webhook.slug` si o livrare in `details`. */
export function listaAbonari(ctx: ContextEasySales): Promise<Raspuns<AbonareEasySales[]>> {
  return cerereEasySales(ctx, { metoda: "GET", cale: "/webhooks" });
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
