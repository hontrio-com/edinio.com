"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BandaCont, clasaButonBanda } from "@/components/dashboard/BandaCont";

// Afisat cand plata unui abonament PLATIT a esuat cu adevarat (webhook Stripe
// invoice.payment_failed → users_profile.payment_failed_at), inca in fereastra de
// dunning, inainte ca abonamentul sa fie sters complet. Layout-ul decide afisarea
// pe baza flag-ului `payment_failed_at`; componenta nu mai face verificare de timp.
// Dupa stergere preia GracePeriodBanner (magazin suspendat). Butonul „Reia plata"
// duce direct la factura restanta Stripe (`/api/stripe/retry-payment`), unde userul
// plateste pe loc; plata reusita reactiveaza abonamentul automat.
//
// ⚠ TON DE ATENTIONARE, nu de urgenta: aici magazinul inca merge. Rosul e pastrat
// pentru cand chiar se opreste (`GracePeriodBanner`), altfel cele doua vesti ar
// arata la fel de grave si niciuna n-ar mai insemna nimic.
export function PaymentPastDueBanner() {
  const [seIncarca, setSeIncarca] = useState(false);

  async function deschidePortalul() {
    setSeIncarca(true);
    try {
      const res = await fetch("/api/stripe/retry-payment", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Eroare la deschiderea portalului de plata.");
        setSeIncarca(false);
      }
    } catch {
      toast.error("Eroare de retea. Incearca din nou.");
      setSeIncarca(false);
    }
  }

  return (
    <BandaCont
      ton="atentie"
      pictograma={CreditCard}
      titlu="Plata abonamentului a esuat"
      detaliu="Reia plata ca sa iti pastrezi magazinul activ. Pana atunci nu se schimba nimic pentru clientii tai."
      actiune={
        <button type="button" onClick={deschidePortalul} disabled={seIncarca} className={clasaButonBanda("atentie")}>
          {seIncarca ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
          {seIncarca ? "Se deschide..." : "Reia plata"}
        </button>
      }
    />
  );
}
