import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { handleStockUpdated, readSignatureHeader, verifyAboutYouSignature } from "@/lib/aboutyou/webhooks";
import { extractOrderNumber, ingestOrderByNumber } from "@/lib/aboutyou/orders";
import type { AboutYouConfig } from "@/lib/aboutyou/types";

/**
 * About You signed webhook. Registered per merchant with `?businessId=…`, so we
 * load the right signing secret. The HMAC signature is verified over the exact raw
 * body BEFORE any DB write; unverified events are logged and ignored. Always
 * answers 200 so About You does not retry-storm (it retries hourly for up to 2
 * days). Order events are handled starting in Faza 3.
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
    .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single();
  const cfg = settings?.aboutyou_config as AboutYouConfig | null;
  if (!cfg?.webhook_secret) return ok();

  const valid = verifyAboutYouSignature(cfg.webhook_secret, readSignatureHeader(request.headers), rawBody);
  if (!valid) {
    console.error("[aboutyou/webhook] invalid signature", { businessId });
    return ok();
  }

  let event: { event?: string; type?: string; data?: unknown };
  try { event = JSON.parse(rawBody); } catch { return ok(); }
  const name = event.event ?? event.type;

  if (name === "stock.updated") {
    await handleStockUpdated(admin, businessId, event);
  } else if (name && name.startsWith("order") && cfg.api_key) {
    // order.* / order_items.* -> (re-)ingest the order by number (idempotent).
    const orderNumber = extractOrderNumber(event);
    if (orderNumber) {
      const ctx = { auth: { apiKey: cfg.api_key, environment: cfg.environment }, config: cfg, businessId };
      await ingestOrderByNumber(admin, ctx, orderNumber);
    }
  }

  return ok();
}
