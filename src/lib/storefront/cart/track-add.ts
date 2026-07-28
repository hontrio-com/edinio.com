import { fbTrack, ttqTrack, gtagEvent } from "@/lib/marketing";

/**
 * Cele trei evenimente de „adaugat in cos", intr-un singur loc.
 *
 * Erau scrise doar in `MiniStoreRenderer`, deci raportau numai adaugarile din
 * grila: cele din paginile custom si de pe pagina de produs nu ajungeau in
 * Facebook, TikTok si GA4, iar comerciantul vedea in rapoarte un cos care se
 * umple singur. Cantitatea era si ea fixa pe 1, chiar cand se adaugau mai multe
 * bucati deodata.
 */
export function trackAddToCart(
  { productId, name, price, cantitate = 1 }:
  { productId: string; name: string; price: number; cantitate?: number },
) {
  const n = Number.isFinite(cantitate) ? Math.max(1, Math.floor(cantitate)) : 1;
  const valoare = price * n;

  fbTrack("AddToCart", { value: valoare, currency: "RON", content_name: name, content_ids: [productId], content_type: "product" });
  ttqTrack("AddToCart", { value: valoare, currency: "RON", contents: [{ content_id: productId, content_type: "product", content_name: name, price, quantity: n }] });
  gtagEvent("add_to_cart", { currency: "RON", value: valoare, items: [{ item_id: productId, item_name: name, price, quantity: n }] });
}
