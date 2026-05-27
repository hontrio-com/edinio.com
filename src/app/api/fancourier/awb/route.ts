import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFanCourierAwbLabel, type FanCourierConfig } from "@/lib/fancourier";

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

  const [{ data: settings }, { data: order }] = await Promise.all([
    supabase.from("store_settings").select("fan_courier_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  const config = settings?.fan_courier_config as FanCourierConfig | null;
  if (!config?.enabled) return NextResponse.json({ error: "FAN Courier nu este configurat" }, { status: 400 });

  const orderData = order as typeof order & { fan_courier_awb_number?: string | null };
  if (!orderData?.fan_courier_awb_number) return NextResponse.json({ error: "AWB negasit" }, { status: 404 });

  try {
    const pdfBuffer = await getFanCourierAwbLabel(config, orderData.fan_courier_awb_number);
    const filename = `awb-fancourier-${orderData.fan_courier_awb_number}.pdf`;

    return new NextResponse(pdfBuffer.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
