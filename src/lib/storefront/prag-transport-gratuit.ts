/**
 * Pragul de la care transportul e gratuit, citit LA FEL peste tot.
 *
 * ═══ O SINGURA DOCTRINA: `0` INSEAMNA „FARA PRAG" ═══
 *
 * Nu „gratuit de la zero lei". Asa se poarta TOATA partea vizitatorului, si asa
 * spune si `lib/storefront/cart/pricing.ts`, cu proba lui cu tot: ar fi absurd ca
 * un zero sa dea livrare gratuita la orice comanda, inclusiv la un cos gol.
 *
 * ⚠ SERVERUL ERA SINGURUL CARE SPUNEA ALTCEVA. `order.actions.ts` citea campul cu
 * `!= null`, deci pentru el `0` insemna `subtotal >= 0` — adica gratuit MEREU.
 * Comentariul din `pricing.ts` chiar pretindea ca „asa se comporta si citirea din
 * baza"; nu se comporta.
 *
 * Ce iesea din nepotrivire, pe un cos de 150 lei cu transport de 20: cosul si
 * checkout-ul aratau 170 si taxau transportul, iar `placeOrder` scria comanda cu
 * transport 0 si total 150. **Clientul vedea o suma si platea alta**, iar
 * rambursul de pe AWB se lua din totalul serverului.
 *
 * Zero nu e o valoare imposibila: panoul accepta orice numar `>= 0` la „Prag
 * transport gratuit", deci se poate salva. Azi n-o are niciun magazin din 127
 * (verificat) — deci nepotrivirea era latenta, si tocmai de aceea merita inchisa
 * inainte s-o descopere cineva dintr-o comanda incasata gresit.
 *
 * De aceea functia asta e chemata si de suprafetele de afisare, si de server:
 * regula sta intr-un singur loc, si se poate proba.
 */
export function pragTransportGratuit(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  /* `<= 0` cade pe „fara prag": vezi doctrina de mai sus. Iar `NaN` nu are ce cauta
     intr-o comparatie de preturi — l-ar face pe orice `>=` fals, tacut. */
  return Number.isFinite(n) && n > 0 ? n : null;
}
