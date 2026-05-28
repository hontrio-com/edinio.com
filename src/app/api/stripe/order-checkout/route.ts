import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const { orderId, businessId } = await request.json() as { orderId: string; businessId: string };

  if (!orderId || !businessId) {
    return NextResponse.json({ error: "Missing orderId or businessId" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const [{ data: order }, { data: settings }, { data: business }] = await Promise.all([
    admin.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("stripe_config").eq("business_id", businessId).single(),
    admin.from("businesses").select("slug, store_name, business_name").eq("id", businessId).single(),
  ]);

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Prevent duplicate checkout for already-paid or cancelled orders
  if (order.payment_status === "paid") {
    return NextResponse.json({ error: "Comanda a fost deja platita" }, { status: 400 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "Comanda a fost anulata" }, { status: 400 });
  }

  const stripeConfig = settings?.stripe_config as { account_id?: string; enabled?: boolean } | null;
  if (!stripeConfig?.account_id || !stripeConfig.enabled) {
    return NextResponse.json({ error: "Stripe not connected for this business" }, { status: 400 });
  }

  const slug = business?.slug ?? "";
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  const session = await stripe.checkout.sessions.create(
    {
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "ron",
            product_data: { name: `Comanda ${order.order_number}` },
            unit_amount: Math.round(Number(order.total) * 100),
          },
          quantity: 1,
        },
      ],
      customer_email: order.customer_email ?? undefined,
      success_url: `${origin}/${slug}/confirm?orderId=${orderId}&name=${encodeURIComponent(order.customer_name)}&total=${order.total}`,
      cancel_url: `${origin}/${slug}`,
      metadata: { orderId, businessId },
    },
    { stripeAccount: stripeConfig.account_id }
  );

  await admin
    .from("orders")
    .update({ stripe_session_id: session.id })
    .eq("id", orderId);

  return NextResponse.json({ url: session.url });
}
