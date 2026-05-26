import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSmartbillConfigured, getSmartbillAuthHeader } from "@/lib/smartbill";

// Temporary debug endpoint — remove after Smartbill integration is confirmed working
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configured = isSmartbillConfigured();
  const envCheck = {
    SMARTBILL_EMAIL: !!process.env.SMARTBILL_EMAIL,
    SMARTBILL_TOKEN: !!process.env.SMARTBILL_TOKEN,
    SMARTBILL_CIF: !!process.env.SMARTBILL_CIF,
    SMARTBILL_SERIES: !!process.env.SMARTBILL_SERIES,
    isConfigured: configured,
  };

  if (!configured) {
    return NextResponse.json({ envCheck, error: "Smartbill not configured" });
  }

  // Test credentials by calling GET /series
  try {
    const cif = encodeURIComponent(process.env.SMARTBILL_CIF!);
    const res = await fetch(
      `https://ws.smartbill.ro/SBORO/api/series?cif=${cif}&type=f`,
      {
        headers: {
          Authorization: getSmartbillAuthHeader(),
          Accept: "application/json",
        },
      }
    );
    const body = await res.text();
    return NextResponse.json({
      envCheck,
      smartbillStatus: res.status,
      smartbillResponse: body,
    });
  } catch (err) {
    return NextResponse.json({
      envCheck,
      error: String(err),
    });
  }
}
