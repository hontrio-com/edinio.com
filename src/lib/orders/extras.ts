/**
 * Extraoptiunile din formularul de comanda („ambalare cadou", „comanda cu
 * prioritate"), asa cum arata ele pe o comanda.
 *
 * Ele intra in `orders.items` ca linii obisnuite, dar cu `product_id` de forma
 * `extra_<id>`: nu sunt produse din catalog, deci n-au uuid si n-au SKU. Prefixul
 * era scris de mana in unsprezece locuri.
 */

export const PREFIX_EXTRA = "extra_";

export function esteIdExtra(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(PREFIX_EXTRA);
}

/**
 * Codul de articol cu care pleaca extraoptiunea pe factura.
 *
 * Derivat din id-ul ei, nu fix: un magazin poate defini mai multe extraoptiuni si
 * doua pot intra pe aceeasi comanda, iar acelasi cod cu doua denumiri si doua
 * preturi e un conflict in nomenclatorul furnizorului.
 */
export function codExtraoptiune(productId: string): string {
  // Caracterele nepotrivite se INLOCUIESC, nu se sterg: sterse, „a b/c" si „abc"
  // ar da acelasi cod, adica chiar coliziunea pe care regula asta o evita.
  const brut = productId.slice(PREFIX_EXTRA.length).replace(/[^a-zA-Z0-9_-]/g, "-");
  return brut ? `extra-${brut}` : "extra";
}
