import { fbTrack, ttqTrack, gtagEvent, mktrEvent } from "@/lib/marketing";
import { idVariantaTM, skuVariantaTM } from "@/lib/themarketer/identitate";
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
  { productId, name, price, cantitate = 1, comboId, areVariante = false, idOferta, titluVarianta, skuVarianta }:
  {
    productId: string; name: string; price: number; cantitate?: number;
    /** Combinatia adaugata: cu ea, Meta primeste ID-ul VARIANTEI din catalog. */
    comboId?: string | null;
    /** Produsul are variante: fara `comboId`, se anunta grupul. Vezi `continutPixel`. */
    areVariante?: boolean;
    /**
     * ID-ul ofertei din Merchant Center, pentru remarketingul dinamic Google Ads.
     *
     * ⚠ NU se poate deduce din `comboId`: cand ID-ul plin trece de 50 de caractere, Merchant Center
     * primeste forma stabila a combinatiei. Vezi `offerIdVarianta`.
     */
    idOferta?: string | null;
    /**
     * Titlul combinatiei („S / Rosu”) si SKU-ul ei, pentru theMarketer: identitatea variantei la ei se
     * face din ele (`themarketer/identitate.ts`), la fel in feed, in cos si in comanda.
     */
    titluVarianta?: string | null;
    skuVarianta?: string | null;
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
  /*
   * theMarketer: `__sm__add_to_cart`, cu varianta cand e aleasa una. La produsul simplu fara `variation`:
   * browserul nu stie SKU-ul produsului, iar o pereche inventata nu s-ar potrivi cu feedul.
   */
  const titlu = (titluVarianta ?? "").trim();
  mktrEvent("__sm__add_to_cart", {
    product_id: productId,
    quantity: n,
    ...(titlu ? { variation: { id: idVariantaTM(productId, titlu), sku: skuVariantaTM(productId, titlu, skuVarianta) } } : {}),
  });
  gtagEvent("add_to_cart", {
    currency: "RON", value: valoare,
    items: [{ item_id: productId, ...(idOferta ? { id: idOferta } : {}), item_name: name, price, quantity: n }],
  });
}

type LinieTM = { productId: string; quantity: number; variantTitle?: string | null; variantSku?: string | null };

function cantitateIntreaga(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

/**
 * theMarketer TINE COSUL DIN EVENIMENTE: orice schimbare de cantitate se spune ca diferenta, `__sm__add_to_cart`
 * cand creste si `__sm__remove_from_cart` cand scade, cu aceeasi identitate de varianta ca la adaugare.
 *
 * ⚠ Se cheama din `CartProvider` (stergere, cantitate, editarea liniei), adica din SINGURUL loc prin care trec
 * toate cosurile: sertarul, paginile de cos si formularul de comanda de pe produs. Masurat in vitrina pe
 * 18.11.2026: scaderea cantitatii nu spunea nimic, deci „2, scazut la 1, apoi sters” lasa la ei o bucata
 * fantoma, iar cumparatorul putea primi email de cos abandonat pentru un produs scos.
 *
 * Adaugarea din pagina produsului NU trece pe aici: o spune `trackAddToCart`, la apelant.
 */
export function trackCantitateTM(item: LinieTM, nouaCantitate: number) {
  const diferenta = cantitateIntreaga(nouaCantitate) - cantitateIntreaga(item.quantity);
  if (diferenta === 0) return;
  const titlu = (item.variantTitle ?? "").trim();
  mktrEvent(diferenta > 0 ? "__sm__add_to_cart" : "__sm__remove_from_cart", {
    product_id: item.productId,
    quantity: Math.abs(diferenta),
    ...(titlu ? { variation: { id: idVariantaTM(item.productId, titlu), sku: skuVariantaTM(item.productId, titlu, item.variantSku) } } : {}),
  });
}
