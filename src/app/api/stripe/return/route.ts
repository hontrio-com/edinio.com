import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { finalizeStripeOrder, stripeAccountId } from "@/lib/stripe-finalize";

/**
 * Tinta de intoarcere din Stripe Checkout. Verifica sesiunea server-side, pe
 * contul conectat al comerciantului, si marcheaza comanda platita — apoi duce
 * clientul la pagina de confirmare.
 *
 * Stripe era singura metoda de plata fara ruta de intoarcere: totul atarna de
 * webhook-ul Connect, iar cand acesta nu ajungea, comanda ramanea „Neplatit" cu
 * banii deja incasati. Webhook-ul si cronul `stripe-reconcile` raman plasele de
 * siguranta pentru clientii care nu se mai intorc in magazin.
 */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";
  const sp = request.nextUrl.searchParams;
  const orderId = sp.get("orderId");
  const businessId = sp.get("businessId");

  if (!orderId || !businessId) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [{ data: order }, { data: settings }, { data: business }] = await Promise.all([
    admin.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("stripe_config").eq("business_id", businessId).single(),
    admin.from("businesses").select("slug").eq("id", businessId).single(),
  ]);

  if (!order || !business) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  const slug = business.slug ?? "";
  const successUrl = new URL(`/${slug}/confirm?orderId=${order.id}`, baseUrl);

  // Deja finalizata (webhook-ul sau cronul au ajuns primele) — doar confirmarea.
  if (order.payment_status === "paid") {
    return NextResponse.redirect(successUrl);
  }

  const accountId = stripeAccountId(settings?.stripe_config);
  const sessionId = order.stripe_session_id as string | null;

  // Fara cont conectat sau fara sesiune nu putem verifica nimic. Comanda exista
  // deja in magazin, deci clientul merge tot la confirmare: nu-l speriem cu o
  // eroare pentru o plata care poate a reusit — webhook-ul si cronul o prind.
  if (!accountId || !sessionId) {
    console.error("[stripe/return] nu pot verifica plata:", { orderId, accountId, sessionId });
    return NextResponse.redirect(successUrl);
  }

  const result = await finalizeStripeOrder(
    admin,
    accountId,
    { id: order.id, businessId, total: Number(order.total) || 0, status: order.status as string | null },
    sessionId,
  );

  if (result.status === "failed") {
    const motiv = encodeURIComponent(result.error);
    return NextResponse.redirect(
      new URL(`/${slug}/confirm?status=esuat&motiv=${motiv}&orderId=${order.id}`, baseUrl),
    );
  }

  // paid si pending duc amandoua la confirmare — „pending" inseamna doar ca
  // Stripe inca deconteaza, iar plasele de siguranta preiau de acolo.
  return NextResponse.redirect(successUrl);
}
