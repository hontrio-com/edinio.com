/**
 * Server-driven pagination for the order-scale dashboard lists (Comenzi,
 * Clienti). These tables grow without bound, so pages must fetch exactly one
 * page from Postgres — never "everything": PostgREST caps every response at
 * 1000 rows silently, and a store can have millions of orders.
 */

export const ORDERS_PAGE_SIZE = 50;
export const CUSTOMERS_PAGE_SIZE = 50;

/** First value of a possibly-repeated searchParam. */
export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Positive page number from a searchParam (default 1). */
export function pageParam(v: string | string[] | undefined): number {
  const n = Number.parseInt(firstParam(v) ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Escape LIKE/ILIKE wildcards so user input matches literally (backslash is
 * Postgres' default LIKE escape character).
 */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Sanitize a term for interpolation inside a PostgREST .or(...ilike...)
 * expression: commas/parens/quotes are or() syntax, so they become spaces.
 */
export function orSafeTerm(q: string): string {
  return escapeLike(q.replace(/[,()"]/g, " ")).trim();
}

/**
 * Filtrele listei de comenzi care supravietuiesc drumului dus-intors prin
 * detaliile unei comenzi. Orice alta cheie se arunca, ca `?lista=` sa nu poata
 * duce butonul „Inapoi" in alta parte decat pe lista.
 */
const CHEI_LISTA_COMENZI = ["q", "status", "source", "page"] as const;

function filtreleListei(qs: string | undefined): string {
  const intrare = new URLSearchParams(qs ?? "");
  const iesire = new URLSearchParams();
  for (const cheie of CHEI_LISTA_COMENZI) {
    const valoare = intrare.get(cheie);
    if (valoare) iesire.set(cheie, valoare.slice(0, 80));
  }
  return iesire.toString();
}

/** Adresa detaliilor unei comenzi, care tine minte pagina si filtrele listei. */
export function adresaDetaliuluiComenzii(orderId: string, qsLista: string | undefined): string {
  const lista = filtreleListei(qsLista);
  return `/dashboard/orders/${orderId}${lista ? `?lista=${encodeURIComponent(lista)}` : ""}`;
}

/** Unde duce „Inapoi" din detaliile comenzii: pagina si filtrele de unde a venit. */
export function adresaListeiDeComenzi(lista: string | undefined): string {
  const qs = filtreleListei(lista);
  return qs ? `/dashboard/orders?${qs}` : "/dashboard/orders";
}
