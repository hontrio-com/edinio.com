"use client";

import { useEffect, useRef, useState } from "react";
import { gtagEvent, fbTrack, ttqTrack } from "@/lib/marketing";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { CheckoutClassic } from "@/components/storefront/sections/checkout/CheckoutClassic";
import { checkoutHref } from "@/lib/storefront/design/commerce";
import { CartPageSection } from "./CartPageSection";

/**
 * Pagina de cos, cu tot ce tine de client: modelul ales, evenimentele si drumul
 * catre finalizarea comenzii.
 *
 * Doua lucruri se decid aici, si de aceea nu stau in ruta:
 *
 *  - `view_cart` pleaca la INCARCAREA paginii, nu la deschiderea unui panou.
 *    Pe sertar evenimentul era legat de deschidere; aici deschiderea E pagina.
 *  - Butonul de finalizare duce la `/checkout` daca si comanda e pe pagina, iar
 *    daca nu, deschide modalul montat mai jos. Fara el, un magazin cu cosul pe
 *    pagina si comanda in fereastra ar avea un buton care nu face nimic.
 */
export function CartPageClient({
  variant,
  settings,
  color,
  basePath,
  businessId,
  shippingCost,
  freeShippingThreshold,
  minOrderAmount,
  vat,
  comandaPePagina,
  emailFieldConfig,
}: {
  variant: string;
  settings: Record<string, unknown>;
  color: string;
  basePath: string;
  businessId: string;
  shippingCost: number;
  freeShippingThreshold: number | null;
  minOrderAmount: number | null;
  /** Regimul de TVA al magazinului, pentru totalul din cos. */
  vat?: import("@/lib/storefront/cart/pricing").CartPricingInput["vat"];
  comandaPePagina: boolean;
  emailFieldConfig: { enabled: boolean; required: boolean };
}) {
  const { items, total, count } = useCart();
  const [comandaDeschisa, setComandaDeschisa] = useState(false);
  // Ref, nu stare: e un semn ca evenimentul a plecat, nu ceva ce se randeaza.
  const vazut = useRef(false);

  // Cosul se citeste din localStorage dupa montare, deci la prima randare e gol.
  // Evenimentul pleaca la prima randare cu produse, o singura data.
  useEffect(() => {
    if (vazut.current || items.length === 0) return;
    vazut.current = true;
    gtagEvent("view_cart", {
      currency: "RON",
      value: total,
      items: items.map((i) => ({ item_id: i.productId, item_name: i.name, price: i.price, quantity: i.quantity })),
    });
  }, [items, total]);

  function laComanda() {
    // Cand comanda e tot pe pagina, evenimentele le trimite ACOLO, la incarcare.
    // Trimise si aici, fiecare inceput de comanda s-ar numara de doua ori, iar
    // Meta si TikTok n-au cum sa deduplice: apelurile nu poarta un id de eveniment.
    if (comandaPePagina) {
      window.location.href = checkoutHref(basePath);
      return;
    }
    fbTrack("InitiateCheckout", { value: total, currency: "RON", num_items: count, content_type: "product", content_ids: items.map((i) => i.productId) });
    ttqTrack("InitiateCheckout", { value: total, currency: "RON", contents: items.map((i) => ({ content_id: i.productId, content_type: "product", content_name: i.name, price: i.price, quantity: i.quantity })) });
    gtagEvent("begin_checkout", { currency: "RON", value: total, items: items.map((i) => ({ item_id: i.productId, item_name: i.name, price: i.price, quantity: i.quantity })) });
    setComandaDeschisa(true);
  }

  return (
    <>
      <CartPageSection
        variant={variant}
        settings={settings}
        color={color}
        basePath={basePath}
        businessId={businessId}
        shippingCost={shippingCost}
        freeShippingThreshold={freeShippingThreshold}
        minOrderAmount={minOrderAmount}
        vat={vat}
        onCheckout={laComanda}
      />

      {/* Comanda in fereastra: modalul traieste pe pagina de magazin, dar cine
          ajunge aici trebuie sa poata comanda fara sa se intoarca. */}
      {!comandaPePagina && (
        <CheckoutClassic
          open={comandaDeschisa}
          onClose={() => setComandaDeschisa(false)}
          color={color}
          basePath={basePath}
          businessId={businessId}
          shippingCost={shippingCost}
          freeShippingThreshold={freeShippingThreshold}
          emailFieldConfig={emailFieldConfig}
        />
      )}
    </>
  );
}
