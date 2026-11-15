"use client";

import { useState } from "react";
import { CheckCircle, AlertCircle, CreditCard, Landmark, Loader2, Link2, ExternalLink, Percent, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { ButonDeconectare } from "@/components/dashboard/ButonDeconectare";
import {
  CumFunctioneaza, ListaConfigurare, PaginaIntegrare, Sectiune, ZonaDeconectare, type StareAntet,
} from "@/components/dashboard/integrare/PaginaIntegrare";

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

  const stari: StareAntet[] = [
    isConnected ? { ton: "bun", text: "Conectat" }
      : isAwaiting ? { ton: "asteptare", text: "În verificare la Stripe" }
        : isPending ? { ton: "asteptare", text: "Onboarding incomplet" }
          : { ton: "neutru", text: "Neconectat" },
  ];

  const cePierzi = "Legătura cu contul tău Stripe se șterge din Edinio și cumpărătorii nu mai pot plăti cu cardul. Banii și plățile rămân în contul tău Stripe. Ca să te întorci, reiei conectarea de la capăt: Edinio deschide un cont Connect nou, iar Stripe îl verifică din nou.";

  return (
    <PaginaIntegrare
      id="stripe"
      titlu="Plăți cu cardul"
      descriere="Îți conectezi contul Stripe: clienții plătesc cu cardul, iar banii ajung direct la tine."
      stari={stari}
      aside={<>
        <ListaConfigurare pasi={[
          { text: "Cont Stripe legat", facut: !!config?.account_id },
          { text: "Onboarding finalizat", facut: !!config?.onboarding_complete },
          { text: "Plăți cu cardul active", facut: isConnected },
        ]} />
        <CumFunctioneaza id="stripe" puncte={[
          { Icon: Link2, text: "Te conectezi cu contul Stripe, iar Edinio deschide un cont Connect legat de magazin." },
          { Icon: CreditCard, text: "Clienții plătesc cu Visa, Mastercard și celelalte carduri mari." },
          { Icon: Landmark, text: "Banii ajung direct în contul tău Stripe, fără intermediari." },
          { Icon: ShieldCheck, text: "Stripe e certificat PCI DSS Level 1, cel mai înalt standard de securitate." },
          { Icon: Percent, text: "Stripe își ia comisionul pe tranzacție (de obicei 1,4% + 0,25 EUR la cardurile europene). Edinio nu adaugă nimic." },
        ]} />
      </>}
    >
      <Sectiune pas={1} titlu="Contul Stripe">
        <div className={cn(
          "flex items-start gap-3 rounded-xl border p-4",
          isConnected ? "border-success/25 bg-success/5" : isPending || isAwaiting ? "border-warning/25 bg-warning/5" : "border-border bg-muted/40",
        )}>
          {isConnected
            ? <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            : isPending || isAwaiting
              ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              : <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {isConnected ? "Stripe conectat" : isAwaiting ? "Cont conectat, în curs de verificare" : isPending ? "Onboarding incomplet" : "Stripe neconectat"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {isConnected
                ? "Contul tău Stripe e activ. Clienții pot plăti cu cardul."
                : isAwaiting
                  ? "Ai terminat conectarea. Stripe îți verifică acum contul, de la câteva minute până la 1-2 zile lucrătoare. Apasă „Verifică din nou” sau completează ce îți cere Stripe."
                  : isPending
                    ? "Continuă configurarea contului pe Stripe, ca să activezi plățile cu cardul."
                    : "Conectează-ți contul Stripe ca să primești plăți cu cardul direct în magazin."}
            </p>
            {config?.account_id && (isConnected || isAwaiting) && (
              <p className={cn("mt-1.5 font-mono text-[11px]", isConnected ? "text-success" : "text-warning")}>{config.account_id}</p>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          {isConnected ? (
            <Button variant="outline" onClick={handleConnect} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <ExternalLink />}
              Deschide contul Stripe
            </Button>
          ) : isAwaiting ? (
            <>
              <Button onClick={handleConnect} disabled={loading} className={STRIPE_PURPLE}>
                {loading ? <Loader2 className="animate-spin" /> : <ExternalLink />}
                Continuă pe Stripe
              </Button>
              <Button variant="outline" onClick={handleResync} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Verifică din nou
              </Button>
            </>
          ) : isPending ? (
            <Button onClick={handleConnect} disabled={loading} className={STRIPE_PURPLE}>
              {loading ? <Loader2 className="animate-spin" /> : <ExternalLink />}
              Continuă onboarding-ul
            </Button>
          ) : (
            <Button onClick={handleConnect} disabled={loading} className={STRIPE_PURPLE}>
              {loading ? <Loader2 className="animate-spin" /> : <Link2 />}
              Conectează cu Stripe
            </Button>
          )}
        </div>
      </Sectiune>

      {(isConnected || isAwaiting) && (
        <ZonaDeconectare descriere="Șterge legătura cu contul Stripe. Banii și plățile rămân în contul tău Stripe.">
          <ButonDeconectare
            nume="Stripe"
            cePierzi={cePierzi}
            pending={loading}
            marime="default"
            onConfirma={handleDisconnect}
          />
        </ZonaDeconectare>
      )}
    </PaginaIntegrare>
  );
}
