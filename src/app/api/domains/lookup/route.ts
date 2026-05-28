import { NextRequest, NextResponse } from "next/server";
import { resellerCall } from "@/lib/reseller";
import { getCachedUser } from "@/lib/supabase/cached-queries";

export async function POST(req: NextRequest) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { searchTerm?: string };
  const searchTerm = body.searchTerm?.trim().toLowerCase();

  if (!searchTerm || searchTerm.length < 2) {
    return NextResponse.json({ error: "searchTerm prea scurt" }, { status: 400 });
  }

  let data: Record<string, unknown>;
  try {
    data = await resellerCall("/domains/lookup", "POST", {
      searchTerm,
      tldsToInclude: [".ro", ".com", ".net", ".org"],
      premiumEnabled: false,
    });
  } catch (err) {
    console.error("[domains/lookup] resellerCall error:", err);
    return NextResponse.json({ error: "Reseller API error", details: String(err) }, { status: 502 });
  }

  console.log("[domains/lookup] response:", JSON.stringify(data).slice(0, 500));
  return NextResponse.json(data);
}
