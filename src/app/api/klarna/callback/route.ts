import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getHppSession, klarnaReady, toKlarnaOrderInput, type KlarnaConfig } from "@/lib/klarna";
import { finalizeKlarnaOrder } from "@/lib/klarna-finalize";

/**
 * Klarna HPP `status_update` callback (server-to-server). Fires when the hosted
 * session changes status, covering customers who complete the payment but never
 * return to the success URL (closed tab). We read the HPP session for the
 * authoritative status + authorization token and finalize idempotently.
 * Always answers 200 so Klarna does not retry-storm; the browser return route is
 * the primary path.
 */
async function handle(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const orderId = sp.get("orderId");
  const businessId = sp.get("businessId");
  const sid = sp.get("sid");
  const ok = () => NextResponse.json({ received: true });

  if (!orderId || !businessId || !sid) return ok();

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [{ data: order }, { data: settings }, { data: business }] = await Promise.all([
    admin.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("klarna_config, prices_include_vat").eq("business_id", businessId).single(),
    admin.from("businesses").select("slug").eq("id", businessId).single(),
  ]);

  // Nothing to do: unknown order, already paid, or Klarna not configured.
  if (!order || order.payment_status === "paid") return ok();

  /*
   * ⚠ REGULA E INVERSATA: LIPSA sesiunii stocate OPRESTE finalizarea.
   *
   * Era `if (order.klarna_session_id && ...)` — adica verificarea se facea DOAR
   * daca exista o sesiune stocata. Iar `/api/klarna/start` scria `klarna_session_id`
   * fara sa verifice rezultatul: la o scriere picata campul ramanea NULL, si atunci
   * verificarea se SAREA cu totul. Adica exact cazul in care nu stim a cui e
   * sesiunea era cazul in care nu mai intrebam.
   *
   * Acum: fara sesiune stocata nu se finalizeaza nimic. Comanda ramane neplatita
   * si se rezolva prin retur sau de mana — nepotrivirea unei plati e mai ieftina
   * decat confirmarea uneia straine.
   */
  if (!order.klarna_session_id || order.klarna_session_id !== sid) {
    console.error("[klarna/callback] sesiune lipsa sau straina comenzii", { orderId, sid, stocat: order.klarna_session_id });
    return ok();
  }
  const cfg = settings?.klarna_config as KlarnaConfig | null;
  if (!klarnaReady(cfg)) return ok();

  const hpp = await getHppSession(cfg!, sid);
  if (!hpp.ok || hpp.data?.status !== "COMPLETED" || !hpp.data?.authorization_token) return ok();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const slug = business?.slug ?? "";
  const confirmationUrl = `${baseUrl}/${slug}/confirm?orderId=${order.id}`;
  const input = toKlarnaOrderInput(order, settings?.prices_include_vat ?? true);

  // Ca la Revolut: un esec de baza NU se confirma cu 200, ca sa poata fi reincercat.
  const r = await finalizeKlarnaOrder(admin, cfg!, input, hpp.data.authorization_token, confirmationUrl);
  if (r.status === "failed") {
    return NextResponse.json({ received: false, error: r.error ?? "eroare interna" }, { status: 503 });
  }
  return ok();
}

export async function GET(request: NextRequest) { return handle(request); }
export async function POST(request: NextRequest) { return handle(request); }
