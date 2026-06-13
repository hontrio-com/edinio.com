import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  ipayRegister, ipayReady, toBani, buildOrderBundle, ipayOrderNumber, type IPayConfig,
} from "@/lib/ipay";

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

  const [{ data: order }, { data: settings }] = await Promise.all([
    admin.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("ipay_config").eq("business_id", businessId).single(),
  ]);

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "paid") {
    return NextResponse.json({ error: "Comanda a fost deja platita" }, { status: 400 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "Comanda a fost anulata" }, { status: 400 });
  }

  const cfg = settings?.ipay_config as IPayConfig | null;
  if (!ipayReady(cfg)) {
    return NextResponse.json({ error: "iPay not configured for this business" }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";
  const orderNumber = ipayOrderNumber(order.order_number as string);
  const returnUrl = `${baseUrl}/api/ipay/return?orderId=${encodeURIComponent(orderId)}&businessId=${encodeURIComponent(businessId)}`;

  const addr = (order.shipping_address ?? {}) as { address?: string; city?: string; county?: string };
  const email = (order.customer_email as string | null) ?? undefined;
  const phone = (order.customer_phone as string | null) ?? "";
  // orderBundle is only sent when we have complete, real customer data (per iPay docs).
  const orderBundle = email && phone && addr.city && addr.address
    ? buildOrderBundle({ email, phone, city: addr.city, address: addr.address })
    : undefined;

  const result = await ipayRegister(cfg!, {
    orderNumber,
    amountBani: toBani(Number(order.total)),
    returnUrl,
    description: `Comanda ${order.order_number}`,
    email,
    orderBundle,
  });

  if (!result.formUrl || !result.orderId) {
    console.error("[ipay/start] register failed:", { orderId, errorCode: result.errorCode, errorMessage: result.errorMessage });
    return NextResponse.json({ error: result.errorMessage || "Eroare la initierea platii iPay." }, { status: 500 });
  }

  // Persist the iPay order id for this attempt so the return route + cron can poll it.
  await admin.from("orders").update({ ipay_order_id: result.orderId }).eq("id", orderId);

  return NextResponse.json({ redirectUrl: result.formUrl });
}
