import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { maybeMarkMailchimpOrderPaid } from "@/lib/mailchimp-sync";
import { factureazaDupaPlata } from "@/lib/invoice-on-payment";
import { maybeMarkBrevoOrderPaid } from "@/lib/brevo-sync";
import { resolveNetopiaStatus, type NetopiaIpnPayload } from "@/lib/netopia";
import { verifyNetopiaIpn } from "@/lib/netopia-ipn";

export async function POST(request: NextRequest) {
  let payload: NetopiaIpnPayload;
  try {
    payload = (await request.json()) as NetopiaIpnPayload;
  } catch {
    return NextResponse.json({ errorCode: 1, errorMessage: "Invalid JSON" }, { status: 400 });
  }

  const orderId = payload.order?.orderID;
  const paymentStatus = payload.payment?.status;

  if (!orderId || paymentStatus === undefined) {
    return NextResponse.json({ errorCode: 0x01, errorMessage: "Missing order or status" });
  }

  // Authenticate the callback: the signed token is bound to this order at
  // payment-start time. Without it anyone could POST a fake "paid" status.
  if (!verifyNetopiaIpn(orderId, request.nextUrl.searchParams.get("t"))) {
    console.error("[netopia/notify] IPN signature verification failed:", { orderId });
    return NextResponse.json({ errorCode: 1, errorMessage: "Invalid signature" }, { status: 403 });
  }

  console.log("[netopia/notify] IPN received:", {
    orderId,
    ntpID: payload.payment?.ntpID,
    status: paymentStatus,
  });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: order } = await admin
    .from("orders")
    .select("id, business_id, status, payment_status, total, order_number")
    .eq("id", orderId)
    .single();

  if (!order) {
    console.error("[netopia/notify] Order not found:", orderId);
    return NextResponse.json({ errorCode: 0x01, errorMessage: "Order not found" });
  }

  const { orderStatus, paymentStatus: newPaymentStatus } = resolveNetopiaStatus(paymentStatus);

  /*
   * SUMA. Semnatura dovedeste ca notificarea vine de la Netopia si e legata de
   * ACEASTA comanda — dar nu spune nimic despre cat s-a incasat. Fara verificarea
   * de mai jos, o plata partiala (sau una pornita pentru alt cos si soldata mai
   * ieftin) marca oricum comanda drept „platita", declansa facturarea automata si
   * o trecea in „confirmata". Comerciantul livra marfa pe bani mai putini.
   *
   * Comparam cu toleranta de un ban, ca sa nu cada pe rotunjiri, si acceptam si
   * incasarile MAI MARI (Netopia poate adauga comisioane; un plus nu pagubeste
   * comerciantul). Refuzam doar ce e sub total.
   */
  if (newPaymentStatus === "paid") {
    const incasat = Number(payload.payment?.amount ?? payload.order?.amount);
    const datorat = Number(order.total);

    if (!Number.isFinite(incasat)) {
      console.error("[netopia/notify] plata fara suma in payload", { orderId, ntpID: payload.payment?.ntpID });
      return NextResponse.json({ errorCode: 1, errorMessage: "Missing amount" }, { status: 400 });
    }
    if (Number.isFinite(datorat) && incasat + 0.01 < datorat) {
      console.error("[netopia/notify] suma incasata sub totalul comenzii — comanda NU se marcheaza platita", {
        orderId, numar: order.order_number, incasat, datorat,
      });
      return NextResponse.json({ errorCode: 1, errorMessage: "Amount mismatch" }, { status: 400 });
    }
  }

  if (orderStatus || newPaymentStatus) {
    const update: Record<string, string> = { updated_at: new Date().toISOString() };
    if (orderStatus) update.status = orderStatus;
    if (newPaymentStatus) update.payment_status = newPaymentStatus;

    await admin.from("orders").update(update).eq("id", orderId);
    /*
     * Anularea venita de la procesator elibereaza cuponul.
     *
     * Ruta asta scrie direct in `orders`, deci nu trece nici prin `updateOrder`,
     * nici prin cron (el cere `status = pending`). E chiar scenariul constatarii
     * 27 — clientul abandoneaza pagina procesatorului — pe procesatorul cu cele
     * mai multe comenzi online din baza. iPay si Stripe nu anuleaza comenzi:
     * acolo comanda ramane `pending` si o prinde cronul.
     */
    if (orderStatus === "cancelled") {
      await admin.rpc("release_order_discount" as never, { p_order_id: orderId } as never);
    }
    // Anti-reluare: aceeasi notificare retrimisa nu mai declanseaza a doua oara
    // sincronizarile si facturarea. Netopia REPETA notificarile pana primeste
    // errorCode 0, iar o retea proasta produce usor duplicate.
    if (newPaymentStatus === "paid" && order.payment_status !== "paid") {
      void maybeMarkMailchimpOrderPaid(orderId);
      void maybeMarkBrevoOrderPaid(orderId);
      // Facturarea automata, daca magazinul o are pe „Platita" sau pe starea in
      // care tocmai a intrat comanda. Vezi `invoice-on-payment.ts`.
      factureazaDupaPlata(order.business_id, orderId, orderStatus || (order.status as string) || "", "paid");
    }
    console.log("[netopia/notify] Order updated:", { orderId, orderStatus, newPaymentStatus });
  }

  // Netopia v2 expects { errorCode: 0 } for success
  return NextResponse.json({ errorCode: 0, errorMessage: "OK" });
}
