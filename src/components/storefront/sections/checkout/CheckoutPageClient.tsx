"use client";

import { useEffect, useRef } from "react";
import { fbTrack, gtagEvent, ttqTrack } from "@/lib/marketing";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { CheckoutPageSection } from "./CheckoutPageSection";

/**
 * Pagina de finalizare, cu evenimentele de palnie legate de incarcarea ei.
 *
 * Pe modal, `InitiateCheckout` si `begin_checkout` plecau la clic. Aici clicul
 * doar navigheaza, iar in pagina se poate ajunge si direct — dintr-un link de
 * recuperare a cosului, sau reintorcandu-te cu butonul inapoi. Legate de
 * incarcare, evenimentele se trimit exact o data pentru fiecare intrare in
 * pasul de plata, indiferent pe unde s-a intrat.
 *
 * Cosul se hidrateaza din localStorage dupa montare, deci se asteapta prima
 * randare cu produse: trimise mai devreme, ar raporta un cos gol.
 */
export function CheckoutPageClient({
  variant,
  ...props
}: {
  variant: string;
  color: string;
  basePath: string;
  businessId: string;
  shippingCost: number;
  freeShippingThreshold: number | null;
  emailFieldConfig: { enabled: boolean; required: boolean };
  initialDiscountCode: string | null;
}) {
  const { items, total, count } = useCart();
  // Ref, nu stare: e un semn ca evenimentele au plecat, nu ceva ce se randeaza.
  const trimis = useRef(false);

  useEffect(() => {
    if (trimis.current || items.length === 0) return;
    trimis.current = true;
    const linii = items.map((i) => ({ item_id: i.productId, item_name: i.name, price: i.price, quantity: i.quantity }));
    fbTrack("InitiateCheckout", { value: total, currency: "RON", num_items: count, content_type: "product", content_ids: items.map((i) => i.productId) });
    ttqTrack("InitiateCheckout", { value: total, currency: "RON", contents: items.map((i) => ({ content_id: i.productId, content_type: "product", content_name: i.name, price: i.price, quantity: i.quantity })) });
    gtagEvent("begin_checkout", { currency: "RON", value: total, items: linii });
  }, [items, total, count]);

  return (
    <CheckoutPageSection
      variant={variant}
      open
      onClose={() => {}}
      {...props}
    />
  );
}
