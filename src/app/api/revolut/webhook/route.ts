import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { verifyWebhookSignature, type RevolutConfig } from "@/lib/revolut";
import { finalizeRevolutOrder } from "@/lib/revolut-finalize";
import { citireCazuta, intrebareFaraSens } from "@/lib/supabase/citire";
import { logError } from "@/lib/error-logger";

/**
 * Revolut Merchant signed webhook (`ORDER_COMPLETED`). Registered per merchant with
 * `?businessId=…`, so we load the right signing secret. The HMAC-SHA256 signature is
 * verified over the exact raw body BEFORE any DB write; then we finalize the order
 * idempotently.
 *
 * ⚠ NU raspunde 200 orice s-ar intampla. Un 2xx ii spune lui Revolut „livrat",
 * si el nu mai repeta niciodata. Deci: „nu cunosc comanda" → 200 (evenimentul
 * chiar nu ne priveste), dar „n-am putut interoga baza" → 503, ca sa mai vina o
 * data. Vezi `citireCazuta`. Fereastra lui de reincercare e insa de ~30 de minute
 * in total, deci 503 doar mareste sansa — recuperarea adevarata e cronul
 * `/api/cron/revolut-reconcile`.
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

  const reia = async (ce: string, mesaj: string) => {
    await logError({
      action: "revolut/webhook",
      message: `${ce}: ${mesaj}`,
      details: { businessId },
      businessId,
      severity: "critical",
    });
    return NextResponse.json({ received: false, error: "citire esuata" }, { status: 503 });
  };

  /*
   * `.maybeSingle()`, nu `.single()`: cu `.single()` lipsa randului vine tot ca
   * `error` (PGRST116), iar poarta de mai jos ar da 503 pentru orice magazin
   * fara rand in `store_settings` — o furtuna de reincercari pentru un caz
   * perfect normal.
   */
  const { data: settings, error: eCfg } = await admin
    .from("store_settings")
    .select("revolut_config")
    .eq("business_id", businessId)
    .maybeSingle();
  if (eCfg) return await reia("configul Revolut nu s-a putut citi", eCfg.message);
  const cfg = settings?.revolut_config as RevolutConfig | null;
  /*
   * Config lipsa ramane 200, si NU e o scapare: comerciantul poate deconecta
   * Revolut fara ca webhookul sa fie sters de la ei. Un 503 acolo ar reincerca
   * la fiecare eveniment, la nesfarsit.
   */
  if (!cfg?.signing_secret) return ok();

  // Verify the signature over the exact raw body before trusting anything.
  const valid = verifyWebhookSignature(
    cfg.signing_secret,
    request.headers.get("revolut-signature"),
    request.headers.get("revolut-request-timestamp"),
    rawBody,
  );
  if (!valid) {
    console.error("[revolut/webhook] invalid signature", { businessId });
    return ok();
  }

  let event: { event?: string; order_id?: string; merchant_order_ext_ref?: string };
  try { event = JSON.parse(rawBody); } catch { return ok(); }
  if (event.event !== "ORDER_COMPLETED" || !event.order_id) return ok();

  // Find our order: prefer the stored revolut_order_id, fall back to ext_ref (our id).
  type OrderRow = { id: string; total: number; payment_status: string | null };
  let order: OrderRow | null = null;

  const byRevolut = await admin
    .from("orders")
    .select("id, total, payment_status")
    .eq("business_id", businessId)
    .eq("revolut_order_id", event.order_id)
    .maybeSingle();
  /*
   * Verificarea sta AICI, imediat, nu dupa ramura de rezerva: altfel o eroare pe
   * prima cautare cade tacut in `if (!order && ...)` si e mascata de a doua.
   */
  if (citireCazuta(byRevolut.error, byRevolut.data)) {
    return await reia("cautarea comenzii dupa revolut_order_id a picat", byRevolut.error!.message);
  }
  order = (byRevolut.data as OrderRow | null) ?? null;

  if (!order && event.merchant_order_ext_ref) {
    const byExt = await admin
      .from("orders")
      .select("id, total, payment_status")
      .eq("business_id", businessId)
      .eq("id", event.merchant_order_ext_ref)
      .maybeSingle();
    /*
     * `22P02` (uuid invalid) NU e o cadere: inseamna ca referinta externa nu e un
     * id de-al nostru — comanda facuta direct in contul comerciantului, sau un
     * eveniment de test. Tratata ca esec, ar produce reincercari si alarme
     * critice la fiecare livrare a aceluiasi eveniment strain.
     */
    if (!intrebareFaraSens(byExt.error) && citireCazuta(byExt.error, byExt.data)) {
      return await reia("cautarea comenzii dupa merchant_order_ext_ref a picat", byExt.error!.message);
    }
    order = (byExt.data as OrderRow | null) ?? null;
  }

  /*
   * „Comanda nu exista" ramane 200, si trebuie sa ramana: Revolut trimite
   * `ORDER_COMPLETED` pentru TOATE comenzile contului, nu doar pentru ale
   * noastre.
   */
  if (!order || order.payment_status === "paid") return ok();

  /*
   * ⚠ REZULTATUL SE VERIFICA, si la esec se raspunde 5xx.
   *
   * Aici se raspundea `200 { received: true }` orice s-ar fi intamplat. Deci:
   * Revolut spune „platit" -> scrierea in baza pica -> noi confirmam primirea ->
   * Revolut considera notificarea livrata si NU o mai repeta. Plata ramanea
   * definitiv `paid` la ei si `unpaid` la noi, iar pentru Revolut nu exista niciun
   * cron de reconciliere care s-o prinda mai tarziu.
   *
   * De cand `finalizeazaPlataComenzii` e idempotenta, ne permitem sa cerem o
   * reincercare: o a doua livrare a aceleiasi notificari nu face rau.
   */
  const r = await finalizeRevolutOrder(admin, cfg, { id: order.id, businessId, total: Number(order.total) || 0 }, event.order_id);
  if (r.status === "failed") {
    return NextResponse.json({ received: false, error: r.error ?? "eroare interna" }, { status: 503 });
  }
  return ok();
}
