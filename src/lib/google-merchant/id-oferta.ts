import { identitateCombinatie } from "@/lib/storefront/variante-identitate";
import { findCombo, parseVariants } from "@/lib/storefront/variants";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  ID-UL OFERTEI DIN MERCHANT CENTER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ IL CITESC DOUA DRUMURI: trimiterea catre Merchant Center (`mapping.ts`) si remarketingul dinamic Google
  Ads din vitrina, unde documentatia cere ca `id`-ul articolului sa fie chiar cel din feed. Modul mic si fara
  dependinte de server, ca sa poata intra si in browser.
*/

/**
 * `offerId` al unei variante, UNIC si de cel mult 50 de caractere.
 *
 * ═══ ⚠⚠ CAPCANA ARMATA (masurata 17.09.2026) ═══
 *
 * Forma de dinainte era `${product.id}-${combo.id}`.slice(0, 50). Uuid-ul produsului ocupa 37 de caractere,
 * deci din slugul combinatiei ramaneau 13: „180x200-cm-alb” si „180x200-cm-alb-mat” dadeau ACELASI id, iar a
 * doua oferta o suprascria pe prima la Google, cu pretul ei. Pe toata platforma: 3.493 de combinatii active
 * s-ar fi strans in 702 id-uri, la 3 magazine care inca n-au Google Merchant. La cele conectate, zero.
 *
 * ⚠ Id-ul care INCAPE ramane neschimbat (niciuna dintre ofertele deja trimise nu era taiata), deci nicio
 * oferta existenta nu se muta. Doar unde ar fi fost taiat se foloseste identitatea stabila a combinatiei:
 * 32 + 1 + 16 = 49 de caractere, fara cratimele uuid-ului, deci nu se poate intalni cu forma cealalta.
 */
export function offerIdVarianta(productId: string, combo: { id: string; title: string; uid?: string }): string {
  const plin = `${productId}-${combo.id}`;
  if (plin.length <= 50) return plin;
  return `${productId.replace(/-/g, "")}-${identitateCombinatie(combo)}`;
}

/**
 * ID-ul ofertei pentru o linie despre care stim doar TITLUL combinatiei (cos, comanda).
 *
 * ⚠ Produsul simplu are ca oferta chiar ID-ul lui. Produsul cu variante a carui combinatie nu se cunoaste
 * ramane tot pe ID-ul produsului: acela e `itemGroupId` in feed, deci nu se potriveste cu nicio oferta, dar
 * nici nu minte despre alta varianta. Vezi `docs/marketing/GOOGLE-ADS.md`.
 */
export function idOfertaDupaTitlu(productId: string, pageSections: unknown, titlu: string | null | undefined): string {
  const variante = parseVariants(pageSections);
  const combo = variante && titlu ? findCombo(variante, titlu) : null;
  return combo ? offerIdVarianta(productId, combo) : productId;
}
