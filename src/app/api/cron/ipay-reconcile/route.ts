import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ipayGetOrderStatus, resolveIpayStatus, ipayReady, toBani, IPAY_CURRENCY, type IPayConfig } from "@/lib/ipay";
import { maybeMarkMailchimpOrderPaid } from "@/lib/mailchimp-sync";
import { maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";

// iPay has no webhook — this reconciles orders where the customer paid but never
// returned to the finish route (closed tab). It polls getOrderStatusExtended for
// recent pending iPay orders and marks the paid ones.
function verifyCron(req: NextRequest): boolean {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Pages expire well within a few days; only reconcile recent pending iPay orders.
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data: orders } = await admin
    .from("orders")
    .select("id, business_id, total, ipay_order_id")
    .eq("payment_status", "unpaid")
    .eq("status", "pending")
    .not("ipay_order_id", "is", null)
    .gte("created_at", since)
    .limit(500);

  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, paid: 0 });
  }

  const bizIds = [...new Set(orders.map((o) => o.business_id))];
  const { data: settingsRows } = await admin
    .from("store_settings")
    .select("business_id, ipay_config")
    .in("business_id", bizIds);
  const cfgMap = new Map((settingsRows ?? []).map((r) => [r.business_id, r.ipay_config as IPayConfig | null]));

  let checked = 0;
  let paid = 0;

  for (const o of orders) {
    const cfg = cfgMap.get(o.business_id);
    if (!ipayReady(cfg) || !o.ipay_order_id) continue;
    checked++;
    try {
      const status = await ipayGetOrderStatus(cfg!, { orderId: o.ipay_order_id });
      const resolved = resolveIpayStatus(status.orderStatus);
      const amountOk = status.amount === toBani(Number(o.total));
      const currencyOk = !status.currency || status.currency === IPAY_CURRENCY.RON;
      if (resolved.paid && amountOk && currencyOk) {
        const { error } = await admin
          .from("orders")
          .update({ payment_status: "paid", status: "confirmed", updated_at: new Date().toISOString() })
          .eq("id", o.id)
          .neq("payment_status", "paid");
        if (!error) { paid++; void maybeMarkMailchimpOrderPaid(o.id); void maybeMarkBrevoOrderPaid(o.id); }
      }
    } catch (e) {
      console.error("[ipay-reconcile] poll failed for order", o.id, e);
    }
  }

  console.log(`[ipay-reconcile] checked ${checked}, marked paid ${paid}`);
  return NextResponse.json({ ok: true, checked, paid });
}
