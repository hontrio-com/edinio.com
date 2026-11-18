"use client";

import { CartDrawerClassic } from "@/components/storefront/sections/cart/CartDrawerClassic";
import { CheckoutClassic } from "@/components/storefront/sections/checkout/CheckoutClassic";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { fbTrack, gtagEvent, mktrEvent, ttqTrack } from "@/lib/marketing";
import { continutDinCos } from "@/lib/facebook/pixel-continut";
import { continutTikTokDinCos } from "@/lib/tiktok/continut";
import { checkoutHref, checkoutOnPage } from "@/lib/storefront/design/commerce";
import type { StoreChromeData } from "@/lib/storefront/chrome-value";
import type { StoreDesign } from "@/lib/storefront/design/types";

/**
 * Sertarul de cos si fereastra de comanda, pentru paginile FARA catalog.
 *
 * Pagina de magazin le monteaza singura, de mult. Paginile de produs, paginile
 * proprii, politicile — nu: acolo butonul de cos era un link inapoi in magazin,
 * asa ca cine adauga un produs de pe pagina lui si apasa pe cos era dus mai
 * intai pe prima pagina, si abia acolo se deschidea sertarul. Un drum in plus
 * exact in momentul in care clientul voia sa cumpere.
 *
 * Se monteaza doar cand magazinul chiar are panouri: cu cosul ales ca pagina,
 * butonul duce la ea si aici nu e nimic de deschis.
 */
export function StoreCartPanels({
  chrome,
  design,
  cosDeschis,
  inchideCos,
  comandaDeschisa,
  deschideComanda,
  inchideComanda,
}: {
  chrome: StoreChromeData;
  design: StoreDesign;
  cosDeschis: boolean;
  inchideCos: () => void;
  comandaDeschisa: boolean;
  deschideComanda: () => void;
  inchideComanda: () => void;
}) {
  /* Inaintea iesirii timpurii: un hook nu se cheama conditionat. */
  const { items, lineUnit, total, count } = useCart();
  const comert = chrome.comert;
  if (!comert || chrome.cartMode !== "drawer") return null;

  const comandaPePagina = checkoutOnPage(design);

  return (
    <>
      <CartDrawerClassic
        open={cosDeschis}
        onClose={inchideCos}
        color={chrome.color}
        basePath={chrome.basePath}
        businessId={chrome.business.id}
        onCheckout={() => {
          inchideCos();
          /*
           * Cu finalizarea pe pagina, sertarul DUCE acolo in loc sa deschida o
           * fereastra. Evenimentele de palnie le trimite pagina la incarcare, ca
           * si pe pagina de magazin: aici ar lipsi pentru cine intra direct pe
           * adresa si s-ar dubla pentru cine vine din sertar.
           */
          if (comandaPePagina) {
            window.location.href = checkoutHref(chrome.basePath);
            return;
          }
          deschideComanda();
          /*
           * ⚠ EVENIMENTELE DE PALNIE, CA PE PAGINA DE MAGAZIN (18.11.2026). Fereastra deschisa de aici
           * (pagina de produs, paginile proprii, politicile) nu trimitea NIMIC: nici Meta, nici TikTok,
           * nici GA4, nici theMarketer, desi `MiniStoreRenderer` le trimite pe toate patru la acelasi
           * clic. Masurat in vitrina, la theMarketer: comanda inceputa din sertarul paginii de produs nu
           * aparea. Aceeasi forma ca acolo, cu `lineUnit(i)`, nu `i.price`.
           */
          fbTrack("InitiateCheckout", {
            value: total, currency: "RON", num_items: count,
            ...continutDinCos(items.map((i) => ({ productId: i.productId, variantTitle: i.variantTitle, quantity: i.quantity, pret: lineUnit(i) }))),
          });
          ttqTrack("InitiateCheckout", {
            value: total, currency: "RON", num_items: count,
            ...continutTikTokDinCos(items.map((i) => ({ productId: i.productId, name: i.name, variantTitle: i.variantTitle, quantity: i.quantity, pret: lineUnit(i) }))),
          });
          gtagEvent("begin_checkout", { currency: "RON", value: total, items: items.map((i) => ({ item_id: i.productId, item_name: i.name, price: lineUnit(i), quantity: i.quantity })) });
          mktrEvent("__sm__initiate_checkout");
        }}
        shippingCost={comert.shippingCost}
        freeShippingThreshold={comert.freeShippingThreshold}
        minOrderAmount={comert.minOrderAmount}
        vat={comert.vat}
      />

      {!comandaPePagina && (
        <CheckoutClassic
          open={comandaDeschisa}
          onClose={inchideComanda}
          color={chrome.color}
          basePath={chrome.basePath}
          businessId={chrome.business.id}
          shippingCost={comert.shippingCost}
          freeShippingThreshold={comert.freeShippingThreshold}
          emailFieldConfig={chrome.pageContent.checkout_config?.email_field ?? { enabled: true, required: false }}
        />
      )}
    </>
  );
}
