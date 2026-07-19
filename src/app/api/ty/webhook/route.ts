import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { verifyTrendyolWebhook } from "@/lib/trendyol/webhooks";
import { extractPackages, ingestPackage } from "@/lib/trendyol/orders";
import { loadTrendyolContext } from "@/lib/trendyol/sync";
import type { TrendyolConfig } from "@/lib/trendyol/types";

/**
 * Trendyol order webhook. Registered per merchant with `?businessId=…`. Trendyol
 * authenticates with the credentials we set at subscription time (API_KEY scheme):
 * the secret comes back in the `x-api-key` header, verified BEFORE any DB write.
 * The payload has the same shape as getShipmentPackages ({ content: [...] }); each
 * package is ingested idempotently. Always answers 200 (Trendyol retries every 5
 * min and auto-pauses on repeated failure; a poll is the fallback).
 *
 * NOTE: the path deliberately avoids the word "trendyol" — Trendyol rejects
 * webhook URLs containing "Trendyol", "Dolap" or "localhost".
 */
export async function POST(request: NextRequest) {
  const ok = () => NextResponse.json({ received: true });
  const businessId = request.nextUrl.searchParams.get("businessId");
  const rawBody = await request.text();
  if (!businessId) return ok();

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: settings } = await admin
    .from("store_settings").select("trendyol_config").eq("business_id", businessId).single();
  const cfg = settings?.trendyol_config as TrendyolConfig | null;
  if (!cfg?.webhook_secret) return ok();

  if (!verifyTrendyolWebhook(cfg.webhook_secret, request.headers.get("x-api-key"))) {
    console.error("[trendyol/webhook] invalid key", { businessId });
    return ok();
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return ok(); }
  const packages = extractPackages(payload);
  if (packages.length === 0) return ok();

  const ctx = await loadTrendyolContext(admin, businessId);
  if (!ctx) return ok();
  for (const pkg of packages) await ingestPackage(admin, ctx, pkg);
  return ok();
}
