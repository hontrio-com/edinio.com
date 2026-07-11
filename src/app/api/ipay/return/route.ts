import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { maybeMarkMailchimpOrderPaid } from "@/lib/mailchimp-sync";
import { maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";
import {
  ipayGetOrderStatus, resolveIpayStatus, ipayActionMessage, ipayReady, toBani, IPAY_CURRENCY, type IPayConfig,
} from "@/lib/ipay";

/**
 * Browser return target after the iPay hosted page. iPay has no server-to-server
 * webhook, so this route is where the payment result is read (with the merchant's
 * credentials, server-side) and the order is finalized. The reconciliation cron
 * covers the case where the customer never returns.
 */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const sp = request.nextUrl.searchParams;
  const orderId = sp.get("orderId");
  const businessId = sp.get("businessId");

  const fail = (slug: string, motiv: string, oid?: string) =>
    NextResponse.redirect(new URL(`/${slug}/confirm?status=esuat&motiv=${encodeURIComponent(motiv)}${oid ? `&orderId=${oid}` : ""}`, baseUrl));

  if (!orderId || !businessId) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [{ data: order }, { data: settings }, { data: business }] = await Promise.all([
    admin.from("orders").select("id, business_id, total, customer_name, payment_status, status, ipay_order_id").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("ipay_config").eq("business_id", businessId).single(),
    admin.from("businesses").select("slug").eq("id", businessId).single(),
  ]);

  const slug = business?.slug ?? "";
  if (!order || !business) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  const successUrl = new URL(`/${slug}/confirm?orderId=${order.id}&name=${encodeURIComponent(order.customer_name as string)}&total=${order.total}`, baseUrl);

  // Already finalized (e.g. cron got here first) — just show the confirmation.
  if (order.payment_status === "paid") {
    return NextResponse.redirect(successUrl);
  }

  const cfg = settings?.ipay_config as IPayConfig | null;
  if (!ipayReady(cfg) || !order.ipay_order_id) {
    return fail(slug, "Nu am putut verifica plata. Te rugam contacteaza magazinul.", order.id);
  }

  const status = await ipayGetOrderStatus(cfg!, { orderId: order.ipay_order_id });
  const resolved = resolveIpayStatus(status.orderStatus);

  if (resolved.paid) {
    // Verify the amount/currency reported by iPay matches the order before marking paid.
    const expected = toBani(Number(order.total));
    const amountOk = status.amount === expected;
    const currencyOk = !status.currency || status.currency === IPAY_CURRENCY.RON;
    if (amountOk && currencyOk) {
      await admin.from("orders")
        .update({ payment_status: "paid", status: "confirmed", updated_at: new Date().toISOString() })
        .eq("id", order.id)
        .neq("payment_status", "paid");
      void maybeMarkMailchimpOrderPaid(order.id);
      void maybeMarkBrevoOrderPaid(order.id);
      return NextResponse.redirect(successUrl);
    }
    console.error("[ipay/return] amount/currency mismatch:", { orderId: order.id, expected, got: status.amount, currency: status.currency });
    return fail(slug, "Suma platii nu corespunde comenzii. Te rugam contacteaza magazinul.", order.id);
  }

  // Declined / failed / still pending — leave the order pending and show the reason.
  return fail(slug, ipayActionMessage(status.actionCode), order.id);
}
