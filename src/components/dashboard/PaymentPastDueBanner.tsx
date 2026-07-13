"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";

interface Props {
  planExpiresAt: string; // ISO string — data ultimei plati reusite + interval
}

// Afisat cand un abonament PLATIT a expirat fara reinnoire (plata esuata in
// fereastra de dunning Stripe), inainte ca abonamentul sa fie sters complet.
// Dupa stergere preia GracePeriodBanner (magazin suspendat). Butonul „Reia
// plata" duce direct la factura restanta Stripe (`/api/stripe/retry-payment`),
// unde userul plateste pe loc; plata reusita reactiveaza abonamentul automat.
export function PaymentPastDueBanner({ planExpiresAt }: Props) {
  const [loading, setLoading] = useState(false);

  // Inca activ (data de reinnoire in viitor) — nu afisam nimic.
  if (new Date(planExpiresAt).getTime() >= Date.now()) return null;

  async function openPortal() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/retry-payment", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Eroare la deschiderea portalului de plata.");
        setLoading(false);
      }
    } catch {
      toast.error("Eroare de retea. Incearca din nou.");
      setLoading(false);
    }
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-destructive to-warning">
      <div className="px-4 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-white text-center">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm sm:text-base font-bold">
            Plata abonamentului a esuat si abonamentul a expirat. Reia plata ca sa iti pastrezi magazinul activ.
          </p>
        </div>
        <button
          type="button"
          onClick={openPortal}
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2 bg-white text-destructive rounded-lg text-sm font-bold hover:bg-destructive/5 transition-colors flex-shrink-0 disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CreditCard className="h-4 w-4" />
          )}
          {loading ? "Se deschide..." : "Reia plata"}
        </button>
      </div>
    </div>
  );
}
