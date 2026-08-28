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

  /*
   * ═══ ⚠ CODUL DE AUTORIZARE E DE UNICA FOLOSINTA (29.08.2026, seara) ═══
   *
   * Scrierea asta mergea oarba, iar omul era trimis inapoi cu „conectat". Numai ca `exchangeCode`
   * a consumat DEJA codul de la OLX: nu se mai poate schimba a doua oara. Deci o pana de o
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
      .update({ olx_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
    : await supabase.from("store_settings")
      .insert({ business_id: businessId, olx_config: config as never });

  if (eScris) {
    console.error("[olx/oauth] conexiunea nu s-a putut salva:", eScris);
    return back(req, "olx=save_failed");
  }

  return back(req, "olx=connected");
}
