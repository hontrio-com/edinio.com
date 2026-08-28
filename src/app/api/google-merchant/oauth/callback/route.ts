import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyState, exchangeCode, hasContentScope } from "@/lib/google-merchant/oauth";
import { listAccounts, registerGcp, listDataSources, createApiDataSource, createNotificationSubscription } from "@/lib/google-merchant/client";
import { DEFAULT_FEED_LABEL, DEFAULT_CONTENT_LANGUAGE, DEFAULT_COUNTRY, type GoogleMerchantConfig } from "@/lib/google-merchant/types";
import { PLATFORM_ORIGIN } from "@/lib/seo";

const FEATURE = "/dashboard/features/google-merchant";

function back(req: NextRequest, query: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  return NextResponse.redirect(`${base.replace(/\/$/, "")}${FEATURE}?${query}`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("error") || !url.searchParams.get("code") || !url.searchParams.get("state")) {
    return back(req, "gmc=error");
  }
  const businessId = verifyState(url.searchParams.get("state")!);
  if (!businessId) return back(req, "gmc=error");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return back(req, "gmc=error");
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return back(req, "gmc=error");

  const tok = await exchangeCode(url.searchParams.get("code")!);
  if ("error" in tok) return back(req, "gmc=error");
  if (!tok.refreshToken) return back(req, "gmc=norefresh");
  // Without the `content` scope the token is useless for the Merchant API (every
  // call 403s with "insufficient authentication scopes"). Don't store it — send
  // the user back to reconnect and keep the Shopping permission ticked.
  if (!hasContentScope(tok.scope)) return back(req, "gmc=noscope");

  /*
   * Configul existent se citeste cu SERVICE ROLE, nu cu clientul utilizatorului.
   *
   * Vederea `store_settings` nu mai decripteaza pentru `authenticated`, iar
   * obiectul citit aici se scrie INAPOI intreg mai jos. Orice camp secret venit
   * ca sir `enc.v1.…` ar fi criptat de declansator inca o data peste el insusi,
   * si nu s-ar mai putea desface. Azi singurul secret al coloanei
   * (`refresh_token`) se suprascrie oricum, dar regula tine si pentru campurile
   * care se adauga maine.
   *
   * Service role ocoleste RLS, deci proprietatea magazinului TREBUIE verificata
   * separat — se face mai sus, pe clientul utilizatorului
   * (`businesses.id = businessId AND businesses.user_id = user.id`).
   */
  const admin = createAdminClient();
  const { data: ss } = await admin
    .from("store_settings").select("id, google_merchant_config").eq("business_id", businessId).single();
  const config: GoogleMerchantConfig = (ss?.google_merchant_config as GoogleMerchantConfig) ?? {};
  config.refresh_token = tok.refreshToken;
  config.connected_email = tok.email ?? config.connected_email;
  config.feed_label = config.feed_label || DEFAULT_FEED_LABEL;
  config.content_language = config.content_language || DEFAULT_CONTENT_LANGUAGE;
  config.country = config.country || DEFAULT_COUNTRY;

  // Discover accessible Merchant Center accounts.
  const accRes = await listAccounts(tok.accessToken);
  const accounts = ("error" in accRes ? [] : accRes.data.accounts ?? [])
    .map((a) => ({ id: (a.accountId ?? a.name?.split("/").pop() ?? "").toString(), name: a.accountName ?? a.name ?? "" }))
    .filter((a) => a.id);

  // Auto-connect when there's exactly one account.
  if (accounts.length === 1) {
    const acc = accounts[0];
    // v1 prerequisite: register our GCP project against this account (best-effort).
    await registerGcp(tok.accessToken, acc.id, config.connected_email);
    let dataSourceName: string | undefined;
    const list = await listDataSources(tok.accessToken, acc.id);
    if (!("error" in list)) {
      const existing = (list.data.dataSources ?? []).find((d) => (d.displayName ?? "").startsWith("Edinio"));
      if (existing) dataSourceName = existing.name;
    }
    if (!dataSourceName) {
      const created = await createApiDataSource(tok.accessToken, acc.id, "Edinio", config.feed_label, config.content_language);
      if (!("error" in created)) dataSourceName = created.data.name;
    }
    if (dataSourceName && !config.notification_subscription_name) {
      // Tokenul TREBUIE sa fie in URL-ul de callback, la fel ca in
      // connectMerchant (src/lib/actions/google-merchant.actions.ts):
      // /api/google-merchant/webhook cere acum secretul si confirma-si-ignora
      // orice notificare fara el. Inregistrat fara token, abonamentul creat aici
      // ar fi mort pentru totdeauna — nu se mai recreeaza nimic, fiindca
      // `notification_subscription_name` ramane setat.
      const webhookSecret = process.env.GMC_WEBHOOK_SECRET;
      const callbackUri = `${PLATFORM_ORIGIN}/api/google-merchant/webhook${webhookSecret ? `?token=${encodeURIComponent(webhookSecret)}` : ""}`;
      const sub = await createNotificationSubscription(tok.accessToken, acc.id, callbackUri);
      if (!("error" in sub)) config.notification_subscription_name = sub.data.name;
    }
    config.connected = !!dataSourceName;
    config.account_id = acc.id;
    config.account_name = acc.name;
    config.data_source_name = dataSourceName;
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
      .update({ google_merchant_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
    : await supabase.from("store_settings")
      .insert({ business_id: businessId, google_merchant_config: config as never });

  if (eScris) {
    console.error("[gmc/oauth] conexiunea nu s-a putut salva:", eScris);
    return back(req, "gmc=save_failed");
  }

  return back(req, config.connected ? "gmc=connected" : "gmc=choose");
}
