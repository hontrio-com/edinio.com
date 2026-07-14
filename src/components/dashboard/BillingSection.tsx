"use client";

import { useState, useEffect } from "react";
import { Loader2, FileText, ExternalLink, CreditCard, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";
import { PLAN_LABELS, PLAN_PRICES, type BillingInterval, getAnnualPrice } from "@/lib/plans";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];

interface Props {
  plan: "free" | "trial" | "basic" | "premium" | "ultra";
  planExpiresAt: string | null;
  interval?: BillingInterval;
  paymentFailed?: boolean;
}

export function BillingSection({ plan, planExpiresAt, interval = "monthly", paymentFailed = false }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);

  // Plata restanta = starea REALA de dunning Stripe (users_profile.payment_failed_at),
  // nu `plan_expires_at < now()` (care e true si in fereastra draft a Stripe, inainte
  // de orice incercare de plata). `planExpiresAt` ramane doar pentru afisarea datei.
  const isPastDue = plan !== "free" && plan !== "trial" && paymentFailed;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setInvoices(data ?? []);
        setLoading(false);
      });
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Eroare la deschiderea portalului de plata.");
        setPortalLoading(false);
      }
    } catch {
      toast.error("Eroare de retea. Incearca din nou.");
      setPortalLoading(false);
    }
  }

  async function retryPayment() {
    setRetryLoading(true);
    try {
      const res = await fetch("/api/stripe/retry-payment", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Eroare la deschiderea platii.");
        setRetryLoading(false);
      }
    } catch {
      toast.error("Eroare de retea. Incearca din nou.");
      setRetryLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Active subscription card */}
      {plan !== "free" && plan !== "trial" ? (
        <div className={`bg-surface border rounded-xl overflow-hidden ${isPastDue ? "border-destructive/40" : "border-border"}`}>
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Abonamentul tau</p>
          </div>
          <div className="px-5 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">
                  Plan {PLAN_LABELS[plan]} · {interval === "annual" ? `${getAnnualPrice(plan)} lei/an` : `${PLAN_PRICES[plan] ?? "—"} lei/luna`}
                </span>
                {isPastDue ? (
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-destructive/10 text-destructive border border-destructive/20 rounded-full">
                    Plata restanta
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-success/10 text-success border border-success/20 rounded-full">
                    Activ
                  </span>
                )}
              </div>
              {planExpiresAt && (
                <p className="text-sm text-muted-foreground">
                  {isPastDue ? "A expirat pe:" : "Urmatoarea plata:"}{" "}
                  <span className={`font-medium ${isPastDue ? "text-destructive" : "text-foreground"}`}>
                    {new Date(planExpiresAt).toLocaleDateString("ro-RO", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {isPastDue
                  ? "Plata reinnoirii a esuat. Reia plata ca sa iti pastrezi magazinul activ."
                  : "Prin portalul de plata poti actualiza cardul, anula abonamentul sau descarca chitantele Stripe."}
              </p>
            </div>
            {isPastDue ? (
              <button
                type="button"
                onClick={retryPayment}
                disabled={retryLoading}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-destructive rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 whitespace-nowrap"
              >
                {retryLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {retryLoading ? "Se deschide..." : "Reia plata"}
              </button>
            ) : (
              <button
                type="button"
                onClick={openPortal}
                disabled={portalLoading}
                className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                {portalLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {portalLoading ? "Se redirectioneaza..." : "Gestioneaza abonamentul"}
                {!portalLoading && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            )}
          </div>
        </div>
      ) : plan === "trial" ? (
        <div className="bg-surface border border-border rounded-xl px-5 py-5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-0.5">Testare gratuita</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {planExpiresAt ? (
                <>
                  Perioada de testare expira pe{" "}
                  <span className="font-medium text-foreground">
                    {new Date(planExpiresAt).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                  . Alege un plan din sectiunea{" "}
                </>
              ) : (
                <>Alege un plan din sectiunea{" "}</>
              )}
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => {
                  window.location.hash = "plan";
                  window.dispatchEvent(new CustomEvent("navigate-settings", { detail: "plan" }));
                }}
              >
                Plan
              </button>{" "}
              pentru a continua dupa expirare.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl px-5 py-5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground mb-0.5">Niciun abonament activ</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Esti pe planul gratuit. Alege un plan din sectiunea{" "}
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => {
                  window.location.hash = "plan";
                  window.dispatchEvent(new CustomEvent("navigate-settings", { detail: "plan" }));
                }}
              >
                Plan
              </button>{" "}
              pentru a accesa toate functiile platformei.
            </p>
          </div>
        </div>
      )}

      {/* Invoice history */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Istoricul facturilor</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Facturile sunt emise automat prin Smartbill la fiecare plata reusita.
          </p>
        </div>

        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">Nicio factura inca</p>
            <p className="text-xs text-muted-foreground">Facturile vor aparea aici dupa prima plata.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Numar factura</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Suma</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Factura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {new Date(inv.created_at).toLocaleDateString("ro-RO", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-foreground">
                        {inv.smartbill_series && inv.smartbill_number
                          ? `${inv.smartbill_series} ${inv.smartbill_number}`
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-foreground font-medium">
                          {PLAN_LABELS[inv.plan] ?? inv.plan}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-foreground">
                        {Number(inv.amount).toFixed(0)} {inv.currency}
                      </td>
                      <td className="px-5 py-3.5">
                        {inv.smartbill_series && inv.smartbill_number ? (
                          <a
                            href={`/api/invoice/${inv.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Descarca PDF
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">In procesare</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="sm:hidden divide-y divide-border">
              {invoices.map((inv) => (
                <div key={inv.id} className="px-5 py-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {PLAN_LABELS[inv.plan] ?? inv.plan} — {Number(inv.amount).toFixed(0)} {inv.currency}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(inv.created_at).toLocaleDateString("ro-RO", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {inv.smartbill_series && inv.smartbill_number && (
                        <span className="font-mono ml-1">· {inv.smartbill_series} {inv.smartbill_number}</span>
                      )}
                    </p>
                  </div>
                  {inv.smartbill_series && inv.smartbill_number ? (
                    <a
                      href={`/api/invoice/${inv.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
                      aria-label="Descarca PDF"
                    >
                      <FileText className="h-4 w-4 text-primary" />
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground flex-shrink-0">In procesare</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Info note */}
      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        Facturile sunt emise in numele companiei si trimise automat pe email la fiecare plata.
        Pentru probleme de facturare contactati{" "}
        <a href="mailto:contact@edinio.com" className="text-primary font-medium hover:underline">
          contact@edinio.com
        </a>
        .
      </p>
    </div>
  );
}
