import { Lock } from "lucide-react";

const SECTIONS = [
  {
    id: "curieri",
    label: "Curieri",
    integrations: [
      { name: "Fan Courier",    logo: "/integrations/fan-courier.svg" },
      { name: "DPD",            logo: "/integrations/dpd.svg" },
      { name: "Cargus",         logo: "/integrations/cargus.svg" },
      { name: "Sameday",        logo: "/integrations/sameday.svg" },
      { name: "GLS",            logo: "/integrations/gls.svg" },
      { name: "Woot",           logo: "/integrations/woot.svg",     filter: "invert(1)" },
      { name: "Colete Online",  logo: "/integrations/colete-online.svg" },
    ],
  },
  {
    id: "facturare",
    label: "Facturare",
    integrations: [
      { name: "SmartBill",        logo: "/integrations/smartbill.svg",  scale: 1.25 },
      { name: "Oblio",            logo: "/integrations/oblio.webp",     filter: "invert(1)" },
      { name: "fGo",              logo: "/integrations/fgo.svg" },
    ],
  },
  {
    id: "sms",
    label: "SMS Marketing",
    integrations: [
      { name: "Smso.ro",          logo: "/integrations/smso.svg",       scale: 1.3 },
    ],
  },
  {
    id: "plati",
    label: "Procesatori de plati",
    integrations: [
      { name: "Stripe",           logo: "/integrations/stripe.svg" },
      { name: "Netopia Payments", logo: "/integrations/netopia.svg",    filter: "invert(1)" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    integrations: [
      { name: "Facebook Pixel",   logo: "/integrations/facebook-pixel.svg" },
      { name: "TikTok Pixel",     logo: "/integrations/tiktok-pixel.svg" },
      { name: "Google Ads",       logo: "/integrations/google-ads.svg" },
    ],
  },
];

export default function IntegrationsPage() {
  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-xl font-semibold text-foreground">Integrari</h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
            In curand
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Conecteaza-ti magazinul cu servicii externe pentru a automatiza livrarea, facturarea, platile si marketingul.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <div key={section.id}>
            {/* Section header */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                {section.label}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Integration cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.integrations.map((integration) => (
                <div
                  key={integration.name}
                  className="relative flex items-center gap-3.5 p-4 rounded-xl border border-border bg-surface opacity-70 cursor-not-allowed select-none"
                >
                  {/* Logo */}
                  <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                    <img
                      src={integration.logo}
                      alt={integration.name}
                      className="w-full h-full object-contain"
                      style={{
                        filter: integration.filter ?? undefined,
                        transform: integration.scale ? `scale(${integration.scale})` : undefined,
                        transformOrigin: "center",
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{integration.name}</p>
                  </div>

                  {/* Lock badge */}
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom note */}
      <div className="mt-10 p-4 rounded-xl bg-primary/5 border border-primary/15">
        <p className="text-sm font-medium text-foreground mb-1">Vrei o integrare specifica mai repede?</p>
        <p className="text-xs text-muted-foreground">
          Contacteaza-ne si o vom prioritiza in roadmap-ul nostru.
        </p>
      </div>
    </div>
  );
}
