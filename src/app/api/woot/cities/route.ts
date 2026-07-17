import { NextRequest, NextResponse } from "next/server";
import { fetchCities } from "@/lib/woot";
import { logError } from "@/lib/error-logger";

export async function GET(request: NextRequest) {
  const county_id = Number(request.nextUrl.searchParams.get("county_id"));
  if (!county_id) return NextResponse.json([], { status: 400 });

  try {
    const cities = await fetchCities(county_id);
    return NextResponse.json(cities);
  } catch (e) {
    await logError({ action: "woot.cities", message: e instanceof Error ? e.message : String(e), details: { county_id } });
    return NextResponse.json([], { status: 500 });
  }
}
