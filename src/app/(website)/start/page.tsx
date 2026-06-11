import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check, Zap, Rocket, Crown, ArrowRight, ShieldCheck, Star, Clock, CreditCard, FileText, Truck } from "lucide-react";
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
    description: "Pentru afaceri in crestere",
    features: [
      "Pana la 500 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanta gratuita pe viata",
    ],
    cta: "Incepe cu Basic",
    color: "border-blue-200 hover:border-blue-400 hover:shadow-lg",
    ctaColor: "bg-blue-600 hover:bg-blue-700",
  },
  {
    id: "premium",
    name: "Premium",
    price: 249,
    badge: "Recomandat",
    icon: Rocket,
    description: "Cel mai popular",
    features: [
      "Pana la 2.500 produse",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanta gratuita pe viata",
      "Manager dedicat magazinului tau",
    ],
    cta: "Incepe cu Premium",
    color: "border-primary hover:border-primary shadow-xl shadow-primary/10 scale-[1.02]",
    ctaColor: "bg-primary hover:bg-primary/90",
  },
  {
    id: "ultra",
    name: "Ultra",
    price: 499,
    badge: null,
    icon: Crown,
    description: "Pentru afaceri mari",
    features: [
      "Produse nelimitate",
      "Comenzi nelimitate",
      "Suport 7 zile din 7",
      "Mentenanta gratuita pe viata",
      "Manager dedicat magazinului tau",
    ],
    cta: "Incepe cu Ultra",
    color: "border-amber-200 hover:border-amber-400 hover:shadow-lg",
    ctaColor: "bg-amber-600 hover:bg-amber-700",
  },
];

const INTEGRATIONS = [
  { src: "/integrations/sameday.svg", alt: "Sameday Courier" },
  { src: "/integrations/fan-courier.svg", alt: "FAN Courier" },
  { src: "/integrations/cargus.svg", alt: "Cargus" },
  { src: "/integrations/dpd.svg", alt: "DPD" },
  { src: "/integrations/woot.svg", alt: "Woot" },
  { src: "/integrations/colete-online.svg", alt: "Colete Online" },
  { src: "/integrations/stripe.svg", alt: "Stripe" },
  { src: "/integrations/netopia.svg", alt: "Netopia" },
  { src: "/integrations/smartbill.svg", alt: "SmartBill" },
  { src: "/integrations/fgo.svg", alt: "Factura.online" },
  { src: "/integrations/smso.svg", alt: "SMSO" },
  { src: "/integrations/facebook-pixel.svg", alt: "Facebook Pixel" },
  { src: "/integrations/google-ads.svg", alt: "Google Ads" },
  { src: "/integrations/tiktok-pixel.svg", alt: "TikTok Pixel" },
];

const TRUST_ITEMS = [
  { icon: ShieldCheck, title: "Plati securizate", desc: "Stripe & Netopia cu protectie PCI DSS" },
  { icon: Clock, title: "Online in 2 minute", desc: "Creeaza magazinul fara cunostinte tehnice" },
  { icon: Star, title: "200+ magazine active", desc: "Antreprenori din toata Romania" },
  { icon: CreditCard, title: "Fara comisioane Edinio", desc: "Platesti doar abonamentul lunar" },
  { icon: FileText, title: "Facturare automata", desc: "SmartBill, Oblio, Factura.online" },
  { icon: Truck, title: "Toti curierii integrati", desc: "Sameday, FAN, Cargus, DPD, Woot" },
];

export default function StartPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      {/* Hero */}
      <section className="pt-16 sm:pt-20 pb-8 px-4 text-center max-w-4xl mx-auto">
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-tight">
          Magazinul tau online la cheie,{" "}
          <span className="text-primary">gata in cateva minute</span>
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
          Tot ce ai nevoie pentru a vinde online: integrari cu curierii, plati cu cardul, facturi automate si suport 7 zile din 7.
        </p>

        {/* Animated maintenance badge */}
        <div className="mt-8 inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-primary/5 border border-primary/20">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
          </span>
          <span className="text-sm font-semibold text-primary tracking-wide uppercase">
            Mentenanta gratuita pe viata
          </span>
        </div>
      </section>

      {/* Mockups carousel */}
      <section className="pt-4 pb-16 overflow-hidden">
        <HeroMockups />
      </section>

      {/* Integrations marquee */}
      <section className="pb-16 px-4">
        <p className="text-center text-sm font-semibold text-gray-400 uppercase tracking-wider mb-8">
          Serviciile tale preferate, integrate nativ
        </p>
        <div className="relative overflow-hidden max-w-5xl mx-auto">
          {/* Fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-gray-50 to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-gray-50 to-transparent z-10" />
          {/* Marquee */}
          <div className="flex animate-[marquee_30s_linear_infinite] gap-12 items-center">
            {[...INTEGRATIONS, ...INTEGRATIONS].map((item, i) => (
              <div key={`${item.alt}-${i}`} className="flex-shrink-0 h-10 w-24 flex items-center justify-center grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all">
                <Image src={item.src} alt={item.alt} width={96} height={40} className="h-8 w-auto object-contain" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="px-4 pb-16 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Preturi simple, fara surprize</h2>
          <p className="mt-2 text-gray-500">Toate planurile includ integrari curierat, plati online si facturare automata.</p>
        </div>

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

              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <plan.icon className="h-5 w-5 text-gray-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                  <p className="text-xs text-gray-500">{plan.description}</p>
                </div>
              </div>

              <div className="my-5">
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
      </section>

      {/* Trust grid */}
      <section className="px-4 pb-16 max-w-5xl mx-auto">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TRUST_ITEMS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 p-4 bg-white border border-gray-100 rounded-xl">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof + final CTA */}
      <section className="px-4 pb-20 max-w-3xl mx-auto text-center">
        <div className="bg-white border border-gray-200 rounded-2xl p-8">
          <p className="text-2xl font-bold text-gray-900 mb-2">
            Peste 200 de magazine create pe Edinio
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
