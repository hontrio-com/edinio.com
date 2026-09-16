import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { NetopiaIpnPayload } from "@/lib/netopia";
import { verifyNetopiaIpn } from "@/lib/netopia-ipn";
import { aplicaStatusulNetopia } from "@/lib/netopia-aplica-statusul";

/**
 * Notificarea server-catre-server a Netopia (IPN).
 *
 * ⚠ CE FACE RUTA: autentifica apelul si traduce verdictul in `errorCode`. Atat.
 *
 * Regula despre BANI (suma, tranzitia comenzii, finalizarea idempotenta, urma pentru un refuz) sta
 * in `lib/netopia-aplica-statusul.ts`, fiindca de pe 16.09 exista si un al doilea drum catre ea:
 * cronul de reconciliere, care INTREABA `/operation/status` cand o notificare nu ajunge. Doua copii
 * ale unei reguli despre bani se departeaza una de alta, si niciodata amandoua deodata.
 */
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

  const verdict = await aplicaStatusulNetopia(
    admin,
    order,
    {
      status: paymentStatus,
      ntpID: payload.payment?.ntpID,
      incasat: payload.payment?.amount ?? payload.order?.amount,
      codLor: payload.payment?.code,
      mesajLor: payload.payment?.message,
    },
    "notify",
  );

  if (verdict.fel === "esec") {
    /*
     * ⚠ `errorCode` DIFERIT DE 0: Netopia va REPETA notificarea. Asta vrem, mai bine o repetare
     * decat o plata pierduta. O suma care nu se potriveste iese 400 (cererea e gresita), restul 500.
     */
    return NextResponse.json(
      { errorCode: 1, errorMessage: verdict.mesaj },
      { status: verdict.suma ? 400 : 500 },
    );
  }

  if (verdict.fel === "platita" || verdict.fel === "rambursata") {
    console.log("[netopia/notify] Order updated:", { orderId, verdict: verdict.fel });
  }

  /*
   * `errorCode: 0` la tot restul, INCLUSIV la refuz si la un cod necunoscut: am primit si am inteles
   * notificarea, deci nu e nimic de repetat.
   */
  return NextResponse.json({ errorCode: 0, errorMessage: "OK" });
}
