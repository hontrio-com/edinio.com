import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  createSession, createHppSession, klarnaReady, toKlarnaOrderInput, type KlarnaConfig,
} from "@/lib/klarna";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { logError } from "@/lib/error-logger";

/**
 * Starts a Klarna payment: creates a payment session + a Hosted Payment Page for
 * the order and returns the redirect_url. The browser is then sent to Klarna,
 * which redirects back to /api/klarna/return on success.
 */
export async function POST(request: NextRequest) {
  /*
   * Ruta e publica si nu cere sesiune, iar cele trei verificari de mai jos
   * (comanda exista / neplatita / neanulata) raman adevarate la infinit — deci o
   * bucla pe acelasi orderId nu se rupea niciodata singura, si fiecare cerere
   * deschidea o sesiune Klarna NOUA (plus un HPP) pe contul comerciantului.
   * Doua linii: asta taie rafala pe IP fara sa atinga baza; cea durabila de mai
   * jos (pe comanda) e singura care tine intre instantele serverless.
   */
  if (!rateLimit(`pay-start:${clientIp(request)}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "Prea multe incercari de plata. Te rugam asteapta un minut si incearca din nou." },
      { status: 429 },
    );
  }

  const { orderId, businessId } = (await request.json()) as { orderId: string; businessId: string };
  if (!orderId || !businessId) {
    return NextResponse.json({ error: "Missing orderId or businessId" }, { status: 400 });
  }

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

  if (!order || !business) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "paid") {
    return NextResponse.json({ error: "Comanda a fost deja platita" }, { status: 400 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "Comanda a fost anulata" }, { status: 400 });
  }

  const cfg = settings?.klarna_config as KlarnaConfig | null;
  if (!klarnaReady(cfg)) {
    return NextResponse.json({ error: "Klarna not configured for this business" }, { status: 400 });
  }

  /*
   * Plafon DURABIL pe COMANDA, nu pe magazin: o comanda reala are nevoie de
   * cateva reincercari de plata, nu de mii, iar o cheie pe businessId ar fi
   * lasat un atacator sa blocheze plata pentru toti ceilalti cumparatori ai
   * magazinului. Se consuma abia aici, dupa ce stim ca `orderId` chiar exista,
   * ca sa nu se umple tabela de limite cu chei inventate.
   */
  if (!(await consumaLimita(`pay-start:${orderId}`, 5, 3600)).permis) {
    return NextResponse.json(
      { error: "Ai incercat de prea multe ori sa platesti aceasta comanda. Incearca din nou peste o ora sau scrie magazinului." },
      { status: 429 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.edinio.com";
  const slug = business.slug ?? "";
  const input = toKlarnaOrderInput(order, settings?.prices_include_vat ?? true);

  const session = await createSession(cfg!, input);
  if (!session.ok || !session.data?.session_id) {
    console.error("[klarna/start] create session failed:", { orderId, error: session.error });
    return NextResponse.json({ error: session.error || "Eroare la initierea platii Klarna." }, { status: 500 });
  }

  /*
   * Legam sesiunea Klarna de ACEASTA comanda.
   *
   * `sid` din URL-urile de mai jos e completat de Klarna si ajunge inapoi la noi
   * in callback si in ruta de retur. Fara sa fi retinut care sesiune apartine
   * carei comenzi, cele doua rute acceptau ORICE sid valid: cine platea o comanda
   * ieftina putea refolosi acelasi sid cu `orderId` schimbat, ca sa marcheze
   * platita o comanda scumpa.
   */
  /*
   * ⚠ LEGATURA CU PLATA SE VERIFICA INAINTE SA TRIMITEM OMUL LA PLATA.
   *
   * Procesatorul a creat plata; daca scrierea de aici pica, clientul plateste si
   * noi ramanem fara id-ul dupa care legam plata de comanda. La Klarna e si mai
   * grav: verificarea din callback („sesiunea e chiar a acestei comenzi?") se
   * sprijina pe campul asta.
   */
  {
    const { error } = await admin
      .from("orders")
      .update({ klarna_session_id: session.data.session_id })
      .eq("id", orderId)
      .eq("business_id", businessId);
    if (error) {
      await logError({ action: "klarna/start", message: `sesiunea Klarna nu s-a putut salva: ${error.message}`, details: { orderId }, businessId, severity: "critical" });
      return NextResponse.json({ error: "Nu am putut pregati plata. Reincearca peste cateva momente." }, { status: 503 });
    }
  }

  const q = `orderId=${encodeURIComponent(orderId)}&businessId=${encodeURIComponent(businessId)}`;
  const failUrl = `${baseUrl}/${slug}/confirm?status=esuat&orderId=${encodeURIComponent(orderId)}`;
  const hpp = await createHppSession(cfg!, session.data.session_id, {
    // Klarna fills {{authorization_token}} + {{session_id}} on the success URL.
    success: `${baseUrl}/api/klarna/return?${q}&authorization_token={{authorization_token}}&sid={{session_id}}`,
    cancel: `${baseUrl}/${slug}`,
    back: `${baseUrl}/${slug}`,
    failure: failUrl,
    error: failUrl,
    // Server-to-server safety net if the customer never returns to the success URL.
    status_update: `${baseUrl}/api/klarna/callback?${q}&sid={{session_id}}`,
  });

  if (!hpp.ok || !hpp.data?.redirect_url) {
    console.error("[klarna/start] create HPP failed:", { orderId, error: hpp.error });
    return NextResponse.json({ error: hpp.error || "Eroare la initierea platii Klarna." }, { status: 500 });
  }

  return NextResponse.json({ redirectUrl: hpp.data.redirect_url });
}
