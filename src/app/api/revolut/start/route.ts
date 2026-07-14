import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createOrder, revolutReady, toMinor, type RevolutConfig } from "@/lib/revolut";

/**
 * Starts a Revolut payment: creates a Merchant order (capture_mode=automatic) and
 * returns the hosted `checkout_url`. The browser is sent there; Revolut redirects
 * back to /api/revolut/return after payment, and a signed ORDER_COMPLETED webhook
 * is the server-to-server safety net.
 */
export async function POST(request: NextRequest) {
  const { orderId, businessId } = (await request.json()) as { orderId: string; businessId: string };
  if (!orderId || !businessId) {
    return NextResponse.json({ error: "Missing orderId or businessId" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [{ data: order }, { data: settings }, { data: business }] = await Promise.all([
    admin.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("revolut_config").eq("business_id", businessId).single(),
    admin.from("businesses").select("slug").eq("id", businessId).single(),
  ]);

  if (!order || !business) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "paid") {
    return NextResponse.json({ error: "Comanda a fost deja platita" }, { status: 400 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "Comanda a fost anulata" }, { status: 400 });
  }

  const cfg = settings?.revolut_config as RevolutConfig | null;
  if (!revolutReady(cfg)) {
    return NextResponse.json({ error: "Revolut not configured for this business" }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";
  const q = `orderId=${encodeURIComponent(orderId)}&businessId=${encodeURIComponent(businessId)}`;

  const created = await createOrder(cfg!, {
    amountMinor: toMinor(Number(order.total) || 0),
    extRef: order.id,
    redirectUrl: `${baseUrl}/api/revolut/return?${q}`,
    description: `Comanda ${order.order_number}`,
  });

  if (!created.ok || !created.data?.id || !created.data?.checkout_url) {
    console.error("[revolut/start] create order failed:", { orderId, error: created.error });
    return NextResponse.json({ error: created.error || "Eroare la initierea platii Revolut." }, { status: 500 });
  }

  // Persist the Revolut order id so the return + webhook can look this order up.
  await admin.from("orders").update({ revolut_order_id: created.data.id }).eq("id", order.id);

  return NextResponse.json({ redirectUrl: created.data.checkout_url });
}
