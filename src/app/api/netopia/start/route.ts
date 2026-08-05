import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { startNetopiaPayment, type NetopiaConfig } from "@/lib/netopia";
import { signNetopiaIpn } from "@/lib/netopia-ipn";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";

export async function POST(request: NextRequest) {
  try {
    /*
     * Ruta e publica si nu cere sesiune, iar cele trei verificari de mai jos
     * (comanda exista / neplatita / neanulata) raman adevarate la infinit — deci
     * o bucla pe acelasi orderId nu se rupea niciodata singura, si fiecare
     * cerere deschidea o plata NOUA pe POS-ul comerciantului.
     * Doua linii: asta taie rafala pe IP fara sa atinga baza; cea durabila de
     * mai jos (pe comanda) e singura care tine intre instantele serverless.
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
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const [{ data: order }, { data: settings }, { data: business }] = await Promise.all([
      admin.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
      admin.from("store_settings").select("netopia_config").eq("business_id", businessId).single(),
      admin.from("businesses").select("slug").eq("id", businessId).single(),
    ]);

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (order.payment_status === "paid") {
      return NextResponse.json({ error: "Comanda a fost deja platita" }, { status: 400 });
    }
    if (order.status === "cancelled") {
      return NextResponse.json({ error: "Comanda a fost anulata" }, { status: 400 });
    }

    const config = settings?.netopia_config as NetopiaConfig | null;
    if (!config?.enabled || !config.pos_signature || !config.api_key) {
      return NextResponse.json({ error: "Netopia not configured" }, { status: 400 });
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
    const slug = business?.slug ?? "";

    const customerName = ((order.customer_name as string | null) ?? "Client").trim() || "Client";
    const nameParts = customerName.split(/\s+/);
    const firstName = nameParts[0] || "-";
    const lastName = nameParts.slice(1).join(" ") || "-";

    const addr = (order.shipping_address as { address?: string; city?: string; county?: string } | null) ?? {};

    const notifyUrl = `${baseUrl}/api/netopia/notify?t=${signNetopiaIpn(orderId)}`;
    const redirectUrl = `${baseUrl}/${slug}/confirm?orderId=${encodeURIComponent(orderId)}&name=${encodeURIComponent(customerName)}&total=${order.total}`;

    const result = await startNetopiaPayment(
      {
        orderId,
        posSignature: config.pos_signature,
        amount: Number(order.total),
        currency: "RON",
        description: `Comanda ${order.order_number as string}`,
        firstName,
        lastName,
        email: (order.customer_email as string) || "client@edinio.com",
        phone: (order.customer_phone as string) || "-",
        address: addr.address || "-",
        city: addr.city || "-",
        county: addr.county || "-",
        notifyUrl,
        redirectUrl,
      },
      config.api_key,
      config.sandbox
    );

    if (result.error) {
      console.error("[netopia/start] Payment start failed:", result.error);
      // 502: upstream (Netopia) refused/failed — distinct from our own 500 below.
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ redirectUrl: result.redirectUrl });
  } catch (err) {
    console.error("[netopia/start] Unhandled error:", err);
    return NextResponse.json(
      { error: "Eroare interna la initierea platii cu cardul." },
      { status: 500 }
    );
  }
}
