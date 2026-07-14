import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { klarnaReady, toKlarnaOrderInput, type KlarnaConfig } from "@/lib/klarna";
import { finalizeKlarnaOrder } from "@/lib/klarna-finalize";

/**
 * Browser return target after the Klarna hosted page. Klarna appends the
 * authorization_token; here we place the order and capture it (server-side, with
 * the merchant's credentials). The /api/klarna/callback route is the safety net
 * for customers who never return.
 */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const sp = request.nextUrl.searchParams;
  const orderId = sp.get("orderId");
  const businessId = sp.get("businessId");
  const authToken = sp.get("authorization_token");

  if (!orderId || !businessId) {
    return NextResponse.redirect(new URL("/", baseUrl));
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

  const slug = business?.slug ?? "";
  if (!order || !business) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  const successUrl = new URL(`/${slug}/confirm?orderId=${order.id}&name=${encodeURIComponent(order.customer_name as string)}&total=${order.total}`, baseUrl);
  const fail = (motiv: string) =>
    NextResponse.redirect(new URL(`/${slug}/confirm?status=esuat&motiv=${encodeURIComponent(motiv)}&orderId=${order.id}`, baseUrl));

  // Already finalized (e.g. the callback got here first) — just show confirmation.
  if (order.payment_status === "paid") {
    return NextResponse.redirect(successUrl);
  }

  const cfg = settings?.klarna_config as KlarnaConfig | null;
  if (!klarnaReady(cfg)) {
    return fail("Nu am putut verifica plata. Te rugam contacteaza magazinul.");
  }
  if (!authToken) {
    return fail("Autorizarea Klarna lipseste. Te rugam reincearca.");
  }

  const input = toKlarnaOrderInput(order, settings?.prices_include_vat ?? true);
  const result = await finalizeKlarnaOrder(admin, cfg!, input, authToken, successUrl.toString());

  // "pending" = Klarna is reviewing the purchase; the order is placed. Both paid
  // and pending land on the confirmation page.
  if (result.status === "paid" || result.status === "pending") {
    return NextResponse.redirect(successUrl);
  }
  return fail(result.error);
}
