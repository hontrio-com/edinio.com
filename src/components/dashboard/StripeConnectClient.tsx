"use client";

import { useState } from "react";
import { CheckCircle, AlertCircle, Loader2, Link2, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";

export interface StripeConfig {
  account_id?: string;
  onboarding_complete?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  enabled?: boolean;
}

const STRIPE_PURPLE = "bg-[#635bff] text-white hover:bg-[#635bff]/90";

export function StripeConnectClient({ config, businessId }: { config: StripeConfig | null; businessId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isConnected = !!(config?.account_id && config.onboarding_complete && config.charges_enabled);
  // Onboarding submitted but Stripe hasn't enabled charges yet (verification / pending requirements).
  const isAwaiting = !!(config?.account_id && config.onboarding_complete && !config.charges_enabled);
  const isPending = !!(config?.account_id && !config.onboarding_complete);

  // Re-pull account status from Stripe (reuses the post-onboarding return route).
  function handleResync() {
    setLoading(true);
    window.location.href = `/api/stripe/connect/return?business_id=${businessId}`;
  }

  async function handleConnect() {
    setLoading(true);
    setError("");
    try {
      /* ⚠ Magazinul se TRIMITE. Ruta il ghicea, luand primul al omului, deci cu mai multe magazine
         contul se lega de altul decat cel din care s-a apasat. */
      const res = await fetch("/api/stripe/connect/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
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
    /* ⚠ Fara `confirm` aici: intrebarea o pune `ButonDeconectare`, in fereastra casei.
       Doua intrebari una peste alta se invata sa se apese fara citire.
       ⚠ `loading` e steagul comun al ecranului, si tot el tinea butonul de deconectare
       stins. Il dam mai departe ca `pending`, ca sa nu pierdem stingerea aia. */
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
      <div className={cn(
        "flex items-start gap-4 rounded-2xl border p-5",
        isConnected
          ? "border-success/20 bg-success/5"
          : isPending || isAwaiting
            ? "border-warning/20 bg-warning/5"
            : "border-border bg-muted/40"
      )}>
        <div className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
          isConnected ? "bg-success/10" : isPending || isAwaiting ? "bg-warning/10" : "bg-muted"
        )}>
          {isConnected
            ? <CheckCircle className="h-5 w-5 text-success" />
            : isPending || isAwaiting
              ? <AlertCircle className="h-5 w-5 text-warning" />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src="/integrations/stripe.svg" alt="Stripe" className="h-5 w-auto" />
          }
        </div>
        <div className="min-w-0 flex-1">
          {isConnected ? (
            <>
              <p className="text-sm font-semibold text-foreground">Stripe conectat</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Contul tau Stripe este activ. Clientii pot plati cu cardul.
              </p>
              {config?.account_id && (
                <p className="mt-1 font-mono text-[11px] text-success">{config.account_id}</p>
              )}
            </>
          ) : isAwaiting ? (
            <>
              <p className="text-sm font-semibold text-foreground">Cont conectat, in curs de verificare</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Ai finalizat conectarea. Stripe iti verifica contul inainte de a activa platile cu cardul.
                Poate dura de la cateva minute pana la 1-2 zile lucratoare. Apasa &laquo;Verifica din nou&raquo; sau
                completeaza informatiile cerute pe Stripe.
              </p>
              {config?.account_id && (
                <p className="mt-1 font-mono text-[11px] text-warning">{config.account_id}</p>
              )}
            </>
          ) : isPending ? (
            <>
              <p className="text-sm font-semibold text-foreground">Onboarding incomplet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Continua configurarea contului Stripe pentru a activa platile cu cardul.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">Stripe neconectat</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Conecteaza-ti contul Stripe pentru a accepta plati cu cardul direct in magazinul tau.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Info boxes */}
      {!isConnected && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { title: "Plati cu cardul", desc: "Accepta Visa, Mastercard si toate cardurile majore." },
            { title: "Bani direct la tine", desc: "Fondurile ajung direct in contul tau Stripe, fara intermediari." },
            { title: "Securitate maxima", desc: "Stripe este certificat PCI DSS Level 1, cel mai inalt standard." },
          ].map(({ title, desc }) => (
            <Panel key={title} className="p-4">
              <p className="mb-1 text-xs font-semibold text-foreground">{title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
            </Panel>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {isConnected ? (
          <>
            <Button variant="outline" onClick={handleConnect} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <ExternalLink />}
              Acceseaza dashboard Stripe
            </Button>
            <ButonDeconectare
              nume="Stripe"
              cePierzi="Legătura cu contul tău Stripe se șterge din Edinio și cumpărătorii nu mai pot plăti cu cardul. Banii și plățile rămân în contul tău Stripe. Ca să te întorci, reiei conectarea de la capăt: Edinio deschide un cont Connect nou, iar Stripe îl verifică din nou."
              pending={loading}
              marime="default"
              onConfirma={handleDisconnect}
            />
          </>
        ) : isAwaiting ? (
          <>
            <Button variant="outline" onClick={handleResync} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Verifica din nou
            </Button>
            <Button onClick={handleConnect} disabled={loading} className={STRIPE_PURPLE}>
              {loading ? <Loader2 className="animate-spin" /> : <ExternalLink />}
              Continua pe Stripe
            </Button>
            <ButonDeconectare
              nume="Stripe"
              cePierzi="Legătura cu contul tău Stripe se șterge din Edinio și cumpărătorii nu mai pot plăti cu cardul. Banii și plățile rămân în contul tău Stripe. Ca să te întorci, reiei conectarea de la capăt: Edinio deschide un cont Connect nou, iar Stripe îl verifică din nou."
              pending={loading}
              marime="default"
              onConfirma={handleDisconnect}
            />
          </>
        ) : isPending ? (
          <Button onClick={handleConnect} disabled={loading} className={STRIPE_PURPLE}>
            {loading ? <Loader2 className="animate-spin" /> : <ExternalLink />}
            Continua onboarding
          </Button>
        ) : (
          <Button onClick={handleConnect} disabled={loading} className={STRIPE_PURPLE}>
            {loading ? <Loader2 className="animate-spin" /> : <Link2 />}
            Conecteaza cu Stripe
          </Button>
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
