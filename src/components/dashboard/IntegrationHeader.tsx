import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Single source of truth for integration logos, so every integration page shows
// the same header: a "← Integrari" back link + the brand logo (no redundant name).
const LOGOS: Record<string, { src: string; alt: string; filter?: string }> = {
  "fan-courier": { src: "/integrations/fan-courier.svg", alt: "FAN Courier" },
  dpd: { src: "/integrations/dpd.svg", alt: "DPD" },
  cargus: { src: "/integrations/cargus.svg", alt: "Cargus" },
  sameday: { src: "/integrations/sameday.webp", alt: "Sameday" },
  woot: { src: "/integrations/woot.webp", alt: "Woot" },
  colete: { src: "/integrations/colete-online.svg", alt: "Colete Online" },
  smartbill: { src: "/integrations/smartbill.webp", alt: "SmartBill" },
  oblio: { src: "/integrations/oblio.webp", alt: "Oblio", filter: "invert(1)" },
  fgo: { src: "/integrations/fgo.svg", alt: "fGO" },
  smso: { src: "/integrations/smso.svg", alt: "Smso.ro" },
  notice: { src: "/integrations/notice.ro.png", alt: "Notice.ro" },
  stripe: { src: "/integrations/stripe.svg", alt: "Stripe" },
  netopia: { src: "/integrations/netopia.svg", alt: "Netopia Payments", filter: "invert(1)" },
  ipay: { src: "/integrations/ipay.webp", alt: "BT iPay" },
  "facebook-pixel": { src: "/integrations/facebook-pixel.svg", alt: "Facebook Pixel" },
  "tiktok-pixel": { src: "/integrations/tiktok-pixel.svg", alt: "TikTok Pixel" },
  "google-ads": { src: "/integrations/google-ads.svg", alt: "Google Ads" },
  "google-merchant": { src: "/integrations/google-merchant-center.svg", alt: "Google Merchant Center" },
  marketing: { src: "/integrations/facebook-pixel.svg", alt: "Marketing" },
};

export function IntegrationHeader({ id, description }: { id: string; description?: string }) {
  const logo = LOGOS[id];
  return (
    <div className="mb-6">
      <Link
        href="/dashboard/features"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft className="h-4 w-4" />
        Integrari
      </Link>
      <div className="flex items-center gap-3">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo.src}
            alt={logo.alt}
            className="h-8 w-auto object-contain"
            style={logo.filter ? { filter: logo.filter } : undefined}
          />
        )}
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}
