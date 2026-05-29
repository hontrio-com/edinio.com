import {
  ShoppingCart,
  Star,
  Palette,
  CreditCard,
  Truck,
} from "lucide-react";

/* ── Top 3 feature cards ── */

function MockStore() {
  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <div className="w-4 h-4 rounded bg-primary flex items-center justify-center text-white text-[7px] font-bold">
          M
        </div>
        <span className="text-[10px] font-medium text-foreground">
          Mini-Store
        </span>
        <ShoppingCart className="h-3 w-3 text-muted-foreground ml-auto" />
      </div>
      <div className="p-2 grid grid-cols-2 gap-1.5">
        {["bg-rose-100", "bg-amber-100", "bg-sky-100", "bg-purple-100"].map(
          (bg, i) => (
            <div key={i} className="rounded border border-border overflow-hidden">
              <div className={`h-8 ${bg}`} />
              <div className="p-1.5">
                <div className="h-1.5 w-12 bg-muted rounded-full" />
                <div className="h-1.5 w-8 bg-primary/20 rounded-full mt-1" />
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function MockOrders() {
  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[10px] font-semibold text-foreground">
          Comenzi recente
        </span>
      </div>
      <div className="divide-y divide-border">
        {[
          { name: "Maria P.", amount: "149 lei", status: "bg-green-100 text-green-700" },
          { name: "Andrei M.", amount: "299 lei", status: "bg-amber-100 text-amber-700" },
          { name: "Elena S.", amount: "89 lei", status: "bg-green-100 text-green-700" },
        ].map((o) => (
          <div key={o.name} className="px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                {o.name[0]}
              </div>
              <span className="text-[10px] text-foreground">{o.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-foreground">
                {o.amount}
              </span>
              <span
                className={`text-[8px] font-medium px-1.5 py-0.5 rounded-full ${o.status}`}
              >
                {o.status.includes("green") ? "Platit" : "In curs"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCustomize() {
  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[10px] font-semibold text-foreground">
          Personalizeaza
        </span>
      </div>
      <div className="p-3 space-y-3">
        <div>
          <span className="text-[9px] text-muted-foreground block mb-1.5">
            Culoare principala
          </span>
          <div className="flex items-center gap-1.5">
            {[
              "bg-primary",
              "bg-sky-500",
              "bg-violet-500",
              "bg-rose-500",
              "bg-amber-500",
              "bg-slate-800",
            ].map((c) => (
              <div
                key={c}
                className={`w-5 h-5 rounded-full ${c} ${c === "bg-primary" ? "ring-2 ring-primary/30 ring-offset-1" : ""}`}
              />
            ))}
          </div>
        </div>
        <div>
          <span className="text-[9px] text-muted-foreground block mb-1.5">
            Font
          </span>
          <div className="flex gap-1.5">
            {["Inter", "Serif", "Mono"].map((f) => (
              <div
                key={f}
                className="px-2 py-1 rounded border border-border text-[9px] text-foreground"
              >
                {f}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="w-14 h-8 rounded bg-primary/10 border border-primary/20" />
          <div className="space-y-1 flex-1">
            <div className="h-1.5 w-full bg-muted rounded-full" />
            <div className="h-1.5 w-2/3 bg-muted rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

const TOP_FEATURES = [
  {
    visual: <MockStore />,
    title: "Template-uri gata de folosit",
    description:
      "Biblioteca noastra de template-uri te ajuta sa pornesti rapid cu un magazin profesional.",
  },
  {
    visual: <MockOrders />,
    title: "Gestioneaza totul usor",
    description:
      "Comenzi, produse, stocuri si clienti. Toate intr-un singur dashboard intuitiv.",
  },
  {
    visual: <MockCustomize />,
    title: "Personalizeaza fiecare detaliu",
    description:
      "Controleaza culorile, fonturile si layout-ul magazinului tau fara cunostinte tehnice.",
  },
];

/* ── Bottom 2 wider cards ── */

function LogoGrid({
  items,
}: {
  items: { abbr: string; bg: string; text: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 py-2">
      {items.map((item) => (
        <div
          key={item.abbr}
          className={`w-11 h-11 rounded-xl ${item.bg} flex items-center justify-center ${item.text} text-xs font-bold shadow-sm`}
        >
          {item.abbr}
        </div>
      ))}
    </div>
  );
}

const PAYMENT_LOGOS = [
  { abbr: "S", bg: "bg-indigo-100", text: "text-indigo-600" },
  { abbr: "N", bg: "bg-orange-100", text: "text-orange-600" },
  { abbr: "VISA", bg: "bg-blue-50", text: "text-blue-700" },
  { abbr: "MC", bg: "bg-red-50", text: "text-red-600" },
  { abbr: "Lei", bg: "bg-green-50", text: "text-green-700" },
];

const DELIVERY_LOGOS = [
  { abbr: "SD", bg: "bg-red-100", text: "text-red-600" },
  { abbr: "FC", bg: "bg-blue-100", text: "text-blue-700" },
  { abbr: "C", bg: "bg-orange-100", text: "text-orange-600" },
  { abbr: "SB", bg: "bg-sky-100", text: "text-sky-700" },
  { abbr: "DPD", bg: "bg-red-50", text: "text-red-700" },
  { abbr: "W", bg: "bg-violet-100", text: "text-violet-600" },
];

const BOTTOM_FEATURES = [
  {
    icon: CreditCard,
    logos: PAYMENT_LOGOS,
    title: "Plati integrate",
    description:
      "Accepta plati prin card, transfer bancar sau ramburs. Configurare in cateva minute.",
  },
  {
    icon: Truck,
    logos: DELIVERY_LOGOS,
    title: "Integrari cu servicii locale",
    description:
      "Conecteaza magazinul cu servicii de livrare, facturare si marketing.",
  },
];

export function FeaturesSection() {
  return (
    <section id="functionalitati" className="py-20 lg:py-28 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
            Primul pas catre succesul online,{" "}
            <span className="text-primary">noi te ghidam</span>
          </h2>
        </div>

        {/* Top row: 3 cards with visual mockups */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
          {TOP_FEATURES.map(({ visual, title, description }) => (
            <div
              key={title}
              className="group rounded-2xl border border-border bg-muted/30 p-5 hover:border-primary/20 hover:shadow-md transition-all"
            >
              {/* Visual mockup */}
              <div className="mb-5">{visual}</div>
              {/* Text */}
              <h3 className="text-base font-semibold text-foreground mb-1.5">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom row: 2 wider cards with logo grids */}
        <div className="grid sm:grid-cols-2 gap-5">
          {BOTTOM_FEATURES.map(({ logos, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-muted/30 p-5 hover:border-primary/20 hover:shadow-md transition-all"
            >
              {/* Logo grid */}
              <div className="mb-5">
                <LogoGrid items={logos} />
              </div>
              {/* Text */}
              <h3 className="text-base font-semibold text-foreground mb-1.5">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
