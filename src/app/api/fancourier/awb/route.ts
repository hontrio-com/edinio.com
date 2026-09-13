import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { configPentruAwbEmis, getFanCourierAwbLabel, type FanCourierConfig } from "@/lib/fancourier";
import { poartaEtichetei } from "@/lib/orders/poarta-eticheta";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const businessId = searchParams.get("businessId");

  if (!orderId || !businessId) {
    return NextResponse.json({ error: "Parametri lipsa" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return NextResponse.json({ error: "Acces interzis" }, { status: 403 });

  /*
   * ⚠ SI STAREA CONTULUI, dupa dovedirea proprietatii.
   *
   * Aici s-a nascut regula, si a stat o vreme DOAR aici, din opt rute de eticheta.
   * Acum e in `poarta-eticheta.ts`, chemata la fel de toate opt: motivul, faptele si
   * contra-argumentul sunt scrise acolo, o singura data.
   */
  const oprit = await poartaEtichetei(businessId);
  if (oprit) return oprit;

  // Configul se citeste cu service role: vederea public.store_settings nu mai
  // decripteaza pentru `authenticated`, iar cu parola selfAWB `enc.v1.…` FAN nu
  // ar mai da eticheta. Service role OCOLESTE RLS — proprietatea magazinului e
  // verificata chiar deasupra.
  const admin = createAdminClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    admin.from("store_settings").select("fan_courier_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  const config = settings?.fan_courier_config as FanCourierConfig | null;
  if (!config?.enabled) return NextResponse.json({ error: "FAN Courier nu este configurat" }, { status: 400 });

  const orderData = order as typeof order & {
    fan_courier_awb_number?: string | null;
    fan_courier_awb_client_id?: number | null;
  };
  if (!orderData?.fan_courier_awb_number) return NextResponse.json({ error: "AWB negasit" }, { status: 404 });

  try {
    // Pe sucursala CU CARE S-A EMIS: dupa o schimbare de sucursala, contul de
    // acum nu mai recunoaste AWB-urile vechi si eticheta nu se mai putea scoate.
    const pdfBuffer = await getFanCourierAwbLabel(
      configPentruAwbEmis(config, orderData.fan_courier_awb_client_id),
      orderData.fan_courier_awb_number,
    );
    const filename = `awb-fancourier-${orderData.fan_courier_awb_number}.pdf`;

    return new NextResponse(pdfBuffer.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        /* ⚠ Eticheta poarta numele, adresa si telefonul CUMPARATORULUI. Fara
           antetul asta, un intermediar sau CDN-ul ar putea sa o tina. Cele patru
           rute surori (GLS, eColet, Posta, Packeta) il pun deja, cu aceeasi nota. */
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
