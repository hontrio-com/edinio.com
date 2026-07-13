"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Check, ShieldCheck, Infinity as InfinityIcon, LogOut, Zap, Crown, Rocket } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { logout } from "@/lib/actions/auth.actions";
import {
  type BillingInterval,
  PLAN_PRICES,
  getAnnualPrice,
  getAnnualMonthlyEquivalent,
  ANNUAL_FREE_MONTHS,
} from "@/lib/plans";

const PAID_PLANS = [
  {
    id: "basic",
    name: "Basic",
    description: "Pentru afaceri in crestere",
    icon: Zap,
    features: ["Pana la 500 produse", "Comenzi nelimitate", "Suport 7 zile din 7"],
    badge: null as string | null,
  },
  {
    id: "premium",
    name: "Premium",
    description: "Cel mai popular",
    icon: Crown,
    features: ["Pana la 2.500 produse", "Comenzi nelimitate", "Manager dedicat"],
    badge: "Recomandat",
  },
  {
    id: "ultra",
    name: "Ultra",
    description: "Pentru afaceri mari",
    icon: Rocket,
    features: ["Produse nelimitate", "Comenzi nelimitate", "Manager dedicat"],
    badge: null,
  },
];

interface Props {
  reason: "trial" | "subscription";
  success: boolean;
  currentPlan: string;
  userEmail: string;
}

export function ReactivateClient({ reason, success, currentPlan, userEmail }: Props) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<string>(
    PAID_PLANS.some((p) => p.id === currentPlan) ? currentPlan : "premium"
  );
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState(false);
  const [waited, setWaited] = useState(0);

  // Intoarcerea din Stripe (?success=1): webhook-ul proceseaza plata asincron.
  // Reimprospatam periodic; cand abonamentul devine activ, page.tsx vede
  // reason=null si face redirect la /dashboard. Oprim dupa ~60s.
  useEffect(() => {
    if (!success) return;
    let count = 0;
    const id = window.setInterval(() => {
      count += 1;
      setWaited(count);
      router.refresh();
      if (count >= 20) window.clearInterval(id);
    }, 3000);
    return () => window.clearInterval(id);
  }, [success, router]);

  async function handlePay() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, interval: billingInterval, return_to: "reactivare" }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Eroare la initializarea platii.");
        setLoading(false);
      }
    } catch {
      toast.error("Eroare de retea. Incearca din nou.");
      setLoading(false);
    }
  }

  // ── Stare de activare dupa plata ─────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">Se activeaza abonamentul...</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plata a fost primita. Iti pregatim accesul, dureaza cateva secunde.
          </p>
        </div>
        {waited >= 5 && (
          <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
            Mergi la dashboard
          </Link>
        )}
      </div>
    );
  }

  const title = reason === "trial" ? "Perioada de testare a expirat" : "Abonamentul tau a expirat";
  const subtitle =
    reason === "trial"
      ? "Alege un plan ca sa reactivezi magazinul si sa continui sa vinzi."
      : "Reia plata ca sa reactivezi magazinul si accesul la panou.";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 w-full max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{title}</h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground">{subtitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Datele tale (produse, comenzi, setari) sunt pastrate integral.
          </p>
        </div>

        {/* Toggle facturare */}
        <div className="mb-6 flex justify-center">
          <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-muted/40">
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              disabled={loading}
              className={cn(
                "px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-60",
                billingInterval === "monthly" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Lunar
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval("annual")}
              disabled={loading}
              className={cn(
                "px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-60",
                billingInterval === "annual" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Anual
              <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wide">
                {ANNUAL_FREE_MONTHS} luni gratis
              </span>
            </button>
          </div>
        </div>

        {/* Planuri */}
        <div className="grid sm:grid-cols-3 gap-4">
          {PAID_PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const Icon = plan.icon;
            const perMonth = billingInterval === "annual" ? getAnnualMonthlyEquivalent(plan.id) : PLAN_PRICES[plan.id];
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                disabled={loading}
                className={cn(
                  "relative flex flex-col p-5 rounded-2xl border-2 text-left transition-all disabled:opacity-60",
                  isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/50"
                )}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wider">
                    {plan.badge}
                  </span>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isSelected ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground">{plan.description}</p>
                  </div>
                </div>
                <div className="mb-4">
                  <span className="text-2xl font-bold text-foreground">{perMonth}</span>
                  <span className="text-sm text-muted-foreground ml-1">lei/luna</span>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {billingInterval === "annual" ? `Facturat anual: ${getAnnualPrice(plan.id)} lei` : "Facturat lunar"}
                  </p>
                </div>
                <ul className="space-y-2 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className={cn("h-4 w-4 flex-shrink-0 mt-0.5", isSelected ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* Garantii */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-8 text-xs sm:text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
            Anulezi oricand, fara costuri
          </span>
          <span className="flex items-center gap-2">
            <InfinityIcon className="h-4 w-4 text-primary flex-shrink-0" />
            Pretul tau ramane fix pe viata
          </span>
        </div>

        <button
          type="button"
          onClick={handlePay}
          disabled={loading}
          className="w-full mt-8 flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-xl bg-primary hover:bg-primary/90 active:scale-[0.99] disabled:opacity-60 transition-all"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Redirectionare catre plata..." : "Reactiveaza si plateste"}
        </button>

        {/* Footer: cont + delogare + suport */}
        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <form action={logout}>
              <button type="submit" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors">
                <LogOut className="h-4 w-4" />
                Deconecteaza-te
              </button>
            </form>
            {userEmail && <span className="text-xs text-muted-foreground hidden sm:inline">{userEmail}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Ai nevoie de ajutor?{" "}
            <a href="mailto:contact@edinio.com" className="text-primary font-medium hover:underline">
              contact@edinio.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
