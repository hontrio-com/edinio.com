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
