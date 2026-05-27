import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  buildPaymentXml,
  encryptForNetopia,
  NETOPIA_SANDBOX_URL,
  NETOPIA_PRODUCTION_URL,
  type NetopiaConfig,
} from "@/lib/netopia";

export async function POST(request: NextRequest) {
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

  const config = settings?.netopia_config as NetopiaConfig | null;
  if (!config?.enabled || !config.pos_signature || !config.public_key) {
    return NextResponse.json({ error: "Netopia not configured" }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";
  const slug = business?.slug ?? "";

  const nameParts = (order.customer_name as string).split(" ");
  const firstName = nameParts[0] ?? "-";
  const lastName = nameParts.slice(1).join(" ") || "-";

  const addr = order.shipping_address as { address?: string; city?: string; county?: string };
  const addressStr = [addr.address, addr.city, addr.county].filter(Boolean).join(", ") || "-";

  const confirmUrl = `${baseUrl}/api/netopia/notify?orderId=${encodeURIComponent(orderId)}`;
  const returnUrl = `${baseUrl}/${slug}/confirm?orderId=${encodeURIComponent(orderId)}&name=${encodeURIComponent(order.customer_name as string)}&total=${order.total}`;

  const xml = buildPaymentXml({
    orderId,
    posSignature: config.pos_signature,
    amount: Number(order.total),
    currency: "RON",
    description: `Comanda ${order.order_number as string}`,
    firstName,
    lastName,
    email: (order.customer_email as string) || "client@edinio.com",
    phone: order.customer_phone as string,
    address: addressStr,
    confirmUrl,
    returnUrl,
  });

  try {
    const { envKey, data, iv } = encryptForNetopia(xml, config.public_key);
    const netopiaUrl = config.sandbox ? NETOPIA_SANDBOX_URL : NETOPIA_PRODUCTION_URL;
    return NextResponse.json({ envKey, data, iv, url: netopiaUrl });
  } catch (err) {
    console.error("[netopia/start] Encryption failed:", err);
    return NextResponse.json({ error: "Eroare la criptarea datelor. Verifica cheia publica." }, { status: 500 });
  }
}
