import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createOrder, revolutReady, toMinor, type RevolutConfig } from "@/lib/revolut";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { logError } from "@/lib/error-logger";

/**
 * Starts a Revolut payment: creates a Merchant order (capture_mode=automatic) and
 * returns the hosted `checkout_url`. The browser is sent there; Revolut redirects
 * back to /api/revolut/return after payment, and a signed ORDER_COMPLETED webhook
 * is the server-to-server safety net.
 */
export async function POST(request: NextRequest) {
  /*
   * Ruta e publica si nu cere sesiune, iar cele trei verificari de mai jos
   * (comanda exista / neplatita / neanulata) raman adevarate la infinit — deci o
   * bucla pe acelasi orderId nu se rupea niciodata singura, si fiecare cerere
   * crea o comanda NOUA pe contul Revolut al comerciantului.
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
    admin.from("store_settings").select("revolut_config").eq("business_id", businessId).single(),
    admin.from("businesses").select("slug").eq("id", businessId).single(),
  ]);

  if (!order || !business) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "paid") {
    return NextResponse.json({ error: "Comanda a fost deja platita" }, { status: 400 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "Comanda a fost anulata" }, { status: 400 });
  }

  const cfg = settings?.revolut_config as RevolutConfig | null;
  if (!revolutReady(cfg)) {
    return NextResponse.json({ error: "Revolut not configured for this business" }, { status: 400 });
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
  const q = `orderId=${encodeURIComponent(orderId)}&businessId=${encodeURIComponent(businessId)}`;

  const created = await createOrder(cfg!, {
    amountMinor: toMinor(Number(order.total) || 0),
    extRef: order.id,
    redirectUrl: `${baseUrl}/api/revolut/return?${q}`,
    description: `Comanda ${order.order_number}`,
  });

  if (!created.ok || !created.data?.id || !created.data?.checkout_url) {
    console.error("[revolut/start] create order failed:", { orderId, error: created.error });
    return NextResponse.json({ error: created.error || "Eroare la initierea platii Revolut." }, { status: 500 });
  }

  // Persist the Revolut order id so the return + webhook can look this order up.
  /*
   * ⚠ LEGATURA CU PLATA SE VERIFICA INAINTE SA TRIMITEM OMUL LA PLATA.
   *
   * Scrierea asta era `await ...update(...)` cu rezultatul aruncat. Adica:
   * procesatorul a creat plata -> scrierea in baza a picat -> clientul primeste
   * link-ul si plateste -> iar noi nu mai avem id-ul dupa care sa legam plata de
   * comanda. Returul si reconcilierea se sprijina exact pe el.
   *
   * Mai bine o initiere refuzata, pe care clientul o reincearca imediat, decat o
   * plata facuta pe care n-o mai putem potrivi cu nimic.
   */
  {
    const { error } = await admin.from("orders").update({ revolut_order_id: created.data.id }).eq("id", order.id);
    if (error) {
      await logError({ action: "revolut/start", message: `id-ul Revolut nu s-a putut salva: ${error.message}`, details: { orderId: order.id }, severity: "critical" });
      return NextResponse.json({ error: "Nu am putut pregati plata. Reincearca peste cateva momente." }, { status: 503 });
    }
  }

  return NextResponse.json({ redirectUrl: created.data.checkout_url });
}
