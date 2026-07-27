"use client";

import { X } from "lucide-react";
import { useCheckoutOrder, type CheckoutOrderInput } from "./checkout-core";
import { CheckoutForm } from "./CheckoutForm";

/**
 * Finalizarea comenzii ca modal peste magazin — designul implicit.
 *
 * Aici a ramas doar invelisul: fundalul, panoul si antetul. Campurile sunt in
 * `CheckoutForm`, iar starea si trimiterea in `useCheckoutOrder`, ca varianta pe
 * pagina sa foloseasca exact acelasi formular si acelasi motor. Marcajul e cel
 * dintotdeauna, litera cu litera.
 *
 * `preview` randeaza panoul in fluxul paginii, cu date demonstrative si fara
 * niciun apel catre server, pentru miniatura din catalogul de design-uri.
 */
export function CheckoutClassic(props: CheckoutOrderInput) {
  const { open, onClose, color, preview = null, businessId, freeShippingThreshold } = props;
  const motor = useCheckoutOrder(props);

  if (!open) return null;

  return (
    <>
      {!preview && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" onClick={onClose} />}
      {/* Sirul de clase e scris intreg pe fiecare ramura, nu compus din parte
          fixa si parte variabila: reordonarea claselor ar aparea ca diferenta la
          compararea marcajului cu productia, desi CSS-ul e acelasi.
          In miniatura panoul iese din pozitionarea fixa, care raportata la
          fereastra cadrului l-ar face sa-si confirme singur o inaltime gresita.
          Primeste in schimb o inaltime proprie, cu ce depaseste TAIAT, nu pus pe
          derulare: formularul intreg trece de 1800 px la latime de telefon, iar
          un card atat de inalt pentru fiecare design ar face galeria de
          nefolosit. Se vede partea de sus, exact cum arata livrata. */}
      <div
        className={preview
          ? "relative mx-auto w-full md:max-w-md h-[900px] overflow-hidden bg-surface"
          : "fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-[60] w-full md:max-w-md max-h-[94vh] overflow-y-auto bg-surface"}
        style={{ borderRadius: "21px 21px 0 0", boxShadow: "rgba(0,0,0,0.5) 0px 4px 24px", border: `3px solid ${color}` }}
      >
        <div className="md:hidden flex justify-center pt-3">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <div className="flex-1 text-center">
            <h2 className="text-lg font-bold text-foreground tracking-tight">Finalizeaza comanda</h2>
          </div>
          <button type="button" aria-label="Inchide formularul" onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0">
            <X className="h-[17px] w-[17px] text-muted-foreground" />
          </button>
        </div>
        <CheckoutForm
          motor={motor}
          color={color}
          businessId={businessId}
          freeShippingThreshold={freeShippingThreshold}
          preview={preview}
        />
      </div>
    </>
  );
}
