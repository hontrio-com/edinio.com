import type { Metadata } from "next";
import {
  Check,
  X,
  Zap,
  Rocket,
  Crown,
  ArrowRight,
  PackageCheck,
  Banknote,
  Clock,
  TrendingUp,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import { MigrationForm } from "@/components/landing/MigrationForm";
import { MigrationHero } from "@/components/landing/MigrationHero";

export const metadata: Metadata = {
  title: "Migreaza-ti magazinul la Edinio - migrare gratuita in 24 de ore",
  description:
    "Iti migram toate produsele gratuit, in 24 de ore. Fara comisioane, fara costuri ascunse, pret fix pe viata. Mentenanta gratuita si suport 7 zile din 7.",
  alternates: { canonical: "https://www.edinio.com/migrare" },
};

const PAINS = [
  {
    icon: Banknote,
    title: "Platesti comisioane la fiecare vanzare?",
    desc: "Fiecare comanda iti ia un procent din profit, luna de luna.",
  },
  {
    icon: Clock,
    title: "Suportul raspunde dupa zile?",
    desc: "Cand ai o problema urgenta, astepti zile pentru un raspuns.",
  },
  {
    icon: TrendingUp,
    title: "Pretul abonamentului a crescut fara sa fii intrebat?",
    desc: "Te trezesti ca platesti mai mult, fara nicio explicatie.",
  },
];

const OFFER = [
  "Migrare completa a produselor, o facem noi",
  "Fara contract pe termen lung, platesti lunar si anulezi oricand",
  "Magazin live in 24 de ore",
  "Pret fix pe viata, nu creste niciodata",
  "Mentenanta gratuita pe viata",
  "Suport 7 zile din 7, raspuns in ore, nu in zile",
];

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: 99,
    badge: null,
    icon: Zap,
    description: "Pentru afaceri in crestere",
    features: ["Pana la 500 produse", "Comenzi nelimitate", "Suport 7 zile din 7"],
    color: "border-gray-200 hover:border-gray-300 hover:shadow-lg",
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
      "Manager dedicat magazinului tau",
    ],
    color: "border-primary shadow-xl shadow-primary/10 md:scale-[1.03]",
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
      "Manager dedicat magazinului tau",
    ],
    color: "border-gray-200 hover:border-gray-300 hover:shadow-lg",
  },
];

const COMPARISON = [
  { label: "Pret lunar", edinio: "Fix pe viata", other: "Creste constant" },
  { label: "Comision per vanzare", edinio: "0%", other: "1 - 3%" },
  { label: "Mentenanta", edinio: "Gratuita", other: "Contra cost" },
  { label: "Migrare", edinio: "Gratuita", other: "Pe cont propriu" },
  { label: "Suport", edinio: "7 zile din 7", other: "Program limitat" },
];

export default function MigrarePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Announcement bar */}
      <div className="bg-primary text-white">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-center">
          <Headphones className="h-3.5 w-3.5 flex-shrink-0" />
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
            Suport si mentenanta gratuita 7 zile din 7
          </p>
        </div>
      </div>

      {/* Hero */}
      <MigrationHero />

      {/* Durerea */}
      <section className="px-4 pt-16 pb-16 max-w-5xl mx-auto">
        <div className="grid gap-4 md:grid-cols-3">
          {PAINS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white border border-gray-100 rounded-2xl p-6">
              <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
                <Icon className="h-5 w-5 text-gray-500" />
              </div>
              <p className="text-base font-semibold text-gray-900 leading-snug">{title}</p>
              <p className="mt-2 text-sm text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Oferta de migrare */}
      <section className="px-4 pb-16 max-w-3xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-3xl p-8 sm:p-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
            Ce primesti cand migrezi la Edinio
          </h2>
          <ul className="mt-8 space-y-4">
            {OFFER.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Check className="h-3.5 w-3.5 text-primary" />
                </span>
                <span className="text-[15px] text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-center text-lg font-bold text-gray-900">
            Fara perioada de tranzitie. Fara batai de cap. Fara sa pierzi nimic.
          </p>
        </div>
      </section>

      {/* Preturi */}
      <section className="px-4 pb-16 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Preturi clare, fara surprize. Fix pe viata.
          </h2>
          <p className="mt-2 text-gray-500">
            Alege planul potrivit pentru tine. Migrarea este inclusa la toate.
          </p>
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
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-full px-2.5 py-1">
                  <PackageCheck className="h-3.5 w-3.5" />
                  Migrare gratuita inclusa
                </p>
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href="#formular"
                className="block text-center py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm transition-colors"
              >
                Vreau acest plan
                <ArrowRight className="inline-block h-4 w-4 ml-1.5 -mt-0.5" />
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Comparatie */}
      <section className="px-4 pb-16 max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Edinio vs. platforma ta actuala</h2>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left font-medium text-gray-400 px-4 py-4 sm:px-6"></th>
                <th className="text-center font-bold text-primary px-3 py-4 sm:px-6">Edinio</th>
                <th className="text-center font-medium text-gray-500 px-3 py-4 sm:px-6">Alte platforme</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={row.label} className={i % 2 === 1 ? "bg-gray-50/60" : ""}>
                  <td className="px-4 py-4 sm:px-6 font-medium text-gray-700">{row.label}</td>
                  <td className="px-3 py-4 sm:px-6 text-center">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-gray-900">
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      {row.edinio}
                    </span>
                  </td>
                  <td className="px-3 py-4 sm:px-6 text-center">
                    <span className="inline-flex items-center gap-1.5 text-gray-500">
                      <X className="h-4 w-4 text-gray-300 flex-shrink-0" />
                      {row.other}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Formular */}
      <section id="formular" className="px-4 pb-16 max-w-md mx-auto scroll-mt-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Completeaza si te sunam noi</h2>
          <p className="mt-2 text-gray-500">
            Lasa-ne numarul tau si un specialist te contacteaza pentru migrarea gratuita.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 shadow-sm">
          <MigrationForm />
        </div>

        {/* Garantie */}
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-primary/5 border border-primary/15 p-5">
          <ShieldCheck className="h-6 w-6 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Garantie 30 de zile</p>
            <p className="mt-1 text-sm text-gray-600">
              Daca in 30 de zile nu esti multumit, iti returnam banii. Fara intrebari.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
