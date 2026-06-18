import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { startNetopiaPayment, type NetopiaConfig } from "@/lib/netopia";
import { signNetopiaIpn } from "@/lib/netopia-ipn";

export async function POST(request: NextRequest) {
  try {
    const { orderId, businessId } = (await request.json()) as { orderId: string; businessId: string };
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
      admin.from("store_settings").select("netopia_config").eq("business_id", businessId).single(),
      admin.from("businesses").select("slug").eq("id", businessId).single(),
    ]);

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (order.payment_status === "paid") {
      return NextResponse.json({ error: "Comanda a fost deja platita" }, { status: 400 });
    }
    if (order.status === "cancelled") {
      return NextResponse.json({ error: "Comanda a fost anulata" }, { status: 400 });
    }

    const config = settings?.netopia_config as NetopiaConfig | null;
    if (!config?.enabled || !config.pos_signature || !config.api_key) {
      return NextResponse.json({ error: "Netopia not configured" }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";
    const slug = business?.slug ?? "";

    const customerName = ((order.customer_name as string | null) ?? "Client").trim() || "Client";
    const nameParts = customerName.split(/\s+/);
    const firstName = nameParts[0] || "-";
    const lastName = nameParts.slice(1).join(" ") || "-";

    const addr = (order.shipping_address as { address?: string; city?: string; county?: string } | null) ?? {};

    const notifyUrl = `${baseUrl}/api/netopia/notify?t=${signNetopiaIpn(orderId)}`;
    const redirectUrl = `${baseUrl}/${slug}/confirm?orderId=${encodeURIComponent(orderId)}&name=${encodeURIComponent(customerName)}&total=${order.total}`;

    const result = await startNetopiaPayment(
      {
        orderId,
        posSignature: config.pos_signature,
        amount: Number(order.total),
        currency: "RON",
        description: `Comanda ${order.order_number as string}`,
        firstName,
        lastName,
        email: (order.customer_email as string) || "client@edinio.com",
        phone: (order.customer_phone as string) || "-",
        address: addr.address || "-",
        city: addr.city || "-",
        county: addr.county || "-",
        notifyUrl,
        redirectUrl,
      },
      config.api_key,
      config.sandbox
    );

    if (result.error) {
      console.error("[netopia/start] Payment start failed:", result.error);
      // 502: upstream (Netopia) refused/failed — distinct from our own 500 below.
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ redirectUrl: result.redirectUrl });
  } catch (err) {
    console.error("[netopia/start] Unhandled error:", err);
    return NextResponse.json(
      { error: "Eroare interna la initierea platii cu cardul." },
      { status: 500 }
    );
  }
}
