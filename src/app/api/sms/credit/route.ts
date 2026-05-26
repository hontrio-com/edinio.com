import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCredit } from "@/lib/smso";
import type { SmsoConfig } from "@/lib/smso";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const businessId = req.nextUrl.searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId lipsa" }, { status: 400 });

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return NextResponse.json({ error: "Acces interzis" }, { status: 403 });

  const { data: settings } = await supabase
    .from("store_settings").select("smso_config").eq("business_id", businessId).single();
  const config = settings?.smso_config as SmsoConfig | null;
  if (!config?.api_key) return NextResponse.json({ error: "SMSO nu este configurat." }, { status: 400 });

  const result = await checkCredit(config.api_key);
  if ("error" in result) return NextResponse.json(result, { status: 400 });

  return NextResponse.json(result);
}
