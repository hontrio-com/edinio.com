import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDpdAwbPdf, type DpdConfig } from "@/lib/dpd";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const businessId = searchParams.get("businessId");
  const format = searchParams.get("format") === "A4" ? "A4" : "A6";

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
    supabase.from("store_settings").select("dpd_config").eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  const config = settings?.dpd_config as DpdConfig | null;
  if (!config?.enabled) return NextResponse.json({ error: "DPD nu este configurat" }, { status: 400 });

  const orderData = order as typeof order & { dpd_awb_number?: string | null };
  if (!orderData?.dpd_awb_number) return NextResponse.json({ error: "AWB negasit" }, { status: 404 });

  try {
    const pdfBuffer = await getDpdAwbPdf(config, orderData.dpd_awb_number, format as "A4" | "A6");
    const filename = format === "A4"
      ? `awb-dpd-${orderData.dpd_awb_number}-a4.pdf`
      : `awb-dpd-${orderData.dpd_awb_number}-eticheta.pdf`;

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
