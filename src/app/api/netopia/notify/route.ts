import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { decryptFromNetopia, parseIpnXml, type NetopiaConfig } from "@/lib/netopia";

function crcResponse(crc: string): Response {
  return new Response(`<?xml version="1.0" encoding="utf-8"?><crc>${crc}</crc>`, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return new Response("Missing orderId", { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: order } = await admin
    .from("orders")
    .select("id, business_id, status, payment_status")
    .eq("id", orderId)
    .single();

  if (!order) return new Response("Order not found", { status: 404 });

  const { data: settings } = await admin
    .from("store_settings")
    .select("netopia_config")
    .eq("business_id", order.business_id)
    .single();

  const config = settings?.netopia_config as NetopiaConfig | null;
  if (!config?.private_key) return new Response("Netopia not configured", { status: 400 });

  const formData = await request.formData();
  const envKey = formData.get("env_key") as string;
  const data = formData.get("data") as string;
  const iv = formData.get("iv") as string;

  if (!envKey || !data) return new Response("Missing IPN data", { status: 400 });

  let xml: string;
  try {
    xml = decryptFromNetopia(envKey, data, iv ?? "", config.private_key);
  } catch (err) {
    console.error("[netopia/notify] Decrypt failed:", err);
    return new Response("Decrypt error", { status: 500 });
  }

  const { crc, action, errorCode } = parseIpnXml(xml);

  let newStatus: string | undefined;
  let newPaymentStatus: string | undefined;

  if (action === "paid" || (action === "confirmed" && errorCode === "0")) {
    newStatus = "confirmed";
    newPaymentStatus = "paid";
  } else if (action === "canceled" || action === "rejected") {
    newStatus = "cancelled";
  } else if (action === "credit") {
    newPaymentStatus = "refunded";
  }

  if (newStatus || newPaymentStatus) {
    const update: Record<string, string> = { updated_at: new Date().toISOString() };
    if (newStatus) update.status = newStatus;
    if (newPaymentStatus) update.payment_status = newPaymentStatus;

    await admin.from("orders").update(update).eq("id", orderId);
  }

  return crcResponse(crc);
}
