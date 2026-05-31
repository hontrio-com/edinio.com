import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { OrderDetailClient } from "@/components/dashboard/OrderDetailClient";
import type { SmartbillConfig } from "@/lib/smartbill";
import type { WootConfig } from "@/lib/woot";
import type { COConfig } from "@/lib/colete";
import type { OblioConfig } from "@/lib/oblio";
import type { FgoConfig } from "@/lib/fgo";
import type { CargusConfig } from "@/lib/cargus";
import type { DpdConfig } from "@/lib/dpd";
import type { FanCourierConfig } from "@/lib/fancourier";
import type { SamedayConfig } from "@/lib/sameday";

interface Props {
  params: Promise<{ orderId: string }>;
}

export default async function OrderDetailPage({ params }: Props) {
  const { orderId } = await params;
  const supabase = await createClient();

  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) notFound();

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", order.business_id)
    .eq("user_id", user.id)
    .single();

  if (!biz) notFound();

  const { data: settings } = await supabase
    .from("store_settings")
    .select("smartbill_config, woot_config, colete_config, oblio_config, fgo_config, cargus_config, dpd_config, fan_courier_config, sameday_config")
    .eq("business_id", biz.id)
    .single();

  const sbConfig = settings?.smartbill_config as SmartbillConfig | null;
  const smartbillEnabled = sbConfig?.enabled === true;
  const hasEstimateSeries = !!(sbConfig?.estimate_series_name);

  const wc = settings?.woot_config as WootConfig | null;
  const wootEnabled = !!(wc?.enabled && wc?.public_key && wc?.secret_key);
  const cc = settings?.colete_config as COConfig | null;
  const coleteEnabled = !!(cc?.enabled && cc?.client_id && cc?.client_secret);
  const oc = settings?.oblio_config as OblioConfig | null;
  const oblioEnabled = !!(oc?.enabled && oc?.client_id && oc?.cif && oc?.series_invoice);
  const fc = settings?.fgo_config as FgoConfig | null;
  const fgoEnabled = !!(fc?.enabled && fc?.cod_unic && fc?.private_key && fc?.serie);
  const cg = settings?.cargus_config as CargusConfig | null;
  const cargusEnabled = !!(cg?.enabled && cg?.username && cg?.subscription_key && cg?.location_id);
  const dg = settings?.dpd_config as DpdConfig | null;
  const dpdEnabled = !!(dg?.enabled && dg?.username && dg?.client_id);
  const fg = settings?.fan_courier_config as FanCourierConfig | null;
  const fanCourierEnabled = !!(fg?.enabled && fg?.username && fg?.client_id);
  const sg = settings?.sameday_config as SamedayConfig | null;
  const samedayEnabled = !!(sg?.enabled && sg?.username && sg?.pickup_point_id);

  return (
    <OrderDetailClient
      order={order}
      businessId={biz.id}
      smartbillEnabled={smartbillEnabled}
      hasEstimateSeries={hasEstimateSeries}
      wootEnabled={wootEnabled}
      coleteEnabled={coleteEnabled}
      oblioEnabled={oblioEnabled}
      fgoEnabled={fgoEnabled}
      cargusEnabled={cargusEnabled}
      dpdEnabled={dpdEnabled}
      fanCourierEnabled={fanCourierEnabled}
      samedayEnabled={samedayEnabled}
    />
  );
}
