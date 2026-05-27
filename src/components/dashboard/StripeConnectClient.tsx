"use client";

import { useState } from "react";
import { CheckCircle, AlertCircle, Loader2, Link2, Link2Off, ExternalLink } from "lucide-react";

export interface StripeConfig {
  account_id?: string;
  onboarding_complete?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  enabled?: boolean;
}

export function StripeConnectClient({ config }: { config: StripeConfig | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isConnected = !!(config?.account_id && config.onboarding_complete && config.charges_enabled);
  const isPending = !!(config?.account_id && !config.onboarding_complete);

  async function handleConnect() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/connect/create", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Eroare la conectare. Incearca din nou.");
        setLoading(false);
      }
    } catch {
      setError("Eroare de retea. Incearca din nou.");
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Esti sigur ca vrei sa deconectezi Stripe? Platile cu cardul vor fi dezactivate.")) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/connect/disconnect", { method: "POST" });
      if (res.ok) {
        window.location.reload();
      } else {
        setError("Eroare la deconectare.");
        setLoading(false);
      }
    } catch {
      setError("Eroare de retea.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Status card */}
      <div className={`flex items-start gap-4 p-5 rounded-2xl border ${
        isConnected
          ? "bg-green-50 border-green-200"
          : isPending
            ? "bg-yellow-50 border-yellow-200"
            : "bg-muted/40 border-border"
      }`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isConnected ? "bg-green-100" : isPending ? "bg-yellow-100" : "bg-muted"
        }`}>
          {isConnected
            ? <CheckCircle className="h-5 w-5 text-green-600" />
            : isPending
              ? <AlertCircle className="h-5 w-5 text-yellow-600" />
              : <img src="/integrations/stripe.svg" alt="Stripe" className="h-5 w-auto" />
          }
        </div>
        <div className="flex-1 min-w-0">
          {isConnected ? (
            <>
              <p className="text-sm font-semibold text-green-800">Stripe conectat</p>
              <p className="text-xs text-green-700 mt-0.5">
                Contul tau Stripe este activ. Clientii pot plati cu cardul.
              </p>
              {config?.account_id && (
                <p className="text-[11px] text-green-600 mt-1 font-mono">{config.account_id}</p>
              )}
            </>
          ) : isPending ? (
            <>
              <p className="text-sm font-semibold text-yellow-800">Onboarding incomplet</p>
              <p className="text-xs text-yellow-700 mt-0.5">
                Continua configurarea contului Stripe pentru a activa platile cu cardul.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">Stripe neconectat</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Conecteaza-ti contul Stripe pentru a accepta plati cu cardul direct in magazinul tau.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Info boxes */}
      {!isConnected && (
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { title: "Plati cu cardul", desc: "Accepta Visa, Mastercard si toate cardurile majore." },
            { title: "Bani direct la tine", desc: "Fondurile ajung direct in contul tau Stripe, fara intermediari." },
            { title: "Securitate maxima", desc: "Stripe este certificat PCI DSS Level 1 — cel mai inalt standard." },
          ].map(({ title, desc }) => (
            <div key={title} className="p-4 rounded-xl border border-border bg-surface">
              <p className="text-xs font-semibold text-foreground mb-1">{title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {isConnected ? (
          <>
            <button
              onClick={handleConnect}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Acceseaza dashboard Stripe
            </button>
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Link2Off className="h-4 w-4" />
              Deconecteaza
            </button>
          </>
        ) : isPending ? (
          <button
            onClick={handleConnect}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#635bff" }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Continua onboarding
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#635bff" }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Conecteaza cu Stripe
          </button>
        )}
      </div>

      {/* Note */}
      <p className="text-xs text-muted-foreground">
        Stripe percepe comisioane proprii per tranzactie (de obicei 1.4% + 0.25 EUR pentru carduri europene).
        Edinio nu adauga comisioane suplimentare.
      </p>
    </div>
  );
}
