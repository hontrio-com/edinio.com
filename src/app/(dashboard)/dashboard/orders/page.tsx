import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrdersClient } from "@/components/dashboard/OrdersClient";
import type { SmartbillConfig } from "@/lib/smartbill";
import type { WootConfig } from "@/lib/woot";
import type { COConfig } from "@/lib/colete";
import type { OblioConfig } from "@/lib/oblio";
import type { FgoConfig } from "@/lib/fgo";
import type { CargusConfig } from "@/lib/cargus";
import type { DpdConfig } from "@/lib/dpd";

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id, business_name")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();

  if (!business) redirect("/dashboard");

  const [{ data: orders }, { count: pendingCount }, { data: settings }] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "pending"),
    supabase
      .from("store_settings")
      .select("smartbill_config, woot_config, colete_config, oblio_config, fgo_config, cargus_config, dpd_config")
      .eq("business_id", business.id)
      .single(),
  ]);

  const smartbillEnabled =
    (settings?.smartbill_config as SmartbillConfig | null)?.enabled === true;
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <OrdersClient orders={orders ?? []} pendingCount={pendingCount ?? 0} smartbillEnabled={smartbillEnabled} wootEnabled={wootEnabled} coleteEnabled={coleteEnabled} oblioEnabled={oblioEnabled} fgoEnabled={fgoEnabled} cargusEnabled={cargusEnabled} dpdEnabled={dpdEnabled} businessId={business.id} />
    </div>
  );
}
