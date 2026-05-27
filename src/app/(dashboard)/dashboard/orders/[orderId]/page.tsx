import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { OrderDetailClient } from "@/components/dashboard/OrderDetailClient";
import type { SmartbillConfig } from "@/lib/smartbill";

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
    .select("smartbill_config")
    .eq("business_id", biz.id)
    .single();

  const sbConfig = settings?.smartbill_config as SmartbillConfig | null;
  const smartbillEnabled = sbConfig?.enabled === true;
  const hasEstimateSeries = !!(sbConfig?.estimate_series_name);

  return (
    <OrderDetailClient
      order={order}
      businessId={biz.id}
      smartbillEnabled={smartbillEnabled}
      hasEstimateSeries={hasEstimateSeries}
    />
  );
}
