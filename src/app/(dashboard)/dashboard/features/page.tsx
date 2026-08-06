import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { GOOGLE_MERCHANT_LIVE } from "@/lib/google-merchant/types";
import { Lock, ArrowRight, CheckCircle } from "lucide-react";
import type { SmsoConfig } from "@/lib/smso";
import type { SmartbillConfig } from "@/lib/smartbill";
import type { StripeConfig } from "@/components/dashboard/StripeConnectClient";
import type { NetopiaConfig } from "@/lib/netopia";
import type { IPayConfig } from "@/lib/ipay";
import type { KlarnaConfig } from "@/lib/klarna";
import type { RevolutConfig } from "@/lib/revolut";
import type { WootConfig } from "@/lib/woot";
import type { COConfig } from "@/lib/colete";
import type { OblioConfig } from "@/lib/oblio";
import type { FgoConfig } from "@/lib/fgo";
import type { CargusConfig } from "@/lib/cargus";
import type { DpdConfig } from "@/lib/dpd";
import type { FanCourierConfig } from "@/lib/fancourier";
import type { SamedayConfig } from "@/lib/sameday";
import type { MarketingConfig } from "@/lib/marketing";
import type { NoticeConfig } from "@/lib/notice";
import type { MailchimpConfig } from "@/lib/mailchimp";
import type { BrevoConfig } from "@/lib/brevo";
import type { KlaviyoConfig } from "@/lib/klaviyo";
import { aboutyouGloballyEnabled } from "@/lib/aboutyou/auth";
import { trendyolGloballyEnabled } from "@/lib/trendyol/auth";

type Integration = {
  name: string;
  logo: string;
  filter?: string;
  scale?: number;
  id?: string;
};

