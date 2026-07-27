"use client";

import { ArrowLeft, Lock } from "lucide-react";
import { useCart } from "@/components/storefront/cart/CartProvider";
import { useCheckoutOrder, type CheckoutOrderInput } from "./checkout-core";
import { CheckoutForm } from "./CheckoutForm";
import { CheckoutCartLines, CheckoutTotals } from "./CheckoutSummary";

/**
 * Finalizarea comenzii pe pagina proprie, cu rezumatul in dreapta.
 *
 * Asezarea pe care o are majoritatea magazinelor: datele de livrare si plata la
 * stanga, iar ce comanzi si cat platesti la dreapta, lipit, ca sa ramana la
 * vedere cat timp se completeaza formularul. Pe telefon rezumatul urca deasupra
 * formularului: prima intrebare a oricui deschide o pagina de plata e „cat
 * platesc".
 *
 * Nu e o a doua implementare a comenzii: campurile sunt aceleasi
 * (`CheckoutForm`), rezumatul e acelasi (`CheckoutSummary`), iar starea si
 * trimiterea vin din acelasi motor ca modalul. Difera doar unde sunt asezate.
 */
export function CheckoutPageTwoCol(props: CheckoutOrderInput) {
  const { color, basePath, businessId, freeShippingThreshold, preview = null } = props;
  const motor = useCheckoutOrder({ ...props, suprafata: "pagina" });
  const { items } = motor;
  const { hydrated } = useCart();

  const rezumat = (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4">Rezumatul comenzii</h2>
      <CheckoutCartLines motor={motor} color={color} />
      <div className="mt-4">
        <CheckoutTotals motor={motor} color={color} freeShippingThreshold={freeShippingThreshold} />
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
      <div className="flex items-center justify-between gap-4 mb-6 lg:mb-8">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Finalizeaza comanda</h1>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Plata securizata
        </span>
      </div>

      {hydrated && items.length === 0 && !preview ? (
        <CosGolLaComanda basePath={basePath} color={color} />
      ) : (
        <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-10 lg:items-start">
          {/* Pe telefon rezumatul e primul; pe desktop trece in coloana lipita. */}
          <div className="lg:hidden mb-6">{rezumat}</div>

          <div className="min-w-0 rounded-2xl border border-border bg-surface overflow-hidden">
            <CheckoutForm
              motor={motor}
              color={color}
              businessId={businessId}
              freeShippingThreshold={freeShippingThreshold}
              preview={preview}
              suprafata="pagina"
            />
          </div>

          <aside className="hidden lg:block lg:sticky lg:top-24">{rezumat}</aside>
        </div>
      )}

      <a href={`${basePath}/`}
        className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Inapoi la magazin
      </a>
    </div>
  );
}

/**
 * Cosul gol pe pagina de comanda.
 *
 * Cosul se citeste din localStorage abia dupa montare, deci starea „gol" apare
 * si pentru o clipa la fiecare incarcare. De aceea nu redirectionam: un salt
 * automat ar arunca afara pe oricine, inclusiv pe cel care are cosul plin.
 */
function CosGolLaComanda({ basePath, color }: { basePath: string; color: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface py-16 text-center">
      <p className="text-base font-semibold text-foreground mb-1">Nu ai produse in cos</p>
      <p className="text-sm text-muted-foreground mb-6">Adauga produse ca sa poti comanda</p>
      <a href={`${basePath}/`}
        className="inline-flex items-center justify-center h-11 px-5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: color }}>
        Vezi produsele
      </a>
    </div>
  );
}
