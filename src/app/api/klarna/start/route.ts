import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  createSession, createHppSession, klarnaReady, toKlarnaOrderInput, type KlarnaConfig,
} from "@/lib/klarna";

/**
 * Starts a Klarna payment: creates a payment session + a Hosted Payment Page for
 * the order and returns the redirect_url. The browser is then sent to Klarna,
 * which redirects back to /api/klarna/return on success.
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
    admin.from("store_settings").select("klarna_config, prices_include_vat").eq("business_id", businessId).single(),
    admin.from("businesses").select("slug").eq("id", businessId).single(),
  ]);

  if (!order || !business) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "paid") {
    return NextResponse.json({ error: "Comanda a fost deja platita" }, { status: 400 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "Comanda a fost anulata" }, { status: 400 });
  }

  const cfg = settings?.klarna_config as KlarnaConfig | null;
  if (!klarnaReady(cfg)) {
    return NextResponse.json({ error: "Klarna not configured for this business" }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";
  const slug = business.slug ?? "";
  const input = toKlarnaOrderInput(order, settings?.prices_include_vat ?? true);

  const session = await createSession(cfg!, input);
  if (!session.ok || !session.data?.session_id) {
    console.error("[klarna/start] create session failed:", { orderId, error: session.error });
    return NextResponse.json({ error: session.error || "Eroare la initierea platii Klarna." }, { status: 500 });
  }

  const q = `orderId=${encodeURIComponent(orderId)}&businessId=${encodeURIComponent(businessId)}`;
  const failUrl = `${baseUrl}/${slug}/confirm?status=esuat&orderId=${encodeURIComponent(orderId)}`;
  const hpp = await createHppSession(cfg!, session.data.session_id, {
    // Klarna fills {{authorization_token}} + {{session_id}} on the success URL.
    success: `${baseUrl}/api/klarna/return?${q}&authorization_token={{authorization_token}}&sid={{session_id}}`,
    cancel: `${baseUrl}/${slug}`,
    back: `${baseUrl}/${slug}`,
    failure: failUrl,
    error: failUrl,
    // Server-to-server safety net if the customer never returns to the success URL.
    status_update: `${baseUrl}/api/klarna/callback?${q}&sid={{session_id}}`,
  });

  if (!hpp.ok || !hpp.data?.redirect_url) {
    console.error("[klarna/start] create HPP failed:", { orderId, error: hpp.error });
    return NextResponse.json({ error: hpp.error || "Eroare la initierea platii Klarna." }, { status: 500 });
  }

  return NextResponse.json({ redirectUrl: hpp.data.redirect_url });
}
