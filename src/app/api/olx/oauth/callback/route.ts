import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { patchOlxConfig } from "@/lib/olx/config";
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
  /*
   * ═══ ⚠ SE SCRIE UN PETIC, NU CONFIGUL INTREG (30.08.2026, tarziu) ═══
   *
   * Pana azi se citea configul intreg, se modifica in memorie si se scria inapoi tot. Intre citire
   * si scriere incape orice — inclusiv o reimprospatare de token facuta de cron, care ar fi fost
   * apoi inlocuita cu valorile citite aici.
   *
   * ⚠ Citirea ramane, dar numai ca sa AFLAM ce e deja acolo (`auto_sync`, alegerile omului), nu ca
   * sa scriem peste. Ce se scrie e strict ce s-a schimbat prin conectare.
   */
  const { data: ss, error: eCitire } = await admin
    .from("store_settings").select("id, olx_config").eq("business_id", businessId).single();
  if (eCitire) {
    console.error("[olx/oauth] configul nu s-a putut citi:", eCitire);
    return back(req, "olx=save_failed");
  }
  const existent: OlxConfig = (ss?.olx_config as OlxConfig) ?? {};
  const config: Partial<OlxConfig> = {
    connected: true,
    access_token: tok.accessToken,
    access_token_expires_at: tok.expiresAt,
    refresh_token: tok.refreshToken,
    token_updated_at: new Date().toISOString(),
    needs_reconnect: false,
  };
  /* ⚠ Numai daca n-a ales omul deja: o reconectare n-are voie sa-i reporneasca sincronizarea. */
  if (existent.auto_sync === undefined) config.auto_sync = true;

  // Identify the connected OLX user (for display + advertiser_type default).
  const me = await getMe(tok.accessToken);
  if (!isOlxError(me)) {
    config.olx_user_id = me.data.id;
    config.olx_user_name = me.data.name;
    /*
     * ═══ ⚠ CONTUL DE FIRMA SE AFLA DE LA EI, NU SE ASTEAPTA DE LA OM (30.08.2026) ═══
     *
     * `/users/me` ne spune `is_business` chiar la conectare. Nefolosit, un cont OLX Business ramanea
     * la noi `advertiser_type: "private"` — iar anunturile plecau declarate gresit, pana cand omul
     * gasea singur comutatorul. El n-avea de unde sa stie ca trebuie.
     *
     * ⚠ SE COMPLETEAZA DOAR CE E GOL. O reconectare (token expirat, cont schimbat) nu are voie sa
     * calce ce a ales omul intre timp: `??=` scrie numai peste nescris.
     */
    if (me.data.is_business === true) config.advertiser_type = existent.advertiser_type ?? "business";
    else if (me.data.is_business === false) config.advertiser_type = existent.advertiser_type ?? "private";
    if (me.data.name) config.contact_name = existent.contact_name ?? me.data.name.slice(0, 100);
    if (me.data.phone) config.contact_phone = existent.contact_phone ?? String(me.data.phone).replace(/\s+/g, "");
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
  /*
   * ⚠ PETIC ATOMIC, ca peste tot: `jsonb_merge_config` imbina IN BAZA, deci o reimprospatare de
   * token facuta intre timp nu mai poate fi calcata de valorile citite mai sus.
   */
  const eScris = ss?.id
    ? await (async () => {
      try { await patchOlxConfig(admin, businessId, config); return null; } catch (e) { return e as Error; }
    })()
    : (await supabase.from("store_settings")
      .insert({ business_id: businessId, olx_config: config as never })).error;

  if (eScris) {
    console.error("[olx/oauth] conexiunea nu s-a putut salva:", eScris);
    return back(req, "olx=save_failed");
  }

  return back(req, "olx=connected");
}
