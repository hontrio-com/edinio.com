import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getWootToken, getOrderAwb, type WootConfig } from "@/lib/woot";

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
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const [{ data: order }, { data: settings }] = await Promise.all([
    admin.from("orders").select("woot_order_id, order_number").eq("id", orderId).eq("business_id", businessId).single(),
    admin.from("store_settings").select("woot_config").eq("business_id", businessId).single(),
  ]);

  if (!order?.woot_order_id) return NextResponse.json({ error: "AWB negasit" }, { status: 404 });

  const config = settings?.woot_config as WootConfig | null;
  if (!config?.public_key || !config?.secret_key) {
    return NextResponse.json({ error: "Woot nu este configurat" }, { status: 400 });
  }

  try {
    const token = await getWootToken(config.public_key, config.secret_key);
    const { pdf } = await getOrderAwb(token, Number(order.woot_order_id), format);

    const pdfBuffer = Buffer.from(pdf, "base64");
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="AWB-${order.order_number}.pdf"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
