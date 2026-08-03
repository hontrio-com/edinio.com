/**
 * Ce cod de articol si ce natura poarta o linie de factura.
 *
 * Liniile unei comenzi nu sunt toate produse din catalog: extraoptiunile intra in
 * `orders.items` cu `product_id` de forma `extra_<id>`, iar comenzile venite din
 * marketplace pot avea `product_id` null cand SKU-ul nu s-a mapat. Cele trei case
 * de facturare cautau insa SKU-urile dand baza de date TOATA lista de id-uri, iar
 * un id care nu e uuid face PostgREST sa refuze cerererea cu 400 — si nu doar
 * randul gresit, ci tot raspunsul. Cum `supabase-js` nu arunca, ci pune eroarea in
 * `error`, harta de coduri iesea GOALA: o singura extraoptiune de 5 lei stergea
 * codul de pe TOATE liniile facturii. S-a intamplat de trei ori in productie.
 *
 * Modul pur, ca decizia de linie sa poata fi testata: cele trei case sunt
 * `"use server"` si nu se pot incarca in teste.
 */

import { esteUuid } from "@/lib/supabase/ids";
import { codExtraoptiune, esteIdExtra } from "@/lib/orders/extras";

/** Id-urile care se pot chiar cauta in `products`: doar uuid-uri, deduplicate. */
export function idsDeCautat(items: { product_id?: string | null }[]): string[] {
  return [...new Set(items.map((i) => i.product_id).filter(esteUuid))];
}

/**
 * Codul si natura unei linii, neutre fata de furnizor: fiecare casa isi traduce
 * `esteServiciu` in forma ei (`isService` la SmartBill, `productType` la Oblio,
 * nimic la fGO, care n-are asa ceva).
 *
 * Extraoptiunea primeste cod si devine SERVICIU. Fara asta ea ramane o linie de
 * marfa fara cod, adica exact randul care nu exista in gestiune si din cauza
 * caruia emiterea esueaza pe conturile cu „Foloseste cod produs" activ.
 */
export function codSiNatura(
  item: { product_id?: string | null },
  skus: Map<string, string>,
): { code?: string; esteServiciu: boolean } {
  if (esteIdExtra(item.product_id)) return { code: codExtraoptiune(item.product_id), esteServiciu: true };
  const sku = esteUuid(item.product_id) ? skus.get(item.product_id) : undefined;
  return { ...(sku ? { code: sku } : {}), esteServiciu: false };
}
