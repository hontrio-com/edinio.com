import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  /*
   * Configul existent se citeste cu SERVICE ROLE, nu cu clientul utilizatorului.
   *
   * Vederea `store_settings` nu mai decripteaza pentru `authenticated`, deci de
   * acolo `api_secret` ar veni ca sir `enc.v1.…`. Cum obiectul citit se scrie
   * INAPOI intreg mai jos, declansatorul l-ar cripta a doua oara peste el insusi
   * si valoarea s-ar pierde definitiv. `refresh_token` se suprascrie oricum cu
   * tokenul proaspat, dar `api_secret` doar trece prin obiect.
   *
   * Service role ocoleste RLS, deci proprietatea magazinului TREBUIE verificata
   * separat — se face mai sus, pe clientul utilizatorului
   * (`businesses.id = businessId AND businesses.user_id = user.id`).
   */
  const admin = createAdminClient();
  const { data: ss } = await admin
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
    config.manual = undefined; // OAuth path replaces a previous manual (tracking-only) connect
    config.property_id = prop.id;
    config.property_name = prop.name;
    config.account_name = prop.account;
    config.measurement_id = stream?.webStreamData?.measurementId;
    config.stream_name = stream?.name;
    config.tracking_enabled = config.tracking_enabled ?? true;
    config.connected_at = config.connected_at ?? new Date().toISOString();
  }

  /*
   * ═══ ⚠ CODUL DE AUTORIZARE E DE UNICA FOLOSINTA (29.08.2026, seara) ═══
   *
   * Scrierea asta mergea oarba, iar omul era trimis inapoi cu „conectat". Numai ca `exchangeCode`
   * a consumat DEJA codul de la Google: nu se mai poate schimba a doua oara. Deci o pana de o
   * clipa la baza lasa starea cea mai proasta cu putinta:
   *
   *     tokenul e emis la ei, dar la noi nu scrie nimic
   *     ecranul spune „conectat", fiindca redirectarea nu s-a uitat la nimic
   *     comerciantul crede ca a terminat, si nimic nu merge
   *     iar reluarea cere alt cod, deci trebuie sa reia TOT dansul de autorizare
   *
   * ⚠ SI NU EXISTA NICIO PLASA. Nu se scrie nicaieri ce s-a pierdut, deci nici macar nu se poate
   * afla din jurnal ca tokenul acela exista la ei si nu la noi.
   *
   * ⚠ Deci se citeste raspunsul, si daca n-a intrat, omul afla ACUM — cat mai are rabdare sa apese
   * inca o data — nu peste doua zile, cand se intreaba de ce nu se sincronizeaza nimic.
   */
  const { error: eScris } = ss?.id
    ? await supabase.from("store_settings")
      .update({ google_analytics_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
    : await supabase.from("store_settings")
      .insert({ business_id: businessId, google_analytics_config: config as never });

  if (eScris) {
    console.error("[ga/oauth] conexiunea nu s-a putut salva:", eScris);
    return back(req, "ga=save_failed");
  }

  return back(req, config.connected ? "ga=connected" : "ga=choose");
}
