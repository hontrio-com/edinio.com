import Image from "next/image";
import Link from "next/link";
import {
  ChevronDown, Check,
  Info, Palette, MapPin, Share2, Layout, Globe,
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

/* ── Integration orbit ── */

const ORBIT_ICONS: { src: string; alt: string; filter?: string; scale?: number }[] = [
  { src: "/integrations/stripe.svg", alt: "Stripe" },
  { src: "/integrations/netopia.svg", alt: "Netopia", filter: "invert(1)" },
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

function IntegrationOrbit() {
  const count = ORBIT_ICONS.length;
  const radius = 155;

  return (
    <div className="relative w-[340px] h-[340px] sm:w-[380px] sm:h-[380px] mx-auto">
      {/* Orbit ring lines (static) */}
      <div className="absolute inset-[60px] sm:inset-[65px] rounded-full border border-border/40" />
      <div className="absolute inset-[30px] sm:inset-[25px] rounded-full border border-dashed border-border/20" />

      {/* Center - Edinio logo (static) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-primary flex items-center justify-center shadow-xl shadow-primary/25 z-10">
        <span className="text-white font-bold text-2xl sm:text-3xl">E</span>
      </div>

      {/* Subtle glow behind center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-primary/10 blur-xl" />

      {/* Rotating icons wrapper */}
      <div
        className="absolute inset-0"
        style={{ animation: "spin 80s linear infinite" }}
      >
        {ORBIT_ICONS.map((icon, i) => {
          const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          return (
            <div
              key={icon.alt}
              className="absolute top-1/2 left-1/2 z-20"
              style={{
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              }}
            >
              <div
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-white border border-border flex items-center justify-center p-2 shadow-md"
                style={{ animation: "spin 80s linear infinite reverse" }}
              >
                <Image
                  src={icon.src}
                  alt={icon.alt}
                  width={28}
                  height={28}
                  className="w-full h-full object-contain"
                  style={{
                    filter: icon.filter ?? undefined,
                    transform: icon.scale ? `scale(${icon.scale})` : undefined,
                    transformOrigin: "center",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Features data ── */

interface Feature {
  title: string;
  description: string;
  benefits: string[];
  image?: string;
  visual?: React.ReactNode;
  imageClass?: string;
}

const FEATURES: Feature[] = [
  {
    image: "/features/f1.png",
    imageClass: "max-w-[280px] sm:max-w-[320px] mx-auto",
    title: "Sablon optimizat pentru piata din Romania",
    description:
      "Magazine configurate cu lei, livrare locala, facturare si tot ce ai nevoie pentru a vinde in Romania.",
    benefits: [
      "Preturi in lei, checkout in limba romana",
      "Facturare automata integrata",
      "Metode de livrare locale preconfigurate",
      "Sablon creat special pentru piata romaneasca",
    ],
  },
  {
    image: "/features/f2.png",
    title: "Gestioneaza totul usor",
    description:
      "Comenzi, produse, stocuri si clienti. Toate intr-un singur dashboard intuitiv.",
    benefits: [
      "Dashboard complet pentru comenzi si produse",
      "Gestionare stocuri in timp real",
      "Acces de pe orice dispozitiv",
      "Notificari pentru comenzi noi",
    ],
  },
  {
    visual: <MockCustomize />,
    title: "Personalizare rapida, chiar si de pe telefon",
    description:
      "Schimba culori, fonturi, efecte si continut din cateva click-uri. Fara cunostinte tehnice.",
    benefits: [
      "Editor vizual intuitiv",
      "Schimba culori si fonturi instant",
      "Fiecare sectiune se salveaza independent",
      "Functioneaza perfect pe mobil",
    ],
  },
  {
    visual: <IntegrationOrbit />,
    title: "Toate integrarile de care ai nevoie, intr-un singur loc",
    description:
      "Plati, curieri, facturare, SMS si marketing. Totul conectat nativ la magazinul tau.",
    benefits: [
      "Plati prin card, ramburs sau ridicare din magazin",
      "Curieri: Sameday, Fan Courier, Cargus, DPD, GLS",
      "Facturare: SmartBill, Oblio, FGO",
      "SMS si marketing: SMSO, Woot",
    ],
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
                className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center"
              >
                {/* Text */}
                <div className={`${reversed ? "lg:order-2" : "lg:order-1"}`}>
                  <h3 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-4">
                    {feature.title}
                  </h3>
                  <p className="text-base text-muted-foreground leading-relaxed mb-5">
                    {feature.description}
                  </p>
                  <ul className="space-y-2.5 mb-7">
                    {feature.benefits.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-sm text-foreground">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
                  >
                    Testeaza gratuit
                  </Link>
                </div>

                {/* Visual */}
                <div className={`${reversed ? "lg:order-1" : "lg:order-2"}`}>
                  {feature.image ? (
                    <div className={feature.imageClass ?? ""}>
                      <Image
                        src={feature.image}
                        alt={feature.title}
                        width={600}
                        height={800}
                        className="w-full h-auto rounded-2xl border border-border shadow-lg"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                      />
                    </div>
                  ) : (
                    feature.visual
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
