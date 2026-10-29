/*
  ═══════════════════════════════════════════════════════════════════════════
  PRODUSELE DEMO NU PLEACA DIN MAGAZIN (etapa 18.1 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Hotararea lui (29.10.2026): „Le opresc la toate canalele”. Datele demo ale unei teme pun produse adevarate in
  magazin (`source = "tema-demo"`), ca tema sa se vada cu continut. Ele raman DOAR in magazin: fiecare canal (Google
  Merchant, catalogul Meta, Pepita, email marketing, eMAG, OLX, Trendyol, About You, easySales) le sare exact ca pe un
  produs inactiv, iar paginile lor au `noindex` si lipsesc din sitemap.

  Fisier fara dependente: il citesc si actiunile, si cronurile, si rutele publice, si probele.
*/

/** Sursa produselor puse de „Importă datele demo” (si de magazinul demo al temei). */
export const SURSA_DEMO = "tema-demo";

/** E produs demo? Atunci nu pleaca din magazin. */
export function esteProdusDemo(p: { source?: string | null } | null | undefined): boolean {
  return p?.source === SURSA_DEMO;
}

/**
 * Produsul, cu un demo vazut ca INACTIV. Marketplace-urile (eMAG, OLX, Trendyol, About You, easySales) stiu deja ce sa
 * faca cu un produs inactiv (nu-l listeaza, il retrag daca era listat), pe drumuri probate de mult; asa demo-ul le
 * urmeaza pe ele, fara ramuri noi in logica fiecaruia. Se pune chiar unde se citeste produsul din baza.
 */
export function caInactivDacaEDemo<T extends { is_active?: boolean | null; source?: string | null }>(p: T): T {
  return esteProdusDemo(p) ? { ...p, is_active: false } : p;
}

/**
 * Filtrul PostgREST pentru `.or(...)`: lasa pe dinafara produsele demo si le PASTREAZA pe cele fara sursa. Un `neq`
 * singur le-ar fi pierdut: in SQL, `NULL <> 'tema-demo'` nu e adevarat, iar majoritatea produselor n-au sursa.
 */
export const FARA_PRODUSE_DEMO = `source.is.null,source.neq.${SURSA_DEMO}`;
