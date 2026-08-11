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
  gls: { src: "/integrations/gls.svg", alt: "GLS" },
  /*
   * ⚠ `pallex.avif` E RECOLORAT DE NOI, nu e fisierul de la Pall-Ex.
   *
   * Cel oficial e ALB (94% din cerneala) si era invizibil peste tot, fiindca
   * toate cele cinci locuri unde apare un logo randeaza pe alb: `bg-surface` e
   * #FFFFFF si in `.dark`, iar pe site pastilele sunt `bg-white`.
   *
   * `filter: invert(1)`, cum e la Oblio si Netopia, NU merge aici: logo-ul are un
   * accent rosu #E02020 pe care inversarea l-ar face CYAN. S-a inversat doar
   * LUMINOZITATEA (HSL), pastrand nuanta — albul devine negru, rosul ramane rosu,
   * iar aureolele roz deschis dintre ele devin rosu inchis si se topesc in
   * cerneala. Originalul alb sta in `pallex-alb.avif`, pentru cand va exista o
   * suprafata intunecata.
   */
  pallex: { src: "/integrations/pallex.avif", alt: "Pall-Ex" },
  ecolet: { src: "/integrations/ecolet.png", alt: "eColet" },
  smartbill: { src: "/integrations/smartbill.webp", alt: "SmartBill" },
  oblio: { src: "/integrations/oblio.webp", alt: "Oblio", filter: "invert(1)" },
  fgo: { src: "/integrations/fgo.svg", alt: "fGO" },
  smso: { src: "/integrations/smso.svg", alt: "Smso.ro" },
  notice: { src: "/integrations/notice.ro.png", alt: "Notice.ro" },
  stripe: { src: "/integrations/stripe.svg", alt: "Stripe" },
  netopia: { src: "/integrations/netopia.svg", alt: "Netopia Payments", filter: "invert(1)" },
  ipay: { src: "/integrations/ipay.webp", alt: "BT iPay" },
  klarna: { src: "/integrations/klarna.svg", alt: "Klarna" },
  revolut: { src: "/integrations/revolut.svg", alt: "Revolut" },
  "facebook-pixel": { src: "/integrations/facebook-pixel.svg", alt: "Facebook Pixel" },
  "facebook-catalog": { src: "/integrations/facebook-pixel.svg", alt: "Facebook Catalog" },
  "tiktok-pixel": { src: "/integrations/tiktok-pixel.svg", alt: "TikTok Pixel" },
  "google-ads": { src: "/integrations/google-ads.svg", alt: "Google Ads" },
  "google-analytics": { src: "/integrations/google-analytics.svg", alt: "Google Analytics" },
  "google-merchant": { src: "/integrations/google-merchant-center.svg", alt: "Google Merchant Center" },
  olx: { src: "/integrations/olx.svg", alt: "OLX" },
  aboutyou: { src: "/integrations/aboutyou.png", alt: "About You" },
  trendyol: { src: "/integrations/trendyol.svg", alt: "Trendyol" },
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
