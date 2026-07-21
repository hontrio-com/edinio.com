import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getAccessToken } from "@/lib/google-merchant/oauth";
import { getProduct, mapProductStatus } from "@/lib/google-merchant/client";
import { DEFAULT_CONTENT_LANGUAGE, DEFAULT_FEED_LABEL, type GoogleMerchantConfig } from "@/lib/google-merchant/types";

// Receives Merchant API PRODUCT_STATUS_CHANGE notifications. We always ack (2xx)
// so Google doesn't retry forever, then refresh the affected product's status.
export async function POST(req: NextRequest) {
  // Optional shared-secret check: when GMC_WEBHOOK_SECRET is set, the notification
  // subscription registers a callback URL carrying ?token=<secret>, so forged POSTs
  // (which can't know the secret) are acked-and-ignored. Left open when the secret
  // is unset, for backward compatibility with older subscriptions.
  const secret = process.env.GMC_WEBHOOK_SECRET;
  if (secret && req.nextUrl.searchParams.get("token") !== secret) {
    return NextResponse.json({ ok: true });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  // Pub/Sub-style envelope: { message: { data: base64 } }
  const envelope = body as { message?: { data?: string } };
  if (envelope.message?.data) {
    try { body = JSON.parse(Buffer.from(envelope.message.data, "base64").toString("utf8")); } catch { /* keep body */ }
  }

  const accountRaw = String((body.account ?? body.managingAccount ?? "") as string);
  const accountId = accountRaw.split("/").pop() || accountRaw;
  const resource = String((body.resource ?? body.name ?? body.product ?? "") as string);
  const offerId = resource.includes("~") ? resource.split("~").pop() ?? null : null;
  if (!accountId) return NextResponse.json({ ok: true });

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: ss } = await admin
    .from("store_settings")
    .select("business_id, google_merchant_config")
    .eq("google_merchant_config->>account_id", accountId)
    .limit(1)
    .maybeSingle();
  if (!ss) return NextResponse.json({ ok: true });

  const businessId = ss.business_id;
  const config = (ss.google_merchant_config as GoogleMerchantConfig) ?? {};
  const now = new Date().toISOString();

  if (offerId && config.refresh_token && config.account_id) {
    const token = await getAccessToken(config.refresh_token);
    if (token) {
      const res = await getProduct(token, config.account_id, config.content_language || DEFAULT_CONTENT_LANGUAGE, config.feed_label || DEFAULT_FEED_LABEL, offerId);
      if (!("error" in res)) {
        const { status, issues, destinations } = mapProductStatus(res.data);
        await admin.from("gmc_products")
          .update({ status, issues: issues as never, destinations: destinations as never, last_status_at: now, updated_at: now })
          .eq("business_id", businessId).eq("offer_id", offerId);
        return NextResponse.json({ ok: true });
      }
    }
  }

  // Couldn't pinpoint/refresh — force a re-check on the next cron pass.
  await admin.from("gmc_products").update({ last_status_at: null }).eq("business_id", businessId);
  return NextResponse.json({ ok: true });
}
