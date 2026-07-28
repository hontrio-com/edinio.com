"use client";

import { ArrowLeft, Lock } from "lucide-react";
import { useStoreChromeOptional } from "@/components/storefront/StorefrontProvider";
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
  /*
   * Iesirea din palnie duce la PRODUSE, nu la radacina magazinului.
   *
   * Cand catalogul si-a luat pagina lui, pagina principala nu mai are grila:
   * clientul care apasa „continua cumparaturile" ajungea intr-o pagina de
   * prezentare fara niciun produs. Optional fiindca miniatura din editor
   * randeaza fara chrome.
   */
  const chromeCatalog = useStoreChromeOptional();
  const catreProduse = chromeCatalog?.catalogRoot ?? `${basePath}/`;
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
        <CosGolLaComanda catreProduse={catreProduse} color={color} />
      ) : (
        <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-10 lg:items-start">
          {/* Pe telefon rezumatul e primul; pe desktop trece in coloana lipita. */}
          <div className="lg:hidden mb-6">{rezumat}</div>

          {/* Fara `overflow-hidden`: lista de lockere se deschide pozitionata
              absolut sub buton si e mai inalta decat ce ramane din card, deci
              partea de jos era taiata si nu se putea derula. Nimic din formular
              nu picteaza pana la margine, deci rotunjirea n-are ce taia. */}
          <div className="min-w-0 rounded-2xl border border-border bg-surface">
            <CheckoutForm
              motor={motor}
              color={color}
              businessId={businessId}
              freeShippingThreshold={freeShippingThreshold}
              preview={preview}
              suprafata="pagina"
            />
          </div>

          {/* Decalajul urmareste inaltimea antetului lipit: fix, varful
              rezumatului statea sub header-ele mai inalte de 96 px (bara de sus
              a variantei „market", bara de anunt). Cat timp `--st-header-offset` nu e
              publicata de invelis, rezerva ramane cea dinainte, 96 px. */}
          <aside className="hidden lg:block lg:sticky" style={{ top: "calc(var(--st-header-offset, 100px) + 1rem)" }}>{rezumat}</aside>
        </div>
      )}

      <a href={catreProduse}
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
function CosGolLaComanda({ catreProduse, color }: { catreProduse: string; color: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface py-16 text-center">
      <p className="text-base font-semibold text-foreground mb-1">Nu ai produse in cos</p>
      <p className="text-sm text-muted-foreground mb-6">Adauga produse ca sa poti comanda</p>
      <a href={catreProduse}
        className="inline-flex items-center justify-center h-11 px-5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: color }}>
        Vezi produsele
      </a>
    </div>
  );
}
