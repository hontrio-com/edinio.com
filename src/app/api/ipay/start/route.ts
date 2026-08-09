import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  ipayRegister, ipayReady, toBani, buildOrderBundle,
  ipayOrderNumber, urmatoareaIncercareIpay,
  type IPayConfig,
} from "@/lib/ipay";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { logError } from "@/lib/error-logger";

export async function POST(request: NextRequest) {
  /*
   * Ruta e publica si nu cere sesiune, iar cele trei verificari de mai jos
   * (comanda exista / neplatita / neanulata) raman adevarate la infinit — deci o
   * bucla pe acelasi orderId nu se rupea niciodata singura, si fiecare cerere
   * inregistra o plata NOUA pe contul de comerciant al magazinului.
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

  const [{ data: order }, { data: settings }] = await Promise.all([
    admin.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("ipay_config").eq("business_id", businessId).single(),
  ]);

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.payment_status === "paid") {
    return NextResponse.json({ error: "Comanda a fost deja platita" }, { status: 400 });
  }
  if (order.status === "cancelled") {
    return NextResponse.json({ error: "Comanda a fost anulata" }, { status: 400 });
  }

  const cfg = settings?.ipay_config as IPayConfig | null;
  if (!ipayReady(cfg)) {
    return NextResponse.json({ error: "iPay not configured for this business" }, { status: 400 });
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

  /*
   * ⚠ REFERINTA SE SCRIE INAINTE DE APEL, NU DUPA.
   *
   * `orderNumber` e ce trimitem NOI bancii. Banca deduplica dupa el si permite
   * interogarea dupa el (`getOrderStatusExtended.do`) — dar numai daca il stim.
   * Salvat abia dupa `register.do`, s-ar pierde exact in cazul pe care il inchidem:
   * plata creata, scrierea picata, si nicio cale de a mai gasi plata.
   *
   * Incercarea creste fata de ultima folosita: iPay cere un numar NOU per tentativa,
   * altfel o plata expirata ar bloca-o pe urmatoarea cu errorCode 1.
   */
  const orderNumber = ipayOrderNumber(
    order.order_number as string,
    urmatoareaIncercareIpay((order as { ipay_order_number?: string | null }).ipay_order_number),
    businessId,
  );
  {
    const { error } = await admin
      .from("orders").update({ ipay_order_number: orderNumber }).eq("id", orderId);
    if (error) {
      await logError({
        action: "ipay/start",
        message: `referinta iPay nu s-a putut salva INAINTE de apel: ${error.message}`,
        details: { orderId, orderNumber },
        severity: "critical",
      });
      return NextResponse.json({ error: "Nu am putut pregati plata. Reincearca peste cateva momente." }, { status: 503 });
    }
  }
  const returnUrl = `${baseUrl}/api/ipay/return?orderId=${encodeURIComponent(orderId)}&businessId=${encodeURIComponent(businessId)}`;

  const addr = (order.shipping_address ?? {}) as { address?: string; city?: string; county?: string };
  const email = (order.customer_email as string | null) ?? undefined;
  const phone = (order.customer_phone as string | null) ?? "";
  // orderBundle is only sent when we have complete, real customer data (per iPay docs).
  const orderBundle = email && phone && addr.city && addr.address
    ? buildOrderBundle({ email, phone, city: addr.city, address: addr.address })
    : undefined;

  const result = await ipayRegister(cfg!, {
    orderNumber,
    amountBani: toBani(Number(order.total)),
    returnUrl,
    description: `Comanda ${order.order_number}`,
    email,
    orderBundle,
  });

  if (!result.formUrl || !result.orderId) {
    console.error("[ipay/start] register failed:", { orderId, errorCode: result.errorCode, errorMessage: result.errorMessage });
    return NextResponse.json({ error: result.errorMessage || "Eroare la initierea platii iPay." }, { status: 500 });
  }

  // Persist the iPay order id for this attempt so the return route + cron can poll it.
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
    const { error } = await admin.from("orders").update({ ipay_order_id: result.orderId }).eq("id", orderId);
    if (error) {
      await logError({ action: "ipay/start", message: `id-ul iPay nu s-a putut salva: ${error.message}`, details: { orderId, ipayOrderId: result.orderId }, severity: "critical" });
      return NextResponse.json({ error: "Nu am putut pregati plata. Reincearca peste cateva momente." }, { status: 503 });
    }
  }

  return NextResponse.json({ redirectUrl: result.formUrl });
}
