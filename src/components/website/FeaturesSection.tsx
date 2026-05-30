import Image from "next/image";
import {
  CreditCard,
  Truck,
} from "lucide-react";

/* ── Miniature dashboard mockups (match real platform UI) ── */

function MockTemplate() {
  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
      {/* Top bar - like the real store */}
      <div className="px-3 py-1.5 bg-primary text-white flex items-center justify-center">
        <span className="text-[7px] font-medium tracking-wide uppercase truncate">
          Livrare rapida in toata Romania. Retur 14 zile.
        </span>
      </div>
      {/* Store header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-primary flex items-center justify-center text-white text-[6px] font-bold">E</div>
          <span className="text-[9px] font-semibold text-foreground">Demo Shop</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-10 bg-muted rounded-full" />
        </div>
      </div>
      {/* Products grid */}
      <div className="p-2 grid grid-cols-2 gap-1.5">
        {[
          { bg: "bg-rose-50", name: "Produs 1", price: "89 lei", badge: "-15%" },
          { bg: "bg-amber-50", name: "Produs 2", price: "149 lei", badge: null },
          { bg: "bg-sky-50", name: "Produs 3", price: "199 lei", badge: "NOU" },
          { bg: "bg-purple-50", name: "Produs 4", price: "59 lei", badge: null },
        ].map((p, i) => (
          <div key={i} className="rounded-lg border border-border overflow-hidden">
            <div className={`h-10 ${p.bg} relative`}>
              {p.badge && (
                <span className="absolute top-0.5 right-0.5 px-1 py-0.5 bg-primary text-white text-[5px] font-bold rounded">
                  {p.badge}
                </span>
              )}
            </div>
            <div className="p-1.5">
              <div className="text-[7px] font-medium text-foreground truncate">{p.name}</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[7px] text-primary font-bold">{p.price}</span>
                <span className="text-[5px] px-1 py-0.5 bg-primary text-white rounded font-semibold">COMANDA</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockOrders() {
  const orders = [
    { id: "#1042", name: "Maria P.", total: "149 lei", status: "In asteptare", statusCls: "bg-amber-50 text-amber-700 border-amber-200", date: "29 Mai" },
    { id: "#1041", name: "Andrei M.", total: "299 lei", status: "Confirmat", statusCls: "bg-blue-50 text-blue-700 border-blue-200", date: "29 Mai" },
    { id: "#1040", name: "Elena S.", total: "89 lei", status: "Livrat", statusCls: "bg-green-50 text-green-700 border-green-200", date: "28 Mai" },
    { id: "#1039", name: "Ion D.", total: "199 lei", status: "Expediat", statusCls: "bg-indigo-50 text-indigo-700 border-indigo-200", date: "28 Mai" },
  ];

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-foreground">Comenzi</span>
          <span className="text-[7px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            2 noi
          </span>
        </div>
        <div className="h-5 w-16 bg-muted/50 rounded-md" />
      </div>
      {/* Table header */}
      <div className="px-3 py-1.5 bg-muted/50 grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
        <span className="text-[7px] font-semibold text-muted-foreground uppercase">Client</span>
        <span className="text-[7px] font-semibold text-muted-foreground uppercase">Total</span>
        <span className="text-[7px] font-semibold text-muted-foreground uppercase">Status</span>
        <span className="text-[7px] font-semibold text-muted-foreground uppercase">Data</span>
      </div>
      {/* Rows */}
      <div className="divide-y divide-border">
        {orders.map((o) => (
          <div key={o.id} className="px-3 py-1.5 grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center hover:bg-muted/30">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[6px] font-bold text-muted-foreground">
                {o.name[0]}
              </div>
              <div>
                <span className="text-[8px] font-medium text-foreground block leading-tight">{o.name}</span>
                <span className="text-[6px] text-muted-foreground">{o.id}</span>
              </div>
            </div>
            <span className="text-[8px] font-semibold text-foreground">{o.total}</span>
            <span className={`text-[6px] font-semibold px-1.5 py-0.5 rounded-full border ${o.statusCls}`}>
              {o.status}
            </span>
            <span className="text-[7px] text-muted-foreground">{o.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCustomize() {
  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
      <div className="px-3 py-2 border-b border-border flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-foreground">Personalizeaza magazinul</span>
      </div>
      <div className="p-3 space-y-3">
        {/* Color picker */}
        <div>
          <span className="text-[8px] font-medium text-muted-foreground block mb-1.5">Culoare principala</span>
          <div className="flex items-center gap-1.5">
            {[
              "bg-[#1AB554]",
              "bg-[#3B82F6]",
              "bg-[#8B5CF6]",
              "bg-[#EF4444]",
              "bg-[#F59E0B]",
              "bg-[#EC4899]",
              "bg-[#14B8A6]",
              "bg-[#1E293B]",
            ].map((c, i) => (
              <div
                key={c}
                className={`w-5 h-5 rounded-full ${c} transition-transform ${i === 0 ? "ring-2 ring-primary/40 ring-offset-1 scale-110" : "hover:scale-110"}`}
              />
            ))}
          </div>
        </div>
        {/* Font selector */}
        <div>
          <span className="text-[8px] font-medium text-muted-foreground block mb-1.5">Font</span>
          <div className="flex gap-1">
            {["Inter", "Poppins", "Playfair"].map((f, i) => (
              <div
                key={f}
                className={`px-2 py-1 rounded-md text-[8px] font-medium ${
                  i === 0
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "border border-border text-foreground"
                }`}
              >
                {f}
              </div>
            ))}
          </div>
        </div>
        {/* Button effect */}
        <div>
          <span className="text-[8px] font-medium text-muted-foreground block mb-1.5">Efect buton comanda</span>
          <div className="flex gap-1">
            {["Pulse", "Shake", "Glow", "None"].map((e, i) => (
              <div
                key={e}
                className={`px-2 py-1 rounded-md text-[7px] font-medium ${
                  i === 0
                    ? "bg-primary text-white"
                    : "border border-border text-muted-foreground"
                }`}
              >
                {e}
              </div>
            ))}
          </div>
        </div>
        {/* Toggle */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[8px] text-foreground">Bara de livrare gratuita</span>
          <div className="w-7 h-4 rounded-full bg-primary relative">
            <div className="absolute right-0.5 top-0.5 w-3 h-3 rounded-full bg-white shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Integration icon grids (real SVGs) ── */

const PAYMENT_ICONS = [
  { src: "/integrations/stripe.svg", alt: "Stripe" },
  { src: "/integrations/netopia.svg", alt: "Netopia" },
];

const DELIVERY_ICONS = [
  { src: "/integrations/sameday.svg", alt: "Sameday" },
  { src: "/integrations/fan-courier.svg", alt: "Fan Courier" },
  { src: "/integrations/cargus.svg", alt: "Cargus" },
  { src: "/integrations/dpd.svg", alt: "DPD" },
  { src: "/integrations/colete-online.svg", alt: "Colete Online" },
  { src: "/integrations/gls.svg", alt: "GLS" },
  { src: "/integrations/woot.svg", alt: "Woot" },
  { src: "/integrations/fgo.svg", alt: "FGO" },
  { src: "/integrations/smartbill.svg", alt: "SmartBill" },
  { src: "/integrations/oblio.webp", alt: "Oblio" },
  { src: "/integrations/smso.svg", alt: "SMSO" },
];

function IconGrid({ icons }: { icons: { src: string; alt: string }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 py-3">
      {icons.map((icon) => (
        <div
          key={icon.alt}
          className="w-12 h-12 rounded-xl bg-white border border-border flex items-center justify-center p-2 shadow-sm"
        >
          <Image src={icon.src} alt={icon.alt} width={32} height={32} className="w-full h-full object-contain" />
        </div>
      ))}
    </div>
  );
}

/* ── Feature cards config ── */

const TOP_FEATURES = [
  {
    visual: <MockTemplate />,
    title: "Sablon optimizat pentru piata din Romania",
    description:
      "Magazine configurate cu lei, livrare locala, facturare si tot ce ai nevoie pentru a vinde in Romania.",
  },
  {
    visual: <MockOrders />,
    title: "Gestioneaza totul usor",
    description:
      "Comenzi, produse, stocuri si clienti. Toate intr-un singur dashboard intuitiv, exact ca in platforma.",
  },
  {
    visual: <MockCustomize />,
    title: "Personalizare rapida, chiar si de pe telefon",
    description:
      "Schimba culori, fonturi, efecte si continut din cateva click-uri. Fara cunostinte tehnice.",
  },
];

const BOTTOM_FEATURES = [
  {
    icon: CreditCard,
    icons: PAYMENT_ICONS,
    title: "Plati integrate",
    description:
      "Accepta plati prin card, transfer bancar sau ramburs. Configurare in cateva minute.",
  },
  {
    icon: Truck,
    icons: DELIVERY_ICONS,
    title: "Integrari cu servicii locale",
    description:
      "Conecteaza magazinul cu servicii de livrare, facturare, SMS si marketing din Romania.",
  },
];

/* ── Main section ── */

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

        {/* Top row: 3 cards with real dashboard mockups */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
          {TOP_FEATURES.map(({ visual, title, description }) => (
            <div
              key={title}
              className="group rounded-2xl border border-border bg-muted/30 p-5 hover:border-primary/20 hover:shadow-md transition-all"
            >
              <div className="mb-5">{visual}</div>
              <h3 className="text-base font-semibold text-foreground mb-1.5">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom row: 2 wider cards with real integration icons */}
        <div className="grid sm:grid-cols-2 gap-5">
          {BOTTOM_FEATURES.map(({ icons, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-muted/30 p-5 hover:border-primary/20 hover:shadow-md transition-all"
            >
              <div className="mb-5">
                <IconGrid icons={icons} />
              </div>
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
