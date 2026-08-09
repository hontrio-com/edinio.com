import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { finalizeStripeOrder, stripeAccountId } from "@/lib/stripe-finalize";

/**
 * Plasa de siguranta pentru platile cu cardul prin Stripe: prinde comenzile in
 * care clientul a platit dar marcarea nu s-a facut — webhook Connect nelivrat
 * (endpoint neconfigurat pe conturi conectate, semnatura gresita, incident de
 * retea) sau client care a inchis pagina inainte sa se intoarca in magazin.
 *
 * Pana la incidentul din 29.07 (comanda incasata la Stripe, afisata „Neplatit"
 * in magazin) Stripe era singura metoda de plata fara nicio verificare in afara
 * webhook-ului. Ruleaza la 15 minute, ca `ipay-reconcile`.
 */
function verifyCron(req: NextRequest): boolean {
  // Vezi src/lib/cron-auth.ts: varianta de dinainte trecea cand CRON_SECRET
  // lipsea din mediu (undefined === undefined).
  return verificaCron(req);
}

/** Fereastra implicita de reconciliere, in zile. */
const ZILE_IMPLICIT = 7;

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // `?zile=` largeste fereastra pentru recuperari manuale dupa un incident;
  // rularea programata foloseste implicitul.
  const zile = Math.min(Math.max(Number(req.nextUrl.searchParams.get("zile")) || ZILE_IMPLICIT, 1), 365);
  const since = new Date(Date.now() - zile * 86400000).toISOString();

  const { data: orders, error: eOrders } = await admin
    .from("orders")
    .select("id, business_id, total, status, stripe_session_id")
    .eq("payment_status", "unpaid")
    .not("stripe_session_id", "is", null)
    // Comenzile anulate sau returnate nu se mai reactiveaza automat: daca acolo
    // chiar au intrat bani, e un caz de rambursare, decis de comerciant.
    .not("status", "in", "(cancelled,refunded)")
    .gte("created_at", since)
    .limit(500);

  /*
   * ═══ PLASA DE SIGURANTA NU ARE VOIE SA TACA ═══
   *
   * `const { data: orders } = ...` fara `error`: la o citire picata `orders` e
   * `null`, iar ramura de mai jos raspundea `{ ok: true, checked: 0 }` — o rulare
   * perfect sanatoasa la vedere, care n-a verificat nicio plata.
   *
   * Ironia e completa: cronul asta exista TOCMAI fiindca alte mecanisme pot rata
   * o plata. Daca rateaza el insusi, in tacere, nu mai apara pe nimeni.
   */
  if (eOrders) {
    await logError({ action: "stripe-reconcile", message: eOrders.message, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, paid: 0 });
  }

  const bizIds = [...new Set(orders.map((o) => o.business_id))];
  const { data: settingsRows, error: eCfg } = await admin
    .from("store_settings")
    .select("business_id, stripe_config")
    .in("business_id", bizIds);
  // Fara configuratii, TOATE comenzile ar fi sarite — adica exact zero munca,
  // raportata ca reusita. Aceeasi tacere ca la citirea comenzilor.
  if (eCfg) {
    await logError({ action: "stripe-reconcile", message: `configuratiile nu s-au putut citi: ${eCfg.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }
  const cfgMap = new Map((settingsRows ?? []).map((r) => [r.business_id, stripeAccountId(r.stripe_config)]));

  let checked = 0;
  let paid = 0;

  for (const o of orders) {
    const accountId = cfgMap.get(o.business_id);
    if (!accountId || !o.stripe_session_id) continue;
    checked++;
    try {
      const result = await finalizeStripeOrder(
        admin,
        accountId,
        { id: o.id, businessId: o.business_id, total: Number(o.total) || 0, status: o.status as string | null },
        o.stripe_session_id,
      );
      if (result.status === "paid") {
        paid++;
        console.log("[stripe-reconcile] comanda marcata platita:", o.id);
      }
    } catch (e) {
      console.error("[stripe-reconcile] verificare esuata pentru comanda", o.id, e);
    }
  }

  console.log(`[stripe-reconcile] checked ${checked}, marked paid ${paid}`);
  return NextResponse.json({ ok: true, checked, paid });
}
