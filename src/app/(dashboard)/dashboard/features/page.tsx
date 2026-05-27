import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Lock, ArrowRight, CheckCircle } from "lucide-react";
import type { SmsoConfig } from "@/lib/smso";
import type { SmartbillConfig } from "@/lib/smartbill";
import type { StripeConfig } from "@/components/dashboard/StripeConnectClient";
import type { NetopiaConfig } from "@/lib/netopia";
import type { WootConfig } from "@/lib/woot";
import type { COConfig } from "@/lib/colete";
import type { OblioConfig } from "@/lib/oblio";
import type { FgoConfig } from "@/lib/fgo";
import type { CargusConfig } from "@/lib/cargus";
import type { DpdConfig } from "@/lib/dpd";
import type { FanCourierConfig } from "@/lib/fancourier";
import type { SamedayConfig } from "@/lib/sameday";
import type { MarketingConfig } from "@/lib/marketing";

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
      { name: "Sameday",       logo: "/integrations/sameday.svg", id: "sameday" },
      { name: "Woot",          logo: "/integrations/woot.svg",    filter: "invert(1)", id: "woot" },
      { name: "Colete Online", logo: "/integrations/colete-online.svg", id: "colete" },
    ],
  },
  {
    id: "facturare",
    label: "Facturare",
    integrations: [
      { name: "SmartBill", logo: "/integrations/smartbill.svg", scale: 1.25, id: "smartbill" },
      { name: "Oblio",     logo: "/integrations/oblio.webp",    filter: "invert(1)", id: "oblio" },
      { name: "fGo",       logo: "/integrations/fgo.svg", id: "fgo" },
    ],
  },
  {
    id: "sms",
    label: "SMS Marketing",
    integrations: [
      { name: "Smso.ro", logo: "/integrations/smso.svg", scale: 1.3, id: "smso" },
    ],
  },
  {
    id: "plati",
    label: "Procesatori de plati",
    integrations: [
      { name: "Stripe",           logo: "/integrations/stripe.svg", id: "stripe" },
      { name: "Netopia Payments", logo: "/integrations/netopia.svg", filter: "invert(1)", id: "netopia" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    integrations: [
      { name: "Facebook Pixel", logo: "/integrations/facebook-pixel.svg", id: "marketing" },
      { name: "TikTok Pixel",   logo: "/integrations/tiktok-pixel.svg" },
      { name: "Google Ads",     logo: "/integrations/google-ads.svg" },
    ],
  },
];

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .single();

  let smsoActive = false;
  let smartbillActive = false;
  let stripeActive = false;
  let netopiaActive = false;
  let wootActive = false;
  let coleteActive = false;
  let oblioActive = false;
  let fgoActive = false;
  let cargusActive = false;
  let dpdActive = false;
  let fanCourierActive = false;
  let samedayActive = false;
  let marketingActive = false;
  if (business) {
    const { data: settings } = await supabase
      .from("store_settings")
      .select("smso_config, smartbill_config, stripe_config, netopia_config, woot_config, colete_config, oblio_config, fgo_config, cargus_config, dpd_config, fan_courier_config, sameday_config, marketing_config")
      .eq("business_id", business.id)
      .single();
    smsoActive = (settings?.smso_config as SmsoConfig | null)?.enabled === true;
    smartbillActive = (settings?.smartbill_config as SmartbillConfig | null)?.enabled === true;
    const sc = settings?.stripe_config as StripeConfig | null;
    stripeActive = !!(sc?.enabled && sc?.charges_enabled);
    const nc = settings?.netopia_config as NetopiaConfig | null;
    netopiaActive = !!(nc?.enabled && nc?.pos_signature && (nc.sandbox ? (nc.sandbox_public_key && nc.sandbox_private_key) : (nc.live_public_key && nc.live_private_key)));
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
    marketingActive = !!mg?.facebook_pixel_id?.trim();
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
                const isUnlocked = integration.id === "smso" || integration.id === "smartbill" || integration.id === "stripe" || integration.id === "netopia" || integration.id === "woot" || integration.id === "colete" || integration.id === "oblio" || integration.id === "fgo" || integration.id === "cargus" || integration.id === "dpd" || integration.id === "fan-courier" || integration.id === "sameday" || integration.id === "marketing";
                const isActive = integration.id === "smso" ? smsoActive : integration.id === "smartbill" ? smartbillActive : integration.id === "stripe" ? stripeActive : integration.id === "netopia" ? netopiaActive : integration.id === "woot" ? wootActive : integration.id === "colete" ? coleteActive : integration.id === "oblio" ? oblioActive : integration.id === "fgo" ? fgoActive : integration.id === "cargus" ? cargusActive : integration.id === "dpd" ? dpdActive : integration.id === "fan-courier" ? fanCourierActive : integration.id === "sameday" ? samedayActive : integration.id === "marketing" ? marketingActive : false;
                const href = integration.id === "smso" ? "/dashboard/features/smso" : integration.id === "smartbill" ? "/dashboard/features/smartbill" : integration.id === "stripe" ? "/dashboard/features/stripe" : integration.id === "netopia" ? "/dashboard/features/netopia" : integration.id === "woot" ? "/dashboard/features/woot" : integration.id === "colete" ? "/dashboard/features/colete" : integration.id === "oblio" ? "/dashboard/features/oblio" : integration.id === "fgo" ? "/dashboard/features/fgo" : integration.id === "cargus" ? "/dashboard/features/cargus" : integration.id === "dpd" ? "/dashboard/features/dpd" : integration.id === "fan-courier" ? "/dashboard/features/fan-courier" : integration.id === "sameday" ? "/dashboard/features/sameday" : integration.id === "marketing" ? "/dashboard/features/marketing" : "#";

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
                        <p className="text-sm font-semibold text-foreground">{integration.name}</p>
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
