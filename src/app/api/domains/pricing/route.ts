import { NextResponse } from "next/server";
import { resellerCall } from "@/lib/reseller";
import { getCachedUser } from "@/lib/supabase/cached-queries";

export async function GET() {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await resellerCall("/tlds/pricing", "GET");
  return NextResponse.json(data);
}
