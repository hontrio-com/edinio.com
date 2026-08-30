import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { finalizeazaPlataComenzii } from "@/lib/orders/finalizare-plata";
import { verificaCron } from "@/lib/cron-auth";
import { createClient } from "@supabase/supabase-js";
import { ipayGetOrderStatus, resolveIpayStatus, ipayReady, toBani, IPAY_CURRENCY, type IPayConfig } from "@/lib/ipay";
import { maybeMarkMailchimpOrderPaid } from "@/lib/mailchimp-sync";
import { maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";
import { factureazaDupaPlata } from "@/lib/invoice-on-payment";

// iPay has no webhook — this reconciles orders where the customer paid but never
// returned to the finish route (closed tab). It polls getOrderStatusExtended for
// recent pending iPay orders and marks the paid ones.
function verifyCron(req: NextRequest): boolean {
  // Vezi src/lib/cron-auth.ts: varianta de dinainte trecea cand CRON_SECRET
  // lipsea din mediu (undefined === undefined).
  return verificaCron(req);
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Pages expire well within a few days; only reconcile recent pending iPay orders.
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const { data: orders, error: eOrders } = await admin
    .from("orders")
    .select("id, business_id, total, ipay_order_id, ipay_order_number")
    .eq("payment_status", "unpaid")
    .eq("status", "pending")
    /*
     * ⚠ FILTRUL ERA CHIAR PE LEGATURA CARE SE POATE PIERDE.
     *
     * `ipay_order_id` e UUID-ul BANCII, primit DUPA `register.do`. Daca scrierea
     * lui pica, plata exista si comanda iesea din raza cronului pentru totdeauna —
     * adica plasa de siguranta nu acoperea tocmai cazul pentru care exista.
     *
     * `ipay_order_number` e referinta NOASTRA, scrisa INAINTE de apel. Cu ea,
     * comanda ramane vizibila si se poate intreba `getOrderStatusExtended.do` dupa
     * `orderNumber` — ramura care exista de mult in `ipayGetOrderStatus` si pe care
     * nu o chema nimeni.
     */
    .or("ipay_order_id.not.is.null,ipay_order_number.not.is.null")
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
    await logError({ action: "ipay-reconcile", message: eOrders.message, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, paid: 0 });
  }

  const bizIds = [...new Set(orders.map((o) => o.business_id))];
  const { data: settingsRows, error: eCfg } = await admin
    .from("store_settings")
    .select("business_id, ipay_config")
    .in("business_id", bizIds);
  // Fara configuratii, TOATE comenzile ar fi sarite — adica exact zero munca,
  // raportata ca reusita. Aceeasi tacere ca la citirea comenzilor.
  if (eCfg) {
    await logError({ action: "ipay-reconcile", message: `configuratiile nu s-au putut citi: ${eCfg.message}`, severity: "critical" });
    return NextResponse.json({ ok: false, error: "citire esuata" }, { status: 503 });
  }
  const cfgMap = new Map((settingsRows ?? []).map((r) => [r.business_id, r.ipay_config as IPayConfig | null]));

  let checked = 0;
  let paid = 0;

  for (const o of orders) {
    const cfg = cfgMap.get(o.business_id);
    // Se intreaba dupa id-ul bancii cand il avem; altfel dupa referinta noastra.
    const dupa = o.ipay_order_id
      ? { orderId: o.ipay_order_id }
      : (o.ipay_order_number ? { orderNumber: o.ipay_order_number } : null);
    if (!ipayReady(cfg) || !dupa) continue;
    checked++;
    try {
      const status = await ipayGetOrderStatus(cfg!, dupa);
      const resolved = resolveIpayStatus(status.orderStatus);
      const amountOk = status.amount === toBani(Number(o.total));
      const currencyOk = !status.currency || status.currency === IPAY_CURRENCY.RON;
      if (resolved.paid && amountOk && currencyOk) {
        const r = await finalizeazaPlataComenzii(admin, { id: o.id, businessId: o.business_id });
        if (r.fel === "platita-acum") paid++;
      }
    } catch (e) {
      console.error("[ipay-reconcile] poll failed for order", o.id, e);
    }
  }

  console.log(`[ipay-reconcile] checked ${checked}, marked paid ${paid}`);
  return NextResponse.json({ ok: true, checked, paid });
}
