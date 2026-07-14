import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { verifyWebhookSignature, type RevolutConfig } from "@/lib/revolut";
import { finalizeRevolutOrder } from "@/lib/revolut-finalize";

/**
 * Revolut Merchant signed webhook (`ORDER_COMPLETED`). Registered per merchant with
 * `?businessId=…`, so we load the right signing secret. The HMAC-SHA256 signature is
 * verified over the exact raw body BEFORE any DB write; then we finalize the order
 * idempotently. Always answers 200 so Revolut does not retry-storm (it retries 3×
 * on error); the browser return route is the primary path.
 */
export async function POST(request: NextRequest) {
  const ok = () => NextResponse.json({ received: true });
  const businessId = request.nextUrl.searchParams.get("businessId");
  const rawBody = await request.text();
  if (!businessId) return ok();

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: settings } = await admin
    .from("store_settings")
    .select("revolut_config")
    .eq("business_id", businessId)
    .single();
  const cfg = settings?.revolut_config as RevolutConfig | null;
  if (!cfg?.signing_secret) return ok();

  // Verify the signature over the exact raw body before trusting anything.
  const valid = verifyWebhookSignature(
    cfg.signing_secret,
    request.headers.get("revolut-signature"),
    request.headers.get("revolut-request-timestamp"),
    rawBody,
  );
  if (!valid) {
    console.error("[revolut/webhook] invalid signature", { businessId });
    return ok();
  }

  let event: { event?: string; order_id?: string; merchant_order_ext_ref?: string };
  try { event = JSON.parse(rawBody); } catch { return ok(); }
  if (event.event !== "ORDER_COMPLETED" || !event.order_id) return ok();

  // Find our order: prefer the stored revolut_order_id, fall back to ext_ref (our id).
  type OrderRow = { id: string; total: number; payment_status: string | null };
  let order: OrderRow | null = null;

  const byRevolut = await admin
    .from("orders")
    .select("id, total, payment_status")
    .eq("business_id", businessId)
    .eq("revolut_order_id", event.order_id)
    .maybeSingle();
  order = (byRevolut.data as OrderRow | null) ?? null;

  if (!order && event.merchant_order_ext_ref) {
    const byExt = await admin
      .from("orders")
      .select("id, total, payment_status")
      .eq("business_id", businessId)
      .eq("id", event.merchant_order_ext_ref)
      .maybeSingle();
    order = (byExt.data as OrderRow | null) ?? null;
  }

  if (!order || order.payment_status === "paid") return ok();

  await finalizeRevolutOrder(admin, cfg, { id: order.id, total: Number(order.total) || 0 }, event.order_id);
  return ok();
}
