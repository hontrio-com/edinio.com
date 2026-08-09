import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/error-logger";
import { finalizeazaPlataComenzii } from "@/lib/orders/finalizare-plata";
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

  /*
   * ═══ NETOPIA TRECE ACUM PRIN ACELEASI DOUA MOTOARE CA RESTUL ═══
   *
   * Aici se scria direct in `orders`, cu `await admin...update(update)` al carui
   * rezultat nu se verifica deloc, si se raspundea `errorCode: 0` oricum. Netopia
   * repeta notificarea pana primeste `errorCode: 0`, deci un raspuns de succes pe
   * o scriere picata inseamna ca notificarea NU se mai repeta: plata ramanea
   * neinregistrata, definitiv.
   *
   * Si anularea venita de la procesator elibera cuponul, dar NU stocul — fiindca
   * nu trecea prin `aplica_tranzitia_comenzii`. Adica exact ce reparasem in panou
   * si in loturi ramasese deschis pe calea cu cele mai multe comenzi online.
   */
  if (orderStatus) {
    const { data: t, error: eT } = await admin.rpc("aplica_tranzitia_comenzii" as never, {
      p_order_id: orderId,
      p_status: orderStatus,
      // Plata se scrie separat, mai jos, prin `finalizeazaPlataComenzii`: acolo e
      // idempotenta si tot ce urmeaza dupa plata.
      p_payment_status: null,
      p_business_id: order.business_id,
    } as never);
    const rez = t as { gasit?: boolean; stoc?: string } | null;
    if (eT || rez?.gasit !== true) {
      await logError({
        action: "netopia/notify",
        message: eT?.message ?? "tranzitia comenzii n-a raspuns valid",
        details: { orderId, orderStatus, raspuns: rez },
        businessId: order.business_id,
        severity: "critical",
      });
      // `errorCode` diferit de 0: Netopia va REPETA notificarea. Asta vrem — mai
      // bine o repetare decat o plata pierduta.
      return NextResponse.json({ errorCode: 1, errorMessage: "State update failed" }, { status: 500 });
    }
    if (rez.stoc === "necunoscut") {
      await logError({
        action: "netopia/notify",
        message: "Comanda e dinainte de inregistrarea stocului rezervat; stocul NU s-a dat inapoi automat.",
        details: { orderId }, businessId: order.business_id, severity: "warning",
      });
    }
  }

  if (newPaymentStatus === "paid") {
    const r = await finalizeazaPlataComenzii(admin, { id: orderId, businessId: order.business_id });
    if (r.fel === "esuat") {
      return NextResponse.json({ errorCode: 1, errorMessage: "Payment update failed" }, { status: 500 });
    }
  } else if (newPaymentStatus) {
    const { error } = await admin
      .from("orders")
      .update({ payment_status: newPaymentStatus, updated_at: new Date().toISOString() })
      .eq("id", orderId);
    if (error) {
      await logError({
        action: "netopia/notify", message: error.message,
        details: { orderId, newPaymentStatus }, businessId: order.business_id, severity: "critical",
      });
      return NextResponse.json({ errorCode: 1, errorMessage: "Payment update failed" }, { status: 500 });
    }
  }

  if (orderStatus || newPaymentStatus) {
    console.log("[netopia/notify] Order updated:", { orderId, orderStatus, newPaymentStatus });
  }

  // Netopia v2 expects { errorCode: 0 } for success
  return NextResponse.json({ errorCode: 0, errorMessage: "OK" });
}
