"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import { Check, Loader2, Crown, Zap, Rocket, Gift, ShieldCheck, Infinity as InfinityIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";
import { createBusiness } from "@/lib/actions/business.actions";
import { trackOnboardingStep } from "@/lib/actions/auth.actions";
import { platformFbq } from "@/components/platform/PlatformMetaPixel";
import { platformTtq } from "@/components/platform/PlatformTikTokPixel";
import {
  type BillingInterval,
  PLAN_PRICES,
  getAnnualPrice,
  getAnnualMonthlyEquivalent,
  ANNUAL_FREE_MONTHS,
} from "@/lib/plans";

const PLANS = [
  {
    id: "free",
    name: "Testare gratuita",
    price: 0,
    priceSuffix: "15 zile",
    description: "Testeaza platforma fara obligatii",
    icon: Gift,
    features: [
      "Acces complet 15 zile",
      "Pana la 10 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
    ],
    color: "border-zinc-300 hover:border-zinc-400",
    selectedColor: "border-primary bg-primary/5 ring-2 ring-primary/20",
    badge: null,
  },
  {
    id: "basic",
    name: "Basic",
    price: 99,
    priceSuffix: "lei/luna",
    description: "Pentru afaceri in crestere",
    icon: Zap,
    features: [
      "Pana la 500 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanta gratuita pe viata",
    ],
    color: "border-zinc-300 hover:border-blue-400",
    selectedColor: "border-blue-500 bg-blue-50 ring-2 ring-blue-200",
    badge: null,
  },
  {
    id: "premium",
    name: "Premium",
    price: 249,
    priceSuffix: "lei/luna",
    description: "Cel mai popular",
    icon: Crown,
    features: [
      "Pana la 2.500 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanta gratuita pe viata",
      "Manager dedicat magazinului tau",
    ],
    color: "border-primary/30 hover:border-primary",
    selectedColor: "border-primary bg-primary/5 ring-2 ring-primary/20",
    badge: "Recomandat",
  },
  {
    id: "ultra",
    name: "Ultra",
    price: 499,
    priceSuffix: "lei/luna",
    description: "Pentru afaceri mari",
    icon: Rocket,
    features: [
      "Produse nelimitate",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanta gratuita pe viata",
      "Manager dedicat magazinului tau",
    ],
    color: "border-zinc-300 hover:border-violet-400",
    selectedColor: "border-violet-500 bg-violet-50 ring-2 ring-violet-200",
    badge: null,
  },
];

export default function OnboardingPlanPage() {
  return (
    <Suspense fallback={
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        <OnboardingProgress currentStep={2} />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    }>
      <PlanPageContent />
    </Suspense>
  );
}

function PlanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const createdRef = useRef(false);

  const isSuccess = searchParams.get("success") === "1";
  const isCancelled = searchParams.get("cancelled") === "1";

  // On mount: validate sessionStorage data exists + handle preselected plan
  useEffect(() => {
    const storedDetails = sessionStorage.getItem("onboarding_details");
    if (!storedDetails) { router.replace("/onboarding/details"); return; }

    // If coming from a campaign with ?plan=basic (saved in register page)
    const preselected = sessionStorage.getItem("preselected_plan");
    if (preselected && ["basic", "premium", "ultra"].includes(preselected) && !isSuccess && !isCancelled) {
      sessionStorage.removeItem("preselected_plan");
      setSelectedPlan(preselected);
      // Auto-start Stripe checkout. Redirectionarea e neasistata (userul nu vede
      // toggle-ul), deci folosim intervalul lunar ca sa nu il facturam anual fara
      // sa fi ales explicit.
      setLoading(true);
      sessionStorage.setItem("onboarding_pending_plan", preselected);
      sessionStorage.setItem("onboarding_pending_interval", "monthly");
      fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: preselected, interval: "monthly", return_to: "onboarding" }),
      })
        .then(r => r.json())
        .then((data: { url?: string; error?: string }) => {
          if (data.url) { window.location.href = data.url; }
          else { toast.error(data.error ?? "Eroare la plata"); setLoading(false); }
        })
        .catch(() => { toast.error("Eroare la plata"); setLoading(false); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Track step + ensure the page opens at the top. The App Router can keep the
  // previous step's scroll position (bottom) when navigating into this Suspense
  // route, so we force scroll to top on mount (immediately + after first paint).
  useEffect(() => {
    trackOnboardingStep("plan");
    window.scrollTo(0, 0);
    const id = requestAnimationFrame(() => window.scrollTo(0, 0));
    // Start-of-funnel event (skip when returning from a successful Stripe payment).
    if (!isSuccess) {
      platformFbq("InitiateCheckout");
      platformTtq("InitiateCheckout");
    }
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle return from Stripe success
  useEffect(() => {
    if (!isSuccess || createdRef.current) return;
    createdRef.current = true;

    const storedPlan = sessionStorage.getItem("onboarding_pending_plan");
    if (!storedPlan) return;

    setCreating(true);
    finalizeBusiness(storedPlan);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  // Show toast if payment was cancelled
  useEffect(() => {
    if (isCancelled) {
      toast.error("Plata a fost anulata. Selecteaza un plan pentru a continua.");
      // Restore previously selected plan
      const storedPlan = sessionStorage.getItem("onboarding_pending_plan");
      if (storedPlan) setSelectedPlan(storedPlan);
    }
  }, [isCancelled]);

  async function finalizeBusiness(plan: string) {
    const storedDetails = sessionStorage.getItem("onboarding_details");
    if (!storedDetails) return;

    try {
      const details = JSON.parse(storedDetails);

      const result = await createBusiness({
        business_name: String(details.business_name ?? ""),
        phone: String(details.phone ?? ""),
        slug: String(details.slug ?? ""),
        primary_color: "#1AB554",
        plan,
      });

      if (result.error) {
        toast.error(result.error);
        setCreating(false);
        setLoading(false);
        return;
      }

      const paidInterval: BillingInterval =
        sessionStorage.getItem("onboarding_pending_interval") === "annual" ? "annual" : "monthly";

      sessionStorage.removeItem("onboarding_details");
      sessionStorage.removeItem("onboarding_pending_plan");
      sessionStorage.removeItem("onboarding_pending_interval");

      if (plan === "free") {
        platformFbq("StartTrial");
        platformTtq("StartTrial");
      } else {
        const value = paidInterval === "annual" ? getAnnualPrice(plan) : (PLAN_PRICES[plan] ?? 0);
        platformFbq("Subscribe", { value, currency: "RON", predicted_ltv: 0 });
        platformTtq("Subscribe", { value, currency: "RON" });
      }

      toast.success("Magazinul tau a fost creat cu succes!");
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } });
      setTimeout(() => { window.location.href = "/dashboard"; }, 1800);
    } catch {
      toast.error("A aparut o eroare. Incearca din nou.");
      setCreating(false);
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!selectedPlan) return;
    setLoading(true);

    if (selectedPlan === "free") {
      // Free trial: create business directly (no payment needed)
      await finalizeBusiness("free");
      return;
    }

    // Paid plan: redirect to Stripe Checkout
    try {
      sessionStorage.setItem("onboarding_pending_plan", selectedPlan);
      sessionStorage.setItem("onboarding_pending_interval", billingInterval);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, interval: billingInterval, return_to: "onboarding" }),
      });

      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Eroare la initializarea platii.");
        setLoading(false);
        return;
      }

      platformFbq("AddPaymentInfo");
      platformTtq("AddPaymentInfo");
      window.location.href = data.url;
    } catch {
      toast.error("Eroare la initializarea platii. Incearca din nou.");
      setLoading(false);
    }
  }

  // Show loading state when returning from Stripe
  if (creating) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        <OnboardingProgress currentStep={2} />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Se creeaza magazinul tau...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
      <OnboardingProgress currentStep={2} />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
            Alege planul potrivit
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground">
            Poti incepe cu testarea gratuita si face upgrade oricand
          </p>
        </div>

        {/* Toggle facturare lunar / anual */}
        <div className="mb-6 flex justify-center">
          <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-muted/40">
            <button
              type="button"
              onClick={() => setBillingInterval("monthly")}
              disabled={loading}
              className={cn(
                "px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-60",
                billingInterval === "monthly"
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
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
                billingInterval === "annual"
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Anual
              <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wide">
                {ANNUAL_FREE_MONTHS} luni gratis
              </span>
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const Icon = plan.icon;
            const isFree = plan.price === 0;
            const perMonth = billingInterval === "annual" ? getAnnualMonthlyEquivalent(plan.id) : plan.price;
            const annualTotal = getAnnualPrice(plan.id);
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlan(plan.id)}
                disabled={loading}
                className={cn(
                  "relative flex flex-col p-5 rounded-2xl border-2 text-left transition-all disabled:opacity-60",
                  isSelected ? plan.selectedColor : plan.color
                )}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wider">
                    {plan.badge}
                  </span>
                )}

                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    isSelected ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground">{plan.description}</p>
                  </div>
                </div>

                <div className="mb-4 min-h-[68px]">
                  {isFree ? (
                    <>
                      <span className="text-3xl font-bold text-foreground">Gratuit</span>
                      <span className="text-sm text-muted-foreground ml-2">{plan.priceSuffix}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-foreground">{perMonth}</span>
                      <span className="text-sm text-muted-foreground ml-1">lei/luna</span>
                      {billingInterval === "annual" ? (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Facturat anual: {annualTotal} lei.{" "}
                          <span className="text-primary font-semibold">{ANNUAL_FREE_MONTHS} luni gratis</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">Facturat lunar</p>
                      )}
                    </>
                  )}
                </div>

                <ul className="space-y-2 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className={cn(
                        "h-4 w-4 flex-shrink-0 mt-0.5",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )} />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className={cn(
                  "mt-4 pt-3 border-t flex items-center justify-center gap-2 text-sm font-semibold transition-colors",
                  isSelected ? "border-primary/20 text-primary" : "border-border text-muted-foreground"
                )}>
                  {isSelected ? (
                    <>
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </div>
                      Selectat
                    </>
                  ) : (
                    "Selecteaza"
                  )}
                </div>
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

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-8 pt-6 border-t border-border">
          <button type="button" onClick={() => router.push("/onboarding/details")} disabled={loading}
            className="py-3 sm:py-2.5 px-4 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors text-center sm:text-left disabled:opacity-40">
            Inapoi
          </button>
          <button type="button" onClick={handleCreate} disabled={loading || !selectedPlan}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 sm:py-3 text-sm font-medium text-white rounded-lg
              bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading
              ? (selectedPlan === "free" ? "Se creeaza..." : "Redirectionare catre plata...")
              : (selectedPlan && selectedPlan !== "free"
                ? "Plateste si creeaza magazinul"
                : "Creeaza magazinul gratuit")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