const SECTIONS: { id: string; label: string; integrations: Integration[] }[] = [
  {
    id: "curieri",
    label: "Curieri",
    integrations: [
      { name: "Fan Courier",   logo: "/integrations/fan-courier.svg", id: "fan-courier" },
      { name: "DPD",           logo: "/integrations/dpd.svg", id: "dpd" },
      { name: "Cargus",        logo: "/integrations/cargus.svg", id: "cargus" },
      { name: "Sameday",       logo: "/integrations/sameday.webp", id: "sameday" },
      { name: "Woot",          logo: "/integrations/woot.webp",    id: "woot" },
      { name: "Colete Online", logo: "/integrations/colete-online.svg", id: "colete" },
    ],
  },
  {
    id: "facturare",
    label: "Facturare",
    integrations: [
      { name: "SmartBill", logo: "/integrations/smartbill.webp", id: "smartbill" },
      { name: "Oblio",     logo: "/integrations/oblio.webp",    filter: "invert(1)", id: "oblio" },
      { name: "fGo",       logo: "/integrations/fgo.svg", id: "fgo" },
    ],
  },
  {
    id: "sms",
    label: "SMS",
    integrations: [
      { name: "Notice.ro", logo: "/integrations/notice.ro.png", id: "notice" },
      { name: "Smso.ro", logo: "/integrations/smso.svg", scale: 1.3, id: "smso" },
    ],
  },
  {
    id: "email-marketing",
    label: "Email marketing",
    integrations: [
      { name: "Mailchimp", logo: "/integrations/mailchimp.svg", id: "mailchimp" },
      { name: "Brevo", logo: "/integrations/brevo.svg", id: "brevo" },
      { name: "Klaviyo", logo: "/integrations/klaviyo.svg", id: "klaviyo" },
    ],
  },
  {
    id: "plati",
    label: "Procesatori de plati",
    integrations: [
      { name: "Stripe",           logo: "/integrations/stripe.svg", id: "stripe" },
      { name: "Netopia Payments", logo: "/integrations/netopia.svg", filter: "invert(1)", id: "netopia" },
      { name: "BT iPay",          logo: "/integrations/ipay.webp", id: "ipay" },
      { name: "Klarna",           logo: "/integrations/klarna.svg", id: "klarna" },
      { name: "Revolut",          logo: "/integrations/revolut.svg", id: "revolut" },
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    integrations: [
      { name: "OLX", logo: "/integrations/olx.svg", id: "olx" },
      { name: "About You", logo: "/integrations/aboutyou.png", id: "aboutyou" },
      { name: "Trendyol", logo: "/integrations/trendyol.svg", id: "trendyol" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    integrations: [
      { name: "Facebook Pixel", logo: "/integrations/facebook-pixel.svg", id: "facebook-pixel" },
      { name: "TikTok Pixel",   logo: "/integrations/tiktok-pixel.svg", id: "tiktok-pixel" },
      { name: "Google Ads",     logo: "/integrations/google-ads.svg", id: "google-ads" },
      { name: "Google Merchant Center", logo: "/integrations/google-merchant-center.svg", id: "google-merchant" },
      { name: "Facebook Catalog", logo: "/integrations/facebook-pixel.svg", id: "facebook-catalog" },
    ],
  },
  {
    id: "statistici",
    label: "Statistici",
    integrations: [
      { name: "Google Analytics", logo: "/integrations/google-analytics.svg", id: "google-analytics" },
    ],
  },
];

export default async function IntegrationsPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings: preloadedSettings } = await getCachedBusinessWithSettings(user.id);

  // Google Merchant is live for everyone (OAuth verification approved 2026-07-21).
  // GOOGLE_MERCHANT_LIVE stays as a kill-switch: flip to false to hide it from
  // non-admins again.
  const supabase = await createClient();
  const { data: profile } = await supabase.from("users_profile").select("role").eq("id", user.id).single();
  const gmcAvailable = GOOGLE_MERCHANT_LIVE || profile?.role === "admin";
  const aboutyouAvailable = aboutyouGloballyEnabled();
  const trendyolAvailable = trendyolGloballyEnabled();
  // Google Analytics is unlocked for everyone: the manual Measurement ID path
  // works without OAuth, so the card no longer waits for verification.

  let smsoActive = false;
  let noticeActive = false;
  let smartbillActive = false;
  let stripeActive = false;
  let netopiaActive = false;
  let ipayActive = false;
  let klarnaActive = false;
  let revolutActive = false;
  let wootActive = false;
  let coleteActive = false;
  let oblioActive = false;
  let fgoActive = false;
  let cargusActive = false;
  let dpdActive = false;
  let fanCourierActive = false;
  let samedayActive = false;
  let fbActive = false;
  let ttActive = false;
  let googleActive = false;
  let googleMerchantActive = false;
  let googleAnalyticsActive = false;
  let olxActive = false;
  let aboutyouActive = false;
  let trendyolActive = false;
  let mailchimpActive = false;
  let brevoActive = false;
  let klaviyoActive = false;
  if (business) {
    const settings = preloadedSettings;
    smsoActive = (settings?.smso_config as SmsoConfig | null)?.enabled === true;
    noticeActive = (settings?.notice_config as NoticeConfig | null)?.enabled === true;
    smartbillActive = (settings?.smartbill_config as SmartbillConfig | null)?.enabled === true;
    const sc = settings?.stripe_config as StripeConfig | null;
    stripeActive = !!(sc?.enabled && sc?.charges_enabled);
    const nc = settings?.netopia_config as NetopiaConfig | null;
    netopiaActive = !!(nc?.enabled && nc?.pos_signature && nc?.api_key);
    const ic = settings?.ipay_config as IPayConfig | null;
    ipayActive = !!(ic?.enabled && ic?.username && ic?.password);
    const kc = settings?.klarna_config as KlarnaConfig | null;
    klarnaActive = !!(kc?.enabled && kc?.username && kc?.password);
    const rc = settings?.revolut_config as RevolutConfig | null;
    revolutActive = !!(rc?.enabled && rc?.secret_key);
    const wc = settings?.woot_config as WootConfig | null;
    wootActive = !!(wc?.enabled && wc?.public_key && wc?.secret_key);
    const cc = settings?.colete_config as COConfig | null;
    coleteActive = !!(cc?.enabled && cc?.client_id && cc?.client_secret);
    const oc = settings?.oblio_config as OblioConfig | null;
    oblioActive = !!(oc?.enabled && oc?.client_id && oc?.cif && oc?.series_invoice);
    const fc = settings?.fgo_config as FgoConfig | null;
    fgoActive = !!(fc?.enabled && fc?.cod_unic && fc?.private_key && fc?.serie);
    const cg = settings?.cargus_config as CargusConfig | null;
    cargusActive = !!(cg?.enabled && cg?.username && cg?.subscription_key && cg?.location_id);
    const dg = settings?.dpd_config as DpdConfig | null;
    dpdActive = !!(dg?.enabled && dg?.username && dg?.client_id);
    const fg = settings?.fan_courier_config as FanCourierConfig | null;
    fanCourierActive = !!(fg?.enabled && fg?.username && fg?.client_id);
    const sg = settings?.sameday_config as SamedayConfig | null;
    samedayActive = !!(sg?.enabled && sg?.username && sg?.pickup_point_id);
    const mg = settings?.marketing_config as MarketingConfig | null;
    fbActive = !!mg?.facebook_pixel_id?.trim();
    ttActive = !!mg?.tiktok_pixel_id?.trim();
    googleActive = !!mg?.google_tag_id?.trim();
    const gmc = settings?.google_merchant_config as { connected?: boolean } | null;
    googleMerchantActive = !!gmc?.connected;
    const ga = settings?.google_analytics_config as { connected?: boolean } | null;
    googleAnalyticsActive = !!ga?.connected;
    const olx = settings?.olx_config as { connected?: boolean } | null;
    olxActive = !!olx?.connected;
    const ay = settings?.aboutyou_config as { connected?: boolean } | null;
    aboutyouActive = !!ay?.connected;
    const ty = settings?.trendyol_config as { connected?: boolean } | null;
    trendyolActive = !!ty?.connected;
    const mch = settings?.mailchimp_config as MailchimpConfig | null;
    mailchimpActive = !!(mch?.enabled && mch?.audience_id);
    const bv = settings?.brevo_config as BrevoConfig | null;
    brevoActive = !!(bv?.enabled && bv?.list_id);
    const kv = settings?.klaviyo_config as KlaviyoConfig | null;
    klaviyoActive = !!(kv?.enabled && kv?.list_id);
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground mb-1">Integrari</h1>
        <p className="text-sm text-muted-foreground">
          Conecteaza-ti magazinul cu servicii externe pentru a automatiza livrarea, facturarea, platile si marketingul.
        </p>
      </div>

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <div key={section.id}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                {section.label}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.integrations.map((integration) => {
                const isUnlocked = integration.id === "notice" || integration.id === "smso" || integration.id === "smartbill" || integration.id === "stripe" || integration.id === "netopia" || integration.id === "ipay" || integration.id === "klarna" || integration.id === "revolut" || integration.id === "woot" || integration.id === "colete" || integration.id === "oblio" || integration.id === "fgo" || integration.id === "cargus" || integration.id === "dpd" || integration.id === "fan-courier" || integration.id === "sameday" || integration.id === "facebook-pixel" || integration.id === "tiktok-pixel" || integration.id === "google-ads" || integration.id === "facebook-catalog" || integration.id === "mailchimp" || integration.id === "brevo" || integration.id === "klaviyo" || (integration.id === "google-merchant" && gmcAvailable) || integration.id === "google-analytics" || integration.id === "olx" || (integration.id === "aboutyou" && aboutyouAvailable) || (integration.id === "trendyol" && trendyolAvailable);
                const isActive = integration.id === "notice" ? noticeActive : integration.id === "smso" ? smsoActive : integration.id === "smartbill" ? smartbillActive : integration.id === "stripe" ? stripeActive : integration.id === "netopia" ? netopiaActive : integration.id === "ipay" ? ipayActive : integration.id === "klarna" ? klarnaActive : integration.id === "revolut" ? revolutActive : integration.id === "woot" ? wootActive : integration.id === "colete" ? coleteActive : integration.id === "oblio" ? oblioActive : integration.id === "fgo" ? fgoActive : integration.id === "cargus" ? cargusActive : integration.id === "dpd" ? dpdActive : integration.id === "fan-courier" ? fanCourierActive : integration.id === "sameday" ? samedayActive : integration.id === "facebook-pixel" ? fbActive : integration.id === "tiktok-pixel" ? ttActive : integration.id === "google-ads" ? googleActive : integration.id === "google-merchant" ? googleMerchantActive : integration.id === "mailchimp" ? mailchimpActive : integration.id === "brevo" ? brevoActive : integration.id === "klaviyo" ? klaviyoActive : integration.id === "google-analytics" ? googleAnalyticsActive : integration.id === "olx" ? olxActive : integration.id === "aboutyou" ? aboutyouActive : integration.id === "trendyol" ? trendyolActive : false;
                const href = integration.id === "notice" ? "/dashboard/features/notice" : integration.id === "smso" ? "/dashboard/features/smso" : integration.id === "smartbill" ? "/dashboard/features/smartbill" : integration.id === "stripe" ? "/dashboard/features/stripe" : integration.id === "netopia" ? "/dashboard/features/netopia" : integration.id === "ipay" ? "/dashboard/features/ipay" : integration.id === "klarna" ? "/dashboard/features/klarna" : integration.id === "revolut" ? "/dashboard/features/revolut" : integration.id === "woot" ? "/dashboard/features/woot" : integration.id === "colete" ? "/dashboard/features/colete" : integration.id === "oblio" ? "/dashboard/features/oblio" : integration.id === "fgo" ? "/dashboard/features/fgo" : integration.id === "cargus" ? "/dashboard/features/cargus" : integration.id === "dpd" ? "/dashboard/features/dpd" : integration.id === "fan-courier" ? "/dashboard/features/fan-courier" : integration.id === "sameday" ? "/dashboard/features/sameday" : integration.id === "facebook-pixel" ? "/dashboard/features/facebook-pixel" : integration.id === "tiktok-pixel" ? "/dashboard/features/tiktok-pixel" : integration.id === "google-ads" ? "/dashboard/features/google-ads" : integration.id === "facebook-catalog" ? "/dashboard/features/facebook-catalog" : integration.id === "google-merchant" ? "/dashboard/features/google-merchant" : integration.id === "mailchimp" ? "/dashboard/features/mailchimp" : integration.id === "brevo" ? "/dashboard/features/brevo" : integration.id === "klaviyo" ? "/dashboard/features/klaviyo" : integration.id === "google-analytics" ? "/dashboard/features/google-analytics" : integration.id === "olx" ? "/dashboard/features/olx" : integration.id === "aboutyou" ? "/dashboard/features/aboutyou" : integration.id === "trendyol" ? "/dashboard/features/trendyol" : "#";

                if (isUnlocked) {
                  return (
                    <Link
                      key={integration.name}
                      href={href}
                      className="relative flex items-center gap-3.5 p-4 rounded-xl border border-primary/30 bg-surface hover:border-primary hover:shadow-sm transition-all group"
                    >
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
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-foreground">{integration.name}</p>
                          {["klarna", "mailchimp", "brevo", "klaviyo", "revolut", "olx", "aboutyou", "trendyol", "facebook-catalog"].includes(integration.id ?? "") && (
                            <span className="text-[9px] font-bold uppercase tracking-wide bg-primary text-white px-1.5 py-0.5 rounded-full leading-none">Nou</span>
                          )}
                        </div>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded mt-0.5">
                            <CheckCircle className="h-2.5 w-2.5" />Activ
                          </span>
                        ) : (
                          <span className="inline-block text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded mt-0.5">
                            Configureaza
                          </span>
                        )}
                      </div>
                      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <ArrowRight className="h-3.5 w-3.5 text-primary" />
                      </div>
                    </Link>
                  );
                }

                return (
                  <div
                    key={integration.name}
                    className="relative flex items-center gap-3.5 p-4 rounded-xl border border-border bg-surface opacity-60 cursor-not-allowed select-none"
                  >
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
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{integration.name}</p>
                    </div>
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 p-4 rounded-xl bg-primary/5 border border-primary/15">
        <p className="text-sm font-medium text-foreground mb-1">Vrei o integrare specifica mai repede?</p>
        <p className="text-xs text-muted-foreground">
          Contacteaza-ne si o vom prioritiza in roadmap-ul nostru.
        </p>
      </div>
    </div>
  );
}
