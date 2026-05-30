import Image from "next/image";
import {
  ChevronDown,
  Info, Palette, MapPin, Share2, Layout, Globe,
  Banknote, Store,
} from "lucide-react";

/* ── 3. Store editor mockup (matches real StoreEditor.tsx) ── */

function MockCustomize() {
  const COLOR_PRESETS = [
    "#1AB554", "#1E3A5F", "#8B1A1A", "#374151", "#D97706", "#6D28D9", "#E11D48", "#0891B2",
  ];

  return (
    <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
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
    image: "/features/f1.png",
    title: "Sablon optimizat pentru piata din Romania",
    description:
      "Magazine configurate cu lei, livrare locala, facturare si tot ce ai nevoie pentru a vinde in Romania.",
  },
  {
    image: "/features/f2.png",
    title: "Gestioneaza totul usor",
    description:
      "Comenzi, produse, stocuri si clienti. Toate intr-un singur dashboard intuitiv, exact ca in platforma.",
  },
  {
    visual: <MockCustomize />,
    image: null,
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

/* ── Shared visual height for top cards ── */
const VISUAL_HEIGHT = "h-[300px]";

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
          {TOP_FEATURES.map(({ image, visual, title, description }) => (
            <div
              key={title}
              className="group rounded-2xl border border-border bg-muted/30 p-5 hover:border-primary/20 hover:shadow-md transition-all"
            >
              {/* Fixed-height visual wrapper so titles align */}
              <div className={`${VISUAL_HEIGHT} overflow-hidden rounded-xl mb-5`}>
                {image ? (
                  <div className="relative w-full h-full">
                    <Image
                      src={image}
                      alt={title}
                      fill
                      className="object-cover object-top rounded-xl"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  </div>
                ) : (
                  visual
                )}
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1.5 h-10 flex items-start">
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
          {BOTTOM_FEATURES.map(({ visual, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-muted/30 p-5 hover:border-primary/20 hover:shadow-md transition-all"
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
      </div>
    </section>
  );
}
