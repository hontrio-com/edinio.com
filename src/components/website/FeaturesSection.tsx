import Image from "next/image";
import {
  ChevronDown,
  Info, Palette, MapPin, Share2, Layout, Globe,
  Banknote, Store,
} from "lucide-react";

/* ── Store editor mockup (matches real StoreEditor.tsx) ── */

function MockCustomize() {
  const COLOR_PRESETS = [
    "#1AB554", "#1E3A5F", "#8B1A1A", "#374151", "#D97706", "#6D28D9", "#E11D48", "#0891B2",
  ];

  return (
    <div className="bg-background rounded-2xl border border-border overflow-hidden shadow-sm max-w-md mx-auto">
      <div className="px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground block">Editeaza magazinul</span>
        <span className="text-xs text-muted-foreground">Modificarile se salveaza separat</span>
      </div>

      <div className="divide-y divide-border">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Informatii generale</span>
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </div>

        <div>
          <div className="px-4 py-3 flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <Palette className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Identitate vizuala</span>
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground rotate-180" />
          </div>
          <div className="px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-medium text-muted-foreground block mb-1">Logo</span>
                <div className="rounded-lg border-2 border-dashed border-border flex items-center justify-center py-4">
                  <span className="text-[10px] text-muted-foreground">Incarca imagine</span>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-medium text-muted-foreground block mb-1">Banner / Cover</span>
                <div className="rounded-lg border-2 border-dashed border-border flex items-center justify-center py-4">
                  <span className="text-[10px] text-muted-foreground">Incarca imagine</span>
                </div>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-muted-foreground block mb-1.5">Culoare principala</span>
              <div className="flex items-center gap-1.5">
                {COLOR_PRESETS.map((c, i) => (
                  <div
                    key={c}
                    className="w-5 h-5 rounded-full transition-transform"
                    style={{
                      backgroundColor: c,
                      border: i === 0 ? "2px solid white" : "none",
                      boxShadow: i === 0 ? `0 0 0 2px ${c}` : "none",
                      transform: i === 0 ? "scale(1.15)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {[
          { icon: MapPin, label: "Locatie" },
          { icon: Share2, label: "Social media" },
          { icon: Layout, label: "Pagina produs" },
          { icon: Globe, label: "Publicare" },
        ].map(({ icon: Icon, label }) => (
          <div key={label} className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">{label}</span>
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Integration icon grids ── */

const PAYMENT_ICONS: { src: string; alt: string; filter?: string }[] = [
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
    <div className="flex flex-wrap items-center justify-center gap-4">
      {icons.map((icon) => (
        <div
          key={icon.alt}
          className="w-14 h-14 rounded-xl bg-white border border-border flex items-center justify-center p-2.5 shadow-sm"
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
    <div className="flex flex-wrap items-center justify-center gap-4">
      {PAYMENT_ICONS.map((icon) => (
        <div
          key={icon.alt}
          className="w-14 h-14 rounded-xl bg-white border border-border flex items-center justify-center p-2.5 shadow-sm"
        >
          <Image
            src={icon.src}
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
          className="h-14 rounded-xl bg-white border border-border flex items-center justify-center gap-2 px-4 shadow-sm"
        >
          <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium text-foreground whitespace-nowrap">{label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Features data ── */

interface Feature {
  title: string;
  description: string;
  image?: string;
  visual?: React.ReactNode;
}

const FEATURES: Feature[] = [
  {
    image: "/features/f1.png",
    title: "Sablon optimizat pentru piata din Romania",
    description:
      "Magazine configurate cu lei, livrare locala, facturare si tot ce ai nevoie pentru a vinde in Romania. Sablonul nostru e creat special pentru antreprenorii romani.",
  },
  {
    image: "/features/f2.png",
    title: "Gestioneaza totul usor",
    description:
      "Comenzi, produse, stocuri si clienti. Toate intr-un singur dashboard intuitiv. Ai control total asupra magazinului tau, de pe orice dispozitiv.",
  },
  {
    visual: <MockCustomize />,
    title: "Personalizare rapida, chiar si de pe telefon",
    description:
      "Schimba culori, fonturi, efecte si continut din cateva click-uri. Fara cunostinte tehnice. Fiecare sectiune se salveaza independent.",
  },
  {
    visual: <PaymentGrid />,
    title: "Configurare modalitati de plata",
    description:
      "Accepta plati prin card, transfer bancar, ramburs la curier sau ridicare din magazin. Configurare in cateva minute, totul integrat nativ.",
  },
  {
    visual: <IconGrid icons={SERVICE_ICONS} />,
    title: "Integrari cu servicii locale",
    description:
      "Conecteaza magazinul cu servicii de livrare, facturare, SMS si marketing din Romania. Totul se configureaza din dashboard fara cod.",
  },
];

/* ── Main section ── */

export function FeaturesSection() {
  return (
    <section id="functionalitati" className="py-20 lg:py-28 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-16 lg:mb-20">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
            Primul pas catre succesul online,{" "}
            <span className="text-primary">noi te ghidam</span>
          </h2>
        </div>

        {/* Alternating rows */}
        <div className="space-y-16 lg:space-y-24">
          {FEATURES.map((feature, i) => {
            const reversed = i % 2 === 1;

            return (
              <div
                key={feature.title}
                className={`grid lg:grid-cols-2 gap-8 lg:gap-16 items-center ${
                  reversed ? "lg:direction-rtl" : ""
                }`}
              >
                {/* Text */}
                <div className={`${reversed ? "lg:order-2" : "lg:order-1"}`}>
                  <h3 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-4">
                    {feature.title}
                  </h3>
                  <p className="text-base text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>

                {/* Visual */}
                <div className={`${reversed ? "lg:order-1" : "lg:order-2"}`}>
                  {feature.image ? (
                    <Image
                      src={feature.image}
                      alt={feature.title}
                      width={600}
                      height={800}
                      className="w-full h-auto rounded-2xl border border-border shadow-lg"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  ) : (
                    <div className="rounded-2xl border border-border bg-muted/30 p-5 lg:p-8 shadow-lg">
                      {feature.visual}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
