import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { OrdersClient } from "@/components/dashboard/OrdersClient";
import { ORDERS_PAGE_SIZE, firstParam, pageParam, orSafeTerm } from "@/lib/orders/pagination";
import { ORDER_STATUS } from "@/lib/orders/status";
import type { SmartbillConfig } from "@/lib/smartbill";
import type { WootConfig } from "@/lib/woot";
import type { COConfig } from "@/lib/colete";
import type { OblioConfig } from "@/lib/oblio";
import type { FgoConfig } from "@/lib/fgo";
import type { CargusConfig } from "@/lib/cargus";
import type { DpdConfig } from "@/lib/dpd";
import type { FanCourierConfig } from "@/lib/fancourier";
import type { SamedayConfig } from "@/lib/sameday";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const q = (firstParam(sp.q) ?? "").trim().slice(0, 80);
  const statusRaw = firstParam(sp.status) ?? "all";
  const status = statusRaw in ORDER_STATUS ? statusRaw : "all";
  const page = pageParam(sp.page);

  const { data: bizRow } = await supabase
    .from("businesses")
    .select("id, business_name, store_settings(smartbill_config, woot_config, colete_config, oblio_config, fgo_config, cargus_config, dpd_config, fan_courier_config, sameday_config)")
    .eq("user_id", user.id)
    .eq("type", "ministore")
    .limit(1)
    .single();

  if (!bizRow) redirect("/dashboard");
  const business = { id: bizRow.id, business_name: bizRow.business_name };
  const settings = Array.isArray(bizRow.store_settings) ? bizRow.store_settings[0] ?? null : bizRow.store_settings ?? null;

  // Paginare/cautare/filtrare in SQL: aducem DOAR pagina curenta de comenzi,
  // niciodata tot istoricul (PostgREST trunchiaza silentios la 1000 de
  // randuri, iar la volum mare payload-ul ar fi oricum inutilizabil).
  let listQuery = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .eq("business_id", business.id);
  if (status !== "all") listQuery = listQuery.eq("status", status);
  const term = orSafeTerm(q);
  if (term) {
    listQuery = listQuery.or(
      `order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`
    );
  }
  const fromIdx = (page - 1) * ORDERS_PAGE_SIZE;

  const [{ data: orders, count: totalCount }, { data: statusRows }] = await Promise.all([
    listQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(fromIdx, fromIdx + ORDERS_PAGE_SIZE - 1),
    supabase.rpc("orders_status_counts", { bid: business.id }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const r of statusRows ?? []) statusCounts[r.status] = Number(r.cnt);
  const pendingCount = statusCounts.pending ?? 0;

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
  const fg = settings?.fan_courier_config as FanCourierConfig | null;
  const fanCourierEnabled = !!(fg?.enabled && fg?.username && fg?.client_id);
  const sg = settings?.sameday_config as SamedayConfig | null;
  const samedayEnabled = !!(sg?.enabled && sg?.username && sg?.pickup_point_id);

  return (
    <div className="p-6">
      <OrdersClient orders={orders ?? []} totalCount={totalCount ?? 0} statusCounts={statusCounts} page={page} searchQuery={q} statusFilter={status} pendingCount={pendingCount} smartbillEnabled={smartbillEnabled} wootEnabled={wootEnabled} coleteEnabled={coleteEnabled} oblioEnabled={oblioEnabled} fgoEnabled={fgoEnabled} cargusEnabled={cargusEnabled} dpdEnabled={dpdEnabled} fanCourierEnabled={fanCourierEnabled} samedayEnabled={samedayEnabled} businessId={business.id} fanPickup={{ lastDate: fg?.last_pickup_date ?? null, lastId: fg?.last_pickup_id ?? null }} />
    </div>
  );
}
