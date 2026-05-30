import Image from "next/image";
import {
  ShoppingBag, Star, ShieldCheck, Truck, RotateCcw,
  Search, ChevronRight, ChevronDown,
  Info, Palette, MapPin, Share2, Layout, Globe,
  Banknote, Store,
} from "lucide-react";

/* ── 1. Product page mockup (matches real ProductPage.tsx) ── */

function MockProductPage() {
  return (
    <div className="bg-[#FAFAFA] rounded-lg border border-border overflow-hidden shadow-sm">
      {/* Announcement bar */}
      <div className="h-5 bg-primary flex items-center justify-center">
        <span className="text-[5px] font-medium tracking-wide text-white uppercase truncate">
          PLATA LA LIVRARE &nbsp;&nbsp; &#10022; &nbsp;&nbsp; LIVRARE RAPIDA 24-48H &nbsp;&nbsp; &#10022; &nbsp;&nbsp; RETUR 14 ZILE
        </span>
      </div>

      {/* Header */}
      <div className="px-2 py-1.5 bg-white border-b border-gray-100 flex items-center gap-1.5">
        <span className="text-[6px] text-gray-400">&#8592; Magazin</span>
        <span className="text-[6px] text-gray-300">/</span>
        <span className="text-[7px] font-bold text-gray-900">Demo Shop</span>
      </div>

      <div className="p-2 grid grid-cols-2 gap-2">
        {/* Product image */}
        <div className="relative rounded-lg bg-gray-50 flex items-center justify-center" style={{ aspectRatio: "1/1" }}>
          <div className="w-8 h-8 rounded bg-gradient-to-br from-rose-100 to-rose-200" />
          <span className="absolute top-1 right-1 bg-amber-400 text-black text-[4px] font-black px-1 py-0.5 rounded-full">
            -25%
          </span>
          {/* Dots */}
          <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5">
            <span className="w-3 h-1 rounded-full bg-primary" />
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span className="w-1 h-1 rounded-full bg-gray-300" />
          </div>
        </div>

        {/* Product details */}
        <div className="flex flex-col gap-1">
          {/* Rating */}
          <div className="inline-flex items-center gap-0.5 bg-amber-50 border border-amber-200 rounded-full px-1 py-0.5 w-fit">
            <div className="flex">
              {[1,2,3,4,5].map(i => (
                <Star key={i} className="h-1.5 w-1.5 text-amber-400 fill-amber-400" />
              ))}
            </div>
            <span className="text-[4px] font-semibold text-amber-800">Calitate verificata</span>
          </div>

          {/* Title */}
          <p className="text-[7px] font-black text-gray-900 leading-tight">Crema hidratanta premium cu acid hialuronic</p>

          {/* Price */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-black text-gray-900">149 lei</span>
            <span className="text-[6px] text-gray-400 line-through">199 lei</span>
            <span className="bg-amber-400 text-black text-[4px] font-black px-1 py-0.5 rounded-full">-25%</span>
          </div>

          {/* CTA button */}
          <div className="w-full py-1 bg-primary text-white rounded-md flex items-center justify-center gap-0.5">
            <ShoppingBag className="h-2 w-2" />
            <span className="text-[4.5px] font-bold uppercase tracking-wide">Comanda acum - Plata la livrare</span>
          </div>

          {/* Trust mini */}
          <div className="grid grid-cols-3 gap-0.5">
            {[
              { icon: ShieldCheck, text: "Plata la livrare" },
              { icon: Truck, text: "Livrare 24-48h" },
              { icon: RotateCcw, text: "Retur 14 zile" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex flex-col items-center gap-0.5 text-center">
                <Icon className="h-2 w-2 text-primary" />
                <span className="text-[3.5px] text-gray-500 font-medium leading-tight">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 2. Orders dashboard mockup (matches real OrdersClient.tsx) ── */

function MockOrders() {
  const orders = [
    { id: "#EDN-1042", name: "Maria P.", phone: "0745***", total: "149 lei", status: "In asteptare", statusCls: "bg-amber-50 text-amber-700 border border-amber-200", date: "29 Mai" },
    { id: "#EDN-1041", name: "Andrei M.", phone: "0722***", total: "299 lei", status: "Confirmat", statusCls: "bg-blue-50 text-blue-700 border border-blue-200", date: "29 Mai" },
    { id: "#EDN-1040", name: "Elena S.", phone: "0733***", total: "89 lei", status: "Livrat", statusCls: "bg-green-50 text-green-700 border border-green-200", date: "28 Mai" },
    { id: "#EDN-1039", name: "Ion D.", phone: "0755***", total: "199 lei", status: "Expediat", statusCls: "bg-indigo-50 text-indigo-700 border border-indigo-200", date: "28 Mai" },
  ];

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-semibold text-foreground block">Comenzi</span>
          <span className="text-[6px] text-muted-foreground">Toate comenzile primite</span>
        </div>
        <span className="text-[6px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
          2 in asteptare
        </span>
      </div>

      {/* Search bar */}
      <div className="px-3 pb-1.5">
        <div className="flex items-center gap-1 px-2 py-1 bg-muted/40 border border-border rounded-lg">
          <Search className="h-2 w-2 text-muted-foreground" />
          <span className="text-[6px] text-muted-foreground">Cauta comanda, client...</span>
        </div>
      </div>

      {/* Status tabs */}
      <div className="px-3 pb-1.5 flex gap-1">
        {[
          { label: "Toate", count: "4", active: true },
          { label: "In asteptare", count: "2", active: false },
          { label: "Confirmate", count: "1", active: false },
          { label: "Livrate", count: "1", active: false },
        ].map(tab => (
          <span key={tab.label} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[5px] font-medium ${
            tab.active ? "bg-primary text-white" : "bg-muted text-muted-foreground"
          }`}>
            {tab.label}
            <span className={`px-0.5 rounded text-[4px] font-bold ${
              tab.active ? "bg-white/20 text-white" : "bg-background text-muted-foreground"
            }`}>{tab.count}</span>
          </span>
        ))}
      </div>

      {/* Table header */}
      <div className="px-3 py-1 bg-muted/50 grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center border-t border-border">
        <span className="text-[5px] font-semibold text-muted-foreground uppercase tracking-widest">Comanda</span>
        <span className="text-[5px] font-semibold text-muted-foreground uppercase tracking-widest">Total</span>
        <span className="text-[5px] font-semibold text-muted-foreground uppercase tracking-widest">Status</span>
        <span className="text-[5px] font-semibold text-muted-foreground uppercase tracking-widest">Data</span>
        <span className="w-2" />
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {orders.map((o) => (
          <div key={o.id} className="px-3 py-1.5 grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center hover:bg-muted/30">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[5px] font-bold text-muted-foreground">
                {o.name[0]}
              </div>
              <div>
                <span className="text-[7px] font-medium text-foreground block leading-tight">{o.name}</span>
                <span className="text-[5px] font-mono text-muted-foreground">{o.id}</span>
              </div>
            </div>
            <span className="text-[7px] font-semibold text-foreground">{o.total}</span>
            <span className={`text-[5px] font-medium px-1.5 py-0.5 rounded-full ${o.statusCls}`}>
              {o.status}
            </span>
            <span className="text-[6px] text-muted-foreground">{o.date}</span>
            <ChevronRight className="h-2 w-2 text-muted-foreground opacity-40" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 3. Store editor mockup (matches real StoreEditor.tsx) ── */

function MockCustomize() {
  const COLOR_PRESETS = [
    "#1AB554", "#1E3A5F", "#8B1A1A", "#374151", "#D97706", "#6D28D9", "#E11D48", "#0891B2",
  ];

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border">
        <span className="text-[10px] font-semibold text-foreground block">Editeaza magazinul</span>
        <span className="text-[6px] text-muted-foreground">Modificarile se salveaza separat pentru fiecare sectiune</span>
      </div>

      <div className="divide-y divide-border">
        {/* Collapsed: Informatii generale */}
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Info className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[8px] font-semibold text-foreground">Informatii generale</span>
          </div>
          <ChevronDown className="h-2 w-2 text-muted-foreground" />
        </div>

        {/* Open: Identitate vizuala */}
        <div>
          <div className="px-3 py-2 flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Palette className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="text-[8px] font-semibold text-foreground">Identitate vizuala</span>
            </div>
            <ChevronDown className="h-2 w-2 text-muted-foreground rotate-180" />
          </div>
          <div className="px-3 py-2 space-y-2">
            {/* Logo & Cover placeholders */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[5px] font-medium text-muted-foreground block mb-0.5">Logo</span>
                <div className="rounded border-2 border-dashed border-border flex items-center justify-center py-2">
                  <span className="text-[5px] text-muted-foreground">Incarca imagine</span>
                </div>
              </div>
              <div>
                <span className="text-[5px] font-medium text-muted-foreground block mb-0.5">Banner / Cover</span>
                <div className="rounded border-2 border-dashed border-border flex items-center justify-center py-2">
                  <span className="text-[5px] text-muted-foreground">Incarca imagine</span>
                </div>
              </div>
            </div>
            {/* Color presets */}
            <div>
              <span className="text-[6px] font-medium text-muted-foreground block mb-1">Culoare principala</span>
              <div className="flex items-center gap-1">
                {COLOR_PRESETS.map((c, i) => (
                  <div
                    key={c}
                    className="w-3.5 h-3.5 rounded-full transition-transform"
                    style={{
                      backgroundColor: c,
                      border: i === 0 ? "2px solid white" : "none",
                      boxShadow: i === 0 ? `0 0 0 1.5px ${c}` : "none",
                      transform: i === 0 ? "scale(1.15)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Collapsed: Locatie */}
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[8px] font-semibold text-foreground">Locatie</span>
          </div>
          <ChevronDown className="h-2 w-2 text-muted-foreground" />
        </div>

        {/* Collapsed: Social media */}
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Share2 className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[8px] font-semibold text-foreground">Social media</span>
          </div>
          <ChevronDown className="h-2 w-2 text-muted-foreground" />
        </div>

        {/* Collapsed: Pagina produs */}
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Layout className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[8px] font-semibold text-foreground">Pagina produs</span>
          </div>
          <ChevronDown className="h-2 w-2 text-muted-foreground" />
        </div>

        {/* Collapsed: Publicare */}
        <div className="px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Globe className="h-2.5 w-2.5 text-muted-foreground" />
            <span className="text-[8px] font-semibold text-foreground">Publicare</span>
          </div>
          <ChevronDown className="h-2 w-2 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

/* ── Integration icon grids ── */

const PAYMENT_ICONS: { src?: string; alt: string; filter?: string }[] = [
  { src: "/integrations/stripe.svg", alt: "Stripe" },
  { src: "/integrations/netopia.svg", alt: "Netopia", filter: "invert(1)" },
];

const PAYMENT_EXTRA = [
  { icon: Banknote, label: "Ramburs la curier" },
  { icon: Store, label: "Ridicare din magazin" },
];

const SERVICE_ICONS: { src: string; alt: string; filter?: string; scale?: number }[] = [
  { src: "/integrations/sameday.svg", alt: "Sameday" },
  { src: "/integrations/fan-courier.svg", alt: "Fan Courier" },
  { src: "/integrations/cargus.svg", alt: "Cargus" },
  { src: "/integrations/dpd.svg", alt: "DPD" },
  { src: "/integrations/colete-online.svg", alt: "Colete Online" },
  { src: "/integrations/woot.svg", alt: "Woot", filter: "invert(1)" },
  { src: "/integrations/fgo.svg", alt: "FGO" },
  { src: "/integrations/smartbill.svg", alt: "SmartBill", scale: 1.25 },
  { src: "/integrations/oblio.webp", alt: "Oblio", filter: "invert(1)" },
  { src: "/integrations/smso.svg", alt: "SMSO", scale: 1.3 },
  { src: "/integrations/gls.svg", alt: "GLS" },
];

function IconGrid({ icons }: { icons: { src: string; alt: string; filter?: string; scale?: number }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 py-3">
      {icons.map((icon) => (
        <div
          key={icon.alt}
          className="w-12 h-12 rounded-xl bg-white border border-border flex items-center justify-center p-2 shadow-sm"
        >
          <Image
            src={icon.src}
            alt={icon.alt}
            width={32}
            height={32}
            className="w-full h-full object-contain"
            style={{
              filter: icon.filter ?? undefined,
              transform: icon.scale ? `scale(${icon.scale})` : undefined,
              transformOrigin: "center",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function PaymentGrid() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 py-3">
      {PAYMENT_ICONS.map((icon) => (
        <div
          key={icon.alt}
          className="w-12 h-12 rounded-xl bg-white border border-border flex items-center justify-center p-2 shadow-sm"
        >
          <Image
            src={icon.src!}
            alt={icon.alt}
            width={32}
            height={32}
            className="w-full h-full object-contain"
            style={{ filter: icon.filter ?? undefined }}
          />
        </div>
      ))}
      {PAYMENT_EXTRA.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="h-12 rounded-xl bg-white border border-border flex items-center justify-center gap-1.5 px-3 shadow-sm"
        >
          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-[11px] font-medium text-foreground whitespace-nowrap">{label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Feature cards config ── */

const TOP_FEATURES = [
  {
    visual: <MockProductPage />,
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
    visual: <PaymentGrid />,
    title: "Configurare modalitati de plata",
    description:
      "Accepta plati prin card, transfer bancar, ramburs la curier sau ridicare din magazin. Configurare in cateva minute.",
  },
  {
    visual: <IconGrid icons={SERVICE_ICONS} />,
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
              className="group rounded-2xl border border-border bg-muted/30 p-5 hover:border-primary/20 hover:shadow-md transition-all flex flex-col"
            >
              <div className="mb-5">{visual}</div>
              <h3 className="text-base font-semibold text-foreground mb-1.5 min-h-[2.5rem]">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed min-h-[3rem]">
                {description}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom row: 2 wider cards with real integration icons */}
        <div className="grid sm:grid-cols-2 gap-5">
          {BOTTOM_FEATURES.map(({ visual, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-muted/30 p-5 hover:border-primary/20 hover:shadow-md transition-all flex flex-col"
            >
              <div className="mb-5">{visual}</div>
              <h3 className="text-base font-semibold text-foreground mb-1.5 min-h-[1.5rem]">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed min-h-[2.5rem]">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
