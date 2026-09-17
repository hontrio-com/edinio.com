import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getAccessToken } from "@/lib/google-merchant/oauth";
import { getProduct, mapProductStatus } from "@/lib/google-merchant/client";
import { DEFAULT_CONTENT_LANGUAGE, DEFAULT_FEED_LABEL, type GoogleMerchantConfig } from "@/lib/google-merchant/types";

// Receives Merchant API PRODUCT_STATUS_CHANGE notifications. We always ack (2xx)
// so Google doesn't retry forever, then refresh the affected product's status.
export async function POST(req: NextRequest) {
  // Shared-secret OBLIGATORIU: abonamentul de notificari inregistreaza un URL de
  // callback cu ?token=<secret>, deci POST-urile falsificate (care nu-l stiu)
  // sunt confirmate si ignorate.
  //
  // Varianta de dinainte lasa ruta DESCHISA cand secretul lipsea din mediu, cu
  // doar un plafon pe IP. Dar `account_id` nu e secret: oricine trimitea
  // {"account":"accounts/<id-ul altui comerciant>"} ajungea, cu clientul de
  // serviciu, pe ramura finala si stergea `last_status_at` de pe TOT catalogul
  // unui magazin strain. Fail-closed, ca la cele 12 rute de cron (vezi
  // src/lib/cron-auth.ts): fara secret nu intra nimeni. Ce se pierde e doar
  // prospetimea starilor — cronul gmc-sync le reinterogheaza oricum la 30 min.
  const secret = process.env.GMC_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[gmc/webhook] GMC_WEBHOOK_SECRET nu e setat — notificare respinsa");
    return NextResponse.json({ ok: true });
  }
  if (req.nextUrl.searchParams.get("token") !== secret) {
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

  /*
   * ⚠ TOATE magazinele legate de cont, nu primul. Un comerciant cu doua magazine le poate lega de acelasi
   * cont Merchant; cu `.limit(1)`, notificarile ajungeau mereu la unul singur, iar produsele celuilalt
   * nu-si primeau niciodata starea in timp real.
   */
  const { data: magazine } = await admin
    .from("store_settings")
    .select("business_id, google_merchant_config")
    .eq("google_merchant_config->>account_id", accountId)
    .limit(20);
  if (!magazine?.length) return NextResponse.json({ ok: true });
  const businessIds = magazine.map((m) => m.business_id);
  const now = new Date().toISOString();

  if (!offerId) {
    // Nu se stie ce produs: reverificarea intregului catalog, la urmatoarea trecere a cronului.
    await admin.from("gmc_products").update({ last_status_at: null }).in("business_id", businessIds);
    return NextResponse.json({ ok: true });
  }

  /* Magazinul care chiar are oferta. Fara rand la noi, oferta nu e a noastra si nu e nimic de facut. */
  const { data: rand } = await admin.from("gmc_products")
    .select("business_id").in("business_id", businessIds).eq("offer_id", offerId).limit(1).maybeSingle();
  if (!rand) return NextResponse.json({ ok: true });
  const businessId = rand.business_id;
  const config = (magazine.find((m) => m.business_id === businessId)?.google_merchant_config as GoogleMerchantConfig | null) ?? {};

  if (config.refresh_token && config.account_id) {
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

  /*
   * N-am putut citi starea acum (token, pana, sau produsul sters: „If newValue is omitted, the product was
   * deleted", iar atunci `getProduct` da 404). ⚠ Se reverifica DOAR oferta asta, nu tot catalogul: forma de
   * dinainte stergea `last_status_at` pe toate produsele magazinului la fiecare astfel de notificare. Cronul
   * trateaza singur o oferta pe care Google n-o mai are (vezi `STARE_EXPIRAT`).
   */
  await admin.from("gmc_products").update({ last_status_at: null }).eq("business_id", businessId).eq("offer_id", offerId);
  return NextResponse.json({ ok: true });
}
