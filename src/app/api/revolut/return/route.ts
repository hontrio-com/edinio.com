import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { revolutReady, type RevolutConfig } from "@/lib/revolut";
import { finalizeRevolutOrder } from "@/lib/revolut-finalize";
import { citireCazuta } from "@/lib/supabase/citire";
import { logError } from "@/lib/error-logger";

/**
 * Browser return target after the Revolut hosted checkout. We confirm the order
 * state (server-side, with the merchant's key) and mark it paid. The
 * /api/revolut/webhook route is the safety net for customers who never return.
 */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
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

  const [
    { data: order, error: eOrder },
    { data: settings, error: eSettings },
    { data: business, error: eBusiness },
  ] = await Promise.all([
    admin.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("revolut_config").eq("business_id", businessId).single(),
    admin.from("businesses").select("slug").eq("id", businessId).single(),
  ]);

  /*
   * „Comanda nu exista" si „n-am putut interoga baza" duceau la acelasi redirect
   * mut catre „/". La Revolut plata e deja INCASATA cand clientul ajunge aici,
   * deci al doilea caz trebuie sa lase urma si sa-i spuna omului sa ia legatura
   * cu magazinul, nu sa-l trimita pe pagina de start ca si cum n-ar fi platit.
   */
  if (citireCazuta(eOrder, order) || citireCazuta(eSettings, settings) || citireCazuta(eBusiness, business)) {
    const e = [eOrder, eSettings, eBusiness].find((x) => x && x.code !== "PGRST116");
    await logError({
      action: "revolut/return",
      message: `citire picata inainte de finalizare: ${e?.message ?? "motiv necunoscut"}`,
      details: { orderId },
      businessId,
      severity: "critical",
    });
    /*
     * ⚠ Slug-ul poate lipsi tocmai fiindca citirea lui `businesses` a picat, iar
     * atunci `/${""}/confirm` da `//confirm` — adresa PROTOCOL-RELATIVA, pe care
     * `new URL` o citeste ca host EXTERN (`https://confirm/`). Clientul care
     * tocmai a platit ar fi trimis in afara site-ului. Fara slug se merge acasa.
     */
    const slugSigur = business?.slug ?? "";
    if (!slugSigur) return NextResponse.redirect(new URL("/", baseUrl));
    return NextResponse.redirect(new URL(
      `/${slugSigur}/confirm?status=esuat&motiv=${encodeURIComponent("Nu am putut verifica plata. Te rugam contacteaza magazinul.")}&orderId=${encodeURIComponent(orderId)}`,
      baseUrl,
    ));
  }

  const slug = business?.slug ?? "";
  if (!order || !business) {
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  const successUrl = new URL(
    `/${slug}/confirm?orderId=${order.id}&name=${encodeURIComponent(order.customer_name as string)}&total=${order.total}`,
    baseUrl,
  );
  const fail = (motiv: string) =>
    NextResponse.redirect(new URL(`/${slug}/confirm?status=esuat&motiv=${encodeURIComponent(motiv)}&orderId=${order.id}`, baseUrl));

  // Already finalized (e.g. the webhook got here first) — just show confirmation.
  if (order.payment_status === "paid") {
    return NextResponse.redirect(successUrl);
  }

  const cfg = settings?.revolut_config as RevolutConfig | null;
  if (!revolutReady(cfg)) {
    return fail("Nu am putut verifica plata. Te rugam contacteaza magazinul.");
  }

  const revolutOrderId = order.revolut_order_id as string | null;
  if (!revolutOrderId) {
    return fail("Plata Revolut nu a fost gasita. Te rugam reincearca.");
  }

  const result = await finalizeRevolutOrder(
    admin,
    cfg!,
    { id: order.id, businessId, total: Number(order.total) || 0 },
    revolutOrderId,
  );

  // "pending" = payment still settling; the ORDER_COMPLETED webhook finalizes it.
  // Both paid and pending land on the confirmation page.
  if (result.status === "paid" || result.status === "pending") {
    return NextResponse.redirect(successUrl);
  }
  return fail(result.error);
}
