import type { Metadata } from "next";
import Link from "next/link";
import { Check, Zap, Rocket, Crown, ArrowRight, ShieldCheck, Headset, Wrench } from "lucide-react";
import { HeroMockups } from "@/components/website/HeroMockups";

export const metadata: Metadata = {
  title: "Creeaza magazin online - de la 99 lei/luna | Edinio",
  description:
    "Lanseaza-ti magazinul online in cateva minute. Integrari curierat, plati online, facturare automata. Suport 7/7, mentenanta gratuita pe viata.",
  alternates: { canonical: "https://www.edinio.com/start" },
};

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: 99,
    badge: null,
    icon: Zap,
    features: [
      "500 produse",
      "Comenzi nelimitate",
      "Integrari curierat",
      "Plati online (Stripe, Netopia)",
      "Facturare automata",
      "Suport 7 zile din 7",
      "Mentenanta gratuita pe viata",
    ],
    cta: "Incepe cu Basic",
    color: "border-blue-200 hover:border-blue-400",
    ctaColor: "bg-blue-600 hover:bg-blue-700",
  },
  {
    id: "premium",
    name: "Premium",
    price: 249,
    badge: "Popular",
    icon: Rocket,
    features: [
      "2.500 produse",
      "Comenzi nelimitate",
      "Integrari curierat",
      "Plati online (Stripe, Netopia)",
      "Facturare automata",
      "SMS Marketing",
      "Suport prioritar 7/7",
      "Mentenanta gratuita pe viata",
    ],
    cta: "Incepe cu Premium",
    color: "border-purple-200 hover:border-purple-400",
    ctaColor: "bg-purple-600 hover:bg-purple-700",
  },
  {
    id: "ultra",
    name: "Ultra",
    price: 499,
    badge: null,
    icon: Crown,
    features: [
      "Produse nelimitate",
      "Comenzi nelimitate",
      "Integrari curierat",
      "Plati online (Stripe, Netopia)",
      "Facturare automata",
      "SMS Marketing",
      "Domeniu personalizat",
      "Suport prioritar 7/7",
      "Mentenanta gratuita pe viata",
    ],
    cta: "Incepe cu Ultra",
    color: "border-amber-200 hover:border-amber-400",
    ctaColor: "bg-amber-600 hover:bg-amber-700",
  },
];

const TRUST = [
  { icon: ShieldCheck, text: "Plata securizata prin Stripe" },
  { icon: Headset, text: "Suport 7 zile din 7" },
  { icon: Wrench, text: "Mentenanta gratuita pe viata" },
];

export default function StartPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Hero */}
      <section className="pt-16 pb-6 px-4 text-center max-w-4xl mx-auto">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
          Magazinul tau online,{" "}
          <span className="text-primary">gata in cateva minute</span>
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
          Tot ce ai nevoie pentru a vinde online: integrari cu curierii, plati cu cardul, facturi automate si suport 7 zile din 7.
        </p>

        {/* Trust strip */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
          {TRUST.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-sm text-gray-600">
              <Icon className="h-4 w-4 text-primary" />
              {text}
            </div>
          ))}
        </div>
      </section>

      {/* Mockups carousel - same as homepage */}
      <section className="pb-12 overflow-hidden">
        <HeroMockups />
      </section>

      {/* Plans */}
      <section className="px-4 pb-16 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-white rounded-2xl border-2 p-6 flex flex-col transition-all ${plan.color}`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-white text-xs font-bold uppercase tracking-wider">
                  {plan.badge}
                </span>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <plan.icon className="h-5 w-5 text-gray-700" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              </div>

              <div className="mb-5">
                <span className="text-4xl font-black text-gray-900">{plan.price}</span>
                <span className="text-gray-500 ml-1">lei/luna</span>
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={`/register?plan=${plan.id}`}
                className={`block text-center py-3 px-4 rounded-xl text-white font-semibold text-sm transition-colors ${plan.ctaColor}`}
              >
                {plan.cta}
                <ArrowRight className="inline-block h-4 w-4 ml-1.5 -mt-0.5" />
              </Link>
            </div>
          ))}
        </div>

        {/* Free trial note */}
        <p className="text-center text-sm text-gray-400 mt-8">
          Vrei sa testezi inainte?{" "}
          <Link href="/register" className="text-primary font-medium hover:underline">
            Incepe gratuit 15 zile
          </Link>{" "}
          fara card de credit.
        </p>
      </section>

      {/* Social proof / urgency */}
      <section className="px-4 pb-20 max-w-3xl mx-auto text-center">
        <div className="bg-white border border-gray-200 rounded-2xl p-8">
          <p className="text-2xl font-bold text-gray-900 mb-2">
            Peste 30 de magazine create pe Edinio
          </p>
          <p className="text-gray-500">
            Antreprenori din toata Romania isi vand deja produsele online cu Edinio. Tu cand incepi?
          </p>
          <Link
            href="/register?plan=basic"
            className="inline-flex items-center gap-2 mt-6 px-8 py-3.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-colors"
          >
            Creeaza magazinul acum
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
