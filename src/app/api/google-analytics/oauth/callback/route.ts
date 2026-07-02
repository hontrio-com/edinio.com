import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyState, exchangeCode } from "@/lib/google-analytics/oauth";
import { listAccountSummaries, listDataStreams } from "@/lib/google-analytics/client";
import type { GoogleAnalyticsConfig } from "@/lib/google-analytics/types";

const FEATURE = "/dashboard/features/google-analytics";

function back(req: NextRequest, query: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return NextResponse.redirect(`${base.replace(/\/$/, "")}${FEATURE}?${query}`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("error") || !url.searchParams.get("code") || !url.searchParams.get("state")) {
    return back(req, "ga=error");
  }
  const businessId = verifyState(url.searchParams.get("state")!);
  if (!businessId) return back(req, "ga=error");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return back(req, "ga=error");
  const { data: biz } = await supabase
    .from("businesses").select("id, custom_domain").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return back(req, "ga=error");

  const tok = await exchangeCode(url.searchParams.get("code")!);
  if ("error" in tok) return back(req, "ga=error");
  if (!tok.refreshToken) return back(req, "ga=norefresh");

  const { data: ss } = await supabase
    .from("store_settings").select("id, google_analytics_config").eq("business_id", businessId).single();
  const config: GoogleAnalyticsConfig = (ss?.google_analytics_config as GoogleAnalyticsConfig) ?? {};
  config.refresh_token = tok.refreshToken;
  config.connected_email = tok.email ?? config.connected_email;

  // Discover accessible GA4 properties; auto-connect when there's exactly one.
  const sumRes = await listAccountSummaries(tok.accessToken);
  const flat: { id: string; name: string; account: string }[] = [];
  if (!("error" in sumRes)) {
    for (const acc of sumRes.data.accountSummaries ?? []) {
      for (const p of acc.propertySummaries ?? []) {
        const id = (p.property ?? "").split("/").pop() ?? "";
        if (id) flat.push({ id, name: p.displayName ?? "", account: acc.displayName ?? "" });
      }
    }
  }

  if (flat.length === 1) {
    const prop = flat[0];
    const streamsRes = await listDataStreams(tok.accessToken, prop.id);
    const webStreams = ("error" in streamsRes ? [] : streamsRes.data.dataStreams ?? []).filter(
      (s) => s.type === "WEB_DATA_STREAM" && s.webStreamData?.measurementId,
    );
    const domain = (biz.custom_domain as string | null)?.toLowerCase();
    const stream = webStreams.find((s) => !!(domain && (s.webStreamData?.defaultUri ?? "").toLowerCase().includes(domain))) ?? webStreams[0];

    config.connected = true;
    config.property_id = prop.id;
    config.property_name = prop.name;
    config.account_name = prop.account;
    config.measurement_id = stream?.webStreamData?.measurementId;
    config.stream_name = stream?.name;
    config.tracking_enabled = config.tracking_enabled ?? true;
    config.connected_at = config.connected_at ?? new Date().toISOString();
  }

  if (ss?.id) {
    await supabase.from("store_settings")
      .update({ google_analytics_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
  } else {
    await supabase.from("store_settings").insert({ business_id: businessId, google_analytics_config: config as never });
  }

  return back(req, config.connected ? "ga=connected" : "ga=choose");
}
