import { fbTrack, ttqTrack, gtagEvent } from "@/lib/marketing";
import { continutPixel } from "@/lib/facebook/pixel-continut";
import { continutTikTok } from "@/lib/tiktok/continut";

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
  { productId, name, price, cantitate = 1, comboId, areVariante = false }:
  {
    productId: string; name: string; price: number; cantitate?: number;
    /** Combinatia adaugata: cu ea, Meta primeste ID-ul VARIANTEI din catalog. */
    comboId?: string | null;
    /** Produsul are variante: fara `comboId`, se anunta grupul. Vezi `continutPixel`. */
    areVariante?: boolean;
  },
) {
  const n = Number.isFinite(cantitate) ? Math.max(1, Math.floor(cantitate)) : 1;
  const valoare = price * n;

  /*
   * ⚠ `contents`, nu doar `content_ids`: referinta pixelului, la `AddToCart`, „Required for Advantage+ catalog
   * ads: `contents`”. Trimiteam doar ID-urile, deci evenimentul nu era folosit de reclamele de catalog.
   */
  fbTrack("AddToCart", {
    value: valoare, currency: "RON", content_name: name,
    ...continutPixel([{ productId, comboId, areVariante, cantitate: n, pret: price }]),
  });
  /* ⚠ `content_type` LANGA eveniment (nu in `contents`), si ID-ul variantei, ca la Meta. Vezi `tiktok/continut.ts`. */
  ttqTrack("AddToCart", {
    value: valoare, currency: "RON", num_items: n,
    ...continutTikTok([{ productId, comboId, areVariante, cantitate: n, pret: price, nume: name }]),
  });
  gtagEvent("add_to_cart", { currency: "RON", value: valoare, items: [{ item_id: productId, item_name: name, price, quantity: n }] });
}
