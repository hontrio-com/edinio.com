import { NextResponse } from "next/server";
import { fetchCounties } from "@/lib/woot";
import { logError } from "@/lib/error-logger";

export async function GET() {
  try {
    const counties = await fetchCounties();
    return NextResponse.json(counties);
  } catch (e) {
    await logError({ action: "woot.counties", message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json([], { status: 500 });
  }
}
