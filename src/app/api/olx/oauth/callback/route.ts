import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyState, exchangeCode } from "@/lib/olx/oauth";
import { getMe, isOlxError } from "@/lib/olx/client";
import type { OlxConfig } from "@/lib/olx/types";

const FEATURE = "/dashboard/features/olx";

function back(req: NextRequest, query: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return NextResponse.redirect(`${base.replace(/\/$/, "")}${FEATURE}?${query}`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("error") || !url.searchParams.get("code") || !url.searchParams.get("state")) {
    return back(req, "olx=error");
  }
  const businessId = verifyState(url.searchParams.get("state")!);
  if (!businessId) return back(req, "olx=error");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return back(req, "olx=error");
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return back(req, "olx=error");

  const tok = await exchangeCode(url.searchParams.get("code")!);
  if ("error" in tok) return back(req, "olx=error");
  if (!tok.refreshToken) return back(req, "olx=norefresh");

  /*
   * Configul existent se citeste cu SERVICE ROLE, nu cu clientul utilizatorului.
   *
   * Vederea `store_settings` nu mai decripteaza pentru `authenticated`, iar
   * obiectul citit aici se scrie INAPOI intreg mai jos. Un `access_token` sau un
   * `refresh_token` venit ca sir `enc.v1.…` ar fi criptat de declansator inca o
   * data peste el insusi, si nu s-ar mai putea desface — magazinul ar ramane
   * fara conexiunea OLX, fara nicio eroare.
   *
   * Service role ocoleste RLS, deci proprietatea magazinului TREBUIE verificata
   * separat — se face mai sus, pe clientul utilizatorului
   * (`businesses.id = businessId AND businesses.user_id = user.id`).
   */
  const admin = createAdminClient();
  const { data: ss } = await admin
    .from("store_settings").select("id, olx_config").eq("business_id", businessId).single();
  const config: OlxConfig = (ss?.olx_config as OlxConfig) ?? {};
  config.connected = true;
  config.access_token = tok.accessToken;
  config.access_token_expires_at = tok.expiresAt;
  config.refresh_token = tok.refreshToken;
  config.token_updated_at = new Date().toISOString();
  config.needs_reconnect = false;
  if (config.auto_sync === undefined) config.auto_sync = true;

  // Identify the connected OLX user (for display + advertiser_type default).
  const me = await getMe(tok.accessToken);
  if (!isOlxError(me)) {
    config.olx_user_id = me.data.id;
    config.olx_user_name = me.data.name;
  }

  if (ss?.id) {
    await supabase.from("store_settings")
      .update({ olx_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
  } else {
    await supabase.from("store_settings").insert({ business_id: businessId, olx_config: config as never });
  }

  return back(req, "olx=connected");
}
