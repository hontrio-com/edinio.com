import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getCOToken, getCOOrderAwb, type COConfig } from "@/lib/colete";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const orderId = searchParams.get("orderId");
  const businessId = searchParams.get("businessId");
  const format = (searchParams.get("format") ?? "A4") as "A4" | "A6";

  if (!orderId || !businessId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [{ data: order }, { data: settings }] = await Promise.all([
    admin.from("orders").select("colete_order_id, colete_awb_number, order_number").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("colete_config").eq("business_id", businessId).single(),
  ]);

  if (!order?.colete_order_id) return NextResponse.json({ error: "AWB negasit" }, { status: 404 });

  const config = settings?.colete_config as COConfig | null;
  if (!config?.client_id || !config?.client_secret) {
    return NextResponse.json({ error: "Colete Online nu este configurat" }, { status: 400 });
  }

  try {
    const token = await getCOToken(config.client_id, config.client_secret);
    const pdfBuffer = await getCOOrderAwb(token, config.sandbox ?? false, order.colete_order_id, format);

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="AWB-${order.order_number}.pdf"`,
        "Content-Length": String(pdfBuffer.byteLength),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
