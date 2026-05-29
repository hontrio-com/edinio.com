import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const PLANS = [
  {
    id: "free",
    name: "Gratuit",
    price: 0,
    description: "Perfect pentru a incepe",
    features: [
      "Pana la 10 produse",
      "Mini-site de baza",
      "Subdomeniu edinio.ro",
      "Statistici de baza",
      "Suport prin email",
    ],
    cta: "Incepe gratuit",
    popular: false,
  },
  {
    id: "basic",
    name: "Basic",
    price: 99,
    description: "Pentru afaceri in crestere",
    features: [
      "Pana la 100 de produse",
      "Magazin online complet",
      "Domeniu personalizat",
      "Statistici avansate",
      "Fara comisioane pe vanzari",
      "Suport prioritar",
    ],
    cta: "Alege Basic",
    popular: false,
  },
  {
    id: "premium",
    name: "Premium",
    price: 249,
    description: "Cel mai popular",
    features: [
      "Produse nelimitate",
      "Toate functiile Basic",
      "Programari online",
      "Discounturi avansate",
      "Checkout personalizat",
      "Suport prioritar 24/7",
    ],
    cta: "Alege Premium",
    popular: true,
  },
  {
    id: "ultra",
    name: "Ultra",
    price: 499,
    description: "Pentru afaceri mari",
    features: [
      "Totul din Premium",
      "Multi-magazin",
      "API access",
      "Manager dedicat",
      "SLA 99.9%",
      "Facturare personalizata",
    ],
    cta: "Contacteaza-ne",
    popular: false,
  },
];

export function PricingSection() {
  return (
    <section id="preturi" className="py-20 lg:py-28 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Preturi simple, fara surprize
          </h2>
          <p className="text-lg text-muted-foreground">
            Alege planul potrivit pentru afacerea ta. Fara contracte, anuleaza
            oricand.
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => (
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

              <div className="mt-6 mb-6">
                <span className="text-4xl font-bold text-foreground">
                  {plan.price}
                </span>
                <span className="text-sm text-muted-foreground ml-1">
                  lei/luna
                </span>
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
                href={plan.id === "ultra" ? "/contact" : "/register"}
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
          ))}
        </div>
      </div>
    </section>
  );
}
