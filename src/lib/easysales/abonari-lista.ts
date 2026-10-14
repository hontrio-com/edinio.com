import type { AbonareEasySales } from "./tipuri";

/**
 * Abonarile din raspunsul lui `GET /api/v2/webhooks`, ca lista PLATA, fara secret.
 *
 * ⚠ MASURAT pe 14.10.2026, pe contul primului comerciant: raspunsul e GRUPAT pe tipul de webhook,
 * `data: [{slug, name, group, subscriptions: [{id, url, http_method, secret, details, active}]}]`,
 * nu o lista plata cum lasa sa se inteleaga colectia. Citit plat, nu se potrivea nicio abonare: cronul
 * le credea disparute, le refacea, iar easySales raspundea 422 „Câmpul url a fost deja folosit”.
 * `url` vine INTREG, cu query string-ul. `secret` vine in clar si se lasa pe dinafara aici.
 * Forma plata (o abonare cu `id` la radacina) se primeste si ea.
 */
export function abonarileDin(date: unknown): AbonareEasySales[] {
  const text = (x: unknown): string | null => (typeof x === "string" ? x : null);
  const deLa = (s: Record<string, unknown>, webhook: AbonareEasySales["webhook"]): AbonareEasySales => ({
    id: s.id, url: text(s.url), http_method: text(s.http_method), webhook,
    details: (s.details ?? null) as AbonareEasySales["details"], active: s.active,
  });
  const out: AbonareEasySales[] = [];
  for (const el of Array.isArray(date) ? date : []) {
    if (!el || typeof el !== "object") continue;
    const g = el as Record<string, unknown>;
    if (Array.isArray(g.subscriptions)) {
      const webhook = { slug: text(g.slug), name: text(g.name), group: text(g.group) };
      for (const s of g.subscriptions) if (s && typeof s === "object") out.push(deLa(s as Record<string, unknown>, webhook));
    } else {
      out.push(deLa(g, (g.webhook ?? null) as AbonareEasySales["webhook"]));
    }
  }
  return out;
}
