"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ShieldCheck, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  type BillingInterval,
  getAnnualPrice,
  getAnnualMonthlyEquivalent,
  ANNUAL_FREE_MONTHS,
} from "@/lib/plans";

const PLANS = [
  {
    id: "trial",
    name: "Testare",
    monthly: 0,
    description: "Testează platforma fără obligații",
    features: [
      "Acces complet 15 zile",
      "Până la 10 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
    ],
    cta: "Începe testarea",
    popular: false,
  },
  {
    id: "basic",
    name: "Basic",
    monthly: 99,
    description: "Pentru afaceri în creștere",
    features: [
      "Până la 500 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanță gratuită pe viață",
    ],
    cta: "Alege Basic",
    popular: false,
  },
  {
    id: "premium",
    name: "Premium",
    monthly: 249,
    description: "Cel mai popular",
    features: [
      "Până la 2.500 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanță gratuită pe viață",
      "Manager dedicat magazinului tău",
    ],
    cta: "Alege Premium",
    popular: true,
  },
  {
    id: "ultra",
    name: "Ultra",
    monthly: 499,
    description: "Pentru afaceri mari",
    features: [
      "Produse nelimitate",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanță gratuită pe viață",
      "Manager dedicat magazinului tău",
    ],
    cta: "Alege Ultra",
    popular: false,
  },
];

export function PricingSection() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <section id="preturi" className="py-20 lg:py-28 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Prețuri simple, fără surprize
          </h2>
          <p className="text-lg text-muted-foreground">
            Testează gratuit 15 zile, fără card de credit. Mentenanță gratuită pe viață și suport 7 zile din 7 la orice abonament.
          </p>
        </div>

        {/* Toggle lunar / anual */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-muted/40">
            <button
              type="button"
              onClick={() => setInterval("monthly")}
              className={cn(
                "px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors",
                interval === "monthly"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Lunar
            </button>
            <button
              type="button"
              onClick={() => setInterval("annual")}
              className={cn(
                "px-4 sm:px-5 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2",
                interval === "annual"
                  ? "bg-card text-foreground shadow-sm"
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

        {/* Plans grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => {
            const isFree = plan.monthly === 0;
            const annual = getAnnualPrice(plan.id);
            const perMonth = interval === "annual" ? getAnnualMonthlyEquivalent(plan.id) : plan.monthly;

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col p-6 rounded-2xl border transition-all",
                  plan.popular
                    ? "border-primary bg-card shadow-xl shadow-primary/10 lg:scale-105"
                    : "border-border bg-card hover:border-primary/30 hover:shadow-md"
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-white text-xs font-semibold">
                    Recomandat
                  </div>
                )}

                <h3 className="text-lg font-semibold text-foreground">
                  {plan.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {plan.description}
                </p>

                <div className="mt-6 mb-6 min-h-[92px]">
                  {isFree ? (
                    <>
                      <span className="text-4xl font-bold text-foreground">Gratuit</span>
                      <span className="block text-sm text-muted-foreground mt-1">15 zile</span>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-foreground">{perMonth}</span>
                      <span className="text-sm text-muted-foreground ml-1">lei/lună</span>
                      {interval === "annual" ? (
                        <p className="text-[12px] text-muted-foreground mt-1.5">
                          Facturat anual: {annual} lei.{" "}
                          <span className="text-primary font-semibold">{ANNUAL_FREE_MONTHS} luni gratis</span>
                        </p>
                      ) : (
                        <p className="text-[12px] text-muted-foreground mt-1.5">Facturat lunar</p>
                      )}
                    </>
                  )}
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={cn(
                    "block w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-colors",
                    plan.popular
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "bg-muted text-foreground hover:bg-accent"
                  )}
                >
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Garantii */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-10">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <ShieldCheck className="h-5 w-5 text-primary flex-shrink-0" />
            <span>Anulezi oricând, fără costuri sau penalități</span>
          </div>
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <InfinityIcon className="h-5 w-5 text-primary flex-shrink-0" />
            <span>Prețul tău rămâne fix pe viață, fără scumpiri</span>
          </div>
        </div>
      </div>
    </section>
  );
}
